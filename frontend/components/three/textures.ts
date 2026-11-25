import * as THREE from "three";

export function createBrushedMetalTextures() {
  if (typeof document === "undefined") {
    return { map: new THREE.Texture(), roughnessMap: new THREE.Texture(), bumpMap: new THREE.Texture() };
  }
  const size = 512;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = size;
  const cctx = colorCanvas.getContext("2d")!;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d")!;

  cctx.fillStyle = "#c8d0d8";
  cctx.fillRect(0, 0, size, size);
  rctx.fillStyle = "#555555";
  rctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const y = Math.random() * size;
    const w = 40 + Math.random() * 260;
    const x = Math.random() * size;
    const v = 175 + Math.floor(Math.random() * 60);
    cctx.fillStyle = `rgba(${v},${v + 4},${v + 10},0.16)`;
    cctx.fillRect(x, y, w, 1.2);
    const rv = 55 + Math.floor(Math.random() * 65);
    rctx.fillStyle = `rgba(${rv},${rv},${rv},0.25)`;
    rctx.fillRect(x, y, w, 1.2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, roughnessMap, bumpMap: roughnessMap };
}

export function createPlushTextures() {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 120 + Math.floor(Math.random() * 115);
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * 4.5, y + Math.sin(ang) * 4.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function createPerforatedDeckTexture() {
  if (typeof document === "undefined") {
    return { map: new THREE.Texture(), bumpMap: new THREE.Texture() };
  }
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1e2636");
  grad.addColorStop(1, "#141a26");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = "#c8c8c8";
  bctx.fillRect(0, 0, size, size);

  const step = 20;
  for (let y = 10; y < size; y += step) {
    for (let x = 10; x < size; x += step) {
      const ox = ((y / step) % 2) * (step * 0.5);
      ctx.beginPath();
      ctx.arc((x + ox) % size, y, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = "#090d16";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      bctx.beginPath();
      bctx.arc((x + ox) % size, y, 3.3, 0, Math.PI * 2);
      bctx.fillStyle = "#1a1a1a";
      bctx.fill();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  return { map, bumpMap };
}

export function createMarqueeTexture() {
  if (typeof document === "undefined") return new THREE.Texture();
  const w = 1024;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#08061a");
  bg.addColorStop(0.5, "#1f0f38");
  bg.addColorStop(1, "#061324");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, 480);
  glow.addColorStop(0, "rgba(236, 72, 153, 0.4)");
  glow.addColorStop(0.55, "rgba(6, 182, 212, 0.28)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Neon borders
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 6;
  ctx.shadowColor = "#06b6d4";
  ctx.shadowBlur = 18;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  ctx.strokeStyle = "#f472b6";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ec4899";
  ctx.shadowBlur = 12;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  const drawStar = (cx: number, cy: number, r: number, color: string) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : r * 0.35;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawStar(92, 128, 26, "#fde047");
  drawStar(w - 92, 128, 26, "#fde047");
  drawStar(150, 72, 11, "#38bdf8");
  drawStar(w - 150, 184, 11, "#f472b6");

  // Title: CLAWVAULT
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 90px "Orbitron", sans-serif';

  ctx.shadowColor = "#ec4899";
  ctx.shadowBlur = 28;
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#f472b6";
  ctx.strokeText("CLAWVAULT", w / 2, h / 2 - 8);

  const textGrad = ctx.createLinearGradient(0, 62, 0, 175);
  textGrad.addColorStop(0, "#ffffff");
  textGrad.addColorStop(0.35, "#a5f3fc");
  textGrad.addColorStop(0.55, "#38bdf8");
  textGrad.addColorStop(0.75, "#f0abfc");
  textGrad.addColorStop(1, "#fef08a");
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 16;
  ctx.fillStyle = textGrad;
  ctx.fillText("CLAWVAULT", w / 2, h / 2 - 8);

  ctx.shadowBlur = 10;
  ctx.font = '700 20px "Inter", sans-serif';
  ctx.fillStyle = "#fef08a";
  ctx.fillText("⚡ POWERED BY MAGICBLOCK EPHEMERAL ROLLUPS & VRF ⚡", w / 2, h - 52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface CabinetDisplayObj {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  tex: THREE.CanvasTexture;
}

export function createCabinetDisplayCanvas(): CabinetDisplayObj {
  if (typeof document === "undefined") {
    return { canvas: null, ctx: null, tex: new THREE.Texture() as THREE.CanvasTexture };
  }
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx, tex };
}

export function updateCabinetDisplay(
  displayObj: CabinetDisplayObj,
  balanceUsdc: string,
  timer: number,
  statusText: string
) {
  if (!displayObj.canvas || !displayObj.ctx) return;
  const { ctx, tex, canvas } = displayObj;
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(34, 211, 238, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // Balance block
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("USDC BAL", 20, 32);
  ctx.fillStyle = "#fbbf24";
  ctx.shadowColor = "#f59e0b";
  ctx.shadowBlur = 10;
  ctx.font = "900 44px monospace";
  ctx.fillText(balanceUsdc, 18, 92);

  // Timer block
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("TIME", 210, 32);
  ctx.fillStyle = timer <= 5 ? "#f87171" : "#22d3ee";
  ctx.shadowColor = timer <= 5 ? "#ef4444" : "#06b6d4";
  ctx.shadowBlur = 10;
  ctx.font = "900 48px monospace";
  ctx.fillText(Math.ceil(timer).toString().padStart(2, "0"), 208, 92);

  // Status block
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("ER STATE", 335, 32);
  ctx.fillStyle = "#f472b6";
  ctx.shadowColor = "#ec4899";
  ctx.shadowBlur = 8;
  ctx.font = "900 28px monospace";
  ctx.fillText(statusText.slice(0, 10).toUpperCase(), 332, 86);
  ctx.shadowBlur = 0;

  tex.needsUpdate = true;
}

export function createChuteDecalTexture() {
  if (typeof document === "undefined") return new THREE.Texture();
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = '900 24px "Orbitron", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("VAULT CHUTE", 128, 44);
  ctx.fillStyle = "#22d3ee";
  ctx.font = "900 36px sans-serif";
  ctx.fillText("▼  ▼", 128, 92);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
