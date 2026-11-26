"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  Coins,
  Sparkles,
  Plus,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { AdminShell } from "../../../components/admin/AdminShell";
import { baseConnection, confirmTx } from "../../../lib/solana";
import {
  WalletTokenInfo,
  createCreateMasterEditionV3Ix,
  createCreateMetadataV3Ix,
  createUpdateMetadataV2Ix,
  fetchWalletTokenAccounts,
} from "../../../lib/adminSolana";

interface SavedMintMeta {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  isNft: boolean;
  createdAt: number;
}

const STORAGE_KEY = "clawvault_admin_mints_v1";

function loadSavedMints(): SavedMintMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedMintMeta[]) : [];
  } catch {
    return [];
  }
}

function saveMintMeta(entry: SavedMintMeta) {
  if (typeof window === "undefined") return;
  const existing = loadSavedMints().filter((m) => m.mint !== entry.mint);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([entry, ...existing])
  );
}

function toBaseUnits(amountStr: string, decimals: number): bigint {
  const cleaned = amountStr.trim();
  if (!cleaned) return BigInt(0);
  const [whole, frac = ""] = cleaned.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt(paddedFrac || "0");
}

export default function MintPrizesPage() {
  const { publicKey, sendTransaction } = useWallet();

  const [mode, setMode] = useState<"spl" | "nft">("spl");
  const [name, setName] = useState("ClawVault Test USDC");
  const [symbol, setSymbol] = useState("USDC");
  const [decimals, setDecimals] = useState(6);
  const [supply, setSupply] = useState("10000");
  const [uri, setUri] = useState("");
  const [attachMetadata, setAttachMetadata] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
    sig?: string;
    mint?: string;
  } | null>(null);

  const [walletTokens, setWalletTokens] = useState<WalletTokenInfo[]>([]);
  const [savedMints, setSavedMints] = useState<SavedMintMeta[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const [mintMoreAmount, setMintMoreAmount] = useState<Record<string, string>>({});
  const [editingMint, setEditingMint] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSymbol, setEditSymbol] = useState("");
  const [editUri, setEditUri] = useState("");

  const publicKeyBase58 = publicKey?.toBase58() ?? null;

  const refreshWalletTokens = useCallback(async () => {
    setSavedMints(loadSavedMints());
    if (!publicKeyBase58) {
      setWalletTokens([]);
      return;
    }
    setLoadingTokens(true);
    try {
      const list = await fetchWalletTokenAccounts(new PublicKey(publicKeyBase58));
      setWalletTokens(list);
    } catch (err) {
      console.error("Failed to fetch wallet tokens:", err);
    } finally {
      setLoadingTokens(false);
    }
  }, [publicKeyBase58]);

  useEffect(() => {
    refreshWalletTokens();
  }, [refreshWalletTokens]);

  const applyPreset = (preset: "usdc" | "bonk" | "jup" | "nft") => {
    if (preset === "usdc") {
      setMode("spl");
      setName("ClawVault Test USDC");
      setSymbol("USDC");
      setDecimals(6);
      setSupply("10000");
      setUri("");
      setAttachMetadata(true);
    } else if (preset === "bonk") {
      setMode("spl");
      setName("Devnet BONK Pack");
      setSymbol("dBONK");
      setDecimals(5);
      setSupply("1000000");
      setUri("");
      setAttachMetadata(true);
    } else if (preset === "jup") {
      setMode("spl");
      setName("Devnet JUP Bundle");
      setSymbol("dJUP");
      setDecimals(6);
      setSupply("5000");
      setUri("");
      setAttachMetadata(true);
    } else {
      setMode("nft");
      setName("Cyber Claw Grail NFT");
      setSymbol("CROWN");
      setDecimals(0);
      setSupply("1");
      setUri("https://arweave.net/clawvault-grail-placeholder.json");
      setAttachMetadata(true);
    }
  };

  const handleCreateMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) {
      setStatusMsg({ type: "err", text: "Connect your admin wallet first." });
      return;
    }

    const effectiveDecimals = mode === "nft" ? 0 : decimals;
    const rawSupply =
      mode === "nft" ? BigInt(1) : toBaseUnits(supply, effectiveDecimals);
    if (rawSupply <= BigInt(0)) {
      setStatusMsg({ type: "err", text: "Initial supply must be greater than 0." });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const mintKeypair = Keypair.generate();
      const lamports = await getMinimumBalanceForRentExemptMint(baseConnection);
      const adminAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        publicKey
      );

      const tx = new Transaction();
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(
          mintKeypair.publicKey,
          effectiveDecimals,
          publicKey,
          publicKey,
          TOKEN_PROGRAM_ID
        ),
        createAssociatedTokenAccountInstruction(
          publicKey,
          adminAta,
          publicKey,
          mintKeypair.publicKey
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          adminAta,
          publicKey,
          rawSupply
        )
      );

      if (attachMetadata) {
        tx.add(
          createCreateMetadataV3Ix({
            mint: mintKeypair.publicKey,
            mintAuthority: publicKey,
            payer: publicKey,
            updateAuthority: publicKey,
            name: name.trim() || "ClawVault Prize",
            symbol: symbol.trim() || "PRIZE",
            uri: uri.trim(),
            isMutable: true,
          })
        );
        if (mode === "nft") {
          tx.add(
            createCreateMasterEditionV3Ix({
              mint: mintKeypair.publicKey,
              mintAuthority: publicKey,
              payer: publicKey,
              updateAuthority: publicKey,
            })
          );
        }
      }

      const { blockhash } =
        await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.partialSign(mintKeypair);

      const sig = await sendTransaction(tx, baseConnection);
      await confirmTx(baseConnection, sig);

      const mintAddress = mintKeypair.publicKey.toBase58();
      saveMintMeta({
        mint: mintAddress,
        name: name.trim(),
        symbol: symbol.trim(),
        decimals: effectiveDecimals,
        isNft: mode === "nft",
        createdAt: Date.now(),
      });

      setStatusMsg({
        type: "ok",
        text: `Created ${mode === "nft" ? "1/1 NFT" : "SPL Token"} ${symbol} (${mintAddress})`,
        sig,
        mint: mintAddress,
      });

      await refreshWalletTokens();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "err", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMintMore = async (token: WalletTokenInfo) => {
    if (!publicKey) return;
    const amtStr = mintMoreAmount[token.mint] || "100";
    const raw = toBaseUnits(amtStr, token.decimals);
    if (raw <= BigInt(0)) return;

    setSubmitting(true);
    setStatusMsg(null);
    try {
      const mintPk = new PublicKey(token.mint);
      const ata = new PublicKey(token.ata);
      const tx = new Transaction().add(
        createMintToInstruction(mintPk, ata, publicKey, raw)
      );
      const { blockhash } =
        await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, baseConnection);
      await confirmTx(baseConnection, sig);

      setStatusMsg({
        type: "ok",
        text: `Minted +${amtStr} to ${token.mint.slice(0, 8)}...`,
        sig,
      });
      await refreshWalletTokens();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "err", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMint(text);
    setTimeout(() => setCopiedMint(null), 1500);
  };

  const openEditMeta = (t: WalletTokenInfo, meta?: SavedMintMeta) => {
    setEditingMint(t.mint);
    setEditName(meta?.name || "ClawVault Test USDC");
    setEditSymbol(meta?.symbol || "USDC");
    setEditUri("");
  };

  const handleUpdateMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !editingMint) return;
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const mintPk = new PublicKey(editingMint);
      const tx = new Transaction().add(
        createUpdateMetadataV2Ix({
          mint: mintPk,
          updateAuthority: publicKey,
          name: editName.trim(),
          symbol: editSymbol.trim(),
          uri: editUri.trim(),
        })
      );
      const { blockhash } =
        await baseConnection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, baseConnection);
      await confirmTx(baseConnection, sig);

      const existing = savedMints.find((m) => m.mint === editingMint);
      const tokenInfo = walletTokens.find((t) => t.mint === editingMint);
      saveMintMeta({
        mint: editingMint,
        name: editName.trim(),
        symbol: editSymbol.trim(),
        decimals: tokenInfo?.decimals ?? existing?.decimals ?? 6,
        isNft: existing?.isNft ?? (tokenInfo?.decimals === 0 && tokenInfo?.amountRaw === BigInt(1)),
        createdAt: existing?.createdAt ?? Date.now(),
      });

      setStatusMsg({
        type: "ok",
        text: `Updated metadata for ${editSymbol.trim()} (${editingMint.slice(0, 8)}...)`,
        sig,
      });
      setEditingMint(null);
      await refreshWalletTokens();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "err", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const metaByMint = new Map(savedMints.map((m) => [m.mint, m]));

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-arcade text-2xl font-black text-white tracking-wide">
              MINT DEVNET PRIZES (SPL &amp; NFT)
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Create real Solana Devnet SPL tokens, Test USDC, and 1/1 NFTs to stock into your ClawVault machine.
            </p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-arcade font-bold flex items-center gap-1.5 hover:bg-cyan-500/25"
          >
            Go to Machine &amp; Prizes
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Mint Creator */}
          <div className="lg:col-span-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                Quick Presets
              </span>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => applyPreset("usdc")}
                  className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 cursor-pointer text-left"
                >
                  💵 Test USDC (6 dec)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("bonk")}
                  className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 cursor-pointer text-left"
                >
                  🐶 dBONK Prize Pack
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("jup")}
                  className="px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/20 cursor-pointer text-left"
                >
                  🪐 dJUP Prize Pack
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("nft")}
                  className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/20 cursor-pointer text-left"
                >
                  👑 1/1 Grail NFT
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateMint} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode("spl");
                    if (decimals === 0) setDecimals(6);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === "spl"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "text-slate-400"
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  SPL Token
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("nft");
                    setDecimals(0);
                    setSupply("1");
                  }}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === "nft"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "text-slate-400"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  1/1 SPL NFT
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={32}
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Symbol
                  </label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    maxLength={10}
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Decimals
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    disabled={mode === "nft"}
                    value={mode === "nft" ? 0 : decimals}
                    onChange={(e) => setDecimals(Number(e.target.value))}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Initial Mint Supply
                  </label>
                  <input
                    type="text"
                    disabled={mode === "nft"}
                    value={mode === "nft" ? "1" : supply}
                    onChange={(e) => setSupply(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Metadata JSON URI (optional)
                </label>
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="https://... (for NFT image & attributes)"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachMetadata}
                  onChange={(e) => setAttachMetadata(e.target.checked)}
                  className="rounded"
                />
                Attach Metaplex Token Metadata V3 (recommended)
              </label>

              <button
                type="submit"
                disabled={submitting || !publicKey}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-arcade font-black text-sm cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <Plus className="w-4 h-4" />
                {submitting
                  ? "MINTING ON DEVNET..."
                  : !publicKey
                  ? "CONNECT WALLET TO MINT"
                  : mode === "nft"
                  ? "MINT 1/1 DEVNET NFT"
                  : "CREATE & MINT SPL TOKEN"}
              </button>
            </form>
          </div>

          {/* Right: Wallet Minted Assets */}
          <div className="lg:col-span-7 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-arcade text-base font-bold text-white">
                  YOUR DEVNET WALLET TOKENS &amp; NFTS
                </h2>
                <p className="text-[11px] text-slate-400 font-mono">
                  Copy any mint address to initialize or stock into Machine slots on /admin.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshWalletTokens}
                disabled={loadingTokens}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingTokens ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            {!publicKey ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-800 rounded-2xl">
                Connect your Solana Devnet wallet to view and mint prize tokens.
              </div>
            ) : walletTokens.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-800 rounded-2xl">
                No SPL tokens found in this wallet on Devnet yet. Create one on the left!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                {walletTokens.map((t) => {
                  const meta = metaByMint.get(t.mint);
                  const isNft = t.decimals === 0 && t.amountRaw === BigInt(1);
                  return (
                    <div
                      key={t.ata}
                      className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-arcade text-xs font-bold text-white">
                            {meta
                              ? `${meta.name} (${meta.symbol})`
                              : t.name && t.symbol
                              ? `${t.name} (${t.symbol})`
                              : t.name || t.symbol || (isNft ? "Devnet NFT" : "Devnet SPL")}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                              isNft
                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                : "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                            }`}
                          >
                            {isNft ? "NFT (0 dec)" : `${t.decimals} dec`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-400">
                          <span>
                            {t.mint.slice(0, 12)}...{t.mint.slice(-8)}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(t.mint)}
                            className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                            title="Copy Mint Address"
                          >
                            {copiedMint === t.mint ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={`https://explorer.solana.com/address/${t.mint}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-white"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right mr-2">
                          <div className="font-arcade text-sm font-black text-emerald-300">
                            {t.uiAmount}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Balance
                          </div>
                        </div>

                        {t.decimals > 0 && (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={mintMoreAmount[t.mint] ?? "1000"}
                              onChange={(e) =>
                                setMintMoreAmount((prev) => ({
                                  ...prev,
                                  [t.mint]: e.target.value,
                                }))
                              }
                              className="w-16 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-mono text-white"
                            />
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleMintMore(t)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                            >
                              +Mint
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditMeta(t, meta)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-mono flex items-center gap-1 cursor-pointer border border-slate-700"
                          title="Update Name / Symbol / Icon URI"
                        >
                          <Pencil className="w-3 h-3" />
                          Update Meta
                        </button>
                      </div>

                      {editingMint === t.mint && (
                        <form
                          onSubmit={handleUpdateMetadata}
                          className="w-full mt-2 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2"
                        >
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Name"
                            maxLength={32}
                            required
                            className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                          <input
                            value={editSymbol}
                            onChange={(e) => setEditSymbol(e.target.value)}
                            placeholder="Symbol"
                            maxLength={10}
                            required
                            className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                          <input
                            value={editUri}
                            onChange={(e) => setEditUri(e.target.value)}
                            placeholder="https://...metadata.json"
                            className="sm:col-span-2 rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                          <div className="sm:col-span-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMint(null)}
                              className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="px-4 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-arcade font-bold cursor-pointer"
                            >
                              {submitting ? "UPDATING..." : "SAVE METADATA ONCHAIN"}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
