use anchor_lang::prelude::*;

/// PDA seed for a `MachineConfig` account.
pub const MACHINE_SEED: &[u8] = b"machine";
/// PDA seed for a `PlayerSession` account.
pub const SESSION_SEED: &[u8] = b"session";
/// PDA seed for a `PlayerLedger` account.
pub const LEDGER_SEED: &[u8] = b"ledger";
/// PDA seed for the L1 vault authority that owns every vault ATA.
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

/// Playfield is `[0, PLAYFIELD_MAX]` on both axes.
pub const PLAYFIELD_MAX: u16 = 1000;
/// Claw spawns dead centre.
pub const SPAWN_X: u16 = 500;
pub const SPAWN_Z: u16 = 500;

/// Largest steering delta accepted per `steer_claw` call.
pub const MAX_STEP: i16 = 40;

/// Default capture radius (squared-distance hit test).
pub const CAPTURE_RADIUS: u16 = 65;
/// Default dead-centre bonus radius.
pub const BULLSEYE_RADIUS: u16 = 25;

/// Basis-point denominator (100% = 10_000 bps).
pub const BPS_DENOM: u16 = 10_000;
/// Effective grip odds are capped at 99%.
pub const MAX_EFFECTIVE_GRIP_BPS: u16 = 9900;

/// Default round length.
pub const PLAY_DURATION_SECS: i64 = 15;
/// Hard cap on a session key's lifetime (24 hours).
pub const MAX_SESSION_DURATION_SECS: i64 = 24 * 60 * 60;
/// Time after `play_expires_at` before a stuck VRF request can be cancelled.
pub const STUCK_VRF_GRACE_SECS: i64 = 60;

/// Fixed number of prize slots per machine.
pub const MAX_SLOTS: usize = 16;
/// SPL USDC decimals.
pub const USDC_DECIMALS: u8 = 6;
pub const USDC_ONE: u64 = 1_000_000;

/// Pyth / MagicBlock price accounts older than this are ignored.
pub const MAX_PRICE_AGE_SECS: i64 = 60;
/// Defensive bound on the oracle exponent we are willing to evaluate.
pub const MAX_PRICE_EXPONENT: u32 = 30;

/// Default public tier configuration.
pub const DEFAULT_GRIP_BPS: [u16; 4] = [6500, 3200, 1200, 400];
pub const DEFAULT_BUYBACK_BPS: [u16; 4] = [9000, 9200, 9500, 9500];
pub const DEFAULT_BULLSEYE_BONUS_BPS: u16 = 300;

/// Canonical MagicBlock Pyth Lazer republisher program (PriceUpdateV3 accounts).
pub const PRICE_ORACLE_PROGRAM_ID: Pubkey =
    pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");

/// Default oracle queue used when requesting randomness from an ER.
pub const DEFAULT_EPHEMERAL_QUEUE: Pubkey =
    pubkey!("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
/// Base-layer oracle queue (regular priority).
pub const DEFAULT_QUEUE: Pubkey = pubkey!("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
/// Localnet / MagicSVM test queues.
pub const DEFAULT_TEST_QUEUE: Pubkey = pubkey!("GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb");
pub const DEFAULT_EPHEMERAL_TEST_QUEUE: Pubkey =
    pubkey!("Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT");

/// Escrow index used by `ActionArgs::new` (255) for Magic Action escrow PDAs.
pub const ACTION_ESCROW_INDEX: u8 = 255;
