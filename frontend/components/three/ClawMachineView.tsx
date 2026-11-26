"use client";

import React, { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { arcadeAudio } from "../audio/ArcadeAudio";
import {
  DottedPixelMarquee,
  createBrushedMetalTextures,
  createGoldCoinTextures,
  createCeilingLEDGridTexture,
  createGlowSpriteTexture,
  createLimeLCDCanvas,
  updateLimeLCD,
} from "./textures";
import {
  getFlavorSpecForSlot,
  SnackBoxBody,
  createPrizeBoxMaterials,
} from "./prizes";
import { PrizeSlot, WonPrizeInfo } from "../../lib/types";
import { computeLiveBuyback, getLivePythPrice } from "../../lib/pyth";

export type CamMode = "hero" | "front" | "side" | "orbit";

export interface OnchainVrfResult {
  nonce: number;
  outcome: "Won" | "Slipped" | "Miss";
  roll: number;
  targetSlot: number;
  isBullseye: boolean;
}

export interface ClawMachineViewProps {
  slots?: PrizeSlot[];
  usdcBalance?: string;
  isSteeringAllowed?: boolean;
  isOnchainActive?: boolean;
  onchainVrfResult?: OnchainVrfResult | null;
  onSteerDelta?: (dx: number, dz: number) => void;
  onDropTriggered?: (clientSeed: number, clawX: number, clawZ: number) => void;
  onWinPrize?: (prize: WonPrizeInfo) => void;
  activeCamMode: CamMode;
  onCamModeChange?: (mode: CamMode) => void;
  virtualJoyVector?: { x: number; y: number };
  isDropRequested?: boolean;
  gameStateText?: string;
  powerReplayCount?: number;
  coinInsertCount?: number;
  isLoaderVisible?: boolean;
  showProjection?: boolean;
  isPrizesZoomed?: boolean;
  onPrizesZoomComplete?: () => void;
  onSceneReady?: () => void;
  onBootStateChange?: (hudHidden: boolean, booting: boolean) => void;
  onClawStateChange?: (clawState: string) => void;
}

const CAB = {
  xMin: -1.08,
  xMax: 1.08,
  zMin: -0.96,
  zMax: 0.96,
  floorY: 0.0,
  chuteXMax: -0.26,
  chuteZMin: 0.2,
  chuteWallH: 0.46,
  chuteWallThick: 0.036,
  chuteCenterX: -0.67,
  chuteCenterZ: 0.58,
  gantryY: 2.62,
  clawRestY: 2.12,
  clawMinY: 0.44,
  gantryXMin: -0.82,
  gantryXMax: 0.84,
  gantryZMin: -0.74,
  gantryZMax: 0.7,
};

const CAM_PRESETS: Record<Exclude<CamMode, "orbit">, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  hero: { pos: new THREE.Vector3(-1.56, 1.5, 4.95), target: new THREE.Vector3(0.06, 1.24, 0.05) },
  front: { pos: new THREE.Vector3(0.0, 1.44, 4.78), target: new THREE.Vector3(0.0, 1.08, 0.04) },
  side: { pos: new THREE.Vector3(4.48, 1.34, 0.12), target: new THREE.Vector3(0.0, 1.04, 0.02) },
};

const STATE = {
  READY: "READY",
  MOVING: "MOVING",
  DROPPING: "DROPPING",
  GRABBING: "GRABBING",
  LIFTING: "LIFTING",
  RETURNING: "RETURNING",
  RELEASING: "RELEASING",
  RESOLVING: "RESOLVING",
} as const;

function getResponsiveDistScale() {
  if (typeof window === "undefined") return 1.0;
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return aspect < 0.65 ? 1.38 : aspect < 0.95 ? 1.18 : 1.0;
}

function computeScaledCamPos(
  basePos: THREE.Vector3,
  baseTarget: THREE.Vector3,
  out = new THREE.Vector3()
) {
  return out
    .copy(basePos)
    .sub(baseTarget)
    .multiplyScalar(getResponsiveDistScale())
    .add(baseTarget);
}

function sampleBallastCurve(u: number) {
  if (u <= 0) return 0;
  if (u < 0.06) return 0.28;
  if (u < 0.14) return 0.02;
  if (u < 0.2) return 0.62;
  if (u < 0.25) return 0.06;
  if (u < 0.3) return 0.85;
  if (u < 0.35) return 0.18;
  if (u < 0.42) return 1.15;
  return THREE.MathUtils.lerp(1.15, 1.0, Math.min(1, (u - 0.42) / 0.22));
}

function sampleNeonIgnite(u: number) {
  if (u <= 0) return 0;
  if (u < 0.12) return 0.42;
  if (u < 0.2) return 0.12;
  if (u < 0.32) return 1.18;
  return THREE.MathUtils.lerp(1.18, 1.0, Math.min(1, (u - 0.32) / 0.25));
}

function easeInOutCubic(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function isInsideChuteXZ(x: number, z: number) {
  return x < CAB.chuteXMax && z > CAB.chuteZMin;
}

function createRoundedRectTubeGeometry(
  width: number,
  height: number,
  cornerR: number,
  tubeR: number,
  tubularSegs = 96
) {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(cornerR, hw * 0.9, hh * 0.9);
  const pts: THREE.Vector3[] = [];
  const stepsPerCorner = 8;

  const corners = [
    { cx: hw - r, cy: hh - r, a0: 0, a1: Math.PI / 2 },
    { cx: -hw + r, cy: hh - r, a0: Math.PI / 2, a1: Math.PI },
    { cx: -hw + r, cy: -hh + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { cx: hw - r, cy: -hh + r, a0: Math.PI * 1.5, a1: Math.PI * 2 },
  ];

  corners.forEach((c) => {
    for (let i = 0; i <= stepsPerCorner; i++) {
      const a = THREE.MathUtils.lerp(c.a0, c.a1, i / stepsPerCorner);
      pts.push(
        new THREE.Vector3(c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r, 0)
      );
    }
  });

  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.15);
  return new THREE.TubeGeometry(curve, tubularSegs, tubeR, 14, true);
}

function createRoundedConsoleMesh(w: number, d: number, h: number, r: number) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 4,
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

export const ClawMachineView: React.FC<ClawMachineViewProps> = ({
  slots,
  usdcBalance = "0.00",
  isSteeringAllowed = true,
  isOnchainActive = false,
  onchainVrfResult = null,
  onSteerDelta,
  onDropTriggered,
  onWinPrize,
  activeCamMode = "hero",
  onCamModeChange,
  virtualJoyVector = { x: 0, y: 0 },
  isDropRequested = false,
  gameStateText = "READY",
  powerReplayCount = 0,
  coinInsertCount = 0,
  isLoaderVisible = false,
  showProjection = false,
  isPrizesZoomed = false,
  onPrizesZoomComplete,
  onSceneReady,
  onBootStateChange,
  onClawStateChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const propsRef = useRef({
    slots,
    usdcBalance,
    isSteeringAllowed,
    isOnchainActive,
    onchainVrfResult,
    onSteerDelta,
    onDropTriggered,
    onWinPrize,
    activeCamMode,
    onCamModeChange,
    virtualJoyVector,
    gameStateText,
    isLoaderVisible,
    showProjection,
    isPrizesZoomed,
    onPrizesZoomComplete,
    onSceneReady,
    onBootStateChange,
    onClawStateChange,
  });

  useEffect(() => {
    propsRef.current = {
      slots,
      usdcBalance,
      isSteeringAllowed,
      isOnchainActive,
      onchainVrfResult,
      onSteerDelta,
      onDropTriggered,
      onWinPrize,
      activeCamMode,
      onCamModeChange,
      virtualJoyVector,
      gameStateText,
      isLoaderVisible,
      showProjection,
      isPrizesZoomed,
      onPrizesZoomComplete,
      onSceneReady,
      onBootStateChange,
      onClawStateChange,
    };
  });

  const gameRef = useRef({
    state: STATE.READY as string,
    timer: 25.0,
    lastTickSec: 25,
    stateTime: 0,
    gantryX: 0.04,
    gantryZ: -0.04,
    gantryVx: 0,
    gantryVz: 0,
    clawY: CAB.clawRestY,
    clawOpen: 0.16,
    targetClawOpen: 0.16,
    swayX: 0,
    swayZ: 0,
    swayVx: 0,
    swayVz: 0,
    grabbedBox: null as SnackBoxBody | null,
    lastReleasedBox: null as SnackBoxBody | null,
    grabOffset: new THREE.Vector3(),
    willSlip: false,
    slipThresholdY: 1.4,
    slipAtReturn: false,
    wonThisTurn: false,
    celebrationTimer: 0,
    dropBtnPress: 0,
    coinAnimTimer: 0,
  });

  const bootActiveRef = useRef(true);
  const keysRef = useRef<Record<string, boolean>>({});
  const boxesRef = useRef<SnackBoxBody[]>([]);
  const pendingSlotsSyncRef = useRef<PrizeSlot[] | undefined | null>(null);
  const syncBoxesRef = useRef<((slotList?: PrizeSlot[]) => void) | null>(null);
  const startBootRef = useRef<((isReplay?: boolean) => void) | null>(null);
  const setCameraModeRef = useRef<((mode: CamMode, instant?: boolean) => void) | null>(null);
  const setPrizesZoomRef = useRef<((zoomed: boolean) => void) | null>(null);
  const triggerCoinAnimRef = useRef<(() => void) | null>(null);
  const lastVrfNonceAppliedRef = useRef<number>(0);

  // Sync snack boxes when onchain slots update (defer if mid-turn)
  useEffect(() => {
    const g = gameRef.current;
    if (g.state === STATE.READY && !g.grabbedBox) {
      syncBoxesRef.current?.(slots);
      pendingSlotsSyncRef.current = null;
    } else {
      pendingSlotsSyncRef.current = slots;
    }
  }, [slots]);

  // Camera mode prop updates
  useEffect(() => {
    if (!bootActiveRef.current) {
      setCameraModeRef.current?.(activeCamMode, false);
    }
  }, [activeCamMode]);

  // Prizes zoom-in / zoom-out prop updates
  useEffect(() => {
    if (!bootActiveRef.current) {
      setPrizesZoomRef.current?.(isPrizesZoomed);
    }
  }, [isPrizesZoomed]);

  // Replay boot sequence when requested from header button
  useEffect(() => {
    if (powerReplayCount > 0) {
      startBootRef.current?.(true);
    }
  }, [powerReplayCount]);

  // Flying coin animation trigger
  useEffect(() => {
    if (coinInsertCount > 0) {
      triggerCoinAnimRef.current?.();
    }
  }, [coinInsertCount]);

  const triggerDrop = useCallback(() => {
    if (bootActiveRef.current) return;
    if (!propsRef.current.isSteeringAllowed) return;
    const g = gameRef.current;
    if (g.state !== STATE.READY && g.state !== STATE.MOVING) return;

    arcadeAudio.init();
    arcadeAudio.playButtonClick();
    arcadeAudio.playPneumaticSnap(true);
    arcadeAudio.updateMotor(0);
    arcadeAudio.setWinch(-1);

    g.dropBtnPress = 1.0;
    g.state = STATE.DROPPING;
    g.stateTime = 0;
    g.targetClawOpen = 1.0;
    g.wonThisTurn = false;
    g.grabbedBox = null;
    g.lastReleasedBox = null;
    g.willSlip = false;
    g.slipAtReturn = false;

    const clientSeed = Math.floor(Math.random() * 255);
    const clawX = Math.max(
      0,
      Math.min(1000, Math.round(((g.gantryX - CAB.gantryXMin) / (CAB.gantryXMax - CAB.gantryXMin)) * 1000))
    );
    const clawZ = Math.max(
      0,
      Math.min(1000, Math.round(((g.gantryZ - CAB.gantryZMin) / (CAB.gantryZMax - CAB.gantryZMin)) * 1000))
    );
    propsRef.current.onDropTriggered?.(clientSeed, clawX, clawZ);
  }, []);

  useEffect(() => {
    const g = gameRef.current;
    if (
      isDropRequested &&
      (g.state === STATE.READY || g.state === STATE.MOVING)
    ) {
      triggerDrop();
    }
  }, [isDropRequested, triggerDrop]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false });
      } catch {
        propsRef.current.onSceneReady?.();
        return;
      }
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060711);
    scene.fog = new THREE.FogExp2(0x060711, 0.048);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      60
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.2;
    controls.maxDistance = 11.5;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = 0.22;

    // Procedural PMREM environment map with cyberpunk arcade neon reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x090b18);

    const addEnvPanel = (
      w: number,
      h: number,
      color: number,
      pos: [number, number, number],
      rotY = 0,
      rotX = 0
    ) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color })
      );
      m.position.set(...pos);
      m.rotation.set(rotX, rotY, 0);
      envScene.add(m);
    };
    addEnvPanel(10, 8, 0xffffff, [0, 9, 0], 0, Math.PI / 2);
    addEnvPanel(6, 5, 0xff2e93, [8, 3, 2], -Math.PI / 2.1, 0);
    addEnvPanel(6, 4, 0x38bdf8, [7, 2.5, -5], -Math.PI / 1.5, 0);
    addEnvPanel(6, 5, 0xff7b29, [-8, 2.8, 3], Math.PI / 2.1, 0);
    addEnvPanel(7, 3, 0x34d399, [0, 1.2, 8], Math.PI, 0);
    addEnvPanel(8, 5, 0x6366f1, [-4, 4, -8], 0, 0);

    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.02;
    pmrem.dispose();

    // Shared procedural textures
    const brushedTex = createBrushedMetalTextures();
    const goldCoinTex = createGoldCoinTextures();
    const ceilingLEDTex = createCeilingLEDGridTexture();
    const marquee = new DottedPixelMarquee();
    const limeLCD = createLimeLCDCanvas();

    const pinkGlowTex = createGlowSpriteTexture(
      "#fff0f6",
      "rgba(255, 46, 147, 0.72)",
      "rgba(255, 46, 147, 0)"
    );
    const orangeGlowTex = createGlowSpriteTexture(
      "#fff7ed",
      "rgba(255, 122, 34, 0.75)",
      "rgba(255, 122, 34, 0)"
    );
    const greenGlowTex = createGlowSpriteTexture(
      "#ecfdf5",
      "rgba(16, 185, 129, 0.80)",
      "rgba(16, 185, 129, 0)"
    );
    const cyanGlowTex = createGlowSpriteTexture(
      "#ecfeff",
      "rgba(56, 189, 248, 0.72)",
      "rgba(56, 189, 248, 0)"
    );

    /* =========================================================================
     * LIGHTING & MOODY CYBERPUNK ARCADE SURROUNDINGS
     * ========================================================================= */
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x160e2e, 0.03);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xffe4e6, 0.06);
    rimLight.position.set(-3.2, 4.8, 4.4);
    scene.add(rimLight);

    const standbyExitLight = new THREE.DirectionalLight(0x3b82f6, 0.14);
    standbyExitLight.position.set(4.0, 2.2, -3.5);
    scene.add(standbyExitLight);

    const ceilingSpot = new THREE.SpotLight(
      0xf8fbff,
      0.0,
      8.0,
      Math.PI * 0.36,
      0.38,
      1.15
    );
    ceilingSpot.position.set(0, 2.84, 0.05);
    ceilingSpot.target.position.set(0, 0, 0);
    ceilingSpot.castShadow = true;
    ceilingSpot.shadow.mapSize.set(2048, 2048);
    ceilingSpot.shadow.camera.near = 0.35;
    ceilingSpot.shadow.camera.far = 4.6;
    ceilingSpot.shadow.bias = -0.0005;
    ceilingSpot.shadow.normalBias = 0.02;
    scene.add(ceilingSpot);
    scene.add(ceilingSpot.target);

    const interiorFill = new THREE.PointLight(0xfff1f2, 0.0, 4.2, 1.5);
    interiorFill.position.set(0.05, 1.55, 0.55);
    scene.add(interiorFill);

    // Soft interior showcase light focused on the prizes/gifts on the cabinet deck
    const giftShowcaseSpot = new THREE.SpotLight(
      0xfff8eb,
      0.0,
      4.4,
      Math.PI * 0.4,
      0.88,
      1.35
    );
    giftShowcaseSpot.position.set(0.16, 1.92, 0.32);
    giftShowcaseSpot.target.position.set(0.12, 0.08, -0.05);
    giftShowcaseSpot.castShadow = false;
    scene.add(giftShowcaseSpot);
    scene.add(giftShowcaseSpot.target);

    // Dark glossy reflective arcade floor
    const arcadeFloor = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshStandardMaterial({
        color: 0x090c18,
        roughness: 0.22,
        metalness: 0.48,
      })
    );
    arcadeFloor.rotation.x = -Math.PI / 2;
    arcadeFloor.position.y = -1.72;
    arcadeFloor.receiveShadow = true;
    scene.add(arcadeFloor);

    // Distant neighboring neon arcade machines & bokeh
    const backdropGroup = new THREE.Group();
    scene.add(backdropGroup);

    const bgArcadeCabs: Array<{
      screenMat: THREE.MeshBasicMaterial;
      neonMat: THREE.MeshBasicMaterial;
      spriteMat: THREE.SpriteMaterial;
      targetScreenColor: THREE.Color;
      targetNeonColor: THREE.Color;
      targetSpriteOpacity: number;
    }> = [];
    const bokehSprites: Array<{
      mat: THREE.SpriteMaterial;
      targetOpacity: number;
    }> = [];

    const addBackgroundArcadeCab = (
      x: number,
      z: number,
      rotY: number,
      neonColor: number,
      screenColor: number
    ) => {
      const g = new THREE.Group();
      g.position.set(x, -1.72, z);
      g.rotation.y = rotY;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 3.6, 1.3),
        new THREE.MeshStandardMaterial({
          color: 0x101426,
          roughness: 0.5,
          metalness: 0.4,
        })
      );
      body.position.y = 1.8;
      g.add(body);

      const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.25), screenMat);
      screen.position.set(0, 2.1, 0.66);
      g.add(screen);

      const neonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      [-0.76, 0.76].forEach((sx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), neonMat);
        rail.position.set(sx, 1.85, 0.64);
        g.add(rail);
      });

      const topper = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.08), neonMat);
      topper.position.set(0, 3.35, 0.64);
      g.add(topper);

      const spriteMat = new THREE.SpriteMaterial({
        map:
          neonColor === 0xff2e93
            ? pinkGlowTex
            : neonColor === 0x38bdf8
            ? cyanGlowTex
            : orangeGlowTex,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(spriteMat);
      sp.position.set(0, 2.3, 0.9);
      sp.scale.set(2.8, 2.8, 1);
      g.add(sp);

      bgArcadeCabs.push({
        screenMat,
        neonMat,
        spriteMat,
        targetScreenColor: new THREE.Color(screenColor),
        targetNeonColor: new THREE.Color(neonColor),
        targetSpriteOpacity: 0.34,
      });

      backdropGroup.add(g);
    };

    addBackgroundArcadeCab(4.8, -3.2, -0.55, 0xff2e93, 0x38bdf8);
    addBackgroundArcadeCab(6.4, -0.8, -1.05, 0xff7b29, 0xa855f7);
    addBackgroundArcadeCab(-5.4, -3.8, 0.48, 0x38bdf8, 0xf59e0b);
    addBackgroundArcadeCab(-3.2, -6.4, 0.12, 0xa855f7, 0xff2e93);
    addBackgroundArcadeCab(1.8, -6.8, -0.18, 0xff7b29, 0x22d3ee);

    const bokehPalette = [pinkGlowTex, cyanGlowTex, orangeGlowTex, greenGlowTex];
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 1.45 - Math.PI * 1.22;
      const dist = 6.2 + Math.random() * 5.5;
      const targetOpacity = 0.16 + Math.random() * 0.2;
      const bMat = new THREE.SpriteMaterial({
        map: bokehPalette[i % bokehPalette.length],
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(bMat);
      sp.position.set(
        Math.cos(ang) * dist,
        -0.4 + Math.random() * 4.2,
        Math.sin(ang) * dist - 1.2
      );
      const s = 0.8 + Math.random() * 1.6;
      sp.scale.set(s, s, 1);
      bokehSprites.push({ mat: bMat, targetOpacity });
      backdropGroup.add(sp);
    }

    /* =========================================================================
     * MAGICLAW CABINET ARCHITECTURE, NEON TUBES & PROTRUDING CONSOLE
     * ========================================================================= */
    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    const navyBodyMat = new THREE.MeshStandardMaterial({
      color: 0x151a2e,
      metalness: 0.58,
      roughness: 0.34,
    });

    const darkConsoleMat = new THREE.MeshStandardMaterial({
      color: 0x121629,
      metalness: 0.65,
      roughness: 0.28,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.96,
      roughness: 0.09,
    });

    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xd9e1ec,
      map: brushedTex.map,
      roughnessMap: brushedTex.roughnessMap,
      bumpMap: brushedTex.bumpMap,
      bumpScale: 0.004,
      metalness: 0.93,
      roughness: 0.24,
    });

    const postMetalMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.22,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff5ff,
      transparent: true,
      opacity: 0.11,
      roughness: 0.03,
      metalness: 0.06,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 2.5,
      depthWrite: false,
    });

    const acrylicChuteMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2f2ff,
      transparent: true,
      opacity: 0.26,
      roughness: 0.07,
      metalness: 0.04,
      clearcoat: 1.0,
      envMapIntensity: 1.8,
      depthWrite: false,
    });

    const goldCoinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      map: goldCoinTex.map,
      bumpMap: goldCoinTex.bumpMap,
      bumpScale: 0.015,
      metalness: 0.92,
      roughness: 0.22,
    });

    const makeNeonMat = (colHex: number, emHex: number) =>
      new THREE.MeshStandardMaterial({
        color: colHex,
        emissive: new THREE.Color(emHex),
        emissiveIntensity: 0.0,
        roughness: 0.18,
      });

    const leftCornerNeonMat = makeNeonMat(0xffedd5, 0xff6b2b);
    const rightCornerNeonMat = makeNeonMat(0xffe4f3, 0xff2e93);
    const pickupNeonMat = makeNeonMat(0xffedd5, 0xff7a1f);
    const marqueeBorderMat = makeNeonMat(0xffe4f3, 0xff2e93);
    const marqueeEarPinkMat = makeNeonMat(0xffe4f3, 0xff2e93);
    const marqueeEarCoralMat = makeNeonMat(0xffedd5, 0xff6b2b);
    const neonEmeraldMat = makeNeonMat(0xd1fae5, 0x10b981);
    const coinSlotGlowMat = makeNeonMat(0xe0f2fe, 0x38bdf8);

    // 7A. Lower Cabinet Base & Orange-Framed Dispenser Bay
    const lowerRight = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 1.72, 2.12),
      navyBodyMat
    );
    lowerRight.position.set(0.45, -0.86, 0);
    lowerRight.castShadow = true;
    lowerRight.receiveShadow = true;
    cabinetGroup.add(lowerRight);

    const lowerBackLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 1.72, 1.24),
      navyBodyMat
    );
    lowerBackLeft.position.set(-0.7, -0.86, -0.44);
    lowerBackLeft.castShadow = true;
    cabinetGroup.add(lowerBackLeft);

    const lowerOuterLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 1.72, 0.88),
      navyBodyMat
    );
    lowerOuterLeft.position.set(-1.11, -0.86, 0.62);
    cabinetGroup.add(lowerOuterLeft);

    const lowerChuteBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.36, 0.88),
      navyBodyMat
    );
    lowerChuteBase.position.set(-0.7, -1.54, 0.62);
    cabinetGroup.add(lowerChuteBase);

    const dispenserBayX = -0.18;
    const dispenserBayY = -1.04;

    const dispenserBacking = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.82, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x09060a, roughness: 0.85 })
    );
    dispenserBacking.position.set(dispenserBayX, dispenserBayY, 0.99);
    cabinetGroup.add(dispenserBacking);

    const pickupNeonTube = new THREE.Mesh(
      createRoundedRectTubeGeometry(1.08, 0.84, 0.14, 0.03, 84),
      pickupNeonMat
    );
    pickupNeonTube.position.set(dispenserBayX, dispenserBayY, 1.075);
    cabinetGroup.add(pickupNeonTube);

    const pickupBayLight = new THREE.PointLight(0xff7a1f, 0.0, 2.2, 1.8);
    pickupBayLight.position.set(dispenserBayX, dispenserBayY, 1.22);
    cabinetGroup.add(pickupBayLight);

    const chuteRamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.05, 0.92),
      brushedSteelMat
    );
    chuteRamp.position.set(CAB.chuteCenterX, -0.95, 0.58);
    chuteRamp.rotation.x = 0.35;
    cabinetGroup.add(chuteRamp);

    const leftCornerNeon = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.03, 1.54, 8, 14),
      leftCornerNeonMat
    );
    leftCornerNeon.position.set(-1.14, -0.88, 1.04);
    cabinetGroup.add(leftCornerNeon);

    const leftCornerLight = new THREE.PointLight(0xff6a2a, 0.0, 3.0, 1.7);
    leftCornerLight.position.set(-1.32, -0.85, 1.24);
    cabinetGroup.add(leftCornerLight);

    const rightCornerNeon = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.028, 1.54, 8, 14),
      rightCornerNeonMat
    );
    rightCornerNeon.position.set(1.14, -0.88, 1.04);
    cabinetGroup.add(rightCornerNeon);

    const rightCornerLight = new THREE.PointLight(0xff2e93, 0.0, 3.0, 1.7);
    rightCornerLight.position.set(1.34, -0.85, 1.24);
    cabinetGroup.add(rightCornerLight);

    // Front-Right Brushed Chrome Coin Acceptor Mechanism + Keyhole Lock
    const coinMechGroup = new THREE.Group();
    coinMechGroup.position.set(0.84, -0.46, 1.07);
    cabinetGroup.add(coinMechGroup);

    const coinPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.44, 0.045),
      brushedSteelMat
    );
    coinMechGroup.add(coinPlate);

    const coinBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.38, 0.055),
      postMetalMat
    );
    coinMechGroup.add(coinBezel);

    const coinSlotGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.045, 0.04),
      coinSlotGlowMat
    );
    coinSlotGlow.position.set(0, 0.11, 0.02);
    coinMechGroup.add(coinSlotGlow);

    const coinSlit = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.075, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x05070e })
    );
    coinSlit.position.set(0, 0.11, 0.034);
    coinMechGroup.add(coinSlit);

    const rejectBtn = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.05),
      chromeMat
    );
    rejectBtn.position.set(0, -0.02, 0.024);
    coinMechGroup.add(rejectBtn);

    const returnChute = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.09, 0.04),
      darkConsoleMat
    );
    returnChute.position.set(0, -0.13, 0.02);
    coinMechGroup.add(returnChute);

    const lockCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.03, 18),
      chromeMat
    );
    lockCyl.rotation.x = Math.PI / 2;
    lockCyl.position.set(0, -0.34, 0.01);
    coinMechGroup.add(lockCyl);

    const keyhole = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.03, 0.034),
      new THREE.MeshBasicMaterial({ color: 0x05070e })
    );
    keyhole.position.set(0, -0.34, 0.012);
    coinMechGroup.add(keyhole);

    const flyingCoin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.01, 20),
      goldCoinMat
    );
    flyingCoin.rotation.z = Math.PI / 2;
    flyingCoin.visible = false;
    cabinetGroup.add(flyingCoin);

    triggerCoinAnimRef.current = () => {
      gameRef.current.coinAnimTimer = 0.42;
      flyingCoin.visible = true;
    };

    // 7B. Interior Deck, Metallic Gray Chute Funnel & Clear Acrylic Partitions
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x1e2538,
      metalness: 0.52,
      roughness: 0.45,
    });

    const deckRight = new THREE.Mesh(
      new THREE.BoxGeometry(1.36, 0.06, 1.96),
      deckMat
    );
    deckRight.position.set(0.42, -0.03, 0);
    deckRight.receiveShadow = true;
    cabinetGroup.add(deckRight);

    const deckBackLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.06, 1.18),
      deckMat
    );
    deckBackLeft.position.set(-0.68, -0.03, -0.39);
    deckBackLeft.receiveShadow = true;
    cabinetGroup.add(deckBackLeft);

    const funnelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.78,
      roughness: 0.34,
    });
    const funnelBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.56, 0.03),
      funnelMat
    );
    funnelBack.position.set(CAB.chuteCenterX, -0.28, CAB.chuteZMin + 0.02);
    cabinetGroup.add(funnelBack);

    const funnelRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.56, 0.76),
      funnelMat
    );
    funnelRight.position.set(CAB.chuteXMax - 0.02, -0.28, CAB.chuteCenterZ);
    cabinetGroup.add(funnelRight);

    const funnelLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.56, 0.76),
      funnelMat
    );
    funnelLeft.position.set(CAB.xMin + 0.02, -0.28, CAB.chuteCenterZ);
    cabinetGroup.add(funnelLeft);

    const chuteWallRight = new THREE.Mesh(
      new THREE.BoxGeometry(
        CAB.chuteWallThick,
        CAB.chuteWallH,
        CAB.zMax - CAB.chuteZMin
      ),
      acrylicChuteMat
    );
    chuteWallRight.position.set(
      CAB.chuteXMax,
      CAB.chuteWallH / 2,
      (CAB.chuteZMin + CAB.zMax) / 2
    );
    cabinetGroup.add(chuteWallRight);

    const chuteWallBack = new THREE.Mesh(
      new THREE.BoxGeometry(
        CAB.chuteXMax - CAB.xMin,
        CAB.chuteWallH,
        CAB.chuteWallThick
      ),
      acrylicChuteMat
    );
    chuteWallBack.position.set(
      (CAB.xMin + CAB.chuteXMax) / 2,
      CAB.chuteWallH / 2,
      CAB.chuteZMin
    );
    cabinetGroup.add(chuteWallBack);

    const edgeMat = new THREE.MeshPhysicalMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.62,
      roughness: 0.06,
      metalness: 0.25,
      clearcoat: 1.0,
    });
    const edgeRight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, CAB.zMax - CAB.chuteZMin, 12),
      edgeMat
    );
    edgeRight.rotation.x = Math.PI / 2;
    edgeRight.position.set(
      CAB.chuteXMax,
      CAB.chuteWallH,
      (CAB.chuteZMin + CAB.zMax) / 2
    );
    cabinetGroup.add(edgeRight);

    const edgeBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, CAB.chuteXMax - CAB.xMin, 12),
      edgeMat
    );
    edgeBack.rotation.z = Math.PI / 2;
    edgeBack.position.set(
      (CAB.xMin + CAB.chuteXMax) / 2,
      CAB.chuteWallH,
      CAB.chuteZMin
    );
    cabinetGroup.add(edgeBack);

    // 7C. Thin Metallic Corner Posts, Tempered Glass & Overhead LED Grid
    const postCoords: Array<[number, number]> = [
      [-1.12, -1.0],
      [1.12, -1.0],
      [-1.12, 1.0],
      [1.12, 1.0],
    ];
    postCoords.forEach(([px, pz]) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 2.86, 0.085),
        postMetalMat
      );
      post.position.set(px, 1.43, pz);
      post.castShadow = true;
      cabinetGroup.add(post);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 2.86, 0.025),
        chromeMat
      );
      trim.position.set(
        px + Math.sign(px) * 0.036,
        1.43,
        pz + Math.sign(pz) * 0.036
      );
      cabinetGroup.add(trim);
    });

    const midCollar = new THREE.Mesh(
      new THREE.BoxGeometry(2.36, 0.08, 2.12),
      postMetalMat
    );
    midCollar.position.set(0, -0.02, 0);
    cabinetGroup.add(midCollar);

    const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 2.82), glassMat);
    glassFront.position.set(0, 1.43, 1.0);
    cabinetGroup.add(glassFront);

    const glassLeft = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 2.82), glassMat);
    glassLeft.rotation.y = -Math.PI / 2;
    glassLeft.position.set(-1.12, 1.43, 0);
    cabinetGroup.add(glassLeft);

    const glassRight = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 2.82), glassMat);
    glassRight.rotation.y = Math.PI / 2;
    glassRight.position.set(1.12, 1.43, 0);
    cabinetGroup.add(glassRight);

    const glassBack = new THREE.Mesh(
      new THREE.PlaneGeometry(2.18, 2.82),
      new THREE.MeshPhysicalMaterial({
        color: 0x0c1222,
        transparent: true,
        opacity: 0.42,
        roughness: 0.06,
        metalness: 0.15,
        clearcoat: 1.0,
        depthWrite: false,
      })
    );
    glassBack.position.set(0, 1.43, -1.0);
    cabinetGroup.add(glassBack);

    // 7D. Top Canopy, Ceiling LED Grid Panel & "MAGICLAW" Marquee (hinged lid for rewards zoom)
    const canopyLidGroup = new THREE.Group();
    canopyLidGroup.position.set(0, 2.86, -1.07);
    cabinetGroup.add(canopyLidGroup);

    const canopyLidInner = new THREE.Group();
    canopyLidInner.position.set(0, -2.86, 1.07);
    canopyLidGroup.add(canopyLidInner);

    const canopyBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.36, 0.72, 2.14),
      navyBodyMat
    );
    canopyBox.position.set(0, 3.22, 0);
    canopyBox.castShadow = true;
    canopyLidInner.add(canopyBox);

    const ceilingLEDMat = new THREE.MeshBasicMaterial({
      map: ceilingLEDTex,
      color: 0x05070e,
    });
    const ceilingLEDMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 0.92),
      ceilingLEDMat
    );
    ceilingLEDMesh.rotation.x = Math.PI / 2;
    ceilingLEDMesh.position.set(0, 2.855, -0.02);
    canopyLidInner.add(ceilingLEDMesh);

    const ceilingFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.76, 0.03, 1.0),
      postMetalMat
    );
    ceilingFrame.position.set(0, 2.868, -0.02);
    canopyLidInner.add(ceilingFrame);

    const marqueeGroup = new THREE.Group();
    marqueeGroup.position.set(0, 3.2, 1.07);
    canopyLidInner.add(marqueeGroup);

    const marqueeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x10121c),
      map: marquee.texture,
      emissiveMap: marquee.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.0,
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.05,
    });
    const marqueeDisplayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.14, 0.56),
      marqueeMat
    );
    marqueeDisplayMesh.position.z = 0.02;
    marqueeGroup.add(marqueeDisplayMesh);

    const marqueeBorderTube = new THREE.Mesh(
      createRoundedRectTubeGeometry(2.24, 0.64, 0.11, 0.036, 96),
      marqueeBorderMat
    );
    marqueeBorderTube.position.z = 0.042;
    marqueeGroup.add(marqueeBorderTube);

    [-1, 1].forEach((side) => {
      const earMat = side < 0 ? marqueeEarPinkMat : marqueeEarCoralMat;
      const earHousing = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.72, 0.24),
        navyBodyMat
      );
      earHousing.position.set(side * 1.22, 0.0, -0.04);
      marqueeGroup.add(earHousing);

      const earCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.15, 0.34, 0.04),
        new THREE.Vector3(side * 1.27, 0.24, 0.05),
        new THREE.Vector3(side * 1.29, 0.0, 0.05),
        new THREE.Vector3(side * 1.27, -0.24, 0.05),
        new THREE.Vector3(side * 1.15, -0.34, 0.04),
      ]);
      const earNeon = new THREE.Mesh(
        new THREE.TubeGeometry(earCurve, 32, 0.042, 12, false),
        earMat
      );
      marqueeGroup.add(earNeon);
    });

    const marqueeLightL = new THREE.PointLight(0xff2e93, 0.0, 4.0, 1.7);
    marqueeLightL.position.set(-0.95, 3.22, 1.48);
    canopyLidInner.add(marqueeLightL);

    const marqueeLightR = new THREE.PointLight(0xff7b29, 0.0, 4.0, 1.7);
    marqueeLightR.position.set(0.95, 3.22, 1.48);
    canopyLidInner.add(marqueeLightR);

    const marqueeHaloMat = new THREE.SpriteMaterial({
      map: pinkGlowTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const marqueeHalo = new THREE.Sprite(marqueeHaloMat);
    marqueeHalo.position.set(0, 3.2, 1.25);
    marqueeHalo.scale.set(3.4, 1.35, 1);
    canopyLidInner.add(marqueeHalo);

    // 7E. Protruding Control Panel Console
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(-0.08, -0.22, 1.28);
    cabinetGroup.add(consoleGroup);

    const consoleDeck = new THREE.Mesh(
      createRoundedConsoleMesh(1.42, 0.56, 0.22, 0.14),
      darkConsoleMat
    );
    consoleDeck.position.y = 0.08;
    consoleDeck.castShadow = true;
    consoleDeck.receiveShadow = true;
    consoleGroup.add(consoleDeck);

    const consoleTopPlate = new THREE.Mesh(
      createRoundedConsoleMesh(1.3, 0.44, 0.02, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x1b233c,
        metalness: 0.72,
        roughness: 0.28,
      })
    );
    consoleTopPlate.position.y = 0.125;
    consoleGroup.add(consoleTopPlate);

    // Gold Coin-Medallion Top Joystick
    const joyMount = new THREE.Group();
    joyMount.position.set(-0.42, 0.135, 0.02);
    consoleGroup.add(joyMount);

    const joyBasePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.132, 0.032, 28),
      new THREE.MeshStandardMaterial({
        color: 0x0b0f1c,
        roughness: 0.32,
        metalness: 0.5,
      })
    );
    joyMount.add(joyBasePlate);

    const joyPivot = new THREE.Group();
    joyPivot.position.y = 0.015;
    joyMount.add(joyPivot);

    const joyShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.026, 0.13, 18),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.28,
        metalness: 0.65,
      })
    );
    joyShaft.position.y = 0.065;
    joyPivot.add(joyShaft);

    const joyMedallion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.085, 0.032, 32),
      goldCoinMat
    );
    joyMedallion.position.y = 0.14;
    joyMedallion.rotation.x = 0.16;
    joyMedallion.castShadow = true;
    joyPivot.add(joyMedallion);

    const joyRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.086, 0.012, 10, 32),
      goldCoinMat
    );
    joyRim.rotation.x = Math.PI / 2 + 0.16;
    joyRim.position.y = 0.14;
    joyPivot.add(joyRim);

    // Center Recessed Lime-Green Backlit Mini LCD Screen
    const lcdBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.025, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x090d18, roughness: 0.4 })
    );
    lcdBezel.position.set(-0.02, 0.13, 0.01);
    consoleGroup.add(lcdBezel);

    const lcdScreenMat = new THREE.MeshStandardMaterial({
      map: limeLCD.tex,
      emissiveMap: limeLCD.tex,
      emissive: new THREE.Color(0xa3e635),
      emissiveIntensity: 0.0,
      color: new THREE.Color(0x141a12),
      roughness: 0.18,
    });
    const lcdScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), lcdScreenMat);
    lcdScreen.rotation.x = -Math.PI / 2;
    lcdScreen.position.set(-0.02, 0.144, 0.01);
    consoleGroup.add(lcdScreen);

    // Right Glowing Emerald-Green Illuminated Push Button w/ Gold Coin-Cap Center
    const dropBtnGroup = new THREE.Group();
    dropBtnGroup.position.set(0.41, 0.135, 0.01);
    consoleGroup.add(dropBtnGroup);

    const emeraldGlowCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.145, 0.068, 32),
      neonEmeraldMat
    );
    emeraldGlowCollar.position.y = 0.025;
    dropBtnGroup.add(emeraldGlowCollar);

    const dropPlunger = new THREE.Group();
    dropBtnGroup.add(dropPlunger);

    const emeraldCapRingMat = new THREE.MeshPhysicalMaterial({
      color: 0x6ee7b7,
      emissive: 0x10b981,
      emissiveIntensity: 0.0,
      roughness: 0.12,
      clearcoat: 1.0,
    });
    const emeraldCapRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.112, 0.12, 0.055, 32),
      emeraldCapRingMat
    );
    emeraldCapRing.position.y = 0.052;
    dropPlunger.add(emeraldCapRing);

    const emeraldGoldCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.09, 0.022, 32),
      goldCoinMat
    );
    emeraldGoldCap.position.y = 0.084;
    dropPlunger.add(emeraldGoldCap);

    const emeraldBtnLight = new THREE.PointLight(0x10b981, 0.0, 1.9, 1.8);
    emeraldBtnLight.position.set(0.41, 0.28, 0.04);
    consoleGroup.add(emeraldBtnLight);

    const emeraldHaloMat = new THREE.SpriteMaterial({
      map: greenGlowTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const emeraldHalo = new THREE.Sprite(emeraldHaloMat);
    emeraldHalo.position.set(0.41, 0.2, 0.03);
    emeraldHalo.scale.set(0.56, 0.42, 1);
    consoleGroup.add(emeraldHalo);

    /* =========================================================================
     * 8. GANTRY, DYNAMIC 3D COILED SPIRAL BLACK CABLE & 3-PRONG CHROME CLAW
     * ========================================================================= */
    const gantryGroup = new THREE.Group();
    cabinetGroup.add(gantryGroup);

    [-1.0, 1.0].forEach((rx) => {
      const zRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 1.94, 16),
        chromeMat
      );
      zRail.rotation.x = Math.PI / 2;
      zRail.position.set(rx, CAB.gantryY, 0);
      gantryGroup.add(zRail);
    });

    const zBridge = new THREE.Group();
    zBridge.position.set(0, CAB.gantryY, 0);
    gantryGroup.add(zBridge);

    [-1.0, 1.0].forEach((ex) => {
      const endBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.08, 0.18),
        postMetalMat
      );
      endBlock.position.set(ex, 0, 0);
      zBridge.add(endBlock);
    });

    [-0.055, 0.055].forEach((rz) => {
      const xRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 2.0, 16),
        chromeMat
      );
      xRail.rotation.z = Math.PI / 2;
      xRail.position.set(0, 0, rz);
      zBridge.add(xRail);
    });

    const xCarriage = new THREE.Group();
    zBridge.add(xCarriage);

    const carriageBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.2, 0.28),
      brushedSteelMat
    );
    carriageBlock.position.y = -0.02;
    carriageBlock.castShadow = true;
    xCarriage.add(carriageBlock);

    [-0.12, 0.12].forEach((bx) => {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.295, 10),
        chromeMat
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, -0.02, 0);
      xCarriage.add(bolt);
    });

    const pendulumPivot = new THREE.Group();
    pendulumPivot.position.set(0, -0.12, 0);
    xCarriage.add(pendulumPivot);

    const centerShaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 1.0, 12),
      chromeMat
    );
    centerShaftMesh.castShadow = true;
    pendulumPivot.add(centerShaftMesh);

    // Dynamic 3D Helical Black Coiled Spiral Power Cable
    const COIL_TURNS = 19;
    const COIL_STEPS = 228;
    const COIL_RADIAL = 6;
    const COIL_WIRE_R = 0.0085;
    const COIL_HELIX_R = 0.024;

    const coilVertexCount = (COIL_STEPS + 1) * (COIL_RADIAL + 1);
    const coilPositions = new Float32Array(coilVertexCount * 3);
    const coilIndices: number[] = [];
    for (let i = 0; i < COIL_STEPS; i++) {
      for (let j = 0; j < COIL_RADIAL; j++) {
        const a = i * (COIL_RADIAL + 1) + j;
        const b = (i + 1) * (COIL_RADIAL + 1) + j;
        const c = (i + 1) * (COIL_RADIAL + 1) + (j + 1);
        const d = i * (COIL_RADIAL + 1) + (j + 1);
        coilIndices.push(a, b, d, b, c, d);
      }
    }
    const coilGeo = new THREE.BufferGeometry();
    coilGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(coilPositions, 3)
    );
    coilGeo.setIndex(coilIndices);

    const coilMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.42,
      metalness: 0.25,
    });
    const coilMesh = new THREE.Mesh(coilGeo, coilMat);
    coilMesh.castShadow = true;
    pendulumPivot.add(coilMesh);

    const _pCur = new THREE.Vector3();
    const _pNext = new THREE.Vector3();
    const _tang = new THREE.Vector3();
    const _norm = new THREE.Vector3();
    const _binorm = new THREE.Vector3();
    const _upRef = new THREE.Vector3(0, 0, 1);

    const updateCoiledCable = (cableLen: number) => {
      const startX = -0.115;
      const startY = 0.0;
      const endX = -0.055;
      const endY = -cableLen - 0.14;
      const bowX = -0.032 - Math.min(0.03, cableLen * 0.012);

      const getCenterPt = (u: number, out: THREE.Vector3) => {
        const inv = 1 - u;
        const cx =
          inv * inv * startX + 2 * inv * u * (startX + bowX) + u * u * endX;
        const cy = THREE.MathUtils.lerp(startY, endY, u);
        const env =
          Math.sin(Math.min(1, u * 12) * Math.PI * 0.5) *
          Math.sin(Math.min(1, (1 - u) * 12) * Math.PI * 0.5);
        const theta = u * COIL_TURNS * Math.PI * 2;
        const hr = COIL_HELIX_R * env;
        out.set(cx + Math.cos(theta) * hr, cy, Math.sin(theta) * hr);
      };

      let ptr = 0;
      for (let i = 0; i <= COIL_STEPS; i++) {
        const u = i / COIL_STEPS;
        getCenterPt(u, _pCur);
        getCenterPt(Math.min(1, u + 0.002), _pNext);
        _tang.subVectors(_pNext, _pCur);
        if (_tang.lengthSq() < 1e-10) _tang.set(0, -1, 0);
        else _tang.normalize();

        _norm.crossVectors(_tang, _upRef);
        if (_norm.lengthSq() < 1e-6) _norm.set(1, 0, 0);
        else _norm.normalize();
        _binorm.crossVectors(_tang, _norm).normalize();

        for (let j = 0; j <= COIL_RADIAL; j++) {
          const phi = (j / COIL_RADIAL) * Math.PI * 2;
          const cosP = Math.cos(phi) * COIL_WIRE_R;
          const sinP = Math.sin(phi) * COIL_WIRE_R;
          coilPositions[ptr++] = _pCur.x + _norm.x * cosP + _binorm.x * sinP;
          coilPositions[ptr++] = _pCur.y + _norm.y * cosP + _binorm.y * sinP;
          coilPositions[ptr++] = _pCur.z + _norm.z * cosP + _binorm.z * sinP;
        }
      }
      coilGeo.attributes.position.needsUpdate = true;
      coilGeo.computeVertexNormals();
    };

    // Articulated Stepped Chrome Solenoid & 3 Curved Chrome Prongs
    const clawAssembly = new THREE.Group();
    pendulumPivot.add(clawAssembly);

    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.044, 0.055, 20),
      chromeMat
    );
    topCap.position.y = 0.025;
    clawAssembly.add(topCap);

    const upperBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.14, 24),
      brushedSteelMat
    );
    upperBarrel.position.y = -0.07;
    upperBarrel.castShadow = true;
    clawAssembly.add(upperBarrel);

    const midFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.028, 24),
      chromeMat
    );
    midFlange.position.y = -0.145;
    clawAssembly.add(midFlange);

    const lowerHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.042, 0.1, 22),
      brushedSteelMat
    );
    lowerHub.position.y = -0.205;
    lowerHub.castShadow = true;
    clawAssembly.add(lowerHub);

    const actuatorRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.036, 22),
      chromeMat
    );
    actuatorRing.position.y = -0.255;
    clawAssembly.add(actuatorRing);

    const centerTipPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.012, 0.08, 14),
      chromeMat
    );
    centerTipPin.position.y = -0.295;
    clawAssembly.add(centerTipPin);

    const prongCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 0.0, 0),
      new THREE.Vector3(0.075, -0.068, 0),
      new THREE.Vector3(0.155, -0.175, 0),
      new THREE.Vector3(0.152, -0.29, 0),
      new THREE.Vector3(0.082, -0.378, 0),
    ]);
    const prongGeo = new THREE.TubeGeometry(prongCurve, 24, 0.0125, 10, false);
    const linkStrutGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.145, 10);
    const rubberTipMat = new THREE.MeshStandardMaterial({
      color: 0x171a21,
      roughness: 0.85,
      metalness: 0.08,
    });

    const prongPivots: THREE.Group[] = [];
    const linkageStruts: THREE.Mesh[] = [];

    for (let i = 0; i < 3; i++) {
      const radialAngle = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const mount = new THREE.Group();
      mount.rotation.y = radialAngle;
      mount.position.y = -0.24;
      clawAssembly.add(mount);

      const hingePin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.036, 12),
        chromeMat
      );
      hingePin.rotation.x = Math.PI / 2;
      hingePin.position.set(0.046, 0, 0);
      mount.add(hingePin);

      const pivot = new THREE.Group();
      pivot.position.set(0.046, 0, 0);
      mount.add(pivot);

      const curvedProng = new THREE.Mesh(prongGeo, chromeMat);
      curvedProng.castShadow = true;
      pivot.add(curvedProng);

      const tipCap = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0155, 0.028, 6, 10),
        rubberTipMat
      );
      tipCap.position.set(0.086, -0.372, 0);
      tipCap.rotation.z = -0.62;
      pivot.add(tipCap);

      const strut = new THREE.Mesh(linkStrutGeo, brushedSteelMat);
      strut.position.set(0.072, 0.06, 0);
      strut.rotation.z = 0.42;
      mount.add(strut);

      prongPivots.push(pivot);
      linkageStruts.push(strut);
    }

    const projectionGroup = new THREE.Group();
    projectionGroup.visible = false;
    cabinetGroup.add(projectionGroup);

    const clawTargetRingMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const clawTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.12, 36),
      clawTargetRingMat
    );
    clawTargetRing.rotation.x = -Math.PI / 2;
    projectionGroup.add(clawTargetRing);

    const clawTargetDiscMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const clawTargetDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 36),
      clawTargetDiscMat
    );
    clawTargetDisc.rotation.x = -Math.PI / 2;
    projectionGroup.add(clawTargetDisc);

    const clawTargetCenterMat = new THREE.MeshBasicMaterial({
      color: 0xff5577,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const clawTargetCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 24),
      clawTargetCenterMat
    );
    clawTargetCenter.rotation.x = -Math.PI / 2;
    projectionGroup.add(clawTargetCenter);

    const projectionBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const projectionBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 1, 10),
      projectionBeamMat
    );
    projectionGroup.add(projectionBeam);

    /* =========================================================================
     * 9. SNACK BOX RIGID-BODY PHYSICS ENGINE (REAL ON-CHAIN PRIZE SLOTS)
     * ========================================================================= */
    const boxesGroup = new THREE.Group();
    cabinetGroup.add(boxesGroup);

    const disposePrizeBody = (b: SnackBoxBody) => {
      boxesGroup.remove(b.mesh);
      b.mesh.geometry.dispose();
      if (Array.isArray(b.mesh.material)) {
        b.mesh.material.forEach((m) => m.dispose());
      } else if (b.mesh.material) {
        b.mesh.material.dispose();
      }
      if (b.ringMesh) {
        boxesGroup.remove(b.ringMesh);
        b.ringMesh.geometry.dispose();
        (b.ringMesh.material as THREE.Material).dispose();
      }
    };

    let boxUidCounter = 1;

    const _rotMat = new THREE.Matrix3();
    const _rotMat4 = new THREE.Matrix4();
    const getBoxWorldHalfExtents = (b: SnackBoxBody, out: THREE.Vector3) => {
      _rotMat.setFromMatrix4(_rotMat4.makeRotationFromQuaternion(b.quat));
      const e = _rotMat.elements;
      out.x = Math.abs(e[0]) * b.hx + Math.abs(e[3]) * b.hy + Math.abs(e[6]) * b.hz;
      out.y = Math.abs(e[1]) * b.hx + Math.abs(e[4]) * b.hy + Math.abs(e[7]) * b.hz;
      out.z = Math.abs(e[2]) * b.hx + Math.abs(e[5]) * b.hy + Math.abs(e[8]) * b.hz;
    };

    const _ext = new THREE.Vector3();
    const _closest = new THREE.Vector3();
    const _normal = new THREE.Vector3();
    const _delta = new THREE.Vector3();
    const _relVel = new THREE.Vector3();
    const _spinQ = new THREE.Quaternion();
    const _axis = new THREE.Vector3();

    const collideBoxWithStaticAABB = (
      b: SnackBoxBody,
      minX: number,
      maxX: number,
      minY: number,
      maxY: number,
      minZ: number,
      maxZ: number,
      restitution = 0.16
    ) => {
      const r = b.radius * 0.92;
      const p = b.pos;
      _closest.set(
        Math.max(minX, Math.min(p.x, maxX)),
        Math.max(minY, Math.min(p.y, maxY)),
        Math.max(minZ, Math.min(p.z, maxZ))
      );
      _normal.subVectors(p, _closest);
      const distSq = _normal.lengthSq();
      if (distSq < r * r) {
        let dist = Math.sqrt(distSq);
        if (dist < 1e-5) {
          _normal.set(0, 1, 0);
          dist = 1e-5;
        } else {
          _normal.divideScalar(dist);
        }

        p.addScaledVector(_normal, r - dist);
        const vn = b.vel.dot(_normal);
        if (vn < 0) {
          b.vel.addScaledVector(_normal, -(1 + restitution) * vn);
          b.vel.x *= 0.88;
          b.vel.z *= 0.88;
        }
      }
    };

    /* =========================================================================
     * 10. 3D CONFETTI CELEBRATION SYSTEM
     * ========================================================================= */
    const confettiParticles: Array<{
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      rot: THREE.Vector3;
      life: number;
    }> = [];
    const confettiGeo = new THREE.PlaneGeometry(0.055, 0.032);
    const confettiPalette = [
      0xff2e93, 0xff7a1f, 0xfacc15, 0x34d399, 0x38bdf8, 0xffffff,
    ];

    const spawnWinConfetti = () => {
      for (let i = 0; i < 90; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: confettiPalette[i % confettiPalette.length],
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(confettiGeo, mat);
        mesh.position.set(
          (Math.random() - 0.5) * 1.9,
          2.5 + Math.random() * 0.45,
          (Math.random() - 0.5) * 1.6
        );
        cabinetGroup.add(mesh);
        confettiParticles.push({
          mesh,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            -0.5 - Math.random() * 1.0,
            (Math.random() - 0.5) * 1.5
          ),
          rot: new THREE.Vector3(
            Math.random() * 8,
            Math.random() * 8,
            Math.random() * 8
          ),
          life: 3.2 + Math.random() * 1.4,
        });
      }
    };

    const updateConfetti = (dt: number) => {
      for (let i = confettiParticles.length - 1; i >= 0; i--) {
        const c = confettiParticles[i];
        c.life -= dt;
        c.vel.y -= 0.85 * dt;
        c.vel.x *= 0.985;
        c.vel.z *= 0.985;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.rot.x * dt;
        c.mesh.rotation.y += c.rot.y * dt;
        c.mesh.rotation.z += c.rot.z * dt;
        if (c.life <= 0 || c.mesh.position.y < -1.5) {
          cabinetGroup.remove(c.mesh);
          (c.mesh.material as THREE.Material).dispose();
          confettiParticles.splice(i, 1);
        }
      }
    };

    const emitWinPrize = (box: SnackBoxBody) => {
      if (box.winEmitted) return;
      if (!propsRef.current.isOnchainActive) return;
      box.winEmitted = true;
      box.won = true;
      box.removeTimer = 0;
      if (box.ringMesh) box.ringMesh.visible = false;
      const g = gameRef.current;
      g.wonThisTurn = true;
      g.celebrationTimer = 4.6;

      arcadeAudio.playWinJingle();
      spawnWinConfetti();

      const vrf = propsRef.current.onchainVrfResult;
      const resolvedSlotId =
        propsRef.current.isOnchainActive && vrf ? vrf.targetSlot : box.slotId;
      const onchainSlot = propsRef.current.slots?.find(
        (s) => s.slotId === resolvedSlotId
      );
      const livePrice = onchainSlot
        ? Number(onchainSlot.fallbackBuybackUsdc) / 1_000_000
        : getLivePythPrice(box.symbol).priceUsd;
      const buyback = onchainSlot
        ? Number(onchainSlot.fallbackBuybackUsdc) / 1_000_000
        : computeLiveBuyback(box.tier, box.symbol);
      const amountNum = onchainSlot
        ? Number(onchainSlot.prizeAmount) / Math.pow(10, onchainSlot.prizeDecimals)
        : 1;
      const amountStr = amountNum.toLocaleString("en-US", {
        maximumFractionDigits: 4,
      });
      const isNft = Boolean(
        onchainSlot &&
          onchainSlot.prizeDecimals === 0 &&
          onchainSlot.prizeAmount === BigInt(1)
      );
      const baseBps =
        [6500, 3200, 1200, 400][onchainSlot?.tier ?? box.tier] || 6500;
      const isBull = vrf?.isBullseye ?? false;

      propsRef.current.onWinPrize?.({
        slotId: resolvedSlotId,
        tier: onchainSlot?.tier ?? box.tier,
        tierName:
          ["Common", "Rare", "Epic", "Grail"][onchainSlot?.tier ?? box.tier] ||
          "Common",
        name: onchainSlot?.name || box.name,
        symbol: onchainSlot?.symbol || box.symbol,
        icon: onchainSlot?.icon || box.icon,
        image: onchainSlot?.image,
        amount: amountStr,
        isNft,
        mint: onchainSlot
          ? onchainSlot.prizeMint.toBase58()
          : "SolanaVaultCustody111111111111111111111",
        isBullseye: isBull,
        vrfRoll: vrf?.roll ?? Math.floor(Math.random() * 3000),
        effectiveOddsBps: isBull ? Math.min(9900, baseBps + 300) : baseBps,
        livePriceUsd: livePrice,
        sellBackUsdc: buyback,
      });
    };

    const stepPhysics = (dt: number, silent = false) => {
      const subSteps = 4;
      const h = dt / subSteps;
      const gravity = -9.8;
      const boxes = boxesRef.current;

      for (let step = 0; step < subSteps; step++) {
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (b.grabbed) continue;
          if (b.won && b.removeTimer > 2.2) continue;

          b.vel.y += gravity * h;
          const damp = Math.pow(0.982, h * 60);
          b.vel.multiplyScalar(damp);
          b.angVel.multiplyScalar(Math.pow(0.9, h * 60));

          b.pos.addScaledVector(b.vel, h);

          const angSpeed = b.angVel.length();
          if (angSpeed > 0.002) {
            _axis.copy(b.angVel).divideScalar(angSpeed);
            _spinQ.setFromAxisAngle(_axis, Math.min(angSpeed * h, 0.34));
            b.quat.premultiply(_spinQ).normalize();
          }

          getBoxWorldHalfExtents(b, _ext);

          const inChute = isInsideChuteXZ(b.pos.x, b.pos.z);
          if (!inChute) {
            if (b.pos.y < CAB.floorY + _ext.y) {
              const impact = -b.vel.y;
              b.pos.y = CAB.floorY + _ext.y;
              if (b.vel.y < 0) {
                b.vel.y = -b.vel.y * 0.14;
                if (impact > 1.1 && !silent)
                  arcadeAudio.playBoxClack(impact * 0.25);
              }
              b.vel.x *= 0.82;
              b.vel.z *= 0.82;
              b.angVel.multiplyScalar(0.84);
            }
          } else {
            const rampY = -0.95 + (b.pos.z - 0.58) * -0.36 + 0.03;
            if (b.pos.y < rampY + _ext.y) {
              b.pos.y = rampY + _ext.y;
              if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.12;
              b.vel.z += 2.8 * h;
              b.vel.x *= 0.86;
            }
            if (
              !b.won &&
              b.pos.y < -0.28 &&
              !silent &&
              propsRef.current.isOnchainActive &&
              propsRef.current.onchainVrfResult?.outcome === "Won"
            ) {
              emitWinPrize(b);
            }
          }

          if (b.pos.x < CAB.xMin + _ext.x) {
            b.pos.x = CAB.xMin + _ext.x;
            b.vel.x = Math.abs(b.vel.x) * 0.22;
          }
          if (b.pos.x > CAB.xMax - _ext.x) {
            b.pos.x = CAB.xMax - _ext.x;
            b.vel.x = -Math.abs(b.vel.x) * 0.22;
          }
          if (b.pos.z < CAB.zMin + _ext.z) {
            b.pos.z = CAB.zMin + _ext.z;
            b.vel.z = Math.abs(b.vel.z) * 0.22;
          }
          if (b.pos.z > CAB.zMax - _ext.z) {
            b.pos.z = CAB.zMax - _ext.z;
            b.vel.z = -Math.abs(b.vel.z) * 0.22;
          }

          const halfT = CAB.chuteWallThick * 0.5;
          collideBoxWithStaticAABB(
            b,
            CAB.chuteXMax - halfT,
            CAB.chuteXMax + halfT,
            -1.4,
            CAB.chuteWallH + 0.02,
            CAB.chuteZMin - halfT,
            CAB.zMax
          );
          collideBoxWithStaticAABB(
            b,
            CAB.xMin,
            CAB.chuteXMax + halfT,
            -1.4,
            CAB.chuteWallH + 0.02,
            CAB.chuteZMin - halfT,
            CAB.chuteZMin + halfT
          );

          if (b.vel.lengthSq() < 0.00025 && b.pos.y <= _ext.y + 0.012 && !inChute) {
            b.vel.set(0, 0, 0);
          }

          if (
            !b.won &&
            !inChute &&
            b !== gameRef.current.lastReleasedBox &&
            b.pos.y <= _ext.y + 0.04
          ) {
            const springAlpha = Math.min(1, h * 3.5);
            b.pos.x += (b.anchorX - b.pos.x) * springAlpha;
            b.pos.z += (b.anchorZ - b.pos.z) * springAlpha;
          }
        }

        // Box-to-Box collision solver
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          if (a.grabbed) continue;
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j];
            if (b.grabbed) continue;

            _delta.subVectors(b.pos, a.pos);
            const minDist = (a.radius + b.radius) * 0.88;
            const distSq = _delta.lengthSq();
            if (distSq < minDist * minDist && distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              _normal.copy(_delta).divideScalar(dist);
              const overlap = minDist - dist;

              const invA = 1 / a.mass;
              const invB = 1 / b.mass;
              const invSum = invA + invB;

              const corr = (overlap * 0.76) / invSum;
              a.pos.addScaledVector(_normal, -corr * invA);
              b.pos.addScaledVector(_normal, corr * invB);

              _relVel.subVectors(b.vel, a.vel);
              const vn = _relVel.dot(_normal);
              if (vn < 0) {
                const jImp = (-(1 + 0.14) * vn) / invSum;
                a.vel.addScaledVector(_normal, -jImp * invA);
                b.vel.addScaledVector(_normal, jImp * invB);

                const tx = _relVel.x - vn * _normal.x;
                const tz = _relVel.z - vn * _normal.z;
                a.vel.x += tx * 0.1;
                a.vel.z += tz * 0.1;
                b.vel.x -= tx * 0.1;
                b.vel.z -= tz * 0.1;

                a.angVel.z += _normal.x * vn * 0.75;
                a.angVel.x -= _normal.z * vn * 0.75;
                b.angVel.z -= _normal.x * vn * 0.75;
                b.angVel.x += _normal.z * vn * 0.75;
              }
            }
          }
        }
      }

      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        if (b.won) {
          b.removeTimer += dt;
          if (b.removeTimer > 2.4) {
            disposePrizeBody(b);
            boxes.splice(i, 1);
            continue;
          }
        }
        b.mesh.position.copy(b.pos);
        b.mesh.quaternion.copy(b.quat);
        if (b.ringMesh) {
          b.ringMesh.visible = !b.won && !b.grabbed && !isInsideChuteXZ(b.pos.x, b.pos.z);
          b.ringMesh.position.set(b.anchorX, 0.005, b.anchorZ);
        }
      }
    };

    const spawnSnackBoxes = (slotList?: PrizeSlot[]) => {
      boxesRef.current.forEach(disposePrizeBody);
      boxesRef.current = [];

      if (!slotList || slotList.length === 0) {
        return;
      }

      const stockedSlots = slotList.filter((s) => s.inStock && !s.reserved);
      if (stockedSlots.length === 0) {
        return;
      }

      const created: SnackBoxBody[] = [];
      stockedSlots.forEach((slot) => {
        const spec = getFlavorSpecForSlot(slot);
        const [bw, bh, bd] = spec.dims;
        const geo = new THREE.BoxGeometry(bw, bh, bd);
        const mats = createPrizeBoxMaterials(slot, spec);
        const mesh = new THREE.Mesh(geo, mats);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        boxesGroup.add(mesh);

        const sx = THREE.MathUtils.clamp(
          (slot.x / 1000) * (CAB.gantryXMax - CAB.gantryXMin) + CAB.gantryXMin,
          CAB.xMin + 0.14,
          CAB.xMax - 0.14
        );
        let sz = THREE.MathUtils.clamp(
          (slot.z / 1000) * (CAB.gantryZMax - CAB.gantryZMin) + CAB.gantryZMin,
          CAB.zMin + 0.14,
          CAB.zMax - 0.14
        );
        if (sx < CAB.chuteXMax + 0.14 && sz > CAB.chuteZMin - 0.14) {
          sz = CAB.chuteZMin - 0.16;
        }
        const sy = CAB.floorY + bh / 2;

        const ringColor =
          slot.tier === 3
            ? 0xfacc15
            : slot.tier === 2
            ? 0xa855f7
            : slot.tier === 1
            ? 0x38bdf8
            : 0x34d399;
        const ringRadius = Math.max(bw, bd) * 0.62;
        const ringGeo = new THREE.RingGeometry(ringRadius * 0.78, ringRadius, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(sx, 0.005, sz);
        boxesGroup.add(ringMesh);

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, ((slot.slotId % 3) - 1) * 0.14, 0)
        );

        const body: SnackBoxBody = {
          uid: boxUidCounter++,
          slotId: slot.slotId,
          tier: slot.tier,
          flavorId: spec.id,
          spec,
          name: slot.name || spec.name,
          symbol: slot.symbol || "SPL",
          icon: slot.icon || spec.icon,
          mesh,
          ringMesh,
          anchorX: sx,
          anchorZ: sz,
          hx: bw / 2,
          hy: bh / 2,
          hz: bd / 2,
          radius: Math.hypot(bw, bh, bd) * 0.36,
          pos: new THREE.Vector3(sx, sy, sz),
          vel: new THREE.Vector3(0, 0, 0),
          quat,
          angVel: new THREE.Vector3(0, 0, 0),
          mass: spec.mass,
          grabbed: false,
          won: false,
          winEmitted: false,
          removeTimer: 0,
        };

        mesh.position.copy(body.pos);
        mesh.quaternion.copy(body.quat);
        created.push(body);
      });

      boxesRef.current = created;
    };

    syncBoxesRef.current = spawnSnackBoxes;
    spawnSnackBoxes(propsRef.current.slots);

    /* =========================================================================
     * 11. BOOT SEQUENCE & CAMERA CHOREOGRAPHY
     * ========================================================================= */
    const bootSeq = {
      active: true,
      t: 0,
      duration: 5.35,
      firedBreaker: false,
      firedFlicker1: false,
      firedFlicker2: false,
      firedFlicker3: false,
      firedNeonL: false,
      firedNeonR: false,
      firedNeonBay: false,
      firedConsole: false,
      firedMarqueeBorder: false,
      firedBootChime: false,
      firedHomingOpen: false,
      firedHomingClose: false,
      hudRevealed: false,
      lastLcdPhase: "",
      startCamPos: new THREE.Vector3(-2.35, 2.38, 7.75),
      startCamTarget: new THREE.Vector3(0.04, 1.88, 0.12),
      showcaseCamPos: new THREE.Vector3(-2.02, 2.24, 6.85),
      showcaseCamTarget: new THREE.Vector3(0.05, 1.84, 0.12),
    };

    const _bootStartPos = new THREE.Vector3();
    const _bootShowcasePos = new THREE.Vector3();
    const _heroScaledPos = new THREE.Vector3();
    const _colDarkLED = new THREE.Color(0x05070e);
    const _colBrightLED = new THREE.Color(0xffffff);
    const _colBlack = new THREE.Color(0x000000);
    const _lcdDark = new THREE.Color(0x141a12);
    const _lcdBright = new THREE.Color(0xffffff);

    const applyLightingPower = (p: {
      ceiling: number;
      room: number;
      bgCabs: number;
      neonL: number;
      neonR: number;
      neonBay: number;
      console: number;
      marqueeBorder: number;
      marqueeMatrix: number;
    }) => {
      const ceil = p.ceiling;
      ceilingLEDMat.color.lerpColors(
        _colDarkLED,
        _colBrightLED,
        THREE.MathUtils.clamp(ceil, 0, 1)
      );
      ceilingSpot.intensity = 15.5 * ceil;
      interiorFill.intensity = 2.6 * ceil;
      giftShowcaseSpot.intensity = 4.2 * ceil;

      const room = p.room;
      scene.environmentIntensity = THREE.MathUtils.lerp(0.02, 0.95, room);
      hemiLight.intensity = THREE.MathUtils.lerp(0.03, 0.72, room);
      rimLight.intensity = THREE.MathUtils.lerp(0.06, 0.95, room);
      standbyExitLight.intensity = THREE.MathUtils.lerp(0.14, 0.08, room);
      arcadeAudio.setRoomPower(Math.max(ceil * 0.45, room));

      bgArcadeCabs.forEach((cab, idx) => {
        const cabP = THREE.MathUtils.clamp(
          p.bgCabs * bgArcadeCabs.length - idx * 0.65,
          0,
          1
        );
        cab.screenMat.color.lerpColors(_colBlack, cab.targetScreenColor, cabP);
        cab.neonMat.color.lerpColors(_colBlack, cab.targetNeonColor, cabP);
        cab.spriteMat.opacity = cab.targetSpriteOpacity * cabP;
      });
      bokehSprites.forEach((b) => {
        b.mat.opacity = b.targetOpacity * p.bgCabs;
      });

      leftCornerNeonMat.emissiveIntensity = 3.2 * p.neonL;
      leftCornerLight.intensity = 2.6 * p.neonL;

      rightCornerNeonMat.emissiveIntensity = 3.2 * p.neonR;
      rightCornerLight.intensity = 2.6 * p.neonR;

      pickupNeonMat.emissiveIntensity = 3.1 * p.neonBay;
      pickupBayLight.intensity = 2.4 * p.neonBay;
      coinSlotGlowMat.emissiveIntensity = 2.6 * p.neonBay;

      lcdScreenMat.emissiveIntensity = 1.15 * p.console;
      lcdScreenMat.color.lerpColors(_lcdDark, _lcdBright, p.console);
      neonEmeraldMat.emissiveIntensity = 2.7 * p.console;
      emeraldCapRingMat.emissiveIntensity = 1.65 * p.console;
      emeraldBtnLight.intensity = 3.2 * p.console;
      emeraldHaloMat.opacity = 0.58 * p.console;

      marqueeBorderMat.emissiveIntensity = 3.2 * p.marqueeBorder;
      marqueeEarPinkMat.emissiveIntensity = 3.0 * p.marqueeBorder;
      marqueeEarCoralMat.emissiveIntensity = 3.0 * p.marqueeBorder;

      const mGlow = Math.max(p.marqueeBorder * 0.45, p.marqueeMatrix);
      marqueeMat.emissiveIntensity = 1.45 * p.marqueeMatrix;
      marqueeLightL.intensity = 3.4 * mGlow;
      marqueeLightR.intensity = 3.4 * mGlow;
      marqueeHaloMat.opacity = 0.28 * mGlow;
    };

    let currentCamMode: CamMode = propsRef.current.activeCamMode || "hero";
    const camGoalPos = new THREE.Vector3();
    const camGoalTarget = new THREE.Vector3();
    let camTransitioning = false;

    // Rewards top-down zoom-in / zoom-out state
    type PrizesZoomPhase = "idle" | "zooming_in" | "zoomed" | "zooming_out";
    let prizesZoomPhase: PrizesZoomPhase = "idle";
    let prizesZoomElapsed = 0;
    const PRIZES_ZOOM_IN_DUR = 0.62;
    const PRIZES_ZOOM_OUT_DUR = 0.55;
    const prizesZoomStartPos = new THREE.Vector3();
    const prizesZoomStartTarget = new THREE.Vector3();
    const prizesZoomArcPos = new THREE.Vector3(0.0, 3.85, 1.15);
    const prizesZoomEndPos = new THREE.Vector3(0.0, 2.35, 0.42);
    const prizesZoomEndTarget = new THREE.Vector3(0.0, 0.55, -0.05);
    const prizesTmpVec = new THREE.Vector3();

    setPrizesZoomRef.current = (zoomed: boolean) => {
      if (zoomed) {
        if (prizesZoomPhase === "zooming_in" || prizesZoomPhase === "zoomed") return;
        prizesZoomStartPos.copy(camera.position);
        prizesZoomStartTarget.copy(controls.target);
        prizesZoomElapsed = 0;
        prizesZoomPhase = "zooming_in";
        camTransitioning = false;
        controls.enabled = false;
      } else {
        if (prizesZoomPhase === "idle" || prizesZoomPhase === "zooming_out") return;
        prizesZoomStartPos.copy(camera.position);
        prizesZoomStartTarget.copy(controls.target);
        computeScaledCamPos(
          CAM_PRESETS.hero.pos,
          CAM_PRESETS.hero.target,
          camGoalPos
        );
        camGoalTarget.copy(CAM_PRESETS.hero.target);
        prizesZoomElapsed = 0;
        prizesZoomPhase = "zooming_out";
        camTransitioning = false;
        controls.enabled = false;
      }
    };

    const setCameraMode = (mode: CamMode, instant = false) => {
      currentCamMode = mode;
      if (mode === "orbit") {
        camTransitioning = false;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        return;
      }

      const preset = CAM_PRESETS[mode] || CAM_PRESETS.hero;
      computeScaledCamPos(preset.pos, preset.target, camGoalPos);
      camGoalTarget.copy(preset.target);

      controls.enableRotate = true;
      controls.enablePan = false;
      controls.enableZoom = true;

      if (instant) {
        camera.position.copy(camGoalPos);
        controls.target.copy(camGoalTarget);
        controls.update();
        camTransitioning = false;
      } else {
        camTransitioning = true;
      }
    };
    setCameraModeRef.current = setCameraMode;

    const releaseGrabbedBox = (fromSlip = false) => {
      const g = gameRef.current;
      const b = g.grabbedBox;
      if (!b) return;
      b.grabbed = false;
      b.vel.set(
        g.gantryVx * 0.45 + (Math.random() - 0.5) * (fromSlip ? 0.45 : 0.14),
        fromSlip ? -0.35 : -0.15,
        g.gantryVz * 0.45 + (Math.random() - 0.5) * (fromSlip ? 0.45 : 0.14)
      );
      b.angVel.set(
        (Math.random() - 0.5) * (fromSlip ? 5.0 : 2.2),
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * (fromSlip ? 5.0 : 2.2)
      );
      g.lastReleasedBox = b;
      g.grabbedBox = null;
      if (fromSlip) {
        arcadeAudio.playBoxClack(0.6);
      }
    };

    const getCreditsInt = () =>
      Math.max(0, Math.floor(parseFloat(propsRef.current.usdcBalance || "0") || 0));

    const startBootSequence = (isReplay = false) => {
      bootSeq.active = true;
      bootActiveRef.current = true;
      bootSeq.t = 0;
      bootSeq.firedBreaker = false;
      bootSeq.firedFlicker1 = false;
      bootSeq.firedFlicker2 = false;
      bootSeq.firedFlicker3 = false;
      bootSeq.firedNeonL = false;
      bootSeq.firedNeonR = false;
      bootSeq.firedNeonBay = false;
      bootSeq.firedConsole = false;
      bootSeq.firedMarqueeBorder = false;
      bootSeq.firedBootChime = false;
      bootSeq.firedHomingOpen = false;
      bootSeq.firedHomingClose = false;
      bootSeq.hudRevealed = false;
      bootSeq.lastLcdPhase = "";

      propsRef.current.onBootStateChange?.(true, true);

      if (isReplay) {
        arcadeAudio.init();
        arcadeAudio.updateMotor(0);
        arcadeAudio.setWinch(0);
      }

      const g = gameRef.current;
      if (g.grabbedBox) {
        releaseGrabbedBox(false);
      }

      g.state = STATE.READY;
      g.stateTime = 0;
      g.gantryX = 0.04;
      g.gantryZ = -0.04;
      g.gantryVx = 0;
      g.gantryVz = 0;
      g.clawY = CAB.clawRestY;
      g.clawOpen = 0.16;
      g.targetClawOpen = 0.16;
      g.swayX = 0;
      g.swayZ = 0;
      g.swayVx = 0;
      g.swayVz = 0;
      g.celebrationTimer = 0;

      prizesZoomPhase = "idle";
      canopyLidGroup.rotation.x = 0;
      controls.enabled = false;
      computeScaledCamPos(bootSeq.startCamPos, bootSeq.startCamTarget, _bootStartPos);
      camera.position.copy(_bootStartPos);
      controls.target.copy(bootSeq.startCamTarget);
      controls.update();

      applyLightingPower({
        ceiling: 0,
        room: 0,
        bgCabs: 0,
        neonL: 0,
        neonR: 0,
        neonBay: 0,
        console: 0,
        marqueeBorder: 0,
        marqueeMatrix: 0,
      });
      updateLimeLCD(limeLCD, getCreditsInt(), g.timer, "BOOTING...");
      marquee.update(0, false, {
        active: true,
        power: 0,
        bgSweep: 0,
        letterCount: 0,
      });
    };
    startBootRef.current = startBootSequence;

    const updateBootSequence = (dt: number, elapsed: number) => {
      bootSeq.t += dt;
      const t = bootSeq.t;
      const g = gameRef.current;

      let ceiling = 0;
      if (t >= 0.5) {
        if (!bootSeq.firedBreaker) {
          bootSeq.firedBreaker = true;
          arcadeAudio.playBreakerSwitch();
        }
        const u = (t - 0.5) / 0.75;
        ceiling = sampleBallastCurve(u);
        if (u >= 0.04 && !bootSeq.firedFlicker1) {
          bootSeq.firedFlicker1 = true;
          arcadeAudio.playFluorescentFlicker(0.65);
        }
        if (u >= 0.19 && !bootSeq.firedFlicker2) {
          bootSeq.firedFlicker2 = true;
          arcadeAudio.playFluorescentFlicker(0.85);
        }
        if (u >= 0.36 && !bootSeq.firedFlicker3) {
          bootSeq.firedFlicker3 = true;
          arcadeAudio.playFluorescentFlicker(1.0);
        }
      }

      const room = easeOutCubic((t - 1.25) / 0.7);
      const bgCabs = easeOutCubic((t - 1.32) / 0.75);

      let neonL = 0;
      let neonR = 0;
      let neonBay = 0;
      if (t >= 1.95) {
        if (!bootSeq.firedNeonL) {
          bootSeq.firedNeonL = true;
          arcadeAudio.playNeonBuzz(118);
        }
        neonL = sampleNeonIgnite((t - 1.95) / 0.35);
      }
      if (t >= 2.22) {
        if (!bootSeq.firedNeonR) {
          bootSeq.firedNeonR = true;
          arcadeAudio.playNeonBuzz(132);
        }
        neonR = sampleNeonIgnite((t - 2.22) / 0.35);
      }
      if (t >= 2.48) {
        if (!bootSeq.firedNeonBay) {
          bootSeq.firedNeonBay = true;
          arcadeAudio.playNeonBuzz(105);
        }
        neonBay = sampleNeonIgnite((t - 2.48) / 0.35);
      }

      let consoleP = 0;
      let marqueeBorder = 0;
      let marqueeMatrix = 0;
      let bgSweep = 0;
      let letterCount = 0;

      if (t >= 2.75) {
        if (!bootSeq.firedConsole) {
          bootSeq.firedConsole = true;
          arcadeAudio.playButtonClick();
        }
        consoleP = easeOutCubic((t - 2.75) / 0.32);

        const lcdPhase =
          t < 3.15 ? "BOOTING..." : t < 3.55 ? "MAGICLAW" : "READY!";
        if (lcdPhase !== bootSeq.lastLcdPhase) {
          bootSeq.lastLcdPhase = lcdPhase;
          updateLimeLCD(limeLCD, getCreditsInt(), g.timer, lcdPhase);
        }
      }

      if (t >= 2.88) {
        if (!bootSeq.firedMarqueeBorder) {
          bootSeq.firedMarqueeBorder = true;
          arcadeAudio.playNeonBuzz(148);
        }
        marqueeBorder = sampleNeonIgnite((t - 2.88) / 0.32);
        marqueeMatrix = easeOutCubic((t - 2.95) / 0.25);
        bgSweep = THREE.MathUtils.clamp((t - 2.95) / 0.42, 0, 1);

        letterCount = THREE.MathUtils.clamp((t - 3.12) / 0.072, 0, 8.5);
        if (t >= 3.2 && !bootSeq.firedBootChime) {
          bootSeq.firedBootChime = true;
          arcadeAudio.playBootChime();
        }
      }

      applyLightingPower({
        ceiling,
        room,
        bgCabs,
        neonL,
        neonR,
        neonBay,
        console: consoleP,
        marqueeBorder,
        marqueeMatrix,
      });

      marquee.update(elapsed, false, {
        active: t < 3.95,
        power: marqueeMatrix,
        bgSweep,
        letterCount,
      });

      if (t >= 4.05 && !bootSeq.firedHomingOpen) {
        bootSeq.firedHomingOpen = true;
        g.targetClawOpen = 0.88;
        arcadeAudio.playPneumaticSnap(true);
      }
      if (t >= 4.55 && !bootSeq.firedHomingClose) {
        bootSeq.firedHomingClose = true;
        g.targetClawOpen = 0.16;
        arcadeAudio.playPneumaticSnap(false);
      }
      if (t >= 4.0 && t <= 4.75) {
        const jog = Math.sin(((t - 4.0) / 0.75) * Math.PI * 2);
        const prevX = g.gantryX;
        g.gantryX = 0.04 + jog * 0.08;
        g.gantryVx = (g.gantryX - prevX) / Math.max(dt, 0.001);
      } else {
        g.gantryX = THREE.MathUtils.lerp(g.gantryX, 0.04, Math.min(1, dt * 8));
        g.gantryVx = 0;
      }

      computeScaledCamPos(bootSeq.startCamPos, bootSeq.startCamTarget, _bootStartPos);
      computeScaledCamPos(
        bootSeq.showcaseCamPos,
        bootSeq.showcaseCamTarget,
        _bootShowcasePos
      );
      const heroPreset = CAM_PRESETS.hero;
      computeScaledCamPos(heroPreset.pos, heroPreset.target, _heroScaledPos);

      if (t < 3.9) {
        const u = easeInOutCubic(t / 3.9);
        camera.position.lerpVectors(_bootStartPos, _bootShowcasePos, u);
        controls.target.lerpVectors(
          bootSeq.startCamTarget,
          bootSeq.showcaseCamTarget,
          u
        );
      } else {
        const z = easeInOutCubic((t - 3.9) / 1.35);
        camera.position.lerpVectors(_bootShowcasePos, _heroScaledPos, z);
        controls.target.lerpVectors(
          bootSeq.showcaseCamTarget,
          heroPreset.target,
          z
        );
      }
      controls.update();

      if (t >= 4.75 && !bootSeq.hudRevealed) {
        bootSeq.hudRevealed = true;
        propsRef.current.onBootStateChange?.(false, true);
      }

      if (t >= bootSeq.duration) {
        bootSeq.active = false;
        bootActiveRef.current = false;
        applyLightingPower({
          ceiling: 1,
          room: 1,
          bgCabs: 1,
          neonL: 1,
          neonR: 1,
          neonBay: 1,
          console: 1,
          marqueeBorder: 1,
          marqueeMatrix: 1,
        });
        controls.enabled = true;
        const targetPreset = propsRef.current.activeCamMode || "hero";
        setCameraMode(targetPreset === "orbit" ? "hero" : targetPreset, true);
        propsRef.current.onBootStateChange?.(false, false);
      }
    };

    const handleControlsStart = () => {
      if (bootSeq.active) return;
      camTransitioning = false;
      if (currentCamMode !== "orbit") {
        currentCamMode = "orbit";
        propsRef.current.onCamModeChange?.("orbit");
      }
    };
    controls.addEventListener("start", handleControlsStart);

    /* =========================================================================
     * 12. GRAB ATTEMPT & INPUT HANDLERS
     * ========================================================================= */
    const attemptGrab = () => {
      const g = gameRef.current;
      const boxes = boxesRef.current;
      const clawTipX = g.gantryX + Math.sin(g.swayZ) * 0.25;
      const clawTipZ = g.gantryZ - Math.sin(g.swayX) * 0.25;
      const grabPocketY = g.clawY - 0.34;

      let bestBox: SnackBoxBody | null = null;
      let bestScore = Infinity;

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.grabbed || b.won || isInsideChuteXZ(b.pos.x, b.pos.z)) continue;

        const dx = b.pos.x - clawTipX;
        const dz = b.pos.z - clawTipZ;
        const horizDist = Math.hypot(dx, dz);
        const dy = Math.abs(b.pos.y - grabPocketY);

        const maxCaptureHoriz = propsRef.current.isOnchainActive ? 0.22 : 0.27;
        if (horizDist < maxCaptureHoriz && dy < 0.36) {
          const score = horizDist * 1.45 + dy * 0.55 - b.pos.y * 0.25;
          if (score < bestScore) {
            bestScore = score;
            bestBox = b;
          }
        }
      }

      if (!bestBox) {
        boxes.forEach((b) => {
          if (b.won) return;
          const dx = b.pos.x - clawTipX;
          const dz = b.pos.z - clawTipZ;
          const d = Math.hypot(dx, dz);
          if (d < 0.36 && Math.abs(b.pos.y - grabPocketY) < 0.35) {
            const push = (0.36 - d) * 1.8;
            b.vel.x += (dx / (d + 0.01)) * push;
            b.vel.z += (dz / (d + 0.01)) * push;
            b.angVel.set(
              (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 3
            );
          }
        });
        return;
      }

      const horizDist = Math.hypot(
        bestBox.pos.x - clawTipX,
        bestBox.pos.z - clawTipZ
      );
      const alignment = THREE.MathUtils.clamp(1 - horizDist / 0.27, 0, 1);
      const effectiveGrip = alignment * bestBox.spec.gripFactor;

      if (effectiveGrip > 0.24) {
        g.grabbedBox = bestBox;
        bestBox.grabbed = true;
        bestBox.vel.set(0, 0, 0);
        bestBox.angVel.set(0, 0, 0);

        g.grabOffset.set(
          THREE.MathUtils.clamp(bestBox.pos.x - clawTipX, -0.055, 0.055),
          -0.33,
          THREE.MathUtils.clamp(bestBox.pos.z - clawTipZ, -0.055, 0.055)
        );

        const slipChance = THREE.MathUtils.clamp(
          0.72 - effectiveGrip * 0.78,
          0.06,
          0.7
        );
        g.willSlip = Math.random() < slipChance;
        g.slipThresholdY = THREE.MathUtils.lerp(1.18, 2.02, Math.random());
        g.slipAtReturn = g.willSlip && Math.random() < 0.35;

        arcadeAudio.playBoxClack(0.75);
      } else {
        bestBox.vel.set(
          (Math.random() - 0.5) * 0.9,
          0.65,
          (Math.random() - 0.5) * 0.9
        );
        bestBox.angVel.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
        arcadeAudio.playBoxClack(0.5);
      }
    };

    const unlockAudioOnce = () => {
      arcadeAudio.init();
      window.removeEventListener("pointerdown", unlockAudioOnce);
      window.removeEventListener("keydown", unlockAudioOnce);
    };
    window.addEventListener("pointerdown", unlockAudioOnce, { passive: true });
    window.addEventListener("keydown", unlockAudioOnce, { passive: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
      keysRef.current[e.code] = true;

      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        triggerDrop();
      } else if (e.code === "KeyP") {
        startBootSequence(true);
      } else if (e.code === "Digit1") {
        if (!bootSeq.active) propsRef.current.onCamModeChange?.("hero");
      } else if (e.code === "Digit2") {
        if (!bootSeq.active) propsRef.current.onCamModeChange?.("front");
      } else if (e.code === "Digit3") {
        if (!bootSeq.active) propsRef.current.onCamModeChange?.("side");
      } else if (e.code === "Digit4") {
        if (!bootSeq.active) propsRef.current.onCamModeChange?.("orbit");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      if (!bootSeq.active && currentCamMode !== "orbit") {
        setCameraMode(currentCamMode, true);
      }
    };
    window.addEventListener("resize", handleResize);

    // Kick off boot sequence & warm up initial WebGL frame before revealing scene
    startBootSequence(false);
    updateCoiledCable(Math.max(0.24, CAB.gantryY - 0.12 - gameRef.current.clawY));
    renderer.render(scene, camera);
    const loadFrameId = requestAnimationFrame(() => {
      propsRef.current.onSceneReady?.();
    });

    /* =========================================================================
     * 13. MAIN GAMEPLAY & RENDER LOOP
     * ========================================================================= */
    const _clawWorldPos = new THREE.Vector3();
    let lastTime = performance.now();
    let elapsed = 0;
    let lastLcdUpdate = -1;
    let lastEmittedClawState = STATE.READY as string;
    let animId = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      if (bootSeq.active && !propsRef.current.isLoaderVisible) {
        updateBootSequence(dt, elapsed);
      }

      const g = gameRef.current;
      const boxes = boxesRef.current;
      const k = keysRef.current;

      // Movement input (keyboard + virtual joystick)
      let inX = 0;
      let inZ = 0;
      if (!bootSeq.active && propsRef.current.isSteeringAllowed) {
        if (k["ArrowLeft"] || k["KeyA"]) inX -= 1;
        if (k["ArrowRight"] || k["KeyD"]) inX += 1;
        if (k["ArrowUp"] || k["KeyW"]) inZ -= 1;
        if (k["ArrowDown"] || k["KeyS"]) inZ += 1;
        const joy = propsRef.current.virtualJoyVector;
        if (joy && (joy.x !== 0 || joy.y !== 0)) {
          inX += joy.x;
          inZ += joy.y;
        }
      }
      const inLen = Math.hypot(inX, inZ);
      if (inLen > 1) {
        inX /= inLen;
        inZ /= inLen;
      }

      // Live-tilting physical 3D Gold-Medallion Joystick
      joyPivot.rotation.z = THREE.MathUtils.lerp(
        joyPivot.rotation.z,
        -inX * 0.34,
        Math.min(1, dt * 15)
      );
      joyPivot.rotation.x = THREE.MathUtils.lerp(
        joyPivot.rotation.x,
        inZ * 0.34,
        Math.min(1, dt * 15)
      );

      // Depressing 3D Emerald Push Button plunger
      g.dropBtnPress = Math.max(0, g.dropBtnPress - dt * 5.2);
      dropPlunger.position.y = -g.dropBtnPress * 0.024;

      // Flying gold coin arc into coin slot
      if (g.coinAnimTimer > 0) {
        g.coinAnimTimer -= dt;
        const u = 1 - Math.max(0, g.coinAnimTimer / 0.42);
        flyingCoin.position.set(
          0.84,
          -0.35 + Math.sin(u * Math.PI) * 0.14,
          1.46 - u * 0.38
        );
        flyingCoin.rotation.x = u * Math.PI * 3;
        if (g.coinAnimTimer <= 0) flyingCoin.visible = false;
      }

      if (!bootSeq.active) {
        g.stateTime += dt;
        const moveSpeed = 1.06;

        if (g.state === STATE.READY) {
          g.gantryVx = 0;
          g.gantryVz = 0;
          arcadeAudio.updateMotor(0);
          arcadeAudio.setWinch(0);

          if (inLen > 0.12 && propsRef.current.isSteeringAllowed) {
            g.state = STATE.MOVING;
            g.timer = 25.0;
            g.lastTickSec = 25;
            g.stateTime = 0;
            arcadeAudio.playButtonClick();
          }

          if (pendingSlotsSyncRef.current !== null && !g.grabbedBox) {
            spawnSnackBoxes(pendingSlotsSyncRef.current);
            pendingSlotsSyncRef.current = null;
          }
        } else if (g.state === STATE.MOVING) {
          const prevX = g.gantryX;
          const prevZ = g.gantryZ;

          g.gantryX = THREE.MathUtils.clamp(
            g.gantryX + inX * moveSpeed * dt,
            CAB.gantryXMin,
            CAB.gantryXMax
          );
          g.gantryZ = THREE.MathUtils.clamp(
            g.gantryZ + inZ * moveSpeed * dt,
            CAB.gantryZMin,
            CAB.gantryZMax
          );

          g.gantryVx = (g.gantryX - prevX) / Math.max(dt, 0.001);
          g.gantryVz = (g.gantryZ - prevZ) / Math.max(dt, 0.001);
          arcadeAudio.updateMotor(
            Math.hypot(g.gantryVx, g.gantryVz) / moveSpeed
          );

          if (inLen > 0.05) {
            propsRef.current.onSteerDelta?.(
              Math.round(inX * 15),
              Math.round(inZ * 15)
            );
          }

          g.timer = Math.max(0, g.timer - dt);
          const sec = Math.ceil(g.timer);
          if (sec < g.lastTickSec) {
            g.lastTickSec = sec;
            if (sec <= 5 && sec > 0) arcadeAudio.playTick(true);
            else if (sec <= 10 && sec > 0) arcadeAudio.playTick(false);
          }

          if (g.timer <= 0) {
            triggerDrop();
          }
        } else if (g.state === STATE.DROPPING) {
          g.gantryVx = 0;
          g.gantryVz = 0;
          arcadeAudio.updateMotor(0);
          arcadeAudio.setWinch(-1);

          let floorStopY = CAB.clawMinY;
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (b.won || isInsideChuteXZ(b.pos.x, b.pos.z)) continue;
            const d = Math.hypot(b.pos.x - g.gantryX, b.pos.z - g.gantryZ);
            if (d < 0.22) {
              floorStopY = Math.max(floorStopY, b.pos.y + 0.34);
            }
          }
          floorStopY = Math.min(floorStopY, 1.48);

          g.clawY -= 1.24 * dt;
          if (g.clawY <= floorStopY) {
            g.clawY = floorStopY;
            g.state = STATE.GRABBING;
            g.stateTime = 0;
            g.targetClawOpen = 0.14;
            arcadeAudio.setWinch(0);
            arcadeAudio.playPneumaticSnap(false);
            attemptGrab();
          }
        } else if (g.state === STATE.GRABBING) {
          if (propsRef.current.isOnchainActive) {
            const vrf = propsRef.current.onchainVrfResult;
            if (vrf && vrf.nonce > lastVrfNonceAppliedRef.current) {
              lastVrfNonceAppliedRef.current = vrf.nonce;
              if (vrf.outcome === "Miss") {
                if (g.grabbedBox) {
                  g.grabbedBox.grabbed = false;
                  g.grabbedBox = null;
                }
              } else {
                const targetBody =
                  boxes.find((b) => b.slotId === vrf.targetSlot && !b.won) ||
                  g.grabbedBox;
                if (targetBody) {
                  if (g.grabbedBox && g.grabbedBox !== targetBody) {
                    g.grabbedBox.grabbed = false;
                  }
                  targetBody.grabbed = true;
                  targetBody.vel.set(0, 0, 0);
                  targetBody.angVel.set(0, 0, 0);
                  g.grabbedBox = targetBody;
                  g.grabOffset.set(0, -0.33, 0);
                  g.willSlip = vrf.outcome === "Slipped";
                  g.slipThresholdY = THREE.MathUtils.lerp(1.18, 2.02, 0.5);
                  g.slipAtReturn = false;
                  arcadeAudio.playBoxClack(0.75);
                }
              }
              g.state = STATE.LIFTING;
              g.stateTime = 0;
              arcadeAudio.setWinch(1);
            } else if (g.stateTime >= 10.0) {
              if (g.grabbedBox) {
                g.grabbedBox.grabbed = false;
                g.grabbedBox = null;
              }
              g.state = STATE.LIFTING;
              g.stateTime = 0;
              arcadeAudio.setWinch(1);
            }
          } else if (g.stateTime >= 0.48) {
            g.state = STATE.LIFTING;
            g.stateTime = 0;
            arcadeAudio.setWinch(1);
          }
        } else if (g.state === STATE.LIFTING) {
          g.clawY += 0.96 * dt;

          if (
            g.grabbedBox &&
            g.willSlip &&
            !g.slipAtReturn &&
            g.clawY >= g.slipThresholdY
          ) {
            releaseGrabbedBox(true);
            g.willSlip = false;
          }

          if (g.clawY >= CAB.clawRestY) {
            g.clawY = CAB.clawRestY;
            arcadeAudio.setWinch(0);
            g.state = STATE.RETURNING;
            g.stateTime = 0;
          }
        } else if (g.state === STATE.RETURNING) {
          const targetX = CAB.chuteCenterX;
          const targetZ = CAB.chuteCenterZ;
          const dx = targetX - g.gantryX;
          const dz = targetZ - g.gantryZ;
          const dist = Math.hypot(dx, dz);

          if (dist > 0.018) {
            const speed = Math.min(1.08, dist * 5.2);
            const step = Math.min(dist, speed * dt);
            const vx = (dx / dist) * (step / Math.max(dt, 0.001));
            const vz = (dz / dist) * (step / Math.max(dt, 0.001));
            g.gantryX += (dx / dist) * step;
            g.gantryZ += (dz / dist) * step;
            g.gantryVx = vx;
            g.gantryVz = vz;
            arcadeAudio.updateMotor(Math.min(1, speed / 1.08));

            if (
              g.grabbedBox &&
              g.willSlip &&
              g.slipAtReturn &&
              g.stateTime > 0.28
            ) {
              releaseGrabbedBox(true);
              g.willSlip = false;
            }
          } else {
            g.gantryX = targetX;
            g.gantryZ = targetZ;
            g.gantryVx = 0;
            g.gantryVz = 0;
            arcadeAudio.updateMotor(0);
            g.state = STATE.RELEASING;
            g.stateTime = 0;
            g.targetClawOpen = 1.0;
            arcadeAudio.playPneumaticSnap(true);
            if (g.grabbedBox) releaseGrabbedBox(false);
          }
        } else if (g.state === STATE.RELEASING) {
          // Ensure win modal triggers cleanly once released over chute
          if (
            g.stateTime >= 0.35 &&
            g.lastReleasedBox &&
            !g.lastReleasedBox.winEmitted &&
            propsRef.current.isOnchainActive &&
            propsRef.current.onchainVrfResult?.outcome === "Won"
          ) {
            emitWinPrize(g.lastReleasedBox);
          }
          if (g.stateTime >= 0.65) {
            g.targetClawOpen = 0.16;
            arcadeAudio.playPneumaticSnap(false);
            g.state = STATE.RESOLVING;
            g.stateTime = 0;
          }
        } else if (g.state === STATE.RESOLVING) {
          if (g.stateTime >= 1.15) {
            if (!g.wonThisTurn) {
              arcadeAudio.playMiss();
            }
            g.state = STATE.READY;
            g.timer = 25.0;
            g.lastTickSec = 25;
            g.stateTime = 0;
            g.lastReleasedBox = null;
          }
        }
      }

      // Pendulum sway spring-damper physics
      const springK = 22.0;
      const damping = 4.6;
      g.swayVx +=
        (-springK * g.swayX - damping * g.swayVx + g.gantryVz * 0.42) * dt;
      g.swayVz +=
        (-springK * g.swayZ - damping * g.swayVz - g.gantryVx * 0.42) * dt;
      g.swayX = THREE.MathUtils.clamp(g.swayX + g.swayVx * dt, -0.26, 0.26);
      g.swayZ = THREE.MathUtils.clamp(g.swayZ + g.swayVz * dt, -0.26, 0.26);

      g.clawOpen = THREE.MathUtils.lerp(
        g.clawOpen,
        g.targetClawOpen,
        Math.min(1, dt * 11)
      );

      zBridge.position.z = g.gantryZ;
      xCarriage.position.x = g.gantryX;
      pendulumPivot.rotation.x = g.swayX;
      pendulumPivot.rotation.z = g.swayZ;

      const cableLen = Math.max(0.24, CAB.gantryY - 0.12 - g.clawY);
      centerShaftMesh.scale.y = cableLen;
      centerShaftMesh.position.y = -cableLen * 0.5;
      clawAssembly.position.y = -cableLen;

      updateCoiledCable(cableLen);

      actuatorRing.position.y = -0.255 + g.clawOpen * 0.036;
      const openAngle = THREE.MathUtils.lerp(-0.14, 0.54, g.clawOpen);
      for (let i = 0; i < 3; i++) {
        prongPivots[i].rotation.z = openAngle;
        linkageStruts[i].rotation.z = 0.42 - g.clawOpen * 0.22;
      }

      const showProj =
        Boolean(propsRef.current.showProjection) &&
        !bootSeq.active &&
        (g.state === STATE.MOVING ||
          g.state === STATE.READY ||
          g.state === STATE.DROPPING);
      projectionGroup.visible = showProj;
      if (showProj) {
        let projY = 0.012;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (b.won || b.grabbed || isInsideChuteXZ(b.pos.x, b.pos.z)) continue;
          if (
            Math.abs(b.pos.x - g.gantryX) <= b.hx + 0.02 &&
            Math.abs(b.pos.z - g.gantryZ) <= b.hz + 0.02
          ) {
            projY = Math.max(projY, b.pos.y + b.hy + 0.012);
          }
        }
        const pulse = 1 + 0.08 * Math.sin(elapsed * 6.5);
        clawTargetRing.position.set(g.gantryX, projY, g.gantryZ);
        clawTargetRing.scale.set(pulse, pulse, 1);
        clawTargetDisc.position.set(g.gantryX, projY - 0.001, g.gantryZ);
        clawTargetCenter.position.set(g.gantryX, projY + 0.001, g.gantryZ);

        const beamTopY = Math.max(projY + 0.05, g.clawY - 0.28);
        const beamH = Math.max(0.02, beamTopY - projY);
        projectionBeam.scale.set(1, beamH, 1);
        projectionBeam.position.set(g.gantryX, projY + beamH / 2, g.gantryZ);
      }

      if (g.grabbedBox) {
        clawAssembly.getWorldPosition(_clawWorldPos);
        g.grabbedBox.pos.set(
          _clawWorldPos.x + g.grabOffset.x + Math.sin(g.swayZ) * 0.25,
          _clawWorldPos.y + g.grabOffset.y,
          _clawWorldPos.z + g.grabOffset.z - Math.sin(g.swayX) * 0.25
        );
        g.grabbedBox.mesh.position.copy(g.grabbedBox.pos);
        g.grabbedBox.mesh.quaternion.copy(g.grabbedBox.quat);
      }

      if (!bootSeq.active) {
        const celebrating = g.celebrationTimer > 0;
        if (celebrating) {
          g.celebrationTimer = Math.max(0, g.celebrationTimer - dt);
          const strobe = 2.6 + Math.sin(elapsed * 18) * 1.4;
          leftCornerNeonMat.emissiveIntensity = strobe;
          rightCornerNeonMat.emissiveIntensity =
            2.6 - Math.sin(elapsed * 18) * 1.4;
          pickupNeonMat.emissiveIntensity = 3.2 + Math.cos(elapsed * 14) * 1.1;
          marqueeBorderMat.emissiveIntensity =
            3.6 + Math.sin(elapsed * 16) * 0.9;
        } else {
          const breathe = 0.14 * Math.sin(elapsed * 2.4);
          leftCornerNeonMat.emissiveIntensity = 3.2 + breathe;
          rightCornerNeonMat.emissiveIntensity = 3.2 - breathe;
          pickupNeonMat.emissiveIntensity = 3.1 + 0.12 * Math.sin(elapsed * 3.1);
          marqueeBorderMat.emissiveIntensity =
            3.2 + 0.18 * Math.sin(elapsed * 2.8);
          neonEmeraldMat.emissiveIntensity = 2.7 + 0.28 * Math.sin(elapsed * 4.2);
        }
        marquee.update(elapsed, celebrating, null);

        if (elapsed - lastLcdUpdate > 0.12) {
          lastLcdUpdate = elapsed;
          const lcdStatus = celebrating
            ? "YOU WIN!"
            : propsRef.current.gameStateText || g.state;
          updateLimeLCD(limeLCD, getCreditsInt(), g.timer, lcdStatus);
        }
      }

      if (g.state !== lastEmittedClawState) {
        lastEmittedClawState = g.state;
        propsRef.current.onClawStateChange?.(g.state);
      }

      stepPhysics(dt, false);
      updateConfetti(dt);

      if (!bootSeq.active) {
        if (prizesZoomPhase === "zooming_in") {
          prizesZoomElapsed += dt;
          const rawT = Math.min(1, prizesZoomElapsed / PRIZES_ZOOM_IN_DUR);
          const eased = easeInOutCubic(rawT);

          // Swing top canopy lid open early so camera dives inside unobstructed
          const lidT = easeOutCubic(Math.min(1, rawT / 0.58));
          canopyLidGroup.rotation.x = -1.18 * lidT;

          // Quadratic Bezier arc over the front rim and down into the cabinet
          const inv = 1 - eased;
          camera.position.set(
            inv * inv * prizesZoomStartPos.x +
              2 * inv * eased * prizesZoomArcPos.x +
              eased * eased * prizesZoomEndPos.x,
            inv * inv * prizesZoomStartPos.y +
              2 * inv * eased * prizesZoomArcPos.y +
              eased * eased * prizesZoomEndPos.y,
            inv * inv * prizesZoomStartPos.z +
              2 * inv * eased * prizesZoomArcPos.z +
              eased * eased * prizesZoomEndPos.z
          );
          prizesTmpVec
            .copy(prizesZoomStartTarget)
            .lerp(prizesZoomEndTarget, eased);
          camera.lookAt(prizesTmpVec);

          if (rawT >= 1) {
            prizesZoomPhase = "zoomed";
            controls.target.copy(prizesZoomEndTarget);
            propsRef.current.onPrizesZoomComplete?.();
          }
        } else if (prizesZoomPhase === "zoomed") {
          canopyLidGroup.rotation.x = -1.18;
          camera.position.copy(prizesZoomEndPos);
          camera.lookAt(prizesZoomEndTarget);
        } else if (prizesZoomPhase === "zooming_out") {
          prizesZoomElapsed += dt;
          const rawT = Math.min(1, prizesZoomElapsed / PRIZES_ZOOM_OUT_DUR);
          const eased = easeInOutCubic(rawT);

          // Close top canopy lid smoothly as camera pulls back to hero
          const lidCloseT = easeInOutCubic(Math.min(1, Math.max(0, (rawT - 0.15) / 0.85)));
          canopyLidGroup.rotation.x = -1.18 * (1 - lidCloseT);

          const inv = 1 - eased;
          camera.position.set(
            inv * inv * prizesZoomStartPos.x +
              2 * inv * eased * prizesZoomArcPos.x +
              eased * eased * camGoalPos.x,
            inv * inv * prizesZoomStartPos.y +
              2 * inv * eased * prizesZoomArcPos.y +
              eased * eased * camGoalPos.y,
            inv * inv * prizesZoomStartPos.z +
              2 * inv * eased * prizesZoomArcPos.z +
              eased * eased * camGoalPos.z
          );
          prizesTmpVec
            .copy(prizesZoomStartTarget)
            .lerp(camGoalTarget, eased);
          camera.lookAt(prizesTmpVec);

          if (rawT >= 1) {
            prizesZoomPhase = "idle";
            canopyLidGroup.rotation.x = 0;
            currentCamMode = "hero";
            camera.position.copy(camGoalPos);
            controls.target.copy(camGoalTarget);
            controls.enabled = true;
            controls.update();
          }
        } else {
          if (camTransitioning && currentCamMode !== "orbit") {
            const alpha = 1 - Math.exp(-6.5 * dt);
            camera.position.lerp(camGoalPos, alpha);
            controls.target.lerp(camGoalTarget, alpha);
            if (camera.position.distanceTo(camGoalPos) < 0.015) {
              camera.position.copy(camGoalPos);
              controls.target.copy(camGoalTarget);
              camTransitioning = false;
            }
          }
          controls.update();
        }
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(loadFrameId);
      cancelAnimationFrame(animId);
      boxesRef.current.forEach(disposePrizeBody);
      boxesRef.current = [];
      controls.removeEventListener("start", handleControlsStart);
      window.removeEventListener("pointerdown", unlockAudioOnce);
      window.removeEventListener("keydown", unlockAudioOnce);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      envRT.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [triggerDrop]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none">
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
