use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{MachineConfig, PrizeSlot};

/// Minimal mirror of Pyth's `PriceUpdateV2` / `PriceUpdateV3` layout.
///
/// We deliberately decode a private struct instead of depending on the Pyth receiver
/// SDK so the program does not pull a second Anchor/Solana major version. The field
/// order matches the onchain account exactly; the leading 8-byte Anchor discriminator
/// is skipped by [`read_price`].
#[derive(AnchorDeserialize)]
struct PriceUpdateV2Lite {
    #[allow(dead_code)]
    write_authority: Pubkey,
    #[allow(dead_code)]
    verification_level: u8,
    price_message: PriceFeedMessageLite,
    posted_slot: u64,
}

#[derive(AnchorDeserialize)]
struct PriceFeedMessageLite {
    feed_id: [u8; 32],
    price: i64,
    #[allow(dead_code)]
    conf: u64,
    exponent: i32,
    publish_time: i64,
    #[allow(dead_code)]
    prev_publish_time: i64,
    #[allow(dead_code)]
    ema_price: i64,
    #[allow(dead_code)]
    ema_conf: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PriceSnapshot {
    pub price: i64,
    pub exponent: i32,
    pub publish_time: i64,
}

/// Decode a price account, returning `None` when the account is not a usable oracle
/// update (wrong owner, unreadable data, zero posted slot, or a self-consistent feed id
/// mismatch). Callers fall back to the slot's fixed floor value in that case.
pub fn read_price(account: &AccountInfo) -> Option<PriceSnapshot> {
    if account.owner != &PRICE_ORACLE_PROGRAM_ID {
        return None;
    }

    let data = account.try_borrow_data().ok()?;
    if data.len() <= 8 {
        return None;
    }

    let update = PriceUpdateV2Lite::deserialize(&mut &data[8..]).ok()?;

    // The republisher stores the feed account's own address as the feed id.
    if update.price_message.feed_id != account.key().to_bytes() {
        return None;
    }
    // `posted_slot == 0` is the zero-value placeholder written at initialization.
    if update.posted_slot == 0 {
        return None;
    }
    if update.price_message.price <= 0 {
        return None;
    }

    Some(PriceSnapshot {
        price: update.price_message.price,
        exponent: update.price_message.exponent,
        publish_time: update.price_message.publish_time,
    })
}

/// Compute the USDC sell-back for a won slot (Section 7 of the specification).
///
/// `gross_usdc = prize_amount * price * 10^6 / 10^(prize_decimals + |exponent|)`,
/// then `buyback = gross_usdc * buyback_bps / 10_000`, floored at 1 USDC base unit
/// whenever the gross value is non-zero.
pub fn compute_buyback(
    machine: &MachineConfig,
    slot: &PrizeSlot,
    price_feed: Option<&AccountInfo>,
    now: i64,
) -> Result<u64> {
    let Some(feed_account) = price_feed else {
        return Ok(slot.fallback_buyback_usdc);
    };

    if slot.price_feed == Pubkey::default() {
        return Ok(slot.fallback_buyback_usdc);
    }

    require_keys_eq!(
        feed_account.key(),
        slot.price_feed,
        ErrorCode::InvalidPriceFeed
    );

    let Some(oracle) = read_price(feed_account) else {
        // Misconfigured or undecodable feed: fail safe to the fixed floor rather
        // than bricking sell-backs for the whole machine.
        return Ok(slot.fallback_buyback_usdc);
    };

    // Stale or future-dated updates are not trustworthy.
    if oracle.publish_time <= 0 || now.saturating_sub(oracle.publish_time) > MAX_PRICE_AGE_SECS {
        return Ok(slot.fallback_buyback_usdc);
    }

    let tier_bps = *machine
        .buyback_bps
        .get(slot.tier as usize)
        .ok_or(ErrorCode::InvalidSlot)?;

    buyback_from_oracle(
        slot.prize_amount,
        slot.prize_decimals,
        oracle.price,
        oracle.exponent,
        tier_bps,
    )
}

/// Pure oracle pricing math, exposed for unit tests.
pub fn buyback_from_oracle(
    prize_amount: u64,
    prize_decimals: u8,
    price: i64,
    exponent: i32,
    tier_bps: u16,
) -> Result<u64> {
    if price <= 0 {
        return Ok(0);
    }

    let exponent = exponent.unsigned_abs();
    if exponent > MAX_PRICE_EXPONENT {
        return Err(ErrorCode::InvalidConfig.into());
    }

    let price = u128::try_from(price).map_err(|_| ErrorCode::InvalidConfig)?;
    let amount = u128::from(prize_amount);
    let six = 10u128.pow(USDC_DECIMALS as u32);

    let numerator = amount
        .checked_mul(price)
        .and_then(|v| v.checked_mul(six))
        .ok_or(ErrorCode::MathOverflow)?;

    let denom_exp = u32::from(prize_decimals)
        .checked_add(exponent)
        .ok_or(ErrorCode::MathOverflow)?;
    let denominator = 10u128
        .checked_pow(denom_exp)
        .ok_or(ErrorCode::MathOverflow)?;

    let gross_usdc = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::MathOverflow)?;

    let mut buyback = gross_usdc
        .checked_mul(u128::from(tier_bps))
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(u128::from(BPS_DENOM))
        .ok_or(ErrorCode::MathOverflow)?;

    if gross_usdc > 0 && buyback == 0 {
        buyback = 1;
    }

    u64::try_from(buyback).map_err(|_| ErrorCode::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oracle_math_uses_pyth_convention() {
        // 1.0 token (6 decimals) at $1.00 with the correct -6 exponent -> $1.00 gross.
        assert_eq!(
            buyback_from_oracle(1_000_000, 6, 1_000_000, -6, 9_500).unwrap(),
            950_000
        );
        // Same value expressed with an +8 exponent (the republisher's stored sign).
        assert_eq!(
            buyback_from_oracle(1_000_000, 6, 13_394_321, 8, 9_500).unwrap(),
            127_245
        );
    }

    #[test]
    fn oracle_math_floors_nonzero_gross_at_one_base_unit() {
        // gross = 1 contract-unit of USDC, 1 bps -> rounds to zero, floored to 1.
        assert_eq!(
            buyback_from_oracle(1, 6, 1, 0, 1).unwrap(),
            1
        );
    }

    #[test]
    fn oracle_math_rejects_out_of_range_exponent() {
        assert!(buyback_from_oracle(1, 0, 1, 40, 9_500).is_err());
    }

    #[test]
    fn floor_price_is_used_without_a_feed() {
        let machine = MachineConfig::new(
            1,
            Pubkey::default(),
            Pubkey::default(),
            1_000_000,
            DEFAULT_GRIP_BPS,
            [9_500; 4],
            DEFAULT_BULLSEYE_BONUS_BPS,
            CAPTURE_RADIUS,
            BULLSEYE_RADIUS,
            PLAY_DURATION_SECS,
            0,
        );
        let slot = PrizeSlot {
            tier: 3,
            fallback_buyback_usdc: 3_000,
            ..PrizeSlot::default()
        };
        assert_eq!(
            compute_buyback(&machine, &slot, None, 0).unwrap(),
            3_000
        );
    }
}
