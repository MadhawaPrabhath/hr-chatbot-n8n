"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RobotMood } from "../Robot";

const { damp } = THREE.MathUtils;
const TEAL = "#4fe0c9";

// Soft floor glow: radial gradient that fades to fully transparent at its edge.
function floorGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.55, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Props = { mood: RobotMood; reducedMotion: boolean; y: number };

/** Holographic floor ring under the robot. Spins slowly; spins faster and pulses while thinking. */
export default function Platform({ mood, reducedMotion, y }: Props) {
  const spinner = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Group>(null);
  const think = useRef(0);

  const mats = useMemo(() => {
    const additive = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    const glow = additive(0.35);
    glow.map = floorGlowTexture();
    return { ring: additive(0.85), arcs: additive(0.6), glow };
  }, []);
  useEffect(
    () => () => {
      mats.glow.map?.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats]
  );

  // Three arcs with gaps make the rotation visible.
  const arcs = useMemo(() => [0, 1, 2].map((i) => (i / 3) * Math.PI * 2), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    think.current = damp(think.current, mood === "thinking" ? 1 : 0, 4, dt);
    const k = think.current;

    if (spinner.current) spinner.current.rotation.z += dt * (reducedMotion ? 0.1 : 0.25 + k * 2.2);

    // Glow pulse is kept under reduced motion; only the scale pulse is dropped.
    const beat = Math.sin(t * 6) * 0.5 + 0.5;
    mats.ring.opacity = 0.7 + k * 0.3 * beat;
    mats.arcs.opacity = 0.45 + k * 0.45 * beat;
    mats.glow.opacity = 0.3 + k * 0.35 * beat;
    if (pulse.current) pulse.current.scale.setScalar(1 + (reducedMotion ? 0 : k * 0.06 * beat));
  });

  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={pulse}>
        <mesh material={mats.glow} renderOrder={-1}>
          <circleGeometry args={[1.5, 64]} />
        </mesh>
        <mesh material={mats.ring}>
          <ringGeometry args={[1.02, 1.05, 128]} />
        </mesh>
        <group ref={spinner}>
          {arcs.map((start) => (
            <mesh key={start} material={mats.arcs}>
              <ringGeometry args={[1.14, 1.18, 64, 1, start, Math.PI * 0.5]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
