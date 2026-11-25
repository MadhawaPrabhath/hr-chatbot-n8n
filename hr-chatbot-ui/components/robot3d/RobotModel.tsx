"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { RobotMood } from "../Robot";
import Halo from "./Halo";

const { damp, clamp } = THREE.MathUtils;

const TEAL = "#4fe0c9";
const ORBIT_COUNT = 10;

/** "full" is the standing robot; "head" frames just the head for the small header avatar. */
export type RobotVariant = "full" | "head";

type Props = { mood: RobotMood; reducedMotion: boolean; variant?: RobotVariant };

// Glowing teal; toneMapped=false keeps it bright instead of being compressed by tone mapping.
function glow(intensity: number) {
  return new THREE.MeshStandardMaterial({
    color: TEAL,
    emissive: TEAL,
    emissiveIntensity: intensity,
    toneMapped: false,
  });
}

function useMaterials() {
  const mats = useMemo(
    () => ({
      // Glossy plastic shell
      shell: new THREE.MeshPhysicalMaterial({
        color: "#3a4248",
        metalness: 0.35,
        roughness: 0.3,
        clearcoat: 0.8,
        clearcoatRoughness: 0.15,
      }),
      // Darker brushed-metal joints
      joint: new THREE.MeshStandardMaterial({ color: "#262c31", metalness: 0.75, roughness: 0.32 }),
      // Glassy screen face
      face: new THREE.MeshPhysicalMaterial({
        color: "#061412",
        metalness: 0.2,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      }),
      eye: glow(2.5),
      mouth: glow(2.5),
      bulb: glow(3),
      chest: glow(2),
      orbit: glow(3),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

export default function RobotModel({ mood, reducedMotion, variant = "full" }: Props) {
  const full = variant === "full";
  const gl = useThree((s) => s.gl);
  const mats = useMaterials();

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const eyeHalo = useRef<THREE.Sprite>(null);
  const bulbHalo = useRef<THREE.Sprite>(null);
  const chestHalo = useRef<THREE.Sprite>(null);

  // Smoothed state weights (0..1) and pointer, so switching moods never snaps.
  const s = useRef({ think: 0, answer: 0, px: 0, py: 0, nextBlink: 2, blinkStart: -1 });
  const pointer = useRef({ x: 0, y: 0 });

  // Track the cursor across the whole window; the canvas only covers the left panel.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      pointer.current.x = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -2, 2);
      pointer.current.y = clamp((e.clientY - (r.top + r.height * 0.35)) / (r.height / 2), -2, 2);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [gl]);

  const orbitPositions = useMemo(
    () =>
      Array.from({ length: ORBIT_COUNT }, (_, i) => {
        const a = (i / ORBIT_COUNT) * Math.PI * 2;
        return [Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05] as [number, number, number];
      }),
    []
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const st = s.current;
    // Large movements scale with this; glow changes don't.
    const m = reducedMotion ? 0 : 1;

    st.think = damp(st.think, mood === "thinking" ? 1 : 0, 4, dt);
    st.answer = damp(st.answer, mood === "answering" ? 1 : 0, 3, dt);
    const idle = clamp(1 - st.think - st.answer, 0, 1);
    const { think, answer } = st;

    st.px = damp(st.px, pointer.current.x, 5, dt);
    st.py = damp(st.py, pointer.current.y, 5, dt);

    // ---- Whole robot: float / ponder / bounce, and turn on Y to show its depth ----
    if (root.current) {
      const float = Math.sin(t * 1.6) * 0.12;
      const ponder = Math.sin(t * 1.1) * 0.06;
      const bounce = Math.abs(Math.sin(t * 5.5)) * 0.2;
      root.current.position.y = m * (idle * float + think * ponder + answer * bounce);

      const idleTurn = Math.sin(t * 0.5) * 0.3;
      const thinkTurn = -0.2 + Math.sin(t * 0.8) * 0.06;
      const answerTurn = 0.4; // face toward the chat on the right
      root.current.rotation.y = damp(
        root.current.rotation.y,
        m * (idle * idleTurn + think * thinkTurn + answer * answerTurn),
        5,
        dt
      );
      root.current.rotation.z = m * answer * Math.sin(t * 5.5) * 0.04;
    }

    // ---- Head: follow pointer (idle), ponder (thinking), nod (answering) ----
    if (head.current) {
      const yaw = idle * clamp(st.px * 0.45, -0.6, 0.6) + think * (0.35 + Math.sin(t * 1.4) * 0.12);
      const pitch = idle * clamp(st.py * 0.3, -0.35, 0.35) + think * -0.32 + answer * Math.sin(t * 7) * 0.08;
      const roll = idle * -st.px * 0.06 + think * (0.22 + Math.sin(t * 1.2) * 0.1);
      head.current.rotation.y = damp(head.current.rotation.y, m * yaw, 6, dt);
      head.current.rotation.x = damp(head.current.rotation.x, m * pitch, 6, dt);
      head.current.rotation.z = damp(head.current.rotation.z, m * roll, 6, dt);
    }

    // ---- Eyes: glance up and aside while thinking, blink now and then, brighten when answering ----
    if (eyes.current) {
      eyes.current.position.x = damp(eyes.current.position.x, think * (0.07 + Math.sin(t * 2.2) * 0.05), 6, dt);
      eyes.current.position.y = damp(eyes.current.position.y, think * 0.05, 6, dt);
    }
    if (t > st.nextBlink) {
      st.blinkStart = t;
      st.nextBlink = t + 2.5 + Math.random() * 3;
    }
    const bp = (t - st.blinkStart) / 0.16;
    const blink = bp >= 0 && bp <= 1 ? Math.sin(bp * Math.PI) : 0;
    const eyeScale = Math.max(0.08, 1 - blink) * (1 - answer * 0.25);
    eyeL.current?.scale.set(1, eyeScale, 0.5);
    eyeR.current?.scale.set(1, eyeScale, 0.5);
    mats.eye.emissiveIntensity = 2.5 + answer * 3.5;

    // ---- Mouth: talks while answering, narrows while thinking ----
    if (mouth.current) {
      const talk = (Math.sin(t * 17) * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(t * 6.3));
      mouth.current.scale.y = damp(mouth.current.scale.y, 1 + answer * talk * 3.2, 25, dt);
      mouth.current.scale.x = damp(mouth.current.scale.x, 1 - think * 0.45 + answer * 0.1, 8, dt);
      mouth.current.position.x = damp(mouth.current.position.x, think * Math.sin(t * 2.2) * 0.06, 6, dt);
    }
    mats.mouth.emissiveIntensity = 2.5 + answer * 2.5;

    // ---- Antenna and chest lights ----
    mats.bulb.emissiveIntensity =
      idle * (3 + Math.sin(t * 2)) +
      think * (3 + Math.abs(Math.sin(t * 9)) * 9) +
      answer * (5 + Math.abs(Math.sin(t * 5.5)) * 3);
    const loading = (t * 1.4) % 1; // sawtooth: ramps up then resets, like a loader
    mats.chest.emissiveIntensity =
      idle * (2 + Math.sin(t * 2) * 0.8) + think * (1 + loading * 7) + answer * (4 + Math.abs(Math.sin(t * 5.5)) * 3);

    // ---- Orbiting particle ring (thinking only) ----
    if (orbit.current) {
      orbit.current.rotation.y += dt * (reducedMotion ? 0.6 : 2.4);
      orbit.current.scale.setScalar(Math.max(think, 0.0001));
      orbit.current.visible = think > 0.02;
      orbit.current.children.forEach((c, i) => {
        c.position.y = m * Math.sin(t * 3 + i) * 0.06;
      });
    }
    mats.orbit.emissiveIntensity = 3 + Math.sin(t * 6) * 1.5;

    // Halos track their light's intensity, so the glow brightens and dims with it.
    const haloOpacity = (sprite: THREE.Sprite | null, intensity: number, base: number) => {
      if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = clamp(intensity / base, 0, 1.6) * 0.5;
    };
    haloOpacity(eyeHalo.current, mats.eye.emissiveIntensity, 4);
    haloOpacity(bulbHalo.current, mats.bulb.emissiveIntensity, 6);
    haloOpacity(chestHalo.current, mats.chest.emissiveIntensity, 5);

    // ---- Arms: sway (idle), hand to chin (thinking), explaining gestures (answering) ----
    const sway = Math.sin(t * 1.6) * 0.08;
    if (armL.current) {
      const x = idle * sway * 0.6 + think * Math.sin(t * 1.1) * 0.05 + answer * (-0.7 + Math.sin(t * 4) * 0.45);
      const z = idle * (-0.1 - sway) + think * -0.12 + answer * (-0.3 + Math.sin(t * 4) * 0.1);
      armL.current.rotation.x = damp(armL.current.rotation.x, m * x, 7, dt);
      armL.current.rotation.z = damp(armL.current.rotation.z, m * z, 7, dt);
    }
    if (armR.current) {
      const scratch = Math.sin(t * 8) * 0.07;
      const x = -idle * sway * 0.6 + think * (-2.3 + scratch) + answer * (-0.45 + Math.sin(t * 4 + Math.PI) * 0.4);
      const z = idle * (0.1 + sway) + think * -0.7 + answer * (0.25 + Math.sin(t * 4 + 1) * 0.1);
      armR.current.rotation.x = damp(armR.current.rotation.x, m * x, 7, dt);
      armR.current.rotation.z = damp(armR.current.rotation.z, m * z, 7, dt);
    }
  });

  return (
    // "head" lifts the model so the head (plus antenna) sits at the origin.
    <group position={full ? [0, -0.45, 0] : [0, -1.36, 0]}>
      <group ref={root}>
        {full && (
          <>
            {/* Body */}
            <RoundedBox args={[1.1, 0.86, 0.78]} radius={0.24} smoothness={6} material={mats.shell} />
            {/* Chest light + vent bar */}
            <mesh position={[0, 0.06, 0.39]} scale={[1, 1, 0.45]} material={mats.chest}>
              <sphereGeometry args={[0.13, 32, 32]} />
            </mesh>
            <Halo ref={chestHalo} size={0.9} position={[0, 0.06, 0.46]} />
            <RoundedBox args={[0.42, 0.05, 0.04]} radius={0.018} position={[0, -0.2, 0.39]} material={mats.joint} />

            {/* Neck joint */}
            <mesh position={[0, 0.5, 0]} material={mats.joint}>
              <cylinderGeometry args={[0.14, 0.17, 0.2, 32]} />
            </mesh>

            {/* Arms pivot at the shoulder */}
            {(
              [
                [armL, -0.68],
                [armR, 0.68],
              ] as const
            ).map(([ref, x]) => (
              <group key={x} ref={ref} position={[x, 0.26, 0]}>
                <mesh position={[0, -0.28, 0]} material={mats.joint}>
                  <capsuleGeometry args={[0.11, 0.38, 8, 24]} />
                </mesh>
                <mesh position={[0, -0.6, 0]} material={mats.shell}>
                  <sphereGeometry args={[0.14, 32, 32]} />
                </mesh>
              </group>
            ))}
          </>
        )}

        {/* Head pivots at the neck */}
        <group ref={head} position={[0, 0.6, 0]}>
          <RoundedBox args={[1.4, 1.04, 0.95]} radius={0.3} smoothness={6} position={[0, 0.55, 0]} material={mats.shell} />
          {/* Ears */}
          {[-0.74, 0.74].map((x) => (
            <mesh key={x} position={[x, 0.55, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.joint}>
              <cylinderGeometry args={[0.13, 0.13, 0.14, 32]} />
            </mesh>
          ))}
          {/* Screen face */}
          <RoundedBox args={[1.12, 0.7, 0.1]} radius={0.045} smoothness={4} position={[0, 0.53, 0.44]} material={mats.face} />
          <group ref={eyes}>
            <mesh ref={eyeL} position={[-0.25, 0.6, 0.5]} material={mats.eye}>
              <sphereGeometry args={[0.11, 32, 32]} />
            </mesh>
            <mesh ref={eyeR} position={[0.25, 0.6, 0.5]} material={mats.eye}>
              <sphereGeometry args={[0.11, 32, 32]} />
            </mesh>
          </group>
          <Halo ref={eyeHalo} size={1.1} position={[0, 0.58, 0.56]} />
          <mesh ref={mouth} position={[0, 0.36, 0.5]} material={mats.mouth}>
            <boxGeometry args={[0.32, 0.06, 0.04]} />
          </mesh>
          {/* Antenna */}
          <mesh position={[0, 1.2, 0]} material={mats.joint}>
            <cylinderGeometry args={[0.025, 0.035, 0.3, 16]} />
          </mesh>
          <mesh position={[0, 1.4, 0]} material={mats.bulb}>
            <sphereGeometry args={[0.09, 32, 32]} />
          </mesh>
          <Halo ref={bulbHalo} size={0.75} position={[0, 1.4, 0.05]} />

          {/* Orbiting particles around the head (thinking) */}
          <group position={[0, 0.55, 0]} rotation={[0.35, 0, 0.15]}>
            <group ref={orbit} visible={false}>
              {orbitPositions.map((p, i) => (
                <mesh key={i} position={p} material={mats.orbit}>
                  <sphereGeometry args={[0.035 + (i % 3) * 0.012, 16, 16]} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
