use anchor_lang::prelude::*;

#[event]
pub struct PlayStarted {
    pub owner: Pubkey,
    pub machine: Pubkey,
    pub play_expires_at: i64,
}

#[event]
pub struct ClawMoved {
    pub owner: Pubkey,
    pub claw_x: u16,
    pub claw_z: u16,
}

#[event]
pub struct ClawDropped {
    pub owner: Pubkey,
    pub claw_x: u16,
    pub claw_z: u16,
    pub hit_slot: Option<u8>,
    pub is_bullseye: bool,
}

#[event]
pub struct GripResolved {
    pub owner: Pubkey,
    pub slot_id: u8,
    pub won: bool,
    pub roll: u16,
    pub effective_bps: u16,
}

#[event]
pub struct PrizeSoldBack {
    pub owner: Pubkey,
    pub slot_id: u8,
    pub buyback_usdc: u64,
}

#[event]
pub struct PrizeClaimRequested {
    pub owner: Pubkey,
    pub slot_id: u8,
    pub claim_nonce: u64,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PrizeClaimSettledL1 {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub claim_nonce: u64,
}

#[event]
pub struct UsdcWithdrawnL1 {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct VrfRequestCancelled {
    pub owner: Pubkey,
    pub slot_id: u8,
    pub refund_usdc: u64,
}

#[event]
pub struct MachineInitialized {
    pub machine: Pubkey,
    pub admin: Pubkey,
    pub play_fee_usdc: u64,
}

#[event]
pub struct PrizeSlotStocked {
    pub machine: Pubkey,
    pub slot_id: u8,
    pub tier: u8,
    pub prize_mint: Pubkey,
    pub prize_amount: u64,
}
