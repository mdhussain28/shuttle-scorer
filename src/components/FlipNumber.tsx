"use client";

import { useEffect, useRef, useState } from "react";

/** One digit drawn as a split-flap card. When the value changes the top half folds down and reveals the new digit. */
function FlipDigit({ value }: { value: string }) {
  const [curr, setCurr] = useState(value);
  const [prev, setPrev] = useState(value);
  const [run, setRun] = useState(0);
  const shown = useRef(value);

  useEffect(() => {
    if (value === shown.current) return;
    setPrev(shown.current);
    setCurr(value);
    shown.current = value;
    setRun((n) => n + 1);
    const t = setTimeout(() => setPrev(value), 640);
    return () => clearTimeout(t);
  }, [value]);

  const flipping = run > 0 && prev !== curr;
  return (
    <span className="flip" aria-hidden="true">
      <span className="flip-half flip-top">
        <span>{curr}</span>
      </span>
      <span className="flip-half flip-bottom">
        <span>{prev}</span>
      </span>
      {flipping && (
        <>
          <span key={`t${run}`} className="flip-leaf flip-leaf-top">
            <span>{prev}</span>
          </span>
          <span key={`b${run}`} className="flip-leaf flip-leaf-bottom">
            <span>{curr}</span>
          </span>
        </>
      )}
    </span>
  );
}

/** A number made of flip cards. Size it with a text-size class, the cards scale with the font. */
export function FlipNumber({ value, className = "" }: { value: number; className?: string }) {
  const s = String(Math.max(0, Math.trunc(value)));
  return (
    <span className={`flip-group ${className}`} role="text" aria-label={s}>
      {s.split("").map((d, i) => (
        <FlipDigit key={s.length - i} value={d} />
      ))}
    </span>
  );
}
