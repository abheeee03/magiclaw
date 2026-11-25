"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { HELIUS_RPC_URL, SOLANA_WS_URL } from "../lib/constants";

// Default styles for wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const endpoint = useMemo(() => HELIUS_RPC_URL, []);

  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      wsEndpoint: SOLANA_WS_URL,
    }),
    []
  );

  // Standard wallets (Phantom, Solflare, etc.) are auto-detected via Wallet Standard
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
