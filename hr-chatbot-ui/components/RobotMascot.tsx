"use client";

import { Component, useEffect, useId, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

export type RobotState = "idle" | "listening" | "thinking" | "happy" | "error";

// Colors come from the app theme (see --rm-* tokens in globals.css). SVG presentation
// attributes can't read CSS variables, so they're applied through style.
const c = (token: string) => `var(--rm-${token})`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// three.js needs the browser, so the 3D robot is never server-rendered.
const RobotMascot3D = dynamic(() => import("./RobotMascot3D"), { ssr: false });

// 3D only where there's room for it (the gutter beside the 760px column) and motion is welcome.
const MODE_3D_QUERY = "(min-width: 1280px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useCan3D() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (!supportsWebGL()) return;
    const mq = window.matchMedia(MODE_3D_QUERY);
    const update = () => setCan(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return can;
}

// If the 3D scene crashes (e.g. lost WebGL context), fall back to the SVG robot.
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Decorative mascot shown beside the chat: a 3D robot on large screens, the SVG robot otherwise.
// The SVG stays underneath until the 3D canvas is ready, then fades out.
export default function RobotMascot({ state = "idle" }: { state?: RobotState }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const use3D = can3D && !failed;

  useEffect(() => {
    if (!use3D) setReady(false);
  }, [use3D]);

  return (
    <div className={`robot-mascot${use3D ? " is-3d" : ""}${use3D && ready ? " is-ready" : ""}`} aria-hidden="true">
      <RobotMascotSVG state={state} />
      {use3D && (
        <SceneBoundary onError={() => setFailed(true)}>
          <RobotMascot3D state={state} onReady={() => setReady(true)} />
        </SceneBoundary>
      )}
    </div>
  );
}

// Every eye/mouth variant is always drawn and cross-faded via CSS (see .rm-* in
// globals.css), so state changes never jump.
function RobotMascotSVG({ state }: { state: RobotState }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `rm-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const [blinking, setBlinking] = useState(false);
  const [poked, setPoked] = useState(false);

  // Blink at random 3-5s intervals.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlinking(true);
        timer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 140);
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!poked) return;
    const t = setTimeout(() => setPoked(false), 1500);
    return () => clearTimeout(t);
  }, [poked]);

  const classes = ["rm", blinking && state !== "thinking" ? "is-blinking" : "", poked ? "is-poked" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <svg className={classes} data-state={state} viewBox="0 0 200 300" focusable="false">
      <defs>
        <radialGradient id={id("shell")} cx="35%" cy="28%" r="80%">
          <stop offset="0%" style={{ stopColor: c("shell-hi") }} />
          <stop offset="55%" style={{ stopColor: c("shell") }} />
          <stop offset="100%" style={{ stopColor: c("shell-lo") }} />
        </radialGradient>
        <linearGradient id={id("metal")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: c("metal-lo") }} />
          <stop offset="50%" style={{ stopColor: c("metal-hi") }} />
          <stop offset="100%" style={{ stopColor: c("metal-lo") }} />
        </linearGradient>
        <linearGradient id={id("screen")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: c("screen-hi") }} />
          <stop offset="100%" style={{ stopColor: c("screen") }} />
        </linearGradient>
        <radialGradient id={id("screen-glow")} cx="50%" cy="50%" r="60%">
          <stop offset="0%" style={{ stopColor: c("glow"), stopOpacity: 0.45 }} />
          <stop offset="100%" style={{ stopColor: c("glow"), stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={id("shadow")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: c("shadow"), stopOpacity: 0.45 }} />
          <stop offset="100%" style={{ stopColor: c("shadow"), stopOpacity: 0 }} />
        </radialGradient>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={id("screen-clip")}>
          <rect x="54" y="52" width="92" height="64" rx="24" />
        </clipPath>
        <clipPath id={id("body-clip")}>
          <path d="M100 140 C138 140 156 170 154 206 C152 242 130 264 100 264 C70 264 48 242 46 206 C44 170 62 140 100 140 Z" />
        </clipPath>
      </defs>

      <ellipse className="rm-shadow" cx="100" cy="286" rx="48" ry="8" fill={url("shadow")} />

      <g className="rm-float">
        <g className="rm-pose">
          <g className="rm-jump">
            <g className="rm-hit" onClick={() => setPoked(true)}>
              {/* Arms sit behind the body so the shoulders are hidden */}
              <g className="rm-arm rm-arm-l">
                <rect x="30" y="158" width="18" height="60" rx="9" fill={url("shell")} strokeWidth="1" style={{ stroke: c("edge") }} />
              </g>
              <g className="rm-arm rm-arm-r">
                <rect x="152" y="158" width="18" height="60" rx="9" fill={url("shell")} strokeWidth="1" style={{ stroke: c("edge") }} />
              </g>

              {/* Body */}
              <rect x="88" y="126" width="24" height="18" rx="5" fill={url("metal")} />
              <path
                d="M100 140 C138 140 156 170 154 206 C152 242 130 264 100 264 C70 264 48 242 46 206 C44 170 62 140 100 140 Z"
                fill={url("shell")}
                strokeWidth="1"
                style={{ stroke: c("edge") }}
              />
              <path
                clipPath={url("body-clip")}
                d="M40 204 H82 L88 210 H112 L118 204 H160"
                fill="none"
                style={{ stroke: c("edge-strong") }}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <ellipse cx="82" cy="166" rx="16" ry="9" opacity="0.7" style={{ fill: c("gloss") }} transform="rotate(-20 82 166)" />

              {/* Head */}
              <g className="rm-head-pose">
                <g className="rm-head-idle">
                  <rect x="88" y="22" width="24" height="18" rx="9" fill={url("shell")} strokeWidth="1" style={{ stroke: c("edge") }} />
                  <rect x="28" y="64" width="16" height="36" rx="8" fill={url("metal")} />
                  <rect x="156" y="64" width="16" height="36" rx="8" fill={url("metal")} />
                  <rect x="40" y="32" width="120" height="100" rx="46" ry="44" fill={url("shell")} strokeWidth="1" style={{ stroke: c("edge") }} />
                  <ellipse cx="72" cy="46" rx="20" ry="8" opacity="0.8" style={{ fill: c("gloss") }} transform="rotate(-18 72 46)" />

                  {/* Face screen */}
                  <rect x="54" y="52" width="92" height="64" rx="24" fill={url("screen")} />
                  <g clipPath={url("screen-clip")}>
                    <rect className="rm-screen-glow" x="54" y="52" width="92" height="64" fill={url("screen-glow")} />
                    <rect className="rm-scan" x="54" y="52" width="92" height="3" style={{ fill: c("glow") }} />
                    <ellipse cx="80" cy="58" rx="22" ry="5" fill="#fff" opacity="0.06" />
                  </g>
                  <rect className="rm-screen-edge" x="54" y="52" width="92" height="64" rx="24" fill="none" strokeWidth="1.5" style={{ stroke: c("glow") }} />

                  <g className="rm-face" filter={url("glow")} fill="none" strokeLinecap="round" style={{ stroke: c("glow") }}>
                    <g className="rm-eyes">
                      <g className="rm-gaze">
                        <g className="rm-v rm-eyes-happy" strokeWidth="5">
                          <path d="M71 86 Q80 72 89 86" />
                          <path d="M111 86 Q120 72 129 86" />
                        </g>
                        <g className="rm-v rm-eyes-open" stroke="none" style={{ fill: c("glow") }}>
                          <circle cx="80" cy="82" r="7" />
                          <circle cx="120" cy="82" r="7" />
                        </g>
                        <g className="rm-v rm-eyes-think" stroke="none" style={{ fill: c("glow") }}>
                          <circle className="rm-dot" cx="84" cy="84" r="4.5" />
                          <circle className="rm-dot" cx="100" cy="84" r="4.5" />
                          <circle className="rm-dot" cx="116" cy="84" r="4.5" />
                        </g>
                        <g className="rm-v rm-eyes-sad" strokeWidth="4.5">
                          <path d="M71 80 Q80 90 89 85" />
                          <path d="M111 85 Q120 90 129 80" />
                        </g>
                      </g>
                    </g>
                    <g className="rm-mouth" strokeWidth="3.5">
                      <path className="rm-v rm-mouth-smile" d="M93 100 Q100 106 107 100" />
                      <path className="rm-v rm-mouth-grin" d="M90 99 Q100 110 110 99" />
                      <path className="rm-v rm-mouth-flat" d="M94 103 H106" />
                      <path className="rm-v rm-mouth-frown" d="M93 106 Q100 100 107 106" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
