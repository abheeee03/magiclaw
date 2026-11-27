"use client";

import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Gamepad2, HelpCircle, Shield, Wallet } from "lucide-react";
import { CartoonDialog } from "../Dialog";
import { GameButton } from "../Button";

export interface MobileMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  mounted: boolean;
  isPracticeMode: boolean;
  inStockCount: number;
  onTogglePracticeMode: () => void;
  onOpenOddsModal: () => void;
  onOpenHowToPlayModal: () => void;
}

export const MobileMenuModal: React.FC<MobileMenuModalProps> = ({
  isOpen,
  onClose,
  mounted,
  isPracticeMode,
  inStockCount,
  onTogglePracticeMode,
  onOpenOddsModal,
  onOpenHowToPlayModal,
}) => {
  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="ARCADE MENU"
      subtitle="Wallet, Demo & Game Info"
    >
      <div className="flex flex-col gap-3">
        {/* Wallet Card */}
        <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 shadow-[0_3px_0_rgba(62,32,12,0.18)] flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#6E4B2A]">
            <Wallet className="w-3.5 h-3.5 text-[#1E7DF2]" />
            <span>Solana Wallet</span>
          </div>
          <div className="wallet-adapter-wrapper flex justify-center pb-[4px]">
            {mounted ? (
              <WalletMultiButton />
            ) : (
              <GameButton variant="info" size="sm" disabled>
                CONNECT
              </GameButton>
            )}
          </div>
        </div>

        {/* Demo Mode */}
        <GameButton
          variant={isPracticeMode ? "success" : "primary"}
          size="md"
          fullWidth
          onClick={() => {
            onTogglePracticeMode();
            onClose();
          }}
          leftIcon={
            <Gamepad2
              className={`w-4 h-4 ${
                isPracticeMode ? "text-white" : "text-[#167A2E]"
              }`}
            />
          }
        >
          <span className="text-sm font-black tracking-wide">
            {isPracticeMode ? "DEMO ON • TAP TO EXIT" : "DEMO MODE (FREE)"}
          </span>
        </GameButton>

        {/* Rewards / Vault Odds */}
        <GameButton
          variant="accent"
          size="md"
          fullWidth
          onClick={() => {
            onClose();
            onOpenOddsModal();
          }}
          leftIcon={<Shield className="w-4 h-4" />}
        >
          <span className="text-sm font-black tracking-wide">
            REWARDS ({inStockCount} IN STOCK)
          </span>
        </GameButton>

        {/* How To Play */}
        <GameButton
          variant="info"
          size="md"
          fullWidth
          onClick={() => {
            onClose();
            onOpenHowToPlayModal();
          }}
          leftIcon={<HelpCircle className="w-4 h-4" />}
        >
          <span className="text-sm font-black tracking-wide">HOW TO PLAY</span>
        </GameButton>
      </div>
    </CartoonDialog>
  );
};
