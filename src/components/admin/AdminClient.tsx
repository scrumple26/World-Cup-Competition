"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { useWcData } from "@/lib/useWcData";
import { FRIEND_GROUPS, type FriendGroup } from "@/lib/wc";
import type { Outcome, UserProfile } from "@/lib/types";
import { overrideResult, setUserGroup, syncNow } from "@/lib/adminRepo";
import { PredictionsClient } from "@/components/predictions/PredictionsClient";

export function AdminClient() {
  const { user, mockMode } = useAuth();
  const { data: league } = useLeague();
  const { data: wc } = useWcData();
  const [actAs, setActAs] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

      {/* Override a result */}
      <OverrideForm
        fixtures={(wc?.fixtures ?? []).map((m) => ({
          id: m.id,
          label: `${m.homeTeamName} v ${m.awayTeamName}`,
        }))}
        mockMode={mockMode}
        onDone={flash}
      />

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
