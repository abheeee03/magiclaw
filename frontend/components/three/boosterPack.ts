import * as THREE from "three";

export type PackFinishPreset = "satin" | "matte" | "foil" | "chrome";

export const PACK_W = 2.42;
export const PACK_H = 3.36;
export const PACK_DEPTH = 0.506; // max puff +-0.253
const CRIMP_BAND = 0.086;
const NUM_TEETH = 30;
const TOOTH_DEPTH = 0.056;

const TEX_W_HD = 1536;
const TEX_H_HD = 2120;
const TEX_W_LOW = 512;
const TEX_H_LOW = 704;

export const PACK_MATERIAL_PRESETS: Record<
  PackFinishPreset,
  {
    roughness: number;
    metalness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    envMapIntensity: number;
  }
> = {
  satin: {
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.15,
  },
  matte: {
    roughness: 0.68,
    metalness: 0.02,
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.75,
  },
  foil: {
    roughness: 0.19,
    metalness: 0.58,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.45,
  },
  chrome: {
    roughness: 0.1,
    metalness: 0.92,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.85,
  },
};

// Distinct vibrant booster pack colors per prize tier:
// 0 = Common, 1 = Rare, 2 = Epic, 3 = Grail
export const TIER_PACK_COLORS: Record<
  number,
  { packColor: string; textColor: string; label: string }
> = {
  0: { packColor: "#0891b2", textColor: "#ffffff", label: "COMMON" }, // Electric Teal / Cyan
  1: { packColor: "#6e3cf7", textColor: "#ffffff", label: "RARE" }, // Grape Violet
  2: { packColor: "#ec4899", textColor: "#ffffff", label: "EPIC" }, // Berry Pink
  3: { packColor: "#d97706", textColor: "#ffffff", label: "GRAIL" }, // Luminous Gold
};

export function getTierPackStyle(tier: number) {
  return TIER_PACK_COLORS[tier] || TIER_PACK_COLORS[0];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getWidthScale(v: number): number {
  const edgeDist = Math.min(v, 1 - v);
  const pinchIn = smoothstep(0.068, 0.115, edgeDist);
  const swellBack = smoothstep(0.115, 0.36, edgeDist);
  const pinchAmount = 0.032 * pinchIn * (1 - 0.52 * swellBack);
  return 1.0 - pinchAmount;
}

function sawtoothWave(u: number): number {
  const phase = (u * NUM_TEETH) % 1.0;
  return 1.0 - Math.abs(phase * 2.0 - 1.0);
}

/**
 * Builds a single closed face (front or back) of the 3D booster pack.
 */
export function createPouchFaceGeometry(
  isFront: boolean,
  segX = 168,
  segY = 200
): THREE.BufferGeometry {
  const vertCount = (segX + 1) * (segY + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  let ptr = 0;
  let uvPtr = 0;

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const wScale = getWidthScale(v);

    const bodyBottom = smoothstep(CRIMP_BAND - 0.008, CRIMP_BAND + 0.035, v);
    const bodyTop = smoothstep(
      1.0 - CRIMP_BAND + 0.008,
      1.0 - CRIMP_BAND - 0.035,
      v
    );
    const bodyMask = bodyBottom * bodyTop;

    const topCrimpMask = smoothstep(
      1.0 - CRIMP_BAND - 0.006,
      1.0 - CRIMP_BAND + 0.006,
      v
    );
    const botCrimpMask = smoothstep(CRIMP_BAND + 0.006, CRIMP_BAND - 0.006, v);
    const crimpMask = Math.max(topCrimpMask, botCrimpMask);

    const topWrinkleEnv = Math.exp(
      -Math.pow((v - (1.0 - CRIMP_BAND - 0.055)) / 0.068, 2)
    );
    const botWrinkleEnv = Math.exp(
      -Math.pow((v - (CRIMP_BAND + 0.055)) / 0.068, 2)
    );
    const wrinkleEnv = (topWrinkleEnv + botWrinkleEnv) * bodyMask;

    const vn = Math.max(
      0,
      Math.min(1, (v - CRIMP_BAND) / (1.0 - 2.0 * CRIMP_BAND))
    );
    const yPuff = Math.pow(Math.sin(vn * Math.PI), 0.46);

    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const x = (u - 0.5) * PACK_W * wScale;

      const tooth = sawtoothWave(u) * TOOTH_DEPTH;
      const topEdgeExtend = smoothstep(0.94, 1.0, v) * tooth;
      const botEdgeExtend = smoothstep(0.06, 0.0, v) * tooth;
      const y = (v - 0.5) * PACK_H + topEdgeExtend - botEdgeExtend;

      const xSin = Math.sin(u * Math.PI);
      const xPuff = Math.pow(xSin, 0.52);

      const baseThickness = 0.007;
      const maxPuff = 0.245;
      let z = baseThickness + maxPuff * yPuff * xPuff * bodyMask;

      if (crimpMask > 0.001) {
        const crimpRib = Math.sin(u * Math.PI * 2.0 * 64.0) * 0.0042;
        const edgeFade =
          smoothstep(0.0, 0.015, u) * smoothstep(1.0, 0.985, u);
        z += crimpRib * crimpMask * edgeFade;
      }

      if (wrinkleEnv > 0.001) {
        const w1 = Math.sin(u * 29.0 + 0.6) * 0.0045;
        const w2 = Math.sin(u * 53.0 - 1.4) * 0.0026;
        const w3 =
          Math.sin((u - 0.5) * 18.0 + (v > 0.5 ? 1 : -1) * 0.4) * 0.0032;
        const sideFade = Math.sin(u * Math.PI);
        z += (w1 + w2 + w3) * wrinkleEnv * sideFade;
      }

      const microWave =
        Math.sin(u * 11.0 + v * 5.0) * 0.0025 * yPuff * xPuff * bodyMask;
      z += microWave;

      const perimeterFade =
        smoothstep(0.0, 0.006, u) *
        smoothstep(1.0, 0.994, u) *
        smoothstep(0.0, 0.004, v) *
        smoothstep(1.0, 0.996, v);
      z *= perimeterFade;

      const signedZ = isFront ? z : -z;

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = signedZ;

      uvs[uvPtr++] = isFront ? u : 1.0 - u;
      uvs[uvPtr++] = v;
    }
  }

  const indices: number[] = [];
  const rowStride = segX + 1;
  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * rowStride + ix;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;

      if (isFront) {
        indices.push(a, b, d, a, d, c);
      } else {
        indices.push(a, d, b, a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the center vertical fin-seal flap on the back of the pouch.
 */
export function createBackFinSealGeometry(
  segX = 8,
  segY = 80
): THREE.BufferGeometry {
  const finWidth = 0.24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const y = (v - 0.5) * (PACK_H - 0.04);

    const bodyBottom = smoothstep(CRIMP_BAND - 0.005, CRIMP_BAND + 0.035, v);
    const bodyTop = smoothstep(
      1.0 - CRIMP_BAND + 0.005,
      1.0 - CRIMP_BAND - 0.035,
      v
    );
    const bodyMask = bodyBottom * bodyTop;
    const vn = Math.max(
      0,
      Math.min(1, (v - CRIMP_BAND) / (1.0 - 2.0 * CRIMP_BAND))
    );
    const yPuff = Math.pow(Math.sin(vn * Math.PI), 0.46);
    const baseBackZ = -(0.008 + 0.245 * yPuff * bodyMask);

    for (let ix = 0; ix <= segX; ix++) {
      const t = ix / segX;
      const x = t * finWidth;
      const lift = Math.sin(t * Math.PI * 0.85) * 0.022 + 0.006;
      const z = baseBackZ - lift * (0.25 + 0.75 * bodyMask);

      positions.push(x, y, z);
      uvs.push(t, v);
    }
  }

  const row = segX + 1;
  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

let cachedNormalMapHD: THREE.CanvasTexture | null = null;
let cachedNormalMapLow: THREE.CanvasTexture | null = null;

/**
 * Returns a shared cached procedural normal map for the top/bottom crimps and tension creases.
 */
export function getSharedPackNormalMap(
  maxAnisotropy = 4,
  highDetail = true
): THREE.CanvasTexture {
  if (highDetail && cachedNormalMapHD) return cachedNormalMapHD;
  if (!highDetail && cachedNormalMapLow) return cachedNormalMapLow;

  const w = highDetail ? 1024 : 256;
  const h = highDetail ? 1408 : 352;
  const heightData = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = 1.0 - y / (h - 1);
    const topCrimp = smoothstep(
      1.0 - CRIMP_BAND - 0.005,
      1.0 - CRIMP_BAND + 0.005,
      v
    );
    const botCrimp = smoothstep(CRIMP_BAND + 0.005, CRIMP_BAND - 0.005, v);
    const crimpMask = Math.max(topCrimp, botCrimp);

    const topSeam = Math.exp(-Math.pow((v - (1.0 - CRIMP_BAND)) / 0.0045, 2));
    const botSeam = Math.exp(-Math.pow((v - CRIMP_BAND) / 0.0045, 2));

    const topRipple =
      Math.exp(-Math.pow((v - (1.0 - CRIMP_BAND - 0.048)) / 0.062, 2)) *
      (1 - topCrimp);
    const botRipple =
      Math.exp(-Math.pow((v - (CRIMP_BAND + 0.048)) / 0.062, 2)) *
      (1 - botCrimp);
    const rippleEnv = topRipple + botRipple;

    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      let val = 0.0;

      if (crimpMask > 0.001) {
        val += Math.sin(u * Math.PI * 2.0 * 68.0) * 0.55 * crimpMask;
      }
      val -= (topSeam + botSeam) * 0.42;

      if (rippleEnv > 0.001) {
        const r1 = Math.sin(u * Math.PI * 2.0 * 11.0 + 0.5) * 0.24;
        const r2 = Math.sin(u * Math.PI * 2.0 * 19.0 - 1.2) * 0.16;
        const r3 = Math.sin(u * Math.PI * 2.0 * 31.0 + 2.1) * 0.09;
        const sideFade = Math.sin(u * Math.PI);
        val += (r1 + r2 + r3) * rippleEnv * sideFade;
      }

      heightData[y * w + x] = val;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const strength = 2.6;

  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);

      const dx = (heightData[y * w + xp] - heightData[y * w + xm]) * strength;
      const dy = (heightData[yp * w + x] - heightData[ym * w + x]) * strength;
      const dz = 1.0;

      const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      const idx = (y * w + x) * 4;
      data[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  if (highDetail) cachedNormalMapHD = tex;
  else cachedNormalMapLow = tex;
  return tex;
}

let cachedLowPolyGeos: {
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  fin: THREE.BufferGeometry;
} | null = null;

function getLowPolyPackGeometries() {
  if (!cachedLowPolyGeos) {
    cachedLowPolyGeos = {
      front: createPouchFaceGeometry(true, 18, 24),
      back: createPouchFaceGeometry(false, 18, 24),
      fin: createBackFinSealGeometry(3, 14),
    };
  }
  return cachedLowPolyGeos;
}

function tracePuffyStarPath(
  ctx: CanvasRenderingContext2D,
  outerR: number,
  innerR: number,
  roundness: number
) {
  const k = innerR;
  const r = roundness;

  ctx.beginPath();
  ctx.moveTo(r * 0.42, -outerR + r * 0.14);

  ctx.bezierCurveTo(
    k * 0.52,
    -k * 0.62,
    k * 0.62,
    -k * 0.52,
    outerR - r * 0.14,
    -r * 0.42
  );
  ctx.bezierCurveTo(
    outerR + r * 0.16,
    -r * 0.14,
    outerR + r * 0.16,
    r * 0.14,
    outerR - r * 0.14,
    r * 0.42
  );

  ctx.bezierCurveTo(
    k * 0.62,
    k * 0.52,
    k * 0.52,
    k * 0.62,
    r * 0.42,
    outerR - r * 0.14
  );
  ctx.bezierCurveTo(
    r * 0.14,
    outerR + r * 0.16,
    -r * 0.14,
    outerR + r * 0.16,
    -r * 0.42,
    outerR - r * 0.14
  );

  ctx.bezierCurveTo(
    -k * 0.52,
    k * 0.62,
    -k * 0.62,
    k * 0.52,
    -outerR + r * 0.14,
    r * 0.42
  );
  ctx.bezierCurveTo(
    -outerR - r * 0.16,
    r * 0.14,
    -outerR - r * 0.16,
    -r * 0.14,
    -outerR + r * 0.14,
    -r * 0.42
  );

  ctx.bezierCurveTo(
    -k * 0.62,
    -k * 0.52,
    -k * 0.52,
    -k * 0.62,
    -r * 0.42,
    -outerR + r * 0.14
  );
  ctx.bezierCurveTo(
    -r * 0.14,
    -outerR - r * 0.16,
    r * 0.14,
    -outerR - r * 0.16,
    r * 0.42,
    -outerR + r * 0.14
  );
  ctx.closePath();
}

function drawDefaultHoloStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale = 1.0,
  extraRotDeg = 0,
  enableShadow = true,
  fastMode = false
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((11.5 + extraRotDeg) * Math.PI) / 180);
  ctx.scale(scale, scale);

  const outerR = 490;
  const innerR = 325;
  const roundness = 128;

  if (enableShadow && !fastMode) {
    ctx.save();
    tracePuffyStarPath(ctx, outerR, innerR, roundness);
    ctx.shadowColor = "rgba(26, 8, 86, 0.44)";
    ctx.shadowBlur = 72;
    ctx.shadowOffsetX = -16;
    ctx.shadowOffsetY = 36;
    ctx.fillStyle = "#c8b8ff";
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  tracePuffyStarPath(ctx, outerR, innerR, roundness);
  ctx.clip();

  const baseGrad = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
  baseGrad.addColorStop(0, "#c8e4ff");
  baseGrad.addColorStop(0.35, "#e8f7ff");
  baseGrad.addColorStop(0.68, "#f6d5f5");
  baseGrad.addColorStop(1, "#d2c2ff");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(
    -outerR - 60,
    -outerR - 60,
    (outerR + 60) * 2,
    (outerR + 60) * 2
  );

  const blooms = [
    {
      x: -10,
      y: -330,
      r: 340,
      c0: "rgba(255, 245, 148, 0.92)",
      c1: "rgba(130, 246, 224, 0.55)",
      c2: "rgba(130, 246, 224, 0)",
    },
    {
      x: 185,
      y: -120,
      r: 340,
      c0: "rgba(116, 247, 232, 0.88)",
      c1: "rgba(170, 238, 255, 0.42)",
      c2: "rgba(170, 238, 255, 0)",
    },
    {
      x: 340,
      y: 20,
      r: 290,
      c0: "rgba(255, 240, 142, 0.92)",
      c1: "rgba(255, 174, 210, 0.55)",
      c2: "rgba(255, 174, 210, 0)",
    },
    {
      x: -330,
      y: -25,
      r: 320,
      c0: "rgba(255, 174, 206, 0.90)",
      c1: "rgba(255, 242, 165, 0.55)",
      c2: "rgba(255, 242, 165, 0)",
    },
    {
      x: -165,
      y: 65,
      r: 290,
      c0: "rgba(255, 232, 175, 0.78)",
      c1: "rgba(255, 185, 215, 0.35)",
      c2: "rgba(255, 185, 215, 0)",
    },
    {
      x: 15,
      y: 315,
      r: 350,
      c0: "rgba(202, 176, 255, 0.88)",
      c1: "rgba(255, 188, 220, 0.55)",
      c2: "rgba(255, 188, 220, 0)",
    },
    {
      x: 165,
      y: 185,
      r: 260,
      c0: "rgba(154, 244, 236, 0.72)",
      c1: "rgba(218, 198, 255, 0.30)",
      c2: "rgba(218, 198, 255, 0)",
    },
    {
      x: -175,
      y: -175,
      r: 260,
      c0: "rgba(155, 218, 255, 0.82)",
      c1: "rgba(195, 236, 255, 0.35)",
      c2: "rgba(195, 236, 255, 0)",
    },
    {
      x: -20,
      y: -25,
      r: 275,
      c0: "rgba(255, 255, 255, 0.45)",
      c1: "rgba(255, 245, 250, 0.16)",
      c2: "rgba(255, 255, 255, 0)",
    },
  ];

  const activeBlooms = fastMode ? blooms.slice(0, 5) : blooms;
  for (const b of activeBlooms) {
    const g = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, b.r);
    g.addColorStop(0, b.c0);
    g.addColorStop(0.55, b.c1);
    g.addColorStop(1, b.c2);
    ctx.fillStyle = g;
    ctx.fillRect(
      -outerR - 60,
      -outerR - 60,
      (outerR + 60) * 2,
      (outerR + 60) * 2
    );
  }

  if (!fastMode) {
    ctx.save();
    tracePuffyStarPath(ctx, outerR, innerR, roundness);
    ctx.lineWidth = 34;
    ctx.strokeStyle = "rgba(130, 95, 195, 0.22)";
    ctx.filter = "blur(14px)";
    ctx.stroke();
    ctx.restore();

    ctx.save();
    tracePuffyStarPath(ctx, outerR - 8, innerR - 6, roundness);
    const rimGrad = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
    rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    rimGrad.addColorStop(0.45, "rgba(255, 240, 250, 0.55)");
    rimGrad.addColorStop(0.75, "rgba(255, 255, 255, 0.85)");
    rimGrad.addColorStop(1, "rgba(255, 255, 255, 0.40)");
    ctx.lineWidth = 14;
    ctx.strokeStyle = rimGrad;
    ctx.filter = "blur(4px)";
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-66, -242);
  ctx.bezierCurveTo(-96, -155, -112, -88, -114, -42);
  ctx.bezierCurveTo(-116, -20, -90, -14, -80, -34);
  ctx.bezierCurveTo(-65, -88, -52, -162, -48, -234);
  ctx.bezierCurveTo(-47, -250, -61, -254, -66, -242);
  ctx.closePath();
  const specGrad = ctx.createLinearGradient(-115, -245, -45, -25);
  specGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  specGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.92)");
  specGrad.addColorStop(1, "rgba(255, 255, 255, 0.75)");
  ctx.fillStyle = specGrad;
  if (!fastMode) {
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 10;
  }
  ctx.fill();
  ctx.restore();

  if (!fastMode) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(28, -438);
    ctx.bezierCurveTo(85, -350, 145, -240, 205, -172);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.filter = "blur(3px)";
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  tracePuffyStarPath(ctx, outerR, innerR, roundness);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.stroke();
  ctx.restore();

  // Kawaii face
  ctx.save();
  ctx.rotate((-19 * Math.PI) / 180);
  ctx.translate(4, 52);

  const drawBlush = (bx: number, by: number) => {
    const bg = ctx.createRadialGradient(bx, by, 4, bx, by, 52);
    bg.addColorStop(0, "rgba(255, 98, 138, 0.58)");
    bg.addColorStop(0.6, "rgba(255, 118, 152, 0.28)");
    bg.addColorStop(1, "rgba(255, 118, 152, 0)");
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1.25, 0.72);
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
  };
  drawBlush(-176, 48);
  drawBlush(176, 48);

  const drawEye = (ex: number, ey: number, tilt: number) => {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(tilt);

    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 62, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#2c2730";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(-12, -22, 13, 19, -0.18, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(14, 18, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fill();

    ctx.restore();
  };
  drawEye(-96, -2, -0.06);
  drawEye(96, -2, 0.06);

  ctx.beginPath();
  ctx.moveTo(-27, 46);
  ctx.quadraticCurveTo(0, 74, 27, 46);
  ctx.strokeStyle = "#2c2730";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 255;
  const g = parseInt(clean.substring(2, 4), 16) || 255;
  const b = parseInt(clean.substring(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function measureTrackedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number
): number {
  const chars = Array.from(text);
  return (
    chars.reduce((acc, ch) => acc + ctx.measureText(ch).width, 0) +
    tracking * Math.max(0, chars.length - 1)
  );
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "right" | "center" = "left"
) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((acc, w) => acc + w, 0) +
    tracking * Math.max(0, chars.length - 1);

  let cursorX = x;
  if (align === "right") cursorX = x - totalWidth;
  else if (align === "center") cursorX = x - totalWidth / 2;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursorX, y);
    cursorX += widths[i] + tracking;
  }
  ctx.textAlign = prevAlign;
}

export interface BoosterPackTextConfig {
  tier: number;
  tearText?: string; // defaults to "solana"
  brandTitle: string; // Token Name
  flavorText?: string; // defaults to "magiclaw"
  bottomLeft?: string; // defaults to "magicblock"
  bottomRight: string; // Token amount won / in slot
  imageUrl?: string;
}

function renderFrontCanvas(
  ctx: CanvasRenderingContext2D,
  cfg: BoosterPackTextConfig,
  highDetail: boolean,
  loadedImage?: HTMLImageElement
) {
  const { packColor, textColor } = getTierPackStyle(cfg.tier);
  const tearText = cfg.tearText ?? "solana";
  const flavorText = cfg.flavorText ?? "magiclaw";
  const bottomLeft = cfg.bottomLeft ?? "magicblock";

  const scaleFactor = ctx.canvas.width / TEX_W_HD;

  ctx.save();
  ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
  ctx.clearRect(0, 0, TEX_W_HD, TEX_H_HD);
  ctx.fillStyle = packColor;
  ctx.fillRect(0, 0, TEX_W_HD, TEX_H_HD);

  // Crimp shading
  const crimpPx = Math.round(TEX_H_HD * CRIMP_BAND);
  const numGrooves = highDetail ? 68 : 34;
  const step = TEX_W_HD / numGrooves;
  for (let i = 0; i < numGrooves; i++) {
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255,255,255,0.032)" : "rgba(15,0,40,0.042)";
    ctx.fillRect(i * step, 0, step * 0.55, crimpPx);
    ctx.fillRect(i * step, TEX_H_HD - crimpPx, step * 0.55, crimpPx);
  }

  // Center artwork
  const centerX = TEX_W_HD * 0.505;
  const centerY = TEX_H_HD * 0.545;

  if (loadedImage) {
    ctx.save();
    ctx.translate(centerX, centerY);
    const maxDim = 860;
    const aspect = loadedImage.naturalWidth / (loadedImage.naturalHeight || 1);
    let drawW = maxDim;
    let drawH = maxDim;
    if (aspect >= 1) drawH = maxDim / aspect;
    else drawW = maxDim * aspect;

    if (highDetail) {
      ctx.shadowColor = "rgba(18, 6, 62, 0.36)";
      ctx.shadowBlur = 54;
      ctx.shadowOffsetX = -10;
      ctx.shadowOffsetY = 26;
    }

    const r = Math.min(drawW, drawH) * 0.14;
    ctx.beginPath();
    ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, r);
    ctx.clip();
    ctx.drawImage(loadedImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    drawDefaultHoloStar(ctx, centerX, centerY, 0.98, 0, highDetail, !highDetail);
  }

  // Subtle shadow for crisp legibility on bright colors (e.g. Gold Grail)
  ctx.save();
  if (highDetail) {
    ctx.shadowColor = "rgba(15, 8, 36, 0.28)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
  }

  // 1. Top-left Tear Indicator ("solana")
  if (tearText.trim()) {
    ctx.font = '600 40px "Plus Jakarta Sans", "Inter", sans-serif';
    ctx.fillStyle = hexToRgba(textColor, 0.88);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    drawTrackedText(ctx, tearText, 134, 256, 5.5, "left");
  }

  // 2. Top-right Flavor / Edition Tag ("magiclaw")
  ctx.font = '600 46px "Plus Jakarta Sans", "Inter", sans-serif';
  ctx.fillStyle = hexToRgba(textColor, 0.9);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  drawTrackedText(ctx, flavorText, TEX_W_HD - 134, 256, 5.2, "right");

  // 3. Main Brand Title (Token Name) - auto-fitted to prevent overflow
  const brandTitle = (cfg.brandTitle || "TOKEN").trim();
  if (brandTitle) {
    let titleSize = 200;
    const maxTitleWidth = TEX_W_HD - 264;
    while (titleSize > 72) {
      ctx.font = `800 ${titleSize}px "Poppins", "Plus Jakarta Sans", sans-serif`;
      const w = measureTrackedTextWidth(ctx, brandTitle, -titleSize * 0.04);
      if (w <= maxTitleWidth) break;
      titleSize -= 6;
    }
    ctx.font = `800 ${titleSize}px "Poppins", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = hexToRgba(textColor, 0.99);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const titleY = Math.min(548, 390 + titleSize * 0.82);
    drawTrackedText(ctx, brandTitle, 128, titleY, -titleSize * 0.04, "left");
  }

  // 4. Bottom-Left ("magicblock")
  if (bottomLeft.trim()) {
    ctx.font = '600 50px "Plus Jakarta Sans", "Inter", sans-serif';
    ctx.fillStyle = hexToRgba(textColor, 0.9);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(bottomLeft, 132, TEX_H_HD - 278);
  }

  // 5. Bottom-Right (Amount of tokens won / in pack) - auto-fitted to avoid overlapping bottom-left
  const bottomRight = (cfg.bottomRight || "").trim();
  if (bottomRight) {
    let brSize = 54;
    const maxBrWidth = TEX_W_HD * 0.46;
    while (brSize > 30) {
      ctx.font = `700 ${brSize}px "Plus Jakarta Sans", "Inter", sans-serif`;
      if (ctx.measureText(bottomRight).width <= maxBrWidth) break;
      brSize -= 2;
    }
    ctx.font = `700 ${brSize}px "Plus Jakarta Sans", "Inter", sans-serif`;
    ctx.fillStyle = hexToRgba(textColor, 0.98);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(bottomRight, TEX_W_HD - 132, TEX_H_HD - 278);
  }

  ctx.restore();
  ctx.restore();
}

function renderBackCanvas(
  ctx: CanvasRenderingContext2D,
  cfg: BoosterPackTextConfig,
  highDetail: boolean
) {
  const { packColor, label } = getTierPackStyle(cfg.tier);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = packColor;
  ctx.fillRect(0, 0, w, h);

  if (!highDetail) {
    // Low-poly cabinet packs lie face-up; keep back texture ultra-fast & clean
    const crimpPx = Math.round(h * CRIMP_BAND);
    ctx.fillStyle = "rgba(15,0,40,0.06)";
    ctx.fillRect(0, 0, w, crimpPx);
    ctx.fillRect(0, h - crimpPx, w, crimpPx);
    return;
  }

  const crimpPx = Math.round(h * CRIMP_BAND);
  const numGrooves = 68;
  const step = w / numGrooves;
  for (let i = 0; i < numGrooves; i++) {
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(15,0,40,0.04)";
    ctx.fillRect(i * step, 0, step * 0.55, crimpPx);
    ctx.fillRect(i * step, h - crimpPx, step * 0.55, crimpPx);
  }

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  let backTitleSz = 68;
  while (backTitleSz > 34) {
    ctx.font = `800 ${backTitleSz}px "Poppins", sans-serif`;
    if (ctx.measureText(cfg.brandTitle || "TOKEN").width <= w * 0.42) break;
    backTitleSz -= 4;
  }
  ctx.textAlign = "left";
  ctx.fillText(cfg.brandTitle || "TOKEN", 92, 265);

  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.64)";
  ctx.fillText(`${label} • MAGICLAW`, 94, 310);

  ctx.font = '500 20px "Inter", sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillText("SOLANA ONCHAIN REWARD PACK", 94, 380);
  ctx.fillText("VERIFIED BY MAGICBLOCK VRF", 94, 410);
  ctx.fillText(`PACK AMOUNT: ${cfg.bottomRight}`, 94, 456);

  const bcX = w - 340;
  const bcY = h - 355;
  const bcW = 248;
  const bcH = 132;
  ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
  ctx.beginPath();
  ctx.roundRect(bcX, bcY, bcW, bcH, 12);
  ctx.fill();

  ctx.fillStyle = "#18181b";
  const pattern = [
    3, 2, 5, 2, 2, 4, 2, 3, 6, 2, 2, 3, 4, 2, 2, 5, 2, 3, 2, 4, 2, 3, 5, 2, 3,
    2, 4, 3,
  ];
  let curX = bcX + 20;
  for (let i = 0; i < pattern.length; i++) {
    const bw = pattern[i] * 2.15;
    if (i % 2 === 0 && curX + bw < bcX + bcW - 18) {
      ctx.fillRect(curX, bcY + 16, bw, bcH - 42);
    }
    curX += bw + 1.4;
  }
  ctx.font = "600 17px monospace";
  ctx.textAlign = "center";
  ctx.fillText("8  42901  00501  9", bcX + bcW / 2, bcY + bcH - 8);
  ctx.restore();
}

export interface BoosterPackInstance {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Creates a complete 3D Booster Pack (front face, back face, center fin-seal, procedural normal map)
 * with either `"matte"` (Matte Soft-Touch inside the machine, low-poly & shared geometries)
 * or `"satin"` (Satin Studio on winning screen, high-detail).
 */
export function createBoosterPackObject(params: {
  config: BoosterPackTextConfig;
  finish: PackFinishPreset;
  highDetail?: boolean;
  maxAnisotropy?: number;
}): BoosterPackInstance {
  const { config, finish, highDetail = false, maxAnisotropy = 4 } = params;
  const { packColor } = getTierPackStyle(config.tier);
  const preset = PACK_MATERIAL_PRESETS[finish];

  const frontCanvas = document.createElement("canvas");
  frontCanvas.width = highDetail ? TEX_W_HD : TEX_W_LOW;
  frontCanvas.height = highDetail ? TEX_H_HD : TEX_H_LOW;
  const fCtx = frontCanvas.getContext("2d")!;
  renderFrontCanvas(fCtx, config, highDetail);

  const frontTexture = new THREE.CanvasTexture(frontCanvas);
  frontTexture.colorSpace = THREE.SRGBColorSpace;
  frontTexture.anisotropy = highDetail ? maxAnisotropy : 2;
  frontTexture.needsUpdate = true;

  const backCanvas = document.createElement("canvas");
  backCanvas.width = highDetail ? 1024 : 128;
  backCanvas.height = highDetail ? 1414 : 176;
  const bCtx = backCanvas.getContext("2d")!;
  renderBackCanvas(bCtx, config, highDetail);

  const backTexture = new THREE.CanvasTexture(backCanvas);
  backTexture.colorSpace = THREE.SRGBColorSpace;
  backTexture.anisotropy = highDetail ? maxAnisotropy : 1;
  backTexture.needsUpdate = true;

  const normalMap = getSharedPackNormalMap(
    highDetail ? maxAnisotropy : 2,
    highDetail
  );

  // Use lightweight MeshStandardMaterial for low-poly machine packs,
  // and MeshPhysicalMaterial (clearcoat + sheen) for highDetail Satin Studio showcase.
  const frontMat = highDetail
    ? new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: preset.roughness,
        metalness: preset.metalness,
        clearcoat: preset.clearcoat,
        clearcoatRoughness: preset.clearcoatRoughness,
        envMapIntensity: preset.envMapIntensity,
        sheen: 0.12,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(0xffffff),
      })
    : new THREE.MeshStandardMaterial({
        map: frontTexture,
        normalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: preset.roughness,
        metalness: preset.metalness,
        envMapIntensity: preset.envMapIntensity,
      });

  const backMat = highDetail
    ? new THREE.MeshPhysicalMaterial({
        map: backTexture,
        normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: preset.roughness,
        metalness: preset.metalness,
        clearcoat: preset.clearcoat,
        clearcoatRoughness: preset.clearcoatRoughness,
        envMapIntensity: preset.envMapIntensity,
      })
    : new THREE.MeshStandardMaterial({
        map: backTexture,
        roughness: preset.roughness,
        metalness: preset.metalness,
        envMapIntensity: preset.envMapIntensity,
      });

  const finMat = highDetail
    ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(packColor),
        roughness: Math.min(1, preset.roughness + 0.05),
        metalness: preset.metalness,
        clearcoat: preset.clearcoat * 0.7,
        clearcoatRoughness: 0.25,
        envMapIntensity: preset.envMapIntensity,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshStandardMaterial({
        color: new THREE.Color(packColor),
        roughness: Math.min(1, preset.roughness + 0.05),
        metalness: preset.metalness,
        envMapIntensity: preset.envMapIntensity,
        side: THREE.DoubleSide,
      });

  const sharedGeos = !highDetail ? getLowPolyPackGeometries() : null;
  const frontGeo = sharedGeos
    ? sharedGeos.front
    : createPouchFaceGeometry(true, 168, 200);
  const backGeo = sharedGeos
    ? sharedGeos.back
    : createPouchFaceGeometry(false, 168, 200);
  const finGeo = sharedGeos
    ? sharedGeos.fin
    : createBackFinSealGeometry(8, 80);

  const frontMesh = new THREE.Mesh(frontGeo, frontMat);
  frontMesh.castShadow = true;
  frontMesh.receiveShadow = true;

  const backMesh = new THREE.Mesh(backGeo, backMat);
  backMesh.castShadow = highDetail;
  backMesh.receiveShadow = highDetail;

  const finMesh = new THREE.Mesh(finGeo, finMat);
  finMesh.castShadow = highDetail;
  finMesh.receiveShadow = false;

  const group = new THREE.Group();
  group.add(frontMesh, backMesh, finMesh);

  let disposed = false;

  // Re-render once custom Google Fonts finish loading
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (disposed) return;
      renderFrontCanvas(fCtx, config, highDetail, loadedImg);
      frontTexture.needsUpdate = true;
      if (highDetail) {
        renderBackCanvas(bCtx, config, true);
        backTexture.needsUpdate = true;
      }
    });
  }

  let loadedImg: HTMLImageElement | undefined;
  if (config.imageUrl && typeof Image !== "undefined") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (disposed) return;
      loadedImg = img;
      renderFrontCanvas(fCtx, config, highDetail, img);
      frontTexture.needsUpdate = true;
    };
    img.src = config.imageUrl;
  }

  return {
    group,
    dispose: () => {
      disposed = true;
      if (highDetail) {
        frontGeo.dispose();
        backGeo.dispose();
        finGeo.dispose();
      }
      frontTexture.dispose();
      backTexture.dispose();
      frontMat.dispose();
      backMat.dispose();
      finMat.dispose();
    },
  };
}
