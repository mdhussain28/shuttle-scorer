"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { getSupabase } from "@/lib/supabase";
import { useRole } from "@/lib/useRole";
import type { Category, Entry, EntryType, Tournament } from "@/lib/types";
import { entryLabel, entryPlayers } from "@/lib/types";
import { STAGE_LABEL, type Stage } from "@/lib/knockout";
import {
  defaultCap,
  validateConfig,
  type MatchConfig,
  type PlayerIndex,
  type Side,
} from "@/lib/scoring/engine";

const POINT_PRESETS = [11, 15, 21];
const STAGES: Stage[] = ["qf", "sf", "final", "third"];

function SetupContent() {
  const router = useRouter();
  const role = useRole();
  const sp = useSearchParams();
  const categoryId = sp.get("category");
  const poolId = sp.get("pool");
  const presetA = sp.get("a") ?? "";
  const presetB = sp.get("b") ?? "";
  const rawStage = sp.get("stage");
  const stage: Stage | null = STAGES.includes(rawStage as Stage) ? (rawStage as Stage) : null;
  const slotNum = Number(sp.get("slot"));
  const slot = Number.isInteger(slotNum) && slotNum > 0 ? slotNum : null;
  const isDecider = sp.get("kind") === "decider";
  const locked = Boolean(categoryId && presetA && presetB && (stage || isDecider));

  const [category, setCategory] = useState<Category | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(Boolean(categoryId));

  // casual match
  const [type, setType] = useState<EntryType>("singles");
  const [names, setNames] = useState({ a1: "", a2: "", b1: "", b2: "" });
  // tournament match
  const [entryA, setEntryA] = useState(presetA);
  const [entryB, setEntryB] = useState(presetB);

  // format
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [points, setPoints] = useState(21);
  const [golden, setGolden] = useState(false);
  const [cap, setCap] = useState(30);
  const [noCap, setNoCap] = useState(false);
  const [capEdited, setCapEdited] = useState(false);

  // serve
  const [firstServer, setFirstServer] = useState<Side>("a");
  const [aRight, setARight] = useState<PlayerIndex>(0);
  const [bRight, setBRight] = useState<PlayerIndex>(0);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!categoryId) return;
    const sb = getSupabase();
    (async () => {
      const cat = await sb.from("categories").select("*").eq("id", categoryId).maybeSingle();
      if (cat.error || !cat.data) {
        setErr(cat.error?.message ?? "Category not found.");
        setLoading(false);
        return;
      }
      setCategory(cat.data as Category);
      const [t, e] = await Promise.all([
        sb.from("tournaments").select("*").eq("id", cat.data.tournament_id).maybeSingle(),
        sb.from("entries").select("*").eq("category_id", categoryId).order("created_at"),
      ]);
      if (t.data) setTournament(t.data as Tournament);
      if (e.error) setErr(e.error.message);
      setEntries((e.data ?? []) as Entry[]);
      setLoading(false);
    })();
  }, [categoryId]);

  const visibleEntries = useMemo(
    () => (poolId ? entries.filter((e) => e.pool_id === poolId) : entries),
    [entries, poolId],
  );
  const eA = entries.find((e) => e.id === entryA) ?? null;
  const eB = entries.find((e) => e.id === entryB) ?? null;
  const optionsB = visibleEntries.filter((e) => e.id !== entryA && (!eA || e.entry_type === eA.entry_type));

  const matchType: EntryType | null = categoryId ? (eA?.entry_type ?? null) : type;

  const playersA = categoryId ? (eA ? entryPlayers(eA) : []) : type === "doubles" ? [names.a1.trim(), names.a2.trim()] : [names.a1.trim()];
  const playersB = categoryId ? (eB ? entryPlayers(eB) : []) : type === "doubles" ? [names.b1.trim(), names.b2.trim()] : [names.b1.trim()];
  const labelA = categoryId ? (eA ? entryLabel(eA) : "") : type === "doubles" ? playersA.join(" / ") : playersA[0];
  const labelB = categoryId ? (eB ? entryLabel(eB) : "") : type === "doubles" ? playersB.join(" / ") : playersB[0];

  function changePoints(p: number) {
    setPoints(p);
    if (!capEdited) setCap(defaultCap(p));
  }

  const serveSummary = useMemo(() => {
    if (!matchType) return null;
    const right = { a: aRight, b: bRight };
    const players = { a: playersA, b: playersB };
    const receiver: Side = firstServer === "a" ? "b" : "a";
    const pick = (s: Side) => (matchType === "doubles" ? players[s][right[s]] : players[s][0]);
    const sName = pick(firstServer);
    const rName = pick(receiver);
    return sName && rName ? `${sName} serves first from the right court to ${rName}.` : null;
  }, [matchType, firstServer, aRight, bRight, playersA, playersB]);

  async function start() {
    setErr(null);
    if (!matchType) return setErr("Choose both sides first.");
    if (categoryId) {
      if (!eA || !eB) return setErr("Choose both teams or players.");
    } else {
      const need = type === "doubles" ? 2 : 1;
      if (playersA.length < need || playersB.length < need || [...playersA, ...playersB].some((n) => !n)) {
        return setErr(type === "doubles" ? "Enter all four player names." : "Enter both player names.");
      }
    }

    const config: MatchConfig = {
      matchType,
      bestOf,
      pointsToWin: points,
      cap: golden || noCap ? null : cap,
      firstServer,
      aRight: matchType === "doubles" ? aRight : 0,
      bRight: matchType === "doubles" ? bRight : 0,
      ...(golden ? { goldenPoint: true } : {}),
    };
    const invalid = validateConfig(config);
    if (invalid) return setErr(invalid);

    setBusy(true);
    const samePool = eA && eB && eA.pool_id && eA.pool_id === eB.pool_id ? eA.pool_id : null;
    const row: Record<string, unknown> = {
      tournament_id: category?.tournament_id ?? null,
      category_id: categoryId,
      pool_id: poolId ?? samePool,
      entry_a_id: eA?.id ?? null,
      entry_b_id: eB?.id ?? null,
      match_type: matchType,
      a_label: labelA,
      b_label: labelB,
      a_players: playersA,
      b_players: playersB,
      config,
      events: [],
    };
    // Only send the newer columns when they are used, so older databases keep working.
    if (stage && slot) {
      row.stage = stage;
      row.slot = slot;
      row.pool_id = null;
    } else if (isDecider) {
      row.is_decider = true;
    }
    const { data, error } = await getSupabase().from("matches").insert(row).select("id").single();
    if (error || !data) {
      const msg = error?.message ?? "Could not create the match.";
      setErr(msg.includes("column") ? `${msg}. Run the latest supabase/schema.sql in the Supabase SQL Editor.` : msg);
      setBusy(false);
      return;
    }
    router.push(`/match/${data.id}`);
  }

  const cancelHref = category ? `/tournaments/${category.tournament_id}` : "/dashboard";
  const context = stage
    ? stage === "final" || stage === "third"
      ? STAGE_LABEL[stage]
      : `${STAGE_LABEL[stage]} ${slot ?? ""}`
    : isDecider
      ? "Decider match"
      : null;

  const rightSelect = (side: Side) => {
    const players = side === "a" ? playersA : playersB;
    const value = side === "a" ? aRight : bRight;
    const set = side === "a" ? setARight : setBRight;
    return (
      <div>
        <label className="label">{(side === "a" ? labelA : labelB) || `Side ${side.toUpperCase()}`}: starts in the right court</label>
        <select className="input" value={value} onChange={(e) => set(Number(e.target.value) as PlayerIndex)}>
          {[0, 1].map((i) => (
            <option key={i} value={i}>
              {players[i] || `Player ${i + 1}`}
            </option>
          ))}
        </select>
      </div>
    );
  };

  if (loading || role.loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (role.isUmpire && !categoryId) {
    return (
      <p className="text-sm text-neutral-500">
        User accounts score matches inside a tournament. Open your tournament and use New match in a pool.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {category && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span>{tournament?.name}</span>
          <Icon name="chevron-right" size={12} />
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{category.name}</span>
          {context && <span className="badge badge-green">{context}</span>}
        </div>
      )}

      {/* Who is playing */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Who is playing</h2>
        {categoryId ? (
          locked ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
              <span className="truncate rounded-xl bg-neutral-50 px-3 py-2.5 font-medium dark:bg-neutral-800/60">{labelA || "…"}</span>
              <span className="text-neutral-400">vs</span>
              <span className="truncate rounded-xl bg-neutral-50 px-3 py-2.5 font-medium dark:bg-neutral-800/60">{labelB || "…"}</span>
            </div>
          ) : (
            <>
              {visibleEntries.length < 2 && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You need at least two teams or players{poolId ? " in this pool" : ""} before you can start a match.
                </p>
              )}
              <div>
                <label className="label">Side A</label>
                <select
                  className="input"
                  value={entryA}
                  onChange={(e) => {
                    setEntryA(e.target.value);
                    setEntryB("");
                  }}
                >
                  <option value="">Select…</option>
                  {visibleEntries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)} ({e.entry_type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Side B</label>
                <select className="input" value={entryB} onChange={(e) => setEntryB(e.target.value)} disabled={!eA}>
                  <option value="">{eA ? "Select…" : "Choose Side A first"}</option>
                  {optionsB.map((e) => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)} ({e.entry_type})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )
        ) : (
          <>
            <Segmented
              ariaLabel="Match type"
              value={type}
              onChange={setType}
              options={[
                { value: "singles", label: "Singles" },
                { value: "doubles", label: "Doubles" },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="label">Side A</label>
                <input className="input" placeholder={type === "doubles" ? "Player 1" : "Player name"} value={names.a1} onChange={(e) => setNames({ ...names, a1: e.target.value })} />
                {type === "doubles" && (
                  <input className="input" placeholder="Player 2" value={names.a2} onChange={(e) => setNames({ ...names, a2: e.target.value })} />
                )}
              </div>
              <div className="space-y-2">
                <label className="label">Side B</label>
                <input className="input" placeholder={type === "doubles" ? "Player 1" : "Player name"} value={names.b1} onChange={(e) => setNames({ ...names, b1: e.target.value })} />
                {type === "doubles" && (
                  <input className="input" placeholder="Player 2" value={names.b2} onChange={(e) => setNames({ ...names, b2: e.target.value })} />
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Format */}
      <section className="card space-y-5">
        <h2 className="font-semibold">Match format</h2>
        <div>
          <label className="label">Number of sets</label>
          <Segmented
            ariaLabel="Number of sets"
            value={bestOf}
            onChange={setBestOf}
            options={[
              { value: 1 as 1 | 3 | 5, label: "1 set" },
              { value: 3 as 1 | 3 | 5, label: "Best of 3" },
              { value: 5 as 1 | 3 | 5, label: "Best of 5" },
            ]}
          />
        </div>
        <div>
          <label className="label">Points per set</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Segmented
                ariaLabel="Points per set"
                value={POINT_PRESETS.includes(points) ? points : 0}
                onChange={changePoints}
                options={POINT_PRESETS.map((p) => ({ value: p, label: String(p) }))}
              />
            </div>
            <input
              type="number"
              min={5}
              max={50}
              className="input !w-24 text-center"
              value={points}
              onChange={(e) => changePoints(Number(e.target.value))}
              aria-label="Custom points per set"
            />
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">BWF standard is best of 3 sets to 21 points.</p>
        </div>

        <div>
          <label className="label">At {points - 1}–{points - 1}</label>
          <Segmented
            ariaLabel="Deuce rule"
            value={golden ? "golden" : "deuce"}
            onChange={(v) => setGolden(v === "golden")}
            options={[
              { value: "deuce", label: "Deuce (win by 2)" },
              { value: "golden", label: "Golden point" },
            ]}
          />
          <p className="mt-1.5 text-xs text-neutral-500">
            {golden
              ? `No deuce. At ${points - 1}–${points - 1} the next point wins the set, and the receiving side chooses the court.`
              : "A set continues until one side leads by 2, up to the cap."}
          </p>
        </div>

        {!golden && (
          <div>
            <label className="label">Cap (BWF: 30)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input !w-24 text-center"
                disabled={noCap}
                value={cap}
                onChange={(e) => {
                  setCap(Number(e.target.value));
                  setCapEdited(true);
                }}
                aria-label="Cap score"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={noCap} onChange={(e) => setNoCap(e.target.checked)} />
                No cap (always win by 2)
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Serve & positions */}
      <section className="card space-y-3">
        <h2 className="font-semibold">First serve</h2>
        <Segmented
          ariaLabel="First server"
          value={firstServer}
          onChange={setFirstServer}
          options={[
            { value: "a" as Side, label: `${labelA || "Side A"} serves` },
            { value: "b" as Side, label: `${labelB || "Side B"} serves` },
          ]}
        />
        {matchType === "doubles" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rightSelect("a")}
            {rightSelect("b")}
          </div>
        )}
        {serveSummary && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950/40 dark:text-brand-300">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            {serveSummary}
          </p>
        )}
      </section>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <div className="flex gap-3">
        <Link href={cancelHref} className="btn btn-secondary">
          Cancel
        </Link>
        <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void start()}>
          <Icon name="play" size={14} />
          {busy ? "Starting…" : "Start match"}
        </button>
      </div>
    </div>
  );
}

export default function NewMatchPage() {
  return (
    <Shell title="New match" back="/dashboard">
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <SetupContent />
      </Suspense>
    </Shell>
  );
}
