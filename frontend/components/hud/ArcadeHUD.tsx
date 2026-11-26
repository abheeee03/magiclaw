"use client";

import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Shield, Camera, Crosshair } from "lucide-react";
import { VirtualJoystick } from "./VirtualJoystick";
import { TelemetryHUD } from "./TelemetryHUD";
import { TicketBadge } from "../TicketBadge";
import { GameButton } from "../Button";
import { formatTickets } from "../modals/TicketsModal";
import type { CamMode } from "../three/ClawMachineView";

const CAM_ORDER: CamMode[] = ["hero", "front", "side", "orbit"];

export interface ArcadeHUDProps {
  mounted: boolean;
  connected: boolean;
  isBootHudHidden: boolean;
  canPlayTurn: boolean;
  isOnchainActive: boolean;
  hasPendingPrize?: boolean;
  sessionKeyMismatch?: boolean;
  ticketBalance: number;
  activeCamMode: CamMode;
  showProjection?: boolean;
  inStockCount: number;
  isMuted: boolean;
  toastMessage: { title: string; sub: string; icon: string } | null;
  gameStateText: string;
  erLatencyMs: number;
  isMachineDelegated: boolean;
  vrfStatus: "Ready" | "Rolling" | "Fulfilled" | "Missed";
  lastSignature?: string;
  onOpenTicketsModal: () => void;
  onOpenWinModal?: () => void;
  onCamModeChange: (mode: CamMode) => void;
  onToggleProjection?: () => void;
  onOpenOddsModal: () => void;
  onToggleMute: () => void;
  onJoystickMove: (vector: { x: number; y: number }) => void;
  onTriggerDrop: () => void;
}

export const ArcadeHUD: React.FC<ArcadeHUDProps> = ({
  mounted,
  connected,
  isBootHudHidden,
  canPlayTurn,
  isOnchainActive,
  hasPendingPrize = false,
  sessionKeyMismatch = false,
  ticketBalance,
  activeCamMode,
  showProjection = false,
  inStockCount,
  isMuted,
  toastMessage,
  gameStateText,
  erLatencyMs,
  isMachineDelegated,
  vrfStatus,
  lastSignature,
  onOpenTicketsModal,
  onOpenWinModal,
  onCamModeChange,
  onToggleProjection,
  onOpenOddsModal,
  onToggleMute,
  onJoystickMove,
  onTriggerDrop,
}) => {
  const handleCyclePerspective = () => {
    const idx = CAM_ORDER.indexOf(activeCamMode);
    const next = CAM_ORDER[(idx + 1) % CAM_ORDER.length];
    onCamModeChange(next);
  };

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
          title="Manage Tickets, Deposit, Cashout & Faucet"
          className="pointer-events-auto"
        >
          <TicketBadge
            value={formatTickets(ticketBalance)}
            onPlusClick={onOpenTicketsModal}
            className="scale-[0.84] sm:scale-100 origin-left"
          />
        </div>

        {/* Top-Right Controls Cluster */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 pointer-events-auto">
          <GameButton
            variant="primary"
            size="sm"
            onClick={handleCyclePerspective}
            title="Toggle Camera Perspective (Keys 1–4)"
            leftIcon={<Camera className="w-3.5 h-3.5 text-[#1E7DF2]" />}
          >
            <span className="hidden md:inline mr-1">Camera</span>
            <span className="uppercase text-xs font-black text-[#1E7DF2]">
              {activeCamMode}
            </span>
          </GameButton>

          <GameButton
            variant={showProjection ? "danger" : "primary"}
            size="sm"
            onClick={onToggleProjection}
            title="Toggle Red Drop Target Projection"
            leftIcon={<Crosshair className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline mr-1">Laser</span>
            <span className="uppercase text-xs font-black">
              {showProjection ? "ON" : "OFF"}
            </span>
          </GameButton>

          <GameButton
            variant="accent"
            size="sm"
            onClick={onOpenOddsModal}
            leftIcon={<Shield className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">
              PRIZES ({inStockCount}) &amp; ODDS
            </span>
            <span className="sm:hidden">PRIZES ({inStockCount})</span>
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

          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
            aria-label={isMuted ? "Unmute Audio" : "Mute Audio"}
            className="cursor-pointer bg-transparent border-0 p-0 inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          >
            <img
              src={isMuted ? "/ui/mute.png" : "/ui/speak.png"}
              alt={isMuted ? "Muted" : "Sound On"}
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]"
            />
          </button>
        </div>
      </header>

      {/* Dynamic Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce w-[calc(100%-2rem)] sm:w-auto flex justify-center">
          <div className="rounded-2xl bg-[#FDF8EE] border-[3px] border-[#3E200C] shadow-[0_5px_0_#3E200C] px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2.5 sm:gap-3 max-w-md">
            <span className="text-lg sm:text-xl shrink-0">
              {toastMessage.icon}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-xs sm:text-sm font-black text-[#3E200C]">
                {toastMessage.title}
              </span>
              <span className="text-[11px] font-bold text-[#6E4B2A]">
                {toastMessage.sub}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding / Pending Prize Gate Banner */}
      {!isBootHudHidden && hasPendingPrize && (
        <div className="relative z-20 mx-auto px-3 max-w-[92vw] pointer-events-auto">
          <GameButton variant="success" size="sm" onClick={onOpenWinModal}>
            🏆 Unclaimed prize waiting! Click to Claim or Sell-Back
          </GameButton>
        </div>
      )}

      {!isBootHudHidden &&
        !hasPendingPrize &&
        !canPlayTurn &&
        ![
          "DROPPING",
          "GRABBING",
          "LIFTING",
          "RETURNING",
          "RELEASING",
          "RESOLVING",
          "WINNER!",
        ].includes(gameStateText) && (
          <div className="relative z-20 mx-auto px-3 max-w-[92vw] pointer-events-auto">
            {connected ? (
              <GameButton
                variant="accent"
                size="sm"
                onClick={onOpenTicketsModal}
              >
                {!isOnchainActive
                  ? "🎟️ Click Tickets (top left) to airdrop Test USDC & buy tickets!"
                  : sessionKeyMismatch
                  ? "🔑 Session key mismatch — click to re-sync session"
                  : "🎟️ Out of tickets! Click to buy more"}
              </GameButton>
            ) : (
              <div className="rounded-2xl bg-[#FDF8EE] border-[3px] border-[#3E200C] shadow-[0_4px_0_#3E200C] px-3.5 py-2 text-[11px] sm:text-xs font-extrabold text-[#3E200C] text-center">
                🔒 Connect your Solana Devnet wallet (top right) to play and
                win real tokens &amp; NFTs.
              </div>
            )}
          </div>
        )}

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
                  1 🎟️
                </span>
              </div>
            </GameButton>
          </div>
        </div>

        <div className="pointer-events-auto flex justify-center">
          <TelemetryHUD
            erLatencyMs={erLatencyMs}
            isDelegated={isMachineDelegated}
            vrfStatus={vrfStatus}
            pythStatus="Live"
            lastTxSignature={lastSignature}
          />
        </div>
      </footer>
    </>
  );
};
