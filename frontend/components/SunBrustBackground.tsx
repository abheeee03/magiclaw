import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SunburstBackgroundProps {
  isOpen?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  duration?: number;
  rayCount?: number;
  rayColorA?: string;
  rayColorB?: string;
  reverse?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function SunburstBackground({
  isOpen = true,
  onClose,
  children,
  duration = 25,
  rayCount = 26,
  rayColorA = "#FFE824",
  rayColorB = "#F7B200",
  reverse = false,
  className = "",
  style = {},
}: SunburstBackgroundProps) {
  const step = 360 / rayCount;
  const halfStep = step / 2;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={className}
          // Radial burst open & collapse close
          initial={{
            clipPath: "circle(0% at 50% 50%)",
            opacity: 0,
          }}
          animate={{
            clipPath: "circle(150% at 50% 50%)",
            opacity: 1,
            transition: {
              clipPath: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.2 },
            },
          }}
          exit={{
            clipPath: "circle(0% at 50% 50%)",
            opacity: 0,
            transition: {
              clipPath: { duration: 0.35, ease: [0.55, 0, 1, 0.45] },
              opacity: { duration: 0.25, delay: 0.1 },
            },
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            overflow: "hidden",
            backgroundColor: rayColorB,
            ...style,
          }}
        >
          {/* Layer 1: Spinning Sunburst Rays (with entrance scale pop) */}
          <motion.div
            initial={{ scale: 0.6 }}
            animate={{
              scale: 1,
              transition: { duration: 0.6, ease: "easeOut" },
            }}
            exit={{
              scale: 0.6,
              transition: { duration: 0.35, ease: "easeIn" },
            }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <motion.div
              animate={{ rotate: reverse ? -360 : 360 }}
              transition={{
                repeat: Infinity,
                duration,
                ease: "linear",
              }}
              style={{
                width: "250vmax",
                height: "250vmax",
                flexShrink: 0,
                background: `repeating-conic-gradient(
                  ${rayColorA} 0deg ${halfStep}deg,
                  ${rayColorB} ${halfStep}deg ${step}deg
                )`,
                willChange: "transform",
              }}
            />
          </motion.div>

          {/* Layer 2: Bright Center Glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at center, rgba(255, 252, 168, 0.95) 0%, rgba(255, 232, 36, 0.35) 22%, rgba(255, 232, 36, 0) 55%)",
            }}
          />

          {/* Layer 3: Warm Outer Vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at center, rgba(255, 200, 0, 0) 45%, rgba(185, 110, 0, 0.45) 100%)",
            }}
          />

          {/* Layer 4: Crate-Opening Light Flash */}
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "#FFFDF0",
              zIndex: 2,
            }}
          />

          {/* Layer 5: Close Button */}
          {onClose && (
            <motion.button
              type="button"
              aria-label="Close"
              onClick={onClose}
              initial={{ opacity: 0, scale: 0, rotate: -90 }}
              animate={{
                opacity: 1,
                scale: 1,
                rotate: 0,
                transition: {
                  delay: 0.25,
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                },
              }}
              exit={{
                opacity: 0,
                scale: 0,
                rotate: 90,
                transition: { duration: 0.2 },
              }}
              whileHover={{ scale: 1.12, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              style={{
                position: "absolute",
                top: "24px",
                right: "24px",
                zIndex: 10,
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                border: "3px solid #B86B00",
                backgroundColor: "#FFFDF0",
                color: "#B86B00",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(140, 75, 0, 0.28)",
                padding: 0,
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </motion.button>
          )}

          {/* Layer 6: Foreground Content */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              transition: {
                delay: 0.12,
                type: "spring",
                stiffness: 240,
                damping: 16,
              },
            }}
            exit={{
              scale: 0.6,
              opacity: 0,
              transition: { duration: 0.2, ease: "easeIn" },
            }}
            style={{
              position: "relative",
              zIndex: 5,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
