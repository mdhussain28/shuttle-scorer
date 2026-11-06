"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Shell } from "@/components/Shell";
import { CategorySection } from "@/components/CategorySection";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { UmpirePanel } from "@/components/UmpirePanel";
import { useRole } from "@/lib/useRole";
import { getSupabase } from "@/lib/supabase";
import type { Category, Tournament } from "@/lib/types";
import type { MultiWayRule, TwoWayRule } from "@/lib/scoring/standings";
import { daysLeft, fmtDate } from "@/lib/format";

const TWO_WAY_HELP: Record<TwoWayRule, string> = {
  head_to_head: "The team that won the match between the two ranks higher (BWF).",
  decider:
    "Neither team is ranked above the other until they play an extra decider match. The decider does not count in the pool table.",
};
const MULTI_WAY_HELP: Record<MultiWayRule, string> = {
  set_point_diff:
    "Set difference first, then points difference (BWF). If that leaves exactly two teams level, the rule above applies again.",
  decider:
    "The level teams play a mini league of decider matches. The team with the most decider wins ranks highest.",
};

function TournamentContent({ id }: { id: string }) {
  const router = useRouter();
  const role = useRole();
  const [t, setT] = useState<Tournament | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [tt, cc] = await Promise.all([
      sb.from("tournaments").select("*").eq("id", id).maybeSingle(),
      sb.from("categories").select("*").eq("tournament_id", id).order("created_at"),
    ]);
    if (tt.error || cc.error) setErr((tt.error ?? cc.error)!.message);
    setT((tt.data as Tournament) ?? null);
    setCats((cc.data ?? []) as Category[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(values: Record<string, unknown>) {
    const { error } = await getSupabase().from("tournaments").update(values).eq("id", id);
    if (error) {
      setErr(
        error.message.includes("column")
          ? `${error.message}. Run the latest supabase/schema.sql in the Supabase SQL Editor.`
          : error.message,
      );
      return false;
    }
    setErr(null);
    await load();
    return true;
  }

  async function addCategory(ev: FormEvent) {
    ev.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    setErr(null);
    const { error } = await getSupabase().from("categories").insert({ tournament_id: id, name });
    if (error) return setErr(error.message);
    setNewCat("");
    await load();
  }

  async function saveName() {
    const name = nameDraft.trim();
    if (name.length < 3 || name.length > 80) {
      setErr("The tournament name must be between 3 and 80 characters.");
      return;
    }
    if (await patch({ name })) setEditing(false);
  }

  async function deleteTournament() {
    if (!t) return;
    if (!confirm(`Delete "${t.name}" with all its categories, teams and matches? This cannot be undone.`)) return;
    const { error } = await getSupabase().from("tournaments").delete().eq("id", id);
    if (error) return setErr(error.message);
    router.replace("/");
  }

  if (loading || role.loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!t) return <p className="text-sm text-neutral-500">Tournament not found. It may have been deleted.</p>;

  const twoWay: TwoWayRule = t.tie_two ?? "head_to_head";
  const multiWay: MultiWayRule = t.tie_multi ?? "set_point_diff";
  const rules = { pointsPerWin: t.points_per_win, twoWay, multiWay };
  const readOnly = role.isUmpire;

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        {editing ? (
          <div className="flex gap-2">
            <input className="input" autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            <button className="btn btn-primary" onClick={() => void saveName()}>Save</button>
            <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-xl font-semibold tracking-tight">{t.name}</h2>
            {!readOnly && <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setNameDraft(t.name);
                setEditing(true);
              }}
            >
              <Icon name="pencil" size={14} />
              Rename
            </button>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}
          <span className="badge badge-amber">
            <Icon name="clock" size={12} />
            Deleted automatically in {daysLeft(t.expires_at)} days
          </span>
        </div>
      </div>

      {readOnly ? (
        <section className="card space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Icon name="sliders" className="text-neutral-500" />
            <h3 className="font-semibold">Ranking rules</h3>
          </div>
          <p className="text-neutral-500">
            {t.points_per_win} table points per win · two level teams: {twoWay === "decider" ? "decider match" : "head-to-head"} · three or more:{" "}
            {multiWay === "decider" ? "decider matches" : "set and points difference"}
          </p>
          <p className="text-xs text-neutral-500">You are signed in as an umpire. Only the organiser can change the setup.</p>
        </section>
      ) : (
      <section className="card space-y-5">
        <div className="flex items-center gap-2">
          <Icon name="sliders" className="text-neutral-500" />
          <h3 className="font-semibold">Ranking rules</h3>
        </div>

        <div>
          <label className="label">Table points per match win</label>
          <Segmented
            ariaLabel="Points per win"
            value={t.points_per_win}
            onChange={(v) => void patch({ points_per_win: v })}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
          />
          <p className="mt-1.5 text-xs text-neutral-500">Only changes the “Pts” column. The order is by matches won.</p>
        </div>

        <div>
          <label className="label">When two teams are level on wins</label>
          <Segmented
            ariaLabel="Two team tie"
            value={twoWay}
            onChange={(v) => void patch({ tie_two: v })}
            options={[
              { value: "head_to_head" as TwoWayRule, label: "Head-to-head" },
              { value: "decider" as TwoWayRule, label: "Decider match" },
            ]}
          />
          <p className="mt-1.5 text-xs text-neutral-500">{TWO_WAY_HELP[twoWay]}</p>
        </div>

        <div>
          <label className="label">When three or more teams are level</label>
          <Segmented
            ariaLabel="Multi team tie"
            value={multiWay}
            onChange={(v) => void patch({ tie_multi: v })}
            options={[
              { value: "set_point_diff" as MultiWayRule, label: "Set & points difference" },
              { value: "decider" as MultiWayRule, label: "Decider matches" },
            ]}
          />
          <p className="mt-1.5 text-xs text-neutral-500">{MULTI_WAY_HELP[multiWay]}</p>
        </div>
      </section>
      )}

      {!readOnly && <UmpirePanel tournamentId={id} />}

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <div>
        <h2 className="section-title mb-3">Categories</h2>
        {!readOnly && <form onSubmit={addCategory} className="flex gap-2">
          <input
            className="input"
            placeholder="New category, e.g. Men's Doubles, U-15 Singles"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className="btn btn-primary shrink-0">
            <Icon name="plus" size={16} />
            Add category
          </button>
        </form>}
      </div>

      {cats.length === 0 ? (
        <p className="text-sm text-neutral-500">No categories yet. Add your first one above.</p>
      ) : (
        <div className="space-y-4">
          {cats.map((c) => (
            <CategorySection key={c.id} category={c} rules={rules} readOnly={readOnly} onDeleted={() => void load()} />
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="pt-4 text-center">
          <button className="btn btn-ghost btn-sm text-red-700 dark:text-red-400" onClick={() => void deleteTournament()}>
            <Icon name="trash" size={14} />
            Delete this tournament
          </button>
        </div>
      )}
    </div>
  );
}

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  return (
    <Shell title="Tournament" back="/">
      <TournamentContent id={params.id} />
    </Shell>
  );
}
