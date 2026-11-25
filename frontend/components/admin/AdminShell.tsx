"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Lock, LogOut, Coins, Sliders, ArrowLeft, ShieldAlert } from "lucide-react";

interface AdminShellProps {
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ children }) => {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/admin/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        setConfigured(data.configured !== false);
      })
      .catch(() => {
        setError("Failed to verify admin session");
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid password");
        return;
      }
      setAuthenticated(true);
      setPassword("");
    } catch {
      setError("Network error while verifying password");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthenticated(false);
  };

  if (checking) {
    return (
      <div className="h-screen w-screen bg-[#070812] flex items-center justify-center text-slate-300 font-mono text-sm">
        Checking admin authorization...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[#070812] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-cyan-500/30 bg-slate-900/95 p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-arcade text-lg font-black tracking-wider text-white">
                CLAWVAULT ADMIN
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Protected by ADMIN_PASSWORD
              </p>
            </div>
          </div>

          {!configured && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <code>ADMIN_PASSWORD</code> is not set in <code>frontend/.env.local</code>. Add it and restart the Next.js server.
              </span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Admin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter ADMIN_PASSWORD..."
                autoFocus
                className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 outline-none px-3.5 py-2.5 text-sm text-white font-mono"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-mono">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 disabled:opacity-50 text-white font-arcade font-bold text-sm cursor-pointer shadow-lg"
            >
              {submitting ? "VERIFYING..." : "UNLOCK ADMIN PANEL"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between items-center text-xs">
            <Link
              href="/"
              className="text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 font-mono"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Arcade
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[#070812] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070812]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Arcade
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <span className="font-arcade text-sm font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-pink-400 to-amber-300">
              CLAWVAULT ADMIN
            </span>

            <nav className="flex items-center gap-1.5 ml-2">
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  pathname === "/admin"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Machine &amp; Prizes
              </Link>
              <Link
                href="/admin/mint-prizes"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  pathname === "/admin/mint-prizes"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                Mint Devnet Prizes
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {mounted && (
              <WalletMultiButton className="!bg-gradient-to-r !from-indigo-600 !to-purple-600 !rounded-xl !h-9 !py-0 !px-3 !text-xs !font-arcade !font-bold" />
            )}
            <button
              onClick={handleLogout}
              title="Lock Admin Panel"
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-mono flex items-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20">{children}</main>
    </div>
  );
};
