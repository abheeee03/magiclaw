"use client";

import React, { useState } from "react";
import { Sparkles, Ticket, LogOut, Coins } from "lucide-react";
import { CartoonDialog } from "../Dialog";
import { GameButton } from "../Button";

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

  const packCostUsdc = selectedPack * playFeeUsd;

  const subtitleText = isOnchainActive
    ? "Live Ephemeral Rollup Session"
    : connected
      ? `1 Ticket = ${playFeeUsd.toFixed(2)} Test USDC`
      : "Connect Wallet to Play";

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="ARCADE TICKETS"
      subtitle={subtitleText}
    >
      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 flex flex-col shadow-[0_3px_0_rgba(62,32,12,0.18)]">
          <span className="text-[10px] uppercase tracking-wider text-[#6E4B2A] font-bold">
            Session Tickets
          </span>
          <div className="flex items-center gap-2 mt-1">
            <img
              src="/tickets/ticket-2.png"
              alt="Tickets"
              className="w-7 h-7 object-contain drop-shadow-sm"
            />
            <span className="text-2xl font-black text-[#3E200C]">
              {formatTickets(ticketBalance)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 flex flex-col shadow-[0_3px_0_rgba(62,32,12,0.18)]">
          <span className="text-[10px] uppercase tracking-wider text-[#6E4B2A] font-bold">
            Wallet Test USDC
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-[#167A2E]">
              {connected ? walletUsdcBalance.toFixed(2) : "—"}
            </span>
            {connected && (
              <span className="text-[11px] text-[#6E4B2A] font-bold">USDC</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {!connected ? (
        <div className="rounded-2xl bg-[#FFF6D6] border-2 border-[#C8963E] p-4 text-center text-xs font-bold text-[#52361F] shadow-[0_3px_0_rgba(184,134,45,0.35)]">
          Connect your Solana Devnet wallet in the top right to airdrop Test
          USDC, buy tickets, or withdraw tickets back to your wallet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Option 1: Buy Tickets from our Test USDC mint */}
          <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 flex flex-col gap-3 shadow-[0_3px_0_rgba(62,32,12,0.18)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#3E200C] font-extrabold uppercase tracking-wider">
                Buy Tickets
              </span>
              <span className="text-[#6E4B2A] font-bold">
                Cost:{" "}
                <strong className="text-[#167A2E] font-black">
                  {packCostUsdc.toFixed(2)} Test USDC
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {TICKET_PACKS.map((qty) => (
                <GameButton
                  key={qty}
                  variant={selectedPack === qty ? "accent" : "primary"}
                  size="sm"
                  fullWidth
                  onClick={() => setSelectedPack(qty)}
                >
                  {qty}🎟️
                </GameButton>
              ))}
            </div>

            <GameButton
              variant="success"
              size="md"
              fullWidth
              leftIcon={<Ticket className="w-4 h-4" />}
              isLoading={onboardingLoading}
              disabled={onboardingLoading || faucetLoading}
              onClick={() => onBuyTickets(selectedPack)}
            >
              {onboardingLoading
                ? "DEPOSITING..."
                : `BUY ${selectedPack} TICKET${selectedPack > 1 ? "S" : ""}`}
            </GameButton>
          </div>

          {/* Option 2: Airdrop Test USDC directly to user's wallet */}
          <GameButton
            variant="info"
            size="md"
            fullWidth
            leftIcon={<Sparkles className="w-4 h-4" />}
            isLoading={faucetLoading}
            disabled={faucetLoading || onboardingLoading}
            onClick={onAirdropUsdc}
          >
            {faucetLoading ? "AIRDROPPING..." : "AIRDROP 10 TEST USDC"}
          </GameButton>

          {/* Option 3: Withdraw Tickets to Wallet */}
          {isOnchainActive && ticketBalance > 0 && (
            <GameButton
              variant="neutral"
              size="sm"
              fullWidth
              leftIcon={<LogOut className="w-4 h-4" />}
              disabled={onboardingLoading || faucetLoading}
              onClick={onWithdrawTickets}
            >
              {onboardingLoading
                ? "WITHDRAWING..."
                : `WITHDRAW ${formatTickets(ticketBalance)} TICKETS`}
            </GameButton>
          )}

          {/* Devnet SOL Gas Faucet */}
          <GameButton
            variant="accent"
            size="sm"
            fullWidth
            leftIcon={<Coins className="w-4 h-4" />}
            disabled={faucetLoading}
            onClick={onSolFaucet}
          >
            SOL FAUCET (DEVNET GAS)
          </GameButton>
        </div>
      )}
    </CartoonDialog>
  );
};
