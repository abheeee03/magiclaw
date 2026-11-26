"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { CartoonDialog } from "../Dialog";
import { GameButton } from "../Button";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicEnabled: boolean;
  sfxEnabled: boolean;
  showProjection: boolean;
  onMusicVolumeChange: (vol: number) => void;
  onSfxVolumeChange: (vol: number) => void;
  onToggleMusicEnabled: () => void;
  onToggleSfxEnabled: () => void;
  onToggleProjection: () => void;
  onResetDefaults: () => void;
}

const SpeakerIcon: React.FC<{ muted?: boolean }> = ({ muted }) => (
  <svg
    viewBox="0 0 48 48"
    className={`w-9 h-9 transition-opacity ${muted ? "opacity-45" : "opacity-100"}`}
    fill="none"
    aria-hidden="true"
  >
    {/* Speaker body */}
    <path
      d="M7 18.5C7 16.8431 8.34315 15.5 10 15.5H15.2L24.5 8.8C26.15 7.6 28.5 8.78 28.5 10.82V37.18C28.5 39.22 26.15 40.4 24.5 39.2L15.2 32.5H10C8.34315 32.5 7 31.1569 7 29.5V18.5Z"
      fill="#EB7349"
    />
    {/* Sound rays */}
    {!muted ? (
      <>
        <path
          d="M34 15.5L39.5 12"
          stroke="#EB7349"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M35.5 24H42"
          stroke="#EB7349"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M34 32.5L39.5 36"
          stroke="#EB7349"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
      </>
    ) : (
      <path
        d="M34 19L42 29M42 19L34 29"
        stroke="#C94B28"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    )}
  </svg>
);

const MusicNoteIcon: React.FC<{ muted?: boolean }> = ({ muted }) => (
  <svg
    viewBox="0 0 48 48"
    className={`w-9 h-9 transition-opacity ${muted ? "opacity-45" : "opacity-100"}`}
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M19 33.5V12.2C19 10.7 20.02 9.39 21.48 9.04L37.48 5.24C39.53 4.75 41.5 6.31 41.5 8.42V29.5"
      stroke="#EB7349"
      strokeWidth="4.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 17.5L41.5 12.2"
      stroke="#EB7349"
      strokeWidth="4.6"
      strokeLinecap="round"
    />
    <ellipse cx="14" cy="34.5" rx="6.2" ry="5" transform="rotate(-14 14 34.5)" fill="#EB7349" />
    <ellipse cx="36.2" cy="30" rx="6.2" ry="5" transform="rotate(-14 36.2 30)" fill="#EB7349" />
  </svg>
);

interface CartoonSliderProps {
  value: number; // 0..100
  disabled?: boolean;
  label: string;
  onChange: (pct: number) => void;
}

const CartoonSlider: React.FC<CartoonSliderProps> = ({
  value,
  disabled = false,
  label,
  onChange,
}) => {
  const pct = Math.min(100, Math.max(0, value));
  const thumbW = 32;

  return (
    <div className="relative flex-1 h-11 flex items-center select-none">
      {/* Recessed caramel track */}
      <div
        className="relative w-full h-[18px] rounded-full overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #C38650 0%, #DDA770 100%)",
          boxShadow:
            "inset 0 3px 5px rgba(96, 48, 14, 0.46), 0 1.5px 0 rgba(255, 255, 255, 0.45)",
        }}
      >
        {/* Golden yellow fill */}
        <div
          className={`h-full rounded-full transition-[opacity] ${
            disabled ? "opacity-45" : "opacity-100"
          }`}
          style={{
            width: `calc(${pct}% + ${(1 - pct / 100) * 14}px)`,
            maxWidth: "100%",
            background: "linear-gradient(180deg, #FFE44D 0%, #FFB300 100%)",
            boxShadow:
              "inset 0 2px 0 rgba(255, 255, 255, 0.7), inset 0 -2px 0 rgba(180, 95, 0, 0.45)",
          }}
        />
      </div>

      {/* Chunky 3D sky-blue thumb */}
      <div
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 w-[32px] h-[40px] rounded-[10px] flex flex-col items-center justify-center gap-[3.5px] transition-[opacity] ${
          disabled ? "opacity-75" : "opacity-100"
        }`}
        style={{
          left: `calc(${pct}% - ${(pct / 100) * thumbW}px)`,
          background:
            "linear-gradient(180deg, #8CD0FB 0%, #56A8E6 55%, #3B86C9 100%)",
          border: "2px solid #2B659B",
          boxShadow:
            "inset 0 2px 0 rgba(255, 255, 255, 0.7), 0 3px 0 #235483, 0 5px 8px rgba(62, 32, 12, 0.28)",
        }}
      >
        <span className="w-3.5 h-[2.5px] rounded-full bg-[#245A8E]/75" />
        <span className="w-3.5 h-[2.5px] rounded-full bg-[#245A8E]/75" />
        <span className="w-3.5 h-[2.5px] rounded-full bg-[#245A8E]/75" />
      </div>

      {/* Native accessible range input overlay */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
    </div>
  );
};

interface CartoonSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

const CartoonSwitch: React.FC<CartoonSwitchProps> = ({
  checked,
  onToggle,
  ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    className="relative w-[92px] h-[42px] rounded-full p-[3px] cursor-pointer shrink-0 transition-transform active:scale-95 focus:outline-none"
    style={{
      background: "linear-gradient(180deg, #C38650 0%, #DDA770 100%)",
      boxShadow:
        "inset 0 3px 5px rgba(96, 48, 14, 0.46), 0 1.5px 0 rgba(255, 255, 255, 0.45)",
    }}
  >
    <span
      className={`flex items-center justify-center w-[48px] h-[34px] rounded-full text-xs font-black tracking-wide text-white transition-transform duration-200 ${
        checked ? "translate-x-[38px]" : "translate-x-0"
      }`}
      style={
        checked
          ? {
              background: "linear-gradient(180deg, #54EB36 0%, #24BD14 100%)",
              border: "2px solid #167A0B",
              boxShadow:
                "inset 0 2px 0 rgba(255,255,255,0.65), 0 2px 0 #146B0A",
              textShadow: "0 1px 0 #146B0A",
            }
          : {
              background: "linear-gradient(180deg, #F38765 0%, #D95432 100%)",
              border: "2px solid #9A3418",
              boxShadow:
                "inset 0 2px 0 rgba(255,255,255,0.5), 0 2px 0 #8E2E14",
              textShadow: "0 1px 0 #8E2E14",
            }
      }
    >
      {checked ? "ON" : "OFF"}
    </span>
  </button>
);

interface CartoonCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

const CartoonCheckbox: React.FC<CartoonCheckboxProps> = ({
  checked,
  onToggle,
  ariaLabel,
}) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    className="relative w-[38px] h-[38px] rounded-[11px] flex items-center justify-center cursor-pointer shrink-0 transition-transform active:scale-90 focus:outline-none"
    style={{
      background: "linear-gradient(180deg, #C38650 0%, #DDA770 100%)",
      boxShadow:
        "inset 0 3px 5px rgba(96, 48, 14, 0.46), 0 1.5px 0 rgba(255, 255, 255, 0.45)",
    }}
  >
    {checked && (
      <svg
        viewBox="0 0 36 36"
        className="w-10 h-10 -mt-1 -mr-1 drop-shadow-[0_2px_0_rgba(18,90,10,0.65)]"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 18.5L14.5 26L30.5 9.5"
          stroke="#156E09"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 18.5L14.5 26L30.5 9.5"
          stroke="#46E62A"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  musicVolume,
  sfxVolume,
  musicEnabled,
  sfxEnabled,
  showProjection,
  onMusicVolumeChange,
  onSfxVolumeChange,
  onToggleMusicEnabled,
  onToggleSfxEnabled,
  onToggleProjection,
  onResetDefaults,
}) => {
  const sfxPct = Math.round(sfxVolume * 100);
  const musicPct = Math.round(musicVolume * 100);

  return (
    <CartoonDialog
      isOpen={isOpen}
      onClose={onClose}
      title="SETTINGS"
      className="max-w-[430px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <GameButton
            variant="primary"
            size="sm"
            onClick={onResetDefaults}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[#1E7DF2]" />}
          >
            Reset
          </GameButton>
          <GameButton variant="success" size="sm" onClick={onClose}>
            Done
          </GameButton>
        </div>
      }
    >
      <div
        className="mt-2 rounded-[22px] border-2 border-[#DFAF79] px-5 py-6 space-y-6"
        style={{
          background: "linear-gradient(180deg, #F9E3C6 0%, #F4D5B0 100%)",
          boxShadow:
            "inset 0 2px 0 rgba(255, 255, 255, 0.7), 0 3px 0 rgba(168, 114, 62, 0.3)",
        }}
      >
        {/* Row 1: In-Game SFX Volume */}
        <div className="grid grid-cols-[42px_1fr] items-center gap-4">
          <button
            type="button"
            onClick={onToggleSfxEnabled}
            title={sfxEnabled ? "Mute In-Game SFX" : "Unmute In-Game SFX"}
            className="flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          >
            <SpeakerIcon muted={!sfxEnabled || sfxPct === 0} />
          </button>
          <CartoonSlider
            value={sfxPct}
            disabled={!sfxEnabled}
            label="In-Game Volume"
            onChange={(pct) => onSfxVolumeChange(pct / 100)}
          />
        </div>

        {/* Row 2: Music Volume */}
        <div className="grid grid-cols-[42px_1fr] items-center gap-4">
          <button
            type="button"
            onClick={onToggleMusicEnabled}
            title={musicEnabled ? "Mute Music" : "Unmute Music"}
            className="flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          >
            <MusicNoteIcon muted={!musicEnabled || musicPct === 0} />
          </button>
          <CartoonSlider
            value={musicPct}
            disabled={!musicEnabled}
            label="Music Volume"
            onChange={(pct) => onMusicVolumeChange(pct / 100)}
          />
        </div>

        {/* Row 3: Drop Laser Pill Toggle */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <span
            className="text-[21px] font-black tracking-tight text-[#EB7349] leading-none"
            style={{ textShadow: "0 1.5px 0 rgba(160, 68, 32, 0.22)" }}
          >
            Drop Laser
          </span>
          <CartoonSwitch
            checked={showProjection}
            onToggle={onToggleProjection}
            ariaLabel="Toggle Drop Laser"
          />
        </div>

        {/* Row 4: Two Aligned Channel Checkboxes */}
        <div className="flex items-center justify-between gap-6 pt-1">
          <div className="flex items-center gap-3.5">
            <span
              className="text-[19px] font-black tracking-tight text-[#EB7349] leading-none"
              style={{ textShadow: "0 1.5px 0 rgba(160, 68, 32, 0.22)" }}
            >
              In-Game
            </span>
            <CartoonCheckbox
              checked={sfxEnabled}
              onToggle={onToggleSfxEnabled}
              ariaLabel="Enable In-Game Sounds"
            />
          </div>

          <div className="flex items-center gap-3.5">
            <span
              className="text-[19px] font-black tracking-tight text-[#EB7349] leading-none"
              style={{ textShadow: "0 1.5px 0 rgba(160, 68, 32, 0.22)" }}
            >
              Music
            </span>
            <CartoonCheckbox
              checked={musicEnabled}
              onToggle={onToggleMusicEnabled}
              ariaLabel="Enable Music"
            />
          </div>
        </div>
      </div>
    </CartoonDialog>
  );
};
