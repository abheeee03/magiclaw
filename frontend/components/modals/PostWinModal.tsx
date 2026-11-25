"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import {
  Check,
  Sparkles,
  ExternalLink,
  DollarSign,
  Wallet,
  Coins,
  Award,
} from "lucide-react";
import { WonPrizeInfo } from "../../lib/types";

interface PostWinModalProps {
  prize: WonPrizeInfo | null;
  isOpen: boolean;
  pendingClaimOnly?: boolean;
  onClose: () => void;
  onSellBack: () => Promise<void>;
  onClaimToWallet: () => Promise<void>;
}

export const PostWinModal: React.FC<PostWinModalProps> = ({
  prize,
  isOpen,
  pendingClaimOnly = false,
  onClose,
  onSellBack,
  onClaimToWallet,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [settledAction, setSettledAction] = useState<"sold" | "claimed" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  React.useEffect(() => {
    setSettledAction(null);
    setErrorMsg(null);
    setImgFailed(false);
  }, [prize?.slotId, prize?.vrfRoll, isOpen]);

  if (!isOpen || !prize) return null;

  const handleSellBack = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await onSellBack();
      setSettledAction("sold");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClaim = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await onClaimToWallet();
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
      });
      setSettledAction("claimed");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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

  const rewardLabel = prize.isNft
    ? `1/1 NFT (${prize.symbol})`
    : `${prize.amount} ${prize.symbol}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`relative w-full max-w-md rounded-3xl border ${tierColors.border} bg-slate-900/95 p-6 shadow-2xl overflow-hidden`}
        style={{
          boxShadow: "0 0 50px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
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

          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Slot #{prize.slotId} • VRF Roll: {prize.vrfRoll}/10,000 • Odds:{" "}
            {(prize.effectiveOddsBps / 100).toFixed(0)}%
          </p>
        </div>

        {/* Exact Won Prize Card */}
        <div className="relative rounded-2xl bg-slate-950/90 border border-slate-800 p-4 mb-5 flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/15 flex items-center justify-center text-4xl shadow-inner shrink-0 overflow-hidden">
            {prize.image && !imgFailed ? (
              <img
                src={prize.image}
                alt={prize.name}
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              prize.icon
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${tierColors.text}`}>
                {prize.tierName}
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 inline-flex items-center gap-1">
                {prize.isNft ? (
                  <>
                    <Award className="w-3 h-3" /> 1/1 NFT
                  </>
                ) : (
                  <>
                    <Coins className="w-3 h-3" /> SPL TOKEN
                  </>
                )}
              </span>
              {prize.isBullseye && (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  🎯 +3%
                </span>
              )}
            </div>

            <h3 className="font-arcade text-lg font-black text-white truncate mt-1.5">
              {prize.name}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 font-bold">
                Reward: {rewardLabel}
              </span>
              <span className="text-slate-400">
                Buyback:{" "}
                <strong className="text-amber-400 font-bold">
                  {prize.sellBackUsdc.toFixed(2)} Tickets
                </strong>
              </span>
            </div>

            <div className="mt-1.5 text-[10px] font-mono text-slate-500 truncate">
              Mint: {prize.mint.slice(0, 8)}...{prize.mint.slice(-8)}
            </div>
          </div>
        </div>

        {settledAction ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-arcade text-lg font-bold text-white mb-1">
              {settledAction === "sold"
                ? "SELL-BACK SETTLED!"
                : `${rewardLabel} SENT TO WALLET!`}
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              {settledAction === "sold"
                ? `Credited +${prize.sellBackUsdc.toFixed(2)} Tickets directly to your session balance.`
                : `Transferred ${rewardLabel} (${prize.name}) from Vault PDA straight to your Solana Devnet wallet.`}
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
            {!pendingClaimOnly && (
              <button
                disabled={isProcessing}
                onClick={handleSellBack}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-arcade font-black text-sm tracking-wide shadow-lg shadow-emerald-500/25 flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  <span>{isProcessing ? "PROCESSING..." : "INSTANT SELL-BACK"}</span>
                </div>
                <span className="text-xs font-mono font-bold bg-slate-950/20 px-2.5 py-1 rounded-xl">
                  +{prize.sellBackUsdc.toFixed(2)} Tickets
                </span>
              </button>
            )}

            <button
              disabled={isProcessing}
              onClick={handleClaim}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-arcade font-black text-sm tracking-wide shadow-lg shadow-purple-500/25 flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                <span>
                  {isProcessing
                    ? "SETTLING TO WALLET..."
                    : pendingClaimOnly
                    ? `CLAIM ${rewardLabel} TO WALLET`
                    : `CLAIM ${rewardLabel}`}
                </span>
              </div>
              <span className="text-xs font-mono font-bold bg-black/20 px-2.5 py-1 rounded-xl">
                L1 Transfer
              </span>
            </button>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-mono break-all">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Explorer Verify Link */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Solana Devnet Custody</span>
          <a
            href={`https://explorer.solana.com/address/${prize.mint}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <span>Inspect Won Mint on Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
