use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;
use anchor_spl::token::{self, Token, Transfer};
use anchor_lang::solana_program::program_pack::Pack;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::events::{PrizeClaimSettledL1, UsdcWithdrawnL1};
use crate::instructions::common::{
    ledger_pda, load_session, session_pda, vault_authority_pda,
};
use crate::state::PlayerLedger;

/// L1 settlement target for `claim_prize`.
///
/// This is deliberately permissionless: the effect is fully determined by the
/// committed `PlayerSession` (`claim_nonce`, `pending_claim_*`) and replay-protected
/// by `PlayerLedger.last_claimed_nonce`, so the origin of the call does not matter.
/// It is scheduled as a Magic Action by `claim_prize` and may also be called
/// directly as a manual retry.
#[derive(Accounts)]
pub struct ExecuteL1PrizeClaim<'info> {
    /// CHECK: machine PDA (may still be delegated on L1).
    pub machine_config: UncheckedAccount<'info>,

    /// CHECK: committed ER session state (may still be delegated on L1).
    pub player_session: UncheckedAccount<'info>,

    #[account(mut)]
    pub player_ledger: Account<'info, PlayerLedger>,

    /// CHECK: vault authority PDA.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: prize vault ATA owned by the vault authority.
    #[account(mut)]
    pub prize_vault_ata: UncheckedAccount<'info>,

    /// CHECK: destination ATA owned by the player.
    #[account(mut)]
    pub owner_prize_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_execute_l1_prize_claim(
    ctx: Context<ExecuteL1PrizeClaim>,
) -> Result<()> {
    let session = load_session(&ctx.accounts.player_session.to_account_info())?;
    require_keys_eq!(
        session.machine,
        ctx.accounts.machine_config.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_session.key(),
        session_pda(&session.machine, &session.owner).0,
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_ledger.key(),
        ledger_pda(&session.machine, &session.owner).0,
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_ledger.owner,
        session.owner,
        ErrorCode::Unauthorized
    );

    require!(
        session.claim_nonce > ctx.accounts.player_ledger.last_claimed_nonce,
        ErrorCode::NothingToSettle
    );
    require!(
        session.pending_claim_amount > 0 && session.pending_claim_mint != Pubkey::default(),
        ErrorCode::NothingToSettle
    );

    let (vault_authority, vault_bump) = vault_authority_pda(&session.machine);
    require_keys_eq!(
        ctx.accounts.vault_authority.key(),
        vault_authority,
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        ctx.accounts.prize_vault_ata.key(),
        get_associated_token_address(&vault_authority, &session.pending_claim_mint),
        ErrorCode::InvalidVault
    );

    let prize_vault = read_token_account(&ctx.accounts.prize_vault_ata)?;
    let owner_ata = read_token_account(&ctx.accounts.owner_prize_ata)?;
    require_keys_eq!(
        prize_vault.mint,
        session.pending_claim_mint,
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        prize_vault.owner,
        vault_authority,
        ErrorCode::InvalidVault
    );
    require_keys_eq!(owner_ata.mint, session.pending_claim_mint, ErrorCode::InvalidVault);
    require_keys_eq!(owner_ata.owner, session.owner, ErrorCode::Unauthorized);

    let seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        session.machine.as_ref(),
        &[vault_bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.prize_vault_ata.to_account_info(),
                to: ctx.accounts.owner_prize_ata.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        session.pending_claim_amount,
    )?;

    let ledger = &mut ctx.accounts.player_ledger;
    ledger.machine = session.machine;
    ledger.last_claimed_nonce = session.claim_nonce;

    emit!(PrizeClaimSettledL1 {
        owner: session.owner,
        mint: session.pending_claim_mint,
        amount: session.pending_claim_amount,
        claim_nonce: session.claim_nonce,
    });

    Ok(())
}

/// L1 settlement target for `request_withdraw_and_undelegate`.
#[derive(Accounts)]
pub struct ExecuteL1UsdcWithdraw<'info> {
    /// CHECK: machine PDA (may still be delegated on L1).
    pub machine_config: UncheckedAccount<'info>,

    /// CHECK: committed ER session state.
    pub player_session: UncheckedAccount<'info>,

    #[account(mut)]
    pub player_ledger: Account<'info, PlayerLedger>,

    /// CHECK: vault authority PDA.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: USDC vault ATA owned by the vault authority.
    #[account(mut)]
    pub usdc_vault: UncheckedAccount<'info>,

    /// CHECK: destination ATA owned by the player.
    #[account(mut)]
    pub owner_usdc_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_execute_l1_usdc_withdraw(
    ctx: Context<ExecuteL1UsdcWithdraw>,
) -> Result<()> {
    let usdc_mint = load_machine_usdc_mint(&ctx.accounts.machine_config.to_account_info())?;
    let session = load_session(&ctx.accounts.player_session.to_account_info())?;
    require_keys_eq!(
        session.machine,
        ctx.accounts.machine_config.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_session.key(),
        session_pda(&session.machine, &session.owner).0,
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_ledger.key(),
        ledger_pda(&session.machine, &session.owner).0,
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_ledger.owner,
        session.owner,
        ErrorCode::Unauthorized
    );

    let delta = session
        .cumulative_withdrawn_usdc
        .checked_sub(ctx.accounts.player_ledger.total_withdrawn_usdc)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(delta > 0, ErrorCode::NothingToSettle);

    let (vault_authority, vault_bump) = vault_authority_pda(&session.machine);
    require_keys_eq!(
        ctx.accounts.vault_authority.key(),
        vault_authority,
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        ctx.accounts.usdc_vault.key(),
        get_associated_token_address(&vault_authority, &usdc_mint),
        ErrorCode::InvalidVault
    );

    let usdc_vault = read_token_account(&ctx.accounts.usdc_vault)?;
    let owner_ata = read_token_account(&ctx.accounts.owner_usdc_ata)?;
    require_keys_eq!(usdc_vault.mint, usdc_mint, ErrorCode::InvalidVault);
    require_keys_eq!(usdc_vault.owner, vault_authority, ErrorCode::InvalidVault);
    require_keys_eq!(
        ctx.accounts.owner_usdc_ata.key(),
        get_associated_token_address(&session.owner, &usdc_mint),
        ErrorCode::InvalidVault
    );
    require_keys_eq!(owner_ata.owner, session.owner, ErrorCode::Unauthorized);

    let seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        session.machine.as_ref(),
        &[vault_bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.usdc_vault.to_account_info(),
                to: ctx.accounts.owner_usdc_ata.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        delta,
    )?;

    let ledger = &mut ctx.accounts.player_ledger;
    ledger.machine = session.machine;
    ledger.total_withdrawn_usdc = session.cumulative_withdrawn_usdc;

    emit!(UsdcWithdrawnL1 {
        owner: session.owner,
        amount: delta,
    });

    Ok(())
}

/// Deserialize just the configuration prefix needed by the L1 withdrawal.
///
/// Loading the whole `MachineConfig` (16 `PrizeSlot`s) would blow the SBF stack
/// budget in a settlement handler.
fn load_machine_usdc_mint(account: &AccountInfo) -> Result<Pubkey> {
    #[derive(AnchorDeserialize)]
    struct MachineHeader {
        #[allow(dead_code)]
        machine_id: u64,
        #[allow(dead_code)]
        admin: Pubkey,
        usdc_mint: Pubkey,
    }

    require!(
        account.owner == &crate::ID || account.owner == &ephemeral_rollups_sdk::id(),
        ErrorCode::Unauthorized
    );
    let data = account.try_borrow_data()?;
    require!(data.len() > 8, ErrorCode::InvalidState);
    let header = MachineHeader::deserialize(&mut &data[8..])
        .map_err(|_| ErrorCode::InvalidState)?;
    Ok(header.usdc_mint)
}

fn read_token_account(account: &UncheckedAccount<'_>) -> Result<SplTokenAccount> {
    let data = account.try_borrow_data()?;
    SplTokenAccount::unpack(&data).map_err(|_| ErrorCode::InvalidVault.into())
}
