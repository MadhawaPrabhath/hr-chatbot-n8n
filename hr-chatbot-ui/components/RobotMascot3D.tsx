"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RobotState } from "./RobotMascot";

const { damp, clamp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;

// ---------- Theme colors ----------
// The robot palette lives in globals.css (--rm-* on .robot-mascot, derived from the app theme).
// Those values can be color-mix() expressions, so each one is resolved to hex through a 2D canvas.

const THEME_TOKENS = ["shell", "metal-hi", "metal-lo", "edge-strong", "screen", "glow", "rim"] as const;
type ThemeColors = Record<(typeof THEME_TOKENS)[number], string>;

const FALLBACK_COLORS: ThemeColors = {
  shell: "#f6f8fa",
  "metal-hi": "#c9d0d8",
  "metal-lo": "#9aa3ad",
  "edge-strong": "#a9b2bc",
  screen: "#0c1630",
  glow: "#5ce8d6",
  rim: "#3fb3a3",
};

function readThemeColors(probe: HTMLElement): ThemeColors {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const out = { ...FALLBACK_COLORS };
  if (!ctx) return out;
  for (const token of THEME_TOKENS) {
    probe.style.color = `var(--rm-${token})`;
    const css = getComputedStyle(probe).color;
    if (!css) continue;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    out[token] = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return out;
}

// Re-reads the palette whenever the page theme (data-theme on <html>) changes.
function useThemeColors() {
  const probeRef = useRef<HTMLSpanElement>(null);
  const [colors, setColors] = useState<ThemeColors>(FALLBACK_COLORS);
  useEffect(() => {
    const update = () => probeRef.current && setColors(readThemeColors(probeRef.current));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return { probeRef, colors };
}

// ---------- Geometry helpers ----------

// Head is a superellipsoid |x/a|^n + |y/b|^n + |z/c|^n = 1: a rounded "helmet" box.
const HEAD = { a: 1.05, b: 0.72, c: 0.8, n: 3 };

function headFrontZ(x: number, y: number) {
  const { a, b, c, n } = HEAD;
  const k = 1 - Math.abs(x / a) ** n - Math.abs(y / b) ** n;
  return k > 0 ? c * k ** (1 / n) : 0;
}

function makeHeadGeometry() {
  const { a, b, c, n } = HEAD;
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 56, 36);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g); // weld the UV seam so normals are smooth all round
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (Math.abs(v.x / a) ** n + Math.abs(v.y / b) ** n + Math.abs(v.z / c) ** n) ** (-1 / n);
    p.setXYZ(i, v.x * t, v.y * t, v.z * t);
  }
  g.computeVertexNormals();
  return g;
}

// A rounded-rect panel bent onto the front of the head.
function makeScreenGeometry(w: number, h: number, r: number) {
  const { a, b, c, n } = HEAD;
  const g = new THREE.PlaneGeometry(w, h, 40, 24);
  const p = g.attributes.position;
  const nor = g.attributes.normal;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    const cx = clamp(x, -hw, hw);
    const cy = clamp(y, -hh, hh);
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) {
      x = cx + ((x - cx) / d) * r;
      y = cy + ((y - cy) / d) * r;
    }
    const z = headFrontZ(x, y);
    p.setXYZ(i, x, y, z + 0.012);
    // Analytic surface normal (gradient of the superellipsoid).
    v.set(
      (Math.sign(x) * Math.abs(x) ** (n - 1)) / a ** n,
      (Math.sign(y) * Math.abs(y) ** (n - 1)) / b ** n,
      z ** (n - 1) / c ** n,
    ).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Egg-shaped body, slightly wider at the top.
const BODY_H = 1.5;
const BODY_R = 0.78;

function bodyRadius(y: number) {
  const e = 2 * clamp(y / BODY_H, 0, 1) - 1;
  return BODY_R * Math.sqrt(Math.max(0, 1 - e * e)) * (1 + 0.1 * e);
}

function makeBodyGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const y = (BODY_H * (1 - Math.cos((Math.PI * i) / 48))) / 2;
    pts.push(new THREE.Vector2(Math.max(bodyRadius(y), 0.0001), y));
  }
  return new THREE.LatheGeometry(pts, 56);
}

// Seam ring around the body that steps down across the front.
function makeSeamGeometry() {
  const base = 0.82;
  const step = 0.07;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const ang = (i / 128) * TAU;
    const front = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    const y = base - step * (1 - smoothstep(front, 0.3, 0.42));
    const r = bodyRadius(y) + 0.004;
    pts.push(new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 256, 0.012, 6, true);
}

// Hop with anticipation squash, stretch in the air and squash on landing.
function hopCurve(p: number) {
  if (p < 0 || p >= 0.8) return { y: 0, squash: 0 };
  if (p < 0.15) return { y: 0, squash: 0.1 * Math.sin((Math.PI * p) / 0.15) };
  if (p < 0.6) {
    const q = (p - 0.15) / 0.45;
    return { y: Math.sin(Math.PI * q) * 0.4, squash: -0.07 * Math.sin(Math.PI * q) };
  }
  return { y: 0, squash: 0.08 * Math.sin((Math.PI * (p - 0.6)) / 0.2) };
}

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

// ---------- Gestures ----------
// Short one-shot animations layered over the state pose. Head/arm values are targets that
// blend in and out with an envelope; body values (y, squash, spin, lean, tilt) are offsets.
// Arms are [x, z] shoulder rotations: -x raises forward, -z raises the left arm sideways, +z the right.

type Pose = {
  y?: number;
  squash?: number;
  spin?: number;
  lean?: number;
  tilt?: number;
  hy?: number;
  hp?: number;
  hr?: number;
  l?: [number, number];
  r?: [number, number];
  face?: "open";
};
type Gesture = { dur: number; pose: (p: number, t: number) => Pose };

const bump = (p: number, a: number, b: number) => (p > a && p < b ? Math.sin((Math.PI * (p - a)) / (b - a)) : 0);
const jumpArc = (p: number, h: number) => {
  const q = hopCurve(clamp(p, 0, 1) * 0.8);
  return { y: q.y * (h / 0.4), squash: q.squash };
};
const waveR = (t: number): [number, number] => [-0.2, 2.5 + Math.sin(t * 11) * 0.35];
const waveL = (t: number): [number, number] => [-0.2, -2.5 - Math.sin(t * 11) * 0.35];

const GESTURES = {
  // Jumps
  jump: {
    dur: 1.1,
    pose: (p) => {
      const e = bump(p, 0.12, 0.85);
      return { ...jumpArc(p, 0.32), hp: -0.25 * e, l: [-0.2, -0.15 - 2.1 * e], r: [-0.2, 0.15 + 2.1 * e] };
    },
  },
  doubleHop: {
    dur: 1.2,
    pose: (p) => {
      const a = p < 0.5 ? jumpArc(p * 2, 0.22) : jumpArc((p - 0.5) * 2, 0.16);
      return { ...a, hr: 0.15 * Math.sin(TAU * p), l: [0, -0.3 - a.y * 3.5], r: [0, 0.3 + a.y * 3.5] };
    },
  },
  spinJump: {
    dur: 1.4,
    pose: (p) => {
      const e = bump(p, 0.1, 0.9);
      return { ...jumpArc(p, 0.3), spin: easeInOutCubic(clamp((p - 0.12) / 0.62, 0, 1)) * TAU, l: [0, -1.3 * e], r: [0, 1.3 * e] };
    },
  },
  jumpWave: {
    dur: 1.6,
    pose: (p, t) => ({ ...jumpArc(p / 0.7, 0.28), r: waveR(t), l: [0, -0.15 - 1.6 * bump(p, 0.05, 0.65)], hp: -0.15 }),
  },
  spinWave: {
    dur: 1.6,
    pose: (p, t) => ({ ...jumpArc(p / 0.75, 0.25), spin: easeInOutCubic(clamp(p / 0.55, 0, 1)) * TAU, r: waveR(t), hr: -0.1 }),
  },
  cheer: {
    dur: 1.8,
    pose: (p, t) => {
      const pump = Math.sin(t * 12) * 0.25;
      return { ...jumpArc(p < 0.5 ? p * 2 : (p - 0.5) * 2, 0.28), l: [-0.35, -2.5 + pump], r: [-0.35, 2.5 - pump], hp: -0.2 };
    },
  },
  flap: {
    dur: 1.6,
    pose: (p, t) => {
      const f = 0.5 + 0.5 * Math.sin(t * 16);
      return { y: 0.25 * bump(p, 0, 1), l: [0, -0.4 - 0.9 * f], r: [0, 0.4 + 0.9 * f], hp: -0.1 };
    },
  },
  dance: {
    dur: 2.8,
    pose: (p) => {
      const s = Math.sin(2 * TAU * p);
      return {
        tilt: 0.12 * s,
        y: 0.07 * Math.abs(s),
        l: [-0.3, -0.35 - 1.0 * Math.max(0, s)],
        r: [-0.3, 0.35 + 1.0 * Math.max(0, -s)],
        hr: -0.15 * s,
        hy: 0.15 * s,
      };
    },
  },
  // Head motions
  lookAround: {
    dur: 2.8,
    pose: (p) => ({ hy: 0.6 * Math.sin(TAU * p), hp: -0.08 * bump(p, 0, 1), spin: 0.12 * Math.sin(TAU * p), face: "open" }),
  },
  nod: { dur: 1.3, pose: (p) => ({ hp: 0.12 + 0.16 * Math.sin(3 * TAU * p), hr: 0.05 }) },
  tilt: {
    dur: 2,
    pose: (p) => ({ hr: 0.32 * (bump(p, 0, 0.5) - bump(p, 0.5, 1)), hy: 0.12 * Math.sin(TAU * p), face: "open" }),
  },
  // Glances up and around while scratching its head (leaves roll alone so the head stays clear of the hand).
  ponder: { dur: 2.4, pose: (p) => ({ hy: -0.15 - 0.25 * Math.sin(TAU * p), hp: -0.38 }) },
  // Hand motions
  wave: { dur: 1.8, pose: (_, t) => ({ r: waveR(t), hr: -0.12, hy: 0.15 }) },
  waveLeft: { dur: 1.8, pose: (_, t) => ({ l: waveL(t), hr: 0.12, hy: -0.15 }) },
  point: {
    dur: 2.2,
    pose: (p) => ({ r: [-1.3, 0.9], hy: 0.5, hp: 0.05, hr: -0.08, spin: 0.25 * bump(p, 0, 1), face: "open" }),
  },
  stretch: {
    dur: 2.6,
    pose: (p) => {
      const e = bump(p, 0.15, 0.85);
      return { l: [-0.3, -2.7], r: [-0.3, 2.7], hp: -0.3, squash: -0.07 * e, y: 0.06 * e, tilt: 0.06 * Math.sin(TAU * p) };
    },
  },
  shrug: {
    dur: 1.4,
    pose: (p) => {
      const e = bump(p, 0, 1);
      return { l: [-0.25, -0.7], r: [-0.25, 0.7], hr: 0.18, hp: -0.05, y: 0.05 * e, squash: 0.04 * e };
    },
  },
  bow: {
    dur: 2,
    pose: (p) => {
      const e = smoothstep(p, 0, 0.3) * (1 - smoothstep(p, 0.7, 1));
      return { lean: 0.35 * e, hp: 0.3, l: [-0.25, -0.1], r: [-0.25, 0.1] };
    },
  },
} satisfies Record<string, Gesture>;

type GestureName = keyof typeof GESTURES;
type GestureSource = "ambient" | "happy" | "click";

// Played at random while the robot is in a state (none while it's upset).
const AMBIENT: Record<RobotState, GestureName[]> = {
  idle: ["lookAround", "nod", "tilt", "wave", "waveLeft", "stretch", "flap", "point", "dance", "doubleHop", "jump", "shrug", "bow"],
  listening: ["nod"],
  thinking: ["ponder"],
  happy: [],
  error: [],
};
const CELEBRATE: GestureName[] = ["jumpWave", "spinJump", "cheer", "dance"];
const CLICK_TRICKS: GestureName[] = ["spinWave", "jump", "cheer", "flap", "dance", "bow", "doubleHop"];

function pick(pool: GestureName[], last?: GestureName) {
  const options = pool.length > 1 ? pool.filter((g) => g !== last) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

const mix = (base: number, v: number | undefined, k: number) => (v === undefined ? base : base + (v - base) * k);

// Show/hide a face part by scaling it in place, so swaps morph instead of popping.
function fade(obj: THREE.Object3D | null, on: boolean, dt: number, size = 1) {
  if (!obj) return;
  const s = damp(obj.scale.x, on ? size : 0, 14, dt);
  obj.scale.setScalar(s);
  obj.visible = s > 0.01;
}

// Fade each part of a set (scaling the parent would also pull the parts into the head).
function fadeAll(group: THREE.Object3D | null, on: boolean, dt: number) {
  group?.children.forEach((c) => fade(c, on, dt));
}

// ---------- Robot ----------

function Robot({ state, colors }: { state: RobotState; colors: ThemeColors }) {
  const clock = useThree((s) => s.clock);

  const assets = useMemo(() => {
    const white = new THREE.MeshPhysicalMaterial({
      color: "#f6f8fa",
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const grey = new THREE.MeshPhysicalMaterial({ color: "#c9d0d8", roughness: 0.3, metalness: 0.15, clearcoat: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.35, metalness: 0.5 });
    const seam = new THREE.MeshStandardMaterial({ color: "#a9b2bc", roughness: 0.5 });
    const screen = new THREE.MeshPhysicalMaterial({
      color: "#0c1630",
      roughness: 0.15,
      clearcoat: 1,
      emissive: FALLBACK_COLORS.glow,
      emissiveIntensity: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: "#000000",
      emissive: FALLBACK_COLORS.glow,
      emissiveIntensity: 1.3,
      toneMapped: false,
    });
    return {
      white,
      grey,
      metal,
      seam,
      screen,
      glow,
      head: makeHeadGeometry(),
      face: makeScreenGeometry(1.62, 0.98, 0.34),
      body: makeBodyGeometry(),
      seamRing: makeSeamGeometry(),
      arc: new THREE.TorusGeometry(0.15, 0.045, 10, 28, Math.PI),
      smallArc: new THREE.TorusGeometry(0.1, 0.035, 10, 24, Math.PI),
      dot: new THREE.SphereGeometry(1, 20, 14),
      flat: new THREE.CapsuleGeometry(0.032, 0.14, 4, 10),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(assets).forEach((a) => a.dispose());
    },
    [assets],
  );

  useEffect(() => {
    assets.white.color.set(colors.shell);
    assets.grey.color.set(colors["metal-hi"]);
    assets.metal.color.set(colors["metal-lo"]);
    assets.seam.color.set(colors["edge-strong"]);
    assets.screen.color.set(colors.screen);
    assets.screen.emissive.set(colors.glow);
    assets.glow.emissive.set(colors.glow);
  }, [assets, colors]);

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const blink = useRef<THREE.Group>(null);
  const eyesArc = useRef<THREE.Group>(null);
  const eyesOpen = useRef<THREE.Group>(null);
  const eyesSad = useRef<THREE.Group>(null);
  const eyesThink = useRef<THREE.Group>(null);
  const thinkDots = useRef<(THREE.Mesh | null)[]>([]);
  const scan = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const flat = useRef<THREE.Mesh>(null);
  const frown = useRef<THREE.Mesh>(null);

  const hovered = useRef(false);
  const motion = useRef({ bodyYaw: 0, lean: 0, droop: 0, gy: 0, gsquash: 0, gspin: 0, glean: 0, gtilt: 0, think: 0 });
  const timers = useRef({ stateAt: 0, blinkAt: 2, nextGestureAt: 3, clickTrick: 0 });
  const gesture = useRef<{ name: GestureName; start: number; source: GestureSource } | null>(null);
  const lastGesture = useRef<GestureName | undefined>(undefined);

  const endGesture = (t: number) => {
    gesture.current = null;
    // Drop completed turns so the next gesture doesn't unwind them.
    motion.current.gspin -= TAU * Math.round(motion.current.gspin / TAU);
    timers.current.nextGestureAt = t + 3.5 + Math.random() * 4;
  };
  const startGesture = (name: GestureName, source: GestureSource, t: number) => {
    endGesture(t);
    gesture.current = { name, start: t, source };
    lastGesture.current = name;
  };

  useEffect(() => {
    const t = clock.elapsedTime;
    timers.current.stateAt = t;
    const g = gesture.current;
    if (state === "happy" && g?.source !== "click") startGesture(pick(CELEBRATE, lastGesture.current), "happy", t);
    else if (g?.source === "ambient") endGesture(t);
    else timers.current.nextGestureAt = Math.max(timers.current.nextGestureAt, t + 2 + Math.random() * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, clock]);

  // Reset the hover cursor if the robot unmounts while hovered.
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    []
  );

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    const T = timers.current;
    const M = motion.current;
    const since = t - T.stateAt;

    // Random blinks (3-5s).
    const blinking = t >= T.blinkAt && t < T.blinkAt + 0.14;
    if (t >= T.blinkAt + 0.14) T.blinkAt = t + 3 + Math.random() * 2;

    // ----- Gestures -----
    if (!gesture.current && t >= T.nextGestureAt) {
      const pool = AMBIENT[state];
      if (pool.length) startGesture(pick(pool, lastGesture.current), "ambient", t);
      else T.nextGestureAt = t + 2;
    }
    let P: Pose = {};
    let env = 0;
    const g = gesture.current;
    if (g) {
      const p = (t - g.start) / GESTURES[g.name].dur;
      if (p >= 1) endGesture(t);
      else {
        P = GESTURES[g.name].pose(p, t);
        env = smoothstep(p, 0, 0.15) * (1 - smoothstep(p, 0.85, 1));
      }
    }

    // ----- Body: float, gesture jumps/spins, sway, lean -----
    if (root.current) {
      const float = Math.sin((t * TAU) / 3) * 0.08;
      M.gy = damp(M.gy, P.y ?? 0, 18, dt);
      M.gsquash = damp(M.gsquash, P.squash ?? 0, 18, dt);
      M.gspin = damp(M.gspin, P.spin ?? 0, 16, dt);
      M.glean = damp(M.glean, P.lean ?? 0, 8, dt);
      M.gtilt = damp(M.gtilt, P.tilt ?? 0, 10, dt);
      M.droop = damp(M.droop, state === "error" ? -0.08 : 0, 4, dt);
      root.current.position.y = 0.2 + float + M.gy + M.droop;
      root.current.scale.set(1 + M.gsquash * 0.6, 1 - M.gsquash, 1 + M.gsquash * 0.6);

      M.bodyYaw = damp(M.bodyYaw, Math.sin(t * 0.45) * 0.09, 3, dt);
      root.current.rotation.y = M.bodyYaw + M.gspin;

      const leanTarget = state === "listening" ? 0.08 : hovered.current ? 0.1 : state === "error" ? 0.05 : 0;
      M.lean = damp(M.lean, leanTarget, 4, dt);
      root.current.rotation.x = M.lean + M.glean;
      // Thinking: a slow side-to-side rock, faded in/out so it never snaps.
      M.think = damp(M.think, state === "thinking" ? 1 : 0, 4, dt);
      root.current.rotation.z = M.gtilt + M.think * Math.sin(t * 1.8) * 0.05;
    }

    // ----- Head -----
    if (head.current) {
      // Faces forward by default; states and gestures turn it.
      let yaw = 0;
      let pitch = 0;
      let roll = 0;
      if (state === "listening") {
        // Toward the chat column / input box (right and below).
        yaw = 0.5;
        pitch = 0.22;
        roll = -0.08;
      } else if (state === "thinking") {
        // Looks up and away from the scratching hand.
        yaw = -0.25;
        pitch = -0.3;
        roll = 0.2;
      } else if (state === "error") {
        yaw = Math.sin(since * 16) * 0.25 * Math.max(0, 1 - since / 1.2); // shake "no"
        pitch = 0.38;
        roll = -0.08;
      }
      yaw = mix(yaw, P.hy, env);
      pitch = mix(pitch, P.hp, env);
      roll = mix(roll, P.hr, env);
      const k = state === "error" && since < 1.2 ? 14 : 6;
      head.current.rotation.y = damp(head.current.rotation.y, yaw, k, dt);
      head.current.rotation.x = damp(head.current.rotation.x, pitch, 6, dt);
      head.current.rotation.z = damp(head.current.rotation.z, roll, 5, dt);
    }

    // ----- Arms -----
    const swing = Math.sin(t * 1.6);
    if (armL.current) {
      const a = armL.current.rotation;
      const droop = state === "error";
      const x = droop ? 0.12 : swing * 0.12;
      const z = droop ? -0.06 : state === "thinking" ? -0.35 : -0.15 - swing * 0.03;
      a.x = damp(a.x, mix(x, P.l?.[0], env), 8, dt);
      a.z = damp(a.z, mix(z, P.l?.[1], env), 8, dt);
    }
    if (armR.current) {
      const a = armR.current.rotation;
      let x = Math.sin(t * 1.6 + 1.2) * 0.12;
      let z = 0.15 + Math.sin(t * 1.6 + 1.2) * 0.03;
      if (state === "thinking") {
        // Hand up beside the head, scratching.
        const scratch = Math.sin(t * 14);
        x = -0.3 + scratch * 0.06;
        z = 2.85 + scratch * 0.1;
      } else if (state === "error") {
        x = 0.12;
        z = 0.06;
      }
      a.x = damp(a.x, mix(x, P.r?.[0], env), 8, dt);
      a.z = damp(a.z, mix(z, P.r?.[1], env), 8, dt);
    }

    // ----- Face -----
    const curiousEyes = state === "idle" && P.face === "open" && env > 0.5;
    fadeAll(eyesArc.current, (state === "idle" && !curiousEyes) || state === "happy", dt);
    fadeAll(eyesOpen.current, state === "listening" || curiousEyes, dt);
    fadeAll(eyesSad.current, state === "error", dt);
    fadeAll(eyesThink.current, state === "thinking", dt);
    fade(smile.current, state === "idle" || state === "listening" || state === "happy", dt, state === "happy" ? 1.35 : 1);
    fade(flat.current, state === "thinking", dt);
    fade(frown.current, state === "error", dt);
    if (blink.current) {
      blink.current.scale.y = damp(blink.current.scale.y, blinking ? 0.1 : 1, 30, dt);
    }
    thinkDots.current.forEach((d, i) => {
      if (d) d.position.y = Math.max(0, Math.sin(t * 7 - i * 0.7)) * 0.09;
    });
    if (scan.current) {
      const y = Math.sin(t * 2.4) * 0.32;
      scan.current.position.set(0, y, headFrontZ(0, y) + 0.02);
      scan.current.scale.x = damp(scan.current.scale.x, state === "thinking" ? 1 : 0, 10, dt);
      scan.current.visible = scan.current.scale.x > 0.01;
    }

    const glowTarget = state === "error" ? 0.55 : state === "thinking" ? 1.3 + Math.sin(t * 6) * 0.5 : 1.3;
    assets.glow.emissiveIntensity = damp(assets.glow.emissiveIntensity, glowTarget, 6, dt);
    const screenTarget = state === "thinking" ? 0.12 + Math.sin(t * 6) * 0.08 : state === "error" ? 0.01 : 0.04;
    assets.screen.emissiveIntensity = damp(assets.screen.emissiveIntensity, screenTarget, 6, dt);
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    hovered.current = false;
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Each click plays the next trick (ignored while one is still playing).
    if (gesture.current?.source === "click") return;
    const T = timers.current;
    startGesture(CLICK_TRICKS[T.clickTrick % CLICK_TRICKS.length], "click", clock.elapsedTime);
    T.clickTrick++;
  };

  const fz = (x: number, y: number) => headFrontZ(x, y) + 0.02;

  return (
    <group ref={root} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      {/* Body */}
      <mesh geometry={assets.body} material={assets.white} />
      <mesh geometry={assets.seamRing} material={assets.seam} />
      <mesh position={[0, 1.52, 0]} material={assets.metal}>
        <cylinderGeometry args={[0.24, 0.27, 0.3, 24]} />
      </mesh>

      {/* Arms on shoulder pivots */}
      <group ref={armL} position={[-0.86, 1.18, 0]}>
        <mesh position={[0, -0.42, 0]} material={assets.white}>
          <capsuleGeometry args={[0.19, 0.5, 8, 16]} />
        </mesh>
      </group>
      <group ref={armR} position={[0.86, 1.18, 0]}>
        <mesh position={[0, -0.42, 0]} material={assets.white}>
          <capsuleGeometry args={[0.19, 0.5, 8, 16]} />
        </mesh>
      </group>

      {/* Head on a neck pivot */}
      <group ref={head} position={[0, 1.6, 0]} rotation={[0, 0, 0, "YXZ"]}>
        <group position={[0, 0.68, 0]}>
          <mesh geometry={assets.head} material={assets.white} />
          <RoundedBox args={[0.55, 0.22, 0.45]} radius={0.09} position={[0, 0.69, 0]} material={assets.white} />
          <RoundedBox args={[0.2, 0.5, 0.46]} radius={0.08} position={[-1.07, 0, 0]} material={assets.grey} />
          <RoundedBox args={[0.2, 0.5, 0.46]} radius={0.08} position={[1.07, 0, 0]} material={assets.grey} />
          <mesh geometry={assets.face} material={assets.screen} />

          {/* Eyes (blink scales this group on Y) */}
          <group ref={blink} position={[0, 0.1, 0]}>
            <group ref={eyesArc}>
              <mesh geometry={assets.arc} material={assets.glow} position={[-0.36, -0.04, fz(-0.36, 0.06)]} />
              <mesh geometry={assets.arc} material={assets.glow} position={[0.36, -0.04, fz(0.36, 0.06)]} />
            </group>
            <group ref={eyesOpen}>
              {[-0.36, 0.36].map((x) => (
                <group key={x} position={[x, 0, fz(x, 0.1)]} scale={0}>
                  <mesh geometry={assets.dot} material={assets.glow} scale={[0.12, 0.12, 0.04]} />
                </group>
              ))}
            </group>
            <group ref={eyesSad}>
              <mesh
                geometry={assets.arc}
                material={assets.glow}
                position={[-0.36, -0.06, fz(-0.36, 0.04)]}
                rotation={[0, 0, 0.4]}
                scale={0}
              />
              <mesh
                geometry={assets.arc}
                material={assets.glow}
                position={[0.36, -0.06, fz(0.36, 0.04)]}
                rotation={[0, 0, -0.4]}
                scale={0}
              />
            </group>
          </group>
          <group ref={eyesThink} position={[0, 0.06, 0]}>
            {[-0.24, 0, 0.24].map((x, i) => (
              <group key={x} position={[x, 0, fz(x, 0.06)]} scale={0}>
                <mesh
                  ref={(m) => {
                    thinkDots.current[i] = m;
                  }}
                  geometry={assets.dot}
                  material={assets.glow}
                  scale={[0.07, 0.07, 0.03]}
                />
              </group>
            ))}
          </group>
          <mesh ref={scan} material={assets.glow} scale={[0, 1, 1]}>
            <boxGeometry args={[1.3, 0.018, 0.005]} />
          </mesh>

          {/* Mouth */}
          <mesh
            ref={smile}
            geometry={assets.smallArc}
            material={assets.glow}
            position={[0, -0.2, fz(0, -0.2)]}
            rotation={[0, 0, Math.PI]}
          />
          <mesh
            ref={flat}
            geometry={assets.flat}
            material={assets.glow}
            position={[0, -0.22, fz(0, -0.22)]}
            rotation={[0, 0, Math.PI / 2]}
            scale={0}
          />
          <mesh ref={frown} geometry={assets.smallArc} material={assets.glow} position={[0, -0.28, fz(0, -0.28)]} scale={0} />
        </group>
      </group>
    </group>
  );
}

// ---------- Canvas ----------

export default function RobotMascot3D({ state, onReady }: { state: RobotState; onReady?: () => void }) {
  // Stop rendering entirely while the tab is hidden.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const { probeRef, colors } = useThemeColors();

  return (
    <>
      {/* Resolves the --rm-* theme tokens (see useThemeColors) */}
      <span ref={probeRef} hidden />
      <Canvas
        className="rm-canvas"
        dpr={[1, 1.5]}
        frameloop={visible ? "always" : "never"}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        camera={{ position: [0, 2, 9.2], fov: 28 }}
        // Listen on the page so the canvas itself never blocks clicks; only robot meshes are hit-tested.
        eventSource={document.body}
        eventPrefix="client"
        style={{ pointerEvents: "none" }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 1.9, 0);
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.NeutralToneMapping; // keeps light shells from washing out
          onReady?.();
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 6]} intensity={2.2} />
        <directionalLight position={[-3, 3, -5]} intensity={3} color={colors.rim} />
        <directionalLight position={[3, 2, -5]} intensity={1.5} color={colors.rim} />
        <Environment resolution={64}>
          <Lightformer form="rect" intensity={2} position={[0, 5, -1]} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[-5, 1, 3]} scale={[3, 6, 1]} />
          <Lightformer form="rect" intensity={1} color={colors.rim} position={[5, 1, -4]} scale={[4, 5, 1]} />
        </Environment>

        <Robot state={state} colors={colors} />

        <ContactShadows position={[0, -0.12, 0]} scale={4} blur={2.4} far={3} opacity={0.55} resolution={256} frames={Infinity} />
      </Canvas>
    </>
  );
}
