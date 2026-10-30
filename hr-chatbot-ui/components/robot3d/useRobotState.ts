"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RobotMood } from "../Robot";

// How long the robot keeps "talking" after a reply arrives, scaled to the reply length.
const talkTime = (text: string) => Math.min(Math.max(text.length * 30, 1800), 7000);
// Extra hold after talking before it eases back to idle.
const SETTLE_MS = 1000;

export function useRobotState() {
  const [state, setState] = useState<RobotMood>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const idle = useCallback(() => {
    clearTimeout(timer.current);
    setState("idle");
  }, []);

  const think = useCallback(() => {
    clearTimeout(timer.current);
    setState("thinking");
  }, []);

  const answer = useCallback((text: string) => {
    clearTimeout(timer.current);
    setState("answering");
    timer.current = setTimeout(() => setState("idle"), talkTime(text) + SETTLE_MS);
  }, []);

  return { state, idle, think, answer };
}
