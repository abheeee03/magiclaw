import { Keypair, PublicKey } from "@solana/web3.js";

const SESSION_KEY_PREFIX = "clawvault_session_key_v1_";

/**
 * Retrieves the stored ephemeral Session Keypair from localStorage (keyed by owner wallet),
 * or generates and persists a new one for gasless ER gameplay.
 */
export function getOrCreateSessionKey(owner?: PublicKey | string | null): Keypair {
  if (typeof window === "undefined") {
    return Keypair.generate();
  }

  const keyName = `${SESSION_KEY_PREFIX}${
    typeof owner === "string" ? owner : owner?.toBase58() || "default"
  }`;

  try {
    const raw = window.localStorage.getItem(keyName);
    if (raw) {
      const secret = Uint8Array.from(JSON.parse(raw));
      return Keypair.fromSecretKey(secret);
    }
  } catch (err) {
    console.warn("Failed to load session key from localStorage, creating new:", err);
  }

  const kp = Keypair.generate();
  try {
    window.localStorage.setItem(
      keyName,
      JSON.stringify(Array.from(kp.secretKey))
    );
  } catch (err) {
    console.warn("Failed to persist session key in localStorage:", err);
  }
  return kp;
}

/**
 * Clears the ephemeral Session Keypair from storage.
 */
export function clearSessionKey(owner?: PublicKey | string | null): void {
  if (typeof window !== "undefined") {
    const keyName = `${SESSION_KEY_PREFIX}${
      typeof owner === "string" ? owner : owner?.toBase58() || "default"
    }`;
    try {
      window.localStorage.removeItem(keyName);
    } catch {
      // ignore
    }
  }
}
