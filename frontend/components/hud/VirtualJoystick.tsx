"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

interface VirtualJoystickProps {
  onMove: (vector: { x: number; y: number }) => void;
  disabled?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onMove,
  disabled = false,
}) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    setIsDragging(true);
    updateVector(e.clientX, e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const updateVector = useCallback(
    (clientX: number, clientY: number) => {
      if (!baseRef.current) return;
      const rect = baseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;
      const maxDist = rect.width / 2 - 8;

      const dist = Math.hypot(rawDx, rawDy);
      let dx = rawDx;
      let dy = rawDy;

      if (dist > maxDist) {
        dx = (rawDx / dist) * maxDist;
        dy = (rawDy / dist) * maxDist;
      }

      setKnobPos({ x: dx, y: dy });

      // Normalized [-1, 1] vector (y is inverted for 3D Z gantry axis: up = negative Z)
      const normX = dx / maxDist;
      const normY = dy / maxDist;
      onMove({ x: normX, y: normY });
    },
    [onMove]
  );

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    updateVector(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (disabled) {
      setKnobPos({ x: 0, y: 0 });
      onMove({ x: 0, y: 0 });
    }
  }, [disabled, onMove]);

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-slate-700/60 bg-gradient-to-b from-slate-800/90 to-slate-950/95 shadow-inner touch-none select-none flex items-center justify-center cursor-grab active:cursor-grabbing ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
      style={{
        boxShadow:
          "inset 0 4px 12px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.6)",
      }}
    >
      {/* Directional helper arrows */}
      <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-bold pointer-events-none">
        ▲
      </span>
      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-bold pointer-events-none">
        ▼
      </span>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold pointer-events-none">
        ◀
      </span>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold pointer-events-none">
        ▶
      </span>

      {/* Floating thumb knob */}
      <div
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full pointer-events-none transition-transform duration-75 flex items-center justify-center border-2 border-pink-400/50 shadow-lg"
        style={{
          transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          background:
            "radial-gradient(circle at 35% 30%, #f472b6 0%, #db2777 55%, #831843 100%)",
          boxShadow:
            "0 4px 12px rgba(0,0,0,0.6), 0 0 16px rgba(236,72,153,0.45)",
        }}
      >
        <div className="w-4 h-4 rounded-full bg-pink-200/40 border border-white/40" />
      </div>
    </div>
  );
};
