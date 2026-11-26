"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  Sliders,
  Coins,
  Zap,
  Package,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Target,
} from "lucide-react";
import { AdminShell } from "../../components/admin/AdminShell";
import { SemiAutoRewardLoader } from "../../components/admin/SemiAutoRewardLoader";
import {
  BULLSEYE_RADIUS,
  CAPTURE_RADIUS,
  DEAD_CENTER_BONUS_BPS,
  MACHINE_ID,
  PLAY_DURATION_SECS,
  PRIZE_TIERS,
} from "../../lib/constants";
import { getMachinePda, getVaultAuthorityPda } from "../../lib/pda";
import { baseConnection, confirmTx, erConnection, getDefaultPrizeSlots } from "../../lib/solana";
import {
  SavedAdminMintMeta,
  WalletTokenInfo,
  createDelegateMachineIx,
  createFundUsdcLiquidityIx,
  createInitializeMachineIx,
  createStockPrizeSlotIx,
  createUndelegateMachineIx,
  fetchOnchainMachineConfig,
  fetchTokenBalance,
  fetchWalletTokenAccounts,
  formatWalletTokenOptionLabel,
  getSavedAdminMintMetaMap,
} from "../../lib/adminSolana";
import {
  RewardDistributionPlan,
  formatBaseUnits,
  toBaseUnits,
} from "../../lib/rewardDistributor";
import { MachineConfigData } from "../../lib/types";

export default function AdminMachinePage() {
  const { publicKey, sendTransaction, signTransaction } = useWallet();

  const [machineId] = useState<bigint>(MACHINE_ID);
  const [machine, setMachine] = useState<MachineConfigData | null>(null);
  const [vaultUsdcBalance, setVaultUsdcBalance] = useState<bigint>(BigInt(0));
  const [walletTokens, setWalletTokens] = useState<WalletTokenInfo[]>([]);
  const [savedMintMeta, setSavedMintMeta] = useState<
    Record<string, SavedAdminMintMeta>
  >({});
  const [stockMode, setStockMode] = useState<"semi_auto" | "manual">("semi_auto");
  const [plannedDistribution, setPlannedDistribution] =
    useState<RewardDistributionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
    sig?: string;
  } | null>(null);

  // Initialize Machine Form
  const [usdcMintInput, setUsdcMintInput] = useState(
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  );
  const [playFeeUsd, setPlayFeeUsd] = useState("1.00");
  const [playDuration, setPlayDuration] = useState(String(PLAY_DURATION_SECS));

  // Fund USDC Form
  const [fundUsdcInput, setFundUsdcInput] = useState("250");

  // Stock Slot Form
  const [machinePda] = useMemo(() => getMachinePda(machineId), [machineId]);
  const [vaultAuthorityPda] = useMemo(
    () => getVaultAuthorityPda(machinePda),
    [machinePda]
  );
  const defaultLayout = useMemo(
    () => getDefaultPrizeSlots(machinePda),
    [machinePda]
  );
  const [selectedSlotId, setSelectedSlotId] = useState(0);
  const [slotMintInput, setSlotMintInput] = useState("");
  const [slotAmountInput, setSlotAmountInput] = useState("10");
  const [slotTier, setSlotTier] = useState(0);
  const [slotX, setSlotX] = useState(defaultLayout[0].x);
  const [slotZ, setSlotZ] = useState(defaultLayout[0].z);
  const [slotBuybackUsd, setSlotBuybackUsd] = useState("0.90");
  const [slotPriceFeed, setSlotPriceFeed] = useState(
    PublicKey.default.toBase58()
  );

  const publicKeyBase58 = publicKey?.toBase58() ?? null;

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setSavedMintMeta(getSavedAdminMintMetaMap());
    try {
      const cfg = await fetchOnchainMachineConfig(machineId);
      setMachine(cfg);
      if (cfg) {
        const bal = await fetchTokenBalance(
          vaultAuthorityPda,
          cfg.usdcMint,
          true
        );
        setVaultUsdcBalance(bal);
      } else {
        setVaultUsdcBalance(BigInt(0));
      }

      if (publicKeyBase58) {
        const ownerPk = new PublicKey(publicKeyBase58);
        const tokens = await fetchWalletTokenAccounts(ownerPk);
        setWalletTokens(tokens);
        if (!cfg) {
          const sixDec = tokens.find((t) => t.decimals === 6);
          if (sixDec) setUsdcMintInput(sixDec.mint);
        }
        if (tokens.length > 0) {
          setSlotMintInput((prev) => prev || tokens[0].mint);
        }
      } else {
        setWalletTokens([]);
      }
    } catch (err) {
      console.error("Failed to load machine admin state:", err);
    } finally {
      setLoading(false);
    }
  }, [machineId, publicKeyBase58, vaultAuthorityPda]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const selectSlot = (slotId: number) => {
    setSelectedSlotId(slotId);
    const onchainSlot = machine?.slots[slotId];
    const fallbackCoord = defaultLayout[slotId];
    if (onchainSlot && onchainSlot.prizeMint.toBase58() !== PublicKey.default.toBase58()) {
      setSlotMintInput(onchainSlot.prizeMint.toBase58());
      setSlotAmountInput(
        formatBaseUnits(onchainSlot.prizeAmount, onchainSlot.prizeDecimals)
      );
      setSlotTier(onchainSlot.tier);
      setSlotX(onchainSlot.x);
      setSlotZ(onchainSlot.z);
      setSlotBuybackUsd(
        (Number(onchainSlot.fallbackBuybackUsdc) / 1_000_000).toFixed(2)
      );
      setSlotPriceFeed(onchainSlot.priceFeed.toBase58());
    } else if (fallbackCoord) {
      setSlotTier(fallbackCoord.tier);
      setSlotX(fallbackCoord.x);
      setSlotZ(fallbackCoord.z);
      setSlotBuybackUsd(
        (Number(fallbackCoord.fallbackBuybackUsdc) / 1_000_000).toFixed(2)
      );
    }
  };

  const sendL1Tx = async (tx: Transaction, okMsg: string) => {
    if (!publicKey) return;
    setTxLoading(true);
    setStatusMsg(null);
    try {
      const { blockhash } =
        await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, baseConnection);
      await confirmTx(baseConnection, sig);
      setStatusMsg({ type: "ok", text: okMsg, sig });
      await refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "err", text: msg });
    } finally {
      setTxLoading(false);
    }
  };

  const handleInitializeMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;
    const tx = new Transaction().add(
      createInitializeMachineIx({
        admin: publicKey,
        machineId,
        usdcMint: new PublicKey(usdcMintInput.trim()),
        playFeeUsdc: toBaseUnits(playFeeUsd, 6),
        gripBps: [6500, 3200, 1200, 400],
        buybackBps: [9000, 9200, 9500, 9500],
        bullseyeBonusBps: DEAD_CENTER_BONUS_BPS,
        captureRadius: CAPTURE_RADIUS,
        bullseyeRadius: BULLSEYE_RADIUS,
        playDurationSecs: BigInt(Number(playDuration) || 15),
      })
    );
    await sendL1Tx(tx, `Initialized Machine #${machineId.toString()} on Devnet L1!`);
  };

  const handleFundUsdc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !machine) return;
    const tx = new Transaction().add(
      createFundUsdcLiquidityIx({
        admin: publicKey,
        machineId,
        usdcMint: machine.usdcMint,
        amountUsdc: toBaseUnits(fundUsdcInput, 6),
      })
    );
    await sendL1Tx(
      tx,
      `Funded +$${fundUsdcInput} USDC into Machine Vault!`
    );
  };

  const handleStockSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !machine) return;
    if (machine.isDelegated) {
      setStatusMsg({
        type: "err",
        text: "MachineConfig is delegated to ER. stock_prize_slot only runs on L1 before delegation.",
      });
      return;
    }

    const mintPk = new PublicKey(slotMintInput.trim());
    const tokenInfo = walletTokens.find((t) => t.mint === mintPk.toBase58());
    const decimals = tokenInfo ? tokenInfo.decimals : 6;
    const rawAmount = toBaseUnits(slotAmountInput, decimals);
    if (rawAmount <= BigInt(0)) {
      setStatusMsg({ type: "err", text: "Prize amount must be > 0." });
      return;
    }

    const tx = new Transaction().add(
      createStockPrizeSlotIx({
        admin: publicKey,
        machineId,
        prizeMint: mintPk,
        slotId: selectedSlotId,
        tier: slotTier,
        x: Math.max(0, Math.min(1000, Number(slotX))),
        z: Math.max(0, Math.min(1000, Number(slotZ))),
        prizeAmount: rawAmount,
        priceFeed: new PublicKey(slotPriceFeed.trim() || PublicKey.default.toBase58()),
        fallbackBuybackUsdc: toBaseUnits(slotBuybackUsd, 6),
      })
    );
    await sendL1Tx(
      tx,
      `Stocked Slot #${selectedSlotId} with ${slotAmountInput} tokens!`
    );
    // Advance selection to next empty slot to prevent accidental overwrites
    const refreshed = await fetchOnchainMachineConfig(machineId);
    const nextEmpty = refreshed?.slots.find((s) => !s.inStock);
    if (nextEmpty) {
      selectSlot(nextEmpty.slotId);
    }
  };

  const handleDelegateMachine = async () => {
    if (!publicKey || !machine) return;
    const tx = new Transaction().add(
      createDelegateMachineIx(publicKey, machineId)
    );
    await sendL1Tx(tx, `Delegated Machine #${machineId.toString()} to MagicBlock ER!`);
  };

  const handleUndelegateMachine = async () => {
    if (!publicKey || !machine) return;
    setTxLoading(true);
    setStatusMsg(null);
    try {
      const tx = new Transaction().add(
        createUndelegateMachineIx(publicKey, machineId)
      );
      const { blockhash } =
        await erConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      if (!signTransaction) {
        throw new Error("Wallet does not support signTransaction for MagicBlock ER.");
      }
      const signed = await signTransaction(tx);
      const sig = await erConnection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      });
      await confirmTx(erConnection, sig);
      setStatusMsg({
        type: "ok",
        text: `Undelegated Machine #${machineId.toString()} back to Solana L1!`,
        sig,
      });
      await refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "err", text: msg });
    } finally {
      setTxLoading(false);
    }
  };

  const stockedCount = machine
    ? machine.slots.filter((s) => s.inStock).length
    : 0;

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade text-2xl font-black text-white tracking-wide">
              MACHINE #{machineId.toString()} &amp; PRIZE INVENTORY
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              PDA:{" "}
              <a
                href={`https://explorer.solana.com/address/${machinePda.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline inline-flex items-center gap-1"
              >
                {machinePda.toBase58()} <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/mint-prizes"
              className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-arcade font-bold flex items-center gap-1.5 hover:bg-amber-500/25"
            >
              <Coins className="w-3.5 h-3.5" />
              Mint New Tokens / NFTs
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-4 rounded-2xl border text-xs font-mono flex flex-wrap items-center justify-between gap-2 ${
              statusMsg.type === "ok"
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/40 text-rose-300"
            }`}
          >
            <span className="break-all">{statusMsg.text}</span>
            {statusMsg.sig && (
              <a
                href={`https://explorer.solana.com/tx/${statusMsg.sig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline text-cyan-300 shrink-0"
              >
                Explorer Tx <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Top Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-mono text-slate-400 uppercase">
              Onchain Status
            </div>
            <div className="mt-1 font-arcade text-sm font-black">
              {!machine ? (
                <span className="text-amber-400">NOT INITIALIZED</span>
              ) : machine.isDelegated ? (
                <span className="text-emerald-400">⚡ ER DELEGATED</span>
              ) : (
                <span className="text-cyan-400">SOLANA L1 (SETUP)</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-mono text-slate-400 uppercase">
              USDC Vault Liquidity
            </div>
            <div className="mt-1 font-arcade text-sm font-black text-emerald-300">
              ${formatBaseUnits(vaultUsdcBalance, 6)} USDC
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-mono text-slate-400 uppercase">
              Stocked Slots
            </div>
            <div className="mt-1 font-arcade text-sm font-black text-white">
              {stockedCount} / 16
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-mono text-slate-400 uppercase">
              Total Plays / Wins
            </div>
            <div className="mt-1 font-arcade text-sm font-black text-purple-300">
              {machine ? `${machine.totalPlays} / ${machine.totalWins}` : "0 / 0"}
            </div>
          </div>
        </div>

        {/* Case 1: Machine Not Initialized */}
        {!loading && !machine && (
          <div className="rounded-3xl border border-amber-500/40 bg-slate-900/80 p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h2 className="font-arcade text-lg font-bold text-white">
                STEP 1: INITIALIZE MACHINE #{machineId.toString()} ON DEVNET
              </h2>
            </div>

            <form onSubmit={handleInitializeMachine} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  USDC Mint Address (6 decimals)
                </label>
                <div className="flex gap-2">
                  <input
                    value={usdcMintInput}
                    onChange={(e) => setUsdcMintInput(e.target.value)}
                    required
                    className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                  {walletTokens.some((t) => t.decimals === 6) && (
                    <select
                      value={usdcMintInput}
                      onChange={(e) => setUsdcMintInput(e.target.value)}
                      className="rounded-xl bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-cyan-300 font-mono"
                    >
                      <option value="">Pick Wallet 6-dec Token</option>
                      {walletTokens
                        .filter((t) => t.decimals === 6)
                        .map((t) => (
                          <option key={t.mint} value={t.mint}>
                            {formatWalletTokenOptionLabel(t, savedMintMeta[t.mint])}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Play Fee ($)
                  </label>
                  <input
                    value={playFeeUsd}
                    onChange={(e) => setPlayFeeUsd(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Duration (s)
                  </label>
                  <input
                    value={playDuration}
                    onChange={(e) => setPlayDuration(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="md:col-span-3 flex items-center justify-between pt-2">
                <span className="text-[11px] font-mono text-slate-400">
                  Public Odds: Common 65% • Rare 32% • Epic 12% • Grail 4% (+3% Bullseye)
                </span>
                <button
                  type="submit"
                  disabled={txLoading || !publicKey}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 disabled:opacity-50 text-white font-arcade font-bold text-xs cursor-pointer"
                >
                  {txLoading ? "INITIALIZING..." : "INITIALIZE MACHINE ON L1"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Case 2: Machine Initialized */}
        {machine && (
          <>
            {/* Vault Liquidity + ER Delegation Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <form
                onSubmit={handleFundUsdc}
                className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-arcade text-sm font-bold text-white flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    FUND USDC LIQUIDITY VAULT
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Mint: {machine.usdcMint.toBase58().slice(0, 8)}...
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  Backs player instant sell-backs &amp; L1 USDC withdrawals.
                </p>
                <div className="flex gap-2">
                  <input
                    value={fundUsdcInput}
                    onChange={(e) => setFundUsdcInput(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                    placeholder="Amount USDC"
                  />
                  <button
                    type="submit"
                    disabled={txLoading || !publicKey}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-arcade font-black text-xs cursor-pointer"
                  >
                    DEPOSIT USDC
                  </button>
                </div>
              </form>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="font-arcade text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    MAGICBLOCK EPHEMERAL ROLLUP DELEGATION
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    {machine.isDelegated
                      ? "MachineConfig is delegated to MagicBlock ER and ready for 10ms real-time play."
                      : "Stock all prize slots on L1 first, then delegate MachineConfig to MagicBlock ER."}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                    {machine.isDelegated ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Active on ER
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        On L1 (Not yet delegated)
                      </>
                    )}
                  </span>
                  {machine.isDelegated ? (
                    <button
                      type="button"
                      disabled={txLoading || !publicKey}
                      onClick={handleUndelegateMachine}
                      className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 font-arcade font-bold text-xs cursor-pointer"
                    >
                      UNDELEGATE TO L1
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={txLoading || !publicKey}
                      onClick={handleDelegateMachine}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 disabled:opacity-40 text-white font-arcade font-bold text-xs cursor-pointer"
                    >
                      DELEGATE TO ER
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 16-Slot Cabinet & Stock Editor */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: 16 Slots Grid */}
              <div className="lg:col-span-7 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-arcade text-base font-bold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-cyan-400" />
                    16 CABINET PRIZE SLOTS
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400">
                    {stockMode === "semi_auto"
                      ? "Highlighted slots show live semi-auto distribution preview • Click any slot to edit manually"
                      : "Click any slot to edit or stock individually"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {machine.slots.map((slot, idx) => {
                    const planned =
                      stockMode === "semi_auto"
                        ? plannedDistribution?.allocations.find(
                            (a) => a.slotId === idx
                          )
                        : undefined;
                    const displayTier = planned ? planned.tier : slot.tier;
                    const tierCfg = PRIZE_TIERS[displayTier] || PRIZE_TIERS[0];
                    const selected =
                      stockMode === "manual" && selectedSlotId === idx;
                    const mintStr = slot.prizeMint.toBase58();
                    const hasMint = mintStr !== PublicKey.default.toBase58();
                    const slotMeta = hasMint ? savedMintMeta[mintStr] : undefined;
                    const slotWalletTok = hasMint
                      ? walletTokens.find((t) => t.mint === mintStr)
                      : undefined;
                    const slotSymbol = slotWalletTok?.symbol || slotMeta?.symbol;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setStockMode("manual");
                          selectSlot(idx);
                        }}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                          selected
                            ? "border-cyan-400 bg-cyan-500/10"
                            : planned
                            ? "border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_16px_rgba(34,211,238,0.18)]"
                            : "border-slate-800 bg-slate-950/80 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-arcade text-xs font-black text-white">
                            #{idx}
                          </span>
                          {planned ? (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                                planned.wasAlreadyInStock
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-cyan-500/25 text-cyan-200"
                              }`}
                            >
                              {planned.wasAlreadyInStock ? "REPLACE" : "PLANNED"}
                            </span>
                          ) : (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                                slot.inStock
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-slate-800 text-slate-500"
                              }`}
                            >
                              {slot.inStock ? "IN STOCK" : "EMPTY"}
                            </span>
                          )}
                        </div>

                        <div
                          className="text-[10px] font-bold mt-1.5"
                          style={{ color: tierCfg.color }}
                        >
                          {tierCfg.name}
                        </div>

                        {planned ? (
                          <>
                            <div className="text-[10px] font-mono text-cyan-200 font-bold mt-1 truncate">
                              +{planned.prizeAmountUi} pack
                            </div>
                            <div className="text-[9px] font-mono text-slate-400">
                              ({planned.x}, {planned.z}) • $
                              {planned.fallbackBuybackUsdFormatted}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                              {hasMint
                                ? `${formatBaseUnits(slot.prizeAmount, slot.prizeDecimals)} ${
                                    slotSymbol || "units"
                                  }`
                                : "Unassigned"}
                            </div>
                            <div className="text-[9px] font-mono text-slate-500">
                              ({slot.x}, {slot.z}) • $
                              {(Number(slot.fallbackBuybackUsdc) / 1_000_000).toFixed(2)}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Semi-Auto Batch Loader / Manual Stock Editor */}
              <div className="lg:col-span-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setStockMode("semi_auto")}
                    className={`py-2 px-3 rounded-xl text-xs font-arcade font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      stockMode === "semi_auto"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Semi-Auto Loader
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockMode("manual")}
                    className={`py-2 px-3 rounded-xl text-xs font-arcade font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      stockMode === "manual"
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Target className="w-3.5 h-3.5" />
                    Manual Slot #{selectedSlotId}
                  </button>
                </div>

                {stockMode === "semi_auto" ? (
                  <SemiAutoRewardLoader
                    machine={machine}
                    machineId={machineId}
                    machinePda={machinePda}
                    walletTokens={walletTokens}
                    savedMintMeta={savedMintMeta}
                    txLoading={txLoading}
                    setTxLoading={setTxLoading}
                    onPlanChange={setPlannedDistribution}
                    onComplete={setStatusMsg}
                    onRefresh={refreshAll}
                  />
                ) : (
                  <div>
                    <h2 className="font-arcade text-base font-bold text-white mb-1">
                      STOCK SLOT #{selectedSlotId}
                    </h2>
                    <p className="text-[11px] text-slate-400 font-mono mb-3">
                      Transfers prize tokens/NFT from your admin wallet into the machine PrizeVault PDA.
                    </p>

                    {machine.slots[selectedSlotId]?.inStock && (
                      <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[11px] font-mono flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          Slot #{selectedSlotId} is already <strong>IN STOCK</strong>. Click an <strong>EMPTY</strong> slot on the left so you don&apos;t overwrite it.
                        </span>
                      </div>
                    )}

                    <form onSubmit={handleStockSlot} className="space-y-3.5">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">
                          Select Prize Token / NFT from Wallet
                        </label>
                        <select
                          value={slotMintInput}
                          onChange={(e) => {
                            setSlotMintInput(e.target.value);
                            const tok = walletTokens.find(
                              (t) => t.mint === e.target.value
                            );
                            if (tok && tok.decimals === 0) setSlotAmountInput("1");
                          }}
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-cyan-300 font-mono mb-2"
                        >
                          <option value="">-- Choose Wallet Token / NFT --</option>
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
                          value={slotMintInput}
                          onChange={(e) => setSlotMintInput(e.target.value)}
                          placeholder="Or paste Mint Pubkey..."
                          required
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            Pack Amount (tokens/win)
                          </label>
                          <input
                            value={slotAmountInput}
                            onChange={(e) => setSlotAmountInput(e.target.value)}
                            required
                            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            Tier
                          </label>
                          <select
                            value={slotTier}
                            onChange={(e) => setSlotTier(Number(e.target.value))}
                            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                          >
                            {PRIZE_TIERS.map((t) => (
                              <option key={t.tier} value={t.tier}>
                                {t.tier}: {t.name} ({t.oddsLabel})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            X (0-1000)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={slotX}
                            onChange={(e) => setSlotX(Number(e.target.value))}
                            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            Z (0-1000)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={slotZ}
                            onChange={(e) => setSlotZ(Number(e.target.value))}
                            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-mono text-slate-400 mb-1">
                            Buyback ($)
                          </label>
                          <input
                            value={slotBuybackUsd}
                            onChange={(e) => setSlotBuybackUsd(e.target.value)}
                            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">
                          Pyth Price Feed (default = fixed buyback floor)
                        </label>
                        <input
                          value={slotPriceFeed}
                          onChange={(e) => setSlotPriceFeed(e.target.value)}
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-300 font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={txLoading || !publicKey || Boolean(machine.isDelegated)}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 disabled:opacity-40 text-white font-arcade font-bold text-xs cursor-pointer shadow-lg"
                      >
                        {machine.isDelegated
                          ? "LOCKED (DELEGATED TO ER)"
                          : txLoading
                          ? "STOCKING ON L1..."
                          : `STOCK SLOT #${selectedSlotId} ON L1`}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
