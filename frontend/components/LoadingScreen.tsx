"use client";

import React from "react";
import { Nunito } from "next/font/google";
import Image from "next/image";
import FunkyProgressBar from "./loadingbar";

const nunito = Nunito({ subsets: ["latin"] });

interface LoadingScreenProps {
  progress?: number;
  fadingOut?: boolean;
}

export function LoadingScreen({
  progress = 58,
  fadingOut = false,
}: LoadingScreenProps) {
  return (
    <div
      className={`fixed inset-0 z-50 h-screen w-full flex text-black bg-[#E0E0E0] flex-col items-center justify-center transition-opacity duration-500 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${nunito.className}`}
    >
      <div className="text-5xl sm:text-7xl font-black tracking-tight">
        Magiclaw
      </div>
      <div className="flex flex-col items-center justify-center my-14 sm:my-20">
        <h3 className="font-bold text-black/80 mb-3">powered by</h3>
        <div className="flex items-center justify-center gap-8 sm:gap-10">
          <Image
            src="/magicblock.png"
            height={150}
            width={150}
            alt="magicblock"
            priority
            className="w-28 h-auto sm:w-[150px]"
          />
          <Image
            src="/solana.png"
            height={150}
            width={150}
            alt="solana"
            priority
            className="w-28 h-auto sm:w-[150px]"
          />
        </div>
      </div>
      <div className="w-64 sm:w-1/4 min-w-[220px]">
        <FunkyProgressBar value={progress} size="sm" />
      </div>
    </div>
  );
}

export default LoadingScreen;
