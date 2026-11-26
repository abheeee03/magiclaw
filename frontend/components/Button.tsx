import React, { forwardRef, useState } from "react";

export type GameButtonVariant =
  | "primary" // White face, black text (requested)
  | "accent" // Yellow face, white text (requested)
  | "success" // Green face, white text (matches the reference image)
  | "danger" // Red face, white text
  | "info" // Blue face, white text
  | "neutral"; // Dark slate face, white text

export type GameButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

export interface GameButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  fullWidth?: boolean;
}

interface VariantConfig {
  faceBg: string;
  faceBorder: string;
  depthBg: string;
  depthBorder: string;
  textColor: string;
  textStroke?: string;
  textShadow?: string;
  faceInnerShadow: string;
  shineColor: string;
}

const VARIANTS: Record<GameButtonVariant, VariantConfig> = {
  // Primary: White face, Black text
  primary: {
    faceBg: "bg-gradient-to-b from-white via-[#fcfcfc] to-[#e7ebee]",
    faceBorder: "border-[#1e232a]",
    depthBg: "bg-[#9ba3af]",
    depthBorder: "border-[#1e232a]",
    textColor: "text-black",
    textShadow: "0 2px 0 rgba(0, 0, 0, 0.15)",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.9), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.08)",
    shineColor: "bg-white/70",
  },
  // Accent: Yellow face, White text (with dark warm outline for contrast)
  accent: {
    faceBg: "bg-gradient-to-b from-[#ffe838] via-[#ffd014] to-[#f5b300]",
    faceBorder: "border-[#241a02]",
    depthBg: "bg-[#b87100]",
    depthBorder: "border-[#241a02]",
    textColor: "text-white",
    textStroke: "3px #6b3e02",
    textShadow: "0 3px 0 #4a2b02",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.65), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.15)",
    shineColor: "bg-white/55",
  },
  // Success: Exact replica of the reference image (Lime/Apple Green)
  success: {
    faceBg: "bg-gradient-to-b from-[#5fed32] via-[#48dd26] to-[#34c61a]",
    faceBorder: "border-[#152709]",
    depthBg: "bg-[#1c780f]",
    depthBorder: "border-[#152709]",
    textColor: "text-white",
    textStroke: "3.5px #113908",
    textShadow: "0 3px 0 #0d2b06",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.55), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.18)",
    shineColor: "bg-white/50",
  },
  // Danger: Crimson Red
  danger: {
    faceBg: "bg-gradient-to-b from-[#ff5c5c] via-[#f03a3a] to-[#d82222]",
    faceBorder: "border-[#2b0808]",
    depthBg: "bg-[#911212]",
    depthBorder: "border-[#2b0808]",
    textColor: "text-white",
    textStroke: "3px #570a0a",
    textShadow: "0 3px 0 #3b0606",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.55), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.2)",
    shineColor: "bg-white/50",
  },
  // Info: Bright Cyan / Sky Blue
  info: {
    faceBg: "bg-gradient-to-b from-[#38c8ff] via-[#1aafe8] to-[#0895cb]",
    faceBorder: "border-[#071f2b]",
    depthBg: "bg-[#06658a]",
    depthBorder: "border-[#071f2b]",
    textColor: "text-white",
    textStroke: "3px #063f57",
    textShadow: "0 3px 0 #042a3a",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.6), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.15)",
    shineColor: "bg-white/50",
  },
  // Neutral: Dark Slate
  neutral: {
    faceBg: "bg-gradient-to-b from-[#5b687a] via-[#475569] to-[#334155]",
    faceBorder: "border-[#0f172a]",
    depthBg: "bg-[#1e293b]",
    depthBorder: "border-[#0f172a]",
    textColor: "text-white",
    textStroke: "3px #0f172a",
    textShadow: "0 3px 0 #020617",
    faceInnerShadow:
      "inset 0 2.5px 0 0 rgba(255, 255, 255, 0.35), inset 0 -2.5px 0 0 rgba(0, 0, 0, 0.25)",
    shineColor: "bg-white/40",
  },
};

interface SizeConfig {
  paddingBottom: string; // space reserved for 3D depth lip
  depthTop: string; // depth extrusion offset
  translateActive: string; // downward displacement on press
  facePadding: string;
  textSize: string;
  borderWidth: string;
  borderRadius: string;
  shineSize: string;
}

const SIZES: Record<GameButtonSize, SizeConfig> = {
  sm: {
    paddingBottom: "pb-[4px]",
    depthTop: "top-[4px]",
    translateActive: "group-active:translate-y-[4px]",
    facePadding: "px-4 py-1.5 min-h-[36px]",
    textSize: "text-sm",
    borderWidth: "border-[2.5px]",
    borderRadius: "rounded-xl",
    shineSize: "w-4 h-1.5 top-1 left-1.5",
  },
  md: {
    paddingBottom: "pb-[6px]",
    depthTop: "top-[6px]",
    translateActive: "group-active:translate-y-[6px]",
    facePadding: "px-7 py-2.5 min-h-[48px]",
    textSize: "text-lg",
    borderWidth: "border-[3.5px]",
    borderRadius: "rounded-2xl",
    shineSize: "w-6 h-2.5 top-1.5 left-2",
  },
  lg: {
    paddingBottom: "pb-[8px]",
    depthTop: "top-[8px]",
    translateActive: "group-active:translate-y-[8px]",
    facePadding: "px-9 py-3.5 min-h-[58px]",
    textSize: "text-xl",
    borderWidth: "border-[4px]",
    borderRadius: "rounded-2xl",
    shineSize: "w-8 h-3 top-2 left-2.5",
  },
  xl: {
    paddingBottom: "pb-[10px]",
    depthTop: "top-[10px]",
    translateActive: "group-active:translate-y-[10px]",
    facePadding: "px-11 py-4.5 min-h-[68px]",
    textSize: "text-2xl",
    borderWidth: "border-[4.5px]",
    borderRadius: "rounded-3xl",
    shineSize: "w-10 h-3.5 top-2.5 left-3",
  },
  icon: {
    paddingBottom: "pb-[6px]",
    depthTop: "top-[6px]",
    translateActive: "group-active:translate-y-[6px]",
    facePadding: "p-2.5 min-w-[48px] min-h-[48px]",
    textSize: "text-lg",
    borderWidth: "border-[3.5px]",
    borderRadius: "rounded-2xl",
    shineSize: "w-4 h-2 top-1.5 left-1.5",
  },
};

export const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      leftIcon,
      rightIcon,
      isLoading = false,
      fullWidth = false,
      disabled = false,
      children,
      className = "",
      type = "button",
      ...props
    },
    ref,
  ) => {
    const v = VARIANTS[variant];
    const s = SIZES[size];
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={[
          "group relative inline-flex items-center justify-center p-0 select-none outline-none",
          "bg-transparent cursor-pointer transition-filter",
          s.paddingBottom,
          fullWidth ? "w-full" : "w-auto",
          isDisabled
            ? "cursor-not-allowed opacity-60 grayscale-[30%]"
            : "hover:brightness-105 active:brightness-95",
          className,
        ].join(" ")}
        {...props}
      >
        {/* 1. Bottom 3D Depth Layer */}
        <span
          aria-hidden="true"
          className={[
            "absolute inset-x-0 bottom-0 pointer-events-none transition-all",
            s.depthTop,
            s.borderRadius,
            s.borderWidth,
            v.depthBg,
            v.depthBorder,
            "shadow-[0_4px_10px_rgba(0,0,0,0.22)]",
          ].join(" ")}
        />

        {/* 2. Top Interactive Button Face */}
        <span
          className={[
            "relative flex w-full items-center justify-center",
            "transition-transform duration-75 ease-out",
            s.borderRadius,
            s.borderWidth,
            s.facePadding,
            v.faceBg,
            v.faceBorder,
            !isDisabled ? s.translateActive : "",
          ].join(" ")}
          style={{ boxShadow: v.faceInnerShadow }}
        >
          {/* 3. Top-left curved gloss bubble highlight */}
          <span
            aria-hidden="true"
            className={[
              "pointer-events-none absolute -rotate-12 rounded-full blur-[0.2px]",
              s.shineSize,
              v.shineColor,
            ].join(" ")}
          />

          {/* 4. Text and Icons */}
          <span
            className={[
              "relative z-10 flex items-center justify-center gap-2",
              "font-black tracking-wide", // Uses Tailwind font-black (weight: 900)
              s.textSize,
              v.textColor,
            ].join(" ")}
            style={{
              WebkitTextStroke: v.textStroke,
              paintOrder: "stroke fill",
              textShadow: v.textShadow,
            }}
          >
            {isLoading ? (
              <svg
                className="animate-spin h-5 w-5 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <>
                {leftIcon && (
                  <span className="inline-flex shrink-0">{leftIcon}</span>
                )}
                <span>{children}</span>
                {rightIcon && (
                  <span className="inline-flex shrink-0">{rightIcon}</span>
                )}
              </>
            )}
          </span>
        </span>
      </button>
    );
  },
);

GameButton.displayName = "GameButton";
