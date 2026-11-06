"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Shell } from "@/components/Shell";
import { CategorySection } from "@/components/CategorySection";
import { getSupabase } from "@/lib/supabase";
import type { Category, Tournament } from "@/lib/types";
import { daysLeft, fmtDate } from "@/lib/format";

function TournamentContent({ id }: { id: string }) {
  const router = useRouter();
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
    const { error } = await getSupabase().from("tournaments").update({ name }).eq("id", id);
    if (error) return setErr(error.message);
    setErr(null);
    setEditing(false);
    await load();
  }

  async function setPointsPerWin(value: number) {
    const { error } = await getSupabase().from("tournaments").update({ points_per_win: value }).eq("id", id);
    if (error) return setErr(error.message);
    await load();
  }

  async function deleteTournament() {
    if (!t) return;
    if (!confirm(`Delete "${t.name}" with all its categories, teams and matches? This cannot be undone.`)) return;
    const { error } = await getSupabase().from("tournaments").delete().eq("id", id);
    if (error) return setErr(error.message);
    router.replace("/");
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!t) return <p className="text-sm text-neutral-500">Tournament not found. It may have been deleted.</p>;

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
            <h2 className="flex-1 text-xl font-bold">{t.name}</h2>
            <button
              className="btn btn-ghost !px-3 !py-1.5 text-xs"
              onClick={() => {
                setNameDraft(t.name);
                setEditing(true);
              }}
            >
              Rename
            </button>
          </div>
        )}
        <p className="text-sm text-neutral-500">
          {[t.venue, fmtDate(t.start_date)].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Deleted automatically in {daysLeft(t.expires_at)} days
          </span>
          <label className="flex items-center gap-2 text-neutral-500">
            Points per match win
            <select
              className="input !w-auto !py-1"
              value={t.points_per_win}
              onChange={(e) => void setPointsPerWin(Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <form onSubmit={addCategory} className="flex gap-2">
        <input
          className="input"
          placeholder="New category, e.g. Men's Doubles, U-15 Singles"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
        />
        <button className="btn btn-primary shrink-0">Add category</button>
      </form>

      {cats.length === 0 ? (
        <p className="text-sm text-neutral-500">No categories yet. Add your first one above.</p>
      ) : (
        <div className="space-y-4">
          {cats.map((c) => (
            <CategorySection key={c.id} category={c} pointsPerWin={t.points_per_win} onDeleted={() => void load()} />
          ))}
        </div>
      )}

      <div className="pt-4 text-center">
        <button className="btn btn-ghost text-xs text-red-600" onClick={() => void deleteTournament()}>
          Delete this tournament
        </button>
      </div>
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
