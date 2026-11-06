import type { ReactNode } from "react";

// A small set of static line icons (24x24, drawn with the current text colour).
// None of them animate.

export type IconName =
  | "arrow-left" | "arrow-up" | "arrow-down" | "chevron-down" | "chevron-right"
  | "x" | "plus" | "check" | "undo" | "clock" | "trophy" | "trash" | "pencil"
  | "layers" | "bracket" | "bolt" | "shuttle" | "play" | "info" | "user"
  | "logout" | "sliders" | "alert" | "lock" | "flag" | "swap";

const SHAPES: Record<IconName, ReactNode> = {
  "arrow-left": <path d="M19 12H5M12 19l-7-7 7-7" />,
  "arrow-up": <path d="M12 19V5M5 12l7-7 7 7" />,
  "arrow-down": <path d="M12 5v14M19 12l-7 7-7-7" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6L9 17l-5-5" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  bracket: <path d="M3 5h6v4H3zM3 15h6v4H3zM9 7h3v10H9M12 12h3M15 10h6v4h-6z" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  shuttle: (
    <>
      <circle cx="12" cy="20" r="1.8" />
      <path d="M9.5 18L6 6c3.2-1.6 8.8-1.6 12 0l-3.5 12M12 6v12M9.8 6.5L10.6 18M14.2 6.5L13.4 18" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8V4z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  logout: <path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  alert: <path d="M12 3l10 18H2L12 3zM12 10v4M12 17.5h.01" />,
  lock: <path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  swap: <path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />,
};

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {SHAPES[name]}
    </svg>
  );
}
