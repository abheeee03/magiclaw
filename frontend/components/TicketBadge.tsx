import React, { useState } from "react";

export interface TicketBadgeProps {
  /** The ticket count or currency balance to display (e.g. 5000 or "5,000") */
  value?: number | string;
  /** Custom ticket/coin image URL (replaces or sits inside the medallion) */
  ticketImage?: string;
  /** Custom ReactNode if you want to pass an inline SVG or custom component */
  ticketNode?: React.ReactNode;
  /** If true, renders the custom ticketImage/ticketNode standalone instead of inside the 3D coin */
  standaloneIcon?: boolean;
  /** Callback fired when the green plus button is clicked */
  onPlusClick?: () => void;
  /** Automatically format raw numbers with commas (e.g. 5000 -> 5,000) */
  formatNumber?: boolean;
  /** Custom text/letter inside the default gold coin (defaults to "M") */
  coinLetter?: string;
  /** Additional wrapper classes */
  className?: string;
}

/**
 * 3D Game-style Currency & Ticket Badge
 */
export const TicketBadge: React.FC<TicketBadgeProps> = ({
  value = 5000,
  ticketImage = "/tickets/ticket-2.png",
  ticketNode,
  standaloneIcon = false,
  onPlusClick,
  formatNumber = false,
  coinLetter = "M",
  className = "",
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const displayValue =
    typeof value === "number" && formatNumber
      ? value.toLocaleString()
      : value.toString();

  return (
    <button
      type="button"
      onClick={onPlusClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      aria-label="Manage tickets"
      className={`relative inline-flex items-center select-none font-sans cursor-pointer focus:outline-none group ${className}`}
      style={{ filter: "drop-shadow(0 6px 8px rgba(35, 18, 5, 0.35))" }}
    >
      <style>{`
        .game-badge-font {
          font-family: var(--font-nunito), 'Nunito', system-ui, sans-serif;
        }
      `}</style>

      {/* ---------------------------------------------------- */}
      {/* 1. LEFT TICKET ICON (FREELY PLACED, NO OUTER SHAPE)  */}
      {/* ---------------------------------------------------- */}
      <div className="relative -mr-6 sm:-mr-7 z-20 flex-shrink-0">
        <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] flex items-center justify-center filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)] transition-transform duration-150 group-hover:scale-105">
          {ticketImage ? (
            <img
              src={ticketImage}
              alt="Ticket"
              className="w-full h-full object-contain"
            />
          ) : (
            ticketNode
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. CENTER CREAM COUNTER PILL CONTAINER               */}
      {/* ---------------------------------------------------- */}
      <div
        className="relative flex items-center justify-center min-w-[110px] sm:min-w-[126px] h-[44px] pl-7 pr-5 sm:pl-8 sm:pr-6 z-10"
        style={{
          background:
            "linear-gradient(180deg, #FFFFFF 0%, #FDF8EE 30%, #F5ECDB 70%, #E7DAC1 100%)",
          border: "3px solid #3E200C",
          borderRadius: "14px",
          boxShadow: `
            inset 0 2px 0 rgba(255, 255, 255, 0.9),
            inset 0 -2px 0 rgba(195, 175, 140, 0.4),
            0 4px 0 #3E200C
          `,
        }}
      >
        {/* Counter Number */}
        <span
          className="game-badge-font text-[24px] sm:text-[26px] tracking-wide transform -translate-y-[0.5px]"
          style={{
            color: "#52361F",
            textShadow: "0 1px 0 rgba(255, 255, 255, 0.5)",
            fontWeight: 900,
          }}
        >
          {displayValue}
        </span>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. RIGHT GREEN 3D PLUS BUTTON                        */}
      {/* ---------------------------------------------------- */}
      <div
        aria-hidden="true"
        className="relative -ml-3 sm:-ml-4 z-20 flex-shrink-0 transition-transform duration-100 group-active:scale-95"
      >
        <div className="w-[50px] h-[54px] relative">
          <svg
            viewBox="0 0 50 54"
            className="w-full h-full overflow-visible"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Green Extrusion Depth Gradient */}
              <linearGradient id="greenLipGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2E7A13" />
                <stop offset="100%" stopColor="#1E570A" />
              </linearGradient>

              {/* Green Front Face Gradient */}
              <linearGradient id="greenFaceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7DE82E" />
                <stop offset="60%" stopColor="#5ABE19" />
                <stop offset="100%" stopColor="#43A30D" />
              </linearGradient>

              {/* Pressed Face Gradient */}
              <linearGradient id="greenFacePressed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#62C720" />
                <stop offset="100%" stopColor="#3C910B" />
              </linearGradient>
            </defs>

            {/* 3D Bottom Lip / Extrusion */}
            <polygon
              points="14,44 4,24 4,29 14,50 36,50 46,29 46,24 36,44"
              fill="url(#greenLipGrad)"
              stroke="#213E0E"
              strokeWidth="3"
              strokeLinejoin="round"
            />

            {/* Main Interactive Button Face (shifts down when pressed) */}
            <g
              style={{
                transform: isPressed ? "translateY(3px)" : "translateY(0px)",
                transition: "transform 0.08s ease-out",
              }}
            >
              {/* Button Face */}
              <polygon
                points="14,4 36,4 46,24 36,44 14,44 4,24"
                fill={
                  isPressed ? "url(#greenFacePressed)" : "url(#greenFaceGrad)"
                }
                stroke="#213E0E"
                strokeWidth="3"
                strokeLinejoin="round"
                className="group-hover:brightness-105 transition-all"
              />

              {/* Top Bevel Highlight */}
              <path
                d="M 6 23 L 14 7 L 36 7 L 44 23"
                fill="none"
                stroke="#A8FB5A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />

              {/* Plus Sign (+) */}
              <g>
                {/* Subtle highlight behind plus */}
                <path
                  d="M 25 15 L 25 33 M 16 24 L 34 24"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  transform="translate(0, 1)"
                />
                {/* Dark Green Plus */}
                <path
                  d="M 25 15 L 25 33 M 16 24 L 34 24"
                  stroke="#174409"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </button>
  );
};

export default TicketBadge;
