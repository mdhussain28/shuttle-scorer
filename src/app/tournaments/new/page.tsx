"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Shell } from "@/components/Shell";
import { getSupabase } from "@/lib/supabase";
import { useRole } from "@/lib/useRole";

function NewTournamentForm() {
  const router = useRouter();
  const role = useRole();
  useEffect(() => {
    if (role.isUmpire) router.replace("/dashboard");
  }, [role.isUmpire, router]);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 80) {
      setErr("The tournament name must be between 3 and 80 characters.");
      return;
    }
    setBusy(true);
    const sb = getSupabase();

    // Warn once if a tournament with the same name already exists.
    if (!duplicate) {
      const escaped = trimmed.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { data } = await sb.from("tournaments").select("id").ilike("name", escaped).limit(1);
      if (data && data.length > 0) {
        setDuplicate(true);
        setBusy(false);
        return;
      }
    }

    const { data, error } = await sb
      .from("tournaments")
      .insert({ name: trimmed, venue: venue.trim() || null, start_date: date || null })
      .select("id")
      .single();
    if (error || !data) {
      setErr(error?.message ?? "Could not create the tournament.");
      setBusy(false);
      return;
    }
    router.push(`/tournaments/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <label className="label" htmlFor="name">Tournament name</label>
        <input
          id="name"
          autoFocus
          className="input"
          placeholder="e.g. Bangalore Open 2026"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDuplicate(false);
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="venue">Venue (optional)</label>
          <input id="venue" className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="date">Start date</label>
          <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {duplicate && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          A tournament with this name already exists. Tap “Create anyway” if you want a second one.
        </p>
      )}
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}

      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Creating…" : duplicate ? "Create anyway" : "Create tournament"}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Tournament data is kept for 3 months, then deleted automatically.
      </p>
    </form>
  );
}

export default function NewTournamentPage() {
  return (
    <Shell title="New tournament" back="/dashboard">
      <NewTournamentForm />
    </Shell>
  );
}
