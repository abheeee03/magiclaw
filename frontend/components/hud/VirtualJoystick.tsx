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

  const updateVector = useCallback(
    (clientX: number, clientY: number) => {
      if (!baseRef.current) return;
      const rect = baseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxR = rect.width * 0.34;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const d = Math.hypot(dx, dy);
      if (d > maxR) {
        dx = (dx / d) * maxR;
        dy = (dy / d) * maxR;
      }

      setKnobPos({ x: dx, y: dy });
      onMove({ x: dx / maxR, y: dy / maxR });
    },
    [onMove]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    updateVector(e.clientX, e.clientY);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    updateVector(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (disabled) {
      onMove({ x: 0, y: 0 });
    }
  }, [disabled, onMove]);

  const activeKnobPos = disabled ? { x: 0, y: 0 } : knobPos;

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="Virtual Gold Joystick"
      className={`joy-base cursor-grab active:cursor-grabbing ${
        disabled ? "opacity-45 pointer-events-none" : ""
      }`}
    >
      <span className="joy-arrow top-1.5 left-1/2 -translate-x-1/2">▲</span>
      <span className="joy-arrow bottom-1.5 left-1/2 -translate-x-1/2">▼</span>
      <span className="joy-arrow left-2 top-1/2 -translate-y-1/2">◀</span>
      <span className="joy-arrow right-2 top-1/2 -translate-y-1/2">▶</span>
      <div
        className="joy-knob"
        style={{ transform: `translate(${activeKnobPos.x}px, ${activeKnobPos.y}px)` }}
      >
        ★
      </div>
    </div>
  );
};
