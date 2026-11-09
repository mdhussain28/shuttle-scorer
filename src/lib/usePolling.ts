"use client";

import { useEffect, useRef } from "react";

/** Runs `fn` now and then every `ms` while the tab is visible. A hidden tab pauses and refreshes when it returns. */
export function usePolling(fn: () => Promise<void>, ms: number): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") {
        try {
          await latest.current();
        } catch {
          /* keep polling; the next round may succeed */
        }
      }
      if (alive) timer = setTimeout(tick, ms);
    };
    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}
