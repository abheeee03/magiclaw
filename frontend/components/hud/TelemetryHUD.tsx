"use client";

import React from "react";
import { Zap, Radio, ExternalLink } from "lucide-react";

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
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 sm:gap-4 px-3.5 py-1.5 rounded-full bg-[#FDF8EE]/95 border-[2.5px] border-[#3E200C] text-[10px] sm:text-[11px] text-[#3E200C] font-bold shadow-[0_3px_0_#3E200C] max-w-[95vw]">
      {/* MagicBlock ER Status */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E7DF2] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1E7DF2]" />
        </span>
        <span className="text-[#0D3B8A] font-black">ER:</span>
        <span>{erLatencyMs}ms</span>
        <span className="text-[#6E4B2A] hidden sm:inline">
          {isDelegated ? "(Delegated)" : "(Direct)"}
        </span>
      </div>

      <span className="text-[#C8963E] hidden sm:inline">|</span>

      {/* MagicBlock VRF Status */}
      <div className="flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-[#D97706]" />
        <span className="text-[#B45309] font-black">VRF:</span>
        <span>{vrfStatus} (~50ms)</span>
      </div>

      <span className="text-[#C8963E] hidden sm:inline">|</span>

      {/* Pyth Lazer Oracles */}
      <div className="flex items-center gap-1.5">
        <Radio className="w-3 h-3 text-[#167A2E] animate-pulse" />
        <span className="text-[#167A2E] font-black">Pyth:</span>
        <span>{pythStatus}</span>
      </div>

      {/* Proof Link if tx available */}
      {lastTxSignature && (
        <>
          <span className="text-[#C8963E] hidden sm:inline">|</span>
          <a
            href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#0D3B8A] hover:underline font-black"
          >
            <span>Proof</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </>
      )}
    </div>
  );
};
