import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "9MPCK9ic71C2pdoTYMz91CSpYppiuVKMTTNWoTKgv3MW",
);

export const HELIUS_RPC_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc`
    : process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const MACHINE_ID = BigInt(process.env.NEXT_PUBLIC_MACHINE_ID || "42");

export const ROUTER_ENDPOINT =
  process.env.NEXT_PUBLIC_ROUTER_ENDPOINT ||
  "https://devnet-router.magicblock.app/";

export const EPHEMERAL_PROVIDER_ENDPOINT =
  process.env.NEXT_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ||
  "https://devnet-as.magicblock.app/";

export const EPHEMERAL_WS_ENDPOINT =
  process.env.NEXT_PUBLIC_EPHEMERAL_WS_ENDPOINT ||
  "wss://devnet-as.magicblock.app/";

export const DELEGATION_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_DELEGATION_PROGRAM_ID ||
    "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111",
);

export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111",
);

export const DEFAULT_EPHEMERAL_QUEUE = new PublicKey(
  process.env.NEXT_PUBLIC_VRF_QUEUE ||
    "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc",
);

export const VRF_PROGRAM_ID = new PublicKey(
  "Vrf1111111111111111111111111111111111111111",
);

export const PRICE_ORACLE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PYTH_ORACLE_PROGRAM_ID ||
    "PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd",
);

// PDA Seeds
export const MACHINE_SEED = new TextEncoder().encode("machine");
export const SESSION_SEED = new TextEncoder().encode("session");
export const LEDGER_SEED = new TextEncoder().encode("ledger");
export const VAULT_AUTHORITY_SEED = new TextEncoder().encode("vault_authority");

// Coordinate limits & Constants
export const PLAYFIELD_MAX = 1000;
export const SPAWN_X = 500;
export const SPAWN_Z = 500;
export const MAX_STEP = 40;
export const CAPTURE_RADIUS = 65;
export const BULLSEYE_RADIUS = 25;
export const PLAY_DURATION_SECS = 15;
export const USDC_DECIMALS = 6;
export const PLAY_FEE_USDC = 1_000_000; // $1.00 USDC

// Default Tier Configurations
export interface PrizeTierConfig {
  tier: number;
  name: string;
  badge: string;
  color: string;
  glow: string;
  baseGripBps: number;
  buybackBps: number;
  oddsLabel: string;
  buybackLabel: string;
  desc: string;
}

export const PRIZE_TIERS: PrizeTierConfig[] = [
  {
    tier: 0,
    name: "Common",
    badge: "Matte Neon Cyan",
    color: "#22d3ee",
    glow: "0 0 16px rgba(34, 211, 238, 0.6)",
    baseGripBps: 6500,
    buybackBps: 9000,
    oddsLabel: "65%",
    buybackLabel: "90%",
    desc: "Micro SPL Packs (BONK / WIF)",
  },
  {
    tier: 1,
    name: "Rare",
    badge: "Metallic Purple",
    color: "#c084fc",
    glow: "0 0 18px rgba(192, 132, 252, 0.65)",
    baseGripBps: 3200,
    buybackBps: 9200,
    oddsLabel: "32%",
    buybackLabel: "92%",
    desc: "Mid SPL Packs (JUP / SOL)",
  },
  {
    tier: 2,
    name: "Epic",
    badge: "Holo Prism Cube",
    color: "#f472b6",
    glow: "0 0 20px rgba(244, 114, 182, 0.7)",
    baseGripBps: 1200,
    buybackBps: 9500,
    oddsLabel: "12%",
    buybackLabel: "95%",
    desc: "Collector NFTs / 0.15 SOL Pack",
  },
  {
    tier: 3,
    name: "Grail",
    badge: "Floating Gold Crown",
    color: "#fbbf24",
    glow: "0 0 24px rgba(251, 191, 36, 0.8)",
    baseGripBps: 400,
    buybackBps: 9500,
    oddsLabel: "4%",
    buybackLabel: "95%",
    desc: "0.5+ SOL / Rare Arcade Grail Collectible",
  },
];

export const DEAD_CENTER_BONUS_BPS = 300; // +3%
