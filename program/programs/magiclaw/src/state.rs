use anchor_lang::prelude::*;

/// Lifecycle of a player's current round.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum SessionState {
    #[default]
    Idle,
    Steering,
    AwaitingVrf,
    WonPendingChoice,
}

/// Outcome of the most recently completed round.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum LastOutcome {
    #[default]
    None,
    Miss,
    Slipped,
    Won,
    SoldBack,
    Claimed,
}

/// A physical capsule inside the cabinet.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct PrizeSlot {
    /// 0..15
    pub slot_id: u8,
    /// 0 = Common, 1 = Rare, 2 = Epic, 3 = Grail
    pub tier: u8,
    /// 0..=1000
    pub x: u16,
    /// 0..=1000
    pub z: u16,
    /// SPL token / NFT mint held in the PrizeVault ATA.
    pub prize_mint: Pubkey,
    /// Base units transferred on claim.
    pub prize_amount: u64,
    /// Mint decimals, used to scale oracle prices.
    pub prize_decimals: u8,
    /// Oracle price account. `Pubkey::default()` means "use the fixed floor".
    pub price_feed: Pubkey,
    /// Floor sell-back value in USDC base units (6 decimals).
    pub fallback_buyback_usdc: u64,
    /// True while a capsule is physically available.
    pub in_stock: bool,
    /// True while a VRF grip roll is in flight for this slot.
    pub reserved: bool,
}

/// Public cabinet configuration and prize inventory.
///
/// Delegated to the ER after setup so gameplay can mutate odds counters and slot
/// inventory at ER speed. The layout is fixed (no realloc) so any external client
/// can deserialize the public odds directly onchain.
#[account]
#[derive(InitSpace, Debug)]
pub struct MachineConfig {
    pub machine_id: u64,
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    /// Play fee in USDC base units (6 decimals).
    pub play_fee_usdc: u64,
    /// Public grip odds by tier.
    pub grip_bps: [u16; 4],
    /// Sell-back percentage by tier.
    pub buyback_bps: [u16; 4],
    /// Dead-centre skill bonus, in bps.
    pub bullseye_bonus_bps: u16,
    pub capture_radius: u16,
    pub bullseye_radius: u16,
    pub play_duration_secs: i64,
    pub total_plays: u64,
    pub total_wins: u64,
    pub slots: [PrizeSlot; crate::constants::MAX_SLOTS],
    pub bump: u8,
}

/// A player's live ER session.
#[account]
#[derive(InitSpace, Debug)]
pub struct PlayerSession {
    pub machine: Pubkey,
    pub owner: Pubkey,
    /// Ephemeral key authorized for gasless ER play.
    pub session_key: Pubkey,
    /// Unix timestamp at which `session_key` stops working.
    pub session_expiry: i64,
    /// Spendable ER play balance, USDC base units.
    pub usdc_balance: u64,
    /// Monotonic total deposited through the L1 ledger.
    pub cumulative_deposited_usdc: u64,
    /// Monotonic withdrawal intents settled by the L1 ledger.
    pub cumulative_withdrawn_usdc: u64,
    pub claw_x: u16,
    pub claw_z: u16,
    pub state: SessionState,
    pub play_expires_at: i64,
    /// Active slot during `AwaitingVrf` / `WonPendingChoice`.
    pub target_slot: u8,
    /// Cached at drop time so the VRF callback can apply the skill bonus.
    pub is_bullseye: bool,
    /// Last roll in `0..9_999`, exposed for UI / proof transparency.
    pub last_vrf_roll: u16,
    pub last_outcome: LastOutcome,
    /// Incremented on every claim request; the L1 ledger consumes it once.
    pub claim_nonce: u64,
    pub pending_claim_mint: Pubkey,
    pub pending_claim_amount: u64,
    /// Monotonic id of the most recent VRF request. Forwarded as callback args so
    /// a late fulfillment for a superseded request cannot settle a newer round.
    pub vrf_request_nonce: u64,
    pub plays_count: u64,
    pub wins_count: u64,
    pub bump: u8,
}

/// Replay-proof settlement ledger. L1 only: never delegated.
#[account]
#[derive(InitSpace, Debug)]
pub struct PlayerLedger {
    pub machine: Pubkey,
    pub owner: Pubkey,
    pub total_deposited_usdc: u64,
    pub total_withdrawn_usdc: u64,
    pub last_claimed_nonce: u64,
    pub bump: u8,
}

impl MachineConfig {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        machine_id: u64,
        admin: Pubkey,
        usdc_mint: Pubkey,
        play_fee_usdc: u64,
        grip_bps: [u16; 4],
        buyback_bps: [u16; 4],
        bullseye_bonus_bps: u16,
        capture_radius: u16,
        bullseye_radius: u16,
        play_duration_secs: i64,
        bump: u8,
    ) -> Self {
        Self {
            machine_id,
            admin,
            usdc_mint,
            play_fee_usdc,
            grip_bps,
            buyback_bps,
            bullseye_bonus_bps,
            capture_radius,
            bullseye_radius,
            play_duration_secs,
            total_plays: 0,
            total_wins: 0,
            slots: [PrizeSlot::default(); crate::constants::MAX_SLOTS],
            bump,
        }
    }
}

impl PlayerSession {
    pub fn empty(machine: Pubkey, owner: Pubkey, bump: u8) -> Self {
        Self {
            machine,
            owner,
            session_key: Pubkey::default(),
            session_expiry: 0,
            usdc_balance: 0,
            cumulative_deposited_usdc: 0,
            cumulative_withdrawn_usdc: 0,
            claw_x: crate::constants::SPAWN_X,
            claw_z: crate::constants::SPAWN_Z,
            state: SessionState::Idle,
            play_expires_at: 0,
            target_slot: 0,
            is_bullseye: false,
            last_vrf_roll: 0,
            last_outcome: LastOutcome::None,
            claim_nonce: 0,
            pending_claim_mint: Pubkey::default(),
            pending_claim_amount: 0,
            vrf_request_nonce: 0,
            plays_count: 0,
            wins_count: 0,
            bump,
        }
    }
}

impl PlayerLedger {
    pub fn empty(machine: Pubkey, owner: Pubkey, bump: u8) -> Self {
        Self {
            machine,
            owner,
            total_deposited_usdc: 0,
            total_withdrawn_usdc: 0,
            last_claimed_nonce: 0,
            bump,
        }
    }
}
