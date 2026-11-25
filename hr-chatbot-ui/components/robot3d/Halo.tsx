"use client";

import { forwardRef, useEffect, useMemo } from "react";
import * as THREE from "three";

const TEAL = "#4fe0c9";

// Effects live on this layer: the main camera renders it, the ContactShadows camera doesn't,
// so glows and particles never show up as blobs in the floor shadow.
export const FX_LAYER = 1;

// One soft radial-gradient texture shared by every halo.
let texture: THREE.CanvasTexture | null = null;
function haloTexture() {
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Props = { size: number; opacity?: number; position?: [number, number, number] };

/**
 * A camera-facing glow around a teal light. Stands in for a Bloom pass: post-processing
 * bloom spreads over the whole transparent canvas and shows up as a hard-edged rectangle,
 * while these fade to fully transparent on their own.
 */
const Halo = forwardRef<THREE.Sprite, Props>(function Halo({ size, opacity = 0.55, position }, ref) {
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: TEAL,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    // opacity is animated through the material afterwards, so only the initial value matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <sprite
      ref={ref}
      material={material}
      position={position}
      scale={[size, size, 1]}
      onUpdate={(self) => self.layers.set(FX_LAYER)}
    />
  );
});

export default Halo;
