"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { getSupabase } from "@/lib/supabase";

/** Admin-only: wipe tournament data or casual matches. User accounts are never touched. */
export function DataCleanup({
  tournaments,
  casual,
  matches,
  onDone,
}: {
  tournaments: number;
  casual: number;
  matches: number;
  onDone: () => Promise<void> | void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function wipeCasual() {
    if (casual === 0) return;
    if (!confirm(`Delete all ${casual} casual matches? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabase().from("matches").delete().is("tournament_id", null);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Casual matches deleted." });
    await onDone();
  }

  async function wipeAll() {
    if (confirmText !== "DELETE") return;
    setBusy(true);
    setMsg(null);
    const sb = getSupabase();
    // Deleting a tournament also deletes its categories, pools, teams and matches.
    const t = await sb.from("tournaments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (t.error) {
      setBusy(false);
      return setMsg({ ok: false, text: t.error.message });
    }
    const c = await sb.from("matches").delete().is("tournament_id", null);
    setBusy(false);
    if (c.error) return setMsg({ ok: false, text: c.error.message });
    setConfirmText("");
    setMsg({ ok: true, text: "All tournaments, teams, matches and casual matches were deleted. Accounts were kept." });
    await onDone();
  }

  return (
    <section className="card space-y-4 !border-red-200 dark:!border-red-900/60">
      <div className="flex items-center gap-2">
        <Icon name="alert" className="text-red-600" />
        <h3 className="font-semibold">Clean up data</h3>
      </div>
      <p className="text-sm text-neutral-500">
        Tournaments are already removed automatically 3 months after they were created. Use these buttons to clear data sooner.
        User and admin accounts are never deleted here.
      </p>

      {msg && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            msg.ok
              ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950/40">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Casual matches</p>
          <p className="text-xs text-neutral-500">{casual} stored</p>
        </div>
        <button className="btn btn-secondary text-red-700 dark:text-red-400" disabled={busy || casual === 0} onClick={() => void wipeCasual()}>
          <Icon name="trash" size={14} />
          Delete casual matches
        </button>
      </div>

      <div className="space-y-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950/40">
        <div>
          <p className="text-sm font-medium">Everything</p>
          <p className="text-xs text-neutral-500">
            {tournaments} tournaments, {matches} tournament and casual matches in total, with all categories, pools and teams.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input !w-auto min-w-[12rem] flex-1"
            placeholder="Type DELETE to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            aria-label="Type DELETE to confirm"
          />
          <button className="btn btn-danger" disabled={busy || confirmText !== "DELETE"} onClick={() => void wipeAll()}>
            <Icon name="trash" size={14} />
            {busy ? "Deleting…" : "Delete all data"}
          </button>
        </div>
      </div>
    </section>
  );
}
