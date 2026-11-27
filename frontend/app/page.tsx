"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ArcadeHUD } from "../components/hud/ArcadeHUD";
import { PostWinModal } from "../components/modals/PostWinModal";
import { VaultOddsModal } from "../components/modals/VaultOddsModal";
import { TicketsModal } from "../components/modals/TicketsModal";
import { SettingsModal } from "../components/modals/SettingsModal";
import { HowToPlayModal } from "../components/modals/HowToPlayModal";
import { LoadingScreen } from "../components/LoadingScreen";
import { ArcadeToastData, ArcadeToastVariant } from "../components/ArcadeToast";
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
  fetchPlayerLedgerTotalWithdrawn,
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
import {
  MachineConfigData,
  PlayerSessionData,
  WonPrizeInfo,
} from "../lib/types";
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
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const ClawMachineView = dynamic(
  () =>
    import("../components/three/ClawMachineView").then(
      (mod) => mod.ClawMachineView,
    ),
  {
    ssr: false,
    loading: () => <LoadingScreen progress={22} />,
  },
);

export default function ClawVaultPage() {
  const {
    publicKey,
    connected,
    connect,
    disconnect,
    sendTransaction,
    signTransaction,
  } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [machineConfig, setMachineConfig] = useState<MachineConfigData | null>(
    null,
  );
  const [playerSession, setPlayerSession] = useState<PlayerSessionData | null>(
    null,
  );

  // Real onchain ER session balance & L1 wallet Test USDC balance
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState<number>(0);

  const [musicEnabled, setMusicEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.4);
  const [sfxVolume, setSfxVolume] = useState(0.85);
  const [activeCamMode, setActiveCamMode] = useState<CamMode>("hero");
  const [showProjection, setShowProjection] = useState(false);
  const [virtualJoyVector, setVirtualJoyVector] = useState({ x: 0, y: 0 });
  const [isDropRequested, setIsDropRequested] = useState(false);
  const [gameStateText, setGameStateText] = useState("CONNECT WALLET");
  const [isBootHudHidden, setIsBootHudHidden] = useState(true);
  const [coinInsertCount, setCoinInsertCount] = useState(0);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isLoaderFading, setIsLoaderFading] = useState(false);
  const [isLoaderDone, setIsLoaderDone] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(22);

  useEffect(() => {
    if (isSceneReady) {
      const t1 = setTimeout(() => setLoaderProgress(100), 0);
      const t2 = setTimeout(() => setIsLoaderFading(true), 850);
      const t3 = setTimeout(() => setIsLoaderDone(true), 1550);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    const interval = setInterval(() => {
      setLoaderProgress((prev) =>
        prev < 88 ? prev + (90 - prev) * 0.14 : prev,
      );
    }, 120);
    const safetyTimeout = setTimeout(() => {
      setIsSceneReady(true);
    }, 5500);
    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimeout);
    };
  }, [isSceneReady]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Modals, Telemetry & Toast State
  const [isOddsModalOpen, setIsOddsModalOpen] = useState(false);
  const [isPrizesZoomActive, setIsPrizesZoomActive] = useState(false);
  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const bootAutoGuideCheckedRef = useRef(false);
  const [wonPrize, setWonPrize] = useState<WonPrizeInfo | null>(null);
  const [isWinModalOpen, setIsWinModalOpen] = useState(false);
  const [isPendingClaimOnly, setIsPendingClaimOnly] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<ArcadeToastData | null>(
    null,
  );
  const toastIdRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | undefined>(
    undefined,
  );
  const [erLatencyMs, setErLatencyMs] = useState<number>(12);
  const [vrfStatus, setVrfStatus] = useState<
    "Ready" | "Rolling" | "Fulfilled" | "Missed"
  >("Ready");
  const [onchainVrfResult, setOnchainVrfResult] =
    useState<OnchainVrfResult | null>(null);
  const vrfNonceCounterRef = useRef<number>(0);
  const dropInFlightRef = useRef<boolean>(false);

  const [machinePda] = useMemo(() => getMachinePda(MACHINE_ID), []);
  const publicKeyBase58 = publicKey?.toBase58() ?? null;

  const playFeeUsd = machineConfig
    ? Number(machineConfig.playFeeUsdc) / 1_000_000
    : 1.0;

  const localSessionKey = useMemo(() => {
    if (!publicKey) return null;
    return getOrCreateSessionKey(publicKey);
  }, [publicKey]);

  const sessionKeyMatches = Boolean(
    localSessionKey &&
    playerSession?.sessionKey &&
    playerSession.sessionKey.equals(localSessionKey.publicKey),
  );

  const hasPendingPrize = Boolean(
    playerSession?.state === "WonPendingChoice" || isPendingClaimOnly,
  );

  const isOnchainActive = Boolean(
    connected &&
    publicKey &&
    machineConfig?.isDelegated &&
    playerSession?.isDelegated,
  );

  const canPlayTurn = isPracticeMode
    ? true
    : Boolean(
        isOnchainActive &&
        sessionKeyMatches &&
        !hasPendingPrize &&
        playerSession?.state !== "AwaitingVrf" &&
        (usdcBalance >= playFeeUsd || playerSession?.state === "Steering"),
      );

  const closeToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback(
    (
      icon: string,
      title: string,
      sub: string,
      duration = 3800,
      variant?: ArcadeToastVariant,
    ) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      const inferredVariant: ArcadeToastVariant =
        variant ??
        (icon === "❌"
          ? "error"
          : icon === "⚠️" || icon === "😬" || icon === "⏳" || icon === "🔑"
            ? "warning"
            : icon === "✅" || icon === "🎉" || icon === "🏆" || icon === "✨"
              ? "success"
              : "info");
      toastIdRef.current += 1;
      setToastMessage({
        id: toastIdRef.current,
        icon,
        title,
        sub,
        variant: inferredVariant,
        duration,
      });
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
        toastTimerRef.current = null;
      }, duration);
    },
    [],
  );

  const runWithWalletAuth = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAuthErr =
          /not been authorized|unauthorized|walletnotconnected|walletdisconnected/i.test(
            msg,
          );
        if (!isAuthErr) throw err;

        try {
          await connect();
          return await fn();
        } catch (retryErr: unknown) {
          await disconnect().catch(() => {});
          setWalletModalVisible(true);
          const retryMsg =
            retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (/not been authorized|unauthorized/i.test(retryMsg)) {
            throw new Error(
              "Wallet authorization expired — please reconnect your wallet.",
            );
          }
          throw retryErr;
        }
      }
    },
    [connect, disconnect, setWalletModalVisible],
  );

  const refreshMachineAndSession = useCallback(
    async (openWinModalOnRestore = true) => {
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
          sess.pendingClaimAmount > BigInt(0),
        );

        if (sess?.state === "WonPendingChoice" || hasUnsettledClaim) {
          const slot =
            (hasUnsettledClaim
              ? cfg.slots.find(
                  (s) =>
                    s.prizeMint.toBase58() ===
                    sess!.pendingClaimMint.toBase58(),
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
              tierName:
                ["Common", "Rare", "Epic", "Grail"][slot.tier] || "Common",
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
            if (openWinModalOnRestore) {
              setIsWinModalOpen(true);
            }
          }
        } else {
          setIsPendingClaimOnly(false);
        }

        if (openWinModalOnRestore) {
          setGameStateText(
            sess?.state === "WonPendingChoice"
              ? "CLAIM PRIZE!"
              : hasUnsettledClaim
                ? "FINISH L1 CLAIM!"
                : sess?.isDelegated &&
                    (Number(sess.usdcBalance) >= Number(cfg.playFeeUsdc) ||
                      sess.state === "Steering")
                  ? "READY"
                  : sess?.isDelegated
                    ? "LOW BALANCE"
                    : "DEPOSIT TO PLAY",
          );
        }
      } else {
        setPlayerSession(null);
        setWalletUsdcBalance(0);
        setUsdcBalance(0);
        setIsPendingClaimOnly(false);
        setGameStateText("CONNECT WALLET");
      }
    },
    [machinePda, publicKeyBase58],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void refreshMachineAndSession();
    }, 0);
    return () => clearTimeout(t);
  }, [refreshMachineAndSession]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("magiclaw_settings_v1");
        if (raw) {
          const parsed = JSON.parse(raw) as {
            musicVolume?: number;
            sfxVolume?: number;
            musicEnabled?: boolean;
            sfxEnabled?: boolean;
            isMuted?: boolean;
            showProjection?: boolean;
          };
          if (typeof parsed.musicVolume === "number") {
            setMusicVolume(parsed.musicVolume);
            arcadeAudio.setMusicVolume(parsed.musicVolume);
          }
          if (typeof parsed.sfxVolume === "number") {
            setSfxVolume(parsed.sfxVolume);
            arcadeAudio.setSfxVolume(parsed.sfxVolume);
          }
          const nextMusicEnabled =
            typeof parsed.musicEnabled === "boolean"
              ? parsed.musicEnabled
              : parsed.isMuted === true
                ? false
                : true;
          const nextSfxEnabled =
            typeof parsed.sfxEnabled === "boolean"
              ? parsed.sfxEnabled
              : parsed.isMuted === true
                ? false
                : true;
          setMusicEnabled(nextMusicEnabled);
          setSfxEnabled(nextSfxEnabled);
          arcadeAudio.setMusicEnabled(nextMusicEnabled);
          arcadeAudio.setSfxEnabled(nextSfxEnabled);
          if (typeof parsed.showProjection === "boolean") {
            setShowProjection(parsed.showProjection);
          }
        }
      } catch {
        // Ignore malformed saved settings
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const persistSettings = useCallback(
    (next: {
      musicVolume: number;
      sfxVolume: number;
      musicEnabled: boolean;
      sfxEnabled: boolean;
      showProjection: boolean;
    }) => {
      try {
        window.localStorage.setItem(
          "magiclaw_settings_v1",
          JSON.stringify(next),
        );
      } catch {
        // Ignore storage errors
      }
    },
    [],
  );

  const handleMusicVolumeChange = (vol: number) => {
    const enabled = vol > 0 ? true : musicEnabled;
    setMusicVolume(vol);
    setMusicEnabled(enabled);
    arcadeAudio.setMusicEnabled(enabled);
    arcadeAudio.setMusicVolume(vol);
    persistSettings({
      musicVolume: vol,
      sfxVolume,
      musicEnabled: enabled,
      sfxEnabled,
      showProjection,
    });
  };

  const handleSfxVolumeChange = (vol: number) => {
    const enabled = vol > 0 ? true : sfxEnabled;
    setSfxVolume(vol);
    setSfxEnabled(enabled);
    arcadeAudio.setSfxEnabled(enabled);
    arcadeAudio.setSfxVolume(vol);
    persistSettings({
      musicVolume,
      sfxVolume: vol,
      musicEnabled,
      sfxEnabled: enabled,
      showProjection,
    });
  };

  const toggleMusicEnabled = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    arcadeAudio.setMusicEnabled(next);
    persistSettings({
      musicVolume,
      sfxVolume,
      musicEnabled: next,
      sfxEnabled,
      showProjection,
    });
  };

  const toggleSfxEnabled = () => {
    const next = !sfxEnabled;
    setSfxEnabled(next);
    arcadeAudio.setSfxEnabled(next);
    if (next) arcadeAudio.playButtonClick();
    persistSettings({
      musicVolume,
      sfxVolume,
      musicEnabled,
      sfxEnabled: next,
      showProjection,
    });
  };

  const toggleProjection = () => {
    const next = !showProjection;
    setShowProjection(next);
    arcadeAudio.playButtonClick();
    persistSettings({
      musicVolume,
      sfxVolume,
      musicEnabled,
      sfxEnabled,
      showProjection: next,
    });
  };

  const handleResetSettings = () => {
    const defaults = {
      musicVolume: 0.4,
      sfxVolume: 0.85,
      musicEnabled: true,
      sfxEnabled: true,
      showProjection: false,
    };
    setMusicVolume(defaults.musicVolume);
    setSfxVolume(defaults.sfxVolume);
    setMusicEnabled(defaults.musicEnabled);
    setSfxEnabled(defaults.sfxEnabled);
    setShowProjection(defaults.showProjection);
    arcadeAudio.setMusicEnabled(defaults.musicEnabled);
    arcadeAudio.setSfxEnabled(defaults.sfxEnabled);
    arcadeAudio.setMusicVolume(defaults.musicVolume);
    arcadeAudio.setSfxVolume(defaults.sfxVolume);
    arcadeAudio.playButtonClick();
    persistSettings(defaults);
  };

  // 1-Click Airdrop 10 Test USDC directly into user's wallet (separate from buying tickets)
  const handleAirdropTestUsdc = async () => {
    if (!publicKey || !machineConfig) {
      showToast("👛", "CONNECT WALLET", "Connect your Devnet wallet first.");
      return;
    }

    setFaucetLoading(true);
    arcadeAudio.playCoin();

    try {
      const usdcMint = machineConfig.usdcMint;
      const amount = BigInt(10_000_000); // 10.00 Test USDC

      const res = await fetch("/api/faucet-usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: publicKey.toBase58(),
          usdcMint: usdcMint.toBase58(),
          amountUsdc: Number(amount),
        }),
      });

      const data = await res.json();

      let sig: string;
      if (res.ok && data.txBase64) {
        const tx = Transaction.from(Buffer.from(data.txBase64, "base64"));
        showToast(
          "🪙",
          "AIRDROPPING 10 TEST USDC",
          "Approve 1 transaction in your wallet...",
        );
        sig = await runWithWalletAuth(() =>
          sendTransaction(tx, baseConnection),
        );
        await confirmTx(baseConnection, sig);
      } else if (data.needsConfig) {
        const mintParsed = await baseConnection.getParsedAccountInfo(usdcMint);
        const mintAuthority = (
          mintParsed.value?.data as {
            parsed?: { info?: { mintAuthority?: string } };
          }
        )?.parsed?.info?.mintAuthority;

        if (mintAuthority !== publicKey.toBase58()) {
          showToast(
            "⚠️",
            "FAUCET KEY NOT CONFIGURED",
            "Set FAUCET_AUTHORITY_SECRET_KEY in frontend/.env.local for non-admin wallets.",
            5000,
          );
          return;
        }

        const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            ownerUsdcAta,
            publicKey,
            usdcMint,
          ),
          createMintToInstruction(usdcMint, ownerUsdcAta, publicKey, amount),
        );

        const { blockhash } =
          await baseConnection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        showToast(
          "🪙",
          "AIRDROPPING 10 TEST USDC",
          "Approve in your wallet...",
        );
        sig = await runWithWalletAuth(() =>
          sendTransaction(tx, baseConnection),
        );
        await confirmTx(baseConnection, sig);
      } else {
        throw new Error(data.error || "Faucet request failed");
      }

      setLastSignature(sig);
      await refreshMachineAndSession();
      showToast(
        "✅",
        "10 TEST USDC AIRDROPPED!",
        "Now click Buy Tickets to load your session!",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("❌", "AIRDROP FAILED", msg.slice(0, 100), 5000);
    } finally {
      setFaucetLoading(false);
    }
  };

  // Buy Tickets from Wallet Test USDC -> Deposit into PlayerSession & Delegate to MagicBlock ER
  const handleBuyTickets = async (ticketCount: number = 5) => {
    if (!publicKey || !machineConfig) {
      showToast("👛", "CONNECT WALLET", "Connect your Devnet wallet first.");
      return;
    }

    const depositBaseUnits = BigInt(
      Math.max(1, Math.round(ticketCount)) * Number(machineConfig.playFeeUsdc),
    );
    const requiredUsd = Number(depositBaseUnits) / 1_000_000;
    const availableUsd =
      walletUsdcBalance + (playerSession?.isDelegated ? usdcBalance : 0);

    if (availableUsd < requiredUsd) {
      showToast(
        "🪙",
        "INSUFFICIENT TEST USDC",
        `Need ${requiredUsd.toFixed(2)} Test USDC. Click Airdrop 10 Test USDC first!`,
        4500,
      );
      return;
    }

    setOnboardingLoading(true);
    arcadeAudio.playCoin();
    setCoinInsertCount((c) => c + 1);

    try {
      // If session is currently delegated on ER, undelegate back to L1 first so deposit never hits 3007
      if (playerSession?.isDelegated) {
        if (!signTransaction) {
          throw new Error(
            "Wallet does not support signTransaction for MagicBlock ER.",
          );
        }
        showToast(
          "🔄",
          "SYNCING SESSION",
          "Approve session sync in your wallet before adding tickets...",
        );
        const undelTx = new Transaction().add(
          createRequestWithdrawAndUndelegateIx(
            publicKey,
            machinePda,
            machineConfig.usdcMint,
            BigInt(0),
          ),
        );
        const { blockhash: erBh } =
          await erConnection.getLatestBlockhash("confirmed");
        undelTx.recentBlockhash = erBh;
        undelTx.feePayer = publicKey;

        const signedUndel = await runWithWalletAuth(() =>
          signTransaction(undelTx),
        );
        await erConnection.sendRawTransaction(signedUndel.serialize(), {
          skipPreflight: false,
          preflightCommitment: "processed",
        });

        const undelegated = await waitForSessionUndelegated(
          publicKey,
          machinePda,
        );
        if (!undelegated) {
          throw new Error("Timed out waiting for session to undelegate to L1.");
        }
      }

      const sessionKey = getOrCreateSessionKey(publicKey);
      const usdcMint = machineConfig.usdcMint;
      const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, publicKey);

      // Settle any pending withdrawn balance from the undelegated session before depositing
      const [l1Session, ledgerWithdrawn] = await Promise.all([
        fetchPlayerSession(publicKey, machinePda),
        fetchPlayerLedgerTotalWithdrawn(publicKey, machinePda),
      ]);

      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          ownerUsdcAta,
          publicKey,
          usdcMint,
        ),
      );

      if (l1Session && l1Session.cumulativeWithdrawnUsdc > ledgerWithdrawn) {
        tx.add(createExecuteL1UsdcWithdrawIx(machinePda, publicKey, usdcMint));
      }

      const skBal = await baseConnection.getBalance(sessionKey.publicKey);
      if (skBal < 0.002 * LAMPORTS_PER_SOL) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: sessionKey.publicKey,
            lamports: 0.005 * LAMPORTS_PER_SOL,
          }),
        );
      }

      tx.add(
        createInitAndDepositSessionIx(
          publicKey,
          machinePda,
          usdcMint,
          depositBaseUnits,
          sessionKey.publicKey,
          BigInt(86400),
        ),
        createDelegateSessionIx(publicKey, machinePda),
      );

      const { blockhash } =
        await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      showToast(
        "🎟️",
        `BUYING ${ticketCount} TICKETS`,
        "Approve in your wallet to load tickets...",
      );
      const sig = await runWithWalletAuth(() =>
        sendTransaction(tx, baseConnection),
      );
      await confirmTx(baseConnection, sig);
      setLastSignature(sig);

      await refreshMachineAndSession();
      showToast(
        "✅",
        `${ticketCount} TICKETS LOADED!`,
        "You're ready to play — move the claw and drop!",
        3800,
        "success",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("❌", "BUY TICKETS FAILED", msg.slice(0, 100), 5000);
    } finally {
      setOnboardingLoading(false);
    }
  };

  // Withdraw Tickets to Wallet (Undelegates ER session & transfers session Test USDC back to wallet)
  const handleWithdrawUsdc = async () => {
    if (!publicKey || !machineConfig || !playerSession?.isDelegated) return;
    setOnboardingLoading(true);
    try {
      const tx = new Transaction().add(
        createRequestWithdrawAndUndelegateIx(
          publicKey,
          machinePda,
          machineConfig.usdcMint,
          BigInt(0),
        ),
      );
      const { blockhash } = await erConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      if (!signTransaction) {
        throw new Error(
          "Wallet does not support signTransaction for MagicBlock ER.",
        );
      }

      showToast(
        "💸",
        "WITHDRAWING TICKETS",
        "Approve withdrawal in your wallet...",
      );
      const signed = await runWithWalletAuth(() => signTransaction(tx));
      await erConnection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "processed",
      });

      const undelegated = await waitForSessionUndelegated(
        publicKey,
        machinePda,
      );
      if (!undelegated) {
        throw new Error("Timed out waiting for withdrawal settlement.");
      }

      const ownerUsdcAta = getAssociatedTokenAddressSync(
        machineConfig.usdcMint,
        publicKey,
      );
      const l1Tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          ownerUsdcAta,
          publicKey,
          machineConfig.usdcMint,
        ),
        createExecuteL1UsdcWithdrawIx(
          machinePda,
          publicKey,
          machineConfig.usdcMint,
        ),
      );
      const { blockhash: l1Bh } =
        await baseConnection.getLatestBlockhash("confirmed");
      l1Tx.recentBlockhash = l1Bh;
      l1Tx.feePayer = publicKey;
      showToast(
        "🪙",
        "SETTLING TO WALLET",
        "Approve transfer to receive your Test USDC...",
      );
      const l1Sig = await runWithWalletAuth(() =>
        sendTransaction(l1Tx, baseConnection),
      );
      await confirmTx(baseConnection, l1Sig);
      setLastSignature(l1Sig);

      await refreshMachineAndSession();
      showToast(
        "✅",
        "TICKETS WITHDRAWN!",
        "Your Test USDC is back in your wallet.",
        3800,
        "success",
      );
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
      showToast(
        "🚰",
        "REQUESTING DEVNET SOL",
        "Airdropping 1 SOL for gas/rent...",
      );
      const sig = await requestDevnetAirdrop(publicKey);
      setLastSignature(sig);
      showToast("✨", "1.0 SOL AIRDROPPED!", "Ready for Devnet transactions.");
    } catch {
      showToast(
        "🪙",
        "DEVNET FAUCET RATE-LIMITED",
        "Use faucet.solana.com if you need Devnet SOL.",
      );
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

      if (isPracticeMode) {
        setGameStateText("DROPPING");
        return;
      }

      if (dropInFlightRef.current) {
        return;
      }

      if (!isOnchainActive || !publicKey) {
        showToast(
          "👛",
          "SESSION REQUIRED",
          "Connect wallet & buy Tickets to play!",
        );
        return;
      }

      if (!sessionKeyMatches) {
        showToast(
          "🔑",
          "SESSION KEY MISMATCH",
          "Open Tickets to re-sync your session key.",
        );
        return;
      }

      if (hasPendingPrize) {
        showToast(
          "🏆",
          "PRIZE WAITING",
          "Claim or sell back your won prize first.",
        );
        setIsWinModalOpen(true);
        return;
      }

      dropInFlightRef.current = true;
      setGameStateText("DROPPING");
      setVrfStatus("Rolling");

      try {
        const sessionKey = getOrCreateSessionKey(publicKey);
        const t0 = Date.now();

        // Fetch fresh ER session + latest blockhash in parallel to avoid stale state & minimize latency
        const [liveSession, { blockhash }] = await Promise.all([
          fetchPlayerSession(publicKey, machinePda),
          erConnection.getLatestBlockhash("confirmed"),
        ]);

        if (!liveSession || !liveSession.isDelegated) {
          showToast(
            "🎟️",
            "SESSION NOT ACTIVE",
            "Open Tickets to deposit and start playing.",
          );
          vrfNonceCounterRef.current += 1;
          setOnchainVrfResult({
            nonce: vrfNonceCounterRef.current,
            outcome: "Miss",
            roll: 9999,
            targetSlot: 0,
            isBullseye: false,
          });
          await refreshMachineAndSession(false);
          return;
        }

        setPlayerSession(liveSession);
        setUsdcBalance(Number(liveSession.usdcBalance) / 1_000_000);

        if (liveSession.state === "WonPendingChoice") {
          showToast(
            "🏆",
            "PRIZE WAITING",
            "Claim or sell back your won prize first.",
          );
          await refreshMachineAndSession(true);
          return;
        }

        if (liveSession.state === "AwaitingVrf") {
          const settled = await waitForVrfResolution(
            publicKey,
            machinePda,
            liveSession.vrfRequestNonce,
            5000,
          );
          if (settled) {
            setPlayerSession(settled);
            setUsdcBalance(Number(settled.usdcBalance) / 1_000_000);
          }
          await refreshMachineAndSession(false);
          return;
        }

        const feeUnits = machineConfig?.playFeeUsdc ?? BigInt(1_000_000);
        if (
          liveSession.state === "Idle" &&
          liveSession.usdcBalance < feeUnits
        ) {
          showToast(
            "🎟️",
            "OUT OF TICKETS",
            "Click Tickets (top left) to buy more!",
          );
          setIsTicketsModalOpen(true);
          vrfNonceCounterRef.current += 1;
          setOnchainVrfResult({
            nonce: vrfNonceCounterRef.current,
            outcome: "Miss",
            roll: 9999,
            targetSlot: 0,
            isBullseye: false,
          });
          setVrfStatus("Ready");
          setGameStateText("LOW BALANCE");
          return;
        }

        const tx = new Transaction();
        let curX = liveSession.clawX;
        let curZ = liveSession.clawZ;
        const isStaleSteering =
          liveSession.state === "Steering" &&
          Date.now() / 1000 > Number(liveSession.playExpiresAt);

        if (liveSession.state === "Idle") {
          tx.add(
            createStartPlayIx(sessionKey.publicKey, machinePda, publicKey),
          );
          curX = 500;
          curZ = 500;
        }

        if (!isStaleSteering) {
          while (curX !== clawX || curZ !== clawZ) {
            const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, clawX - curX));
            const dz = Math.max(-MAX_STEP, Math.min(MAX_STEP, clawZ - curZ));
            tx.add(
              createSteerClawIx(
                sessionKey.publicKey,
                machinePda,
                publicKey,
                dx,
                dz,
              ),
            );
            curX += dx;
            curZ += dz;
          }
        }

        tx.add(
          createDropClawIx(
            sessionKey.publicKey,
            machinePda,
            publicKey,
            clientSeed,
          ),
        );

        tx.recentBlockhash = blockhash;
        tx.feePayer = sessionKey.publicKey;
        tx.sign(sessionKey);

        const sig = await erConnection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "processed",
        });
        setErLatencyMs(Math.max(8, Date.now() - t0));
        setLastSignature(sig);

        const expectedNonce = liveSession.vrfRequestNonce + BigInt(1);
        const resolved = await waitForVrfResolution(
          publicKey,
          machinePda,
          expectedNonce,
        );

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

          const targetSlotInfo = machineConfig?.slots.find(
            (s) => s.slotId === resolved.targetSlot,
          );
          if (outcome === "Won") {
            setGameStateText("WINNER!");
            showToast(
              "🏆",
              resolved.isBullseye ? "BULLSEYE GRAB!" : "NICE GRAB!",
              `Lifting ${targetSlotInfo?.name || "your prize"}!`,
              3600,
              "success",
            );
          } else if (outcome === "Slipped") {
            setGameStateText("SLIPPED!");
            showToast(
              "😬",
              "GRIP SLIPPED!",
              `So close on ${targetSlotInfo?.name || "that pack"} — try again!`,
              3200,
              "warning",
            );
          } else {
            setGameStateText("MISSED!");
            showToast(
              "💨",
              "CLAW MISSED!",
              "Line up directly over a prize pack and try again.",
              3200,
              "warning",
            );
          }

          void refreshMachineAndSession(false);
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
          showToast(
            "💨",
            "CLAW MISSED!",
            "No pack caught this round — give it another try!",
            3200,
            "warning",
          );
          void refreshMachineAndSession(false);
        }
      } catch (err: unknown) {
        console.error("Drop failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        showToast("❌", "DROP FAILED", msg.slice(0, 100), 4500, "error");
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
        void refreshMachineAndSession(false);
      } finally {
        dropInFlightRef.current = false;
      }
    },
    [
      isPracticeMode,
      isOnchainActive,
      publicKey,
      sessionKeyMatches,
      hasPendingPrize,
      machinePda,
      machineConfig,
      showToast,
      refreshMachineAndSession,
    ],
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
      createSellBackPrizeIx(
        sessionKey.publicKey,
        machinePda,
        publicKey,
        priceFeed,
      ),
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
    showToast(
      "🎟️",
      "ONCHAIN SELL-BACK SETTLED!",
      `Credited +${wonPrize.sellBackUsdc.toFixed(2)} Tickets to your session.`,
    );
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
      latestErSession.pendingClaimMint.toBase58() !==
        PublicKey.default.toBase58()
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
        createClaimPrizeIx(
          sessionKey.publicKey,
          machinePda,
          publicKey,
          prizeMint,
        ),
      );
      const { blockhash: erBh } =
        await erConnection.getLatestBlockhash("confirmed");
      claimTx.recentBlockhash = erBh;
      claimTx.feePayer = sessionKey.publicKey;
      claimTx.sign(sessionKey);

      const erSig = await erConnection.sendRawTransaction(claimTx.serialize(), {
        skipPreflight: true,
      });
      await confirmTx(erConnection, erSig);
      setIsPendingClaimOnly(true);
    }

    // 2. Wait until claim settles to Solana L1
    showToast(
      "⏳",
      "PREPARING CLAIM",
      "Finalizing your prize for wallet transfer...",
      4000,
      "info",
    );
    const committed = await waitForL1ClaimCommit(
      publicKey,
      machinePda,
      expectedClaimNonce,
    );
    if (!committed) {
      throw new Error("Timed out finalizing claim. Click retry to finish.");
    }

    // 3. Create ATA (idempotent) + execute L1 prize transfer in 1 wallet-approved L1 tx
    const claimedNonce = await fetchPlayerLedgerLastClaimedNonce(
      publicKey,
      machinePda,
    );
    if (claimedNonce < expectedClaimNonce) {
      const ownerPrizeAta = getAssociatedTokenAddressSync(prizeMint, publicKey);
      const l1ClaimTx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          ownerPrizeAta,
          publicKey,
          prizeMint,
        ),
        createExecuteL1PrizeClaimIx(machinePda, publicKey, prizeMint),
      );
      const { blockhash: l1Bh } =
        await baseConnection.getLatestBlockhash("confirmed");
      l1ClaimTx.recentBlockhash = l1Bh;
      l1ClaimTx.feePayer = publicKey;
      showToast(
        "📦",
        "CLAIMING TO WALLET",
        "Approve transfer in your wallet...",
        4000,
        "info",
      );
      const l1Sig = await runWithWalletAuth(() =>
        sendTransaction(l1ClaimTx, baseConnection),
      );
      await confirmTx(baseConnection, l1Sig);
      setLastSignature(l1Sig);
    }

    setIsPendingClaimOnly(false);
    await refreshMachineAndSession();
    showToast(
      "🎉",
      "PRIZE SENT TO YOUR WALLET!",
      `${wonPrize.name} landed in your wallet!`,
      4200,
      "success",
    );
  };

  const handlePracticeOutcome = useCallback(
    (outcome: "Miss" | "Slipped" | "Won", slotName?: string) => {
      if (outcome === "Won") {
        setGameStateText("WINNER!");
        showToast(
          "🏆",
          "NICE GRAB!",
          `Lifting ${slotName || "your prize"}!`,
          3200,
          "success",
        );
      } else if (outcome === "Slipped") {
        setGameStateText("SLIPPED!");
        showToast(
          "😬",
          "GRIP SLIPPED!",
          `So close on ${slotName || "that pack"} — try again!`,
          3000,
          "warning",
        );
      } else {
        setGameStateText("MISSED!");
        showToast(
          "💨",
          "CLAW MISSED!",
          "Line up directly over a prize pack and try again.",
          3000,
          "warning",
        );
      }
    },
    [showToast],
  );

  const togglePracticeMode = useCallback(() => {
    setIsPracticeMode((prev) => {
      const next = !prev;
      if (next) {
        setGameStateText("PRACTICE READY");
        showToast(
          "🕹️",
          "PRACTICE MODE ON",
          "Play free without tickets — nothing is sent on-chain.",
          3400,
          "success",
        );
      } else {
        setGameStateText(
          hasPendingPrize
            ? "CLAIM PRIZE!"
            : isOnchainActive && sessionKeyMatches && usdcBalance >= playFeeUsd
              ? "READY"
              : isOnchainActive
                ? "LOW BALANCE"
                : "DEPOSIT TO PLAY",
        );
        showToast(
          "🎟️",
          "LIVE MODE ACTIVE",
          "Switched back to live on-chain plays.",
          2800,
          "info",
        );
      }
      return next;
    });
  }, [
    hasPendingPrize,
    isOnchainActive,
    sessionKeyMatches,
    usdcBalance,
    playFeeUsd,
    showToast,
  ]);

  const triggerDropBtn = () => {
    if (dropInFlightRef.current) {
      return;
    }
    if (isPracticeMode) {
      arcadeAudio.init();
      setIsDropRequested(true);
      return;
    }
    if (!connected || !publicKey) {
      showToast(
        "👛",
        "CONNECT WALLET FIRST",
        "Connect your Solana Devnet wallet to play!",
        3800,
        "warning",
      );
      return;
    }
    if (!isOnchainActive) {
      showToast(
        "🎟️",
        "TICKETS REQUIRED",
        "Load tickets from the Tickets button (top left) to play!",
        3800,
        "warning",
      );
      setIsTicketsModalOpen(true);
      return;
    }
    if (!sessionKeyMatches) {
      showToast(
        "🔑",
        "SESSION SYNC NEEDED",
        "Re-open Tickets to refresh your play session.",
        3800,
        "warning",
      );
      setIsTicketsModalOpen(true);
      return;
    }
    if (hasPendingPrize) {
      showToast(
        "🏆",
        "PRIZE WAITING!",
        "Claim or sell back your won prize to keep playing.",
        3800,
        "warning",
      );
      setIsWinModalOpen(true);
      return;
    }
    if (playerSession?.state === "AwaitingVrf") {
      showToast(
        "⏳",
        "RESOLVING DROP",
        "Finishing your previous drop...",
        2500,
        "info",
      );
      return;
    }
    if (usdcBalance < playFeeUsd && playerSession?.state !== "Steering") {
      showToast(
        "🎟️",
        "OUT OF TICKETS",
        "Buy more tickets from the top-left Tickets button!",
        3800,
        "warning",
      );
      setIsTicketsModalOpen(true);
      return;
    }
    arcadeAudio.init();
    setIsDropRequested(true);
  };

  const handleClawStateChange = useCallback(
    (clawState: string) => {
      if (clawState === "READY") {
        setGameStateText(
          isPracticeMode
            ? "PRACTICE READY"
            : hasPendingPrize
              ? "CLAIM PRIZE!"
              : canPlayTurn
                ? "READY"
                : isOnchainActive
                  ? "LOW BALANCE"
                  : "DEPOSIT TO PLAY",
        );
      } else {
        setGameStateText(clawState);
      }
    },
    [isPracticeMode, hasPendingPrize, canPlayTurn, isOnchainActive],
  );

  const handleSceneReady = useCallback(() => {
    setIsSceneReady(true);
  }, []);

  const ticketBalance = playFeeUsd > 0 ? usdcBalance / playFeeUsd : usdcBalance;

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#060710] flex flex-col justify-between">
      {!isLoaderDone && (
        <LoadingScreen progress={loaderProgress} fadingOut={isLoaderFading} />
      )}

      {/* 3D WebGL Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <ClawMachineView
          slots={machineConfig?.slots}
          usdcBalance={isPracticeMode ? "DEMO" : ticketBalance.toFixed(2)}
          isSteeringAllowed={canPlayTurn}
          isOnchainActive={isPracticeMode ? false : isOnchainActive}
          isPracticeMode={isPracticeMode}
          onPracticeOutcome={handlePracticeOutcome}
          onchainVrfResult={onchainVrfResult}
          onSteerDelta={handleSteerDelta}
          onDropTriggered={handleDropTriggered}
          onWinPrize={handleWinPrize}
          activeCamMode={activeCamMode}
          onCamModeChange={setActiveCamMode}
          virtualJoyVector={virtualJoyVector}
          isDropRequested={isDropRequested}
          gameStateText={gameStateText}
          powerReplayCount={0}
          coinInsertCount={coinInsertCount}
          isLoaderVisible={!isLoaderDone}
          showProjection={showProjection}
          isPrizesZoomed={isPrizesZoomActive}
          onPrizesZoomComplete={() => setIsOddsModalOpen(true)}
          onSceneReady={handleSceneReady}
          onBootStateChange={(hudHidden, booting) => {
            setIsBootHudHidden(hudHidden);
            if (!hudHidden && !booting && !bootAutoGuideCheckedRef.current) {
              bootAutoGuideCheckedRef.current = true;
              try {
                const seen = window.localStorage.getItem(
                  "magiclaw_how_to_play_seen_v1",
                );
                if (!seen) {
                  window.localStorage.setItem(
                    "magiclaw_how_to_play_seen_v1",
                    "1",
                  );
                  if (!isWinModalOpen) {
                    setIsHowToPlayOpen(true);
                  }
                }
              } catch {
                // Ignore storage errors
              }
            }
          }}
          onClawStateChange={handleClawStateChange}
        />
      </div>

      <ArcadeHUD
        mounted={mounted}
        isBootHudHidden={isBootHudHidden}
        canPlayTurn={canPlayTurn}
        isPracticeMode={isPracticeMode}
        ticketBalance={ticketBalance}
        inStockCount={
          machineConfig
            ? machineConfig.slots.filter((s) => s.inStock && !s.reserved).length
            : 0
        }
        toastMessage={toastMessage}
        gameStateText={gameStateText}
        erLatencyMs={erLatencyMs}
        isMachineDelegated={Boolean(machineConfig?.isDelegated)}
        vrfStatus={vrfStatus}
        lastSignature={lastSignature}
        onOpenTicketsModal={() => setIsTicketsModalOpen(true)}
        onTogglePracticeMode={togglePracticeMode}
        onOpenOddsModal={() => setIsPrizesZoomActive(true)}
        onOpenHowToPlayModal={() => setIsHowToPlayOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onCloseToast={closeToast}
        onJoystickMove={setVirtualJoyVector}
        onTriggerDrop={triggerDropBtn}
      />

      <TicketsModal
        isOpen={isTicketsModalOpen}
        onClose={() => setIsTicketsModalOpen(false)}
        connected={connected}
        isOnchainActive={isOnchainActive}
        ticketBalance={ticketBalance}
        walletUsdcBalance={walletUsdcBalance}
        playFeeUsd={playFeeUsd}
        faucetLoading={faucetLoading}
        onboardingLoading={onboardingLoading}
        onBuyTickets={handleBuyTickets}
        onAirdropUsdc={handleAirdropTestUsdc}
        onWithdrawTickets={handleWithdrawUsdc}
        onSolFaucet={handleSolFaucet}
      />

      <PostWinModal
        prize={wonPrize}
        isOpen={isWinModalOpen}
        pendingClaimOnly={isPendingClaimOnly}
        isPracticeMode={isPracticeMode}
        onClose={() => {
          setIsWinModalOpen(false);
          if (isPracticeMode) {
            setWonPrize(null);
            setGameStateText("PRACTICE READY");
            return;
          }
          if (hasPendingPrize) {
            showToast(
              "🏆",
              "PRIZE WAITING!",
              "Press DROP anytime to claim or sell back your prize.",
              3800,
              "warning",
            );
          }
          setGameStateText(
            hasPendingPrize
              ? "CLAIM PRIZE!"
              : canPlayTurn
                ? "READY"
                : "DEPOSIT TO PLAY",
          );
        }}
        onSellBack={handleSellBackPrize}
        onClaimToWallet={handleClaimPrize}
      />

      <VaultOddsModal
        isOpen={isOddsModalOpen}
        onClose={() => {
          setIsOddsModalOpen(false);
          setIsPrizesZoomActive(false);
          setActiveCamMode("hero");
        }}
        isDelegated={Boolean(machineConfig?.isDelegated)}
        slots={machineConfig?.slots}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        musicVolume={musicVolume}
        sfxVolume={sfxVolume}
        musicEnabled={musicEnabled}
        sfxEnabled={sfxEnabled}
        showProjection={showProjection}
        onMusicVolumeChange={handleMusicVolumeChange}
        onSfxVolumeChange={handleSfxVolumeChange}
        onToggleMusicEnabled={toggleMusicEnabled}
        onToggleSfxEnabled={toggleSfxEnabled}
        onToggleProjection={toggleProjection}
        onResetDefaults={handleResetSettings}
      />

      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
        onOpenRewards={() => setIsPrizesZoomActive(true)}
      />
    </main>
  );
}
