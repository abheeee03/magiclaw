use anchor_lang::prelude::*;

use crate::error::ErrorCode;
use crate::state::{MachineConfig, PlayerLedger, PlayerSession};

/// Accept either the main wallet or a non-expired session key.
pub fn verify_player_or_session(
    signer: &Signer<'_>,
    session: &PlayerSession,
    now: i64,
) -> Result<()> {
    if signer.key() == session.owner {
        return Ok(());
    }
    if session.session_key != Pubkey::default() && signer.key() == session.session_key {
        require!(now <= session.session_expiry, ErrorCode::SessionKeyExpired);
        return Ok(());
    }
    err!(ErrorCode::Unauthorized)
}

/// Only the main wallet may move money out of the ER session.
pub fn verify_owner(signer: &Signer<'_>, session: &PlayerSession) -> Result<()> {
    require_keys_eq!(signer.key(), session.owner, ErrorCode::Unauthorized);
    Ok(())
}

fn is_program_owned(account: &AccountInfo) -> bool {
    account.owner == &crate::ID || account.owner == &ephemeral_rollups_sdk::id()
}

/// Deserialize an account that may be delegated on the base layer.
///
/// Delegation keeps the account data and its discriminator intact but reassigns the
/// owner to the delegation program, so `Account<T>` would reject the L1 settlement
/// path. We accept both owners and run the discriminator check ourselves.
pub fn load_machine(account: &AccountInfo) -> Result<MachineConfig> {
    require!(is_program_owned(account), ErrorCode::Unauthorized);
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data[..];
    MachineConfig::try_deserialize(&mut slice)
}

pub fn load_session(account: &AccountInfo) -> Result<PlayerSession> {
    require!(is_program_owned(account), ErrorCode::Unauthorized);
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data[..];
    PlayerSession::try_deserialize(&mut slice)
}

pub fn load_ledger(account: &AccountInfo) -> Result<PlayerLedger> {
    require!(is_program_owned(account), ErrorCode::Unauthorized);
    let data = account.try_borrow_data()?;
    let mut slice: &[u8] = &data[..];
    PlayerLedger::try_deserialize(&mut slice)
}

pub fn machine_pda(machine_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[crate::constants::MACHINE_SEED, &machine_id.to_le_bytes()],
        &crate::ID,
    )
}

pub fn session_pda(machine: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            crate::constants::SESSION_SEED,
            machine.as_ref(),
            owner.as_ref(),
        ],
        &crate::ID,
    )
}

pub fn ledger_pda(machine: &Pubkey, owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[crate::constants::LEDGER_SEED, machine.as_ref(), owner.as_ref()],
        &crate::ID,
    )
}

pub fn vault_authority_pda(machine: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[crate::constants::VAULT_AUTHORITY_SEED, machine.as_ref()],
        &crate::ID,
    )
}
