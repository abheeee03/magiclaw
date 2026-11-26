"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ArcadeToastVariant = "info" | "success" | "warning" | "error";

export interface ArcadeToastData {
  id: number;
  icon: string;
  title: string;
  sub: string;
  variant?: ArcadeToastVariant;
  duration?: number;
}

interface ArcadeToastProps {
  toast: ArcadeToastData | null;
  onClose: () => void;
}

const VARIANT_STYLES: Record<
  ArcadeToastVariant,
  { badgeBg: string; badgeBorder: string }
> = {
  info: {
    badgeBg: "linear-gradient(180deg, #4EB5FF 0%, #1E7DF2 100%)",
    badgeBorder: "#0D3B8A",
  },
  success: {
    badgeBg: "linear-gradient(180deg, #54EB36 0%, #24BD14 100%)",
    badgeBorder: "#167A0B",
  },
  warning: {
    badgeBg: "linear-gradient(180deg, #FFE14D 0%, #F59E0B 100%)",
    badgeBorder: "#B45309",
  },
  error: {
    badgeBg: "linear-gradient(180deg, #FF5B66 0%, #DF1825 100%)",
    badgeBorder: "#8A0811",
  },
};

export const ArcadeToast: React.FC<ArcadeToastProps> = ({ toast, onClose }) => {
  const variant: ArcadeToastVariant = toast?.variant ?? "info";
  const styles = VARIANT_STYLES[variant];

  return (
    <div className="fixed top-[68px] sm:top-[95px] right-3 sm:right-4 z-[70] w-[calc(100vw-1.5rem)] max-w-[364px] pointer-events-none flex justify-end">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 120, scale: 0.94 }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              transition: {
                type: "spring",
                stiffness: 380,
                damping: 26,
              },
            }}
            exit={{
              opacity: 0,
              x: 150,
              scale: 0.94,
              transition: { duration: 0.2, ease: "easeIn" },
            }}
            role="status"
            aria-live="polite"
            className="pointer-events-auto relative w-full rounded-[20px] border-[3px] border-[#3E200C] bg-[#FDF8EE] shadow-[0_5px_0_#3E200C,0_14px_28px_rgba(0,0,0,0.42)] px-3.5 py-3 pr-7 select-none"
          >
            {/* Glossy 3D Red Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notification"
              className="cartoon-close-btn absolute -right-2.5 -top-2.5 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="relative z-10 h-3.5 w-3.5 text-white drop-shadow-[0_1.5px_0_rgba(120,8,15,0.85)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="4.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              {/* Left Glossy Cartoon Icon Badge */}
              <div
                className="w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 text-lg shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_2px_0_rgba(0,0,0,0.22)]"
                style={{
                  background: styles.badgeBg,
                  borderColor: styles.badgeBorder,
                }}
              >
                <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
                  {toast.icon}
                </span>
              </div>

              {/* Message Content */}
              <div className="min-w-0 flex-1 flex flex-col leading-tight">
                <span className="text-sm sm:text-base font-black uppercase tracking-wide text-[#3E200C] truncate">
                  {toast.title}
                </span>
                <span className="text-[11px] font-bold text-[#6E4B2A] mt-0.5 leading-snug break-words">
                  {toast.sub}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
