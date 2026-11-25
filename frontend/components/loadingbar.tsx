"use client";
import React, { useEffect, useRef, useCallback } from "react";

const TRACK_THEMES = {
  "yellow-orange": {
    background:
      "linear-gradient(180deg, #FFEBB0 0%, #FFD970 55%, #FFCC47 100%)",
    innerShadow:
      "inset 0 3px 6px rgba(168, 92, 0, 0.28), inset 0 -2px 5px rgba(255, 250, 220, 0.55)",
  },
  "deep-amber": {
    background:
      "linear-gradient(180deg, #3D1704 0%, #5C2208 55%, #7C2D12 100%)",
    innerShadow:
      "inset 0 4px 8px rgba(0, 0, 0, 0.55), inset 0 -2px 5px rgba(255, 160, 80, 0.22)",
  },
  "classic-cyan": {
    background:
      "linear-gradient(180deg, #0CECF0 0%, #0CE8EE 60%, #07D5DF 100%)",
    innerShadow:
      "inset 0 3px 6px rgba(0, 85, 100, 0.25), inset 0 -2px 5px rgba(255, 255, 255, 0.35)",
  },
} as const;

const SIZE_CONFIG = {
  sm: { padding: 8, height: 30, tileSize: 48, glossInset: 10 },
  md: { padding: 12, height: 44, tileSize: 64, glossInset: 14 },
  lg: { padding: 15, height: 58, tileSize: 80, glossInset: 18 },
} as const;

const SPEED_CONFIG = {
  slow: "2.4s",
  normal: "1.25s",
  fast: "0.6s",
} as const;

const SMOOTHNESS_DAMPING = {
  silky: 5.5,
  balanced: 10.5,
  snappy: 18.0,
  instant: null,
} as const;

export interface FunkyProgressBarProps {
  value?: number;
  trackVariant?: keyof typeof TRACK_THEMES;
  size?: keyof typeof SIZE_CONFIG;
  animated?: boolean;
  speed?: keyof typeof SPEED_CONFIG;
  smoothness?: keyof typeof SMOOTHNESS_DAMPING;
  className?: string;
  ariaLabel?: string;
}

export function FunkyProgressBar({
  value = 58,
  trackVariant = "yellow-orange",
  size = "md",
  animated = true,
  speed = "normal",
  smoothness = "silky",
  className = "",
  ariaLabel = "Loading progress",
}: FunkyProgressBarProps) {
  const clampedTarget = Math.min(100, Math.max(0, Number(value) || 0));
  const theme = TRACK_THEMES[trackVariant] || TRACK_THEMES["yellow-orange"];
  const dims = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const duration = SPEED_CONFIG[speed] || SPEED_CONFIG.normal;
  const damping =
    smoothness in SMOOTHNESS_DAMPING ? SMOOTHNESS_DAMPING[smoothness] : 5.5;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const leadingEdgeRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef(clampedTarget);
  const targetRef = useRef(clampedTarget);
  const dampingRef = useRef<number | null>(damping);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastAriaRef = useRef(Math.round(clampedTarget));

  useEffect(() => {
    dampingRef.current = damping;
  }, [damping]);

  const applyVisualProgress = useCallback((val: number) => {
    const fillEl = fillRef.current;
    const leadingEdgeEl = leadingEdgeRef.current;
    const rootEl = rootRef.current;

    let edgeOpacity = 0;
    if (val > 0.15 && val < 98.5) {
      edgeOpacity = Math.min(1, (val - 0.15) / 1.0);
    } else if (val >= 98.5 && val < 100) {
      edgeOpacity = Math.max(0, (100 - val) / 1.5);
    }

    if (fillEl) {
      fillEl.style.width = `${val.toFixed(3)}%`;
      fillEl.style.opacity = val <= 0.15 ? "0" : "1";
      fillEl.style.boxShadow =
        edgeOpacity > 0.001
          ? `3px 0 8px rgba(120, 40, 0, ${(0.35 * edgeOpacity).toFixed(3)})`
          : "none";
    }

    if (leadingEdgeEl) {
      leadingEdgeEl.style.opacity = edgeOpacity.toFixed(3);
    }

    const rounded = Math.round(val);
    if (rootEl && rounded !== lastAriaRef.current) {
      rootEl.setAttribute("aria-valuenow", String(rounded));
      lastAriaRef.current = rounded;
    }
  }, []);

  useEffect(() => {
    applyVisualProgress(currentRef.current);
  }, [applyVisualProgress]);

  useEffect(() => {
    targetRef.current = clampedTarget;

    if (dampingRef.current === null) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      currentRef.current = clampedTarget;
      applyVisualProgress(clampedTarget);
      return;
    }

    if (rafIdRef.current !== null) return;
    lastTimeRef.current = performance.now();

    const step = (now: number) => {
      const rawDt = (now - (lastTimeRef.current ?? now)) / 1000;
      lastTimeRef.current = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const target = targetRef.current;
      const current = currentRef.current;
      const diff = target - current;

      if (Math.abs(diff) < 0.025) {
        currentRef.current = target;
        applyVisualProgress(target);
        rafIdRef.current = null;
        return;
      }

      const factor = 1 - Math.exp(-(dampingRef.current || 10) * dt);
      const next = current + diff * factor;
      currentRef.current = next;
      applyVisualProgress(next);

      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);
  }, [clampedTarget, smoothness, applyVisualProgress]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const keyframeName = `funkyStripeGlide_${dims.tileSize}`;

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ width: "100%", userSelect: "none" }}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(clampedTarget)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <style>{`
        @keyframes ${keyframeName} {
          0% {
            transform: translate3d(0px, 0px, 0px);
          }
          100% {
            transform: translate3d(${dims.tileSize}px, 0px, 0px);
          }
        }
      `}</style>

      {/* Outer Thick Glossy White Pill Frame */}
      <div
        style={{
          padding: `${dims.padding}px`,
          borderRadius: "9999px",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F7F7F7 100%)",
          boxShadow:
            "0 8px 20px rgba(0, 0, 0, 0.08), 0 2px 5px rgba(0, 0, 0, 0.05), inset 0 2px 3px rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Inner Recessed Pill Track — true pill-mask clipping */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: `${dims.height}px`,
            borderRadius: "9999px",
            overflow: "hidden",
            isolation: "isolate",
            clipPath: "inset(0 round 9999px)",
            WebkitClipPath: "inset(0 round 9999px)",
            background: theme.background,
            boxShadow: theme.innerShadow,
            transform: "translateZ(0)",
          }}
        >
          {/* Filled 3D Gel Bar Container — always flat-edged; clipped naturally by the pill track */}
          <div
            ref={fillRef}
            style={{
              position: "relative",
              height: "100%",
              width: `${clampedTarget}%`,
              opacity: clampedTarget <= 0.15 ? 0 : 1,
              borderRadius: "0px",
              overflow: "hidden",
              willChange: "width",
              transform: "translateZ(0)",
            }}
          >
            {/* Oversized GPU-Accelerated Seamless Candy Stripe Layer */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `-${dims.tileSize}px`,
                right: 0,
                backgroundImage:
                  "linear-gradient(135deg, #FFC845 0%, #FFC845 24.6%, #F96B00 25.4%, #F96B00 49.6%, #FFC845 50.4%, #FFC845 74.6%, #F96B00 75.4%, #F96B00 100%)",
                backgroundSize: `${dims.tileSize}px ${dims.tileSize}px`,
                backgroundRepeat: "repeat",
                willChange: "transform",
                animationName: keyframeName,
                animationDuration: duration,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationPlayState: animated ? "running" : "paused",
              }}
            />

            {/* Inner 3D Gel Depth & Top/Bottom Bevel Lighting */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                boxShadow:
                  "inset 0 3px 4px rgba(255, 246, 200, 0.85), inset 0 -5px 7px rgba(175, 50, 0, 0.48)",
                zIndex: 4,
              }}
            />

            {/* Crisp Vertical Leading-Edge Highlight (fades smoothly 98.5% -> 100%) */}
            <div
              ref={leadingEdgeRef}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: 0,
                width: "3px",
                pointerEvents: "none",
                background:
                  "linear-gradient(90deg, rgba(255, 235, 160, 0) 0%, rgba(255, 238, 175, 0.82) 100%)",
                zIndex: 5,
              }}
            />
          </div>

          {/* Recessed Rim & End-Cap Depth Overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "9999px",
              pointerEvents: "none",
              boxShadow:
                "inset 0 2px 4px rgba(0, 0, 0, 0.16), inset 0 -1px 3px rgba(255, 255, 255, 0.22), inset 4px 0 6px rgba(140, 45, 0, 0.16), inset -4px 0 6px rgba(140, 45, 0, 0.16)",
              zIndex: 8,
            }}
          />

          {/* Continuous Glossy Cylindrical Highlight */}
          <div
            style={{
              position: "absolute",
              top: "21%",
              left: `${dims.glossInset}px`,
              right: `${dims.glossInset}px`,
              height: "22%",
              borderRadius: "9999px",
              background:
                "linear-gradient(180deg, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0.34) 100%)",
              filter: "blur(1.2px)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default FunkyProgressBar;
