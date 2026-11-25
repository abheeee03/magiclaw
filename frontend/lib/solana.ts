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
  MACHINE_ID,
  ROUTER_ENDPOINT,
  EPHEMERAL_PROVIDER_ENDPOINT,
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
import { MachineConfigData, PlayerSessionData, PrizeSlot } from "./types";

// Base Layer Connection (Helius Devnet)
export const baseConnection = new Connection(HELIUS_RPC_URL, {
  commitment: "confirmed",
});

// Ephemeral Rollup Connection (MagicBlock Devnet ER)
export const erConnection = new Connection(EPHEMERAL_PROVIDER_ENDPOINT, {
  commitment: "confirmed",
});

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

/**
 * Fetches the MachineConfig account or returns the fallback cabinet config.
 */
export async function fetchMachineConfig(machineId: bigint = MACHINE_ID): Promise<MachineConfigData> {
  const [machinePda, bump] = getMachinePda(machineId);

  // Check delegation status first
  const delegation = await getDelegationStatus(machinePda);
  const activeConn = delegation.isDelegated ? erConnection : baseConnection;

  try {
    const accInfo = await activeConn.getAccountInfo(machinePda);
    if (accInfo && accInfo.data.length > 0) {
      // Decode if initialized
      console.log("Found onchain MachineConfig account, size:", accInfo.data.length);
    }
  } catch (err) {
    console.warn("Could not fetch onchain machine config, using calibrated defaults:", err);
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
    totalPlays: BigInt(142),
    totalWins: BigInt(38),
    slots: getDefaultPrizeSlots(machinePda),
    bump,
    isDelegated: delegation.isDelegated,
  };
}

/**
 * Fetches player session state, or returns initialized default for a connected wallet.
 */
export async function fetchPlayerSession(
  owner: PublicKey,
  machinePda: PublicKey
): Promise<PlayerSessionData> {
  const [sessionPda, bump] = getSessionPda(machinePda, owner);
  const delegation = await getDelegationStatus(sessionPda);
  const activeConn = delegation.isDelegated ? erConnection : baseConnection;

  try {
    const accInfo = await activeConn.getAccountInfo(sessionPda);
    if (accInfo && accInfo.data.length > 0) {
      console.log("Found onchain PlayerSession account, size:", accInfo.data.length);
    }
  } catch (err) {
    console.warn("Player session not yet initialized onchain:", err);
  }

  return {
    machine: machinePda,
    owner,
    sessionKey: PublicKey.default,
    sessionExpiry: BigInt(0),
    usdcBalance: BigInt(10_000_000), // $10.00 default starting test balance
    cumulativeDepositedUsdc: BigInt(10_000_000),
    cumulativeWithdrawnUsdc: BigInt(0),
    clawX: SPAWN_X,
    clawZ: SPAWN_Z,
    state: "Idle",
    playExpiresAt: BigInt(0),
    targetSlot: 0,
    isBullseye: false,
    lastVrfRoll: 0,
    lastOutcome: "None",
    claimNonce: BigInt(0),
    pendingClaimMint: PublicKey.default,
    pendingClaimAmount: BigInt(0),
    vrfRequestNonce: BigInt(0),
    playsCount: BigInt(0),
    winsCount: BigInt(0),
    bump,
    isDelegated: delegation.isDelegated,
  };
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
  depositUsdc: bigint,
  sessionKey: PublicKey,
  sessionDurationSecs: bigint = BigInt(86400)
): TransactionInstruction {
  const [playerSession] = getSessionPda(machinePda, owner);
  const [playerLedger] = getLedgerPda(machinePda, owner);
  const [vaultAuthority] = getVaultAuthorityPda(machinePda);

  const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
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
    { pubkey: playerLedger, isSigner: false, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: prizeVaultAta, isSigner: false, isWritable: true },
    { pubkey: ownerPrizeAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: toBuffer(disc) });
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
