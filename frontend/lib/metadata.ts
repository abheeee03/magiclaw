import { PublicKey } from "@solana/web3.js";
import { baseConnection } from "./solana";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface OnchainTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  image?: string;
  description?: string;
}

const metadataCache = new Map<string, OnchainTokenMetadata>();

function readBorshString(
  data: Uint8Array,
  offset: number
): { value: string; nextOffset: number } | null {
  if (offset + 4 > data.length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = view.getUint32(offset, true);
  const start = offset + 4;
  if (len > 512 || start + len > data.length) return null;
  const raw = new TextDecoder().decode(data.slice(start, start + len));
  return {
    value: raw.replace(/\0/g, "").trim(),
    nextOffset: start + len,
  };
}

function decodeMetaplexMetadata(
  mint: string,
  data: Uint8Array
): OnchainTokenMetadata | null {
  // Layout: key (1) + update_authority (32) + mint (32) + Data { name, symbol, uri, ... }
  let offset = 1 + 32 + 32;
  const nameRes = readBorshString(data, offset);
  if (!nameRes) return null;
  offset = nameRes.nextOffset;

  const symbolRes = readBorshString(data, offset);
  if (!symbolRes) return null;
  offset = symbolRes.nextOffset;

  const uriRes = readBorshString(data, offset);
  if (!uriRes) return null;

  return {
    mint,
    name: nameRes.value,
    symbol: symbolRes.value,
    uri: uriRes.value,
  };
}

function normalizeUri(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice(5)}`;
  }
  return uri;
}

async function fetchJsonMetadata(
  uri: string
): Promise<{ image?: string; description?: string; name?: string }> {
  const url = normalizeUri(uri);
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return {};
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return {};
    const json = (await res.json()) as {
      image?: string;
      description?: string;
      name?: string;
    };
    return {
      image: json.image ? normalizeUri(json.image) : undefined,
      description: json.description,
      name: json.name,
    };
  } catch {
    return {};
  }
}

/**
 * Batch-fetches Metaplex Token Metadata PDAs and offchain JSON images for a list of mints.
 */
export async function fetchOnchainPrizeMetadata(
  mints: PublicKey[]
): Promise<Record<string, OnchainTokenMetadata>> {
  const uniqueMints = Array.from(
    new Map(
      mints
        .filter((m) => m.toBase58() !== PublicKey.default.toBase58())
        .map((m) => [m.toBase58(), m])
    ).values()
  );

  const result: Record<string, OnchainTokenMetadata> = {};
  const missing: PublicKey[] = [];

  for (const m of uniqueMints) {
    const key = m.toBase58();
    const cached = metadataCache.get(key);
    if (cached) {
      result[key] = cached;
    } else {
      missing.push(m);
    }
  }

  if (missing.length === 0) return result;

  const encoder = new TextEncoder();
  const pdas = missing.map(
    (m) =>
      PublicKey.findProgramAddressSync(
        [
          encoder.encode("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBytes(),
          m.toBytes(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )[0]
  );

  try {
    const accounts = await baseConnection.getMultipleAccountsInfo(pdas);
    await Promise.all(
      accounts.map(async (acc, idx) => {
        const mintStr = missing[idx].toBase58();
        if (!acc || acc.data.length < 70) return;

        const parsed = decodeMetaplexMetadata(mintStr, acc.data);
        if (!parsed) return;

        if (parsed.uri) {
          const json = await fetchJsonMetadata(parsed.uri);
          if (json.image) parsed.image = json.image;
          if (json.description) parsed.description = json.description;
          if (!parsed.name && json.name) parsed.name = json.name;
        }

        metadataCache.set(mintStr, parsed);
        result[mintStr] = parsed;
      })
    );
  } catch (err) {
    console.warn("Failed to batch fetch token metadata:", err);
  }

  return result;
}
