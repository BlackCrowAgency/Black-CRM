"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useMediaQuery";

/**
 * Interpola un número escribiendo directamente en el DOM (sin re-renderizar
 * React en cada fotograma). Devuelve la ref del nodo de texto.
 */
export function useAnimatedNumber<T extends HTMLElement>(value: number, format: (v: number) => string, duration = 520) {
  const ref = useRef<T>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (reduce || from === value || !Number.isFinite(from) || !Number.isFinite(value)) {
      shown.current = value;
      el.textContent = format(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      shown.current = v;
      el.textContent = format(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format, duration, reduce]);

  return ref;
}
