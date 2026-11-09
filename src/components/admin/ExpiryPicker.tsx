"use client";

export type ExpiryMode = "never" | "1d" | "3d" | "7d" | "30d" | "90d" | "custom";
export interface ExpiryChoice {
  mode: ExpiryMode;
  /** Value of a datetime-local input, used when mode is "custom". */
  custom: string;
}

export const NEVER: ExpiryChoice = { mode: "never", custom: "" };

const DAYS: Record<string, number> = { "1d": 1, "3d": 3, "7d": 7, "30d": 30, "90d": 90 };

/** The chosen deletion time as an ISO string, null for never, or "invalid". */
export function resolveExpiry(c: ExpiryChoice): string | null | "invalid" {
  if (c.mode === "never") return null;
  if (c.mode === "custom") {
    const d = new Date(c.custom);
    if (!c.custom || Number.isNaN(d.getTime()) || d.getTime() <= Date.now() + 60_000) return "invalid";
    return d.toISOString();
  }
  return new Date(Date.now() + DAYS[c.mode] * 86_400_000).toISOString();
}

/** Current local time in datetime-local format, used as the minimum for the custom picker. */
function nowLocal(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function ExpiryPicker({
  value,
  onChange,
  id,
}: {
  value: ExpiryChoice;
  onChange: (v: ExpiryChoice) => void;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <select
        id={id}
        className="input"
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as ExpiryMode })}
      >
        <option value="never">Never (keep the account)</option>
        <option value="1d">After 1 day</option>
        <option value="3d">After 3 days</option>
        <option value="7d">After 7 days</option>
        <option value="30d">After 30 days</option>
        <option value="90d">After 90 days</option>
        <option value="custom">On a chosen date and time</option>
      </select>
      {value.mode === "custom" && (
        <input
          type="datetime-local"
          className="input"
          min={nowLocal()}
          value={value.custom}
          onChange={(e) => onChange({ ...value, custom: e.target.value })}
          aria-label="Deletion date and time"
        />
      )}
    </div>
  );
}
