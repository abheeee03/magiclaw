"use client";

import React, { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shield, HelpCircle, Gamepad2, MoreVertical } from "lucide-react";
import { VirtualJoystick } from "./VirtualJoystick";
import { TicketBadge } from "../TicketBadge";
import { GameButton } from "../Button";
import { ArcadeToast, ArcadeToastData } from "../ArcadeToast";
import { formatTickets } from "../modals/TicketsModal";
import { MobileMenuModal } from "../modals/MobileMenuModal";

export interface ArcadeHUDProps {
  mounted: boolean;
  isBootHudHidden: boolean;
  canPlayTurn: boolean;
  isPracticeMode?: boolean;
  ticketBalance: number;
  inStockCount: number;
  toastMessage: ArcadeToastData | null;
  gameStateText: string;
  erLatencyMs: number;
  isMachineDelegated: boolean;
  vrfStatus: "Ready" | "Rolling" | "Fulfilled" | "Missed";
  lastSignature?: string;
  onOpenTicketsModal: () => void;
  onTogglePracticeMode: () => void;
  onOpenOddsModal: () => void;
  onOpenHowToPlayModal: () => void;
  onOpenSettingsModal: () => void;
  onCloseToast: () => void;
  onJoystickMove: (vector: { x: number; y: number }) => void;
  onTriggerDrop: () => void;
}

export const ArcadeHUD: React.FC<ArcadeHUDProps> = ({
  mounted,
  isBootHudHidden,
  canPlayTurn,
  isPracticeMode = false,
  ticketBalance,
  inStockCount,
  toastMessage,
  gameStateText,
  erLatencyMs,
  isMachineDelegated,
  vrfStatus,
  lastSignature,
  onOpenTicketsModal,
  onTogglePracticeMode,
  onOpenOddsModal,
  onOpenHowToPlayModal,
  onOpenSettingsModal,
  onCloseToast,
  onJoystickMove,
  onTriggerDrop,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Top Floating Arcade Header */}
      <header
        className={`hud-header-anim ${
          isBootHudHidden ? "hud-boot-hidden" : ""
        } relative z-20 px-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 sm:p-4 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pointer-events-none`}
      >
        {/* Top-Left: 3D Arcade Ticket Badge */}
        <div
          title={
            isPracticeMode
              ? "Practice Mode Active — Click + to buy tickets"
              : "Manage Tickets, Deposit, Cashout & Faucet"
          }
          className="pointer-events-auto"
        >
          <TicketBadge
            value={isPracticeMode ? "DEMO" : formatTickets(ticketBalance)}
            onPlusClick={onOpenTicketsModal}
            className="scale-[0.84] sm:scale-100 origin-left"
          />
        </div>

        {/* Top-Right Controls Cluster */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Desktop Options (moved into 3-dots dialog on mobile/smaller screens) */}
          <div className="hidden md:flex items-center gap-2">
            <GameButton
              variant={isPracticeMode ? "success" : "primary"}
              size="sm"
              onClick={onTogglePracticeMode}
              title={
                isPracticeMode
                  ? "Exit Practice Demo and switch back to Live Mode"
                  : "Play Demo Mode for free without tickets"
              }
              leftIcon={
                <Gamepad2
                  className={`w-3.5 h-3.5 ${
                    isPracticeMode ? "text-white" : "text-[#167A2E]"
                  }`}
                />
              }
            >
              <span className="font-black tracking-wide">
                {isPracticeMode ? "DEMO ON" : "DEMO"}
              </span>
            </GameButton>

            <GameButton
              variant="accent"
              size="sm"
              onClick={onOpenOddsModal}
              leftIcon={<Shield className="w-3.5 h-3.5" />}
            >
              <span>REWARDS</span>
            </GameButton>

            <div className="wallet-adapter-wrapper flex justify-end pb-[4px]">
              {mounted ? (
                <WalletMultiButton />
              ) : (
                <GameButton variant="info" size="sm" disabled>
                  CONNECT
                </GameButton>
              )}
            </div>

            <GameButton
              variant="info"
              size="sm"
              onClick={onOpenHowToPlayModal}
              title="How to Play Magiclaw"
              leftIcon={<HelpCircle className="w-3.5 h-3.5" />}
            >
              <span>HOW TO PLAY</span>
            </GameButton>
          </div>

          <button
            type="button"
            onClick={onOpenSettingsModal}
            title="Settings (Audio & Laser)"
            aria-label="Open Settings"
            className="cursor-pointer bg-transparent border-0 p-0 inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          >
            <img
              src="/ui/settings.png"
              alt="Settings"
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]"
            />
          </button>

          {/* 3-Dots Menu Trigger (Mobile & smaller screens only) */}
          <div className="md:hidden">
            <GameButton
              variant="primary"
              size="sm"
              onClick={() => setIsMobileMenuOpen(true)}
              title="Open Menu"
              aria-label="Open Menu"
            >
              <MoreVertical
                className="w-4 h-4 text-[#3E200C] -mx-1"
                strokeWidth={2.75}
              />
            </GameButton>
          </div>
        </div>
      </header>

      <MobileMenuModal
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        mounted={mounted}
        isPracticeMode={isPracticeMode}
        inStockCount={inStockCount}
        onTogglePracticeMode={onTogglePracticeMode}
        onOpenOddsModal={onOpenOddsModal}
        onOpenHowToPlayModal={onOpenHowToPlayModal}
      />

      {/* Right-aligned Slide Toast below Settings & HUD Header */}
      <ArcadeToast toast={toastMessage} onClose={onCloseToast} />

      {/* Bottom Floating Thumb Control Deck */}
      <footer
        className={`hud-footer-anim ${
          isBootHudHidden ? "hud-boot-hidden" : ""
        } relative z-20 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-10 sm:pb-5 md:px-16 lg:px-20 flex flex-col gap-2 sm:gap-2.5 pointer-events-none`}
      >
        <div className="w-full flex items-end justify-center gap-6 sm:justify-between">
          <div className="rounded-3xl bg-[#E0E0E0]/95 border-[3px] border-[#3E200C] shadow-[0_6px_0_#3E200C,0_14px_28px_rgba(0,0,0,0.45)] p-2 sm:p-2.5 flex items-center gap-3.5 pointer-events-auto">
            <VirtualJoystick
              onMove={onJoystickMove}
              disabled={
                !canPlayTurn ||
                gameStateText === "DROPPING" ||
                gameStateText === "GRABBING" ||
                gameStateText === "LIFTING" ||
                gameStateText === "RETURNING"
              }
            />

            <div className="hidden sm:flex flex-col gap-1 pr-2 min-w-[165px]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full border border-[#3E200C] ${
                    canPlayTurn ? "bg-[#48dd26]" : "bg-[#ffd014]"
                  }`}
                />
                <span className="text-[11px] font-black tracking-wider text-[#3E200C]">
                  {gameStateText}
                </span>
              </div>
              <div className="text-[10px] font-bold text-[#52361F] leading-relaxed">
                <div>
                  <strong className="text-[#1e232a] font-black">
                    WASD / Arrows
                  </strong>{" "}
                  Move Claw
                </div>
                <div>
                  <strong className="text-[#1e232a] font-black">
                    Space / Enter
                  </strong>{" "}
                  Drop Claw
                </div>
                <div>
                  <strong className="text-[#1e232a] font-black">1–4</strong>{" "}
                  Perspective
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-[#E0E0E0]/95 border-[3px] border-[#3E200C] shadow-[0_6px_0_#3E200C,0_14px_28px_rgba(0,0,0,0.45)] p-2 sm:p-3 flex items-center justify-center pointer-events-auto">
            <GameButton
              variant="success"
              size="lg"
              onClick={onTriggerDrop}
              title="Drop Claw (Space / Enter)"
            >
              <div className="flex flex-col items-center leading-none">
                <span className="text-base sm:text-xl font-black tracking-wider">
                  DROP
                </span>
                <span className="text-[10px] font-extrabold tracking-widest opacity-95 mt-0.5">
                  {isPracticeMode ? "FREE" : "1 🎟️"}
                </span>
              </div>
            </GameButton>
          </div>
        </div>
      </footer>
    </>
  );
};
