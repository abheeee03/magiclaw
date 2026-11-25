"use client";

import React from "react";
import { Zap, Radio, CheckCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { PROGRAM_ID } from "../../lib/constants";

interface TelemetryHUDProps {
  erLatencyMs?: number;
  isDelegated?: boolean;
  vrfStatus?: string;
  pythStatus?: string;
  lastTxSignature?: string;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({
  erLatencyMs = 12,
  isDelegated = true,
  vrfStatus = "Ready",
  pythStatus = "Live",
  lastTxSignature,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 px-3 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-500/20 text-[10px] sm:text-[11px] text-slate-300 shadow-xl">
      {/* MagicBlock ER Status */}
      <div className="flex items-center gap-1.5 font-mono">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
        </span>
        <span className="text-cyan-300 font-bold">ER:</span>
        <span className="text-slate-100">{erLatencyMs}ms</span>
        <span className="text-cyan-400/60 hidden sm:inline">
          {isDelegated ? "(Delegated)" : "(Direct)"}
        </span>
      </div>

      <span className="text-slate-700 hidden sm:inline">|</span>

      {/* MagicBlock VRF Status */}
      <div className="flex items-center gap-1.5 font-mono">
        <Zap className="w-3 h-3 text-amber-400" />
        <span className="text-amber-300 font-bold">VRF:</span>
        <span className="text-slate-200">{vrfStatus} (~50ms)</span>
      </div>

      <span className="text-slate-700 hidden sm:inline">|</span>

      {/* Pyth Lazer Oracles */}
      <div className="flex items-center gap-1.5 font-mono">
        <Radio className="w-3 h-3 text-pink-400 animate-pulse" />
        <span className="text-pink-300 font-bold">Pyth:</span>
        <span className="text-emerald-300">{pythStatus}</span>
      </div>

      {/* Proof Link if tx available */}
      {lastTxSignature && (
        <>
          <span className="text-slate-700 hidden sm:inline">|</span>
          <a
            href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors font-bold underline"
          >
            <span>Proof</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </>
      )}
    </div>
  );
};
