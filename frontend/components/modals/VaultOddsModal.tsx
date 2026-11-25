"use client";

import React from "react";
import { X, ExternalLink, ShieldCheck, Target, Zap, Lock } from "lucide-react";
import { PRIZE_TIERS, PROGRAM_ID, MACHINE_ID } from "../../lib/constants";
import { getMachinePda } from "../../lib/pda";

interface VaultOddsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDelegated?: boolean;
}

export const VaultOddsModal: React.FC<VaultOddsModalProps> = ({
  isOpen,
  onClose,
  isDelegated = true,
}) => {
  if (!isOpen) return null;

  const [machinePda] = getMachinePda(MACHINE_ID);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-slate-900/95 shadow-2xl overflow-hidden"
        style={{
          boxShadow:
            "0 0 50px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-arcade text-xl sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-amber-300">
                VAULT &amp; ONCHAIN ODDS
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                PUBLIC PDA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              MachineConfig PDA:{" "}
              <code className="text-cyan-300 font-mono text-[11px]">
                {machinePda.toBase58().slice(0, 8)}...{machinePda.toBase58().slice(-8)}
              </code>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 custom-scroll">
          {/* Architecture Banner */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-arcade">
                  100% Verifiable Onchain Fairness
                </h4>
                <p className="text-xs text-slate-400">
                  Player steering sets coordinates. The instant prongs close, MagicBlock VRF (50ms) resolves grip hold vs. slip.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
                {isDelegated ? "⚡ ER Delegated" : "Solana L1"}
              </span>
            </div>
          </div>

          {/* Precision Bonus Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-950/80 border border-emerald-500/30 flex items-center gap-3">
            <Target className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-emerald-300 font-arcade">
                  DEAD CENTER PRECISION BONUS (+3%)
                </h4>
                <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                  +300 BPS
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Steer the claw within the inner bullseye radius of a capsule to gain a visible +3% grip boost, rewarding pilot skill!
              </p>
            </div>
          </div>

          {/* Tier Odds Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 font-mono">
              Transparent Prize Tiers &amp; Buyback Formula
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRIZE_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs font-arcade font-black uppercase px-2.5 py-1 rounded-lg"
                        style={{
                          color: tier.color,
                          backgroundColor: `${tier.color}15`,
                          border: `1px solid ${tier.color}40`,
                        }}
                      >
                        {tier.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-300">
                        {tier.oddsLabel} Base Grip
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-white mb-1">
                      {tier.desc}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {tier.badge} capsule
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Live Sell-Back:</span>
                    <strong className="text-amber-400 font-bold">
                      Pyth Lazer × {tier.buybackLabel}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Onchain Proof Links */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Program ID:</span>
              <a
                href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-cyan-400 hover:underline"
              >
                <span>{PROGRAM_ID.toBase58().slice(0, 10)}...</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>MachineConfig PDA:</span>
              <a
                href={`https://explorer.solana.com/address/${machinePda.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-cyan-400 hover:underline"
              >
                <span>{machinePda.toBase58().slice(0, 10)}...</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
