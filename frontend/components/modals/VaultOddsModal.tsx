"use client";

import React, { useState } from "react";
import { X, ExternalLink, ShieldCheck, Target, Package, Sparkles } from "lucide-react";
import { PRIZE_TIERS, PROGRAM_ID, MACHINE_ID } from "../../lib/constants";
import { getMachinePda } from "../../lib/pda";
import { PrizeSlot } from "../../lib/types";

interface VaultOddsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDelegated?: boolean;
  slots?: PrizeSlot[];
}

function formatPrizeAmount(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const div = BigInt(10) ** BigInt(decimals);
  const whole = raw / div;
  const frac = (raw % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export const VaultOddsModal: React.FC<VaultOddsModalProps> = ({
  isOpen,
  onClose,
  isDelegated = true,
  slots = [],
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const [machinePda] = getMachinePda(MACHINE_ID);
  const inStockSlots = slots.filter((s) => s.inStock);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-cyan-500/30 bg-[#0b0f1d]/95 shadow-2xl overflow-hidden"
        style={{
          boxShadow:
            "0 0 60px rgba(6, 182, 212, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/90 flex items-center justify-between bg-slate-950/70">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-arcade text-lg sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-amber-300">
                CABINET PRIZES &amp; ODDS
              </h2>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                {inStockSlots.length} / 16 IN STOCK
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                {isDelegated ? "⚡ ER Live" : "Solana L1"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Every capsule below is backed by real Devnet SPL tokens or NFTs in Vault PDA{" "}
              <a
                href={`https://explorer.solana.com/address/${machinePda.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                {machinePda.toBase58().slice(0, 6)}...{machinePda.toBase58().slice(-6)}
              </a>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-6 custom-scroll">
          {/* Live Prizes Inside Machine */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-200 font-mono flex items-center gap-1.5">
                <Package className="w-4 h-4 text-cyan-400" />
                Prizes Inside This Machine
              </h3>
              <span className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                +3% Dead-Center Bullseye Bonus
              </span>
            </div>

            {inStockSlots.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-950/80 border border-dashed border-slate-800 text-xs font-mono text-slate-400 text-center">
                No stocked prizes found in this cabinet yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {inStockSlots.map((slot) => {
                  const tierCfg = PRIZE_TIERS[slot.tier] || PRIZE_TIERS[0];
                  const buybackUsd = (
                    Number(slot.fallbackBuybackUsdc) / 1_000_000
                  ).toFixed(2);
                  const qty = formatPrizeAmount(
                    slot.prizeAmount,
                    slot.prizeDecimals
                  );
                  const mintStr = slot.prizeMint.toBase58();
                  const isNft =
                    slot.prizeDecimals === 0 && slot.prizeAmount === BigInt(1);
                  const showImage = Boolean(slot.image) && !failedImages[mintStr];

                  return (
                    <div
                      key={slot.slotId}
                      className="group p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/90 hover:border-cyan-500/40 transition-all flex items-center gap-3.5 shadow-lg"
                    >
                      {/* Main Prize Image / Visual */}
                      <div
                        className="relative w-16 h-16 rounded-2xl bg-slate-900 border flex items-center justify-center shrink-0 overflow-hidden"
                        style={{
                          borderColor: `${tierCfg.color}55`,
                          boxShadow: `0 0 18px ${tierCfg.color}22`,
                        }}
                      >
                        {showImage ? (
                          <img
                            src={slot.image}
                            alt={slot.name || `Slot #${slot.slotId}`}
                            onError={() =>
                              setFailedImages((prev) => ({
                                ...prev,
                                [mintStr]: true,
                              }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl">
                            {slot.icon || (isNft ? "👑" : "🪙")}
                          </span>
                        )}
                        <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-black/75 text-slate-200 border border-white/10">
                          #{slot.slotId}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-arcade font-bold text-white truncate">
                            {slot.name || `Slot #${slot.slotId}`}
                          </h4>
                          <a
                            href={`https://explorer.solana.com/address/${mintStr}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Inspect Mint ${mintStr}`}
                            className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span
                            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                            style={{
                              color: tierCfg.color,
                              backgroundColor: `${tierCfg.color}18`,
                              border: `1px solid ${tierCfg.color}45`,
                            }}
                          >
                            {tierCfg.name} • {tierCfg.oddsLabel}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {isNft ? "1/1 NFT" : `${qty} ${slot.symbol || "SPL"}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-2 text-[11px] font-mono">
                          <span className="text-slate-400">
                            Instant Buyback:{" "}
                            <strong className="text-amber-300 font-bold">
                              ${buybackUsd}
                            </strong>
                          </span>
                          <span className="text-slate-500">
                            {mintStr.slice(0, 4)}..{mintStr.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fairness & Tier Odds Reference */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Tier Grip Odds &amp; Sell-Back Rates
              </h3>
              <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                Verified by MagicBlock VRF
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PRIZE_TIERS.map((tier) => (
                <div
                  key={tier.tier}
                  className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[11px] font-arcade font-black uppercase"
                      style={{ color: tier.color }}
                    >
                      {tier.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {tier.oddsLabel}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Buyback: <span className="text-amber-300">{tier.buybackLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Onchain Proof Links */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-cyan-400"
            >
              Program: {PROGRAM_ID.toBase58().slice(0, 8)}...
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`https://explorer.solana.com/address/${machinePda.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-cyan-400"
            >
              Machine PDA: {machinePda.toBase58().slice(0, 8)}...
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
