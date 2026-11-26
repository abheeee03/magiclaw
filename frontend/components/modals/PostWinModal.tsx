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
import { CartoonDialog } from "../Dialog";
import { GameButton } from "../Button";

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

  if (!prize) return null;

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

  const rewardLabel = prize.isNft
    ? `1/1 NFT (${prize.symbol})`
    : `${prize.amount} ${prize.symbol}`;

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="YOU WON!"
      subtitle={`Slot #${prize.slotId} • VRF Roll: ${prize.vrfRoll}/10,000 • ${(prize.effectiveOddsBps / 100).toFixed(0)}% Odds`}
    >
      <div className="flex items-center justify-center mb-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF6D6] border-2 border-[#C8963E] text-[11px] font-bold text-[#52361F]">
          <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
          <span>MAGICBLOCK VRF CONFIRMED GRIP</span>
        </span>
      </div>

      {/* Exact Won Prize Card */}
      <div className="rounded-2xl bg-[#FDF8EE] border-2 border-[#3E200C]/25 p-3.5 mb-4 flex items-center gap-3.5 shadow-[0_3px_0_rgba(62,32,12,0.18)]">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FFEAA0] to-[#F7D674] border-2 border-[#C8963E] flex items-center justify-center text-4xl shrink-0 overflow-hidden shadow-inner">
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
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#3DA4FF]/15 border border-[#1E7DF2]/40 text-[#0D3B8A]">
              {prize.tierName}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3E200C]/10 text-[#3E200C] border border-[#3E200C]/20 inline-flex items-center gap-1">
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
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 border border-emerald-600/40">
                🎯 +3%
              </span>
            )}
          </div>

          <h3 className="text-lg font-black text-[#3E200C] truncate mt-1">
            {prize.name}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-lg bg-[#1E7DF2]/15 border border-[#1E7DF2]/35 text-[#0D3B8A] font-bold">
              Reward: {rewardLabel}
            </span>
            <span className="text-[#6E4B2A] font-bold">
              Buyback:{" "}
              <strong className="text-[#B45309] font-black">
                {prize.sellBackUsdc.toFixed(2)} Tickets
              </strong>
            </span>
          </div>

          <div className="mt-1 text-[10px] text-[#6E4B2A]/80 truncate">
            Mint: {prize.mint.slice(0, 8)}...{prize.mint.slice(-8)}
          </div>
        </div>
      </div>

      {settledAction ? (
        <div className="text-center py-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-600 text-emerald-700 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-black text-[#3E200C] mb-1">
            {settledAction === "sold"
              ? "SELL-BACK SETTLED!"
              : `${rewardLabel} SENT TO WALLET!`}
          </h4>
          <p className="text-xs text-[#52361F] mb-4">
            {settledAction === "sold"
              ? `Credited +${prize.sellBackUsdc.toFixed(2)} Tickets directly to your session balance.`
              : `Transferred ${rewardLabel} (${prize.name}) from Vault PDA straight to your Solana Devnet wallet.`}
          </p>
          <GameButton variant="info" size="md" fullWidth onClick={onClose}>
            CONTINUE PLAYING
          </GameButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!pendingClaimOnly && (
            <GameButton
              variant="success"
              size="md"
              fullWidth
              isLoading={isProcessing}
              disabled={isProcessing}
              leftIcon={<DollarSign className="w-4 h-4" />}
              onClick={handleSellBack}
            >
              {isProcessing
                ? "PROCESSING..."
                : `INSTANT SELL-BACK (+${prize.sellBackUsdc.toFixed(2)} 🎟️)`}
            </GameButton>
          )}

          <GameButton
            variant="accent"
            size="md"
            fullWidth
            isLoading={isProcessing}
            disabled={isProcessing}
            leftIcon={<Wallet className="w-4 h-4" />}
            onClick={handleClaim}
          >
            {isProcessing
              ? "SETTLING TO WALLET..."
              : pendingClaimOnly
              ? `CLAIM ${rewardLabel} TO WALLET`
              : `CLAIM ${rewardLabel}`}
          </GameButton>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-100 border-2 border-rose-400 text-rose-800 text-[11px] break-all">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Explorer Verify Link */}
      <div className="mt-4 pt-3 border-t border-[#3E200C]/15 flex items-center justify-between text-[11px] text-[#52361F]">
        <span>Solana Devnet Custody</span>
        <a
          href={`https://explorer.solana.com/address/${prize.mint}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[#0D3B8A] hover:underline font-bold"
        >
          <span>Inspect Won Mint</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </CartoonDialog>
  );
};
