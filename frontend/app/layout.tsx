import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "../components/WalletProvider";

export const metadata: Metadata = {
  title: "ClawVault — Real-Time Onchain 3D Arcade Claw Machine",
  description:
    "An arcade claw machine you play from your phone, stocked with real onchain collectibles and tokens instead of plush toys. Powered by MagicBlock Ephemeral Rollups, VRF, Pyth Lazer, and Solana.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full w-full overflow-hidden bg-[#070812] text-slate-100 flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
