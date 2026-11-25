import * as THREE from "three";

/* =========================================================================
 * 1. ANIMATED RGB DOT-MATRIX MARQUEE ("MAGICLAW" / "YOU WIN!")
 * ========================================================================= */
const PIXEL_FONT_7X9: Record<string, string[]> = {
  M: [
    "1100011",
    "1110111",
    "1111111",
    "1101011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
  ],
  A: [
    "0011100",
    "0111110",
    "1100011",
    "1100011",
    "1111111",
    "1111111",
    "1100011",
    "1100011",
    "1100011",
  ],
  G: [
    "0111110",
    "1111111",
    "1100000",
    "1100000",
    "1101111",
    "1101111",
    "1100011",
    "1111111",
    "0111110",
  ],
  I: [
    "11111",
    "11111",
    "00110",
    "00110",
    "00110",
    "00110",
    "00110",
    "11111",
    "11111",
  ],
  C: [
    "0111110",
    "1111111",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1100000",
    "1111111",
    "0111110",
  ],
  L: [
    "110000",
    "110000",
    "110000",
    "110000",
    "110000",
    "110000",
    "110000",
    "111111",
    "111111",
  ],
  W: [
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1101011",
    "1111111",
    "1110111",
    "1100011",
  ],
  Y: [
    "1100011",
    "1100011",
    "0110110",
    "0011100",
    "0011100",
    "0011100",
    "0011100",
    "0011100",
    "0011100",
  ],
  O: [
    "0111110",
    "1111111",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1111111",
    "0111110",
  ],
  U: [
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1100011",
    "1111111",
    "0111110",
  ],
  N: [
    "1100011",
    "1110011",
    "1111011",
    "1111111",
    "1101111",
    "1100111",
    "1100011",
    "1100011",
    "1100011",
  ],
  "!": [
    "11",
    "11",
    "11",
    "11",
    "11",
    "11",
    "00",
    "11",
    "11",
  ],
  " ": [
    "000",
    "000",
    "000",
    "000",
    "000",
    "000",
    "000",
    "000",
    "000",
  ],
};

export interface MarqueeBootState {
  active: boolean;
  power: number;
  bgSweep: number;
  letterCount: number;
}

export class DottedPixelMarquee {
  public cols = 68;
  public rows = 15;
  public cellSize = 15;
  public padX = 16;
  public padY = 16;

  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;

  private magiclawLetterIdx: Int8Array;
  private maskMagiclaw: Uint8Array;
  private maskYouWin: Uint8Array;
  private seeds: Float32Array;
  private _lastDraw = -1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.cols * this.cellSize + this.padX * 2;
    this.canvas.height = this.rows * this.cellSize + this.padY * 2;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.magiclawLetterIdx = new Int8Array(this.cols * this.rows).fill(-1);
    this.maskMagiclaw = this.buildTextMask("MAGICLAW", this.magiclawLetterIdx);
    this.maskYouWin = this.buildTextMask("YOU WIN!");

    this.seeds = new Float32Array(this.cols * this.rows);
    for (let i = 0; i < this.seeds.length; i++) {
      this.seeds[i] = Math.random() * Math.PI * 2;
    }

    this.update(0, false, { active: true, power: 0, bgSweep: 0, letterCount: 0 });
  }

  private buildTextMask(text: string, letterIndexOut: Int8Array | null = null): Uint8Array {
    const mask = new Uint8Array(this.cols * this.rows);
    const glyphs = text.split("").map((ch) => PIXEL_FONT_7X9[ch] || PIXEL_FONT_7X9[" "]);
    const gap = 1;
    const totalW =
      glyphs.reduce((acc, g) => acc + g[0].length, 0) + gap * (glyphs.length - 1);
    const startX = Math.floor((this.cols - totalW) / 2);
    const startY = Math.floor((this.rows - 9) / 2);

    let cursorX = startX;
    glyphs.forEach((glyph, letterIdx) => {
      const gw = glyph[0].length;
      for (let gy = 0; gy < 9; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          if (glyph[gy][gx] === "1") {
            const mx = cursorX + gx;
            const my = startY + gy;
            if (mx >= 0 && mx < this.cols && my >= 0 && my < this.rows) {
              const idx = my * this.cols + mx;
              mask[idx] = 1;
              if (letterIndexOut) letterIndexOut[idx] = letterIdx;
            }
          }
        }
      }
      cursorX += gw + gap;
    });
    return mask;
  }

  public update(t: number, celebrating: boolean, bootState: MarqueeBootState | null = null) {
    const minStep = bootState && bootState.active ? 0.016 : 0.032;
    if (Math.abs(t - this._lastDraw) < minStep && this._lastDraw >= 0) return;
    this._lastDraw = t;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cs = this.cellSize;

    const isBoot = Boolean(bootState && bootState.active);
    const power = isBoot && bootState ? bootState.power : 1.0;

    if (power <= 0.005) {
      ctx.fillStyle = "#070812";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#111528";
      for (let r = 0; r < this.rows; r++) {
        const cy = this.padY + r * cs + cs * 0.5;
        for (let c = 0; c < this.cols; c++) {
          const cx = this.padX + c * cs + cs * 0.5;
          ctx.beginPath();
          ctx.arc(cx, cy, cs * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.texture.needsUpdate = true;
      return;
    }

    ctx.fillStyle = "#070812";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = Math.min(
      1,
      power * (isBoot && bootState ? Math.min(1, bootState.bgSweep * 1.4) : 1)
    );
    const bgGrad = ctx.createLinearGradient(0, 0, W, 0);
    bgGrad.addColorStop(0.0, "#120d36");
    bgGrad.addColorStop(0.45, "#2b0d3c");
    bgGrad.addColorStop(0.78, "#4a122e");
    bgGrad.addColorStop(1.0, "#5a1919");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const letterRatio = isBoot && bootState ? Math.min(1, bootState.letterCount / 8) : 1.0;
    if (letterRatio > 0.02) {
      const wash = ctx.createRadialGradient(
        W * 0.5,
        H * 0.5,
        10,
        W * 0.5,
        H * 0.5,
        W * 0.48
      );
      const alphaScale = letterRatio * power;
      wash.addColorStop(
        0,
        celebrating
          ? `rgba(255, 220, 90, ${0.34 * alphaScale})`
          : `rgba(255, 165, 65, ${0.24 * alphaScale})`
      );
      wash.addColorStop(0.6, `rgba(236, 72, 153, ${0.14 * alphaScale})`);
      wash.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);
    }

    const activeMask =
      !isBoot && celebrating && Math.floor(t * 2.4) % 2 === 1
        ? this.maskYouWin
        : this.maskMagiclaw;

    const wavePos = ((t * 26) % (this.cols + 26)) - 13;
    const sweepColLimit =
      isBoot && bootState ? bootState.bgSweep * (this.cols + 6) : this.cols + 10;

    for (let r = 0; r < this.rows; r++) {
      const cy = this.padY + r * cs + cs * 0.5;
      for (let c = 0; c < this.cols; c++) {
        const cx = this.padX + c * cs + cs * 0.5;
        const idx = r * this.cols + c;
        const u = c / (this.cols - 1);

        const diagCoord = c + r * 0.4;
        if (isBoot && diagCoord > sweepColLimit) {
          ctx.fillStyle = "#111528";
          ctx.beginPath();
          ctx.arc(cx, cy, cs * 0.22, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        let isLit = activeMask[idx] === 1;
        let letterFlash = 0;
        if (isLit && isBoot && bootState) {
          const lIdx = this.magiclawLetterIdx[idx];
          if (lIdx >= bootState.letterCount) {
            isLit = false;
          } else {
            const age = bootState.letterCount - lIdx;
            if (age < 1.0) letterFlash = 1.0 - age;
          }
        }

        const waveDist = Math.abs(c - r * 0.55 - wavePos);
        const waveBoost = isBoot
          ? letterFlash * 0.8
          : Math.max(0, 1 - waveDist / 6.5);

        const isBorder =
          r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1;
        const chaseOn =
          !isBoot &&
          celebrating &&
          isBorder &&
          (c + r + Math.floor(t * 16)) % 4 < 2;

        if (isLit) {
          const shimmer = 0.85 + 0.15 * Math.sin(t * 7.5 + this.seeds[idx]);
          const boost = Math.min(1, shimmer + waveBoost * 0.45);
          const haloR = cs * (0.64 + waveBoost * 0.24);
          const grd = ctx.createRadialGradient(cx, cy, 0.8, cx, cy, haloR);
          if (celebrating) {
            grd.addColorStop(0.0, "#ffffff");
            grd.addColorStop(0.38, "#fef08a");
            grd.addColorStop(0.72, "rgba(251, 146, 60, 0.72)");
            grd.addColorStop(1.0, "rgba(251, 146, 60, 0)");
          } else {
            grd.addColorStop(0.0, boost > 0.94 ? "#ffffff" : "#fff7cc");
            grd.addColorStop(0.42, "#ffbe44");
            grd.addColorStop(0.76, "rgba(255, 115, 35, 0.65)");
            grd.addColorStop(1.0, "rgba(255, 90, 20, 0)");
          }
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle =
            boost > 0.92 || letterFlash > 0.25 ? "#ffffff" : "#fff3b0";
          ctx.beginPath();
          ctx.arc(cx, cy, cs * (0.31 + letterFlash * 0.06), 0, Math.PI * 2);
          ctx.fill();
        } else if (chaseOn) {
          ctx.fillStyle = "rgba(52, 211, 153, 0.95)";
          ctx.beginPath();
          ctx.arc(cx, cy, cs * 0.32, 0, Math.PI * 2);
          ctx.fill();
        } else {
          let red: number, green: number, blue: number;
          if (u < 0.48) {
            const k = u / 0.48;
            red = Math.round(70 + k * 145);
            green = Math.round(98 - k * 34);
            blue = Math.round(255 - k * 25);
          } else {
            const k = (u - 0.48) / 0.52;
            red = Math.round(215 + k * 40);
            green = Math.round(64 + k * 46);
            blue = Math.round(230 - k * 185);
          }
          const sweepEdge = isBoot
            ? Math.max(0, 1 - Math.abs(diagCoord - sweepColLimit) / 3.5)
            : 0;
          const bgPulse =
            (0.72 +
              waveBoost * 0.38 +
              sweepEdge * 0.65 +
              0.08 * Math.sin(t * 3.0 + u * 6.0)) *
            power;
          const rr = Math.min(255, Math.round(red * bgPulse));
          const gg = Math.min(255, Math.round(green * bgPulse));
          const bb = Math.min(255, Math.round(blue * bgPulse));

          ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, 0.88)`;
          ctx.beginPath();
          ctx.arc(cx, cy, cs * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    this.texture.needsUpdate = true;
  }
}

/* =========================================================================
 * 2. PROCEDURAL PBR TEXTURES (METAL, GOLD COIN, CEILING LEDS, GLOW, LCD)
 * ========================================================================= */
export function createBrushedMetalTextures() {
  if (typeof document === "undefined") {
    return {
      map: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
      bumpMap: new THREE.Texture(),
    };
  }
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ccd4de";
  ctx.fillRect(0, 0, size, size);

  const r = document.createElement("canvas");
  r.width = r.height = size;
  const rctx = r.getContext("2d")!;
  rctx.fillStyle = "#484848";
  rctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const w = 35 + Math.random() * 240;
    const v = 180 + Math.floor(Math.random() * 58);
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.16)`;
    ctx.fillRect(x, y, w, 1.2);
    const rv = 45 + Math.floor(Math.random() * 65);
    rctx.fillStyle = `rgba(${rv},${rv},${rv},0.25)`;
    rctx.fillRect(x, y, w, 1.2);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = new THREE.CanvasTexture(r);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  return { map, roughnessMap, bumpMap: roughnessMap };
}

export function createGoldCoinTextures() {
  if (typeof document === "undefined") {
    return { map: new THREE.Texture(), bumpMap: new THREE.Texture() };
  }
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  const b = document.createElement("canvas");
  b.width = b.height = size;
  const bctx = b.getContext("2d")!;

  const grad = ctx.createRadialGradient(
    size * 0.4,
    size * 0.35,
    8,
    size / 2,
    size / 2,
    size * 0.5
  );
  grad.addColorStop(0, "#fef08a");
  grad.addColorStop(0.55, "#eab308");
  grad.addColorStop(1, "#92400e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = "#707070";
  bctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#fef9c3";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();

  bctx.strokeStyle = "#ffffff";
  bctx.lineWidth = 12;
  bctx.beginPath();
  bctx.arc(128, 128, 110, 0, Math.PI * 2);
  bctx.stroke();

  for (let i = 0; i < 36; i++) {
    const a = (i * Math.PI * 2) / 36;
    const x = 128 + Math.cos(a) * 94;
    const y = 128 + Math.sin(a) * 94;
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    bctx.fillStyle = "#e5e5e5";
    bctx.beginPath();
    bctx.arc(x, y, 3.5, 0, Math.PI * 2);
    bctx.fill();
  }

  const drawEmblem = (targetCtx: CanvasRenderingContext2D, color: string) => {
    targetCtx.save();
    targetCtx.translate(128, 128);
    targetCtx.fillStyle = color;
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = 6;
    targetCtx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? 58 : 26;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) targetCtx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else targetCtx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();
  };
  drawEmblem(ctx, "#b45309");
  drawEmblem(bctx, "#ffffff");

  ctx.fillStyle = "#fef08a";
  ctx.font = '900 44px "Orbitron", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("M", 128, 132);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  return { map, bumpMap };
}

export function createCeilingLEDGridTexture() {
  if (typeof document === "undefined") return new THREE.Texture();
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  const cols = 16;
  const rows = 8;
  const pad = 10;
  const cw = (w - pad * 2) / cols;
  const ch = (h - pad * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = pad + col * cw + 3;
      const y = pad + r * ch + 3;
      const sw = cw - 6;
      const sh = ch - 6;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#e0f2fe";
      ctx.shadowBlur = 8;
      ctx.fillRect(x, y, sw, sh);
    }
  }
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGlowSpriteTexture(
  innerColor = "#ffffff",
  midColor = "#ff4da6",
  outerColor = "rgba(255,77,166,0)"
) {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
  g.addColorStop(0.0, innerColor);
  g.addColorStop(0.28, midColor);
  g.addColorStop(1.0, outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface LimeLCDCanvasObj {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

export function createLimeLCDCanvas(): LimeLCDCanvasObj {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx, tex };
}

export function updateLimeLCD(
  lcd: LimeLCDCanvasObj,
  credits: number,
  timer: number,
  status: string
) {
  const { ctx, tex, canvas } = lcd;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#bef264");
  grad.addColorStop(1, "#84cc16");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(20, 45, 10, 0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  ctx.fillStyle = "#1a2e05";
  ctx.font = "bold 20px monospace";
  ctx.fillText(`CR:${String(Math.max(0, Math.floor(credits))).padStart(2, "0")}`, 20, 42);
  ctx.fillText(`TM:${Math.ceil(timer).toString().padStart(2, "0")}s`, 172, 42);

  ctx.fillStyle = "rgba(26, 46, 5, 0.25)";
  ctx.fillRect(18, 58, canvas.width - 36, 3);

  ctx.fillStyle = "#1a2e05";
  ctx.font = "900 30px monospace";
  ctx.fillText(status.slice(0, 12), 20, 114);

  ctx.font = "bold 14px monospace";
  ctx.fillText("MAGICLAW DELUXE", 20, 142);

  tex.needsUpdate = true;
}
