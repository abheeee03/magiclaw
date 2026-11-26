"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, ShieldCheck, Target, Package, Sparkles } from "lucide-react";
import { PRIZE_TIERS, PROGRAM_ID, MACHINE_ID } from "../../lib/constants";
import { getMachinePda } from "../../lib/pda";
import { PrizeSlot } from "../../lib/types";
import { CartoonDialog } from "../Dialog";

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

  const [machinePda] = getMachinePda(MACHINE_ID);
  const inStockSlots = slots.filter((s) => s.inStock);

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="PRIZES & ODDS"
      subtitle={`${inStockSlots.length} / 16 In Stock • ${
        isDelegated ? "⚡ ER Live" : "Solana L1"
      } • +3% Bullseye Bonus`}
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Live Prizes Inside Machine — Warm Golden-Cream Cards matching reference */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#3E200C] flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#1E7DF2]" />
              Cabinet Rewards
            </h3>
            <span className="text-[11px] font-bold text-[#0D3B8A] flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-[#167A2E]" />
              +3% Dead-Center Bullseye
            </span>
          </div>

          {inStockSlots.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#FDF8EE] border-2 border-dashed border-[#C8963E] text-xs font-bold text-[#6E4B2A] text-center">
              No stocked prizes found in this cabinet yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {inStockSlots.map((slot, idx) => {
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
                  <motion.a
                    key={slot.slotId}
                    initial={{ opacity: 0, y: 12, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: Math.min(idx * 0.035, 0.35),
                      type: "spring",
                      stiffness: 320,
                      damping: 22,
                    }}
                    href={`https://explorer.solana.com/address/${mintStr}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Inspect ${slot.name || `Slot #${slot.slotId}`} (${mintStr})`}
                    className="group relative flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-2xl border-2 border-[#C8963E] transition-transform hover:-translate-y-0.5"
                    style={{
                      background:
                        "linear-gradient(180deg, #FFF3B8 0%, #FCE28B 65%, #F5CE63 100%)",
                      boxShadow:
                        "inset 0 2px 0 rgba(255,255,255,0.75), 0 3px 0 #B8862D",
                    }}
                  >
                    {/* Left Blue Rounded Square Badge (Odds / Slot) */}
                    <div
                      className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 text-white border-2 border-[#0D3B8A] shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_2px_0_#0A295E]"
                      style={{
                        background:
                          "linear-gradient(180deg, #4EB5FF 0%, #2589F5 55%, #166AD6 100%)",
                      }}
                    >
                      <span className="text-[13px] font-black leading-none drop-shadow-[0_1px_0_#0A295E]">
                        {tierCfg.oddsLabel}
                      </span>
                      <span className="text-[9px] font-extrabold opacity-90 mt-0.5">
                        #{slot.slotId}
                      </span>
                    </div>

                    {/* Center Prize Title & Buyback */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-[#3E200C] truncate leading-tight">
                        {slot.name || `Slot #${slot.slotId}`}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-extrabold">
                        <span className="text-[#7C4A15] uppercase">
                          {tierCfg.name}
                        </span>
                        <span className="text-[#9E7B4F]">•</span>
                        <span className="text-[#167A2E]">
                          {buybackUsd} 🎟️
                        </span>
                      </div>
                    </div>

                    {/* Right Prize Image + Bold Quantity Multiplier Badge */}
                    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
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
                          className="w-11 h-11 object-contain rounded-xl drop-shadow-[0_2px_3px_rgba(62,32,12,0.35)]"
                        />
                      ) : (
                        <span className="text-3xl drop-shadow-[0_2px_2px_rgba(62,32,12,0.3)]">
                          {slot.icon || (isNft ? "👑" : "🪙")}
                        </span>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[10px] font-black text-white bg-[#3E200C] px-1.5 py-0.5 rounded-md leading-none">
                        {isNft ? "x1" : `${qty}`}
                      </span>
                    </div>
                  </motion.a>
                );
              })}
            </div>
          )}
        </div>

        {/* Fairness & Tier Odds Reference */}
        <div className="space-y-2.5 pt-3 border-t-2 border-[#3E200C]/15">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#3E200C] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
              Tier Grip Odds &amp; Sell-Back
            </h3>
            <span className="text-[10px] font-bold text-[#0D3B8A] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#167A2E]" />
              Verified by MagicBlock VRF
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRIZE_TIERS.map((tier) => (
              <div
                key={tier.tier}
                className="p-2.5 rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 flex flex-col justify-between shadow-[0_2px_0_rgba(62,32,12,0.14)]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black uppercase text-[#3E200C]">
                    {tier.name}
                  </span>
                  <span className="text-xs font-black text-[#1E7DF2]">
                    {tier.oddsLabel}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-[#6E4B2A]">
                  Buyback:{" "}
                  <span className="text-[#167A2E]">{tier.buybackLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Onchain Proof Links */}
        <div className="p-3 rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#52361F]">
          <a
            href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#0D3B8A] hover:underline"
          >
            Program: {PROGRAM_ID.toBase58().slice(0, 8)}...
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={`https://explorer.solana.com/address/${machinePda.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#0D3B8A] hover:underline"
          >
            Machine PDA: {machinePda.toBase58().slice(0, 8)}...
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </CartoonDialog>
  );
};
