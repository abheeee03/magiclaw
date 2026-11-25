import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  PROGRAM_ID,
} from "./constants";
import {
  getMachinePda,
  getVaultAuthorityPda,
  u64ToLeBytes,
} from "./pda";
import {
  baseConnection,
  decodeMachineConfig,
  erConnection,
  getDelegationStatus,
} from "./solana";
import { MachineConfigData } from "./types";

export { decodeMachineConfig };

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface WalletTokenInfo {
  mint: string;
  ata: string;
  amountRaw: bigint;
  decimals: number;
  uiAmount: string;
}

function toBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Fetches and decodes the real onchain MachineConfig account (returns null if uninitialized).
 */
export async function fetchOnchainMachineConfig(
  machineId: bigint
): Promise<MachineConfigData | null> {
  const [machinePda] = getMachinePda(machineId);
  const delegation = await getDelegationStatus(machinePda);
  const conn = delegation.isDelegated ? erConnection : baseConnection;

  const info = await conn.getAccountInfo(machinePda);
  if (!info || info.data.length < 1559) {
    if (delegation.isDelegated) {
      const l1Info = await baseConnection.getAccountInfo(machinePda);
      if (l1Info && l1Info.data.length >= 1559) {
        return decodeMachineConfig(l1Info.data, true);
      }
    }
    return null;
  }

  return decodeMachineConfig(info.data, delegation.isDelegated);
}

/**
 * Fetches SPL token balance (raw base units) for an owner + mint.
 */
export async function fetchTokenBalance(
  owner: PublicKey,
  mint: PublicKey,
  allowOwnerOffCurve = false
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve);
  const info = await baseConnection.getAccountInfo(ata);
  if (!info || info.data.length < 72) return BigInt(0);
  const view = new DataView(
    info.data.buffer,
    info.data.byteOffset,
    info.data.byteLength
  );
  return view.getBigUint64(64, true);
}

/**
 * Lists all SPL token accounts owned by a wallet on Devnet.
 */
export async function fetchWalletTokenAccounts(
  owner: PublicKey
): Promise<WalletTokenInfo[]> {
  const res = await baseConnection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });
  return res.value
    .map((item) => {
      const parsed = item.account.data.parsed?.info;
      if (!parsed) return null;
      return {
        mint: parsed.mint as string,
        ata: item.pubkey.toBase58(),
        amountRaw: BigInt(parsed.tokenAmount.amount as string),
        decimals: parsed.tokenAmount.decimals as number,
        uiAmount: (parsed.tokenAmount.uiAmountString as string) || "0",
      };
    })
    .filter((x): x is WalletTokenInfo => x !== null);
}

/**
 * Builds the `initialize_machine` instruction on Solana L1.
 */
export function createInitializeMachineIx(params: {
  admin: PublicKey;
  machineId: bigint;
  usdcMint: PublicKey;
  playFeeUsdc: bigint;
  gripBps: [number, number, number, number];
  buybackBps: [number, number, number, number];
  bullseyeBonusBps: number;
  captureRadius: number;
  bullseyeRadius: number;
  playDurationSecs: bigint;
}): TransactionInstruction {
  const [machineConfig] = getMachinePda(params.machineId);
  const [vaultAuthority] = getVaultAuthorityPda(machineConfig);
  const usdcVault = getAssociatedTokenAddressSync(
    params.usdcMint,
    vaultAuthority,
    true
  );

  // Discriminator: [61, 88, 18, 21, 148, 196, 155, 32]
  const data = new Uint8Array(8 + 8 + 8 + 8 + 8 + 2 + 2 + 2 + 8);
  data.set([61, 88, 18, 21, 148, 196, 155, 32], 0);
  const view = new DataView(data.buffer);
  let o = 8;
  view.setBigUint64(o, params.machineId, true);
  o += 8;
  view.setBigUint64(o, params.playFeeUsdc, true);
  o += 8;
  for (let i = 0; i < 4; i++) {
    view.setUint16(o, params.gripBps[i], true);
    o += 2;
  }
  for (let i = 0; i < 4; i++) {
    view.setUint16(o, params.buybackBps[i], true);
    o += 2;
  }
  view.setUint16(o, params.bullseyeBonusBps, true);
  o += 2;
  view.setUint16(o, params.captureRadius, true);
  o += 2;
  view.setUint16(o, params.bullseyeRadius, true);
  o += 2;
  view.setBigInt64(o, params.playDurationSecs, true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.admin, isSigner: true, isWritable: true },
      { pubkey: machineConfig, isSigner: false, isWritable: true },
      { pubkey: params.usdcMint, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds the `stock_prize_slot` instruction on Solana L1.
 */
export function createStockPrizeSlotIx(params: {
  admin: PublicKey;
  machineId: bigint;
  prizeMint: PublicKey;
  slotId: number;
  tier: number;
  x: number;
  z: number;
  prizeAmount: bigint;
  priceFeed?: PublicKey;
  fallbackBuybackUsdc: bigint;
}): TransactionInstruction {
  const [machineConfig] = getMachinePda(params.machineId);
  const [vaultAuthority] = getVaultAuthorityPda(machineConfig);
  const adminPrizeAta = getAssociatedTokenAddressSync(
    params.prizeMint,
    params.admin
  );
  const prizeVault = getAssociatedTokenAddressSync(
    params.prizeMint,
    vaultAuthority,
    true
  );

  // Discriminator: [22, 45, 80, 186, 134, 232, 233, 244]
  const data = new Uint8Array(8 + 1 + 1 + 2 + 2 + 8 + 32 + 8);
  data.set([22, 45, 80, 186, 134, 232, 233, 244], 0);
  const view = new DataView(data.buffer);
  let o = 8;
  data[o] = params.slotId;
  o += 1;
  data[o] = params.tier;
  o += 1;
  view.setUint16(o, params.x, true);
  o += 2;
  view.setUint16(o, params.z, true);
  o += 2;
  view.setBigUint64(o, params.prizeAmount, true);
  o += 8;
  const feed = params.priceFeed ?? PublicKey.default;
  data.set(feed.toBytes(), o);
  o += 32;
  view.setBigUint64(o, params.fallbackBuybackUsdc, true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.admin, isSigner: true, isWritable: true },
      { pubkey: machineConfig, isSigner: false, isWritable: true },
      { pubkey: params.prizeMint, isSigner: false, isWritable: false },
      { pubkey: adminPrizeAta, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: prizeVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds the `fund_usdc_liquidity` instruction on Solana L1.
 */
export function createFundUsdcLiquidityIx(params: {
  admin: PublicKey;
  machineId: bigint;
  usdcMint: PublicKey;
  amountUsdc: bigint;
}): TransactionInstruction {
  const [machineConfig] = getMachinePda(params.machineId);
  const [vaultAuthority] = getVaultAuthorityPda(machineConfig);
  const adminUsdcAta = getAssociatedTokenAddressSync(
    params.usdcMint,
    params.admin
  );
  const usdcVault = getAssociatedTokenAddressSync(
    params.usdcMint,
    vaultAuthority,
    true
  );

  // Discriminator: [162, 80, 182, 67, 75, 180, 229, 90]
  const data = new Uint8Array(8 + 8);
  data.set([162, 80, 182, 67, 75, 180, 229, 90], 0);
  new DataView(data.buffer).setBigUint64(8, params.amountUsdc, true);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.admin, isSigner: true, isWritable: true },
      { pubkey: machineConfig, isSigner: false, isWritable: false },
      { pubkey: adminUsdcAta, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds the `delegate_machine` instruction on Solana L1.
 */
export function createDelegateMachineIx(
  admin: PublicKey,
  machineId: bigint
): TransactionInstruction {
  const [machineConfig] = getMachinePda(machineId);
  const encoder = new TextEncoder();

  // Exact PDAs per magiclaw IDL for delegate_machine:
  const [bufferMachineConfig] = PublicKey.findProgramAddressSync(
    [encoder.encode("buffer"), machineConfig.toBytes()],
    PROGRAM_ID
  );
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [encoder.encode("delegation"), machineConfig.toBytes()],
    DELEGATION_PROGRAM_ID
  );
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [encoder.encode("delegation-metadata"), machineConfig.toBytes()],
    DELEGATION_PROGRAM_ID
  );

  // Discriminator: [201, 113, 190, 89, 83, 131, 32, 159]
  const data = new Uint8Array(8 + 8);
  data.set([201, 113, 190, 89, 83, 131, 32, 159], 0);
  data.set(u64ToLeBytes(machineId), 8);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: bufferMachineConfig, isSigner: false, isWritable: true },
      { pubkey: delegationRecord, isSigner: false, isWritable: true },
      { pubkey: delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: machineConfig, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds the `undelegate_machine` instruction on MagicBlock ER.
 */
export function createUndelegateMachineIx(
  admin: PublicKey,
  machineId: bigint
): TransactionInstruction {
  const [machineConfig] = getMachinePda(machineId);
  // Discriminator: [234, 56, 241, 187, 1, 106, 15, 192]
  const disc = new Uint8Array([234, 56, 241, 187, 1, 106, 15, 192]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: machineConfig, isSigner: false, isWritable: true },
      { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ],
    data: toBuffer(disc),
  });
}

function encodeBorshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

/**
 * Builds Metaplex Token Metadata `CreateMetadataAccountV3` (ix index 33)
 * so Devnet SPL tokens and NFTs display real names, symbols, and metadata URIs in wallets.
 */
export function createCreateMetadataV3Ix(params: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints?: number;
  isMutable?: boolean;
}): TransactionInstruction {
  const encoder = new TextEncoder();
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      encoder.encode("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      params.mint.toBytes(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const nameBytes = encodeBorshString(params.name.slice(0, 32));
  const symbolBytes = encodeBorshString(params.symbol.slice(0, 10));
  const uriBytes = encodeBorshString(params.uri.slice(0, 200));

  // Borsh layout for CreateMetadataAccountV3:
  // u8 discriminator (33)
  // DataV2 { name, symbol, uri, seller_fee_basis_points: u16, creators: Option (0), collection: Option (0), uses: Option (0) }
  // is_mutable: bool
  // collection_details: Option (0)
  const totalLen =
    1 +
    nameBytes.length +
    symbolBytes.length +
    uriBytes.length +
    2 + // seller_fee_basis_points
    1 + // creators: None
    1 + // collection: None
    1 + // uses: None
    1 + // is_mutable
    1; // collection_details: None

  const data = new Uint8Array(totalLen);
  let o = 0;
  data[o++] = 33; // CreateMetadataAccountV3
  data.set(nameBytes, o);
  o += nameBytes.length;
  data.set(symbolBytes, o);
  o += symbolBytes.length;
  data.set(uriBytes, o);
  o += uriBytes.length;
  new DataView(data.buffer).setUint16(o, params.sellerFeeBasisPoints ?? 0, true);
  o += 2;
  data[o++] = 0; // creators: None
  data[o++] = 0; // collection: None
  data[o++] = 0; // uses: None
  data[o++] = params.isMutable === false ? 0 : 1;
  data[o++] = 0; // collection_details: None

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds Metaplex Token Metadata `CreateMasterEditionV3` (ix index 17) for 1/1 NFTs.
 */
export function createCreateMasterEditionV3Ix(params: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
}): TransactionInstruction {
  const encoder = new TextEncoder();
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      encoder.encode("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      params.mint.toBytes(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  const [editionPda] = PublicKey.findProgramAddressSync(
    [
      encoder.encode("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      params.mint.toBytes(),
      encoder.encode("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  // u8 discriminator (17) + Option<u64> max_supply = Some(0) -> [1, 0..0 (8 bytes)]
  const data = new Uint8Array(1 + 1 + 8);
  data[0] = 17;
  data[1] = 1; // Some(0)

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: editionPda, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.updateAuthority, isSigner: true, isWritable: false },
      { pubkey: params.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: toBuffer(data),
  });
}

/**
 * Builds Metaplex Token Metadata `UpdateMetadataAccountV2` (ix index 15)
 * to update name, symbol, or metadata JSON URI on an existing mutable mint.
 */
export function createUpdateMetadataV2Ix(params: {
  mint: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints?: number;
}): TransactionInstruction {
  const encoder = new TextEncoder();
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      encoder.encode("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBytes(),
      params.mint.toBytes(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const nameBytes = encodeBorshString(params.name.slice(0, 32));
  const symbolBytes = encodeBorshString(params.symbol.slice(0, 10));
  const uriBytes = encodeBorshString(params.uri.slice(0, 200));

  const totalLen =
    1 + // ix index 15
    1 + // Option<DataV2> = Some(1)
    nameBytes.length +
    symbolBytes.length +
    uriBytes.length +
    2 + // seller_fee_basis_points
    1 + // creators: None
    1 + // collection: None
    1 + // uses: None
    1 + // new_update_authority: None
    1 + // primary_sale_happened: None
    1; // is_mutable: None

  const data = new Uint8Array(totalLen);
  let o = 0;
  data[o++] = 15; // UpdateMetadataAccountV2
  data[o++] = 1; // Some(DataV2)
  data.set(nameBytes, o);
  o += nameBytes.length;
  data.set(symbolBytes, o);
  o += symbolBytes.length;
  data.set(uriBytes, o);
  o += uriBytes.length;
  new DataView(data.buffer).setUint16(o, params.sellerFeeBasisPoints ?? 0, true);
  o += 2;
  data[o++] = 0; // creators: None
  data[o++] = 0; // collection: None
  data[o++] = 0; // uses: None
  data[o++] = 0; // new_update_authority: None
  data[o++] = 0; // primary_sale_happened: None
  data[o++] = 0; // is_mutable: None

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: params.updateAuthority, isSigner: true, isWritable: false },
    ],
    data: toBuffer(data),
  });
}
