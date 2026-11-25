"use client";
import React from "react";

const THEMES = {
  yellow: {
    shellBg:
      "linear-gradient(180deg, #FFE45E 0%, #FFCB2B 52%, #F3A211 82%, #CF7B06 100%)",
    shellShadow: [
      "inset 0 6px 8px rgba(255, 250, 195, 0.85)", // top glossy highlight
      "inset 0 -16px 16px -4px rgba(184, 92, 0, 0.75)", // deep pillowy bottom bevel
      "inset 10px 0 12px -6px rgba(214, 128, 6, 0.45)", // left curved edge
      "inset -10px 0 12px -6px rgba(214, 128, 6, 0.45)", // right curved edge
      "0 5px 10px rgba(45, 12, 2, 0.65)", // tray drop shadow
    ].join(", "),
    topSheen:
      "linear-gradient(180deg, rgba(255, 252, 215, 0.55) 0%, rgba(255, 230, 100, 0) 100%)",
    labelColor: "#FFF6B8",
    labelStroke: "#5C3A0E",
    labelShadow: "0 3px 2px rgba(150, 82, 0, 0.35)",
    numberColor: "#FFD74A",
    numberStroke: "#6B4310",
  },
  white: {
    shellBg:
      "linear-gradient(180deg, #FFFFFF 0%, #F9F7F3 54%, #E6DDD5 84%, #C7B9AE 100%)",
    shellShadow: [
      "inset 0 6px 8px rgba(255, 255, 255, 0.95)", // crisp white top highlight
      "inset 0 -16px 16px -4px rgba(168, 150, 138, 0.8)", // warm taupe bottom bevel
      "inset 10px 0 12px -6px rgba(180, 165, 155, 0.4)", // left curved edge
      "inset -10px 0 12px -6px rgba(180, 165, 155, 0.4)", // right curved edge
      "0 5px 10px rgba(45, 12, 2, 0.65)", // tray drop shadow
    ].join(", "),
    topSheen:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 100%)",
    labelColor: "#B4C6FF",
    labelStroke: "#484C63",
    labelShadow: "0 3px 2px rgba(90, 95, 125, 0.28)",
    numberColor: "#F2F0F5",
    numberStroke: "#595763",
  },
};

interface FunkyKeyButtonProps {
  label?: string;
  number?: string | number;
  variant?: keyof typeof THEMES;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function FunkyKeyButton({
  label = "TUV",
  number = "8",
  variant = "yellow",
  onClick,
  className = "",
}: FunkyKeyButtonProps) {
  const theme = THEMES[variant] || THEMES.yellow;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: theme.shellBg,
        boxShadow: theme.shellShadow,
        fontFamily: "'Lilita One', 'Fredoka', cursive, sans-serif",
      }}
      className={`
        group relative select-none cursor-pointer
        w-[215px] h-[118px] rounded-[28px]
        transition-all duration-100 ease-out
        hover:brightness-[1.03]
        active:translate-y-[3px] active:scale-[0.98] active:brightness-95
        focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70
        ${className}
      `}
    >
      {/* Subtle curved top specular highlight */}
      <span
        aria-hidden="true"
        style={{ background: theme.topSheen }}
        className="pointer-events-none absolute inset-x-3 top-1.5 h-8 rounded-t-[22px] rounded-b-[14px]"
      />

      {/* Top-right number badge (e.g. 8, 9) */}
      {number !== undefined && number !== null && (
        <span
          style={{
            color: theme.numberColor,
            WebkitTextStroke: `3.5px ${theme.numberStroke}`,
            paintOrder: "stroke fill",
          }}
          className="absolute top-2.5 right-5 text-[22px] leading-none tracking-wide"
        >
          {number}
        </span>
      )}

      {/* Main chunky outlined label (e.g. TUV, WXYZ) */}
      <span
        style={{
          color: theme.labelColor,
          WebkitTextStroke: `6px ${theme.labelStroke}`,
          paintOrder: "stroke fill",
          filter: `drop-shadow(${theme.labelShadow})`,
        }}
        className="absolute left-6 bottom-6 text-[36px] leading-none tracking-[0.04em] uppercase"
      >
        {label}
      </span>
    </button>
  );
}

export default function Page() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-100 p-4">
      <h1 className="text-2xl font-bold">Buttons without props</h1>
      <div className="flex gap-4">
        <FunkyKeyButton onClick={() => {}} />
        <FunkyKeyButton onClick={() => {}} variant="white" />
      </div>
    </div>
  );
}
