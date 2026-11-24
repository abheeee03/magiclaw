use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{
    CallHandler, FoldableIntentBuilder, MagicIntentBundleBuilder,
};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::events::{PrizeClaimRequested, PrizeSoldBack};
use crate::instructions::common::{verify_owner, verify_player_or_session};
use crate::pricing::compute_buyback;
use crate::state::{LastOutcome, MachineConfig, PlayerSession, SessionState};

#[derive(Accounts)]
pub struct SellBackPrize<'info> {
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

    /// CHECK: Optional oracle price account. Must match the slot's configured feed.
    pub price_feed: Option<UncheckedAccount<'info>>,
}

pub fn handle_sell_back_prize(ctx: Context<SellBackPrize>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    verify_player_or_session(
        &ctx.accounts.signer,
        &ctx.accounts.player_session,
        now,
    )?;
    require!(
        ctx.accounts.player_session.state == SessionState::WonPendingChoice,
        ErrorCode::InvalidState
    );

    let idx = ctx.accounts.player_session.target_slot as usize;
    require!(idx < MAX_SLOTS, ErrorCode::InvalidSlot);

    let feed = ctx
        .accounts
        .price_feed
        .as_ref()
        .map(|account| account.to_account_info());

    let buyback = {
        let machine: &MachineConfig = &ctx.accounts.machine_config;
        let slot = &machine.slots[idx];
        compute_buyback(machine, slot, feed.as_ref(), now)?
    };

    let session: &mut PlayerSession = &mut ctx.accounts.player_session;
    session.usdc_balance = session
        .usdc_balance
        .checked_add(buyback)
        .ok_or(ErrorCode::MathOverflow)?;
    session.state = SessionState::Idle;
    session.last_outcome = LastOutcome::SoldBack;

    let slot = &mut ctx.accounts.machine_config.slots[idx];
    slot.in_stock = true;
    slot.reserved = false;

    emit!(PrizeSoldBack {
        owner: session.owner,
        slot_id: idx as u8,
        buyback_usdc: buyback,
    });

    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
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

    /// CHECK: L1 replay ledger, validated and mutated by `execute_l1_prize_claim`.
    pub player_ledger: UncheckedAccount<'info>,

    /// CHECK: L1 PDA owning the prize vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: L1 prize vault ATA.
    pub prize_vault_ata: UncheckedAccount<'info>,

    /// CHECK: L1 destination ATA owned by the player.
    pub owner_prize_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    verify_player_or_session(
        &ctx.accounts.signer,
        &ctx.accounts.player_session,
        now,
    )?;
    require!(
        ctx.accounts.player_session.state == SessionState::WonPendingChoice,
        ErrorCode::InvalidState
    );

    let idx = ctx.accounts.player_session.target_slot as usize;
    let slot = *ctx
        .accounts
        .machine_config
        .slots
        .get(idx)
        .ok_or(ErrorCode::InvalidSlot)?;

    let session: &mut PlayerSession = &mut ctx.accounts.player_session;
    session.claim_nonce = session
        .claim_nonce
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    session.pending_claim_mint = slot.prize_mint;
    session.pending_claim_amount = slot.prize_amount;
    session.state = SessionState::Idle;
    session.last_outcome = LastOutcome::Claimed;

    emit!(PrizeClaimRequested {
        owner: session.owner,
        slot_id: slot.slot_id,
        claim_nonce: session.claim_nonce,
        mint: slot.prize_mint,
        amount: slot.prize_amount,
    });

    let action = CallHandler {
        args: ActionArgs::new(
            anchor_lang::InstructionData::data(&crate::instruction::ExecuteL1PrizeClaim {}),
        ),
        compute_units: 200_000,
        // The player who signed the ER transaction also pays for the base-layer
        // action. The action handler binds this account to the session owner/key.
        escrow_authority: ctx.accounts.signer.to_account_info(),
        destination_program: crate::ID,
        accounts: vec![
            ShortAccountMeta {
                pubkey: ctx.accounts.machine_config.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.player_session.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.player_ledger.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.vault_authority.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.prize_vault_ata.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.owner_prize_ata.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.token_program.key(),
                is_writable: false,
            },
        ],
    };

    MagicIntentBundleBuilder::new(
        ctx.accounts.signer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit(&[ctx.accounts.player_session.to_account_info()])
    .add_post_commit_actions([action])
    .build_and_invoke()?;

    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct RequestWithdrawAndUndelegate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [SESSION_SEED, player_session.machine.as_ref(), owner.key().as_ref()],
        bump = player_session.bump
    )]
    pub player_session: Box<Account<'info, PlayerSession>>,

    /// CHECK: Machine PDA, forwarded to the L1 withdrawal action.
    pub machine_config: UncheckedAccount<'info>,

    /// CHECK: L1 replay ledger, forwarded to the L1 withdrawal action.
    pub player_ledger: UncheckedAccount<'info>,

    /// CHECK: L1 PDA owning the USDC vault.
    pub vault_authority: UncheckedAccount<'info>,

    /// CHECK: L1 USDC vault ATA.
    pub usdc_vault: UncheckedAccount<'info>,

    /// CHECK: L1 destination ATA owned by the player.
    pub owner_usdc_ata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_request_withdraw_and_undelegate(
    ctx: Context<RequestWithdrawAndUndelegate>,
    amount_usdc: u64,
) -> Result<()> {
    verify_owner(&ctx.accounts.owner, &ctx.accounts.player_session)?;
    require!(
        ctx.accounts.player_session.state == SessionState::Idle,
        ErrorCode::InvalidState
    );

    let session: &mut PlayerSession = &mut ctx.accounts.player_session;
    let withdraw = if amount_usdc == 0 {
        session.usdc_balance
    } else {
        amount_usdc
    };
    require!(withdraw > 0, ErrorCode::NothingToSettle);
    require!(
        withdraw <= session.usdc_balance,
        ErrorCode::InsufficientBalance
    );

    session.usdc_balance = session
        .usdc_balance
        .checked_sub(withdraw)
        .ok_or(ErrorCode::MathOverflow)?;
    session.cumulative_withdrawn_usdc = session
        .cumulative_withdrawn_usdc
        .checked_add(withdraw)
        .ok_or(ErrorCode::MathOverflow)?;

    let action = CallHandler {
        args: ActionArgs::new(
            anchor_lang::InstructionData::data(&crate::instruction::ExecuteL1UsdcWithdraw {}),
        ),
        compute_units: 200_000,
        escrow_authority: ctx.accounts.owner.to_account_info(),
        destination_program: crate::ID,
        accounts: vec![
            ShortAccountMeta {
                pubkey: ctx.accounts.machine_config.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.player_session.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.player_ledger.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.vault_authority.key(),
                is_writable: false,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.usdc_vault.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.owner_usdc_ata.key(),
                is_writable: true,
            },
            ShortAccountMeta {
                pubkey: ctx.accounts.token_program.key(),
                is_writable: false,
            },
        ],
    };

    MagicIntentBundleBuilder::new(
        ctx.accounts.owner.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.player_session.to_account_info()])
    .add_post_undelegate_actions([action])
    .build_and_invoke()?;

    Ok(())
}
