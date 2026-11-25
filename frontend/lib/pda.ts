import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  MACHINE_SEED,
  SESSION_SEED,
  LEDGER_SEED,
  VAULT_AUTHORITY_SEED,
  DELEGATION_PROGRAM_ID,
} from "./constants";

/**
 * Converts a 64-bit integer into an 8-byte little-endian Uint8Array.
 * Fully compatible with all browser runtimes without requiring Node Buffer extensions.
 */
export function u64ToLeBytes(value: bigint | number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return bytes;
}

/**
 * Derives the MachineConfig PDA for a given machine ID.
 */
export function getMachinePda(machineId: bigint, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  const buf = u64ToLeBytes(machineId);
  return PublicKey.findProgramAddressSync([MACHINE_SEED, buf], programId);
}

const encoder = new TextEncoder();
const IDENTITY_SEED = encoder.encode("identity");
const BUFFER_SEED = encoder.encode("buffer");
const DELEGATION_SEED = encoder.encode("delegation");
const METADATA_SEED = encoder.encode("delegation-metadata");

/**
 * Derives the PlayerSession PDA for a given machine and player wallet.
 */
export function getSessionPda(
  machinePda: PublicKey,
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SESSION_SEED, machinePda.toBytes(), owner.toBytes()],
    programId
  );
}

/**
 * Derives the PlayerLedger PDA (L1 replay ledger) for a given machine and player wallet.
 */
export function getLedgerPda(
  machinePda: PublicKey,
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [LEDGER_SEED, machinePda.toBytes(), owner.toBytes()],
    programId
  );
}

/**
 * Derives the Vault Authority PDA that holds custody of prize tokens and USDC.
 */
export function getVaultAuthorityPda(
  machinePda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_AUTHORITY_SEED, machinePda.toBytes()],
    programId
  );
}

/**
 * Derives the Scoped VRF Requester Identity PDA for the program.
 */
export function getProgramIdentityPda(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([IDENTITY_SEED], programId);
}

/**
 * Derives the Delegation Buffer PDA for an account (seeded under the owner program).
 */
export function getDelegationBufferPda(
  account: PublicKey,
  ownerProgramId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BUFFER_SEED, account.toBytes()],
    ownerProgramId
  );
}

/**
 * Derives the Delegation Record PDA for an account.
 */
export function getDelegationRecordPda(
  account: PublicKey,
  delegationProgramId: PublicKey = DELEGATION_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, account.toBytes()],
    delegationProgramId
  );
}

/**
 * Derives the Delegation Metadata PDA for an account.
 */
export function getDelegationMetadataPda(
  account: PublicKey,
  delegationProgramId: PublicKey = DELEGATION_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, account.toBytes()],
    delegationProgramId
  );
}
