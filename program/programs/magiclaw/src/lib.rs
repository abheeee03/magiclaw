pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod pricing;
pub mod state;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW");

#[ephemeral]
#[program]
pub mod magiclaw {
    use super::*;

    // ---- Group A: admin setup (Solana L1) ----

    #[allow(clippy::too_many_arguments)]
    pub fn initialize_machine(
        ctx: Context<InitializeMachine>,
        machine_id: u64,
        play_fee_usdc: u64,
        grip_bps: [u16; 4],
        buyback_bps: [u16; 4],
        bullseye_bonus_bps: u16,
        capture_radius: u16,
        bullseye_radius: u16,
        play_duration_secs: i64,
    ) -> Result<()> {
        crate::instructions::admin::handle_initialize_machine(
            ctx,
            machine_id,
            play_fee_usdc,
            grip_bps,
            buyback_bps,
            bullseye_bonus_bps,
            capture_radius,
            bullseye_radius,
            play_duration_secs,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn stock_prize_slot(
        ctx: Context<StockPrizeSlot>,
        slot_id: u8,
        tier: u8,
        x: u16,
        z: u16,
        prize_amount: u64,
        price_feed: Pubkey,
        fallback_buyback_usdc: u64,
    ) -> Result<()> {
        crate::instructions::admin::handle_stock_prize_slot(
            ctx,
            slot_id,
            tier,
            x,
            z,
            prize_amount,
            price_feed,
            fallback_buyback_usdc,
        )
    }

    pub fn delegate_machine(ctx: Context<DelegateMachine>, machine_id: u64) -> Result<()> {
        crate::instructions::admin::handle_delegate_machine(ctx, machine_id)?;
        Ok(())
    }

    pub fn fund_usdc_liquidity(
        ctx: Context<FundUsdcLiquidity>,
        amount_usdc: u64,
    ) -> Result<()> {
        crate::instructions::admin::handle_fund_usdc_liquidity(ctx, amount_usdc)
    }

    // ---- Group B: player onboarding & delegation (Solana L1) ----

    pub fn init_and_deposit_session(
        ctx: Context<InitAndDepositSession>,
        deposit_usdc: u64,
        session_key: Pubkey,
        session_duration_secs: i64,
    ) -> Result<()> {
        crate::instructions::session::handle_init_and_deposit_session(
            ctx,
            deposit_usdc,
            session_key,
            session_duration_secs,
        )
    }

    pub fn delegate_session(ctx: Context<DelegateSession>) -> Result<()> {
        crate::instructions::session::handle_delegate_session(ctx)?;
        Ok(())
    }

    // ---- Group C: real-time gameplay (MagicBlock ER) ----

    pub fn start_play(ctx: Context<StartPlay>) -> Result<()> {
        crate::instructions::gameplay::handle_start_play(ctx)
    }

    pub fn steer_claw(ctx: Context<SteerClaw>, dx: i16, dz: i16) -> Result<()> {
        crate::instructions::gameplay::handle_steer_claw(ctx, dx, dz)
    }

    pub fn drop_claw(ctx: Context<DropClaw>, client_seed: u8) -> Result<()> {
        crate::instructions::gameplay::handle_drop_claw(ctx, client_seed)
    }

    /// VRF callback. Only the scoped VRF program identity can sign this.
    pub fn consume_vrf_grip(
        ctx: Context<ConsumeVrfGrip>,
        randomness: [u8; 32],
        request_nonce: u64,
    ) -> Result<()> {
        crate::instructions::gameplay::handle_consume_vrf_grip(
            ctx,
            randomness,
            request_nonce,
        )
    }

    pub fn cancel_stuck_vrf(ctx: Context<CancelStuckVrf>) -> Result<()> {
        crate::instructions::gameplay::handle_cancel_stuck_vrf(ctx)
    }

    // ---- Group D: settlement (ER + Magic Actions -> L1) ----

    pub fn sell_back_prize(ctx: Context<SellBackPrize>) -> Result<()> {
        crate::instructions::settlement::handle_sell_back_prize(ctx)
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        crate::instructions::settlement::handle_claim_prize(ctx)
    }

    pub fn request_withdraw_and_undelegate(
        ctx: Context<RequestWithdrawAndUndelegate>,
        amount_usdc: u64,
    ) -> Result<()> {
        crate::instructions::settlement::handle_request_withdraw_and_undelegate(
            ctx,
            amount_usdc,
        )
    }

    /// Permissionless L1 settlement for a committed claim intent.
    pub fn execute_l1_prize_claim(ctx: Context<ExecuteL1PrizeClaim>) -> Result<()> {
        crate::instructions::l1::handle_execute_l1_prize_claim(ctx)
    }

    /// Permissionless L1 settlement for a committed withdrawal intent.
    pub fn execute_l1_usdc_withdraw(ctx: Context<ExecuteL1UsdcWithdraw>) -> Result<()> {
        crate::instructions::l1::handle_execute_l1_usdc_withdraw(ctx)
    }
}
