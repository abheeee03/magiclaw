"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import { Check, Sparkles, ExternalLink, ArrowRight, ShieldCheck, DollarSign, Wallet } from "lucide-react";
import { WonPrizeInfo } from "../../lib/types";
import { PROGRAM_ID } from "../../lib/constants";

interface PostWinModalProps {
  prize: WonPrizeInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onSellBack: () => Promise<void>;
  onClaimToWallet: () => Promise<void>;
}

export const PostWinModal: React.FC<PostWinModalProps> = ({
  prize,
  isOpen,
  onClose,
  onSellBack,
  onClaimToWallet,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [settledAction, setSettledAction] = useState<"sold" | "claimed" | null>(null);

  if (!isOpen || !prize) return null;

  const triggerConfettiAgain = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleSellBack = async () => {
    setIsProcessing(true);
    try {
      await onSellBack();
      setSettledAction("sold");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClaim = async () => {
    setIsProcessing(true);
    try {
      await onClaimToWallet();
      setSettledAction("claimed");
    } finally {
      setIsProcessing(false);
    }
  };

  const tierColors = {
    0: { border: "border-cyan-500/50", glow: "from-cyan-500/20 to-transparent", text: "text-cyan-400" },
    1: { border: "border-purple-500/50", glow: "from-purple-500/20 to-transparent", text: "text-purple-400" },
    2: { border: "border-pink-500/50", glow: "from-pink-500/20 to-transparent", text: "text-pink-400" },
    3: { border: "border-amber-500/60", glow: "from-amber-500/25 to-transparent", text: "text-amber-400" },
  }[prize.tier] || { border: "border-cyan-500/50", glow: "from-cyan-500/20 to-transparent", text: "text-cyan-400" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`relative w-full max-w-md rounded-3xl border ${tierColors.border} bg-slate-900/95 p-6 shadow-2xl overflow-hidden`}
        style={{
          boxShadow: "0 0 50px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Ambient Top Glow */}
        <div className={`absolute top-0 left-0 right-0 h-36 bg-gradient-to-b ${tierColors.glow} pointer-events-none`} />

        {/* Win Header */}
        <div className="relative text-center mb-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-xs font-mono font-bold text-slate-300 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>MAGICBLOCK VRF CONFIRMED GRIP</span>
          </div>

          <h2 className="font-arcade text-2xl sm:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-400 to-cyan-300">
            YOU WON!
          </h2>

          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically resolved onchain via MagicBlock VRF (Roll: {prize.vrfRoll}/10,000)
          </p>
        </div>

        {/* Prize Card */}
        <div className="relative rounded-2xl bg-slate-950/80 border border-slate-800 p-4 mb-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-3xl shadow-inner shrink-0">
            {prize.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${tierColors.text}`}>
                {prize.tierName} TIER
              </span>
              {prize.isBullseye && (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  🎯 Dead Center (+3%)
                </span>
              )}
            </div>

            <h3 className="font-arcade text-base sm:text-lg font-bold text-white truncate mt-1">
              {prize.name}
            </h3>

            <div className="flex items-center gap-3 mt-1 text-xs font-mono">
              <span className="text-slate-400">
                Pyth Value:{" "}
                <strong className="text-emerald-400 font-bold">
                  ${prize.livePriceUsd.toFixed(2)}
                </strong>
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                Buyback:{" "}
                <strong className="text-amber-400 font-bold">
                  ${prize.sellBackUsdc.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {settledAction ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-arcade text-lg font-bold text-white mb-1">
              {settledAction === "sold" ? "SELL-BACK SETTLED!" : "CLAIM TRANSACTION SENT!"}
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              {settledAction === "sold"
                ? `Credited $${prize.sellBackUsdc.toFixed(2)} USDC directly to your spendable ER balance.`
                : `Magic Action triggered transfer of ${prize.name} from Vault PDA to your wallet.`}
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-arcade font-bold text-sm shadow-lg cursor-pointer hover:brightness-110"
            >
              CONTINUE PLAYING
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Action 1: Instant Sell-Back */}
            <button
              disabled={isProcessing}
              onClick={handleSellBack}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-arcade font-black text-sm tracking-wide shadow-lg shadow-emerald-500/25 flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <span>INSTANT SELL-BACK</span>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-950/20 px-2.5 py-1 rounded-xl">
                +${prize.sellBackUsdc.toFixed(2)} USDC
              </span>
            </button>

            {/* Action 2: Claim to Wallet */}
            <button
              disabled={isProcessing}
              onClick={handleClaim}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-arcade font-black text-sm tracking-wide shadow-lg shadow-purple-500/25 flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                <span>CLAIM TO SOLANA WALLET</span>
              </div>
              <span className="text-xs font-mono font-bold bg-black/20 px-2.5 py-1 rounded-xl">
                L1 Transfer
              </span>
            </button>
          </div>
        )}

        {/* Explorer Verify Link */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Solana Devnet Custody</span>
          <a
            href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <span>View Vault on Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
