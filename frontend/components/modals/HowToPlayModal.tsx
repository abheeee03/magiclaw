"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Shield,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import { PRIZE_TIERS } from "../../lib/constants";
import { CartoonDialog } from "../Dialog";
import { GameButton } from "../Button";

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRewards?: () => void;
}

const TOTAL_STEPS = 3;

const STEP_TITLES = ["WELCOME!", "HOW TO PLAY", "PRIZES & ODDS"];

const TIER_BADGE_STYLES: Record<
  number,
  { bg: string; bar: string; border: string; badgeText: string }
> = {
  3: {
    bg: "linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%)",
    bar: "linear-gradient(90deg, #F59E0B 0%, #D97706 100%)",
    border: "#B45309",
    badgeText: "#92400E",
  },
  2: {
    bg: "linear-gradient(180deg, #FCE7F3 0%, #FBCFE8 100%)",
    bar: "linear-gradient(90deg, #F472B6 0%, #DB2777 100%)",
    border: "#9D174D",
    badgeText: "#831843",
  },
  1: {
    bg: "linear-gradient(180deg, #EDE9FE 0%, #DDD6FE 100%)",
    bar: "linear-gradient(90deg, #A855F7 0%, #7C3AED 100%)",
    border: "#5B21B6",
    badgeText: "#4C1D95",
  },
  0: {
    bg: "linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 100%)",
    bar: "linear-gradient(90deg, #38BDF8 0%, #0284C7 100%)",
    border: "#0369A1",
    badgeText: "#0C4A6E",
  },
};

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  onOpenRewards,
}) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => setStep(0), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  // Display tiers from rarest (Grail) to Common
  const orderedTiers = [...PRIZE_TIERS].sort((a, b) => b.tier - a.tier);

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title={STEP_TITLES[step] || "HOW TO PLAY"}
      className="max-w-lg"
      contentClassName="px-5 sm:px-6 pb-4 pt-3"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Left: Back button or Step Counter */}
          <div className="flex items-center gap-2 min-w-[88px]">
            {step > 0 ? (
              <GameButton
                variant="primary"
                size="sm"
                onClick={handleBack}
                leftIcon={<ArrowLeft className="w-3.5 h-3.5 text-[#1E7DF2]" />}
              >
                Back
              </GameButton>
            ) : (
              <span className="text-xs font-black text-[#3E200C]/75 pl-1">
                Step 1 / {TOTAL_STEPS}
              </span>
            )}
          </div>

          {/* Center: Interactive Step Dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to step ${idx + 1}`}
                onClick={() => setStep(idx)}
                className={`h-2.5 rounded-full transition-all cursor-pointer border border-[#3E200C]/30 ${
                  step === idx
                    ? "w-7 bg-[#1E7DF2] shadow-[0_1.5px_0_#0D3B8A]"
                    : "w-2.5 bg-white/80 hover:bg-white"
                }`}
              />
            ))}
          </div>

          {/* Right: Next / Play Button */}
          <div className="flex justify-end min-w-[104px]">
            <GameButton
              variant={step === TOTAL_STEPS - 1 ? "success" : "info"}
              size="sm"
              onClick={handleNext}
              rightIcon={
                step === TOTAL_STEPS - 1 ? undefined : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )
              }
            >
              {step === TOTAL_STEPS - 1 ? "LET'S PLAY!" : "Next"}
            </GameButton>
          </div>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step-welcome"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Hero Intro Card */}
            <div className="rounded-[22px] p-4 sm:p-5 text-center space-y-3">
              <h3 className="text-2xl sm:text-4xl font-black">
                Welcome to Magiclaw!
              </h3>
              <p className="text-xs sm:text-[13px] font-bold text-[#6E4B2A] max-w-sm mx-auto leading-relaxed">
                Steer a real-time 3D arcade claw machine and win on-chain token
                booster packs &amp; NFTs!
              </p>

              {/* Powered By Logos matching LoadingScreen */}
              <div className="pt-2 pb-1 flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#3E200C]/65 mb-2.5">
                  Powered By
                </span>
                <div className="flex items-center justify-center gap-6 sm:gap-8 px-4 py-2.5 rounded-2xl bg-white/80 border-2 border-[#3E200C]/15 shadow-inner">
                  <Image
                    src="/magicblock.png"
                    width={118}
                    height={36}
                    alt="MagicBlock"
                    className="h-7 sm:h-8 w-auto object-contain"
                  />
                  <div className="w-px h-6 bg-[#3E200C]/15" />
                  <Image
                    src="/solana.png"
                    width={118}
                    height={36}
                    alt="Solana"
                    className="h-7 sm:h-8 w-auto object-contain"
                  />
                </div>
              </div>
            </div>

            {/* VRF Fairness & Devnet Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 p-3 flex items-start gap-2.5 shadow-[0_3px_0_rgba(62,32,12,0.14)]">
                <div className="w-9 h-9 rounded-xl bg-[#1E7DF2]/15 border border-[#1E7DF2]/30 flex items-center justify-center shrink-0 text-[#1E7DF2]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#3E200C]">
                    100% Fair VRF Rolls
                  </div>
                  <p className="text-[11px] font-bold text-[#6E4B2A] leading-snug mt-0.5">
                    MagicBlock uses a verifiable random algorithm (VRF) so every
                    grab outcome is provably fair.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 p-3 flex items-start gap-2.5 shadow-[0_3px_0_rgba(62,32,12,0.14)]">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-600/30 flex items-center justify-center shrink-0 text-amber-600">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#3E200C]">
                    Free Devnet Play
                  </div>
                  <p className="text-[11px] font-bold text-[#6E4B2A] leading-snug mt-0.5">
                    Magiclaw is live on Solana Devnet. Grab free Test USDC from
                    Tickets &amp; start playing!
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step-controls"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="space-y-3.5"
          >
            {/* Steer Section: WASD + Joystick */}
            <div
              className="rounded-[22px] border-2 border-[#DFAF79] p-4 space-y-3"
              style={{
                background: "linear-gradient(180deg, #FFF5DC 0%, #F7DFB9 100%)",
                boxShadow:
                  "inset 0 2px 0 rgba(255,255,255,0.75), 0 3px 0 rgba(168,114,62,0.3)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-black text-[#3E200C]">
                  1. Steer the Claw
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#3E200C]/10 text-[#3E200C]">
                  Keyboard or Touch
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                {/* WASD Cartoon Keycaps */}
                <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_3px_0_rgba(62,32,12,0.14)]">
                  <div className="w-8 h-8 rounded-lg bg-white border-2 border-[#3E200C] shadow-[0_3px_0_#3E200C] flex items-center justify-center text-xs font-black text-[#3E200C]">
                    W
                  </div>
                  <div className="flex items-center gap-1.5">
                    {["A", "S", "D"].map((k) => (
                      <div
                        key={k}
                        className="w-8 h-8 rounded-lg bg-white border-2 border-[#3E200C] shadow-[0_3px_0_#3E200C] flex items-center justify-center text-xs font-black text-[#3E200C]"
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-black text-[#6E4B2A] mt-1">
                    WASD / Arrow Keys
                  </span>
                </div>

                {/* Mini Cartoon Joystick Illustration */}
                <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/20 p-3 flex flex-col items-center justify-center gap-1.5 shadow-[0_3px_0_rgba(62,32,12,0.14)]">
                  <div className="relative w-16 h-16 rounded-full bg-[#1E2438] border-2 border-[#3E200C] shadow-inner flex items-center justify-center">
                    <div
                      className="w-8 h-8 rounded-full border-2 border-[#FDE047] shadow-[0_3px_6px_rgba(0,0,0,0.45)] flex items-center justify-center text-[10px] font-black text-[#713F12]"
                      style={{
                        background:
                          "radial-gradient(circle at 32% 28%, #FEF08A 0%, #EAB308 55%, #A16207 100%)",
                      }}
                    >
                      ✦
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-[#6E4B2A] mt-0.5">
                    On-Screen Joystick
                  </span>
                </div>
              </div>

              <p className="text-xs font-bold text-[#52361F] text-center">
                Align the claw directly over any token pack before dropping!
              </p>
            </div>

            {/* Drop & Ticket Cost */}
            <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 flex items-center justify-between gap-3 shadow-[0_3px_0_rgba(62,32,12,0.16)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-[#5fed32] to-[#34c61a] border-2 border-[#1c780f] shadow-[0_3px_0_#1c780f] flex flex-col items-center justify-center text-white shrink-0 leading-none">
                  <span className="text-[10px] font-black">DROP</span>
                  <span className="text-[10px] font-black mt-0.5">1 🎟️</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-[#3E200C] flex items-center gap-1.5">
                    2. Drop Uses 1 Ticket
                  </div>
                  <p className="text-[11px] font-bold text-[#6E4B2A] leading-snug">
                    Press <strong>DROP</strong> or{" "}
                    <strong>Space / Enter</strong>. Each play costs{" "}
                    <strong>1 Ticket</strong>.
                  </p>
                </div>
              </div>
              <Ticket className="w-5 h-5 text-[#D97706] shrink-0" />
            </div>

            {/* Pro Tip: Laser + Bullseye */}
            <div className="rounded-2xl bg-[#FFF6D6] border-2 border-[#C8963E] p-3 flex items-center gap-2.5 text-xs font-bold text-[#52361F]">
              <Crosshair className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>
                <strong>Pro Tip:</strong> Turn on <strong>Drop Laser</strong> in
                Settings &amp; switch cameras (keys <strong>1–4</strong>) to
                land dead-center for a <strong>+3% Bullseye bonus</strong>!
              </span>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step-prizes"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="space-y-3.5"
          >
            {/* Inspect Machine Inventory Hint */}
            <div
              className="rounded-2xl border-2 border-[#DFAF79] p-3.5 flex items-center justify-between gap-3"
              style={{
                background: "linear-gradient(180deg, #FFF5DC 0%, #F7DFB9 100%)",
                boxShadow:
                  "inset 0 2px 0 rgba(255,255,255,0.75), 0 3px 0 rgba(168,114,62,0.3)",
              }}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-black text-[#3E200C]">
                  Peek Inside the Machine
                </h3>
                <p className="text-[11px] font-bold text-[#6E4B2A] leading-snug mt-0.5">
                  Click the <strong>REWARDS</strong> button anytime to inspect
                  every pack &amp; token amount stocked in the cabinet.
                </p>
              </div>
              <GameButton
                variant="accent"
                size="sm"
                leftIcon={<Shield className="w-3.5 h-3.5" />}
                onClick={() => {
                  onClose();
                  onOpenRewards?.();
                }}
                className="shrink-0"
              >
                REWARDS
              </GameButton>
            </div>

            {/* Tiers: Grab vs Slip Chances */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-[#3E200C]">
                  Prize Tiers &amp; Grab / Slip Chances
                </span>
                <span className="text-[10px] font-extrabold text-[#167A2E]">
                  +3% on Bullseye
                </span>
              </div>

              <div className="space-y-2">
                {orderedTiers.map((t) => {
                  const grabPct = Math.round(t.baseGripBps / 100);
                  const slipPct = Math.max(0, 100 - grabPct);
                  const style =
                    TIER_BADGE_STYLES[t.tier] || TIER_BADGE_STYLES[0];
                  return (
                    <div
                      key={t.tier}
                      className="rounded-2xl border-2 p-2.5 shadow-[0_2px_0_rgba(62,32,12,0.16)]"
                      style={{
                        background: style.bg,
                        borderColor: style.border,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className="text-xs font-black uppercase tracking-wide"
                          style={{ color: style.badgeText }}
                        >
                          {t.name}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-black">
                          <span className="text-[#167A2E]">
                            {grabPct}% Grab
                          </span>
                          <span className="text-[#3E200C]/35">•</span>
                          <span className="text-[#B91C1C]">
                            {slipPct}% Slip
                          </span>
                        </div>
                      </div>

                      {/* Visual Grab vs Slip Bar */}
                      <div className="h-2 w-full rounded-full bg-white/75 border border-black/15 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${grabPct}%`,
                            background: style.bar,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] font-bold text-[#52361F] text-center px-2">
              Win a pack? <strong>Claim</strong> the tokens straight to your
              wallet or <strong>Sell Back</strong> instantly for Tickets!
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </CartoonDialog>
  );
};
