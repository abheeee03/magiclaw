"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import {
  Check,
  Sparkles,
  ExternalLink,
  DollarSign,
  Wallet,
} from "lucide-react";
import { WonPrizeInfo } from "../../lib/types";
import SunburstBackground from "../SunBrustBackground";
import { GameButton } from "../Button";
import { WinningPack3D } from "../three/WinningPack3D";

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
  const [processingAction, setProcessingAction] = useState<
    "sell" | "claim" | null
  >(null);
  const [settledAction, setSettledAction] = useState<"sold" | "claimed" | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    setSettledAction(null);
    setProcessingAction(null);
    setErrorMsg(null);
  }, [prize?.slotId, prize?.vrfRoll, isOpen]);

  if (!prize) return null;

  const handleSellBack = async () => {
    setProcessingAction("sell");
    setErrorMsg(null);
    try {
      await onSellBack();
      setSettledAction("sold");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingAction(null);
    }
  };

  const handleClaim = async () => {
    setProcessingAction("claim");
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
      setProcessingAction(null);
    }
  };

  const rewardLabel = prize.isNft
    ? `1/1 NFT (${prize.symbol})`
    : `${prize.amount} ${prize.symbol}`;

  const isBusy = processingAction !== null;

  return (
    <SunburstBackground isOpen={isOpen && Boolean(prize)} onClose={onClose}>
      <div className="relative w-full max-w-lg px-4 py-6 flex flex-col items-center text-center select-none">
        {/* Top Celebratory Header */}
        <motion.div
          initial={{ y: -24, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{
            delay: 0.14,
            type: "spring",
            stiffness: 260,
            damping: 18,
          }}
          className="flex flex-col items-center"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF0]/90 border-2 border-[#B86B00] text-[11px] font-extrabold text-[#6B3E02] shadow-[0_3px_0_rgba(140,75,0,0.35)] mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            <span>
              {prize.tierName.toUpperCase()} • VRF VERIFIED
              {prize.isBullseye ? " • 🎯 +3%" : ""}
            </span>
          </span>

          <h2 className="text-4xl sm:text-5xl font-black tracking-wide text-[#3E1C00] leading-none">
            YOU WON!
          </h2>
        </motion.div>

        {/* Main 3D Satin Studio Winning Pack */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{
            delay: 0.22,
            type: "spring",
            stiffness: 220,
            damping: 14,
          }}
          className="my-2 sm:my-3 relative flex flex-col items-center"
        >
          <WinningPack3D prize={prize} />
          <span className="text-[10px] font-extrabold tracking-wide uppercase text-[#5C2B00]/75 -mt-2">
            Drag to inspect pack
          </span>
        </motion.div>

        {/* Amount of Tokens & Ticker + Prize Name */}
        <motion.div
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="flex flex-col items-center mb-5"
        >
          <div className="text-3xl sm:text-4xl font-black text-[#3E1C00] leading-tight">
            {prize.isNft
              ? `1/1 ${prize.symbol}`
              : `${prize.amount} ${prize.symbol}`}
          </div>

          <p className="mt-1.5 text-sm sm:text-base font-extrabold text-[#4A2500]">
            {prize.name}
          </p>
        </motion.div>

        {/* Settled State or Side-by-Side Action Buttons */}
        {settledAction ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md rounded-3xl bg-[#FFFDF0]/95 border-[3px] border-[#5C2B00] p-5 shadow-[0_6px_0_#5C2B00]"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-600 text-emerald-700 flex items-center justify-center mx-auto mb-2.5">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-[#3E200C] mb-1">
              {settledAction === "sold"
                ? "SELL-BACK SETTLED!"
                : `${rewardLabel} SENT TO WALLET!`}
            </h4>
            <p className="text-xs font-bold text-[#52361F] mb-4">
              {settledAction === "sold"
                ? `Credited +${prize.sellBackUsdc.toFixed(2)} Tickets directly to your session balance.`
                : `Transferred ${rewardLabel} (${prize.name}) straight to your Solana Devnet wallet.`}
            </p>
            <GameButton variant="info" size="md" fullWidth onClick={onClose}>
              CONTINUE PLAYING
            </GameButton>
          </motion.div>
        ) : (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.36, duration: 0.35 }}
            className="w-full max-w-md flex flex-col gap-3"
          >
            <div
              className={
                pendingClaimOnly
                  ? "flex justify-center"
                  : "grid grid-cols-2 gap-3 w-full"
              }
            >
              {!pendingClaimOnly && (
                <GameButton
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={processingAction === "sell"}
                  disabled={isBusy}
                  leftIcon={
                    processingAction === "sell" ? undefined : (
                      <DollarSign className="w-4 h-4 text-[#167A2E]" />
                    )
                  }
                  onClick={handleSellBack}
                >
                  {processingAction === "sell" ? (
                    <span>SELLING...</span>
                  ) : (
                    <span className="flex flex-col items-center leading-tight">
                      <span className="text-xs sm:text-sm font-black">
                        SELL BACK +{prize.sellBackUsdc.toFixed(2)}
                      </span>
                    </span>
                  )}
                </GameButton>
              )}

              <GameButton
                variant="success"
                size="md"
                fullWidth={!pendingClaimOnly}
                isLoading={processingAction === "claim"}
                disabled={isBusy}
                leftIcon={
                  processingAction === "claim" ? undefined : (
                    <Wallet className="w-4 h-4" />
                  )
                }
                onClick={handleClaim}
              >
                {processingAction === "claim" ? (
                  <span>CLAIMING...</span>
                ) : (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-xs sm:text-sm font-black">CLAIM</span>
                    <span className="text-[10px] font-extrabold opacity-95">
                      TO WALLET
                    </span>
                  </span>
                )}
              </GameButton>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-100 border-2 border-rose-500 text-rose-900 text-xs font-bold break-all">
                {errorMsg}
              </div>
            )}
          </motion.div>
        )}

        {/* Explorer Verify Link */}
        <motion.a
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          href={`https://explorer.solana.com/address/${prize.mint}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF0]/75 hover:bg-[#FFFDF0] border border-[#B86B00]/50 text-[11px] font-extrabold text-[#5C2B00] transition-colors"
        >
          <span>Inspect Mint on Solana Explorer</span>
          <ExternalLink className="w-3 h-3" />
        </motion.a>
      </div>
    </SunburstBackground>
  );
};
