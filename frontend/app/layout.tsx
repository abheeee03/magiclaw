import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "../components/WalletProvider";
import { Nunito, Plus_Jakarta_Sans, Poppins } from "next/font/google";

export const metadata: Metadata = {
  title: "MAGICLAW — Real-Time Onchain 3D Arcade Claw Machine",
  description:
    "An arcade claw machine you play from your phone, stocked with real onchain collectibles and tokens instead of plush toys. Powered by MagicBlock Ephemeral Rollups, VRF, Pyth Lazer, and Solana.",
};

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-nunito",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased dark ${nunito.variable} ${poppins.variable} ${plusJakarta.variable}`}
    >
      <body
        className={`${nunito.className} font-semibold h-full w-full overflow-hidden bg-[#060710] text-slate-100 flex flex-col`}
      >
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
