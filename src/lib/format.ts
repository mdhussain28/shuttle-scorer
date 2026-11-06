export function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function scoreLine(sets: Array<[number, number]>): string {
  return sets.map(([a, b]) => `${a}-${b}`).join(", ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function nextGroupName(existing: string[]): string {
  for (let i = 0; i < 26; i++) {
    const name = `Group ${String.fromCharCode(65 + i)}`;
    if (!existing.some((e) => e.toLowerCase() === name.toLowerCase())) return name;
  }
  return `Group ${existing.length + 1}`;
}
