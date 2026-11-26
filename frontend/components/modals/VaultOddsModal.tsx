"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { PRIZE_TIERS } from "../../lib/constants";
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

function formatCompactCount(raw: bigint, decimals: number): string {
  const num = Number(raw) / Math.pow(10, decimals);
  if (!Number.isFinite(num)) return raw.toString();
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  if (Number.isInteger(num)) return String(num);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

interface TierCardTheme {
  headerBg: string;
  bodyBgTop: string;
  bodyBgBot: string;
  ribbonBg: string;
  ribbonFold: string;
  tileTop: string;
  tileBot: string;
  glowColor?: string;
  rayColor?: string;
}

const TIER_CARD_THEMES: Record<number, TierCardTheme> = {
  // Common: Steel-slate card + cyan tile & ribbon
  0: {
    headerBg: "#8B93A3",
    bodyBgTop: "#6F7889",
    bodyBgBot: "#5C6475",
    ribbonBg: "#0284C7",
    ribbonFold: "#075985",
    tileTop: "#38BDF8",
    tileBot: "#0284C7",
  },
  // Rare: Bright sky-blue card + purple icon tile + glowing cyan/violet lines
  1: {
    headerBg: "#4BB5F7",
    bodyBgTop: "#248AE0",
    bodyBgBot: "#1B6FC2",
    ribbonBg: "#7C3AED",
    ribbonFold: "#4C1D95",
    tileTop: "#A855F7",
    tileBot: "#6D28D9",
    glowColor: "rgba(168, 85, 247, 0.55)",
    rayColor: "rgba(224, 242, 254, 0.24)",
  },
  // Epic: Mauve-slate card + pink prism tile & rose ribbon
  2: {
    headerBg: "#9C7EA8",
    bodyBgTop: "#7A5D88",
    bodyBgBot: "#634970",
    ribbonBg: "#E11D48",
    ribbonFold: "#881337",
    tileTop: "#F472B6",
    tileBot: "#DB2777",
  },
  // Grail: Warm gold card + golden crown tile + glowing golden sunburst rays
  3: {
    headerBg: "#F7C346",
    bodyBgTop: "#DF9216",
    bodyBgBot: "#BD730B",
    ribbonBg: "#DC2626",
    ribbonFold: "#7F1D1D",
    tileTop: "#FDE047",
    tileBot: "#CA8A04",
    glowColor: "rgba(250, 204, 21, 0.72)",
    rayColor: "rgba(255, 249, 196, 0.34)",
  },
};

const FallbackPrizeEmblem: React.FC<{ tier: number }> = ({ tier }) => {
  if (tier === 3) {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_2px_2px_rgba(24,28,42,0.4)]" fill="none" aria-hidden="true">
        <path
          d="M10 46L6 20L21 31L32 14L43 31L58 20L54 46H10Z"
          fill="#FFF3B0"
          stroke="#181C2A"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <rect x="10" y="46" width="44" height="8" rx="3" fill="#FDE047" stroke="#181C2A" strokeWidth="3.5" />
        <circle cx="32" cy="14" r="3.5" fill="#FF4D6D" stroke="#181C2A" strokeWidth="2.5" />
      </svg>
    );
  }
  if (tier === 2) {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_2px_2px_rgba(24,28,42,0.4)]" fill="none" aria-hidden="true">
        <path
          d="M32 8L52 24L44 52H20L12 24L32 8Z"
          fill="#F9A8D4"
          stroke="#181C2A"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M32 8L40 24L32 52L24 24L32 8Z" fill="#FDF2F8" opacity="0.65" />
      </svg>
    );
  }
  if (tier === 1) {
    return (
      <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_2px_2px_rgba(24,28,42,0.4)]" fill="none" aria-hidden="true">
        <path
          d="M18 14H46L56 27L32 54L8 27L18 14Z"
          fill="#FF5CA8"
          stroke="#181C2A"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M8 27H56" stroke="#181C2A" strokeWidth="2.5" />
        <path d="M24 14L20 27L32 54L44 27L40 14" stroke="#FBCFE8" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_2px_2px_rgba(24,28,42,0.4)]" fill="none" aria-hidden="true">
      <path
        d="M32 7C35.5 18 46 28.5 57 32C46 35.5 35.5 46 32 57C28.5 46 18 35.5 7 32C18 28.5 28.5 18 32 7Z"
        fill="#E0F2FE"
        stroke="#181C2A"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="30" r="2.6" fill="#181C2A" />
      <circle cx="38" cy="30" r="2.6" fill="#181C2A" />
      <path d="M29 36Q32 39 35 36" stroke="#181C2A" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

export const VaultOddsModal: React.FC<VaultOddsModalProps> = ({
  isOpen,
  onClose,
  slots = [],
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const inStockSlots = slots
    .filter((s) => s.inStock)
    .sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      if (b.prizeAmount !== a.prizeAmount) {
        return b.prizeAmount > a.prizeAmount ? 1 : -1;
      }
      return a.slotId - b.slotId;
    });

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="PRIZES & ODDS"
      className="max-w-4xl"
      contentClassName="px-6 sm:px-9 pb-6 sm:pb-8 pt-5"
    >
      {inStockSlots.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#FDF8EE] border-2 border-dashed border-[#C8963E] text-sm font-bold text-[#6E4B2A] text-center">
          No stocked prizes found in this cabinet yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5 pt-1 items-stretch">
          {inStockSlots.map((slot, idx) => {
            const tierCfg = PRIZE_TIERS[slot.tier] || PRIZE_TIERS[0];
            const theme = TIER_CARD_THEMES[slot.tier] || TIER_CARD_THEMES[0];
            const qty = formatPrizeAmount(
              slot.prizeAmount,
              slot.prizeDecimals
            );
            const compactQty = formatCompactCount(
              slot.prizeAmount,
              slot.prizeDecimals
            );
            const mintStr = slot.prizeMint.toBase58();
            const isNft =
              slot.prizeDecimals === 0 && slot.prizeAmount === BigInt(1);
            const showImage = Boolean(slot.image) && !failedImages[mintStr];
            const tokenName =
              slot.name || slot.symbol || `Slot #${slot.slotId}`;
            const bottomLabel = isNft
              ? "1/1 NFT"
              : `x${qty} ${slot.symbol || ""}`.trim();

            const hasGlowLines = slot.tier === 1 || slot.tier === 3;
            const isGrail = slot.tier === 3;

            return (
              <motion.a
                key={slot.slotId}
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: Math.min(idx * 0.03, 0.3),
                  type: "spring",
                  stiffness: 320,
                  damping: 22,
                }}
                href={`https://explorer.solana.com/address/${mintStr}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Inspect ${tokenName} (${mintStr})`}
                className="group relative h-full flex flex-col rounded-[18px] border-[2.5px] border-[#181C2A] transition-transform hover:-translate-y-1 select-none"
                style={{
                  background: `linear-gradient(180deg, ${theme.bodyBgTop} 0%, ${theme.bodyBgBot} 100%)`,
                  boxShadow:
                    hasGlowLines && theme.glowColor
                      ? `0 4px 0 #181C2A, 0 0 18px ${theme.glowColor}`
                      : "0 4px 0 #181C2A",
                }}
              >
                {/* Rotating radial glowing rays & sweeping diagonal highlight line for Rare & Grail */}
                {hasGlowLines && (
                  <div className="pointer-events-none absolute inset-0 rounded-[15px] overflow-hidden z-0">
                    <div className="absolute inset-0 flex items-center justify-center pt-5">
                      <div
                        className="reward-glow-rays w-[460px] h-[460px] shrink-0"
                        style={{
                          background: `repeating-conic-gradient(from 0deg, ${theme.rayColor} 0deg 14deg, transparent 14deg 28deg)`,
                        }}
                      />
                    </div>
                    <div
                      className="reward-glow-sweep absolute inset-y-0 -left-1/2 w-1/2 opacity-55"
                      style={{
                        background:
                          "linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.45) 48%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.45) 52%, transparent 80%)",
                      }}
                    />
                  </div>
                )}

                {/* Bright white foreground shimmer sweep on Grail card */}
                {isGrail && (
                  <div className="pointer-events-none absolute inset-0 rounded-[15px] overflow-hidden z-30">
                    <div
                      className="reward-grail-shimmer absolute inset-y-0 -left-2/3 w-2/3"
                      style={{
                        background:
                          "linear-gradient(110deg, transparent 10%, rgba(255,255,255,0.18) 34%, rgba(255,255,255,0.72) 48%, rgba(255,255,255,0.92) 50%, rgba(255,255,255,0.72) 52%, rgba(255,255,255,0.18) 66%, transparent 90%)",
                      }}
                    />
                  </div>
                )}

                {/* Upper Heading Band: Token Name (clean text, no glitched stroke) */}
                <div
                  className="relative z-10 px-3 py-2.5 rounded-t-[15px] border-b border-black/15 flex items-center justify-center min-h-[44px]"
                  style={{ backgroundColor: theme.headerBg }}
                >
                  <span className="text-sm sm:text-[15px] font-black text-white text-center truncate w-full leading-tight drop-shadow-[0_1.5px_1px_rgba(15,23,42,0.45)]">
                    {tokenName}
                  </span>
                </div>

                {/* Tier Ribbon Banner */}
                <div className="relative -mt-2.5 -ml-1.5 self-start z-20">
                  <div
                    className="px-2.5 py-0.5 pr-4 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_2px_0_rgba(0,0,0,0.3)]"
                    style={{
                      backgroundColor: theme.ribbonBg,
                      clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
                    }}
                  >
                    {tierCfg.name}
                  </div>
                  <div
                    className="w-1.5 h-1.5"
                    style={{
                      backgroundColor: theme.ribbonFold,
                      clipPath: "polygon(0 0, 100% 0, 100% 100%)",
                    }}
                  />
                </div>

                {/* Main Middle Part: Framed Square Icon Box + Available Token Count */}
                <div className="relative z-10 flex-1 flex items-center justify-center pt-2 pb-3 px-3">
                  <div
                    className={`relative w-[82px] h-[82px] sm:w-[88px] sm:h-[88px] rounded-2xl border-[2.5px] border-[#181C2A] flex items-center justify-center overflow-hidden ${
                      hasGlowLines
                        ? "shadow-[inset_0_3px_0_rgba(255,255,255,0.45),0_0_14px_rgba(255,255,255,0.35),0_3px_0_rgba(0,0,0,0.28)]"
                        : "shadow-[inset_0_3px_0_rgba(255,255,255,0.35),0_3px_0_rgba(0,0,0,0.28)]"
                    }`}
                    style={{
                      background: `linear-gradient(180deg, ${theme.tileTop} 0%, ${theme.tileBot} 100%)`,
                    }}
                  >
                    {showImage ? (
                      <img
                        src={slot.image}
                        alt={tokenName}
                        onError={() =>
                          setFailedImages((prev) => ({
                            ...prev,
                            [mintStr]: true,
                          }))
                        }
                        className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-xl drop-shadow-[0_2px_3px_rgba(24,28,42,0.4)]"
                      />
                    ) : (
                      <FallbackPrizeEmblem tier={slot.tier} />
                    )}

                    <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded-md bg-[#181C2A]/75 text-xs font-black text-white leading-none">
                      {isNft ? "1" : compactQty}
                    </span>
                  </div>
                </div>

                {/* Bottom Label: Available Token Count & Symbol (no coin image, no stroke) */}
                <div className="relative z-10 pb-3 px-2.5 text-center">
                  <span className="text-sm sm:text-[15px] font-black text-white tracking-tight truncate block drop-shadow-[0_1.5px_1px_rgba(15,23,42,0.45)]">
                    {bottomLabel}
                  </span>
                </div>
              </motion.a>
            );
          })}
        </div>
      )}
    </CartoonDialog>
  );
};
