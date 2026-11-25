"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { RobotMood } from "../Robot";
import RobotModel, { type RobotVariant } from "./RobotModel";
import Platform from "./Platform";
import { FX_LAYER } from "./Halo";

function OnFxLayer({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    group.current?.traverse((o) => o.layers.set(FX_LAYER));
  });
  return <group ref={group}>{children}</group>;
}

const FLOOR = -1.35;

type Props = { mood: RobotMood; reducedMotion: boolean; variant?: RobotVariant; onReady?: () => void };

export default function RobotScene({ mood, reducedMotion, variant = "full", onReady }: Props) {
  const full = variant === "full";
  return (
    <Canvas
      dpr={[1, 2]}
      camera={full ? { position: [0, 0.9, 6.4], fov: 35 } : { position: [0, 0, 4.2], fov: 30 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0); // fully transparent: the page's own glow shows through
        camera.layers.enable(FX_LAYER);
        if (full) camera.lookAt(0, 0.1, 0);
        onReady?.();
      }}
    >
      {/* Soft key light, gentle fill, and a teal rim light behind the robot */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 1, 2]} intensity={0.5} />
      <directionalLight position={[-2.5, 2, -4]} intensity={2.5} color="#4fe0c9" />
      <directionalLight position={[2.5, 1, -4]} intensity={1.5} color="#4fe0c9" />

      {/* Studio-style environment for reflections. Built from Lightformers, like drei's
          presets, but generated locally so it needs no HDR download. No background is set. */}
      <Environment resolution={full ? 256 : 64}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -2]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="ring" color="#4fe0c9" intensity={2} position={[0, 1, -6]} scale={4} />
      </Environment>

      <RobotModel mood={mood} reducedMotion={reducedMotion} variant={variant} />

      {full && (
        <>
          <ContactShadows position={[0, FLOOR, 0]} opacity={0.6} scale={4} blur={2.6} far={2.5} resolution={256} />
          <OnFxLayer>
            {/* Just below the shadow plane, so it's never captured into the shadow */}
            <Platform mood={mood} reducedMotion={reducedMotion} y={FLOOR - 0.01} />
            <Sparkles
              count={36}
              scale={[3.8, 3.4, 2.2]}
              position={[0, 0.2, -0.3]}
              size={2.2}
              speed={reducedMotion ? 0 : 0.25}
              noise={0.6}
              opacity={0.55}
              color="#4fe0c9"
            />
          </OnFxLayer>
        </>
      )}
    </Canvas>
  );
}
