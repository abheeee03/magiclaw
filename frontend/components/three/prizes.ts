import * as THREE from "three";
import { createPlushTextures } from "./textures";

const plushBumpTex = typeof document !== "undefined" ? createPlushTextures() : new THREE.Texture();

function makePlushMat(colorHex: number) {
  return new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.88,
    metalness: 0.0,
    sheen: 0.78,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.45),
    bumpMap: plushBumpTex,
    bumpScale: 0.012,
  });
}

const chromeMat = new THREE.MeshStandardMaterial({
  color: 0xf1f5f9,
  metalness: 0.96,
  roughness: 0.08,
});

const glossyBlackMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f19,
  roughness: 0.08,
  metalness: 0.15,
});

// Tier 0: Common (Matte Neon Cyan Orb / Shiba)
export function buildCyanOrbMesh(variant: number = 0) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.4,
    roughness: 0.22,
    metalness: 0.1,
    clearcoat: 0.8,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 20), mat);
  sphere.castShadow = true;
  g.add(sphere);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.012, 10, 24), chromeMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // Tiny emblem inside
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.05, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x22d3ee, emissiveIntensity: 1.2 })
  );
  g.add(core);
  return g;
}

// Tier 1: Rare (Metallic Purple Capsule / JUP Gachapon)
export function buildPurpleCapsuleMesh(variant: number = 0) {
  const g = new THREE.Group();
  const botMat = new THREE.MeshPhysicalMaterial({
    color: 0x7e22ce,
    roughness: 0.15,
    metalness: 0.85,
    clearcoat: 1.0,
  });
  const bottom = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    botMat
  );
  bottom.castShadow = true;
  g.add(bottom);

  const topMat = new THREE.MeshPhysicalMaterial({
    color: 0xc084fc,
    transparent: true,
    opacity: 0.65,
    roughness: 0.06,
    metalness: 0.15,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    topMat
  );
  g.add(top);

  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.149, 0.01, 10, 28), chromeMat);
  seam.rotation.x = Math.PI / 2;
  g.add(seam);

  // Floating glowing star inside
  const star = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xa855f7,
      emissiveIntensity: 1.5,
      metalness: 0.5,
    })
  );
  star.position.y = 0.02;
  g.add(star);
  return g;
}

// Tier 2: Epic (Holographic Prism Cube / Retro Console)
export function buildPrismCubeMesh(variant: number = 0) {
  const g = new THREE.Group();
  const cubeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf472b6,
    roughness: 0.08,
    metalness: 0.45,
    transmission: 0.4,
    thickness: 0.2,
    clearcoat: 1.0,
    emissive: 0xdb2777,
    emissiveIntensity: 0.5,
  });

  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), cubeMat);
  cube.castShadow = true;
  g.add(cube);

  // Outer wireframe edges
  const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.245, 0.245, 0.245));
  const wireMat = new THREE.LineBasicMaterial({ color: 0x67e8f9, linewidth: 2 });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  g.add(wire);

  // Inner floating core
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.08, 0),
    new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.0,
    })
  );
  g.add(core);
  return g;
}

// Tier 3: Grail (24K Gold Royal Crown)
export function buildGoldCrownMesh() {
  const g = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.96,
    roughness: 0.12,
  });
  const velvetMat = makePlushMat(0x831843);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 14), velvetMat);
  cap.scale.set(1, 0.85, 1);
  cap.position.y = -0.01;
  g.add(cap);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.09, 24, 1, true), goldMat);
  band.material.side = THREE.DoubleSide;
  band.position.y = -0.04;
  band.castShadow = true;
  g.add(band);

  const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.016, 10, 28), goldMat);
  bottomRim.rotation.x = Math.PI / 2;
  bottomRim.position.y = -0.08;
  g.add(bottomRim);

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), goldMat);
    spike.position.set(Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14);
    spike.rotation.z = -Math.cos(a) * 0.16;
    spike.rotation.x = Math.sin(a) * 0.16;
    spike.castShadow = true;
    g.add(spike);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 12), goldMat);
    orb.position.set(Math.cos(a) * 0.15, 0.13, Math.sin(a) * 0.15);
    orb.castShadow = true;
    g.add(orb);
  }
  return g;
}

// Also include cute plushies for variety in the pit
export function buildShibaMesh(variant: number = 0) {
  const coatMat = makePlushMat(0xe69138);
  const creamMat = makePlushMat(0xfff3d6);
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });

  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.10, 12, 18), coatMat);
  body.castShadow = true;
  g.add(body);

  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.102, 16, 14), creamMat);
  mask.scale.set(1.02, 0.92, 0.65);
  mask.position.set(0, 0.01, 0.065);
  g.add(mask);

  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.085, 8), coatMat);
    ear.position.set(s * 0.072, 0.145, 0.01);
    ear.rotation.z = -s * 0.28;
    g.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 10), glossyBlackMat);
    eye.position.set(s * 0.046, 0.065, 0.108);
    g.add(eye);

    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), creamMat);
    paw.position.set(s * 0.068, -0.11, 0.08);
    g.add(paw);
  });

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 10), glossyBlackMat);
  nose.position.set(0, 0.045, 0.128);
  g.add(nose);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.014, 10, 22), collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.025;
  g.add(collar);

  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.18 })
  );
  bell.position.set(0, -0.04, 0.12);
  g.add(bell);

  return g;
}

export interface PrizeBody {
  slotId: number;
  tier: number;
  name: string;
  symbol: string;
  icon: string;
  radius: number;
  mass: number;
  gripFactor: number;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  quat: THREE.Quaternion;
  won: boolean;
  grabbed: boolean;
}

/**
 * Creates a prize mesh based on tier and slot ID.
 */
export function createPrizeBody(
  slotId: number,
  tier: number,
  xNorm: number,
  zNorm: number,
  meta?: { name?: string; symbol?: string; image?: string }
): PrizeBody {
  let mesh: THREE.Group;
  let radius = 0.165;
  let mass = 1.0;
  let gripFactor = 1.0;
  let name = "Prize Capsule";
  let symbol = "SOL";
  let icon = "🎁";

  if (tier === 0) {
    if (slotId % 2 === 0) {
      mesh = buildCyanOrbMesh(slotId);
      name = "BONK Neon Orb";
      symbol = "BONK";
      icon = "🐶";
      radius = 0.155;
      gripFactor = 1.05;
    } else {
      mesh = buildShibaMesh(slotId);
      name = "WIF Shiba Plush";
      symbol = "WIF";
      icon = "🐕";
      radius = 0.175;
      gripFactor = 1.04;
    }
  } else if (tier === 1) {
    mesh = buildPurpleCapsuleMesh(slotId);
    name = "JUP Star Capsule";
    symbol = "JUP";
    icon = "🪐";
    radius = 0.165;
    mass = 1.15;
    gripFactor = 0.95;
  } else if (tier === 2) {
    mesh = buildPrismCubeMesh(slotId);
    name = "Holo NFT Prism";
    symbol = "SOL";
    icon = "💎";
    radius = 0.175;
    mass = 1.35;
    gripFactor = 0.88;
  } else {
    mesh = buildGoldCrownMesh();
    name = "Solana Gold Crown";
    symbol = "CROWN";
    icon = "👑";
    radius = 0.18;
    mass = 1.65;
    gripFactor = 0.82;
  }

  // Convert on-chain [0, 1000] coordinates to 3D world space inside cabinet
  // Cabinet playfield: X in [-0.80, 0.82], Z in [-0.72, 0.68], floor is ~0.16
  const worldX = (xNorm / 1000) * 1.62 - 0.81;
  const worldZ = (zNorm / 1000) * 1.40 - 0.70;
  // Natural height variation based on slotId so prizes settle naturally without z-fighting
  const worldY = 0.16 + ((slotId * 7) % 5) * 0.008;

  mesh.position.set(worldX, worldY, worldZ);
  mesh.rotation.y = (slotId * 0.94) + 0.35;

  const displayName = meta?.name || name;
  const displaySymbol = meta?.symbol || symbol;

  // Floating holographic badge above capsule so players can see which token/NFT is inside
  if (typeof document !== "undefined") {
    const tierHex = ["#22d3ee", "#c084fc", "#f472b6", "#fbbf24"][tier] || "#22d3ee";
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(7, 10, 22, 0.88)";
      ctx.strokeStyle = tierHex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(4, 4, 248, 64, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName;
      ctx.fillText(label, 128, 28);

      ctx.fillStyle = tierHex;
      ctx.font = "bold 16px monospace";
      ctx.fillText(`#${slotId} • ${displaySymbol}`, 128, 52);

      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(0, radius + 0.16, 0);
      sprite.scale.set(0.42, 0.12, 1);
      mesh.add(sprite);
    }
  }

  return {
    slotId,
    tier,
    name: displayName,
    symbol: displaySymbol,
    icon,
    radius,
    mass,
    gripFactor,
    mesh,
    pos: mesh.position.clone(),
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
    quat: mesh.quaternion.clone(),
    won: false,
    grabbed: false,
  };
}
