use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::instructions::common::{load_machine, load_session, machine_pda};
use crate::state::{PlayerLedger, PlayerSession, SessionState};

#[derive(Accounts)]
#[instruction(deposit_usdc: u64, session_key: Pubkey, session_duration_secs: i64)]
pub struct InitAndDepositSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: machine PDA. Decoded manually because it may be delegated to the ER.
    /// The handler re-derives and validates the machine address from `machine_id`.
    pub machine_config: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PlayerSession::INIT_SPACE,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PlayerLedger::INIT_SPACE,
        seeds = [LEDGER_SEED, machine_config.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub player_ledger: Box<Account<'info, PlayerLedger>>,

    #[account(
        mut,
        token::authority = owner
    )]
    pub owner_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::authority = vault_authority
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: vault authority PDA.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, machine_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_and_deposit_session(
    ctx: Context<InitAndDepositSession>,
    deposit_usdc: u64,
    session_key: Pubkey,
    session_duration_secs: i64,
) -> Result<()> {
    let machine =
        load_machine(&ctx.accounts.machine_config.to_account_info())?;
    require_keys_eq!(
        ctx.accounts.machine_config.key(),
        machine_pda(machine.machine_id).0,
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.owner_usdc_ata.mint,
        machine.usdc_mint,
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        ctx.accounts.usdc_vault.owner,
        ctx.accounts.vault_authority.key(),
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        ctx.accounts.usdc_vault.mint,
        machine.usdc_mint,
        ErrorCode::InvalidVault
    );

    let now = Clock::get()?.unix_timestamp;

    // `init_if_needed`: initialize defaults only when the account was just created.
    let fresh_session = ctx.accounts.player_session.machine == Pubkey::default();
    if fresh_session {
        let bump = ctx.bumps.player_session;
        ctx.accounts.player_session.set_inner(PlayerSession::empty(
            ctx.accounts.machine_config.key(),
            ctx.accounts.owner.key(),
            bump,
        ));
    }
    if ctx.accounts.player_ledger.machine == Pubkey::default() {
        let bump = ctx.bumps.player_ledger;
        ctx.accounts.player_ledger.set_inner(PlayerLedger::empty(
            ctx.accounts.machine_config.key(),
            ctx.accounts.owner.key(),
            bump,
        ));
    }

    // Delegation moves ownership but not data; make sure this really is our session.
    require_keys_eq!(
        ctx.accounts.player_session.machine,
        ctx.accounts.machine_config.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_session.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.player_ledger.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    // Depositing mid-round could silently discard a live `Steering`/`AwaitingVrf`
    // round (and strand a reserved slot), so only top up between rounds.
    if !fresh_session {
        require!(
            ctx.accounts.player_session.state == SessionState::Idle,
            ErrorCode::InvalidState
        );
    }
    require!(session_duration_secs >= 0, ErrorCode::InvalidConfig);

    if deposit_usdc > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.owner_usdc_ata.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            deposit_usdc,
        )?;

        ctx.accounts.player_ledger.total_deposited_usdc = ctx
            .accounts
            .player_ledger
            .total_deposited_usdc
            .checked_add(deposit_usdc)
            .ok_or(ErrorCode::MathOverflow)?;
        ctx.accounts.player_session.cumulative_deposited_usdc = ctx
            .accounts
            .player_session
            .cumulative_deposited_usdc
            .checked_add(deposit_usdc)
            .ok_or(ErrorCode::MathOverflow)?;
        ctx.accounts.player_session.usdc_balance = ctx
            .accounts
            .player_session
            .usdc_balance
            .checked_add(deposit_usdc)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    let session = &mut ctx.accounts.player_session;
    session.session_key = session_key;
    session.session_expiry = now
        .checked_add(session_duration_secs.clamp(0, MAX_SESSION_DURATION_SECS))
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateSession<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: machine PDA, used to derive the session seeds.
    pub machine_config: UncheckedAccount<'info>,

    /// CHECK: session PDA, validated before delegating.
    #[account(
        mut,
        del,
        seeds = [SESSION_SEED, machine_config.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub player_session: UncheckedAccount<'info>,
}

pub fn handle_delegate_session(ctx: Context<DelegateSession>) -> Result<()> {
    let session = load_session(&ctx.accounts.player_session.to_account_info())?;
    require_keys_eq!(
        session.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        session.machine,
        ctx.accounts.machine_config.key(),
        ErrorCode::Unauthorized
    );

    ctx.accounts.delegate_player_session(
        &ctx.accounts.owner,
        &[
            SESSION_SEED,
            ctx.accounts.machine_config.key().as_ref(),
            ctx.accounts.owner.key().as_ref(),
        ],
        DelegateConfig::default(),
    )?;

    Ok(())
}
