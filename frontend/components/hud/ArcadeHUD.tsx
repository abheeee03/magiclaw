"use client";

import React from "react";
import Image from "next/image";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Volume2, VolumeX, Shield, Camera, Plus, Crosshair } from "lucide-react";
import { VirtualJoystick } from "./VirtualJoystick";
import { TelemetryHUD } from "./TelemetryHUD";
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
        } relative z-20 p-2.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none`}
      >
        {/* Top-Left: Tickets Balance Pill Only */}
        <button
          onClick={onOpenTicketsModal}
          title="Manage Tickets, Deposit, Cashout & Faucet"
          className="hud-glass rounded-2xl px-3.5 py-2 flex items-center gap-2.5 pointer-events-auto shadow-2xl cursor-pointer hover:border-amber-400/50 transition-all active:scale-95"
        >
          <Image
            src="/tickets/ticket-2.png"
            alt="Tickets"
            width={32}
            height={32}
            className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(251,191,36,0.45)]"
          />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
              Tickets
            </span>
            <span className="font-arcade text-base sm:text-lg font-black text-amber-300">
              {formatTickets(ticketBalance)}
            </span>
          </div>
          <span className="ml-1 w-6 h-6 rounded-xl bg-amber-400/15 border border-amber-400/35 text-amber-300 flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </span>
        </button>

        {/* Top-Right Controls Cluster */}
        <div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
          <button
            onClick={handleCyclePerspective}
            title="Toggle Camera Perspective (Keys 1–4)"
            className="cam-pill hud-glass rounded-2xl px-3 py-2 text-xs font-arcade font-bold text-slate-100 cursor-pointer flex items-center gap-2 shadow-lg hover:border-pink-400/45"
          >
            <Camera className="w-3.5 h-3.5 text-amber-300" />
            <span>Change Perspective</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-lg bg-white/10 text-amber-200">
              {activeCamMode}
            </span>
          </button>

          <button
            onClick={onToggleProjection}
            title="Toggle Red Drop Target Projection"
            className={`hud-glass rounded-2xl px-3 py-2 text-xs font-arcade font-bold cursor-pointer flex items-center gap-2 shadow-lg transition-all ${
              showProjection
                ? "border border-rose-500/70 bg-rose-500/20 text-rose-200 shadow-[0_0_16px_rgba(244,63,94,0.35)]"
                : "text-slate-100 hover:border-rose-400/45"
            }`}
          >
            <Crosshair
              className={`w-3.5 h-3.5 ${
                showProjection ? "text-rose-400" : "text-slate-300"
              }`}
            />
            <span>Projection</span>
            <span
              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-lg ${
                showProjection
                  ? "bg-rose-500/30 text-rose-200"
                  : "bg-white/10 text-slate-400"
              }`}
            >
              {showProjection ? "ON" : "OFF"}
            </span>
          </button>

          <button
            onClick={onOpenOddsModal}
            className="hud-glass rounded-2xl px-3 py-2 text-xs font-arcade font-bold text-amber-200 hover:text-white cursor-pointer flex items-center gap-1.5 shadow-lg hover:border-pink-400/40"
          >
            <Shield className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden sm:inline">
              PRIZES ({inStockCount}) &amp; ODDS
            </span>
            <span className="sm:hidden">PRIZES ({inStockCount})</span>
          </button>

          <div className="wallet-adapter-wrapper min-w-[130px] flex justify-end">
            {mounted ? (
              <WalletMultiButton className="!bg-gradient-to-r !from-indigo-600 !to-purple-600 !rounded-2xl !h-9 !py-0 !px-3 !text-xs !font-arcade !font-bold !shadow-lg" />
            ) : (
              <button className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl h-9 px-3 text-xs font-arcade font-bold shadow-lg text-white opacity-80">
                CONNECT WALLET
              </button>
            )}
          </div>

          <button
            onClick={onToggleMute}
            className="hud-glass rounded-2xl p-2 text-slate-300 hover:text-white cursor-pointer"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>
        </div>
      </header>

      {/* Dynamic Toast Alert */}
      {toastMessage && (
        <div className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce">
          <div className="hud-glass rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-cyan-400/40 shadow-2xl max-w-[90vw]">
            <span className="text-xl">{toastMessage.icon}</span>
            <div className="flex flex-col leading-tight">
              <span className="font-arcade text-xs sm:text-sm font-extrabold text-white">
                {toastMessage.title}
              </span>
              <span className="text-[11px] text-slate-300">
                {toastMessage.sub}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding / Pending Prize Gate Banner */}
      {!isBootHudHidden && hasPendingPrize && (
        <div className="relative z-20 mx-auto pointer-events-auto">
          <button
            onClick={onOpenWinModal}
            className="hud-glass rounded-2xl px-4 py-2.5 border border-emerald-400/50 text-xs font-mono text-emerald-200 flex items-center gap-2.5 shadow-xl cursor-pointer hover:border-emerald-300 transition-all"
          >
            <span>
              🏆 Unclaimed prize waiting! Click here to Claim to Wallet or Instant Sell-Back.
            </span>
          </button>
        </div>
      )}

      {!isBootHudHidden &&
        !hasPendingPrize &&
        !canPlayTurn &&
        !["DROPPING", "GRABBING", "LIFTING", "RETURNING", "RELEASING", "RESOLVING", "WINNER!"].includes(
          gameStateText
        ) && (
          <div className="relative z-20 mx-auto pointer-events-auto">
            <button
              onClick={connected ? onOpenTicketsModal : undefined}
              className={`hud-glass rounded-2xl px-4 py-2.5 border border-amber-500/40 text-xs font-mono text-amber-200 flex items-center gap-2.5 shadow-xl ${
                connected ? "cursor-pointer hover:border-amber-400/70" : ""
              }`}
            >
              <span>
                {!connected
                  ? "🔒 Connect your Solana Devnet wallet (top right) to play and win real tokens & NFTs."
                  : !isOnchainActive
                  ? "🎟️ Click Tickets (top left) to airdrop Test USDC & buy tickets!"
                  : sessionKeyMismatch
                  ? "🔑 Session key mismatch — click Tickets (top left) to buy tickets or re-sync session."
                  : "🎟️ Out of tickets! Click Tickets (top left) to buy more."}
              </span>
            </button>
          </div>
        )}

      {/* Bottom Floating Thumb Control Deck */}
      <footer
        className={`hud-footer-anim ${
          isBootHudHidden ? "hud-boot-hidden" : ""
        } relative z-20 p-3 sm:p-5 flex flex-col gap-2.5 pointer-events-none`}
      >
        <div className="flex items-end justify-between sm:justify-center sm:gap-10">
          <div className="hud-glass rounded-3xl p-2 sm:p-2.5 flex items-center gap-3.5 pointer-events-auto shadow-2xl">
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
                  className={`w-2.5 h-2.5 rounded-full ${
                    canPlayTurn
                      ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                      : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                  }`}
                />
                <span className="font-arcade text-[11px] font-extrabold tracking-wider text-lime-200">
                  {gameStateText}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                <div>
                  <strong className="text-slate-200">WASD / Arrows</strong> Move
                  Claw
                </div>
                <div>
                  <strong className="text-slate-200">Space / Enter</strong> Drop
                  Claw
                </div>
                <div>
                  <strong className="text-slate-200">1–4</strong> Perspective
                </div>
              </div>
            </div>
          </div>

          <div className="hud-glass rounded-3xl p-2.5 flex items-center justify-center pointer-events-auto shadow-2xl">
            <button
              onClick={onTriggerDrop}
              title="Drop Claw (Space / Enter)"
              className="emerald-drop-btn cursor-pointer"
            >
              <div className="emerald-drop-cap">
                <span className="font-arcade font-black text-xs sm:text-sm tracking-wider leading-none">
                  DROP
                </span>
                <span className="text-[8px] font-extrabold tracking-widest opacity-80 mt-0.5">
                  1 TICKET
                </span>
              </div>
            </button>
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
