use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use ephemeral_rollups_sdk::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::vrf::consts::program_identity_pubkey;
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_randomness_ix_const, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::events::{ClawDropped, ClawMoved, GripResolved, PlayStarted, VrfRequestCancelled};
use crate::instructions::common::verify_player_or_session;
use crate::state::{
    LastOutcome, MachineConfig, PlayerSession, SessionState,
};

/// Scoped VRF requester identity for this program (SDK 0.18+).
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

/// Scoped VRF callback identity PDA for this program.
pub const SCOPED_VRF_IDENTITY: Pubkey = Pubkey::new_from_array(
    ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const(&crate::ID).0,
);

#[derive(Accounts)]
pub struct StartPlay<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(
        mut,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), player_session.owner.as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,
}

pub fn handle_start_play(ctx: Context<StartPlay>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    verify_player_or_session(
        &ctx.accounts.signer,
        &ctx.accounts.player_session,
        now,
    )?;

    require!(
        ctx.accounts.player_session.state == SessionState::Idle,
        ErrorCode::InvalidState
    );

    let fee = ctx.accounts.machine_config.play_fee_usdc;
    require!(
        ctx.accounts.player_session.usdc_balance >= fee,
        ErrorCode::InsufficientBalance
    );

    let session = &mut ctx.accounts.player_session;
    session.usdc_balance = session
        .usdc_balance
        .checked_sub(fee)
        .ok_or(ErrorCode::MathOverflow)?;
    session.claw_x = SPAWN_X;
    session.claw_z = SPAWN_Z;
    session.state = SessionState::Steering;
    session.play_expires_at = now
        .checked_add(ctx.accounts.machine_config.play_duration_secs)
        .ok_or(ErrorCode::MathOverflow)?;
    session.last_outcome = LastOutcome::None;

    emit!(PlayStarted {
        owner: session.owner,
        machine: session.machine,
        play_expires_at: session.play_expires_at,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SteerClaw<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [SESSION_SEED, player_session.machine.as_ref(), player_session.owner.as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,
}

pub fn handle_steer_claw(ctx: Context<SteerClaw>, dx: i16, dz: i16) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    verify_player_or_session(
        &ctx.accounts.signer,
        &ctx.accounts.player_session,
        now,
    )?;

    require!(
        ctx.accounts.player_session.state == SessionState::Steering,
        ErrorCode::InvalidState
    );
    require!(
        now <= ctx.accounts.player_session.play_expires_at,
        ErrorCode::PlayWindowExpired
    );

    let dx = dx.clamp(-MAX_STEP, MAX_STEP) as i32;
    let dz = dz.clamp(-MAX_STEP, MAX_STEP) as i32;

    let session = &mut ctx.accounts.player_session;
    session.claw_x = (session.claw_x as i32 + dx).clamp(0, PLAYFIELD_MAX as i32) as u16;
    session.claw_z = (session.claw_z as i32 + dz).clamp(0, PLAYFIELD_MAX as i32) as u16;

    emit!(ClawMoved {
        owner: session.owner,
        claw_x: session.claw_x,
        claw_z: session.claw_z,
    });

    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct DropClaw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(
        mut,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), player_session.owner.as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,

    /// CHECK: Must be a MagicBlock VRF queue (base or ephemeral, mainnet/devnet/localnet).
    #[account(
        mut,
        constraint = oracle_queue.key() == DEFAULT_QUEUE
            || oracle_queue.key() == DEFAULT_EPHEMERAL_QUEUE
            || oracle_queue.key() == DEFAULT_TEST_QUEUE
            || oracle_queue.key() == DEFAULT_EPHEMERAL_TEST_QUEUE
            @ ErrorCode::InvalidConfig
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

pub fn handle_drop_claw(ctx: Context<DropClaw>, client_seed: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    verify_player_or_session(
        &ctx.accounts.signer,
        &ctx.accounts.player_session,
        now,
    )?;

    require!(
        ctx.accounts.player_session.state == SessionState::Steering,
        ErrorCode::InvalidState
    );

    let machine = &mut ctx.accounts.machine_config;
    let session = &mut ctx.accounts.player_session;

    machine.total_plays = machine
        .total_plays
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    session.plays_count = session
        .plays_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    let claw_x = session.claw_x;
    let claw_z = session.claw_z;
    let capture_sq = u32::from(machine.capture_radius).pow(2);
    let bullseye_sq = u32::from(machine.bullseye_radius).pow(2);

    let mut best: Option<(usize, u32)> = None;
    for (idx, slot) in machine.slots.iter().enumerate() {
        if !slot.in_stock || slot.reserved {
            continue;
        }
        let dx = i32::from(claw_x) - i32::from(slot.x);
        let dz = i32::from(claw_z) - i32::from(slot.z);
        let dist_sq = (dx * dx + dz * dz) as u32;
        if dist_sq <= capture_sq && best.map(|(_, d)| dist_sq < d).unwrap_or(true) {
            best = Some((idx, dist_sq));
        }
    }

    let Some((idx, dist_sq)) = best else {
        session.state = SessionState::Idle;
        session.last_outcome = LastOutcome::Miss;
        emit!(ClawDropped {
            owner: session.owner,
            claw_x,
            claw_z,
            hit_slot: None,
            is_bullseye: false,
        });
        return Ok(());
    };

    let is_bullseye = dist_sq <= bullseye_sq;
    machine.slots[idx].reserved = true;
    let slot_id = machine.slots[idx].slot_id;

    session.target_slot = idx as u8;
    session.is_bullseye = is_bullseye;
    session.state = SessionState::AwaitingVrf;
    session.vrf_request_nonce = session
        .vrf_request_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    let request_nonce = session.vrf_request_nonce;

    emit!(ClawDropped {
        owner: session.owner,
        claw_x,
        claw_z,
        hit_slot: Some(slot_id),
        is_bullseye,
    });

    let ix = create_request_randomness_ix_const(
        RequestRandomnessParams {
            payer: ctx.accounts.signer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::ConsumeVrfGrip::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: ctx.accounts.machine_config.key(),
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: ctx.accounts.player_session.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            callback_args: Some(request_nonce.to_le_bytes().to_vec()),
        },
        PROGRAM_IDENTITY,
    );

    ctx.accounts.invoke_signed_vrf(
        &ctx.accounts.signer.to_account_info(),
        &ix,
    )?;

    Ok(())
}

#[vrf_callback]
#[derive(Accounts)]
pub struct ConsumeVrfGrip<'info> {
    #[account(address = SCOPED_VRF_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(
        mut,
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(
        mut,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), player_session.owner.as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GripResolution {
    pub won: bool,
    pub roll: u16,
    pub effective_bps: u16,
}

/// Deterministic portion of the VRF callback: pure and unit-testable.
pub fn resolve_grip(
    machine: &MachineConfig,
    session: &PlayerSession,
    randomness: &[u8; 32],
) -> Result<GripResolution> {
    let slot = machine
        .slots
        .get(session.target_slot as usize)
        .ok_or(ErrorCode::InvalidSlot)?;
    require!(
        (slot.tier as usize) < machine.grip_bps.len(),
        ErrorCode::InvalidSlot
    );

    let roll = roll_from_randomness(randomness);
    let base_bps = machine.grip_bps[slot.tier as usize];
    let skill_bonus = if session.is_bullseye {
        machine.bullseye_bonus_bps
    } else {
        0
    };
    let effective_bps = base_bps
        .saturating_add(skill_bonus)
        .min(MAX_EFFECTIVE_GRIP_BPS);

    Ok(GripResolution {
        won: roll < effective_bps,
        roll,
        effective_bps,
    })
}

/// Map a 32-byte VRF output to `0..9_999`.
pub fn roll_from_randomness(randomness: &[u8; 32]) -> u16 {
    let word = u32::from_le_bytes([
        randomness[0],
        randomness[1],
        randomness[2],
        randomness[3],
    ]);
    (word % u32::from(BPS_DENOM)) as u16
}

pub fn handle_consume_vrf_grip(
    ctx: Context<ConsumeVrfGrip>,
    randomness: [u8; 32],
    request_nonce: u64,
) -> Result<()> {
    // Redundant with the `#[vrf_callback]` address constraint, but maps a forged
    // callback to the documented program error instead of a generic constraint error.
    require_keys_eq!(
        ctx.accounts.vrf_program_identity.key(),
        SCOPED_VRF_IDENTITY,
        ErrorCode::UnauthorizedVrfCallback
    );

    let machine = &mut ctx.accounts.machine_config;
    let session = &mut ctx.accounts.player_session;

    require!(
        session.state == SessionState::AwaitingVrf,
        ErrorCode::InvalidState
    );
    // Reject a late fulfillment for a superseded request.
    require_eq!(
        request_nonce,
        session.vrf_request_nonce,
        ErrorCode::InvalidState
    );

    let idx = session.target_slot as usize;
    require!(idx < MAX_SLOTS, ErrorCode::InvalidSlot);

    let resolution = resolve_grip(machine, session, &randomness)?;

    session.last_vrf_roll = resolution.roll;
    machine.slots[idx].reserved = false;

    if resolution.won {
        machine.slots[idx].in_stock = false;
        machine.total_wins = machine
            .total_wins
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        session.wins_count = session
            .wins_count
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        session.state = SessionState::WonPendingChoice;
        session.last_outcome = LastOutcome::Won;
    } else {
        session.state = SessionState::Idle;
        session.last_outcome = LastOutcome::Slipped;
    }

    emit!(GripResolved {
        owner: session.owner,
        slot_id: machine.slots[idx].slot_id,
        won: resolution.won,
        roll: resolution.roll,
        effective_bps: resolution.effective_bps,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CancelStuckVrf<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(
        mut,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), player_session.owner.as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,
}

/// Recovery escape hatch: release a VRF reservation that never resolved.
pub fn handle_cancel_stuck_vrf(ctx: Context<CancelStuckVrf>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let is_admin = ctx.accounts.signer.key() == ctx.accounts.machine_config.admin;
    if !is_admin {
        verify_player_or_session(
            &ctx.accounts.signer,
            &ctx.accounts.player_session,
            now,
        )?;
    }

    require!(
        ctx.accounts.player_session.state == SessionState::AwaitingVrf,
        ErrorCode::InvalidState
    );
    let release_at = ctx
        .accounts
        .player_session
        .play_expires_at
        .saturating_add(STUCK_VRF_GRACE_SECS);
    require!(now > release_at, ErrorCode::VrfStillLive);

    let idx = ctx.accounts.player_session.target_slot as usize;
    require!(idx < MAX_SLOTS, ErrorCode::InvalidSlot);

    let machine = &mut ctx.accounts.machine_config;
    let session = &mut ctx.accounts.player_session;

    machine.slots[idx].reserved = false;
    let refund = machine.play_fee_usdc;
    session.usdc_balance = session
        .usdc_balance
        .checked_add(refund)
        .ok_or(ErrorCode::MathOverflow)?;
    session.state = SessionState::Idle;
    session.last_outcome = LastOutcome::None;

    emit!(VrfRequestCancelled {
        owner: session.owner,
        slot_id: idx as u8,
        refund_usdc: refund,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::PrizeSlot;

    fn test_machine() -> MachineConfig {
        MachineConfig::new(
            1,
            Pubkey::default(),
            Pubkey::default(),
            1_000_000,
            DEFAULT_GRIP_BPS,
            DEFAULT_BUYBACK_BPS,
            DEFAULT_BULLSEYE_BONUS_BPS,
            CAPTURE_RADIUS,
            BULLSEYE_RADIUS,
            PLAY_DURATION_SECS,
            0,
        )
    }

    fn randomness_with_roll(roll: u32) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        bytes[..4].copy_from_slice(&roll.to_le_bytes());
        bytes
    }

    #[test]
    fn roll_mapping_is_mod_ten_thousand() {
        assert_eq!(roll_from_randomness(&randomness_with_roll(0)), 0);
        assert_eq!(roll_from_randomness(&randomness_with_roll(9_999)), 9_999);
        assert_eq!(roll_from_randomness(&randomness_with_roll(10_000)), 0);
    }

    #[test]
    fn bullseye_bonus_is_added_and_capped() {
        let mut machine = test_machine();
        machine.bullseye_bonus_bps = 500;
        machine.slots[0] = PrizeSlot {
            tier: 0,
            in_stock: true,
            ..PrizeSlot::default()
        };
        let mut session = PlayerSession::empty(Pubkey::default(), Pubkey::default(), 0);
        session.target_slot = 0;
        session.is_bullseye = true;

        // Common base 6500 + 500 = 7000. Roll 6999 wins, 7000 slips.
        assert!(resolve_grip(&machine, &session, &randomness_with_roll(6_999)).unwrap().won);
        assert!(!resolve_grip(&machine, &session, &randomness_with_roll(7_000)).unwrap().won);

        machine.grip_bps[0] = 9_900;
        let resolution = resolve_grip(&machine, &session, &randomness_with_roll(9_899)).unwrap();
        assert_eq!(resolution.effective_bps, 9_900);
        assert!(resolution.won);
    }

    #[test]
    fn non_bullseye_uses_base_odds() {
        let mut machine = test_machine();
        machine.slots[0] = PrizeSlot {
            tier: 3,
            in_stock: true,
            ..PrizeSlot::default()
        };
        let mut session = PlayerSession::empty(Pubkey::default(), Pubkey::default(), 0);
        session.target_slot = 0;
        session.is_bullseye = false;

        // Grail base 400 bps.
        assert!(resolve_grip(&machine, &session, &randomness_with_roll(399)).unwrap().won);
        assert!(!resolve_grip(&machine, &session, &randomness_with_roll(400)).unwrap().won);
    }
}
