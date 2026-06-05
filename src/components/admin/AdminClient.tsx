"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { useWcData } from "@/lib/useWcData";
import { FRIEND_GROUPS, type FriendGroup } from "@/lib/wc";
import type { Outcome, UserProfile } from "@/lib/types";
import { overrideResult, removeUser, setUserGroup, syncNow } from "@/lib/adminRepo";
import { PredictionsClient } from "@/components/predictions/PredictionsClient";

export function AdminClient() {
  const { user, mockMode } = useAuth();
  const { data: league } = useLeague();
  const { data: wc } = useWcData();
  const [actAs, setActAs] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [weeklyMsg, setWeeklyMsg] = useState("");
  const [msgSaving, setMsgSaving] = useState(false);
  const [predCounts, setPredCounts] = useState<Record<string, number>>({});

  // Load current weekly message
  useEffect(() => {
    fetch("/api/config/weekly-message")
      .then(r => r.json())
      .then(d => setWeeklyMsg(d.text ?? ""))
      .catch(() => {});
  }, []);

  // Load prediction counts for each player
  useEffect(() => {
    if (!league) return;
    Promise.all(
      league.users.map(u =>
        fetch(`/api/predictions?uid=${u.uid}`)
          .then(r => r.json())
          .then(d => [u.uid, Object.keys(d.matches ?? {}).length] as [string, number])
          .catch(() => [u.uid, 0] as [string, number])
      )
    ).then(entries => setPredCounts(Object.fromEntries(entries)));
  }, [league]);

  if (!user?.isAdmin) {
    return <p className="text-[var(--muted)]">You don&apos;t have admin access.</p>;
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  if (actAs) {
    return (
      <div className="space-y-4">
        <button className="btn-ghost" onClick={() => setActAs(null)}>
          ← Back to admin
        </button>
        <PredictionsClient actAs={{ uid: actAs.uid, teamName: actAs.teamName }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button
          className="btn-ghost"
          onClick={async () => {
            flash("Syncing…");
            const r = await syncNow();
            if (!r.ok) { flash(`Sync failed: ${r.error ?? "unknown error"}`); return; }
            if (r.mock) { flash("Mock mode — nothing to sync."); return; }
            flash(
              `✓ Synced ${r.matchesSynced ?? 0} matches · ${r.groupsSynced ?? 0} groups · ${r.usersScored ?? 0} users scored`
            );
          }}
        >
          ⟳ Sync results now
        </button>
      </div>

      {toast && (
        <div className="rounded-lg bg-[var(--accent)]/15 px-4 py-2 text-sm text-[var(--accent)]">
          {toast}
        </div>
      )}

      {/* Predict for a user */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Predict on behalf of a player</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Opens the prediction screens writing to the selected player&apos;s account.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {league?.users.map((u) => (
            <button
              key={u.uid}
              onClick={() => setActAs(u)}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-left text-sm hover:border-[var(--accent-2)]"
            >
              <span className="truncate">{u.teamName}</span>
              <span className="text-xs text-[var(--muted)]">Grp {u.friendGroup}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Remove a player */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Remove a player</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Deletes the player from Firebase Auth, their profile, predictions, and score.
          Use to clean up unverified or test accounts.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {league?.users.filter((u) => u.uid !== user?.uid).map((u) => (
            <button
              key={u.uid}
              onClick={async () => {
                if (!window.confirm(`Remove ${u.teamName} (${u.email})? This cannot be undone.`)) return;
                const r = await removeUser(u.uid);
                flash(r.ok ? `✓ Removed ${u.teamName}` : `Failed: ${r.error}`);
              }}
              className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left text-sm hover:border-red-500/50 hover:bg-red-500/10"
            >
              <span className="truncate text-red-300">{u.teamName}</span>
              <span className="text-xs text-[var(--muted)]">Grp {u.friendGroup}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Override a result */}
      <OverrideForm
        fixtures={(wc?.fixtures ?? []).map((m) => ({
          id: m.id,
          label: `${m.homeTeamName} v ${m.awayTeamName}`,
        }))}
        mockMode={mockMode}
        onDone={flash}
      />

      {/* Prediction completion status */}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Prediction status</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">Number of match predictions each player has submitted.</p>
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-elev)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-left">Group</th>
                <th className="px-3 py-2 text-right">Predictions</th>
                <th className="px-3 py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {(league?.users ?? [])
                .slice()
                .sort((a, b) => (predCounts[b.uid] ?? 0) - (predCounts[a.uid] ?? 0))
                .map(u => {
                  const count = predCounts[u.uid];
                  const pts = league?.scores[u.uid]?.total ?? 0;
                  const hasAny = count > 0;
                  return (
                    <tr key={u.uid} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{u.teamName}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{u.friendGroup}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={hasAny ? "text-green-400 font-semibold" : "text-[var(--muted)]"}>
                          {count === undefined ? "…" : count === 0 ? "None" : `${count} picks`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{pts}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weekly message */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Weekly message</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">Shows on everyone&apos;s dashboard. Leave blank to hide.</p>
        <textarea
          className="input min-h-[80px] resize-y text-sm"
          placeholder="e.g. Great week everyone! Don't forget to lock in your Round 2 predictions by Thursday."
          value={weeklyMsg}
          onChange={e => setWeeklyMsg(e.target.value)}
        />
        <button
          className="btn-primary mt-2 px-4 py-2 text-sm"
          disabled={msgSaving}
          onClick={async () => {
            setMsgSaving(true);
            try {
              const token = await (await import("@/lib/firebase/client")).getClientAuth()?.currentUser?.getIdToken();
              await fetch("/api/config/weekly-message", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ text: weeklyMsg, uid: user?.uid }),
              });
              flash(weeklyMsg.trim() ? "✓ Message published" : "✓ Message cleared");
            } finally {
              setMsgSaving(false);
            }
          }}
        >
          {msgSaving ? "Saving…" : "Publish message"}
        </button>
      </section>

      {/* Group management */}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Manage groups</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <tbody>
              {league?.users.map((u) => (
                <tr key={u.uid} className="border-t border-[var(--border)] first:border-t-0">
                  <td className="px-3 py-2">{u.teamName}</td>
                  <td className="px-3 py-2 text-right">
                    <select
                      defaultValue={u.friendGroup}
                      onChange={async (e) => {
                        const r = await setUserGroup(u, e.target.value as FriendGroup);
                        flash(r.ok ? `${u.teamName} → Group ${e.target.value}` : "Failed");
                      }}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1"
                    >
                      {FRIEND_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          Group {g}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OverrideForm({
  fixtures,
  mockMode,
  onDone,
}: {
  fixtures: { id: number; label: string }[];
  mockMode: boolean;
  onDone: (msg: string) => void;
}) {
  const [fixtureId, setFixtureId] = useState<number | "">("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [winner, setWinner] = useState<Outcome | "">("");

  return (
    <section className="card p-4">
      <h2 className="mb-1 font-semibold">Override a match result</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Use when the API feed is wrong. Marks the match as manually set so syncs
        won&apos;t overwrite it, then recomputes scores.
        {mockMode && " (Demo mode: acknowledged but sample scores don't recompute.)"}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="label">Match</label>
          <select
            className="input"
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select a fixture…</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-16">
          <label className="label">Home</label>
          <input className="input" type="number" min={0} value={home} onChange={(e) => setHome(e.target.value)} />
        </div>
        <div className="w-16">
          <label className="label">Away</label>
          <input className="input" type="number" min={0} value={away} onChange={(e) => setAway(e.target.value)} />
        </div>
        <div className="w-32">
          <label className="label">Winner (KO)</label>
          <select className="input" value={winner} onChange={(e) => setWinner(e.target.value as Outcome | "")}>
            <option value="">Auto</option>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={fixtureId === "" || home === "" || away === ""}
          onClick={async () => {
            const r = await overrideResult({
              fixtureId: Number(fixtureId),
              home: Number(home),
              away: Number(away),
              decidedWinner: winner || undefined,
            });
            onDone(r.ok ? "Result saved." : "Override failed.");
          }}
        >
          Save result
        </button>
      </div>
    </section>
  );
}
