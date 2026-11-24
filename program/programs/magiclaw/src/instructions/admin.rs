use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::instructions::common::load_machine;
use crate::state::{MachineConfig, PrizeSlot};

#[derive(Accounts)]
#[instruction(machine_id: u64)]
pub struct InitializeMachine<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + MachineConfig::INIT_SPACE,
        seeds = [MACHINE_SEED, machine_id.to_le_bytes().as_ref()],
        bump
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(constraint = usdc_mint.decimals == USDC_DECIMALS @ ErrorCode::InvalidConfig)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA owning every vault ATA for this machine.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, machine_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_authority
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_initialize_machine(
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
    require!(play_fee_usdc > 0, ErrorCode::InvalidConfig);
    require!(play_duration_secs > 0, ErrorCode::InvalidConfig);
    require!(
        capture_radius > bullseye_radius && bullseye_radius > 0,
        ErrorCode::InvalidConfig
    );
    require!(
        grip_bps.iter().all(|bps| *bps <= BPS_DENOM),
        ErrorCode::InvalidConfig
    );
    require!(
        buyback_bps.iter().all(|bps| *bps <= BPS_DENOM),
        ErrorCode::InvalidConfig
    );
    require!(
        bullseye_bonus_bps <= BPS_DENOM,
        ErrorCode::InvalidConfig
    );

    ctx.accounts.machine_config.set_inner(MachineConfig::new(
        machine_id,
        ctx.accounts.admin.key(),
        ctx.accounts.usdc_mint.key(),
        play_fee_usdc,
        grip_bps,
        buyback_bps,
        bullseye_bonus_bps,
        capture_radius,
        bullseye_radius,
        play_duration_secs,
        ctx.bumps.machine_config,
    ));

    emit!(crate::events::MachineInitialized {
        machine: ctx.accounts.machine_config.key(),
        admin: ctx.accounts.machine_config.admin,
        play_fee_usdc,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(slot_id: u8)]
pub struct StockPrizeSlot<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    pub prize_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = prize_mint,
        token::authority = admin
    )]
    pub admin_prize_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA owning the prize vault ATA.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, machine_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = prize_mint,
        associated_token::authority = vault_authority
    )]
    pub prize_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_stock_prize_slot(
    ctx: Context<StockPrizeSlot>,
    slot_id: u8,
    tier: u8,
    x: u16,
    z: u16,
    prize_amount: u64,
    price_feed: Pubkey,
    fallback_buyback_usdc: u64,
) -> Result<()> {
    require!((slot_id as usize) < MAX_SLOTS, ErrorCode::InvalidSlot);
    require!(tier < 4, ErrorCode::InvalidSlot);
    require!(x <= PLAYFIELD_MAX && z <= PLAYFIELD_MAX, ErrorCode::InvalidSlot);
    require!(prize_amount > 0, ErrorCode::InvalidConfig);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.admin_prize_ata.to_account_info(),
                to: ctx.accounts.prize_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        prize_amount,
    )?;

    let machine = &mut ctx.accounts.machine_config;
    machine.slots[slot_id as usize] = PrizeSlot {
        slot_id,
        tier,
        x,
        z,
        prize_mint: ctx.accounts.prize_mint.key(),
        prize_amount,
        prize_decimals: ctx.accounts.prize_mint.decimals,
        price_feed,
        fallback_buyback_usdc,
        in_stock: true,
        reserved: false,
    };

    emit!(crate::events::PrizeSlotStocked {
        machine: machine.key(),
        slot_id,
        tier,
        prize_mint: ctx.accounts.prize_mint.key(),
        prize_amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FundUsdcLiquidity<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [MACHINE_SEED, machine_config.machine_id.to_le_bytes().as_ref()],
        bump = machine_config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub machine_config: Box<Account<'info, MachineConfig>>,

    #[account(
        mut,
        token::mint = machine_config.usdc_mint,
        token::authority = admin
    )]
    pub admin_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = machine_config.usdc_mint
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA owning the USDC vault.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, machine_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_fund_usdc_liquidity(
    ctx: Context<FundUsdcLiquidity>,
    amount_usdc: u64,
) -> Result<()> {
    require!(amount_usdc > 0, ErrorCode::InvalidConfig);
    require_keys_eq!(
        ctx.accounts.usdc_vault.owner,
        ctx.accounts.vault_authority.key(),
        ErrorCode::InvalidVault
    );
    require_keys_eq!(
        ctx.accounts.usdc_vault.mint,
        ctx.accounts.machine_config.usdc_mint,
        ErrorCode::InvalidVault
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.admin_usdc_ata.to_account_info(),
                to: ctx.accounts.usdc_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        amount_usdc,
    )?;

    Ok(())
}

#[delegate]
#[derive(Accounts)]
#[instruction(machine_id: u64)]
pub struct DelegateMachine<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: machine PDA, validated against the stored admin before delegating.
    #[account(
        mut,
        del,
        seeds = [MACHINE_SEED, machine_id.to_le_bytes().as_ref()],
        bump
    )]
    pub machine_config: UncheckedAccount<'info>,
}

pub fn handle_delegate_machine(
    ctx: Context<DelegateMachine>,
    machine_id: u64,
) -> Result<()> {
    let machine = load_machine(&ctx.accounts.machine_config.to_account_info())?;
    require_keys_eq!(
        machine.admin,
        ctx.accounts.admin.key(),
        ErrorCode::Unauthorized
    );
    require!(machine.machine_id == machine_id, ErrorCode::InvalidSlot);

    ctx.accounts.delegate_machine_config(
        &ctx.accounts.admin,
        &[MACHINE_SEED, &machine_id.to_le_bytes()],
        DelegateConfig::default(),
    )?;

    Ok(())
}
