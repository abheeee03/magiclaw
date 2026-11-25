"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Coins,
  Volume2,
  VolumeX,
  Shield,
  Zap,
  LogOut,
  Sparkles,
} from "lucide-react";
import { VirtualJoystick } from "../components/hud/VirtualJoystick";
import { TelemetryHUD } from "../components/hud/TelemetryHUD";
import { PostWinModal } from "../components/modals/PostWinModal";
import { VaultOddsModal } from "../components/modals/VaultOddsModal";
import { LoadingScreen } from "../components/LoadingScreen";
import { arcadeAudio } from "../components/audio/ArcadeAudio";
import type {
  CamMode,
  OnchainVrfResult,
} from "../components/three/ClawMachineView";
import {
  fetchMachineConfig,
  fetchPlayerSession,
  fetchWalletUsdcBalance,
  fetchPlayerLedgerLastClaimedNonce,
  waitForL1ClaimCommit,
  waitForSessionUndelegated,
  requestDevnetAirdrop,
  createInitAndDepositSessionIx,
  createDelegateSessionIx,
  createStartPlayIx,
  createSteerClawIx,
  createDropClawIx,
  createSellBackPrizeIx,
  createClaimPrizeIx,
  createExecuteL1PrizeClaimIx,
  createRequestWithdrawAndUndelegateIx,
  createExecuteL1UsdcWithdrawIx,
  waitForVrfResolution,
  confirmTx,
  baseConnection,
  erConnection,
} from "../lib/solana";
import { getOrCreateSessionKey } from "../lib/sessionKey";
import { MachineConfigData, PlayerSessionData, WonPrizeInfo } from "../lib/types";
import { getMachinePda } from "../lib/pda";
import { MACHINE_ID, MAX_STEP } from "../lib/constants";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const ClawMachineView = dynamic(
  () =>
    import("../components/three/ClawMachineView").then(
      (mod) => mod.ClawMachineView
    ),
  {
    ssr: false,
    loading: () => <LoadingScreen progress={22} />,
  }
);

export default function ClawVaultPage() {
  const { publicKey, connected, sendTransaction, signTransaction } = useWallet();
  const [machineConfig, setMachineConfig] = useState<MachineConfigData | null>(null);
  const [playerSession, setPlayerSession] = useState<PlayerSessionData | null>(null);

  // Real onchain ER session balance & L1 wallet Test USDC balance
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<number>(0);

  const [isMuted, setIsMuted] = useState(false);
  const [activeCamMode, setActiveCamMode] = useState<CamMode>("hero");
  const [virtualJoyVector, setVirtualJoyVector] = useState({ x: 0, y: 0 });
  const [isDropRequested, setIsDropRequested] = useState(false);
  const [gameStateText, setGameStateText] = useState("CONNECT WALLET");
  const [isBootHudHidden, setIsBootHudHidden] = useState(true);
  const [powerReplayCount, setPowerReplayCount] = useState(0);
  const [coinInsertCount, setCoinInsertCount] = useState(0);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isLoaderDone, setIsLoaderDone] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(22);

  useEffect(() => {
    if (isSceneReady) {
      const t1 = setTimeout(() => setLoaderProgress(100), 0);
      const t2 = setTimeout(() => setIsLoaderDone(true), 520);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    const interval = setInterval(() => {
      setLoaderProgress((prev) => (prev < 88 ? prev + (90 - prev) * 0.14 : prev));
    }, 120);
    return () => clearInterval(interval);
  }, [isSceneReady]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Modals, Telemetry & Toast State
  const [isOddsModalOpen, setIsOddsModalOpen] = useState(false);
  const [wonPrize, setWonPrize] = useState<WonPrizeInfo | null>(null);
  const [isWinModalOpen, setIsWinModalOpen] = useState(false);
  const [isPendingClaimOnly, setIsPendingClaimOnly] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ title: string; sub: string; icon: string } | null>(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | undefined>(undefined);
  const [erLatencyMs, setErLatencyMs] = useState<number>(12);
  const [vrfStatus, setVrfStatus] = useState<"Ready" | "Rolling" | "Fulfilled" | "Missed">("Ready");
  const [onchainVrfResult, setOnchainVrfResult] = useState<OnchainVrfResult | null>(null);
  const vrfNonceCounterRef = useRef<number>(0);

  const [machinePda] = useMemo(() => getMachinePda(MACHINE_ID), []);
  const publicKeyBase58 = publicKey?.toBase58() ?? null;

  const playFeeUsd = machineConfig
    ? Number(machineConfig.playFeeUsdc) / 1_000_000
    : 1.0;

  const isOnchainActive = Boolean(
    connected &&
      publicKey &&
      machineConfig?.isDelegated &&
      playerSession?.isDelegated
  );

  const canPlayTurn = Boolean(isOnchainActive && usdcBalance >= playFeeUsd);

  const showToast = useCallback((icon: string, title: string, sub: string, duration = 3500) => {
    setToastMessage({ icon, title, sub });
    setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  const refreshMachineAndSession = useCallback(async () => {
    const cfg = await fetchMachineConfig(MACHINE_ID);
    setMachineConfig(cfg);
    if (publicKeyBase58) {
      const ownerPk = new PublicKey(publicKeyBase58);
      const [sess, wBal, ledgerNonce] = await Promise.all([
        fetchPlayerSession(ownerPk, machinePda),
        fetchWalletUsdcBalance(ownerPk, cfg.usdcMint),
        fetchPlayerLedgerLastClaimedNonce(ownerPk, machinePda),
      ]);
      setPlayerSession(sess);
      setWalletUsdcBalance(wBal);
      setUsdcBalance(sess ? Number(sess.usdcBalance) / 1_000_000 : 0);

      // Restore pending prize modal if player won on ER OR has an unsettled L1 claim
      const hasUnsettledClaim = Boolean(
        sess &&
          sess.state === "Idle" &&
          sess.lastOutcome === "Claimed" &&
          sess.claimNonce > ledgerNonce &&
          sess.pendingClaimAmount > BigInt(0)
      );

      if (sess?.state === "WonPendingChoice" || hasUnsettledClaim) {
        const slot =
          (hasUnsettledClaim
            ? cfg.slots.find(
                (s) => s.prizeMint.toBase58() === sess!.pendingClaimMint.toBase58()
              )
            : undefined) ?? cfg.slots[sess!.targetSlot];
        if (slot) {
          const baseBps = cfg.gripBps[slot.tier] ?? 6500;
          const buybackUsd = Number(slot.fallbackBuybackUsdc) / 1_000_000;
          const amountNum =
            Number(slot.prizeAmount) / Math.pow(10, slot.prizeDecimals);
          const amountStr = amountNum.toLocaleString("en-US", {
            maximumFractionDigits: 4,
          });
          const isNft =
            slot.prizeDecimals === 0 && slot.prizeAmount === BigInt(1);
          setWonPrize({
            slotId: slot.slotId,
            tier: slot.tier,
            tierName: ["Common", "Rare", "Epic", "Grail"][slot.tier] || "Common",
            name: slot.name || `Slot #${slot.slotId}`,
            symbol: slot.symbol || "SPL",
            icon: slot.icon || "🎁",
            image: slot.image,
            amount: amountStr,
            isNft,
            mint: (hasUnsettledClaim
              ? sess!.pendingClaimMint
              : slot.prizeMint
            ).toBase58(),
            isBullseye: sess!.isBullseye,
            vrfRoll: sess!.lastVrfRoll,
            effectiveOddsBps: sess!.isBullseye
              ? Math.min(9900, baseBps + cfg.bullseyeBonusBps)
              : baseBps,
            livePriceUsd: buybackUsd,
            sellBackUsdc: buybackUsd,
          });
          setIsPendingClaimOnly(hasUnsettledClaim);
          setIsWinModalOpen(true);
        }
      } else {
        setIsPendingClaimOnly(false);
      }

      setGameStateText(
        sess?.state === "WonPendingChoice"
          ? "CLAIM PRIZE!"
          : hasUnsettledClaim
          ? "FINISH L1 CLAIM!"
          : sess?.isDelegated && Number(sess.usdcBalance) >= Number(cfg.playFeeUsdc)
          ? "READY"
          : sess?.isDelegated
          ? "LOW BALANCE"
          : "DEPOSIT TO PLAY"
      );
    } else {
      setPlayerSession(null);
      setWalletUsdcBalance(0);
      setUsdcBalance(0);
      setGameStateText("CONNECT WALLET");
    }
  }, [machinePda, publicKeyBase58]);

  useEffect(() => {
    refreshMachineAndSession();
  }, [refreshMachineAndSession]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    arcadeAudio.setMuted(nextMuted);
  };

  // 1-Click Airdrop $10 Test USDC directly into delegated PlayerSession
  const handleAirdropUsdcToSession = async () => {
    if (!publicKey || !machineConfig) {
      showToast("👛", "CONNECT WALLET", "Connect your Devnet wallet first.");
      return;
    }

    setFaucetLoading(true);
    arcadeAudio.playCoin();
    setCoinInsertCount((c) => c + 1);

    try {
      // If session is already delegated (e.g., at $0 balance), undelegate to L1 first so we can top up
      if (playerSession?.isDelegated) {
        if (usdcBalance >= playFeeUsd) {
          showToast(
            "⚡",
            "SESSION ALREADY FUNDED",
            "You already have playable balance in your ER session.",
            3500
          );
          return;
        }
        showToast("🔄", "PREPARING REFILL", "Undelegating empty ER session back to L1...");
        const undelTx = new Transaction().add(
          createRequestWithdrawAndUndelegateIx(
            publicKey,
            machinePda,
            machineConfig.usdcMint,
            BigInt(0)
          )
        );
        const { blockhash: erBh } = await erConnection.getLatestBlockhash("confirmed");
        undelTx.recentBlockhash = erBh;
        undelTx.feePayer = publicKey;
        if (!signTransaction) {
          throw new Error("Wallet does not support signTransaction for MagicBlock ER.");
        }
        const signedUndel = await signTransaction(undelTx);
        const undelSig = await erConnection.sendRawTransaction(
          signedUndel.serialize(),
          { skipPreflight: true }
        );
        await confirmTx(erConnection, undelSig);

        const undelegated = await waitForSessionUndelegated(publicKey, machinePda);
        if (!undelegated) {
          throw new Error("Timed out waiting for session to undelegate to L1.");
        }
      }

      const sessionKey = getOrCreateSessionKey(publicKey);
      const usdcMint = machineConfig.usdcMint;
      const amount = BigInt(10_000_000); // $10.00 Test USDC

      const res = await fetch("/api/faucet-usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: publicKey.toBase58(),
          sessionKey: sessionKey.publicKey.toBase58(),
          usdcMint: usdcMint.toBase58(),
          amountUsdc: Number(amount),
        }),
      });

      const data = await res.json();

      let sig: string;
      if (res.ok && data.txBase64) {
        const tx = Transaction.from(Buffer.from(data.txBase64, "base64"));
        showToast("🪙", "AIRDROP + DEPOSIT ($10)", "Approve 1 transaction in your wallet...");
        sig = await sendTransaction(tx, baseConnection);
        await confirmTx(baseConnection, sig);
      } else if (data.needsConfig) {
        // Fallback: if connected wallet IS the mint authority, build & sign the 1-tx bundle directly!
        const mintParsed = await baseConnection.getParsedAccountInfo(usdcMint);
        const mintAuthority =
          (mintParsed.value?.data as { parsed?: { info?: { mintAuthority?: string } } })
            ?.parsed?.info?.mintAuthority;

        if (mintAuthority !== publicKey.toBase58()) {
          showToast(
            "⚠️",
            "FAUCET KEY NOT CONFIGURED",
            "Set FAUCET_AUTHORITY_SECRET_KEY in frontend/.env.local for non-admin wallets.",
            5000
          );
          return;
        }

        const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
        const tx = new Transaction();
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            ownerUsdcAta,
            publicKey,
            usdcMint
          ),
          createMintToInstruction(usdcMint, ownerUsdcAta, publicKey, amount)
        );

        const skBal = await baseConnection.getBalance(sessionKey.publicKey);
        if (skBal < 0.002 * LAMPORTS_PER_SOL) {
          tx.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: sessionKey.publicKey,
              lamports: 0.005 * LAMPORTS_PER_SOL,
            })
          );
        }

        tx.add(
          createInitAndDepositSessionIx(
            publicKey,
            machinePda,
            usdcMint,
            amount,
            sessionKey.publicKey,
            BigInt(86400)
          ),
          createDelegateSessionIx(publicKey, machinePda)
        );

        const { blockhash } = await baseConnection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        showToast("🪙", "MINTING + DEPOSITING $10", "Approve 1 transaction in your wallet...");
        sig = await sendTransaction(tx, baseConnection);
        await confirmTx(baseConnection, sig);
      } else {
        throw new Error(data.error || "Faucet request failed");
      }

      setLastSignature(sig);
      await refreshMachineAndSession();
      showToast("✅", "$10.00 IN SESSION!", "Minted, deposited, and delegated to MagicBlock ER in 1 tx!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("❌", "AIRDROP FAILED", msg.slice(0, 100), 5000);
    } finally {
      setFaucetLoading(false);
    }
  };

  // Deposit existing wallet Test USDC & Delegate PlayerSession to MagicBlock ER
  const handleDepositAndDelegate = async (depositUsd: number = 5) => {
    if (!publicKey || !machineConfig) {
      showToast("👛", "CONNECT WALLET", "Connect your Devnet wallet first.");
      return;
    }

    if (walletUsdcBalance < depositUsd) {
      showToast(
        "🪙",
        "NO TEST USDC IN WALLET",
        "Click AIRDROP $10 -> SESSION to mint & deposit Test USDC in 1 tx!",
        4500
      );
      return;
    }

    setOnboardingLoading(true);
    try {
      const sessionKey = getOrCreateSessionKey(publicKey);
      const usdcMint = machineConfig.usdcMint;
      const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      const depositBaseUnits = BigInt(Math.round(depositUsd * 1_000_000));

      const tx = new Transaction();
      const ataInfo = await baseConnection.getAccountInfo(ownerUsdcAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            ownerUsdcAta,
            publicKey,
            usdcMint
          )
        );
      }

      const skBal = await baseConnection.getBalance(sessionKey.publicKey);
      if (skBal < 0.002 * LAMPORTS_PER_SOL) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: sessionKey.publicKey,
            lamports: 0.005 * LAMPORTS_PER_SOL,
          })
        );
      }

      tx.add(
        createInitAndDepositSessionIx(
          publicKey,
          machinePda,
          usdcMint,
          depositBaseUnits,
          sessionKey.publicKey,
          BigInt(86400)
        )
      );

      if (!playerSession?.isDelegated) {
        tx.add(createDelegateSessionIx(publicKey, machinePda));
      }

      const { blockhash } = await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      showToast("⚡", "DEPOSITING & DELEGATING", "Approve in wallet to enter MagicBlock ER...");
      const sig = await sendTransaction(tx, baseConnection);
      await confirmTx(baseConnection, sig);
      setLastSignature(sig);

      await refreshMachineAndSession();
      showToast("✅", "SESSION DELEGATED TO ER!", `$${depositUsd}.00 USDC ready for 10ms gasless play!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("❌", "DEPOSIT FAILED", msg.slice(0, 90), 5000);
    } finally {
      setOnboardingLoading(false);
    }
  };

  // Withdraw USDC & Undelegate from ER back to L1 wallet
  const handleWithdrawUsdc = async () => {
    if (!publicKey || !machineConfig || !playerSession?.isDelegated) return;
    setOnboardingLoading(true);
    try {
      const tx = new Transaction().add(
        createRequestWithdrawAndUndelegateIx(
          publicKey,
          machinePda,
          machineConfig.usdcMint,
          BigInt(0)
        )
      );
      const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      if (!signTransaction) {
        throw new Error("Wallet does not support signTransaction for MagicBlock ER.");
      }

      showToast("💸", "WITHDRAWING TO WALLET", "Approve undelegation from ER to L1...");
      const signed = await signTransaction(tx);
      const sig = await erConnection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
      });
      await confirmTx(erConnection, sig);

      const undelegated = await waitForSessionUndelegated(publicKey, machinePda);
      if (!undelegated) {
        throw new Error("Timed out waiting for undelegation to land on Solana L1.");
      }

      const l1Tx = new Transaction().add(
        createExecuteL1UsdcWithdrawIx(machinePda, publicKey, machineConfig.usdcMint)
      );
      const { blockhash: l1Bh } = await baseConnection.getLatestBlockhash("confirmed");
      l1Tx.recentBlockhash = l1Bh;
      l1Tx.feePayer = publicKey;
      const l1Sig = await sendTransaction(l1Tx, baseConnection);
      await confirmTx(baseConnection, l1Sig);
      setLastSignature(l1Sig);

      await refreshMachineAndSession();
      showToast("✅", "USDC WITHDRAWN!", "Balance returned to your Devnet wallet.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("❌", "WITHDRAW FAILED", msg.slice(0, 90), 5000);
    } finally {
      setOnboardingLoading(false);
    }
  };

  // 1-Click Devnet SOL Faucet
  const handleSolFaucet = async () => {
    if (!publicKey) {
      showToast("👛", "CONNECT WALLET", "Connect your Devnet wallet first.");
      return;
    }
    arcadeAudio.playCoin();
    setCoinInsertCount((c) => c + 1);
    setFaucetLoading(true);
    try {
      showToast("🚰", "REQUESTING DEVNET SOL", "Airdropping 1 SOL for gas/rent...");
      const sig = await requestDevnetAirdrop(publicKey);
      setLastSignature(sig);
      showToast("✨", "1.0 SOL AIRDROPPED!", "Ready for Devnet transactions.");
    } catch {
      showToast("🪙", "DEVNET FAUCET RATE-LIMITED", "Use faucet.solana.com if you need Devnet SOL.");
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleSteerDelta = useCallback(() => {
    // Coordinates are synced atomically on drop_claw to minimize ER tx spam
  }, []);

  // Drop triggered callback: executes start_play + steer_claw + drop_claw on MagicBlock ER
  const handleDropTriggered = useCallback(
    async (clientSeed: number, clawX: number, clawZ: number) => {
      setIsDropRequested(false);

      if (!isOnchainActive || !publicKey || !playerSession) {
        showToast("👛", "SESSION REQUIRED", "Connect wallet & deposit Test USDC to play!");
        return;
      }

      setGameStateText("DROPPING");
      setVrfStatus("Rolling");
      showToast("⚡", "MAGICBLOCK VRF REQUESTED", "Deducting $1.00 & rolling ~50ms VRF on ER...");

      try {
        const sessionKey = getOrCreateSessionKey(publicKey);
        const t0 = Date.now();
        const tx = new Transaction();

        let curX = playerSession.clawX;
        let curZ = playerSession.clawZ;

        if (playerSession.state === "Idle") {
          tx.add(createStartPlayIx(sessionKey.publicKey, machinePda, publicKey));
          curX = 500;
          curZ = 500;
        }

        while (curX !== clawX || curZ !== clawZ) {
          const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, clawX - curX));
          const dz = Math.max(-MAX_STEP, Math.min(MAX_STEP, clawZ - curZ));
          tx.add(createSteerClawIx(sessionKey.publicKey, machinePda, publicKey, dx, dz));
          curX += dx;
          curZ += dz;
        }

        tx.add(createDropClawIx(sessionKey.publicKey, machinePda, publicKey, clientSeed));

        const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = sessionKey.publicKey;
        tx.sign(sessionKey);

        const sig = await erConnection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
        });
        await confirmTx(erConnection, sig);
        setErLatencyMs(Math.max(8, Date.now() - t0));
        setLastSignature(sig);

        const expectedNonce = playerSession.vrfRequestNonce + BigInt(1);
        const resolved = await waitForVrfResolution(publicKey, machinePda, expectedNonce);

        if (resolved) {
          setPlayerSession(resolved);
          setUsdcBalance(Number(resolved.usdcBalance) / 1_000_000);
          vrfNonceCounterRef.current += 1;
          const outcome =
            resolved.lastOutcome === "Won"
              ? "Won"
              : resolved.lastOutcome === "Slipped"
              ? "Slipped"
              : "Miss";
          setVrfStatus(outcome === "Miss" ? "Missed" : "Fulfilled");
          setOnchainVrfResult({
            nonce: vrfNonceCounterRef.current,
            outcome,
            roll: resolved.lastVrfRoll,
            targetSlot: resolved.targetSlot,
            isBullseye: resolved.isBullseye,
          });
          setGameStateText(outcome === "Won" ? "WINNER!" : "READY");
        } else {
          setVrfStatus("Missed");
          setGameStateText("READY");
          vrfNonceCounterRef.current += 1;
          setOnchainVrfResult({
            nonce: vrfNonceCounterRef.current,
            outcome: "Miss",
            roll: 9999,
            targetSlot: 0,
            isBullseye: false,
          });
        }
      } catch (err: unknown) {
        console.error("ER drop failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showToast("❌", "ER DROP FAILED", msg.slice(0, 100), 5000);
        setVrfStatus("Ready");
        setGameStateText("READY");
        vrfNonceCounterRef.current += 1;
        setOnchainVrfResult({
          nonce: vrfNonceCounterRef.current,
          outcome: "Miss",
          roll: 9999,
          targetSlot: 0,
          isBullseye: false,
        });
      }
    },
    [isOnchainActive, publicKey, playerSession, machinePda, showToast]
  );

  const handleWinPrize = useCallback((prize: WonPrizeInfo) => {
    setWonPrize(prize);
    setIsPendingClaimOnly(false);
    setIsWinModalOpen(true);
    setGameStateText("WINNER!");
  }, []);

  // Sell-Back action on ER
  const handleSellBackPrize = async () => {
    if (!wonPrize || !isOnchainActive || !publicKey) return;
    arcadeAudio.playCoin();

    const sessionKey = getOrCreateSessionKey(publicKey);
    const slot = machineConfig?.slots[wonPrize.slotId];
    const priceFeed = slot?.priceFeed ?? PublicKey.default;
    const tx = new Transaction().add(
      createSellBackPrizeIx(sessionKey.publicKey, machinePda, publicKey, priceFeed)
    );
    const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = sessionKey.publicKey;
    tx.sign(sessionKey);

    const sig = await erConnection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    await confirmTx(erConnection, sig);
    setLastSignature(sig);
    await refreshMachineAndSession();
    showToast("💵", "ONCHAIN SELL-BACK SETTLED!", `Credited +$${wonPrize.sellBackUsdc.toFixed(2)} USDC on ER.`);
  };

  // Claim to Wallet action: commits ER claim cleanly to L1, then creates ATA (if needed) + executes L1 transfer
  const handleClaimPrize = async () => {
    if (!wonPrize || !isOnchainActive || !publicKey) return;
    arcadeAudio.playWinFanfare();

    // Always read latest ER session so retries use accurate state & nonce
    const latestErSession = await fetchPlayerSession(publicKey, machinePda);
    if (!latestErSession) {
      throw new Error("Player session not found.");
    }

    const prizeMint =
      latestErSession.state === "Idle" &&
      latestErSession.lastOutcome === "Claimed" &&
      latestErSession.pendingClaimMint.toBase58() !== PublicKey.default.toBase58()
        ? latestErSession.pendingClaimMint
        : new PublicKey(wonPrize.mint);

    const expectedClaimNonce =
      latestErSession.state === "WonPendingChoice"
        ? latestErSession.claimNonce + BigInt(1)
        : latestErSession.claimNonce;

    if (expectedClaimNonce <= BigInt(0)) {
      throw new Error("No pending prize claim found in session.");
    }

    // 1. Trigger claim_prize on ER (either initial claim or idempotent re-commit to L1)
    if (
      latestErSession.state === "WonPendingChoice" ||
      latestErSession.lastOutcome === "Claimed"
    ) {
      const sessionKey = getOrCreateSessionKey(publicKey);
      const claimTx = new Transaction().add(
        createClaimPrizeIx(sessionKey.publicKey, machinePda, publicKey, prizeMint)
      );
      const { blockhash: erBh } = await erConnection.getLatestBlockhash("confirmed");
      claimTx.recentBlockhash = erBh;
      claimTx.feePayer = sessionKey.publicKey;
      claimTx.sign(sessionKey);

      const erSig = await erConnection.sendRawTransaction(claimTx.serialize(), {
        skipPreflight: true,
      });
      await confirmTx(erConnection, erSig);
      setIsPendingClaimOnly(true);
    }

    // 2. Wait until MagicBlock ER commits claim_nonce to Solana L1
    showToast("⏳", "COMMITTING TO SOLANA L1", "Syncing ER claim state to Devnet L1...");
    const committed = await waitForL1ClaimCommit(
      publicKey,
      machinePda,
      expectedClaimNonce
    );
    if (!committed) {
      throw new Error("Timed out waiting for ER claim commit on Solana L1. Click retry to finish.");
    }

    // 3. Create ATA (idempotent) + execute L1 prize transfer in 1 wallet-approved L1 tx
    const claimedNonce = await fetchPlayerLedgerLastClaimedNonce(
      publicKey,
      machinePda
    );
    if (claimedNonce < expectedClaimNonce) {
      const ownerPrizeAta = getAssociatedTokenAddressSync(prizeMint, publicKey);
      const l1ClaimTx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          ownerPrizeAta,
          publicKey,
          prizeMint
        ),
        createExecuteL1PrizeClaimIx(machinePda, publicKey, prizeMint)
      );
      const { blockhash: l1Bh } = await baseConnection.getLatestBlockhash("confirmed");
      l1ClaimTx.recentBlockhash = l1Bh;
      l1ClaimTx.feePayer = publicKey;
      showToast("📦", "CLAIMING TO WALLET", "Approve L1 transfer in your wallet...");
      const l1Sig = await sendTransaction(l1ClaimTx, baseConnection);
      await confirmTx(baseConnection, l1Sig);
      setLastSignature(l1Sig);
    }

    setIsPendingClaimOnly(false);
    await refreshMachineAndSession();
    showToast("🎉", "PRIZE SENT TO YOUR WALLET!", `${wonPrize.name} landed in your Devnet wallet!`);
  };

  const triggerDropBtn = () => {
    if (!connected || !publicKey) {
      showToast("👛", "CONNECT WALLET FIRST", "Connect your Solana Devnet wallet to play!");
      return;
    }
    if (!isOnchainActive) {
      showToast("⚡", "DEPOSIT TO START", "Click AIRDROP $10 -> SESSION or DEPOSIT $5 first!");
      return;
    }
    if (usdcBalance < playFeeUsd) {
      showToast("🪙", "INSUFFICIENT SESSION BALANCE", "Cashout & re-deposit to play more turns!");
      return;
    }
    arcadeAudio.init();
    setIsDropRequested(true);
  };

  const handleSceneReady = useCallback(() => {
    setIsSceneReady(true);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#060710] flex flex-col justify-between">
      {!isLoaderDone && (
        <LoadingScreen progress={loaderProgress} fadingOut={isSceneReady} />
      )}

      {/* 3D WebGL Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <ClawMachineView
          slots={machineConfig?.slots}
          usdcBalance={usdcBalance.toFixed(2)}
          isSteeringAllowed={canPlayTurn}
          isOnchainActive={isOnchainActive}
          onchainVrfResult={onchainVrfResult}
          onSteerDelta={handleSteerDelta}
          onDropTriggered={handleDropTriggered}
          onWinPrize={handleWinPrize}
          activeCamMode={activeCamMode}
          onCamModeChange={setActiveCamMode}
          virtualJoyVector={virtualJoyVector}
          isDropRequested={isDropRequested}
          gameStateText={gameStateText}
          powerReplayCount={powerReplayCount}
          coinInsertCount={coinInsertCount}
          isLoaderVisible={!isLoaderDone}
          onSceneReady={handleSceneReady}
          onBootStateChange={(hudHidden) => setIsBootHudHidden(hudHidden)}
        />
      </div>

      {/* Top Floating Arcade Header */}
      <header
        className={`hud-header-anim ${
          isBootHudHidden ? "hud-boot-hidden" : ""
        } relative z-20 p-2.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none`}
      >
        <div className="hud-glass rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-wrap items-center gap-2.5 sm:gap-3.5 pointer-events-auto shadow-2xl">
          <div className="flex flex-col leading-none pr-2 border-r border-white/10">
            <span className="font-arcade text-sm sm:text-base font-black tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-300 to-pink-400">
              MAGICLAW
            </span>
            <span className="text-[9px] text-pink-300/80 font-mono font-bold tracking-[0.18em] mt-0.5">
              {isOnchainActive ? "LIVE DEVNET ER" : "WALLET REQUIRED"}
            </span>
          </div>

          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
              Session Balance
            </span>
            <span className="font-arcade text-sm sm:text-lg font-black text-amber-300">
              ${usdcBalance.toFixed(2)}{" "}
              <span className="text-[10px] text-slate-400 font-normal">USDC</span>
            </span>
          </div>

          {connected && (
            <div className="hidden md:flex flex-col leading-tight pl-2 border-l border-white/10">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
                Wallet USDC
              </span>
              <span className="font-mono text-xs font-bold text-emerald-300">
                ${walletUsdcBalance.toFixed(2)}
              </span>
            </div>
          )}

          {connected && (!isOnchainActive || usdcBalance < playFeeUsd) && (
            <>
              <button
                onClick={handleAirdropUsdcToSession}
                disabled={faucetLoading || onboardingLoading}
                title="Mint $10 Test USDC, deposit & delegate to ER"
                className="rounded-xl px-2.5 py-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:brightness-110 active:scale-95 text-slate-950 font-arcade text-[11px] font-black tracking-wide cursor-pointer flex items-center gap-1 shadow-md disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {faucetLoading
                    ? "MINTING..."
                    : isOnchainActive
                    ? "REFILL $10 → SESSION"
                    : "AIRDROP $10 → SESSION"}
                </span>
              </button>

              {!isOnchainActive && walletUsdcBalance >= 5 && (
                <button
                  onClick={() => handleDepositAndDelegate(5)}
                  disabled={onboardingLoading}
                  className="rounded-xl px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-arcade text-[11px] font-bold cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{onboardingLoading ? "DELEGATING..." : "DEPOSIT $5"}</span>
                </button>
              )}
            </>
          )}

          {connected && isOnchainActive && usdcBalance > 0 && (
            <button
              onClick={handleWithdrawUsdc}
              disabled={onboardingLoading}
              title="Withdraw USDC back to your Devnet wallet"
              className="rounded-xl px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 font-arcade text-[11px] font-bold cursor-pointer flex items-center gap-1 disabled:opacity-40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>CASHOUT</span>
            </button>
          )}

          {connected && (
            <button
              onClick={handleSolFaucet}
              disabled={faucetLoading}
              title="Request 1 Devnet SOL Airdrop"
              className="rounded-xl px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 active:scale-95 text-slate-950 font-arcade text-[11px] font-black tracking-wide cursor-pointer flex items-center gap-1 shadow-md disabled:opacity-50"
            >
              <Coins className="w-3.5 h-3.5 text-slate-950" />
              <span>SOL FAUCET</span>
            </button>
          )}
        </div>

        {/* Right Controls Cluster */}
        <div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
          <div className="hud-glass rounded-2xl p-1 flex items-center gap-1">
            {(["hero", "front", "side", "orbit"] as const).map((mode, idx) => (
              <button
                key={mode}
                onClick={() => setActiveCamMode(mode)}
                className={`cam-pill rounded-xl px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                  activeCamMode === mode ? "active" : "text-slate-300"
                }`}
              >
                {idx + 1} {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsOddsModalOpen(true)}
            className="hud-glass rounded-2xl px-3 py-2 text-xs font-arcade font-bold text-amber-200 hover:text-white cursor-pointer flex items-center gap-1.5 shadow-lg hover:border-pink-400/40"
          >
            <Shield className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden sm:inline">
              PRIZES ({machineConfig ? machineConfig.slots.filter((s) => s.inStock).length : 0}) &amp; ODDS
            </span>
            <span className="sm:hidden">
              PRIZES ({machineConfig ? machineConfig.slots.filter((s) => s.inStock).length : 0})
            </span>
          </button>

          <button
            onClick={() => {
              arcadeAudio.init();
              setPowerReplayCount((c) => c + 1);
            }}
            title="Replay Lights Power-On Intro (Key: P)"
            className="cam-pill hud-glass rounded-2xl px-2.5 py-2 text-[11px] font-bold cursor-pointer flex items-center gap-1 text-amber-200 hover:text-amber-100"
          >
            <span>⚡</span>
            <span className="hidden sm:inline">Power On</span>
          </button>

          <div className="wallet-adapter-wrapper min-w-[130px] flex justify-end">
            {mounted ? (
              <WalletMultiButton className="!bg-gradient-to-r !from-indigo-600 !to-purple-600 !rounded-2xl !h-9 !py-0 !px-3 !text-xs !font-arcade !font-bold !shadow-lg" />
            ) : (
              <button className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl h-9 px-3 text-xs font-arcade font-bold shadow-lg text-white opacity-80">
                CONNECT WALLET
              </button>
            )}
          </div>

          <button
            onClick={toggleMute}
            className="hud-glass rounded-2xl p-2 text-slate-300 hover:text-white cursor-pointer"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>
        </div>
      </header>

      {/* Dynamic Toast Alert */}
      {toastMessage && (
        <div className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce">
          <div className="hud-glass rounded-2xl px-4 py-2.5 flex items-center gap-3 border border-cyan-400/40 shadow-2xl max-w-[90vw]">
            <span className="text-xl">{toastMessage.icon}</span>
            <div className="flex flex-col leading-tight">
              <span className="font-arcade text-xs sm:text-sm font-extrabold text-white">
                {toastMessage.title}
              </span>
              <span className="text-[11px] text-slate-300">{toastMessage.sub}</span>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Gate Banner when wallet not connected or session not active */}
      {!isBootHudHidden && !canPlayTurn && (
        <div className="relative z-20 mx-auto pointer-events-auto">
          <div className="hud-glass rounded-2xl px-4 py-2.5 border border-amber-500/40 text-xs font-mono text-amber-200 flex items-center gap-2.5 shadow-xl">
            <span>
              {!connected
                ? "🔒 Connect your Solana Devnet wallet (top right) to play and win real tokens & NFTs."
                : !isOnchainActive
                ? "⚡ Click AIRDROP $10 → SESSION in the top bar to fund & start your gasless ER session."
                : "🪙 Session balance is $0.00. Click REFILL $10 → SESSION in the top bar to top up!"}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Floating Thumb Control Deck */}
      <footer
        className={`hud-footer-anim ${
          isBootHudHidden ? "hud-boot-hidden" : ""
        } relative z-20 p-3 sm:p-5 flex flex-col gap-2.5 pointer-events-none`}
      >
        <div className="flex items-end justify-between sm:justify-center sm:gap-10">
          <div className="hud-glass rounded-3xl p-2 sm:p-2.5 flex items-center gap-3.5 pointer-events-auto shadow-2xl">
            <VirtualJoystick
              onMove={setVirtualJoyVector}
              disabled={
                !canPlayTurn ||
                gameStateText === "DROPPING" ||
                gameStateText === "GRABBING" ||
                gameStateText === "LIFTING" ||
                gameStateText === "RETURNING"
              }
            />

            <div className="hidden sm:flex flex-col gap-1 pr-2 min-w-[165px]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    canPlayTurn
                      ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                      : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                  }`}
                />
                <span className="font-arcade text-[11px] font-extrabold tracking-wider text-lime-200">
                  {gameStateText}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                <div>
                  <strong className="text-slate-200">WASD / Arrows</strong> Move Claw
                </div>
                <div>
                  <strong className="text-slate-200">Space / Enter</strong> Drop Claw
                </div>
                <div>
                  <strong className="text-slate-200">1–4</strong> Cam •{" "}
                  <strong className="text-slate-200">P</strong> Intro
                </div>
              </div>
            </div>
          </div>

          <div className="hud-glass rounded-3xl p-2.5 flex items-center justify-center pointer-events-auto shadow-2xl">
            <button
              onClick={triggerDropBtn}
              title="Drop Claw (Space / Enter)"
              className="emerald-drop-btn cursor-pointer"
            >
              <div className="emerald-drop-cap">
                <span className="font-arcade font-black text-xs sm:text-sm tracking-wider leading-none">
                  DROP
                </span>
                <span className="text-[8px] font-extrabold tracking-widest opacity-80 mt-0.5">
                  ${playFeeUsd.toFixed(2)}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="pointer-events-auto flex justify-center">
          <TelemetryHUD
            erLatencyMs={erLatencyMs}
            isDelegated={Boolean(machineConfig?.isDelegated)}
            vrfStatus={vrfStatus}
            pythStatus="Live"
            lastTxSignature={lastSignature}
          />
        </div>
      </footer>

      <PostWinModal
        prize={wonPrize}
        isOpen={isWinModalOpen}
        pendingClaimOnly={isPendingClaimOnly}
        onClose={() => {
          setIsWinModalOpen(false);
          setGameStateText(canPlayTurn ? "READY" : "DEPOSIT TO PLAY");
        }}
        onSellBack={handleSellBackPrize}
        onClaimToWallet={handleClaimPrize}
      />

      <VaultOddsModal
        isOpen={isOddsModalOpen}
        onClose={() => setIsOddsModalOpen(false)}
        isDelegated={Boolean(machineConfig?.isDelegated)}
        slots={machineConfig?.slots}
      />
    </main>
  );
}
