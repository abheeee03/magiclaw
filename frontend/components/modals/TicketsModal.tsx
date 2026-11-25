"use client";

import React, { useState } from "react";
import { X, Sparkles, Ticket, LogOut, Coins } from "lucide-react";

interface TicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connected: boolean;
  isOnchainActive: boolean;
  ticketBalance: number;
  walletUsdcBalance: number;
  playFeeUsd: number;
  faucetLoading: boolean;
  onboardingLoading: boolean;
  onBuyTickets: (ticketCount: number) => void;
  onAirdropUsdc: () => void;
  onWithdrawTickets: () => void;
  onSolFaucet: () => void;
}

export function formatTickets(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

const TICKET_PACKS = [1, 5, 10, 20];

export const TicketsModal: React.FC<TicketsModalProps> = ({
  isOpen,
  onClose,
  connected,
  isOnchainActive,
  ticketBalance,
  walletUsdcBalance,
  playFeeUsd,
  faucetLoading,
  onboardingLoading,
  onBuyTickets,
  onAirdropUsdc,
  onWithdrawTickets,
  onSolFaucet,
}) => {
  const [selectedPack, setSelectedPack] = useState<number>(5);

  if (!isOpen) return null;

  const packCostUsdc = selectedPack * playFeeUsd;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl border border-amber-400/35 bg-[#0b0f1d]/95 p-6 shadow-2xl overflow-hidden"
        style={{
          boxShadow:
            "0 0 50px rgba(251, 191, 36, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img
              src="/tickets/ticket-2.png"
              alt="Tickets"
              className="w-11 h-11 object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]"
            />
            <div>
              <h2 className="font-arcade text-xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-300 to-pink-400">
                ARCADE TICKETS
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {isOnchainActive
                  ? "Live Ephemeral Rollup Session"
                  : connected
                  ? "1 Ticket = " + playFeeUsd.toFixed(2) + " Test USDC"
                  : "Connect Wallet to Play"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Tickets Dialog"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-slate-950/85 border border-amber-400/25 p-3.5 flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-semibold">
              Session Tickets
            </span>
            <div className="flex items-center gap-2 mt-1">
              <img
                src="/tickets/ticket-2.png"
                alt="Tickets"
                className="w-6 h-6 object-contain"
              />
              <span className="font-arcade text-2xl font-black text-amber-300">
                {formatTickets(ticketBalance)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/85 border border-white/10 p-3.5 flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-semibold">
              Wallet Test USDC
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-arcade text-2xl font-black text-emerald-300">
                {connected ? walletUsdcBalance.toFixed(2) : "—"}
              </span>
              {connected && (
                <span className="text-[10px] text-slate-400 font-mono">
                  USDC
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!connected ? (
          <div className="rounded-2xl bg-slate-950/75 border border-amber-500/30 p-4 text-center text-xs font-mono text-amber-200">
            Connect your Solana Devnet wallet in the top right to airdrop Test
            USDC, buy tickets, or withdraw tickets back to your wallet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Option 1: Buy Tickets from our Test USDC mint */}
            <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-200 font-bold uppercase tracking-wider">
                  1. Buy Tickets
                </span>
                <span className="text-slate-400">
                  Cost:{" "}
                  <strong className="text-emerald-300">
                    {packCostUsdc.toFixed(2)} Test USDC
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {TICKET_PACKS.map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setSelectedPack(qty)}
                    className={`rounded-xl py-1.5 text-xs font-arcade font-bold cursor-pointer border transition-all ${
                      selectedPack === qty
                        ? "bg-gradient-to-r from-pink-500 to-orange-500 border-orange-300 text-white shadow-md"
                        : "bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {qty}🎟️
                  </button>
                ))}
              </div>

              <button
                onClick={() => onBuyTickets(selectedPack)}
                disabled={onboardingLoading || faucetLoading}
                className="w-full rounded-2xl px-4 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:brightness-110 active:scale-[0.99] text-slate-950 font-arcade text-xs font-black tracking-wide cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                <Ticket className="w-4 h-4" />
                <span>
                  {onboardingLoading
                    ? "DEPOSITING & DELEGATING..."
                    : `BUY ${selectedPack} TICKET${selectedPack > 1 ? "S" : ""}`}
                </span>
              </button>
            </div>

            {/* Option 2: Airdrop Test USDC directly to user's wallet */}
            <button
              onClick={onAirdropUsdc}
              disabled={faucetLoading || onboardingLoading}
              className="w-full rounded-2xl px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-arcade text-xs font-black tracking-wide cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {faucetLoading
                  ? "AIRDROPPING TEST USDC..."
                  : "2. AIRDROP 10 TEST USDC TO WALLET"}
              </span>
            </button>

            {/* Option 3: Withdraw Tickets to Wallet (Session Test USDC -> User Wallet) */}
            {isOnchainActive && ticketBalance > 0 && (
              <button
                onClick={onWithdrawTickets}
                disabled={onboardingLoading || faucetLoading}
                className="w-full rounded-2xl px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 font-arcade text-xs font-bold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <LogOut className="w-4 h-4" />
                <span>
                  {onboardingLoading
                    ? "WITHDRAWING TO WALLET..."
                    : `WITHDRAW ${formatTickets(ticketBalance)} TICKETS TO WALLET`}
                </span>
              </button>
            )}

            {/* Devnet SOL Gas Faucet */}
            <button
              onClick={onSolFaucet}
              disabled={faucetLoading}
              className="w-full rounded-2xl px-4 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 active:scale-[0.99] text-slate-950 font-arcade text-[11px] font-black tracking-wide cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              <Coins className="w-4 h-4 text-slate-950" />
              <span>SOL FAUCET (DEVNET GAS)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
