"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import Robot, { type RobotMood } from "../Robot";
import type { RobotVariant } from "./RobotModel";

export { useRobotState } from "./useRobotState";

// three.js needs the browser, so the scene is never server-rendered.
const RobotScene = dynamic(() => import("./RobotScene"), { ssr: false });

// If WebGL is unavailable or the scene crashes, keep showing the static robot.
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

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

const STATUS: Record<RobotMood, string> = {
  idle: "Ready to help",
  thinking: "Searching policies…",
  answering: "Answering…",
};

/** Small label with a colored dot that cross-fades as the robot's state changes. */
export function RobotStatus({ state, className = "" }: { state: RobotMood; className?: string }) {
  return (
    <div className={`robot-status ${state} ${className}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {STATUS[state]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

type Props = {
  state: RobotMood;
  /** "full" for the standing robot, "head" for the small header avatar. */
  variant?: RobotVariant;
  /** Shown while the 3D scene loads, or for good if WebGL fails. */
  fallback?: ReactNode;
};

export default function Robot3D({ state: mood, variant = "full", fallback }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <div className={`robot3d ${variant} ${status}`}>
      {status !== "ready" && <div className="robot3d-fallback">{fallback ?? <Robot mood={mood} />}</div>}
      <SceneBoundary onError={() => setStatus("failed")}>
        <div className="robot3d-canvas">
          <RobotScene
            mood={mood}
            reducedMotion={reducedMotion}
            variant={variant}
            onReady={() => setStatus("ready")}
          />
        </div>
      </SceneBoundary>
    </div>
  );
}
