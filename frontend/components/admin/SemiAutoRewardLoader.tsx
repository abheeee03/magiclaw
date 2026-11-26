"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  Sparkles,
  Layers,
  Coins,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Shuffle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { PRIZE_TIERS } from "../../lib/constants";
import { baseConnection, confirmTx, erConnection } from "../../lib/solana";
import {
  SavedAdminMintMeta,
  WalletTokenInfo,
  buildBatchedStockPrizeSlotTxs,
  createDelegateMachineIx,
  createUndelegateMachineIx,
  formatWalletTokenOptionLabel,
  waitForMachineUndelegated,
} from "../../lib/adminSolana";
import {
  BuybackConfigMode,
  DEFAULT_TIER_WEIGHTS,
  DistributionMode,
  RewardDistributionPlan,
  RoundingMode,
  autoDistributeTierCounts,
  computeRewardDistributionPlan,
  formatBaseUnits,
} from "../../lib/rewardDistributor";
import { MachineConfigData } from "../../lib/types";

interface SemiAutoRewardLoaderProps {
  machine: MachineConfigData;
  machineId: bigint;
  machinePda: PublicKey;
  walletTokens: WalletTokenInfo[];
  savedMintMeta: Record<string, SavedAdminMintMeta>;
  txLoading: boolean;
  setTxLoading: (loading: boolean) => void;
  onPlanChange?: (plan: RewardDistributionPlan | null) => void;
  onComplete: (res: { type: "ok" | "err"; text: string; sig?: string }) => void;
  onRefresh: () => Promise<void>;
}

const TIER_PRESETS: Array<{
  id: string;
  label: string;
  ratios: [number, number, number, number];
}> = [
  { id: "balanced", label: "Balanced Arcade", ratios: [0.5, 0.25, 0.15, 0.1] },
  { id: "common", label: "Common Heavy", ratios: [0.65, 0.25, 0.08, 0.02] },
  { id: "high_roller", label: "High Roller", ratios: [0.25, 0.25, 0.3, 0.2] },
  { id: "even", label: "Equal Tiers", ratios: [0.25, 0.25, 0.25, 0.25] },
];

export const SemiAutoRewardLoader: React.FC<SemiAutoRewardLoaderProps> = ({
  machine,
  machineId,
  machinePda,
  walletTokens,
  savedMintMeta,
  txLoading,
  setTxLoading,
  onPlanChange,
  onComplete,
  onRefresh,
}) => {
  const { publicKey, sendTransaction, signTransaction, signAllTransactions } =
    useWallet();

  const emptyCount = useMemo(
    () => machine.slots.filter((s) => !s.inStock).length,
    [machine.slots]
  );

  // Pick a sensible default non-USDC fungible token if available
  const preferredDefaultToken = useMemo(() => {
    const usdcStr = machine.usdcMint.toBase58();
    return (
      walletTokens.find(
        (t) => t.mint !== usdcStr && t.amountRaw > BigInt(0) && t.decimals > 0
      ) ||
      walletTokens.find((t) => t.mint !== usdcStr && t.amountRaw > BigInt(0)) ||
      walletTokens[0] ||
      null
    );
  }, [walletTokens, machine.usdcMint]);

  const [selectedMint, setSelectedMint] = useState<string>("");
  const effectiveMint = selectedMint || preferredDefaultToken?.mint || "";

  const selectedTokenInfo = useMemo(
    () => walletTokens.find((t) => t.mint === effectiveMint) || null,
    [walletTokens, effectiveMint]
  );

  const tokenDecimals = selectedTokenInfo?.decimals ?? 6;
  const walletBalanceRaw = selectedTokenInfo?.amountRaw ?? BigInt(0);
  const selectedMeta = effectiveMint ? savedMintMeta[effectiveMint] : undefined;
  const selectedTokenSymbol =
    selectedTokenInfo?.symbol || selectedMeta?.symbol;
  const selectedTokenName =
    selectedTokenInfo?.name || selectedMeta?.name;

  const [totalDepositInput, setTotalDepositInput] = useState<string>("1000");
  const [overwriteStocked, setOverwriteStocked] = useState<boolean>(false);
  const [tierCounts, setTierCounts] = useState<[number, number, number, number]>(() =>
    autoDistributeTierCounts(emptyCount > 0 ? emptyCount : 8)
  );
  const [distributionMode, setDistributionMode] =
    useState<DistributionMode>("tier_weighted");
  const [tierWeights, setTierWeights] = useState<
    [number, number, number, number]
  >(DEFAULT_TIER_WEIGHTS);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>("clean");
  const [buybackMode, setBuybackMode] =
    useState<BuybackConfigMode>("price_per_token");
  const [tokenPriceUsd, setTokenPriceUsd] = useState<string>("0.10");
  const [manualTierBuybacksUsd, setManualTierBuybacksUsd] = useState<
    [string, string, string, string]
  >(["0.90", "3.00", "8.00", "20.00"]);
  const [priceFeed, setPriceFeed] = useState<string>(
    PublicKey.default.toBase58()
  );
  const [randomizeCoords, setRandomizeCoords] = useState<boolean>(false);
  const [autoManageDelegation, setAutoManageDelegation] =
    useState<boolean>(true);
  const [reDelegateAfter, setReDelegateAfter] = useState<boolean>(true);
  const [showSlotPreview, setShowSlotPreview] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [batchSigs, setBatchSigs] = useState<string[]>([]);

  const maxAssignableSlots = overwriteStocked ? 16 : emptyCount;
  const currentTotalSlots =
    tierCounts[0] + tierCounts[1] + tierCounts[2] + tierCounts[3];

  const plan = useMemo(() => {
    if (!effectiveMint) return null;
    return computeRewardDistributionPlan({
      machine,
      machinePda,
      mint: effectiveMint,
      decimals: tokenDecimals,
      symbol: selectedTokenSymbol,
      walletBalanceRaw,
      totalDepositInput,
      tierCounts,
      distributionMode,
      tierWeights,
      roundingMode,
      buybackMode,
      tokenPriceUsd,
      manualTierBuybacksUsd,
      priceFeed,
      overwriteStocked,
      randomizeCoords,
    });
  }, [
    effectiveMint,
    machine,
    machinePda,
    tokenDecimals,
    selectedTokenSymbol,
    walletBalanceRaw,
    totalDepositInput,
    tierCounts,
    distributionMode,
    tierWeights,
    roundingMode,
    buybackMode,
    tokenPriceUsd,
    manualTierBuybacksUsd,
    priceFeed,
    overwriteStocked,
    randomizeCoords,
  ]);

  useEffect(() => {
    onPlanChange?.(plan);
  }, [plan, onPlanChange]);

  const handleTotalSlotsChange = (nextTotal: number) => {
    const clamped = Math.max(0, Math.min(maxAssignableSlots, nextTotal));
    setTierCounts(autoDistributeTierCounts(clamped));
  };

  const handleTierCountDelta = (tier: number, delta: number) => {
    setTierCounts((prev) => {
      const next: [number, number, number, number] = [...prev] as [
        number,
        number,
        number,
        number,
      ];
      const nextVal = Math.max(0, next[tier] + delta);
      const otherSum =
        prev[0] + prev[1] + prev[2] + prev[3] - prev[tier];
      const capped = Math.min(nextVal, Math.max(0, maxAssignableSlots - otherSum));
      next[tier] = capped;
      return next;
    });
  };

  const handleTierCountInput = (tier: number, rawVal: string) => {
    const parsed = Math.max(0, Math.min(16, Math.floor(Number(rawVal) || 0)));
    setTierCounts((prev) => {
      const otherSum =
        prev[0] + prev[1] + prev[2] + prev[3] - prev[tier];
      const next: [number, number, number, number] = [...prev] as [
        number,
        number,
        number,
        number,
      ];
      next[tier] = Math.min(parsed, Math.max(0, maxAssignableSlots - otherSum));
      return next;
    });
  };

  const applyDepositFraction = (pct: number) => {
    if (walletBalanceRaw <= BigInt(0)) return;
    const portion =
      pct === 100
        ? walletBalanceRaw
        : (walletBalanceRaw * BigInt(pct)) / BigInt(100);
    setTotalDepositInput(formatBaseUnits(portion, tokenDecimals));
  };

  const handleExecuteDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !plan || !plan.valid) return;

    if (machine.isDelegated && !autoManageDelegation) {
      onComplete({
        type: "err",
        text: "Machine is delegated to MagicBlock ER. Enable auto-undelegate or undelegate to L1 first.",
      });
      return;
    }

    setTxLoading(true);
    setBatchSigs([]);
    const recordedSigs: string[] = [];

    try {
      // Step 1: Undelegate from ER if currently delegated
      if (machine.isDelegated) {
        if (!signTransaction) {
          throw new Error(
            "Connected wallet does not support signTransaction for MagicBlock ER."
          );
        }
        setProgressText("1/3 Undelegating MachineConfig from MagicBlock ER...");
        const undelTx = new Transaction().add(
          createUndelegateMachineIx(publicKey, machineId)
        );
        const { blockhash: erHash } =
          await erConnection.getLatestBlockhash("confirmed");
        undelTx.recentBlockhash = erHash;
        undelTx.feePayer = publicKey;
        const signedUndel = await signTransaction(undelTx);
        const undelSig = await erConnection.sendRawTransaction(
          signedUndel.serialize(),
          { skipPreflight: true }
        );
        await confirmTx(erConnection, undelSig);
        recordedSigs.push(undelSig);
        setBatchSigs([...recordedSigs]);

        setProgressText("Waiting for MachineConfig ownership to settle on Solana L1...");
        const settled = await waitForMachineUndelegated(machineId, 25_000);
        if (!settled) {
          throw new Error(
            "Timed out waiting for MachineConfig to undelegate back to Solana L1."
          );
        }
      }

      // Step 2: Build batched L1 stock_prize_slot transactions
      const mintPk = new PublicKey(effectiveMint.trim());
      const feedPk = new PublicKey(
        priceFeed.trim() || PublicKey.default.toBase58()
      );
      const txs = buildBatchedStockPrizeSlotTxs({
        admin: publicKey,
        machineId,
        prizeMint: mintPk,
        priceFeed: feedPk,
        allocations: plan.allocations,
        batchSize: 5,
      });

      if (signAllTransactions && txs.length > 1) {
        setProgressText(
          `Requesting wallet signature for ${txs.length} deposit batch(es)...`
        );
        const { blockhash } =
          await baseConnection.getLatestBlockhash("confirmed");
        for (const tx of txs) {
          tx.recentBlockhash = blockhash;
          tx.feePayer = publicKey;
        }
        const signedTxs = await signAllTransactions(txs);
        for (let i = 0; i < signedTxs.length; i++) {
          setProgressText(
            `Confirming L1 deposit batch ${i + 1} / ${signedTxs.length}...`
          );
          const sig = await baseConnection.sendRawTransaction(
            signedTxs[i].serialize()
          );
          await confirmTx(baseConnection, sig);
          recordedSigs.push(sig);
          setBatchSigs([...recordedSigs]);
        }
      } else {
        for (let i = 0; i < txs.length; i++) {
          setProgressText(
            `Sending & confirming L1 deposit batch ${i + 1} / ${txs.length}...`
          );
          const { blockhash } =
            await baseConnection.getLatestBlockhash("confirmed");
          txs[i].recentBlockhash = blockhash;
          txs[i].feePayer = publicKey;
          const sig = await sendTransaction(txs[i], baseConnection);
          await confirmTx(baseConnection, sig);
          recordedSigs.push(sig);
          setBatchSigs([...recordedSigs]);
        }
      }

      // Step 3: Optionally re-delegate machine to ER
      if (machine.isDelegated && autoManageDelegation && reDelegateAfter) {
        setProgressText("Re-delegating MachineConfig back to MagicBlock ER...");
        const delTx = new Transaction().add(
          createDelegateMachineIx(publicKey, machineId)
        );
        const { blockhash } =
          await baseConnection.getLatestBlockhash("confirmed");
        delTx.recentBlockhash = blockhash;
        delTx.feePayer = publicKey;
        const delSig = await sendTransaction(delTx, baseConnection);
        await confirmTx(baseConnection, delSig);
        recordedSigs.push(delSig);
        setBatchSigs([...recordedSigs]);
      }

      const tokenLabel =
        selectedTokenSymbol || selectedTokenName || `${effectiveMint.slice(0, 6)}...`;
      onComplete({
        type: "ok",
        text: `Loaded & distributed ${formatBaseUnits(
          plan.totalAllocatedRaw,
          tokenDecimals
        )} ${tokenLabel} across ${plan.totalSlots} slot(s) in ${txs.length} batch tx(s)!`,
        sig: recordedSigs[recordedSigs.length - 1],
      });
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onComplete({ type: "err", text: msg });
    } finally {
      setProgressText(null);
      setTxLoading(false);
    }
  };

  return (
    <form onSubmit={handleExecuteDistribution} className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-arcade text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            SEMI-AUTO REWARD LOADER
          </h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            Deposit one token once — auto-split packs across configured tiers &amp; slots.
          </p>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shrink-0">
          {emptyCount} empty / 16
        </span>
      </div>

      {/* 1. Token & Total Deposit */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            1. Single Token &amp; Total Deposit
          </span>
          {selectedTokenInfo && (
            <span className="text-[10px] font-mono text-slate-400">
              Available:{" "}
              <strong className="text-emerald-300">
                {selectedTokenInfo.uiAmount} {selectedTokenSymbol || "tokens"}
              </strong>
            </span>
          )}
        </div>

        <select
          value={effectiveMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-cyan-300 font-mono"
        >
          <option value="">-- Choose Wallet SPL Token --</option>
          {walletTokens.map((t) => {
            const meta = savedMintMeta[t.mint];
            return (
              <option key={t.ata} value={t.mint}>
                {formatWalletTokenOptionLabel(t, meta)}
              </option>
            );
          })}
        </select>

        <input
          value={effectiveMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          placeholder="Or paste SPL Mint Pubkey..."
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 font-mono"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-mono text-slate-400 mb-1">
              Total Tokens to Deposit &amp; Distribute
            </label>
            <input
              type="text"
              value={totalDepositInput}
              onChange={(e) => setTotalDepositInput(e.target.value)}
              placeholder="e.g. 1000"
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
            />
          </div>
          <div className="flex items-end gap-1 pt-4">
            {[25, 50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={walletBalanceRaw <= BigInt(0)}
                onClick={() => applyDepositFraction(pct)}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[10px] font-mono text-cyan-300 cursor-pointer"
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Slots & Tier Allocation */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            2. Slots &amp; Tier Allocation
          </span>
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!overwriteStocked}
              onChange={(e) => {
                const onlyEmpty = e.target.checked;
                setOverwriteStocked(!onlyEmpty);
                const nextMax = onlyEmpty ? emptyCount : 16;
                if (currentTotalSlots > nextMax) {
                  setTierCounts(autoDistributeTierCounts(nextMax));
                }
              }}
              className="rounded"
            />
            Empty slots only
          </label>
        </div>

        {/* Total Slots slider & quick action */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">
              Slots for this token:{" "}
              <strong className="text-white">{currentTotalSlots}</strong> /{" "}
              {maxAssignableSlots} available
            </span>
            <button
              type="button"
              onClick={() => handleTotalSlotsChange(maxAssignableSlots)}
              disabled={maxAssignableSlots === 0}
              className="text-[10px] text-cyan-400 hover:underline disabled:opacity-40 cursor-pointer"
            >
              Use all ({maxAssignableSlots})
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxAssignableSlots)}
            value={Math.min(currentTotalSlots, maxAssignableSlots)}
            disabled={maxAssignableSlots === 0}
            onChange={(e) => handleTotalSlotsChange(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {TIER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={maxAssignableSlots === 0}
              onClick={() =>
                setTierCounts(
                  autoDistributeTierCounts(
                    currentTotalSlots > 0
                      ? currentTotalSlots
                      : maxAssignableSlots,
                    preset.ratios
                  )
                )
              }
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 4 Tier Steppers */}
        <div className="grid grid-cols-2 gap-2">
          {PRIZE_TIERS.map((t) => {
            const count = tierCounts[t.tier];
            return (
              <div
                key={t.tier}
                className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div
                    className="text-[11px] font-bold leading-tight"
                    style={{ color: t.color }}
                  >
                    {t.name}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500">
                    {t.oddsLabel} odds
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleTierCountDelta(t.tier, -1)}
                    disabled={count <= 0}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold text-white cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={maxAssignableSlots}
                    value={count}
                    onChange={(e) =>
                      handleTierCountInput(t.tier, e.target.value)
                    }
                    className="w-9 text-center rounded-lg bg-slate-950 border border-slate-700 py-0.5 text-xs font-mono text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleTierCountDelta(t.tier, 1)}
                    disabled={currentTotalSlots >= maxAssignableSlots}
                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold text-white cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Pack Distribution & Buyback Config */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
            3. Pack Sizing &amp; Buyback Rules
          </span>
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            {(["clean", "exact"] as const).map((rm) => (
              <button
                key={rm}
                type="button"
                onClick={() => setRoundingMode(rm)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                  roundingMode === rm
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400"
                }`}
              >
                {rm === "clean" ? "Clean Packs" : "Exact Split"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "tier_weighted" as const, label: "Tier Weights" },
            { id: "inverse_odds" as const, label: "Inverse Odds" },
            { id: "equal" as const, label: "Equal Split" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDistributionMode(m.id)}
              className={`py-1.5 px-2 rounded-xl border text-[10px] font-mono cursor-pointer transition ${
                distributionMode === m.id
                  ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {distributionMode === "tier_weighted" && (
          <div className="grid grid-cols-4 gap-1.5">
            {PRIZE_TIERS.map((t) => (
              <div key={t.tier}>
                <label
                  className="block text-[9px] font-mono mb-0.5"
                  style={{ color: t.color }}
                >
                  {t.name} Wt
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={tierWeights[t.tier]}
                  onChange={(e) => {
                    const val = Math.max(0.1, Number(e.target.value) || 1);
                    setTierWeights((prev) => {
                      const next: [number, number, number, number] = [
                        ...prev,
                      ] as [number, number, number, number];
                      next[t.tier] = val;
                      return next;
                    });
                  }}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-mono text-white"
                />
              </div>
            ))}
          </div>
        )}

        {/* Buyback Mode */}
        <div className="pt-1 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-slate-400">
              USDC Buyback Floor
            </span>
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setBuybackMode("price_per_token")}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                  buybackMode === "price_per_token"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-400"
                }`}
              >
                From Token $
              </button>
              <button
                type="button"
                onClick={() => setBuybackMode("per_tier_usd")}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                  buybackMode === "per_tier_usd"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-400"
                }`}
              >
                Per-Tier $
              </button>
            </div>
          </div>

          {buybackMode === "price_per_token" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-0.5">
                  Est. Token Price ($ USD)
                </label>
                <input
                  type="text"
                  value={tokenPriceUsd}
                  onChange={(e) => setTokenPriceUsd(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-0.5">
                  Pyth Price Feed (optional)
                </label>
                <input
                  type="text"
                  value={priceFeed}
                  onChange={(e) => setPriceFeed(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-[10px] font-mono text-slate-300"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {PRIZE_TIERS.map((t) => (
                <div key={t.tier}>
                  <label
                    className="block text-[9px] font-mono mb-0.5"
                    style={{ color: t.color }}
                  >
                    {t.name} ($)
                  </label>
                  <input
                    type="text"
                    value={manualTierBuybacksUsd[t.tier]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualTierBuybacksUsd((prev) => {
                        const next: [string, string, string, string] = [
                          ...prev,
                        ] as [string, string, string, string];
                        next[t.tier] = val;
                        return next;
                      });
                    }}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-mono text-white"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeCoords}
                onChange={(e) => setRandomizeCoords(e.target.checked)}
                className="rounded"
              />
              <Shuffle className="w-3 h-3 text-cyan-400" />
              Randomize cabinet (X, Z) coords
            </label>
          </div>
        </div>
      </div>

      {/* 4. Live Distribution Summary & Preview */}
      {plan && (
        <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">
              Distribution Preview ({plan.totalSlots} slots • {plan.batchCount} tx)
            </span>
            <button
              type="button"
              onClick={() => setShowSlotPreview((s) => !s)}
              className="text-[10px] font-mono text-cyan-300 flex items-center gap-1 hover:underline cursor-pointer"
            >
              {showSlotPreview ? "Hide Slots" : "Inspect Slots"}
              {showSlotPreview ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {plan.tierSummaries
              .filter((ts) => ts.slotCount > 0)
              .map((ts) => (
                <div
                  key={ts.tier}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-mono"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: ts.color }}>
                      {ts.name} ({ts.slotCount})
                    </span>
                    <span className="text-slate-400">${ts.buybackUsdFormatted}</span>
                  </div>
                  <div className="text-white font-bold mt-0.5 truncate">
                    {ts.perSlotUi} / win
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">
                    Total: {ts.totalTierUi}
                  </div>
                </div>
              ))}
          </div>

          {showSlotPreview && plan.allocations.length > 0 && (
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1 pt-1 border-t border-slate-800">
              {plan.allocations.map((a) => {
                const tierCfg = PRIZE_TIERS[a.tier] || PRIZE_TIERS[0];
                return (
                  <div
                    key={a.slotId}
                    className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-900/70"
                  >
                    <span className="text-slate-200">
                      #{a.slotId}{" "}
                      <span style={{ color: tierCfg.color }}>
                        {tierCfg.name}
                      </span>{" "}
                      {a.wasAlreadyInStock && (
                        <span className="text-amber-400">(overwrite)</span>
                      )}
                    </span>
                    <span className="text-emerald-300 font-bold">
                      {a.prizeAmountUi} • ${a.fallbackBuybackUsdFormatted}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {plan.warnings.map((w, i) => (
            <div
              key={i}
              className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}

          {plan.errors.map((err, i) => (
            <div
              key={i}
              className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[10px] font-mono flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* ER Delegation Handling Notice */}
      {machine.isDelegated && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-2">
          <div className="flex items-start gap-2 text-[11px] font-mono text-amber-200">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Machine is currently delegated to <strong>MagicBlock ER</strong>. Stocking runs on Solana L1.
            </span>
          </div>
          <div className="flex flex-wrap gap-3 pl-6">
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoManageDelegation}
                onChange={(e) => setAutoManageDelegation(e.target.checked)}
                className="rounded"
              />
              Auto-undelegate to L1 before deposit
            </label>
            {autoManageDelegation && (
              <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reDelegateAfter}
                  onChange={(e) => setReDelegateAfter(e.target.checked)}
                  className="rounded"
                />
                Re-delegate to ER after deposit
              </label>
            )}
          </div>
        </div>
      )}

      {/* Progress & Batch Sigs */}
      {(progressText || batchSigs.length > 0) && (
        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-1.5 text-[11px] font-mono">
          {progressText && (
            <div className="flex items-center gap-2 text-cyan-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progressText}</span>
            </div>
          )}
          {batchSigs.map((sig, i) => (
            <div
              key={sig}
              className="flex items-center justify-between text-[10px] text-emerald-300"
            >
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Tx {i + 1} confirmed
              </span>
              <a
                href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline text-cyan-300"
              >
                Explorer <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={
          txLoading ||
          !publicKey ||
          !plan?.valid ||
          Boolean(machine.isDelegated && !autoManageDelegation)
        }
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:brightness-110 disabled:opacity-40 text-white font-arcade font-bold text-xs cursor-pointer shadow-lg flex items-center justify-center gap-2"
      >
        <Sparkles className="w-4 h-4" />
        {!publicKey
          ? "CONNECT ADMIN WALLET"
          : txLoading
          ? "DISTRIBUTING & DEPOSITING..."
          : machine.isDelegated && autoManageDelegation
          ? `UNDELEGATE, DEPOSIT & DISTRIBUTE (${plan?.totalSlots ?? 0} SLOTS)`
          : `DEPOSIT & DISTRIBUTE ACROSS ${plan?.totalSlots ?? 0} SLOTS`}
      </button>
    </form>
  );
};
