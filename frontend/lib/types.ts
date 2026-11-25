import { PublicKey } from "@solana/web3.js";

export type SessionState = "Idle" | "Steering" | "AwaitingVrf" | "WonPendingChoice";

export type LastOutcome = "None" | "Miss" | "Slipped" | "Won" | "SoldBack" | "Claimed";

export interface PrizeSlot {
  slotId: number;
  tier: number;
  x: number;
  z: number;
  prizeMint: PublicKey;
  prizeAmount: bigint;
  prizeDecimals: number;
  priceFeed: PublicKey;
  fallbackBuybackUsdc: bigint;
  inStock: boolean;
  reserved: boolean;
  name?: string;
  symbol?: string;
  icon?: string;
  image?: string;
}

export interface MachineConfigData {
  machineId: bigint;
  admin: PublicKey;
  usdcMint: PublicKey;
  playFeeUsdc: bigint;
  gripBps: number[];
  buybackBps: number[];
  bullseyeBonusBps: number;
  captureRadius: number;
  bullseyeRadius: number;
  playDurationSecs: bigint;
  totalPlays: bigint;
  totalWins: bigint;
  slots: PrizeSlot[];
  bump: number;
  isDelegated?: boolean;
}

export interface PlayerSessionData {
  machine: PublicKey;
  owner: PublicKey;
  sessionKey: PublicKey;
  sessionExpiry: bigint;
  usdcBalance: bigint;
  cumulativeDepositedUsdc: bigint;
  cumulativeWithdrawnUsdc: bigint;
  clawX: number;
  clawZ: number;
  state: SessionState;
  playExpiresAt: bigint;
  targetSlot: number;
  isBullseye: boolean;
  lastVrfRoll: number;
  lastOutcome: LastOutcome;
  claimNonce: bigint;
  pendingClaimMint: PublicKey;
  pendingClaimAmount: bigint;
  vrfRequestNonce: bigint;
  playsCount: bigint;
  winsCount: bigint;
  bump: number;
  isDelegated?: boolean;
}

export interface WonPrizeInfo {
  slotId: number;
  tier: number;
  tierName: string;
  name: string;
  symbol: string;
  icon: string;
  image?: string;
  amount: string;
  isNft?: boolean;
  mint: string;
  isBullseye: boolean;
  vrfRoll: number;
  effectiveOddsBps: number;
  livePriceUsd: number;
  sellBackUsdc: number;
}

export interface TelemetryStats {
  erLatencyMs: number;
  erEndpoint: string;
  isDelegated: boolean;
  vrfStatus: "Ready" | "Rolling" | "Fulfilled" | "Missed";
  pythStatus: "Live" | "Syncing";
  lastTxSignature?: string;
}
