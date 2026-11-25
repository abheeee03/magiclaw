import { Keypair } from "@solana/web3.js";

const SESSION_KEY_STORAGE = "clawvault_session_key_v1";

/**
 * Retrieves the stored ephemeral Session Keypair from sessionStorage,
 * or generates and persists a new one for gasless ER gameplay.
 */
export function getOrCreateSessionKey(): Keypair {
  if (typeof window === "undefined") {
    return Keypair.generate();
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY_STORAGE);
    if (raw) {
      const secret = Uint8Array.from(JSON.parse(raw));
      return Keypair.fromSecretKey(secret);
    }
  } catch (err) {
    console.warn("Failed to load session key from storage, creating new:", err);
  }

  const kp = Keypair.generate();
  try {
    window.sessionStorage.setItem(
      SESSION_KEY_STORAGE,
      JSON.stringify(Array.from(kp.secretKey))
    );
  } catch (err) {
    console.warn("Failed to persist session key in sessionStorage:", err);
  }
  return kp;
}

/**
 * Clears the ephemeral Session Keypair from storage.
 */
export function clearSessionKey(): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY_STORAGE);
    } catch {
      // ignore
    }
  }
}
