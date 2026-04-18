import { useEffect, useRef, useState } from "react";
import { TIMELINE } from "./timeline";

export const useTimeline = (opts: { loop?: boolean; playing?: boolean } = {}) => {
  const { loop = true, playing = true } = opts;
  const [time, setTime] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;

      if (elapsed >= TIMELINE.total) {
        if (loop) {
          startRef.current = now;
          setTime(0);
        } else {
          setTime(TIMELINE.total);
          return;
        }
      } else {
        setTime(elapsed);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
  }, [loop, playing]);

  return time;
};
