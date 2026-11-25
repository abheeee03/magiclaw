"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { arcadeAudio } from "../audio/ArcadeAudio";
import {
  createBrushedMetalTextures,
  createPerforatedDeckTexture,
  createMarqueeTexture,
  createCabinetDisplayCanvas,
  updateCabinetDisplay,
  createChuteDecalTexture,
} from "./textures";
import { PublicKey } from "@solana/web3.js";
import { createPrizeBody, PrizeBody } from "./prizes";
import { PrizeSlot, WonPrizeInfo } from "../../lib/types";
import { computeLiveBuyback, getLivePythPrice } from "../../lib/pyth";
import { getDefaultPrizeSlots } from "../../lib/solana";

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
  activeCamMode: "front" | "side" | "iso" | "orbit";
  onCamModeChange?: (mode: "front" | "side" | "iso" | "orbit") => void;
  virtualJoyVector?: { x: number; y: number };
  isDropRequested?: boolean;
  gameStateText?: string;
}

const CAB = {
  xMin: -1.1,
  xMax: 1.1,
  zMin: -1.0,
  zMax: 1.0,
  floorY: 0.0,
  chuteXMax: -0.32,
  chuteZMin: 0.22,
  chuteWallH: 0.52,
  chuteWallThick: 0.04,
  chuteCenterX: -0.71,
  chuteCenterZ: 0.61,
  gantryY: 2.66,
  clawRestY: 2.15,
  clawMinY: 0.36,
  gantryXMin: -0.82,
  gantryXMax: 0.86,
  gantryZMin: -0.76,
  gantryZMax: 0.72,
};

const CAM_PRESETS: Record<string, { pos: THREE.Vector3; target: THREE.Vector3 } | null> = {
  front: { pos: new THREE.Vector3(0.0, 1.48, 4.95), target: new THREE.Vector3(0.0, 1.05, 0.05) },
  side: { pos: new THREE.Vector3(4.65, 1.38, 0.1), target: new THREE.Vector3(0.0, 1.02, 0.02) },
  iso: { pos: new THREE.Vector3(3.45, 2.35, 4.05), target: new THREE.Vector3(-0.05, 1.08, 0.0) },
  orbit: null,
};

export const ClawMachineView: React.FC<ClawMachineViewProps> = ({
  slots,
  usdcBalance = "10.00",
  isSteeringAllowed = true,
  isOnchainActive = false,
  onchainVrfResult = null,
  onSteerDelta,
  onDropTriggered,
  onWinPrize,
  activeCamMode = "front",
  onCamModeChange,
  virtualJoyVector = { x: 0, y: 0 },
  isDropRequested = false,
  gameStateText = "READY",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Synchronous props ref so animate loop reads latest props without re-mounting Three.js
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
  });

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
  };

  // References for mutable loop state (centered gantry spawn)
  const stateRef = useRef({
    gantryX: 0.0, // Center of cabinet playfield
    gantryZ: 0.0, // Center of cabinet playfield
    gantryVx: 0,
    gantryVz: 0,
    clawY: CAB.clawRestY,
    clawOpen: 0.12,
    targetClawOpen: 0.12,
    swayX: 0,
    swayZ: 0,
    swayVx: 0,
    swayVz: 0,
    state: "READY",
    timer: 15.0,
    stateTime: 0,
    grabbedPrize: null as PrizeBody | null,
    grabOffset: new THREE.Vector3(),
    willSlip: false,
    slipThresholdY: 1.5,
    wonThisTurn: false,
    celebrationTimer: 0,
    doorSwing: 0,
    dropBtnPress: 0,
    camGoalPos: new THREE.Vector3(),
    camGoalTarget: new THREE.Vector3(),
    camLerping: false,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const prizesRef = useRef<PrizeBody[]>([]);
  const cabinetGroupRef = useRef<THREE.Group | null>(null);
  const syncPrizesRef = useRef<((slotList?: PrizeSlot[]) => void) | null>(null);
  const lastVrfNonceAppliedRef = useRef<number>(0);

  // Re-sync 3D capsules whenever onchain MachineConfig slots update
  useEffect(() => {
    syncPrizesRef.current?.(slots);
  }, [slots]);

  // Camera transition
  useEffect(() => {
    const preset = CAM_PRESETS[activeCamMode];
    if (preset) {
      stateRef.current.camGoalPos.copy(preset.pos);
      stateRef.current.camGoalTarget.copy(preset.target);
      stateRef.current.camLerping = true;
    }
  }, [activeCamMode]);

  const triggerDrop = useCallback(() => {
    if (!propsRef.current.isSteeringAllowed) return;
    arcadeAudio.init();
    if (stateRef.current.state !== "READY" && stateRef.current.state !== "MOVING") return;

    stateRef.current.state = "DROPPING";
    stateRef.current.stateTime = 0;
    stateRef.current.dropBtnPress = 1.0;
    stateRef.current.targetClawOpen = 1.0;
    arcadeAudio.playButtonClick();
    arcadeAudio.playClawClack(true);
    arcadeAudio.updateMotor(0);
    arcadeAudio.setWinch(-1);

    const clientSeed = Math.floor(Math.random() * 255);
    const clawX = Math.max(0, Math.min(1000, Math.round(((stateRef.current.gantryX + 0.81) / 1.62) * 1000)));
    const clawZ = Math.max(0, Math.min(1000, Math.round(((stateRef.current.gantryZ + 0.70) / 1.40) * 1000)));
    propsRef.current.onDropTriggered?.(clientSeed, clawX, clawZ);
  }, []);

  // Handle external drop trigger
  useEffect(() => {
    if (isDropRequested && (stateRef.current.state === "READY" || stateRef.current.state === "MOVING")) {
      triggerDrop();
    }
  }, [isDropRequested, triggerDrop]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a14);
    scene.fog = new THREE.FogExp2(0x070a14, 0.042);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      60
    );
    camera.position.set(0, 1.48, 4.95);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 1.05, 0.05);
    controls.minDistance = 2.4;
    controls.maxDistance = 8.8;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = 0.22;

    // Environment PMREM
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0c1020);

    const addLightPanel = (w: number, h: number, color: number, pos: [number, number, number], rotY = 0, rotX = 0) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(...pos);
      mesh.rotation.set(rotX, rotY, 0);
      envScene.add(mesh);
    };
    addLightPanel(10, 10, 0xffffff, [0, 9, 0], 0, Math.PI / 2);
    addLightPanel(6, 3, 0x38bdf8, [-8, 3, 3], Math.PI / 2.2, 0);
    addLightPanel(6, 3, 0xf472b6, [8, 3, 3], -Math.PI / 2.2, 0);
    addLightPanel(8, 2.5, 0xfef3c7, [0, 5, 8], Math.PI, 0);
    addLightPanel(5, 5, 0x6366f1, [0, 2, -8], 0, 0);

    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    keyLight.position.set(3.8, 5.5, 5.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const showcaseSpot = new THREE.SpotLight(0xfffaf0, 16.5, 8.5, Math.PI * 0.34, 0.35, 1.2);
    showcaseSpot.position.set(0.0, 2.88, 0.08);
    showcaseSpot.target.position.set(0.0, 0.0, 0.0);
    showcaseSpot.castShadow = true;
    showcaseSpot.shadow.mapSize.set(2048, 2048);
    showcaseSpot.shadow.bias = -0.0004;
    scene.add(showcaseSpot);
    scene.add(showcaseSpot.target);

    const interiorFill = new THREE.PointLight(0xe0f2fe, 2.2, 4.2, 1.6);
    interiorFill.position.set(0, 1.65, 0.65);
    scene.add(interiorFill);

    // Showroom floor
    const roomFloor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b0f1d, roughness: 0.28, metalness: 0.35 })
    );
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.y = -1.72;
    roomFloor.receiveShadow = true;
    scene.add(roomFloor);

    // Glowing floor ring
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(1.78, 1.92, 64),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = -1.71;
    scene.add(floorRing);

    // Materials
    const brushedTex = createBrushedMetalTextures();
    const deckTex = createPerforatedDeckTexture();
    const marqueeTex = createMarqueeTexture();
    const cabinetDisplay = createCabinetDisplayCanvas();

    const frameMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1a2234,
      metalness: 0.82,
      roughness: 0.24,
      bumpMap: brushedTex.bumpMap,
      bumpScale: 0.004,
    });

    const accentTrimMat = new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 0.8,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.96,
      roughness: 0.08,
    });

    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xd8e0e8,
      map: brushedTex.map,
      roughnessMap: brushedTex.roughnessMap,
      bumpMap: brushedTex.bumpMap,
      bumpScale: 0.005,
      metalness: 0.92,
      roughness: 0.26,
    });

    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex.map,
      bumpMap: deckTex.bumpMap,
      bumpScale: 0.008,
      metalness: 0.45,
      roughness: 0.55,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff6ff,
      transparent: true,
      opacity: 0.13,
      roughness: 0.04,
      metalness: 0.08,
      reflectivity: 1.0,
      clearcoat: 1.0,
      depthWrite: false,
    });

    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 0.9,
      depthWrite: false,
    });

    const ledStripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0x06b6d4),
      emissiveIntensity: 3.2,
      roughness: 0.2,
    });

    const trimNeonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xec4899),
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });

    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // Lower cabinet
    const lowerRightBody = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.72, 2.24), frameMetalMat);
    lowerRightBody.position.set(0.47, -0.86, 0.0);
    lowerRightBody.castShadow = true;
    lowerRightBody.receiveShadow = true;
    cabinetGroup.add(lowerRightBody);

    const lowerBackLeft = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.72, 1.32), frameMetalMat);
    lowerBackLeft.position.set(-0.74, -0.86, -0.46);
    lowerBackLeft.castShadow = true;
    lowerBackLeft.receiveShadow = true;
    cabinetGroup.add(lowerBackLeft);

    const chuteOuterLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.72, 0.92), frameMetalMat);
    chuteOuterLeft.position.set(-1.17, -0.86, 0.66);
    cabinetGroup.add(chuteOuterLeft);

    const chuteBottomBox = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.34, 0.92), frameMetalMat);
    chuteBottomBox.position.set(-0.74, -1.55, 0.66);
    cabinetGroup.add(chuteBottomBox);

    const chuteRamp = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.06, 0.95), brushedSteelMat);
    chuteRamp.position.set(-0.71, -1.06, 0.62);
    chuteRamp.rotation.x = 0.36;
    chuteRamp.receiveShadow = true;
    cabinetGroup.add(chuteRamp);

    // Chute prize pickup door
    const pickupFrame = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.72, 0.08), chromeMat);
    pickupFrame.position.set(-0.71, -0.98, 1.11);
    cabinetGroup.add(pickupFrame);

    const prizeDoorPivot = new THREE.Group();
    prizeDoorPivot.position.set(-0.71, -0.7, 1.14);
    const prizeDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.56, 0.03),
      new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.42, roughness: 0.12, clearcoat: 1.0 })
    );
    prizeDoorMesh.position.y = -0.28;
    prizeDoorPivot.add(prizeDoorMesh);
    cabinetGroup.add(prizeDoorPivot);

    // Playfield Deck
    const deckRight = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.06, 2.04), deckMat);
    deckRight.position.set(0.4, -0.03, 0.0);
    deckRight.receiveShadow = true;
    cabinetGroup.add(deckRight);

    const deckBackLeft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 1.24), deckMat);
    deckBackLeft.position.set(-0.72, -0.03, -0.4);
    deckBackLeft.receiveShadow = true;
    cabinetGroup.add(deckBackLeft);

    // Chute walls
    const chuteWallRight = new THREE.Mesh(new THREE.BoxGeometry(CAB.chuteWallThick, CAB.chuteWallH, CAB.zMax - CAB.chuteZMin), acrylicMat);
    chuteWallRight.position.set(CAB.chuteXMax, CAB.chuteWallH / 2, (CAB.chuteZMin + CAB.zMax) / 2);
    cabinetGroup.add(chuteWallRight);

    const chuteWallBack = new THREE.Mesh(new THREE.BoxGeometry(CAB.chuteXMax - CAB.xMin, CAB.chuteWallH, CAB.chuteWallThick), acrylicMat);
    chuteWallBack.position.set((CAB.xMin + CAB.chuteXMax) / 2, CAB.chuteWallH / 2, CAB.chuteZMin);
    cabinetGroup.add(chuteWallBack);

    const chuteDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.28),
      new THREE.MeshBasicMaterial({ map: createChuteDecalTexture(), transparent: true, depthWrite: false })
    );
    chuteDecal.position.set(CAB.chuteCenterX, 0.28, CAB.chuteZMin - 0.024);
    chuteDecal.rotation.y = Math.PI;
    cabinetGroup.add(chuteDecal);

    // Corner posts & glass
    const postPositions = [
      [-1.16, -1.06],
      [1.16, -1.06],
      [-1.16, 1.06],
      [1.16, 1.06],
    ];
    const cornerLights: THREE.PointLight[] = [];

    postPositions.forEach(([px, pz], idx) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.88, 0.14), frameMetalMat);
      post.position.set(px, 1.44, pz);
      cabinetGroup.add(post);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 2.74, 0.042), ledStripMat);
      strip.position.set(px - Math.sign(px) * 0.06, 1.44, pz - Math.sign(pz) * 0.06);
      cabinetGroup.add(strip);

      if (idx >= 2) {
        const pLight = new THREE.PointLight(0x06b6d4, 1.6, 3.8, 1.8);
        pLight.position.set(px * 0.82, 1.45, pz * 0.82);
        cabinetGroup.add(pLight);
        cornerLights.push(pLight);
      }
    });

    const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(2.22, 2.84), glassMat);
    glassFront.position.set(0, 1.44, 1.06);
    cabinetGroup.add(glassFront);

    const glassBack = new THREE.Mesh(
      new THREE.PlaneGeometry(2.22, 2.84),
      new THREE.MeshPhysicalMaterial({ color: 0x0e1629, roughness: 0.15, metalness: 0.65, transparent: true, opacity: 0.82 })
    );
    glassBack.position.set(0, 1.44, -1.06);
    cabinetGroup.add(glassBack);

    const glassLeft = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 2.84), glassMat);
    glassLeft.rotation.y = -Math.PI / 2;
    glassLeft.position.set(-1.16, 1.44, 0);
    cabinetGroup.add(glassLeft);

    const glassRight = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 2.84), glassMat);
    glassRight.rotation.y = Math.PI / 2;
    glassRight.position.set(1.16, 1.44, 0);
    cabinetGroup.add(glassRight);

    // Canopy & Marquee
    const canopyBox = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.68, 2.28), frameMetalMat);
    canopyBox.position.set(0, 3.2, 0);
    cabinetGroup.add(canopyBox);

    const marqueeMat = new THREE.MeshStandardMaterial({
      map: marqueeTex,
      emissiveMap: marqueeTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.35,
      roughness: 0.18,
    });
    const marqueeMesh = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.56, 0.06), marqueeMat);
    marqueeMesh.position.set(0, 3.2, 1.15);
    cabinetGroup.add(marqueeMesh);

    // 3D Control Console
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(0, -0.14, 1.34);
    cabinetGroup.add(consoleGroup);

    const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.28, 0.58), frameMetalMat);
    consoleGroup.add(consoleBody);

    const faceplate = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.03, 0.46), brushedSteelMat);
    faceplate.position.set(0, 0.145, 0.02);
    consoleGroup.add(faceplate);

    // 3D Joystick
    const joyMount = new THREE.Group();
    joyMount.position.set(-0.56, 0.16, 0.04);
    consoleGroup.add(joyMount);

    const joyPivot = new THREE.Group();
    joyPivot.position.y = 0.01;
    joyMount.add(joyPivot);

    const joyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 16), chromeMat);
    joyShaft.position.y = 0.09;
    joyPivot.add(joyShaft);

    const joyBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.072, 24, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xec4899, roughness: 0.08, clearcoat: 1.0 })
    );
    joyBall.position.y = 0.2;
    joyPivot.add(joyBall);

    // 3D Glowing DROP Button
    const dropBtnBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.035, 28), chromeMat);
    dropBtnBezel.position.set(0.1, 0.17, 0.04);
    consoleGroup.add(dropBtnBezel);

    const dropBtnCapMat = new THREE.MeshPhysicalMaterial({
      color: 0xef233c,
      emissive: 0xd90429,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      clearcoat: 1.0,
    });
    const dropBtnMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.098, 0.06, 28), dropBtnCapMat);
    dropBtnMesh.position.set(0.1, 0.195, 0.04);
    consoleGroup.add(dropBtnMesh);

    // 3D Cabinet Display
    const ledDisplayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.18),
      new THREE.MeshBasicMaterial({ map: cabinetDisplay.tex })
    );
    ledDisplayMesh.position.set(0.68, 0.165, 0.04);
    ledDisplayMesh.rotation.x = -Math.PI / 2 + 0.12;
    consoleGroup.add(ledDisplayMesh);

    // Mechanical Gantry & Articulated Claw
    const gantryGroup = new THREE.Group();
    cabinetGroup.add(gantryGroup);

    [-1.02, 1.02].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.02, 16), chromeMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(rx, CAB.gantryY, 0);
      gantryGroup.add(rail);
    });

    const zBridge = new THREE.Group();
    zBridge.position.set(0, CAB.gantryY, 0);
    gantryGroup.add(zBridge);

    [-0.06, 0.06].forEach((rz) => {
      const xRail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.04, 16), chromeMat);
      xRail.rotation.z = Math.PI / 2;
      xRail.position.set(0, 0, rz);
      zBridge.add(xRail);
    });

    const xCarriage = new THREE.Group();
    zBridge.add(xCarriage);

    const carriageHousing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.24), brushedSteelMat);
    xCarriage.add(carriageHousing);

    const cableSpool = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 20), chromeMat);
    cableSpool.rotation.x = Math.PI / 2;
    cableSpool.position.y = -0.05;
    xCarriage.add(cableSpool);

    const pendulumPivot = new THREE.Group();
    pendulumPivot.position.set(0, -0.08, 0);
    xCarriage.add(pendulumPivot);

    const cableMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 1.0, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.35 })
    );
    pendulumPivot.add(cableMesh);

    const clawAssembly = new THREE.Group();
    pendulumPivot.add(clawAssembly);

    const solenoidBody = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.072, 0.19, 24), brushedSteelMat);
    solenoidBody.position.y = -0.08;
    clawAssembly.add(solenoidBody);

    const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 16), chromeMat);
    pistonRod.position.y = -0.21;
    clawAssembly.add(pistonRod);

    const pistonHub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.05, 18), frameMetalMat);
    pistonHub.position.y = -0.26;
    clawAssembly.add(pistonHub);

    // 3 articulated prongs
    const redRubberMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.78 });
    const prongPivots: THREE.Group[] = [];

    for (let i = 0; i < 3; i++) {
      const radialAngle = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const mount = new THREE.Group();
      mount.rotation.y = radialAngle;
      mount.position.y = -0.17;
      clawAssembly.add(mount);

      const pivot = new THREE.Group();
      pivot.position.set(0.062, 0, 0);
      mount.add(pivot);

      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.19, 0.026), brushedSteelMat);
      upperArm.position.set(0.055, -0.085, 0);
      upperArm.rotation.z = 0.56;
      pivot.add(upperArm);

      const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.195, 0.024), brushedSteelMat);
      lowerArm.position.set(0.068, -0.252, 0);
      lowerArm.rotation.z = -0.38;
      pivot.add(lowerArm);

      const gripTip = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.055, 8, 12), redRubberMat);
      gripTip.position.set(0.018, -0.342, 0);
      gripTip.rotation.z = -0.78;
      pivot.add(gripTip);

      prongPivots.push(pivot);
    }

    // Laser targeting dot
    const clawTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.085, 24),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    clawTargetRing.rotation.x = -Math.PI / 2;
    clawTargetRing.position.y = 0.01;
    cabinetGroup.add(clawTargetRing);

    // Laser beam vertical line
    const laserBeamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -2, 0)]);
    const laserBeamMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45 });
    const laserBeam = new THREE.Line(laserBeamGeo, laserBeamMat);
    clawAssembly.add(laserBeam);

    // Spawn Prizes: Use passed slots (filtering inStock) or default calibrated 16 slots
    cabinetGroupRef.current = cabinetGroup;
    const syncPrizesToScene = (slotList?: PrizeSlot[]) => {
      for (const old of prizesRef.current) {
        cabinetGroup.remove(old.mesh);
      }
      const source =
        slotList && slotList.length > 0
          ? slotList.filter((s) => s.inStock)
          : getDefaultPrizeSlots(PublicKey.default);
      const prizeBodies: PrizeBody[] = [];
      source.forEach((s) => {
        const p = createPrizeBody(s.slotId, s.tier, s.x, s.z, {
          name: s.name,
          symbol: s.symbol,
          image: s.image,
        });
        if (s.icon) p.icon = s.icon;
        cabinetGroup.add(p.mesh);
        prizeBodies.push(p);
      });
      prizesRef.current = prizeBodies;
    };
    syncPrizesRef.current = syncPrizesToScene;
    syncPrizesToScene(propsRef.current.slots);

    setIsLoaded(true);

    // Key handlers with e.code support and scroll prevention
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();
      keysRef.current[key] = true;
      keysRef.current[code] = true;

      // Prevent window scroll on game keys
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === " "
      ) {
        e.preventDefault();
      }

      if (e.key === "1") propsRef.current.onCamModeChange?.("front");
      if (e.key === "2") propsRef.current.onCamModeChange?.("side");
      if (e.key === "3") propsRef.current.onCamModeChange?.("iso");
      if (e.key === "4") propsRef.current.onCamModeChange?.("orbit");
      if (e.key === " " || e.key === "Enter") {
        triggerDrop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();
      keysRef.current[key] = false;
      keysRef.current[code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // Main animation loop
    let lastTime = performance.now();
    let prevGantryVx = 0;
    let prevGantryVz = 0;
    let animId: number;

    const _clawCenter = new THREE.Vector3();
    const getClawCaptureWorldPos = () => {
      const cableLen = Math.max(0.2, CAB.gantryY - 0.08 - stateRef.current.clawY);
      const totalDrop = cableLen + 0.34;
      _clawCenter.set(
        stateRef.current.gantryX + Math.sin(stateRef.current.swayZ) * totalDrop,
        CAB.gantryY - 0.08 - Math.cos(stateRef.current.swayZ) * Math.cos(stateRef.current.swayX) * totalDrop,
        stateRef.current.gantryZ - Math.sin(stateRef.current.swayX) * totalDrop
      );
      return _clawCenter;
    };

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      const state = stateRef.current;
      state.stateTime += dt;

      // Handle user movement inputs
      let moveX = 0;
      let moveZ = 0;
      const isAllowed = propsRef.current.isSteeringAllowed;
      if (isAllowed && (state.state === "READY" || state.state === "MOVING")) {
        const k = keysRef.current;
        if (k["arrowleft"] || k["a"] || k["keya"]) moveX -= 1;
        if (k["arrowright"] || k["d"] || k["keyd"]) moveX += 1;
        if (k["arrowup"] || k["w"] || k["keyw"]) moveZ -= 1;
        if (k["arrowdown"] || k["s"] || k["keys"]) moveZ += 1;

        const joy = propsRef.current.virtualJoyVector;
        if (joy && (joy.x !== 0 || joy.y !== 0)) {
          moveX += joy.x;
          moveZ += joy.y;
        }

        const mag = Math.hypot(moveX, moveZ);
        if (mag > 1) {
          moveX /= mag;
          moveZ /= mag;
        }

        if (mag > 0.15 && state.state === "READY") {
          state.state = "MOVING";
          state.timer = 15.0;
          state.targetClawOpen = 0.25;
          arcadeAudio.playButtonClick();
        }

        if (mag > 0.05) {
          propsRef.current.onSteerDelta?.(Math.round(moveX * 15), Math.round(moveZ * 15));
        }
      }

      // 3D joystick tilt
      joyPivot.rotation.z = THREE.MathUtils.lerp(joyPivot.rotation.z, -moveX * 0.36, dt * 14);
      joyPivot.rotation.x = THREE.MathUtils.lerp(joyPivot.rotation.x, moveZ * 0.36, dt * 14);

      // DROP button depression spring
      state.dropBtnPress = Math.max(0, state.dropBtnPress - dt * 5.5);
      dropBtnMesh.position.y = 0.195 - state.dropBtnPress * 0.024;

      // State machine logic
      const maxSpeed = 1.28;

      if (state.state === "MOVING") {
        state.timer = Math.max(0, state.timer - dt);
        const targetVx = moveX * maxSpeed;
        const targetVz = moveZ * maxSpeed;
        state.gantryVx = THREE.MathUtils.lerp(state.gantryVx, targetVx, dt * 11);
        state.gantryVz = THREE.MathUtils.lerp(state.gantryVz, targetVz, dt * 11);

        state.gantryX = THREE.MathUtils.clamp(state.gantryX + state.gantryVx * dt, CAB.gantryXMin, CAB.gantryXMax);
        state.gantryZ = THREE.MathUtils.clamp(state.gantryZ + state.gantryVz * dt, CAB.gantryZMin, CAB.gantryZMax);

        arcadeAudio.updateMotor(Math.hypot(state.gantryVx, state.gantryVz) / maxSpeed);

        if (state.timer <= 0) {
          triggerDrop();
        }
      } else if (state.state === "DROPPING") {
        state.gantryVx *= 0.85;
        state.gantryVz *= 0.85;

        const dropSpeed = 1.18;
        state.clawY -= dropSpeed * dt;
        cableSpool.rotation.z += dropSpeed * dt * 14;

        const capPos = getClawCaptureWorldPos();
        let hitPrize = false;
        for (const p of prizesRef.current) {
          if (p.won) continue;
          const horiz = Math.hypot(p.pos.x - capPos.x, p.pos.z - capPos.z);
          if (horiz < p.radius + 0.11 && capPos.y <= p.pos.y + p.radius * 0.35) {
            hitPrize = true;
            break;
          }
        }

        if (hitPrize || state.clawY <= CAB.clawMinY) {
          state.clawY = Math.max(CAB.clawMinY, state.clawY);
          arcadeAudio.setWinch(0);
          arcadeAudio.playClawClack(false);
          state.state = "GRABBING";
          state.stateTime = 0;
          state.targetClawOpen = 0.08;

          // Evaluate grab
          let best: { prize: PrizeBody; quality: number; dx: number; dy: number; dz: number } | null = null;
          let bestScore = -1;
          for (const p of prizesRef.current) {
            if (p.won) continue;
            const dx = p.pos.x - capPos.x;
            const dz = p.pos.z - capPos.z;
            const dy = p.pos.y - capPos.y;
            const horizDist = Math.hypot(dx, dz);
            const reach = p.radius + 0.145;
            if (horizDist < reach && Math.abs(dy) < p.radius + 0.2) {
              const quality = (1 - horizDist / reach) * p.gripFactor;
              if (quality > bestScore) {
                bestScore = quality;
                best = { prize: p, quality, dx, dy, dz };
              }
            }
          }

          if (best && best.quality >= 0.28) {
            const p = best.prize;
            p.grabbed = true;
            state.grabbedPrize = p;
            state.grabOffset.set(best.dx * 0.35, -0.02, best.dz * 0.35);

            // Grip roll based on tier odds
            const baseOdds = [0.65, 0.32, 0.12, 0.04][p.tier] ?? 0.5;
            const bullseye = best.quality >= 0.7;
            const effectiveOdds = bullseye ? baseOdds + 0.03 : baseOdds;
            state.willSlip = Math.random() > effectiveOdds;
            state.slipThresholdY = THREE.MathUtils.lerp(1.15, 1.95, Math.random());
          }
        }
      } else if (state.state === "GRABBING") {
        if (state.grabbedPrize) state.targetClawOpen = 0.24;

        // If connected onchain, wait for VRF resolution from MagicBlock ER before lifting
        if (propsRef.current.isOnchainActive) {
          const vrf = propsRef.current.onchainVrfResult;
          if (vrf && vrf.nonce > lastVrfNonceAppliedRef.current) {
            lastVrfNonceAppliedRef.current = vrf.nonce;
            if (vrf.outcome === "Miss") {
              if (state.grabbedPrize) {
                state.grabbedPrize.grabbed = false;
                state.grabbedPrize = null;
              }
            } else {
              const targetBody =
                prizesRef.current.find((pr) => pr.slotId === vrf.targetSlot && !pr.won) ||
                state.grabbedPrize;
              if (targetBody) {
                if (state.grabbedPrize && state.grabbedPrize !== targetBody) {
                  state.grabbedPrize.grabbed = false;
                }
                targetBody.grabbed = true;
                state.grabbedPrize = targetBody;
                state.willSlip = vrf.outcome === "Slipped";
                state.slipThresholdY = THREE.MathUtils.lerp(1.2, 1.85, 0.5);
              }
            }
            state.state = "LIFTING";
            state.stateTime = 0;
            arcadeAudio.setWinch(1);
          } else if (state.stateTime >= 10.0) {
            // Timeout fallback so claw doesn't freeze forever
            if (state.grabbedPrize) {
              state.grabbedPrize.grabbed = false;
              state.grabbedPrize = null;
            }
            state.state = "LIFTING";
            state.stateTime = 0;
            arcadeAudio.setWinch(1);
          }
        } else if (state.stateTime >= 0.55) {
          state.state = "LIFTING";
          state.stateTime = 0;
          arcadeAudio.setWinch(1);
        }
      } else if (state.state === "LIFTING") {
        const liftSpeed = state.grabbedPrize ? 0.84 : 1.08;
        state.clawY += liftSpeed * dt;
        cableSpool.rotation.z -= liftSpeed * dt * 14;

        if (state.grabbedPrize && state.willSlip && state.clawY >= state.slipThresholdY) {
          // It slips!
          const p = state.grabbedPrize;
          p.grabbed = false;
          p.vel.set((Math.random() - 0.5) * 0.55, -0.35, (Math.random() - 0.5) * 0.55);
          state.grabbedPrize = null;
          arcadeAudio.playClawClack(true);
        }

        if (state.clawY >= CAB.clawRestY) {
          state.clawY = CAB.clawRestY;
          arcadeAudio.setWinch(0);
          state.state = "RETURNING";
          state.stateTime = 0;
        }
      } else if (state.state === "RETURNING") {
        const dx = CAB.chuteCenterX - state.gantryX;
        const dz = CAB.chuteCenterZ - state.gantryZ;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.02) {
          const retSpeed = Math.min(1.05, dist * 3.8 + 0.22);
          state.gantryX += (dx / dist) * retSpeed * dt;
          state.gantryZ += (dz / dist) * retSpeed * dt;
          arcadeAudio.updateMotor(retSpeed / maxSpeed);
        } else {
          state.gantryX = CAB.chuteCenterX;
          state.gantryZ = CAB.chuteCenterZ;
          arcadeAudio.updateMotor(0);
          state.state = "RELEASING";
          state.stateTime = 0;
        }
      } else if (state.state === "RELEASING") {
        if (state.stateTime >= 0.25 && state.targetClawOpen < 0.9) {
          state.targetClawOpen = 1.0;
          arcadeAudio.playClawClack(true);
          if (state.grabbedPrize) {
            const p = state.grabbedPrize;
            p.grabbed = false;
            p.won = true;
            state.grabbedPrize = null;
            state.wonThisTurn = true;
            state.celebrationTimer = 4.0;
            state.doorSwing = 1.0;
            arcadeAudio.playWinFanfare();

            // Trigger Win Callback with real onchain slot details when available
            const vrf = propsRef.current.onchainVrfResult;
            const resolvedSlotId =
              propsRef.current.isOnchainActive && vrf ? vrf.targetSlot : p.slotId;
            const onchainSlot = propsRef.current.slots?.find(
              (s) => s.slotId === resolvedSlotId
            );
            const livePrice = onchainSlot
              ? Number(onchainSlot.fallbackBuybackUsdc) / 1_000_000
              : getLivePythPrice(p.symbol).priceUsd;
            const buyback = onchainSlot
              ? Number(onchainSlot.fallbackBuybackUsdc) / 1_000_000
              : computeLiveBuyback(p.tier, p.symbol);
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
            const baseBps = [6500, 3200, 1200, 400][onchainSlot?.tier ?? p.tier] || 6500;
            const isBull = vrf?.isBullseye ?? false;
            propsRef.current.onWinPrize?.({
              slotId: resolvedSlotId,
              tier: onchainSlot?.tier ?? p.tier,
              tierName: ["Common", "Rare", "Epic", "Grail"][onchainSlot?.tier ?? p.tier] || "Common",
              name: onchainSlot?.name || p.name,
              symbol: onchainSlot?.symbol || p.symbol,
              icon: onchainSlot?.icon || p.icon,
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
          }
        }
        if (state.stateTime >= 0.85) {
          state.targetClawOpen = 0.14;
          state.state = "RESOLVING";
          state.stateTime = 0;
        }
      } else if (state.state === "RESOLVING") {
        if (state.stateTime >= 1.45) {
          if (!state.wonThisTurn) arcadeAudio.playMiss();
          state.state = "READY";
          state.timer = 15.0;
          state.wonThisTurn = false;
        }
      }

      // Pendulum dynamics with clamped acceleration to prevent violent sway jumps
      const rawAccelX = (state.gantryVx - prevGantryVx) / Math.max(dt, 0.008);
      const rawAccelZ = (state.gantryVz - prevGantryVz) / Math.max(dt, 0.008);
      const accelX = THREE.MathUtils.clamp(rawAccelX, -4.0, 4.0);
      const accelZ = THREE.MathUtils.clamp(rawAccelZ, -4.0, 4.0);
      prevGantryVx = state.gantryVx;
      prevGantryVz = state.gantryVz;

      const cableLen = Math.max(0.28, CAB.gantryY - 0.08 - state.clawY);
      const omegaSq = 11.5 / (cableLen + 0.35);
      state.swayVz += (-omegaSq * state.swayZ - 2.6 * state.swayVz - accelX * 0.085) * dt;
      state.swayVx += (-omegaSq * state.swayX - 2.6 * state.swayVx + accelZ * 0.085) * dt;
      state.swayZ = THREE.MathUtils.clamp(state.swayZ + state.swayVz * dt, -0.32, 0.32);
      state.swayX = THREE.MathUtils.clamp(state.swayX + state.swayVx * dt, -0.32, 0.32);

      // Apply transformations to Three.js objects
      zBridge.position.z = state.gantryZ;
      xCarriage.position.x = state.gantryX;
      pendulumPivot.rotation.z = state.swayZ;
      pendulumPivot.rotation.x = state.swayX;

      const visualCableLen = Math.max(0.12, CAB.gantryY - 0.08 - state.clawY);
      cableMesh.scale.y = visualCableLen;
      cableMesh.position.y = -visualCableLen * 0.5;
      clawAssembly.position.y = -visualCableLen;

      state.clawOpen = THREE.MathUtils.lerp(state.clawOpen, state.targetClawOpen, dt * 12);
      const prongAngle = THREE.MathUtils.lerp(-0.18, 0.56, state.clawOpen);
      prongPivots.forEach((p) => {
        p.rotation.z = prongAngle;
      });
      pistonRod.position.y = -0.18 - (1 - state.clawOpen) * 0.045;
      pistonHub.position.y = pistonRod.position.y - 0.05;

      // Laser target dot on floor
      const capWorld = getClawCaptureWorldPos();
      clawTargetRing.position.x = capWorld.x;
      clawTargetRing.position.z = capWorld.z;
      clawTargetRing.material.opacity = state.state === "MOVING" ? 0.75 : 0.25;

      // Update grabbed prize position
      if (state.grabbedPrize) {
        state.grabbedPrize.pos.set(
          capWorld.x + state.grabOffset.x,
          capWorld.y + state.grabOffset.y - 0.02,
          capWorld.z + state.grabOffset.z
        );
        state.grabbedPrize.mesh.position.copy(state.grabbedPrize.pos);
      }

      // Physics step for non-grabbed prizes (falling, settled)
      for (const p of prizesRef.current) {
        if (!p.grabbed && !p.won) {
          if (p.pos.y > 0.16) {
            p.vel.y -= 9.8 * dt;
            p.pos.addScaledVector(p.vel, dt);
            if (p.pos.y <= 0.16) {
              p.pos.y = 0.16;
              p.vel.set(0, 0, 0);
            }
            p.mesh.position.copy(p.pos);
          }
        }
      }

      // Neon LED pulse / Win celebration strobe
      if (state.celebrationTimer > 0) {
        state.celebrationTimer = Math.max(0, state.celebrationTimer - dt);
        const hue = ((now * 0.002) % 1);
        ledStripMat.emissive.setHSL(hue, 1.0, 0.55);
        ledStripMat.emissiveIntensity = 3.5 + Math.sin(now * 0.03) * 2.0;
        cornerLights.forEach((l) => l.color.setHSL(hue, 1.0, 0.55));
      } else {
        const idleHue = 0.53 + Math.sin(now * 0.001) * 0.06;
        ledStripMat.emissive.setHSL(idleHue, 0.92, 0.52);
        ledStripMat.emissiveIntensity = 2.7;
        cornerLights.forEach((l) => l.color.setHSL(idleHue, 0.9, 0.55));
      }

      // Camera lerp
      if (state.camLerping && propsRef.current.activeCamMode !== "orbit") {
        camera.position.lerp(state.camGoalPos, dt * 6.5);
        controls.target.lerp(state.camGoalTarget, dt * 6.5);
        if (camera.position.distanceTo(state.camGoalPos) < 0.04) {
          state.camLerping = false;
        }
      }

      // Update cabinet LED display texture
      updateCabinetDisplay(
        cabinetDisplay,
        propsRef.current.usdcBalance || "10.00",
        state.timer,
        propsRef.current.gameStateText || state.state
      );

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [triggerDrop]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none">
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />
      {!isLoaded && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070812]">
          <div className="font-arcade text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-300 mb-3 animate-pulse">
            CLAWVAULT
          </div>
          <div className="w-48 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full w-2/3 bg-gradient-to-r from-cyan-400 to-fuchsia-500 animate-pulse rounded-full" />
          </div>
          <p className="mt-3 text-xs text-slate-400 tracking-widest uppercase">
            Initializing MagicBlock 3D Engine &amp; VRF Physics...
          </p>
        </div>
      )}
    </div>
  );
};
