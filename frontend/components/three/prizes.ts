import * as THREE from "three";
import type { PrizeSlot } from "../../lib/types";

export interface FlavorSpec {
  id: string;
  name: string;
  subtitle: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  tier: number;
  points: number;
  icon: string;
  primary: string;
  secondary: string;
  accent: string;
  badge: string;
  artType:
    | "crackers"
    | "cookies"
    | "chips"
    | "wafers"
    | "rolls"
    | "mix"
    | "pretzels"
    | "gold";
  dims: [number, number, number];
  mass: number;
  gripFactor: number;
  foil?: boolean;
}

export const FLAVOR_CATALOG: Record<string, FlavorSpec> = {
  cheez: {
    id: "cheez",
    name: "CHEEZ CRISP",
    subtitle: "Crunchy Cheddar Crackers",
    rarity: "Common",
    tier: 0,
    points: 100,
    icon: "🧀",
    primary: "#dc2626",
    secondary: "#facc15",
    accent: "#fef08a",
    badge: "COMMON",
    artType: "crackers",
    dims: [0.22, 0.14, 0.28],
    mass: 0.95,
    gripFactor: 1.04,
  },
  choco: {
    id: "choco",
    name: "CHOCO BITES",
    subtitle: "Double Chip Cookies",
    rarity: "Common",
    tier: 0,
    points: 120,
    icon: "🍪",
    primary: "#1d4ed8",
    secondary: "#f59e0b",
    accent: "#fef3c7",
    badge: "COMMON",
    artType: "cookies",
    dims: [0.24, 0.15, 0.29],
    mass: 1.0,
    gripFactor: 1.02,
  },
  honey: {
    id: "honey",
    name: "HONEY PUFFS",
    subtitle: "Sweet Wavy Butter Chips",
    rarity: "Common",
    tier: 0,
    points: 120,
    icon: "🍯",
    primary: "#eab308",
    secondary: "#dc2626",
    accent: "#fffbeb",
    badge: "COMMON",
    artType: "chips",
    dims: [0.21, 0.16, 0.27],
    mass: 0.9,
    gripFactor: 1.03,
  },
  berry: {
    id: "berry",
    name: "BERRY WAFER",
    subtitle: "Strawberry Cream Layers",
    rarity: "Rare",
    tier: 1,
    points: 200,
    icon: "🍓",
    primary: "#ec4899",
    secondary: "#fff1f2",
    accent: "#fde047",
    badge: "RARE",
    artType: "wafers",
    dims: [0.22, 0.145, 0.275],
    mass: 0.95,
    gripFactor: 1.0,
  },
  matcha: {
    id: "matcha",
    name: "MATCHA ROLLS",
    subtitle: "Crispy Green Tea Cream",
    rarity: "Rare",
    tier: 1,
    points: 220,
    icon: "🍵",
    primary: "#16a34a",
    secondary: "#fef9c3",
    accent: "#bbf7d0",
    badge: "RARE",
    artType: "rolls",
    dims: [0.23, 0.14, 0.28],
    mass: 1.0,
    gripFactor: 0.98,
  },
  spicy: {
    id: "spicy",
    name: "SPICY CRUNCH",
    subtitle: "Blazin’ Chili Snack Mix",
    rarity: "Rare",
    tier: 1,
    points: 250,
    icon: "🌶️",
    primary: "#ea580c",
    secondary: "#fde047",
    accent: "#7c2d12",
    badge: "RARE",
    artType: "mix",
    dims: [0.22, 0.155, 0.275],
    mass: 1.05,
    gripFactor: 0.96,
  },
  pretzel: {
    id: "pretzel",
    name: "SALT PRETZELS",
    subtitle: "Classic Baked Twists",
    rarity: "Epic",
    tier: 2,
    points: 350,
    icon: "🥨",
    primary: "#0284c7",
    secondary: "#facc15",
    accent: "#e0f2fe",
    badge: "EPIC",
    artType: "pretzels",
    dims: [0.21, 0.16, 0.27],
    mass: 1.08,
    gripFactor: 0.94,
  },
  gold: {
    id: "gold",
    name: "MAGIC GOLD",
    subtitle: "Grail Bonus Box",
    rarity: "Legendary",
    tier: 3,
    points: 1000,
    icon: "👑",
    primary: "#d97706",
    secondary: "#fef08a",
    accent: "#ffffff",
    badge: "GRAIL",
    artType: "gold",
    dims: [0.23, 0.155, 0.285],
    mass: 1.25,
    gripFactor: 0.88,
    foil: true,
  },
};

const TIER_SPEC_KEYS: Record<number, string[]> = {
  0: ["cheez", "choco", "honey"],
  1: ["berry", "matcha", "spicy"],
  2: ["pretzel"],
  3: ["gold"],
};

export function getFlavorSpecForSlot(slot: PrizeSlot): FlavorSpec {
  const keys = TIER_SPEC_KEYS[slot.tier] || TIER_SPEC_KEYS[0];
  const key = keys[slot.slotId % keys.length];
  return FLAVOR_CATALOG[key] || FLAVOR_CATALOG.cheez;
}

export function formatSlotPrizeAmount(slot: PrizeSlot): string {
  if (slot.prizeDecimals === 0 && slot.prizeAmount === BigInt(1)) {
    return "1/1 NFT";
  }
  const num = Number(slot.prizeAmount) / Math.pow(10, slot.prizeDecimals);
  const formatted = num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${formatted} ${slot.symbol || "SPL"}`;
}

function drawSnackIllustration(
  ctx: CanvasRenderingContext2D,
  artType: FlavorSpec["artType"],
  cx: number,
  cy: number,
  scale = 1.0
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (artType === "crackers") {
    [
      [-26, 8, -0.22],
      [18, 12, 0.18],
      [-4, -14, 0.05],
    ].forEach(([x, y, r]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.fillStyle = "#f59e0b";
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 3;
      ctx.fillRect(-26, -24, 52, 48);
      ctx.strokeRect(-26, -24, 52, 48);
      ctx.fillStyle = "#92400e";
      for (let dx = -12; dx <= 12; dx += 12) {
        for (let dy = -10; dy <= 10; dy += 10) {
          ctx.beginPath();
          ctx.arc(dx, dy, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
  } else if (artType === "cookies") {
    [
      [-22, 10],
      [22, 12],
      [0, -14],
    ].forEach(([x, y]) => {
      ctx.fillStyle = "#d97706";
      ctx.strokeStyle = "#92400e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#3b1d0c";
      [
        [-9, -6],
        [7, -9],
        [10, 6],
        [-6, 10],
        [0, 1],
      ].forEach(([cx2, cy2]) => {
        ctx.beginPath();
        ctx.arc(x + cx2, y + cy2, 4.2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  } else if (artType === "chips") {
    [
      [-24, 6, -0.35],
      [22, 8, 0.3],
      [0, -10, 0.08],
    ].forEach(([x, y, r]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.fillStyle = "#fde047";
      ctx.strokeStyle = "#ca8a04";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2.5;
      for (let ry = -9; ry <= 9; ry += 6) {
        ctx.beginPath();
        ctx.moveTo(-20, ry);
        ctx.lineTo(20, ry);
        ctx.stroke();
      }
      ctx.restore();
    });
  } else if (artType === "wafers") {
    [
      [-16, 10, -0.18],
      [16, -6, 0.22],
    ].forEach(([x, y, r]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(-34, -18, 68, 36);
      ctx.fillStyle = "#fb7185";
      ctx.fillRect(-34, -7, 68, 6);
      ctx.fillRect(-34, 4, 68, 6);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-34, -18, 68, 36);
      ctx.restore();
    });
  } else if (artType === "rolls") {
    [-18, 0, 18].forEach((offset, idx) => {
      ctx.save();
      ctx.translate(offset, idx * 6 - 6);
      ctx.rotate(-0.45);
      ctx.fillStyle = "#d9f99d";
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 3;
      ctx.fillRect(-34, -9, 68, 18);
      ctx.strokeRect(-34, -9, 68, 18);
      ctx.fillStyle = "#166534";
      ctx.beginPath();
      ctx.ellipse(34, 0, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  } else if (artType === "mix") {
    const pts: Array<[number, number, string]> = [
      [-28, 10, "#facc15"],
      [24, 12, "#fb923c"],
      [0, -14, "#fef08a"],
      [-12, -4, "#f97316"],
      [14, -8, "#fde047"],
    ];
    pts.forEach(([x, y, col]) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (artType === "pretzels") {
    [
      [-20, 6, -0.15],
      [20, -4, 0.2],
    ].forEach(([x, y, r]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(-10, -4, 13, 0, Math.PI * 2);
      ctx.arc(10, -4, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      [
        [-14, -12],
        [12, -10],
        [0, 6],
        [-8, 4],
        [10, 4],
      ].forEach(([sx, sy]) => {
        ctx.fillRect(sx, sy, 3.5, 3.5);
      });
      ctx.restore();
    });
  } else if (artType === "gold") {
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? 38 : 16;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function createPrizeBoxMaterials(
  slot: PrizeSlot,
  spec: FlavorSpec
): THREE.MeshPhysicalMaterial[] {
  const title = (slot.name || spec.name).toUpperCase().slice(0, 14);
  const rewardLabel = formatSlotPrizeAmount(slot).toUpperCase().slice(0, 18);
  const tierNames = ["COMMON", "RARE", "EPIC", "GRAIL"];
  const badgeText = `#${slot.slotId} ${tierNames[slot.tier] || "PRIZE"}`;

  const frontCanvases: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    isBack: boolean;
  }> = [];

  const drawFrontFace = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    isBack: boolean,
    img?: HTMLImageElement
  ) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, spec.primary);
    g.addColorStop(1, spec.foil ? "#92400e" : spec.primary);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h * 0.58);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-18, -190);
      ctx.lineTo(18, -190);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = spec.secondary;
    ctx.fillRect(14, 22, w - 28, 66);
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 22, w - 28, 66);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 24px "Inter", "Arial Black", sans-serif';
    ctx.fillStyle = "#0f172a";
    ctx.fillText(title, w / 2 + 2, 57);
    ctx.fillStyle = spec.foil
      ? "#78350f"
      : spec.secondary === "#fff1f2" || spec.secondary === "#fef9c3"
      ? spec.primary
      : "#ffffff";
    ctx.fillText(title, w / 2, 55);

    if (!isBack) {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.roundRect(w - 114, 98, 98, 26, 13);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.font = '900 12px "Inter", sans-serif';
      ctx.fillText(badgeText, w - 65, 112);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.ellipse(w / 2, 198, 86, 64, 0, 0, Math.PI * 2);
      ctx.fill();

      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, 198, 52, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, w / 2 - 52, 198 - 52, 104, 104);
        ctx.restore();
      } else {
        drawSnackIllustration(ctx, spec.artType, w / 2, 198, 1.0);
      }

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(14, 274, w - 28, 30);
      ctx.fillStyle = "#fef08a";
      ctx.font = '900 15px "Inter", sans-serif';
      ctx.fillText(rewardLabel, w / 2, 290);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(26, 108, 128, 184);
      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "left";
      ctx.font = "900 14px sans-serif";
      ctx.fillText("ONCHAIN PRIZE", 32, 126);
      ctx.fillRect(32, 134, 114, 4);
      ctx.font = "700 11px monospace";
      const buyback = (Number(slot.fallbackBuybackUsdc) / 1_000_000).toFixed(2);
      [
        `SLOT      #${slot.slotId}`,
        `TIER      ${tierNames[slot.tier] || "COMMON"}`,
        `SYMBOL    ${(slot.symbol || "SPL").slice(0, 6)}`,
        `BUYBACK   ${buyback}`,
        `NETWORK   DEVNET`,
        `VRF       LIVE`,
      ].forEach((line, idx) => {
        ctx.fillText(line, 32, 154 + idx * 21);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(32, 160 + idx * 21, 114, 1);
        ctx.fillStyle = "#0f172a";
      });

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(166, 206, 66, 86);
      ctx.fillStyle = "#0f172a";
      for (let bx = 172; bx < 226; bx += 4) {
        const bw = (bx * 7) % 3 === 0 ? 2.5 : 1.3;
        ctx.fillRect(bx, 214, bw, 58);
      }
      ctx.font = "700 10px monospace";
      ctx.fillText(`#00${String(slot.slotId).padStart(2, "0")}`, 178, 284);

      drawSnackIllustration(ctx, spec.artType, 198, 152, 0.5);
    }
  };

  const makeFrontFace = (isBack = false) => {
    const w = 256;
    const h = 320;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    drawFrontFace(ctx, w, h, isBack);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    frontCanvases.push({ canvas: c, ctx, tex, isBack });
    return tex;
  };

  const makeSideFace = () => {
    const w = 128;
    const h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = spec.primary;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = spec.secondary;
    ctx.fillRect(12, 12, w - 24, 34);
    ctx.fillRect(12, h - 46, w - 24, 34);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 20px "Inter", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const frontTex = makeFrontFace(false);
  const backTex = makeFrontFace(true);
  const sideTex = makeSideFace();

  if (slot.image && typeof Image !== "undefined") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      frontCanvases.forEach((entry) => {
        if (!entry.isBack) {
          drawFrontFace(entry.ctx, entry.canvas.width, entry.canvas.height, false, img);
          entry.tex.needsUpdate = true;
        }
      });
    };
    img.src = slot.image;
  }

  const matProps = spec.foil
    ? {
        metalness: 0.72,
        roughness: 0.22,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      }
    : {
        metalness: 0.04,
        roughness: 0.42,
        clearcoat: 0.24,
        clearcoatRoughness: 0.35,
      };

  const sideMat = new THREE.MeshPhysicalMaterial({ map: sideTex, ...matProps });
  const frontMat = new THREE.MeshPhysicalMaterial({ map: frontTex, ...matProps });
  const backMat = new THREE.MeshPhysicalMaterial({ map: backTex, ...matProps });

  return [sideMat, sideMat, frontMat, backMat, frontMat, sideMat];
}

export interface SnackBoxBody {
  uid: number;
  slotId: number;
  tier: number;
  flavorId: string;
  spec: FlavorSpec;
  name: string;
  symbol: string;
  icon: string;
  mesh: THREE.Object3D;
  disposePack?: () => void;
  ringMesh?: THREE.Mesh;
  anchorX: number;
  anchorZ: number;
  hx: number;
  hy: number;
  hz: number;
  radius: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  angVel: THREE.Vector3;
  mass: number;
  grabbed: boolean;
  won: boolean;
  winEmitted: boolean;
  removeTimer: number;
}
