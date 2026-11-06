import type { Court, MatchState, PlayerIndex, Side } from "@/lib/scoring/engine";
import { initials } from "@/lib/format";

// Top-down court. The net is the vertical line in the middle. Each side's players
// are drawn in their service courts, facing the net. A player on the left half
// faces right, so their RIGHT court is the bottom one; on the right half it is the top.

const W = 880;
const H = 400;
const TOP = 110;
const BOTTOM = 290;

type Mark = "server" | "receiver" | "partner";

interface Marker {
  key: string;
  side: Side;
  x: number;
  y: number;
  name: string;
  mark: Mark;
}

const flip = (i: PlayerIndex): PlayerIndex => (i === 0 ? 1 : 0);

function short(name: string): string {
  return name.length > 13 ? `${name.slice(0, 12)}…` : name;
}

export function CourtView({ state, names }: { state: MatchState; names: Record<Side, string[]> }) {
  const live = state.phase === "in_set";
  const doubles = state.config.matchType === "doubles";
  const markers: Marker[] = [];

  for (const side of ["a", "b"] as Side[]) {
    const onLeftHalf = (side === "a") === state.aOnLeft;
    const x = onLeftHalf ? 180 : 700;
    const yFor = (court: Court) => ((court === "right") === onLeftHalf ? BOTTOM : TOP);

    const roleFor = (idx: PlayerIndex): Mark => {
      if (!live) return "partner";
      if (state.server.side === side && state.server.playerIndex === idx) return "server";
      if (state.receiver.side === side && state.receiver.playerIndex === idx) return "receiver";
      return "partner";
    };

    if (doubles) {
      const courts: Court[] = ["right", "left"];
      for (const court of courts) {
        const idx: PlayerIndex = court === "right" ? state.right[side] : flip(state.right[side]);
        markers.push({
          key: `${side}${idx}`, side, x, y: yFor(court),
          name: names[side][idx] ?? "", mark: roleFor(idx),
        });
      }
    } else {
      const role = state.server.side === side ? state.server : state.receiver;
      markers.push({
        key: `${side}0`, side, x, y: yFor(role.court),
        name: names[side][0] ?? "", mark: live ? (state.server.side === side ? "server" : "receiver") : "partner",
      });
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Court positions">
      <rect x="0" y="0" width={W} height={H} rx="18" className="fill-emerald-600/10 dark:fill-emerald-400/10" />
      <g fill="none" strokeWidth="3" className="stroke-neutral-500/60">
        <rect x="20" y="20" width="840" height="360" />
        <line x1="20" y1="48" x2="860" y2="48" strokeDasharray="8 8" />
        <line x1="20" y1="352" x2="860" y2="352" strokeDasharray="8 8" />
        <line x1="70" y1="20" x2="70" y2="380" strokeDasharray="8 8" />
        <line x1="810" y1="20" x2="810" y2="380" strokeDasharray="8 8" />
        <line x1="310" y1="20" x2="310" y2="380" />
        <line x1="570" y1="20" x2="570" y2="380" />
        <line x1="20" y1="200" x2="310" y2="200" />
        <line x1="570" y1="200" x2="860" y2="200" />
      </g>
      <line x1="440" y1="6" x2="440" y2="394" strokeWidth="6" className="stroke-neutral-700 dark:stroke-neutral-300" />

      {markers.map((m) => {
        const ring =
          m.mark === "server" ? "stroke-emerald-500" : m.mark === "receiver" ? "stroke-amber-400" : "stroke-transparent";
        const fill = m.side === "a" ? "fill-sky-600" : "fill-violet-600";
        return (
          <g key={m.key}>
            <circle cx={m.x} cy={m.y} r="40" strokeWidth="8" fill="none" className={ring} />
            <circle cx={m.x} cy={m.y} r="32" className={fill} />
            <text
              x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central"
              fontSize="26" fontWeight="700" className="fill-white"
            >
              {initials(m.name)}
            </text>
            <text
              x={m.x} y={m.y + 62} textAnchor="middle" fontSize="22" fontWeight="600"
              className="fill-neutral-700 dark:fill-neutral-200"
            >
              {short(m.name)}
            </text>
            {m.mark !== "partner" && (
              <text
                x={m.x} y={m.y - 52} textAnchor="middle" fontSize="20" fontWeight="800"
                className={m.mark === "server" ? "fill-emerald-600 dark:fill-emerald-400" : "fill-amber-500"}
              >
                {m.mark === "server" ? "SERVES" : "RECEIVES"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
