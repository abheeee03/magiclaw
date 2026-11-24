//! End-to-end LiteSVM tests for the ClawVault program.
//!
//! The deterministic on-chain paths (setup, deposit, steering/clamping, miss,
//! VRF slip/win, sell-back, L1 claim/withdraw replay protection, stuck-VRF
//! recovery and session-key scope) run against the compiled SBF program loaded
//! into LiteSVM.
//!
//! The two network-dependent legs are intentionally out of scope here:
//! * `delegate_*` / `request_withdraw_and_undelegate` need the MagicBlock
//!   delegation program and an ER validator (MagicSVM/devnet).
//! * A real VRF fulfillment needs the MagicBlock VRF program. The callback path
//!   is still exercised in-process by invoking `consume_vrf_grip` with the scoped
//!   VRF identity signer and signature verification disabled.

#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::{AnchorSerialize, Discriminator, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use anchor_spl::associated_token::{get_associated_token_address, ID as ATA_PROGRAM_ID};
use anchor_spl::token::spl_token;
use anchor_spl::token::ID as TOKEN_PROGRAM_ID;
use ephemeral_rollups_sdk::vrf::compat::slot_hashes;
use litesvm::types::{FailedTransactionMetadata, TransactionResult};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_instruction::error::InstructionError;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signature::Signature;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use solana_transaction_error::TransactionError;

use magiclaw::constants::*;
use magiclaw::error::ErrorCode;
use magiclaw::state::{
    LastOutcome, MachineConfig, PlayerLedger, PlayerSession, SessionState,
};

const NOW: i64 = 1_700_000_000;
const MACHINE_ID: u64 = 42;
const PLAY_FEE: u64 = 1_000_000; // 1 USDC
const DEPOSIT: u64 = 10_000_000; // 10 USDC
const LIQUIDITY: u64 = 50_000_000; // 50 USDC
const PRIZE_AMOUNT: u64 = 1_000_000;
const SESSION_DURATION: i64 = 3_600;

fn program_so() -> Vec<u8> {
    std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/magiclaw.so"
    ))
    .expect("run `anchor build` (or `cargo build-sbf`) before `cargo test`")
}

fn anchor_error(code: ErrorCode) -> u32 {
    anchor_lang::error::ERROR_CODE_OFFSET + code as u32
}

fn custom_error(err: &TransactionError) -> Option<u32> {
    match err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(*code),
        _ => None,
    }
}

fn expect_ok(result: TransactionResult) -> litesvm::types::TransactionMetadata {
    match result {
        Ok(meta) => meta,
        Err(FailedTransactionMetadata { err, meta }) => {
            panic!("transaction failed: {err:?}\n{}", meta.pretty_logs())
        }
    }
}

fn expect_err(result: TransactionResult) -> FailedTransactionMetadata {
    match result {
        Ok(meta) => panic!(
            "expected transaction failure, got success\n{}",
            meta.pretty_logs()
        ),
        Err(err) => err,
    }
}

struct TestEnv {
    svm: LiteSVM,
    admin: Keypair,
    player: Keypair,
    session_key: Keypair,
    usdc_mint: Pubkey,
    #[allow(dead_code)]
    admin_usdc: Pubkey,
    player_usdc: Pubkey,
    prize_mints: Vec<Pubkey>,
    machine: Pubkey,
    vault_authority: Pubkey,
    usdc_vault: Pubkey,
    session: Pubkey,
    ledger: Pubkey,
    price_feed: Pubkey,
}

impl TestEnv {
    fn new() -> Self {
        let mut svm = LiteSVM::new().with_sigverify(false);
        svm.add_program(magiclaw::ID, &program_so())
            .expect("load magiclaw program");

        let admin = Keypair::new();
        let player = Keypair::new();
        let session_key = Keypair::new();

        for keypair in [&admin, &player, &session_key] {
            expect_ok(svm.airdrop(&keypair.pubkey(), 1_000_000_000_000));
        }

        set_clock(&mut svm, NOW);

        let usdc_mint = create_mint(&mut svm, &admin, &admin, 6);
        let mut prize_mints = Vec::new();
        for _ in 0..4 {
            prize_mints.push(create_mint(&mut svm, &admin, &admin, 6));
        }

        let admin_usdc = create_ata(&mut svm, &admin, &admin.pubkey(), &usdc_mint);
        let player_usdc = create_ata(&mut svm, &admin, &player.pubkey(), &usdc_mint);
        mint_tokens(&mut svm, &admin, &usdc_mint, &admin_usdc, 100_000_000);
        mint_tokens(&mut svm, &admin, &usdc_mint, &player_usdc, DEPOSIT);

        let mut prize_admin_atas = Vec::new();
        for mint in &prize_mints {
            let ata = create_ata(&mut svm, &admin, &admin.pubkey(), mint);
            mint_tokens(&mut svm, &admin, mint, &ata, PRIZE_AMOUNT);
            prize_admin_atas.push(ata);
        }

        let (machine, _) =
            Pubkey::find_program_address(&[MACHINE_SEED, &MACHINE_ID.to_le_bytes()], &magiclaw::ID);
        let (vault_authority, _) =
            Pubkey::find_program_address(&[VAULT_AUTHORITY_SEED, machine.as_ref()], &magiclaw::ID);
        let usdc_vault = get_associated_token_address(&vault_authority, &usdc_mint);

        // The ATA authority / VRF identity accounts are passed as read-only PDAs.
        set_empty_account(&mut svm, vault_authority);
        set_empty_account(
            &mut svm,
            Pubkey::new_from_array(
                ephemeral_rollups_sdk::vrf::consts::program_identity_pda(&magiclaw::ID).0,
            ),
        );
        set_empty_account(
            &mut svm,
            Pubkey::new_from_array(
                ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const(&magiclaw::ID).0,
            ),
        );

        // The program only CPIs the VRF program on an actual hit. A miss still
        // needs the account to exist and be executable for `Program<VrfProgram>`.
        svm.add_program(
            ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_ID,
            &program_so(),
        )
        .expect("load stand-in VRF program");
        set_empty_account(&mut svm, DEFAULT_TEST_QUEUE);

        // Fake Pyth Lazer account for slot 0, owned by the canonical republisher.
        let price_feed = Pubkey::new_unique();
        let feed_data = price_update_data(&price_feed, 1_000_000, -6, NOW);
        set_owned_account(&mut svm, price_feed, PRICE_ORACLE_PROGRAM_ID, feed_data);

        let init_accounts = magiclaw::accounts::InitializeMachine {
            admin: admin.pubkey(),
            machine_config: machine,
            usdc_mint,
            vault_authority,
            usdc_vault,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ATA_PROGRAM_ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        };
        let init_data = magiclaw::instruction::InitializeMachine {
            machine_id: MACHINE_ID,
            play_fee_usdc: PLAY_FEE,
            grip_bps: DEFAULT_GRIP_BPS,
            buyback_bps: DEFAULT_BUYBACK_BPS,
            bullseye_bonus_bps: DEFAULT_BULLSEYE_BONUS_BPS,
            capture_radius: CAPTURE_RADIUS,
            bullseye_radius: BULLSEYE_RADIUS,
            play_duration_secs: PLAY_DURATION_SECS,
        }
        .data();
        expect_ok(send(
            &mut svm,
            &admin,
            &[&admin],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: init_accounts.to_account_metas(None),
                data: init_data,
            }],
        ));

        let fund_accounts = magiclaw::accounts::FundUsdcLiquidity {
            admin: admin.pubkey(),
            machine_config: machine,
            admin_usdc_ata: admin_usdc,
            usdc_vault,
            vault_authority,
            token_program: TOKEN_PROGRAM_ID,
        };
        expect_ok(send(
            &mut svm,
            &admin,
            &[&admin],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: fund_accounts.to_account_metas(None),
                data: magiclaw::instruction::FundUsdcLiquidity {
                    amount_usdc: LIQUIDITY,
                }
                .data(),
            }],
        ));

        // One capsule per tier. Slot 0 sits at the claw spawn point.
        let slots = [(0u8, 0u8, 500u16, 500u16), (1, 1, 100, 100), (2, 2, 900, 900), (3, 3, 700, 300)];
        for (slot_id, tier, x, z) in slots {
            let prize_mint = prize_mints[slot_id as usize];
            let prize_admin_ata = prize_admin_atas[slot_id as usize];
            let prize_vault = get_associated_token_address(&vault_authority, &prize_mint);
            let accounts = magiclaw::accounts::StockPrizeSlot {
                admin: admin.pubkey(),
                machine_config: machine,
                prize_mint,
                admin_prize_ata: prize_admin_ata,
                vault_authority,
                prize_vault,
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: ATA_PROGRAM_ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            };
            let data = magiclaw::instruction::StockPrizeSlot {
                slot_id,
                tier,
                x,
                z,
                prize_amount: PRIZE_AMOUNT,
                price_feed: if slot_id == 0 {
                    price_feed
                } else {
                    Pubkey::default()
                },
                fallback_buyback_usdc: 500_000,
            }
            .data();
            expect_ok(send(
                &mut svm,
                &admin,
                &[&admin],
                &[Instruction {
                    program_id: magiclaw::ID,
                    accounts: accounts.to_account_metas(None),
                    data,
                }],
            ));
        }

        let (session, _) = Pubkey::find_program_address(
            &[SESSION_SEED, machine.as_ref(), player.pubkey().as_ref()],
            &magiclaw::ID,
        );
        let (ledger, _) = Pubkey::find_program_address(
            &[LEDGER_SEED, machine.as_ref(), player.pubkey().as_ref()],
            &magiclaw::ID,
        );

        let deposit_accounts = magiclaw::accounts::InitAndDepositSession {
            owner: player.pubkey(),
            machine_config: machine,
            player_session: session,
            player_ledger: ledger,
            owner_usdc_ata: player_usdc,
            usdc_vault,
            vault_authority,
            token_program: TOKEN_PROGRAM_ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        };
        let deposit_data = magiclaw::instruction::InitAndDepositSession {
            deposit_usdc: DEPOSIT,
            session_key: session_key.pubkey(),
            session_duration_secs: SESSION_DURATION,
        }
        .data();
        expect_ok(send(
            &mut svm,
            &player,
            &[&player],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: deposit_accounts.to_account_metas(None),
                data: deposit_data,
            }],
        ));

        Self {
            svm,
            admin,
            player,
            session_key,
            usdc_mint,
            admin_usdc,
            player_usdc,
            prize_mints,
            machine,
            vault_authority,
            usdc_vault,
            session,
            ledger,
            price_feed,
        }
    }

    fn machine(&self) -> MachineConfig {
        read_account(&self.svm, &self.machine)
    }

    fn session(&self) -> PlayerSession {
        read_account(&self.svm, &self.session)
    }

    fn ledger(&self) -> PlayerLedger {
        read_account(&self.svm, &self.ledger)
    }

    fn update_session(&mut self, f: impl FnOnce(&mut PlayerSession)) {
        let mut session = self.session();
        f(&mut session);
        write_account(&mut self.svm, self.session, &session);
    }

    fn update_machine(&mut self, f: impl FnOnce(&mut MachineConfig)) {
        let mut machine = self.machine();
        f(&mut machine);
        write_account(&mut self.svm, self.machine, &machine);
    }

    fn start_play(&mut self) {
        let accounts = magiclaw::accounts::StartPlay {
            signer: self.session_key.pubkey(),
            machine_config: self.machine,
            player_session: self.session,
        };
        expect_ok(send(
            &mut self.svm,
            &self.session_key,
            &[&self.session_key],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: accounts.to_account_metas(None),
                data: magiclaw::instruction::StartPlay {}.data(),
            }],
        ));
    }

    fn steer(&mut self, dx: i16, dz: i16) {
        let accounts = magiclaw::accounts::SteerClaw {
            signer: self.session_key.pubkey(),
            player_session: self.session,
        };
        let result = send(
            &mut self.svm,
            &self.session_key,
            &[&self.session_key],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: accounts.to_account_metas(None),
                data: magiclaw::instruction::SteerClaw { dx, dz }.data(),
            }],
        );
        expect_ok(result);
    }

    fn set_awaiting_vrf(&mut self, slot: u8, bullseye: bool, nonce: u64) {
        self.update_session(|session| {
            session.state = SessionState::AwaitingVrf;
            session.target_slot = slot;
            session.is_bullseye = bullseye;
            session.vrf_request_nonce = nonce;
            session.play_expires_at = NOW + PLAY_DURATION_SECS;
            session.last_outcome = LastOutcome::None;
        });
        self.update_machine(|machine| {
            machine.slots[slot as usize].in_stock = true;
            machine.slots[slot as usize].reserved = true;
        });
    }

    fn vrf_callback(&mut self, roll: u32, nonce: u64) -> TransactionResult {
        let mut randomness = [0u8; 32];
        randomness[..4].copy_from_slice(&roll.to_le_bytes());
        let identity = Pubkey::new_from_array(
            ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const(&magiclaw::ID).0,
        );
        let ix = Instruction {
            program_id: magiclaw::ID,
            accounts: vec![
                AccountMeta::new_readonly(identity, true),
                AccountMeta::new(self.machine, false),
                AccountMeta::new(self.session, false),
            ],
            data: magiclaw::instruction::ConsumeVrfGrip {
                randomness,
                request_nonce: nonce,
            }
            .data(),
        };
        send_forged(&mut self.svm, &self.admin, &[ix])
    }

    fn sell_back(&mut self, feed: Option<Pubkey>) -> TransactionResult {
        let accounts = magiclaw::accounts::SellBackPrize {
            signer: self.session_key.pubkey(),
            machine_config: self.machine,
            player_session: self.session,
            price_feed: feed,
        };
        send(
            &mut self.svm,
            &self.session_key,
            &[&self.session_key],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: accounts.to_account_metas(None),
                data: magiclaw::instruction::SellBackPrize {}.data(),
            }],
        )
    }

    fn execute_prize_claim(&mut self) -> TransactionResult {
        let prize_vault = get_associated_token_address(&self.vault_authority, &self.prize_mints[0]);
        let owner_prize_ata = get_associated_token_address(&self.player.pubkey(), &self.prize_mints[0]);
        let accounts = magiclaw::accounts::ExecuteL1PrizeClaim {
            machine_config: self.machine,
            player_session: self.session,
            player_ledger: self.ledger,
            vault_authority: self.vault_authority,
            prize_vault_ata: prize_vault,
            owner_prize_ata,
            token_program: TOKEN_PROGRAM_ID,
        };
        send(
            &mut self.svm,
            &self.admin,
            &[&self.admin],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: accounts.to_account_metas(None),
                data: magiclaw::instruction::ExecuteL1PrizeClaim {}.data(),
            }],
        )
    }

    fn execute_usdc_withdraw(&mut self) -> TransactionResult {
        let accounts = magiclaw::accounts::ExecuteL1UsdcWithdraw {
            machine_config: self.machine,
            player_session: self.session,
            player_ledger: self.ledger,
            vault_authority: self.vault_authority,
            usdc_vault: self.usdc_vault,
            owner_usdc_ata: self.player_usdc,
            token_program: TOKEN_PROGRAM_ID,
        };
        send(
            &mut self.svm,
            &self.admin,
            &[&self.admin],
            &[Instruction {
                program_id: magiclaw::ID,
                accounts: accounts.to_account_metas(None),
                data: magiclaw::instruction::ExecuteL1UsdcWithdraw {}.data(),
            }],
        )
    }
}

#[test]
fn setup_stock_and_deposit() {
    let mut env = TestEnv::new();
    let machine = env.machine();

    assert_eq!(machine.machine_id, MACHINE_ID);
    assert_eq!(machine.admin, env.admin.pubkey());
    assert_eq!(machine.usdc_mint, env.usdc_mint);
    assert_eq!(machine.play_fee_usdc, PLAY_FEE);
    assert_eq!(machine.grip_bps, DEFAULT_GRIP_BPS);
    assert_eq!(machine.buyback_bps, DEFAULT_BUYBACK_BPS);
    assert_eq!(machine.slots[0].price_feed, env.price_feed);
    for slot in 0..4 {
        assert!(machine.slots[slot].in_stock);
        assert!(!machine.slots[slot].reserved);
        assert_eq!(machine.slots[slot].tier, slot as u8);
    }

    assert_eq!(
        token_balance(&env.svm, &env.usdc_vault),
        LIQUIDITY + DEPOSIT
    );
    for (index, mint) in env.prize_mints.iter().enumerate() {
        let vault = get_associated_token_address(&env.vault_authority, mint);
        assert_eq!(token_balance(&env.svm, &vault), PRIZE_AMOUNT);
        assert_eq!(machine.slots[index].prize_mint, *mint);
    }

    let session = env.session();
    assert_eq!(session.owner, env.player.pubkey());
    assert_eq!(session.session_key, env.session_key.pubkey());
    assert_eq!(session.session_expiry, NOW + SESSION_DURATION);
    assert_eq!(session.usdc_balance, DEPOSIT);
    assert_eq!(session.cumulative_deposited_usdc, DEPOSIT);
    assert_eq!(session.state, SessionState::Idle);

    let ledger = env.ledger();
    assert_eq!(ledger.total_deposited_usdc, DEPOSIT);
    assert_eq!(ledger.total_withdrawn_usdc, 0);
    assert_eq!(ledger.last_claimed_nonce, 0);

    // Depositing mid-round is rejected so a reserved slot cannot be stranded.
    env.start_play();
    let accounts = magiclaw::accounts::InitAndDepositSession {
        owner: env.player.pubkey(),
        machine_config: env.machine,
        player_session: env.session,
        player_ledger: env.ledger,
        owner_usdc_ata: env.player_usdc,
        usdc_vault: env.usdc_vault,
        vault_authority: env.vault_authority,
        token_program: TOKEN_PROGRAM_ID,
        system_program: anchor_lang::solana_program::system_program::ID,
    };
    let result = send(
        &mut env.svm,
        &env.player,
        &[&env.player],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: accounts.to_account_metas(None),
            data: magiclaw::instruction::InitAndDepositSession {
                deposit_usdc: 0,
                session_key: env.session_key.pubkey(),
                session_duration_secs: SESSION_DURATION,
            }
            .data(),
        }],
    );
    let err = expect_err(result);
    assert_eq!(
        custom_error(&err.err),
        Some(anchor_error(ErrorCode::InvalidState))
    );
}

#[test]
fn steering_clamps_step_and_boundaries() {
    let mut env = TestEnv::new();
    env.start_play();

    env.steer(500, 0);
    let session = env.session();
    assert_eq!((session.claw_x, session.claw_z), (540, 500));

    env.steer(-500, 0);
    let session = env.session();
    assert_eq!((session.claw_x, session.claw_z), (500, 500));

    // Drive to the upper-right corner: 13 * 40 exceeds 1000 and must clamp.
    for _ in 0..13 {
        env.steer(500, 500);
    }
    let session = env.session();
    assert_eq!((session.claw_x, session.claw_z), (PLAYFIELD_MAX, PLAYFIELD_MAX));

    for _ in 0..30 {
        env.steer(-500, -500);
    }
    let session = env.session();
    assert_eq!((session.claw_x, session.claw_z), (0, 0));
}

#[test]
fn miss_path_deducts_fee_and_returns_idle() {
    let mut env = TestEnv::new();
    env.start_play();

    // Move away from every stocked capsule.
    for _ in 0..13 {
        env.steer(500, 500);
    }
    let accounts = magiclaw::accounts::DropClaw {
        signer: env.session_key.pubkey(),
        machine_config: env.machine,
        player_session: env.session,
        oracle_queue: DEFAULT_TEST_QUEUE,
        program_identity: Pubkey::new_from_array(
            ephemeral_rollups_sdk::vrf::consts::program_identity_pda(&magiclaw::ID).0,
        ),
        vrf_program: ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_ID,
        slot_hashes: slot_hashes::ID,
        system_program: anchor_lang::solana_program::system_program::ID,
    };
    expect_ok(send(
        &mut env.svm,
        &env.session_key,
        &[&env.session_key],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: accounts.to_account_metas(None),
            data: magiclaw::instruction::DropClaw { client_seed: 9 }.data(),
        }],
    ));

    let session = env.session();
    assert_eq!(session.state, SessionState::Idle);
    assert_eq!(session.last_outcome, LastOutcome::Miss);
    assert_eq!(session.usdc_balance, DEPOSIT - PLAY_FEE);
    assert_eq!(session.plays_count, 1);
    assert_eq!(env.machine().total_plays, 1);
    assert_eq!(env.machine().total_wins, 0);
}

#[test]
fn vrf_slip_win_and_sell_back_with_oracle_and_floor() {
    let mut env = TestEnv::new();
    env.start_play();

    // Slip: bullseye Common odds are 6500 + 300 = 6800 bps.
    env.set_awaiting_vrf(0, true, 1);
    expect_ok(env.vrf_callback(9_999, 1));
    let session = env.session();
    let machine = env.machine();
    assert_eq!(session.state, SessionState::Idle);
    assert_eq!(session.last_outcome, LastOutcome::Slipped);
    assert_eq!(session.last_vrf_roll, 9_999);
    assert!(machine.slots[0].in_stock);
    assert!(!machine.slots[0].reserved);

    // Win at roll 0, then sell back against the live oracle.
    env.set_awaiting_vrf(0, true, 2);
    expect_ok(env.vrf_callback(0, 2));
    let session = env.session();
    let machine = env.machine();
    assert_eq!(session.state, SessionState::WonPendingChoice);
    assert_eq!(session.last_outcome, LastOutcome::Won);
    assert!(!machine.slots[0].in_stock);
    assert!(!machine.slots[0].reserved);
    assert_eq!(machine.total_wins, 1);
    assert_eq!(session.wins_count, 1);

    let balance_before = session.usdc_balance;
    expect_ok(env.sell_back(Some(env.price_feed)));
    let session = env.session();
    // 1 token at $1.00, Common tier 90% -> 0.9 USDC.
    assert_eq!(session.usdc_balance, balance_before + 900_000);
    assert_eq!(session.state, SessionState::Idle);
    assert_eq!(session.last_outcome, LastOutcome::SoldBack);
    assert!(env.machine().slots[0].in_stock);

    // A stale oracle update must fall back to the fixed floor.
    let stale = price_update_data(&env.price_feed, 1_000_000, -6, NOW - 120);
    set_owned_account(
        &mut env.svm,
        env.price_feed,
        PRICE_ORACLE_PROGRAM_ID,
        stale,
    );

    env.set_awaiting_vrf(0, false, 3);
    expect_ok(env.vrf_callback(0, 3));
    let balance_before = env.session().usdc_balance;
    expect_ok(env.sell_back(Some(env.price_feed)));
    let session = env.session();
    assert_eq!(session.usdc_balance, balance_before + 500_000);
}

#[test]
fn claim_settles_on_l1_and_rejects_replay() {
    let mut env = TestEnv::new();
    env.start_play();

    // Simulate the committed state produced by `claim_prize` (the ER-side
    // instruction itself needs a live MagicBlock magic program).
    let prize_mint = env.prize_mints[0];
    env.update_session(|session| {
        session.state = SessionState::Idle;
        session.last_outcome = LastOutcome::Claimed;
        session.claim_nonce = 1;
        session.pending_claim_mint = prize_mint;
        session.pending_claim_amount = PRIZE_AMOUNT;
    });
    let owner_prize_ata = create_ata(
        &mut env.svm,
        &env.admin,
        &env.player.pubkey(),
        &env.prize_mints[0],
    );

    expect_ok(env.execute_prize_claim());
    assert_eq!(token_balance(&env.svm, &owner_prize_ata), PRIZE_AMOUNT);
    assert_eq!(env.ledger().last_claimed_nonce, 1);

    let err = expect_err(env.execute_prize_claim());
    assert_eq!(
        custom_error(&err.err),
        Some(anchor_error(ErrorCode::NothingToSettle))
    );
}

#[test]
fn session_key_expiry_and_withdraw_scope() {
    let mut env = TestEnv::new();
    env.start_play();

    // A valid but expired session key cannot steer.
    env.update_session(|session| {
        session.session_expiry = NOW - 1;
    });
    let accounts = magiclaw::accounts::SteerClaw {
        signer: env.session_key.pubkey(),
        player_session: env.session,
    };
    let err = expect_err(send(
        &mut env.svm,
        &env.session_key,
        &[&env.session_key],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: accounts.to_account_metas(None),
            data: magiclaw::instruction::SteerClaw { dx: 1, dz: 1 }.data(),
        }],
    ));
    assert_eq!(
        custom_error(&err.err),
        Some(anchor_error(ErrorCode::SessionKeyExpired))
    );

    // Restore a valid key, but it still cannot authorize a withdrawal: the
    // withdrawal context derives the session PDA from the owner signer.
    env.update_session(|session| {
        session.session_expiry = NOW + SESSION_DURATION;
    });
    let magic_program =
        Pubkey::new_from_array(ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID.to_bytes());
    let magic_context =
        Pubkey::new_from_array(ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID.to_bytes());
    env.svm
        .add_program(magic_program, &program_so())
        .expect("load mock magic program");
    set_owned_account(
        &mut env.svm,
        magic_context,
        anchor_lang::solana_program::system_program::ID,
        vec![0u8; 8],
    );

    let accounts = magiclaw::accounts::RequestWithdrawAndUndelegate {
        owner: env.session_key.pubkey(),
        player_session: env.session,
        machine_config: env.machine,
        player_ledger: env.ledger,
        vault_authority: env.vault_authority,
        usdc_vault: env.usdc_vault,
        owner_usdc_ata: env.player_usdc,
        token_program: TOKEN_PROGRAM_ID,
        magic_program,
        magic_context,
    };
    let err = expect_err(send(
        &mut env.svm,
        &env.session_key,
        &[&env.session_key],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: accounts.to_account_metas(None),
            data: magiclaw::instruction::RequestWithdrawAndUndelegate { amount_usdc: 1 }.data(),
        }],
    ));
    let logs = err.meta.pretty_logs();
    assert!(
        logs.contains("ConstraintSeeds") || logs.contains("Unauthorized"),
        "unexpected failure logs:\n{logs}"
    );
}

#[test]
fn withdraw_settles_on_l1_and_rejects_replay() {
    let mut env = TestEnv::new();
    env.start_play();

    // Simulate the committed state produced by `request_withdraw_and_undelegate`.
    env.update_session(|session| {
        session.state = SessionState::Idle;
        session.usdc_balance = DEPOSIT - PLAY_FEE - 2_000_000;
        session.cumulative_withdrawn_usdc = 2_000_000;
    });

    expect_ok(env.execute_usdc_withdraw());
    assert_eq!(token_balance(&env.svm, &env.player_usdc), 2_000_000);
    assert_eq!(env.ledger().total_withdrawn_usdc, 2_000_000);

    let err = expect_err(env.execute_usdc_withdraw());
    assert_eq!(
        custom_error(&err.err),
        Some(anchor_error(ErrorCode::NothingToSettle))
    );
}

#[test]
fn cancel_stuck_vrf_refunds_and_releases_slot() {
    let mut env = TestEnv::new();
    env.start_play();

    let accounts = |env: &TestEnv| magiclaw::accounts::CancelStuckVrf {
        signer: env.player.pubkey(),
        machine_config: env.machine,
        player_session: env.session,
    };

    // Still inside the grace window: refused.
    env.set_awaiting_vrf(1, false, 1);
    env.update_session(|session| {
        session.play_expires_at = NOW + PLAY_DURATION_SECS;
    });
    let metas = accounts(&env).to_account_metas(None);
    let err = expect_err(send(
        &mut env.svm,
        &env.player,
        &[&env.player],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: metas,
            data: magiclaw::instruction::CancelStuckVrf {}.data(),
        }],
    ));
    assert_eq!(
        custom_error(&err.err),
        Some(anchor_error(ErrorCode::VrfStillLive))
    );

    env.update_session(|session| {
        session.play_expires_at = NOW - STUCK_VRF_GRACE_SECS - 1;
    });
    let metas = accounts(&env).to_account_metas(None);
    expect_ok(send(
        &mut env.svm,
        &env.player,
        &[&env.player],
        &[Instruction {
            program_id: magiclaw::ID,
            accounts: metas,
            data: magiclaw::instruction::CancelStuckVrf {}.data(),
        }],
    ));

    let session = env.session();
    let machine = env.machine();
    assert_eq!(session.state, SessionState::Idle);
    assert_eq!(session.usdc_balance, DEPOSIT);
    assert!(machine.slots[1].in_stock);
    assert!(!machine.slots[1].reserved);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

fn set_empty_account(svm: &mut LiteSVM, key: Pubkey) {
    set_owned_account(
        svm,
        key,
        anchor_lang::solana_program::system_program::ID,
        Vec::new(),
    );
}

fn set_owned_account(svm: &mut LiteSVM, key: Pubkey, owner: Pubkey, data: Vec<u8>) {
    let lamports = svm
        .minimum_balance_for_rent_exemption(data.len())
        .max(1);
    svm.set_account(
        key,
        Account {
            lamports,
            data,
            owner,
            executable: false,
            rent_epoch: 0,
        },
    )
    .expect("set account");
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    signers: &[&Keypair],
    instructions: &[Instruction],
) -> TransactionResult {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);

    let mut all: Vec<&Keypair> = Vec::with_capacity(signers.len() + 1);
    all.push(payer);
    for signer in signers {
        if signer.pubkey() != payer.pubkey() {
            all.push(signer);
        }
    }

    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &all)
        .expect("sign transaction");
    svm.send_transaction(tx)
}

fn send_forged(svm: &mut LiteSVM, payer: &Keypair, instructions: &[Instruction]) -> TransactionResult {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);
    let signatures = vec![Signature::default(); message.header.num_required_signatures as usize];
    let tx = VersionedTransaction {
        signatures,
        message: VersionedMessage::Legacy(message),
    };
    svm.send_transaction(tx)
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, authority: &Keypair, decimals: u8) -> Pubkey {
    let mint = Keypair::new();
    let lamports = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let create = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        lamports,
        spl_token::state::Mint::LEN as u64,
        &TOKEN_PROGRAM_ID,
    );
    let init = spl_token::instruction::initialize_mint2(
        &TOKEN_PROGRAM_ID,
        &mint.pubkey(),
        &authority.pubkey(),
        None,
        decimals,
    )
    .unwrap();
    expect_ok(send(svm, payer, &[&mint], &[create, init]));
    mint.pubkey()
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let ix = create_associated_token_account_idempotent(
        &payer.pubkey(),
        owner,
        mint,
        &TOKEN_PROGRAM_ID,
    );
    expect_ok(send(svm, payer, &[payer], &[ix]));
    get_associated_token_address(owner, mint)
}

fn mint_tokens(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    destination: &Pubkey,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &TOKEN_PROGRAM_ID,
        mint,
        destination,
        &payer.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    expect_ok(send(svm, payer, &[payer], &[ix]));
}

fn token_balance(svm: &LiteSVM, account: &Pubkey) -> u64 {
    let data = svm.get_account(account).expect("token account").data;
    spl_token::state::Account::unpack(&data)
        .expect("valid token account")
        .amount
}

fn read_account<T: anchor_lang::AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let data = svm.get_account(key).expect("account exists").data;
    assert!(data.len() >= 8, "account is too small");
    T::try_deserialize(&mut &data[..]).expect("deserialize account")
}

fn write_account<T: AnchorSerialize + Discriminator>(svm: &mut LiteSVM, key: Pubkey, value: &T) {
    let mut data = Vec::new();
    data.extend_from_slice(T::DISCRIMINATOR);
    value
        .serialize(&mut data)
        .expect("serialize account");
    set_owned_account(svm, key, magiclaw::ID, data);
}

fn price_update_data(account: &Pubkey, price: i64, exponent: i32, publish_time: i64) -> Vec<u8> {
    let mut data = Vec::with_capacity(133);
    data.extend_from_slice(&[0u8; 8]); // Anchor discriminator (skipped by the program)
    data.extend_from_slice(&[0u8; 32]); // write_authority
    data.push(1); // verification_level
    data.extend_from_slice(account.as_ref()); // feed_id == account key
    data.extend_from_slice(&price.to_le_bytes());
    data.extend_from_slice(&0u64.to_le_bytes()); // conf
    data.extend_from_slice(&exponent.to_le_bytes());
    data.extend_from_slice(&publish_time.to_le_bytes());
    data.extend_from_slice(&(publish_time - 1).to_le_bytes()); // prev_publish_time
    data.extend_from_slice(&price.to_le_bytes()); // ema_price
    data.extend_from_slice(&0u64.to_le_bytes()); // ema_conf
    data.extend_from_slice(&1u64.to_le_bytes()); // posted_slot
    data
}
