"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WonPrizeInfo } from "../../lib/types";
import { createBoosterPackObject } from "./boosterPack";

interface WinningPack3DProps {
  prize: WonPrizeInfo;
}

/**
 * Procedural studio lightroom environment for PMREM reflections so the
 * Satin Studio pack catches the signature upper-left elongated white highlight.
 */
function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xd8d5d0);

  const roomGeo = new THREE.BoxGeometry(26, 20, 26);
  const roomMat = new THREE.MeshBasicMaterial({
    color: 0xe8e6e2,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(roomGeo, roomMat));

  const leftSoftbox = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 13.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3.4, 3.55) })
  );
  leftSoftbox.position.set(-7.5, 1.5, 6.2);
  leftSoftbox.lookAt(0, 0, 0);
  envScene.add(leftSoftbox);

  const topStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(11.0, 2.8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.5) })
  );
  topStrip.position.set(-0.5, 8.2, 4.0);
  topStrip.lookAt(0, 0, 0);
  envScene.add(topStrip);

  const rightFill = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 10.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.65, 1.62, 1.7) })
  );
  rightFill.position.set(8.5, 0.5, 5.0);
  rightFill.lookAt(0, 0, 0);
  envScene.add(rightFill);

  const backLeftRim = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 12.0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.0, 2.15) })
  );
  backLeftRim.position.set(-6.0, 2.0, -8.0);
  backLeftRim.lookAt(0, 0, 0);
  envScene.add(backLeftRim);

  const backRightRim = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 12.0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.9) })
  );
  backRightRim.position.set(6.5, 1.0, -8.0);
  backRightRim.lookAt(0, 0, 0);
  envScene.add(backRightRim);

  const floorBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.94, 0.92) })
  );
  floorBounce.position.set(0, -8.5, 0);
  floorBounce.rotation.x = -Math.PI / 2;
  envScene.add(floorBounce);

  const envRT = pmremGenerator.fromScene(envScene, 0.045);
  pmremGenerator.dispose();
  roomGeo.dispose();
  roomMat.dispose();
  return envRT.texture;
}

function createSoftShadowPlane() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    10,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(62, 32, 12, 0.28)");
  g.addColorStop(0.42, "rgba(62, 32, 12, 0.12)");
  g.addColorStop(0.75, "rgba(62, 32, 12, 0.03)");
  g.addColorStop(1, "rgba(62, 32, 12, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(3.2, 1.35);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -1.94, 0);
  return { mesh, geo, mat, tex };
}

export const WinningPack3D: React.FC<WinningPack3DProps> = ({ prize }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 0.06, 6.45);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "grab";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.target.set(0, 0, 0);

    const envTex = createStudioEnvironment(renderer);
    scene.environment = envTex;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.48);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffdf9, 1.28);
    keyLight.position.set(-4.2, 5.2, 6.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf3f1ff, 0.58);
    fillLight.position.set(5.2, 1.2, 4.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.65);
    rimLight.position.set(0.5, 4.2, -5.8);
    scene.add(rimLight);

    const amountText = prize.isNft
      ? "1/1 NFT"
      : `${prize.amount} ${prize.symbol}`.trim();

    const pack = createBoosterPackObject({
      config: {
        tier: prize.tier,
        tearText: "solana",
        brandTitle: prize.name || prize.symbol || "TOKEN",
        flavorText: "magiclaw",
        bottomLeft: "magicblock",
        bottomRight: amountText,
        imageUrl: prize.image,
      },
      finish: "satin",
      highDetail: true,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    scene.add(pack.group);

    const shadow = createSoftShadowPlane();
    scene.add(shadow.mesh);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, entry.contentRect.width);
      const h = Math.max(1, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      pack.group.position.y = Math.sin(t * 1.45) * 0.055;
      pack.group.rotation.z = Math.sin(t * 0.9) * 0.008;
      pack.group.rotation.y = Math.sin(t * 0.7) * 0.14;
      const sScale = 1.0 - Math.sin(t * 1.45) * 0.04;
      shadow.mesh.scale.set(sScale, sScale, 1);

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      pack.dispose();
      shadow.geo.dispose();
      shadow.mat.dispose();
      shadow.tex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    prize.amount,
    prize.image,
    prize.isNft,
    prize.name,
    prize.symbol,
    prize.tier,
  ]);

  return (
    <div
      ref={mountRef}
      className="w-56 h-72 sm:w-64 sm:h-80 relative select-none pointer-events-auto"
      title="Drag to spin your winning pack"
    />
  );
};
