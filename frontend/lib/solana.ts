import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PROGRAM_ID,
  HELIUS_RPC_URL,
  SOLANA_WS_URL,
  MACHINE_ID,
  ROUTER_ENDPOINT,
  EPHEMERAL_PROVIDER_ENDPOINT,
  EPHEMERAL_WS_ENDPOINT,
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  DEFAULT_EPHEMERAL_QUEUE,
  VRF_PROGRAM_ID,
  PLAY_FEE_USDC,
  SPAWN_X,
  SPAWN_Z,
} from "./constants";
import {
  getMachinePda,
  getSessionPda,
  getLedgerPda,
  getVaultAuthorityPda,
  getProgramIdentityPda,
  getDelegationBufferPda,
  getDelegationRecordPda,
  getDelegationMetadataPda,
} from "./pda";
import {
  LastOutcome,
  MachineConfigData,
  PlayerSessionData,
  PrizeSlot,
  SessionState,
} from "./types";
import { fetchOnchainPrizeMetadata } from "./metadata";

// Base Layer Connection (Proxied via /api/rpc; WS uses NEXT_PUBLIC_SOLANA_WS_URL with Devnet fallback)
export const baseConnection = new Connection(HELIUS_RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: SOLANA_WS_URL,
});

// Ephemeral Rollup Connection (MagicBlock Devnet ER)
export const erConnection = new Connection(EPHEMERAL_PROVIDER_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: EPHEMERAL_WS_ENDPOINT,
});

/**
 * Confirms a transaction via HTTP polling (`getSignatureStatuses`) so confirmation
 * never hangs or fails on browser WebSocket drops.
 */
export async function confirmTx(
  connection: Connection,
  signature: string,
  timeoutMs: number = 45_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = res.value[0];
    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Transaction confirmation timed out for ${signature}`);
}

export interface DelegationStatus {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: {
    authority: string;
    owner: string;
    delegationSlot: number;
    lamports: number;
  };
}

/**
 * Checks delegation status with the MagicBlock Router.
 */
export async function getDelegationStatus(account: PublicKey): Promise<DelegationStatus> {
  try {
    const res = await fetch(ROUTER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [account.toBase58()],
      }),
    });
    const json = await res.json();
    if (json?.result) {
      return json.result;
    }
  } catch (err) {
    console.warn("Failed to check delegation status with router:", err);
  }
  return { isDelegated: false };
}

/**
 * Generates default 16 prize slots across the 4 tiers for the arcade cabinet.
 */
export function getDefaultPrizeSlots(machinePda: PublicKey): PrizeSlot[] {
  const dummyMints = [
    new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"), // BONK
    new PublicKey("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"), // WIF
    new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), // JUP
    new PublicKey("So11111111111111111111111111111111111111112"), // WSOL
  ];

  const coords = [
    // --- Quadrant 1: Back-Left ---
    { x: 220, z: 220, tier: 0, name: "WIF Meme Pack", symbol: "WIF", amount: BigInt(2), icon: "🐕" },
    { x: 380, z: 180, tier: 0, name: "BONK Micro Pack", symbol: "BONK", amount: BigInt(10_000_000), icon: "🐶" },
    { x: 180, z: 420, tier: 1, name: "JUP Mid Bundle", symbol: "JUP", amount: BigInt(10), icon: "🪐" },

    // --- Quadrant 2: Back-Right ---
    { x: 620, z: 190, tier: 0, name: "BONK Mini Stack", symbol: "BONK", amount: BigInt(5_000_000), icon: "🐶" },
    { x: 800, z: 240, tier: 1, name: "0.05 SOL Starter", symbol: "SOL", amount: BigInt(50_000_000), icon: "⚡" },
    { x: 820, z: 440, tier: 0, name: "BONK Turbo Pack", symbol: "BONK", amount: BigInt(15_000_000), icon: "🐶" },
    { x: 640, z: 360, tier: 1, name: "0.08 SOL Booster", symbol: "SOL", amount: BigInt(80_000_000), icon: "⚡" },

    // --- Center Stage & Rings ---
    { x: 500, z: 500, tier: 3, name: "Solana Gold Crown", symbol: "CROWN", amount: BigInt(1), icon: "👑" },
    { x: 340, z: 380, tier: 2, name: "0.15 SOL Prize Pack", symbol: "SOL", amount: BigInt(150_000_000), icon: "💎" },
    { x: 500, z: 320, tier: 1, name: "JUP Vault Box", symbol: "JUP", amount: BigInt(20), icon: "🪐" },
    { x: 660, z: 540, tier: 2, name: "Cyber Claw NFT Pass", symbol: "CROWN", amount: BigInt(1), icon: "🔮" },

    // --- Quadrant 3: Front-Right & Mid-Front ---
    { x: 800, z: 680, tier: 0, name: "WIF Micro Drop", symbol: "WIF", amount: BigInt(1), icon: "🧢" },
    { x: 620, z: 740, tier: 1, name: "JUP Swap Chest", symbol: "JUP", amount: BigInt(15), icon: "🪐" },
    { x: 420, z: 720, tier: 2, name: "0.20 SOL High Roller", symbol: "SOL", amount: BigInt(200_000_000), icon: "💎" },

    // --- Quadrant 4: Center-Left & Jackpot ---
    { x: 330, z: 550, tier: 3, name: "0.50 SOL Mega Grail", symbol: "SOL", amount: BigInt(500_000_000), icon: "🏆" },
    { x: 480, z: 620, tier: 3, name: "1.00 SOL Ultra Jackpot", symbol: "SOL", amount: BigInt(1_000_000_000), icon: "🌟" },
  ];

  return coords.map((c, i) => ({
    slotId: i,
    tier: c.tier,
    x: c.x,
    z: c.z,
    prizeMint: dummyMints[c.tier % dummyMints.length],
    prizeAmount: c.amount,
    prizeDecimals: 6,
    priceFeed: PublicKey.default,
    fallbackBuybackUsdc: BigInt(c.tier === 0 ? 900_000 : c.tier === 1 ? 4_500_000 : c.tier === 2 ? 15_000_000 : 50_000_000),
    inStock: true,
    reserved: false,
    name: c.name,
    symbol: c.symbol,
    icon: c.icon,
  }));
}

const SESSION_STATES: SessionState[] = [
  "Idle",
  "Steering",
  "AwaitingVrf",
  "WonPendingChoice",
];

const LAST_OUTCOMES: LastOutcome[] = [
  "None",
  "Miss",
  "Slipped",
  "Won",
  "SoldBack",
  "Claimed",
];

function getSavedMintMetaMap(): Record<
  string,
  { name: string; symbol: string; isNft?: boolean }
> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("clawvault_admin_mints_v1");
    if (!raw) return {};
    const list = JSON.parse(raw) as Array<{
      mint: string;
      name: string;
      symbol: string;
      isNft?: boolean;
    }>;
    const map: Record<string, { name: string; symbol: string; isNft?: boolean }> = {};
    for (const item of list) map[item.mint] = item;
    return map;
  } catch {
    return {};
  }
}

function enrichSlotDisplay(slot: PrizeSlot): PrizeSlot {
  const tierIcons = ["🪙", "💎", "🔮", "👑"];
  const tierSymbols = ["SPL", "RARE", "EPIC", "NFT"];
  const mintStr = slot.prizeMint.toBase58();
  const saved = getSavedMintMetaMap()[mintStr];
  const isNft = slot.prizeDecimals === 0 && slot.prizeAmount === BigInt(1);

  return {
    ...slot,
    name:
      saved?.name ||
      (isNft
        ? `Devnet NFT #${slot.slotId}`
        : `Devnet ${tierSymbols[slot.tier] || "SPL"} #${slot.slotId}`),
    symbol: saved?.symbol || (isNft ? "NFT" : tierSymbols[slot.tier] || "SPL"),
    icon: isNft ? "👑" : tierIcons[slot.tier] || "🪙",
  };
}

/**
 * Decodes an onchain MachineConfig account from raw Anchor account bytes.
 */
export function decodeMachineConfig(
  data: Uint8Array,
  isDelegated: boolean = false
): MachineConfigData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8; // skip 8-byte Anchor discriminator

  const machineId = view.getBigUint64(offset, true);
  offset += 8;

  const admin = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const usdcMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const playFeeUsdc = view.getBigUint64(offset, true);
  offset += 8;

  const gripBps: number[] = [];
  for (let i = 0; i < 4; i++) {
    gripBps.push(view.getUint16(offset, true));
    offset += 2;
  }

  const buybackBps: number[] = [];
  for (let i = 0; i < 4; i++) {
    buybackBps.push(view.getUint16(offset, true));
    offset += 2;
  }

  const bullseyeBonusBps = view.getUint16(offset, true);
  offset += 2;

  const captureRadius = view.getUint16(offset, true);
  offset += 2;

  const bullseyeRadius = view.getUint16(offset, true);
  offset += 2;

  const playDurationSecs = view.getBigInt64(offset, true);
  offset += 8;

  const totalPlays = view.getBigUint64(offset, true);
  offset += 8;

  const totalWins = view.getBigUint64(offset, true);
  offset += 8;

  const slots: PrizeSlot[] = [];
  for (let i = 0; i < 16; i++) {
    offset += 1; // slot_id (we always use index i)
    const tier = data[offset];
    offset += 1;
    const x = view.getUint16(offset, true);
    offset += 2;
    const z = view.getUint16(offset, true);
    offset += 2;
    const prizeMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const prizeAmount = view.getBigUint64(offset, true);
    offset += 8;
    const prizeDecimals = data[offset];
    offset += 1;
    const priceFeed = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const fallbackBuybackUsdc = view.getBigUint64(offset, true);
    offset += 8;
    const inStock = data[offset] === 1;
    offset += 1;
    const reserved = data[offset] === 1;
    offset += 1;

    slots.push(
      enrichSlotDisplay({
        slotId: i,
        tier,
        x,
        z,
        prizeMint,
        prizeAmount,
        prizeDecimals,
        priceFeed,
        fallbackBuybackUsdc,
        inStock,
        reserved,
      })
    );
  }

  const bump = data[offset];

  return {
    machineId,
    admin,
    usdcMint,
    playFeeUsdc,
    gripBps,
    buybackBps,
    bullseyeBonusBps,
    captureRadius,
    bullseyeRadius,
    playDurationSecs,
    totalPlays,
    totalWins,
    slots,
    bump,
    isDelegated,
  };
}

/**
 * Decodes an onchain PlayerSession account from raw Anchor account bytes.
 */
export function decodePlayerSession(
  data: Uint8Array,
  isDelegated: boolean = false
): PlayerSessionData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8; // discriminator

  const machine = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const sessionKey = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const sessionExpiry = view.getBigInt64(offset, true);
  offset += 8;
  const usdcBalance = view.getBigUint64(offset, true);
  offset += 8;
  const cumulativeDepositedUsdc = view.getBigUint64(offset, true);
  offset += 8;
  const cumulativeWithdrawnUsdc = view.getBigUint64(offset, true);
  offset += 8;
  const clawX = view.getUint16(offset, true);
  offset += 2;
  const clawZ = view.getUint16(offset, true);
  offset += 2;
  const state = SESSION_STATES[data[offset]] ?? "Idle";
  offset += 1;
  const playExpiresAt = view.getBigInt64(offset, true);
  offset += 8;
  const targetSlot = data[offset];
  offset += 1;
  const isBullseye = data[offset] === 1;
  offset += 1;
  const lastVrfRoll = view.getUint16(offset, true);
  offset += 2;
  const lastOutcome = LAST_OUTCOMES[data[offset]] ?? "None";
  offset += 1;
  const claimNonce = view.getBigUint64(offset, true);
  offset += 8;
  const pendingClaimMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const pendingClaimAmount = view.getBigUint64(offset, true);
  offset += 8;
  const vrfRequestNonce = view.getBigUint64(offset, true);
  offset += 8;
  const playsCount = view.getBigUint64(offset, true);
  offset += 8;
  const winsCount = view.getBigUint64(offset, true);
  offset += 8;
  const bump = data[offset];

  return {
    machine,
    owner,
    sessionKey,
    sessionExpiry,
    usdcBalance,
    cumulativeDepositedUsdc,
    cumulativeWithdrawnUsdc,
    clawX,
    clawZ,
    state,
    playExpiresAt,
    targetSlot,
    isBullseye,
    lastVrfRoll,
    lastOutcome,
    claimNonce,
    pendingClaimMint,
    pendingClaimAmount,
    vrfRequestNonce,
    playsCount,
    winsCount,
    bump,
    isDelegated,
  };
}

/**
 * Fetches and decodes the real onchain MachineConfig account, falling back to defaults if uninitialized.
 */
export async function fetchMachineConfig(
  machineId: bigint = MACHINE_ID
): Promise<MachineConfigData> {
  const [machinePda, bump] = getMachinePda(machineId);
  const delegation = await getDelegationStatus(machinePda);
  const activeConn = delegation.isDelegated ? erConnection : baseConnection;

  try {
    let decoded: MachineConfigData | null = null;
    const accInfo = await activeConn.getAccountInfo(machinePda);
    if (accInfo && accInfo.data.length >= 1559) {
      decoded = decodeMachineConfig(accInfo.data, delegation.isDelegated);
    } else if (delegation.isDelegated) {
      const l1Info = await baseConnection.getAccountInfo(machinePda);
      if (l1Info && l1Info.data.length >= 1559) {
        decoded = decodeMachineConfig(l1Info.data, true);
      }
    }

    if (decoded) {
      const stockedMints = decoded.slots
        .filter((s) => s.inStock)
        .map((s) => s.prizeMint);
      if (stockedMints.length > 0) {
        const metaMap = await fetchOnchainPrizeMetadata(stockedMints);
        decoded.slots = decoded.slots.map((slot) => {
          const meta = metaMap[slot.prizeMint.toBase58()];
          if (!meta) return slot;
          return {
            ...slot,
            name: meta.name || slot.name,
            symbol: meta.symbol || slot.symbol,
            image: meta.image,
          };
        });
      }
      return decoded;
    }
  } catch (err) {
    console.warn("Could not fetch onchain machine config, using fallback:", err);
  }

  return {
    machineId,
    admin: machinePda,
    usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    playFeeUsdc: BigInt(PLAY_FEE_USDC),
    gripBps: [6500, 3200, 1200, 400],
    buybackBps: [9000, 9200, 9500, 9500],
    bullseyeBonusBps: 300,
    captureRadius: 65,
    bullseyeRadius: 25,
    playDurationSecs: BigInt(15),
    totalPlays: BigInt(0),
    totalWins: BigInt(0),
    slots: getDefaultPrizeSlots(machinePda),
    bump,
    isDelegated: delegation.isDelegated,
  };
}

/**
 * Fetches and decodes the real onchain PlayerSession (returns null if not yet initialized).
 */
export async function fetchPlayerSession(
  owner: PublicKey,
  machinePda: PublicKey
): Promise<PlayerSessionData | null> {
  const [sessionPda] = getSessionPda(machinePda, owner);
  const delegation = await getDelegationStatus(sessionPda);
  const activeConn = delegation.isDelegated ? erConnection : baseConnection;

  try {
    const accInfo = await activeConn.getAccountInfo(sessionPda);
    if (accInfo && accInfo.data.length >= 210) {
      return decodePlayerSession(accInfo.data, delegation.isDelegated);
    }
    if (delegation.isDelegated) {
      const l1Info = await baseConnection.getAccountInfo(sessionPda);
      if (l1Info && l1Info.data.length >= 210) {
        return decodePlayerSession(l1Info.data, true);
      }
    }
  } catch (err) {
    console.warn("Player session not yet initialized onchain:", err);
  }

  return null;
}

/**
 * Polls MagicBlock ER until `PlayerSession.state` leaves `AwaitingVrf`.
 */
export async function waitForVrfResolution(
  owner: PublicKey,
  machinePda: PublicKey,
  expectedNonce: bigint,
  timeoutMs: number = 15_000
): Promise<PlayerSessionData | null> {
  const [sessionPda] = getSessionPda(machinePda, owner);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await erConnection.getAccountInfo(sessionPda);
    if (info && info.data.length >= 210) {
      const decoded = decodePlayerSession(info.data, true);
      if (
        decoded.vrfRequestNonce >= expectedNonce &&
        decoded.state !== "AwaitingVrf"
      ) {
        return decoded;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Polls Solana L1 until MagicBlock ER commits `PlayerSession.claimNonce >= expectedNonce`.
 */
export async function waitForL1ClaimCommit(
  owner: PublicKey,
  machinePda: PublicKey,
  expectedNonce: bigint,
  timeoutMs: number = 25_000
): Promise<boolean> {
  const [sessionPda] = getSessionPda(machinePda, owner);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await baseConnection.getAccountInfo(sessionPda);
    if (info && info.data.length >= 210) {
      const decoded = decodePlayerSession(info.data, true);
      if (decoded.claimNonce >= expectedNonce) {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

/**
 * Polls Solana L1 until `PlayerSession` owner returns from Delegation Program to `PROGRAM_ID`.
 */
export async function waitForSessionUndelegated(
  owner: PublicKey,
  machinePda: PublicKey,
  timeoutMs: number = 20_000
): Promise<boolean> {
  const [sessionPda] = getSessionPda(machinePda, owner);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await baseConnection.getAccountInfo(sessionPda);
    if (info && info.owner.equals(PROGRAM_ID)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

/**
 * Reads `PlayerLedger.last_claimed_nonce` on L1 to check if Magic Action already settled a claim.
 */
export async function fetchPlayerLedgerLastClaimedNonce(
  owner: PublicKey,
  machinePda: PublicKey
): Promise<bigint> {
  const [ledgerPda] = getLedgerPda(machinePda, owner);
  const info = await baseConnection.getAccountInfo(ledgerPda);
  if (!info || info.data.length < 96) return BigInt(0);
  // Layout: 8 (disc) + 32 (machine) + 32 (owner) + 8 (total_deposited) + 8 (total_withdrawn) + 8 (last_claimed_nonce)
  const view = new DataView(
    info.data.buffer,
    info.data.byteOffset,
    info.data.byteLength
  );
  return view.getBigUint64(88, true);
}

/**
 * Reads the player's L1 Test USDC wallet balance (in USD dollars).
 */
export async function fetchWalletUsdcBalance(
  owner: PublicKey,
  usdcMint: PublicKey
): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(usdcMint, owner);
    const info = await baseConnection.getAccountInfo(ata);
    if (!info || info.data.length < 72) return 0;
    const view = new DataView(
      info.data.buffer,
      info.data.byteOffset,
      info.data.byteLength
    );
    const raw = view.getBigUint64(64, true);
    return Number(raw) / 1_000_000;
  } catch {
    return 0;
  }
}

function toBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Builds the InitAndDepositSession instruction on L1.
 */
export function createInitAndDepositSessionIx(
  owner: PublicKey,
  machinePda: PublicKey,
  usdcMint: PublicKey,
  depositUsdc: bigint,
  sessionKey: PublicKey,
  sessionDurationSecs: bigint = BigInt(86400)
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);

  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vaultAuthority, true);

  // Discriminator: [215, 165, 221, 68, 10, 120, 100, 36]
  const disc = new Uint8Array([215, 165, 221, 68, 10, 120, 100, 36]);
  const data = new Uint8Array(8 + 8 + 32 + 8);
  data.set(disc, 0);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, BigInt(depositUsdc), true);
  data.set(sessionKey.toBytes(), 16);
  view.setBigInt64(48, BigInt(sessionDurationSecs), true);

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: machinePda, isSigner: false, isWritable: false },
    { pubkey: playerSession, isSigner: false, isWritable: true },
    { pubkey: playerLedger, isSigner: false, isWritable: true },
    { pubkey: ownerUsdcAta, isSigner: false, isWritable: true },
    { pubkey: usdcVault, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(data) });
}

/**
 * Builds the DelegateSession instruction on L1 to delegate player_session to MagicBlock ER.
 */
export function createDelegateSessionIx(
  owner: PublicKey,
  machinePda: PublicKey
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [buffer] = getDelegationBufferPda(playerSession);
  const [record] = getDelegationRecordPda(playerSession);
  const [metadata] = getDelegationMetadataPda(playerSession);

  // Discriminator: [82, 83, 119, 119, 196, 219, 5, 197]
  const disc = new Uint8Array([82, 83, 119, 119, 196, 219, 5, 197]);

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: machinePda, isSigner: false, isWritable: false },
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: record, isSigner: false, isWritable: true },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: playerSession, isSigner: false, isWritable: true },
    { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(disc) });
}

/**
 * Builds StartPlay instruction on ER (signed gaslessly by session key in 10ms).
 */
export function createStartPlayIx(
  signer: PublicKey,
  machinePda: PublicKey,
  owner: PublicKey
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);

  // Discriminator: [14, 135, 114, 204, 136, 215, 67, 129]
  const disc = new Uint8Array([14, 135, 114, 204, 136, 215, 67, 129]);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: false },
    { pubkey: machinePda, isSigner: false, isWritable: false },
    { pubkey: playerSession, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(disc) });
}

/**
 * Builds SteerClaw instruction on ER (dx, dz).
 */
export function createSteerClawIx(
  signer: PublicKey,
  machinePda: PublicKey,
  owner: PublicKey,
  dx: number,
  dz: number
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);

  // Discriminator: [72, 8, 196, 126, 244, 6, 153, 44]
  const disc = new Uint8Array([72, 8, 196, 126, 244, 6, 153, 44]);
  const data = new Uint8Array(8 + 2 + 2);
  data.set(disc, 0);
  const view = new DataView(data.buffer);
  view.setInt16(8, dx, true);
  view.setInt16(10, dz, true);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: false },
    { pubkey: playerSession, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(data) });
}

/**
 * Builds DropClaw instruction on ER (triggers MagicBlock VRF roll).
 */
export function createDropClawIx(
  signer: PublicKey,
  machinePda: PublicKey,
  owner: PublicKey,
  clientSeed: number = Math.floor(Math.random() * 255)
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [programIdentity] = getProgramIdentityPda();

  // Discriminator: [176, 101, 112, 189, 15, 40, 96, 244]
  const disc = new Uint8Array([176, 101, 112, 189, 15, 40, 96, 244]);
  const data = new Uint8Array(8 + 1);
  data.set(disc, 0);
  data[8] = clientSeed;

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: machinePda, isSigner: false, isWritable: true },
    { pubkey: playerSession, isSigner: false, isWritable: true },
    { pubkey: DEFAULT_EPHEMERAL_QUEUE, isSigner: false, isWritable: true },
    { pubkey: programIdentity, isSigner: false, isWritable: false },
    { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(data) });
}

/**
 * Builds SellBackPrize instruction on ER.
 */
export function createSellBackPrizeIx(
  signer: PublicKey,
  machinePda: PublicKey,
  owner: PublicKey,
  priceFeed: PublicKey = PublicKey.default
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);

  // Discriminator: [162, 253, 109, 103, 89, 66, 132, 21]
  const disc = new Uint8Array([162, 253, 109, 103, 89, 66, 132, 21]);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: false },
    { pubkey: machinePda, isSigner: false, isWritable: true },
    { pubkey: playerSession, isSigner: false, isWritable: true },
    { pubkey: priceFeed, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(disc) });
}

/**
 * Builds ClaimPrize instruction on ER (triggers Magic Action for L1 SPL transfer).
 */
export function createClaimPrizeIx(
  signer: PublicKey,
  machinePda: PublicKey,
  owner: PublicKey,
  prizeMint: PublicKey
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);

  const prizeVaultAta = getAssociatedTokenAddressSync(prizeMint, vaultAuthority, true);
  const ownerPrizeAta = getAssociatedTokenAddressSync(prizeMint, owner);

  // Discriminator: [157, 233, 139, 121, 246, 62, 234, 235]
  const disc = new Uint8Array([157, 233, 139, 121, 246, 62, 234, 235]);

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: machinePda, isSigner: false, isWritable: false },
    { pubkey: playerSession, isSigner: false, isWritable: true },
    { pubkey: playerLedger, isSigner: false, isWritable: false },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: prizeVaultAta, isSigner: false, isWritable: false },
    { pubkey: ownerPrizeAta, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(disc) });
}

/**
 * Builds `execute_l1_prize_claim` instruction on Solana L1 (permissionless finalizer).
 */
export function createExecuteL1PrizeClaimIx(
  machinePda: PublicKey,
  owner: PublicKey,
  prizeMint: PublicKey
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);

  const prizeVaultAta = getAssociatedTokenAddressSync(prizeMint, vaultAuthority, true);
  const ownerPrizeAta = getAssociatedTokenAddressSync(prizeMint, owner);

  // Discriminator: [180, 218, 166, 112, 103, 118, 2, 210]
  const disc = new Uint8Array([180, 218, 166, 112, 103, 118, 2, 210]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: machinePda, isSigner: false, isWritable: false },
      { pubkey: playerSession, isSigner: false, isWritable: false },
      { pubkey: playerLedger, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: prizeVaultAta, isSigner: false, isWritable: true },
      { pubkey: ownerPrizeAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: toBuffer(disc),
  });
}

/**
 * Builds `request_withdraw_and_undelegate` instruction on MagicBlock ER.
 */
export function createRequestWithdrawAndUndelegateIx(
  owner: PublicKey,
  machinePda: PublicKey,
  usdcMint: PublicKey,
  amountUsdc: bigint = BigInt(0)
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vaultAuthority, true);
  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);

  // Discriminator: [159, 154, 91, 237, 43, 133, 226, 184]
  const data = new Uint8Array(8 + 8);
  data.set([159, 154, 91, 237, 43, 133, 226, 184], 0);
  new DataView(data.buffer).setBigUint64(8, BigInt(amountUsdc), true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: playerSession, isSigner: false, isWritable: true },
      { pubkey: machinePda, isSigner: false, isWritable: false },
      { pubkey: playerLedger, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: usdcVault, isSigner: false, isWritable: false },
      { pubkey: ownerUsdcAta, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds `execute_l1_usdc_withdraw` instruction on Solana L1 (permissionless finalizer).
 */
export function createExecuteL1UsdcWithdrawIx(
  machinePda: PublicKey,
  owner: PublicKey,
  usdcMint: PublicKey
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vaultAuthority, true);
  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);

  // Discriminator: [48, 134, 32, 123, 133, 138, 144, 169]
  const disc = new Uint8Array([48, 134, 32, 123, 133, 138, 144, 169]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: machinePda, isSigner: false, isWritable: false },
      { pubkey: playerSession, isSigner: false, isWritable: false },
      { pubkey: playerLedger, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: ownerUsdcAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: toBuffer(disc),
  });
}

/**
 * Requests Devnet SOL airdrop via Helius RPC.
 */
export async function requestDevnetAirdrop(wallet: PublicKey): Promise<string> {
  const sig = await baseConnection.requestAirdrop(wallet, 1 * LAMPORTS_PER_SOL);
  const latestBh = await baseConnection.getLatestBlockhash();
  await baseConnection.confirmTransaction({
    signature: sig,
    blockhash: latestBh.blockhash,
    lastValidBlockHeight: latestBh.lastValidBlockHeight,
  });
  return sig;
}
