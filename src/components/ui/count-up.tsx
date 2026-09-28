"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Número que se anima desde el valor anterior hasta el nuevo. */
export function CountUp({ value, format, duration = 0.9 }: { value: number | null; format: (n: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value ?? 0);
  const from = useRef(0);

  useEffect(() => {
    if (value === null || reduce) return;
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  if (value === null) return <>—</>;
  return <>{format(reduce ? value : display)}</>;
}
