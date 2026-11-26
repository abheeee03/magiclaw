import React, { useEffect } from "react";

export interface CartoonDialogProps {
  /** Controls visibility of the dialog */
  isOpen: boolean;
  /** Called when the close button, Escape key, or backdrop is triggered */
  onClose: () => void;
  /** Text displayed inside the curved top ribbon */
  title: string;
  /** Optional subtitle right beneath the ribbon */
  subtitle?: string;
  /** Main body content rendered inside DialogContent */
  children: React.ReactNode;
  /** Optional darker-blue bottom tray (matches the dice/action area in the design) */
  footer?: React.ReactNode;
  /** Close when clicking outside the dialog (default: true) */
  closeOnBackdropClick?: boolean;
  /** Extra classes for the dialog container */
  className?: string;
  /** Extra classes for the DialogContent wrapper */
  contentClassName?: string;
}

export interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable inner content wrapper for the sky-blue body section.
 */
export const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className = "",
}) => {
  return (
    <div
      className={`relative z-10 px-4 sm:px-5 pb-5 sm:pb-6 pt-3 overflow-y-auto custom-scroll flex-1 ${className}`}
    >
      {children}
    </div>
  );
};

/**
 * Arched 3D blue ribbon SVG matching the reference header.
 */
const RibbonHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="pointer-events-none relative mx-auto -mt-8 flex w-[86%] items-center justify-center select-none">
    <svg
      viewBox="0 0 380 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full drop-shadow-[0_6px_6px_rgba(8,37,92,0.42)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ribbonMainGrad"
          x1="190"
          y1="8"
          x2="190"
          y2="68"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#3DA4FF" />
          <stop offset="52%" stopColor="#1E7DF2" />
          <stop offset="100%" stopColor="#1462D1" />
        </linearGradient>
        <linearGradient
          id="ribbonTailGrad"
          x1="0"
          y1="20"
          x2="0"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1E73E8" />
          <stop offset="100%" stopColor="#104FB5" />
        </linearGradient>
      </defs>

      {/* Left Ribbon Tail */}
      <path
        d="M10 34 L66 24 L62 68 L18 76 L27 54 Z"
        fill="url(#ribbonTailGrad)"
        stroke="#0D3B8A"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Left Inner Fold Shadow */}
      <path d="M51 64 L66 58 L62 72 Z" fill="#0B2E6E" />

      {/* Right Ribbon Tail */}
      <path
        d="M370 34 L314 24 L318 68 L362 76 L353 54 Z"
        fill="url(#ribbonTailGrad)"
        stroke="#0D3B8A"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Right Inner Fold Shadow */}
      <path d="M329 64 L314 58 L318 72 Z" fill="#0B2E6E" />

      {/* Main Arched Front Ribbon */}
      <path
        d="M44 22 Q190 4 336 22 L326 66 Q190 49 54 66 Z"
        fill="url(#ribbonMainGrad)"
        stroke="#0D3B8A"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* Top Gloss Highlight Curve */}
      <path
        d="M50 26 Q190 9 330 26"
        stroke="#86D2FF"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Bottom Inner Bevel */}
      <path
        d="M58 61 Q190 45 322 61"
        stroke="#0F48A6"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>

    <h2 className="cartoon-ribbon-title absolute inset-x-8 top-[16%] truncate text-center text-2xl font-bold sm:text-[28px]">
      {title}
    </h2>
  </div>
);

export const CartoonDialog: React.FC<CartoonDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeOnBackdropClick = true,
  className = "",
  contentClassName = "",
}) => {
  // Close on Escape key & lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="cartoon-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#060d21]/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (closeOnBackdropClick) onClose();
      }}
    >
      {/* Dialog Card */}
      <div
        className={`cartoon-dialog-font cartoon-dialog-shell relative w-full max-w-[440px] max-h-[88dvh] flex flex-col rounded-[28px] border-[3px] border-[#3E200C]/35 text-slate-900 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Curved Ribbon Header */}
        <RibbonHeader title={title} />

        {/* Glossy Red Cartoon Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="cartoon-close-btn absolute -right-3 -top-3 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="relative z-10 h-6 w-6 text-white drop-shadow-[0_2px_0_rgba(120,8,15,0.85)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Optional Subtitle */}
        {subtitle && (
          <p className="mt-1 px-6 text-center text-sm sm:text-base font-bold text-[#3E200C]/80 shrink-0">
            {subtitle}
          </p>
        )}

        {/* Main Content Slot */}
        <DialogContent className={contentClassName}>{children}</DialogContent>

        {/* Optional Royal-Blue Bottom Tray */}
        {footer && (
          <div className="cartoon-dialog-footer rounded-b-[25px] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default CartoonDialog;
