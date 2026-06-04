"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { useWcData } from "@/lib/useWcData";
import { buildLeaderboard } from "@/lib/league";
import {
  loadGroupPredictions,
  loadMatchPredictions,
  loadThirdPlace,
} from "@/lib/predictionsRepo";
import { scoreMatch } from "@/lib/scoring";
import { isPlayed } from "@/lib/wcMap";
import type {
  GroupPrediction,
  MatchPrediction,
  ThirdPlacePrediction,
  UserProfile,
} from "@/lib/types";
import { displayName } from "@/lib/types";
import { TeamBadge } from "../TeamBadge";
import { LogoUpload } from "../LogoUpload";

export function TeamProfileClient({ uid }: { uid: string }) {
  const { user, refreshProfile } = useAuth();
  const { data: league, loading: lLoading } = useLeague();
  const { data: wc, loading: wcLoading } = useWcData();
  const [preds, setPreds] = useState<{
    matches: Record<number, MatchPrediction>;
    groups: Record<string, GroupPrediction>;
    third: ThirdPlacePrediction;
  } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      loadMatchPredictions(uid),
      loadGroupPredictions(uid),
      loadThirdPlace(uid),
    ]).then(([matches, groups, third]) => setPreds({ matches, groups, third }));
  }, [uid]);

  if (lLoading || wcLoading || !league || !wc || !preds) {
    return <p className="text-[var(--muted)]">Loading team…</p>;
  }

  const profile: UserProfile | undefined = league.users.find((u) => u.uid === uid);
  if (!profile) {
    return <p className="text-[var(--muted)]">Team not found.</p>;
  }
  const p = profile as UserProfile; // narrowed alias for use in closures
  const score = league.scores[uid];
  const rank = buildLeaderboard(league.users, league.scores).find((r) => r.user.uid === uid)?.rank;
  const isSelf = uid === user?.uid;

  // logoUrl state overrides profile.logoUrl after an in-session upload
  const effectiveLogoUrl = logoUrl ?? profile.logoUrl;

  function startEditing() {
    setEditFirst(p.firstName);
    setEditLast(p.lastName);
    setEditTeam(p.teamName);
    setEditing(true);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { getClientAuth } = await import("@/lib/firebase/client");
      const auth = getClientAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName: editFirst, lastName: editLast, teamName: editTeam }),
      });
      await refreshProfile();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoPick(file: File) {
    if (!isSelf) return;
    setLogoUploading(true);
    setLogoError(null);
    try {
      const { getClientAuth } = await import("@/lib/firebase/client");
      const auth = getClientAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;

      const form = new FormData();
      form.append("image", file);
      const uploadRes = await fetch("/api/upload-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const uploadData = await uploadRes.json() as { url?: string; error?: string };
      if (!uploadRes.ok) { setLogoError(uploadData.error ?? "Upload failed"); return; }

      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ logoUrl: uploadData.url }),
      });
      setLogoUrl(uploadData.url);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoUploading(false);
    }
  }

  const matchById = new Map(wc.fixtures.map((m) => [m.id, m]));
  const predEntries = Object.values(preds.matches)
    .map((p) => ({ p, m: matchById.get(p.fixtureId) }))
    .filter((x) => x.m)
    .sort((a, b) => new Date(a.m!.kickoff).getTime() - new Date(b.m!.kickoff).getTime());

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {isSelf ? (
              <LogoUpload
                currentUrl={effectiveLogoUrl}
                onFilePicked={handleLogoPick}
                uploading={logoUploading}
                size={72}
                showLabel={false}
              />
            ) : effectiveLogoUrl ? (
              <img src={effectiveLogoUrl} alt="Team logo" className="h-[72px] w-[72px] rounded-full object-cover border border-[var(--border)]" />
            ) : null}
            <div className="min-w-0">
              {isSelf && editing ? (
                <form onSubmit={saveProfile} className="space-y-2">
                  <div className="flex gap-2">
                    <input className="input w-28" value={editFirst} onChange={e => setEditFirst(e.target.value)} placeholder="First" required />
                    <input className="input w-28" value={editLast} onChange={e => setEditLast(e.target.value)} placeholder="Last" required />
                  </div>
                  <input className="input w-full" value={editTeam} onChange={e => setEditTeam(e.target.value)} placeholder="Team name" required />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary px-3 py-1.5 text-sm" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                    <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">{displayName(profile)}</h1>
                    {isSelf && (
                      <span className="chip bg-[var(--accent)]/15 text-[var(--accent)]">You</span>
                    )}
                    {profile.isAdmin && (
                      <span className="chip bg-[var(--gold)]/15 text-[var(--gold)]">Admin</span>
                    )}
                    {isSelf && (
                      <button onClick={startEditing} className="text-xs text-[var(--muted)] hover:text-[var(--fg)] ml-1">Edit</button>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted)]">{profile.teamName} · Group {profile.friendGroup}</p>
                  {isSelf && !effectiveLogoUrl && (
                    <p className="mt-0.5 text-xs text-[var(--muted)] opacity-70">Click the circle to add a team logo</p>
                  )}
                  {logoError && (
                    <p className="mt-1 text-xs text-red-400">{logoError}</p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex gap-5 text-center">
            <Stat label="Rank" value={rank ? `#${rank}` : "—"} />
            <Stat label="Total" value={score.total} />
            <Stat label="Perfect" value={score.perfectScores} />
          </div>
        </div>
      </div>

      {isSelf && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Preferences</h2>
          <label className="flex cursor-pointer items-center justify-between">
            <div>
              <div className="text-sm font-medium">Hide scores in Schedule</div>
              <div className="text-xs text-[var(--muted)]">Shows LIVE/FT without the actual score</div>
            </div>
            <HideScoresToggle current={p.hideScores ?? false} onToggle={refreshProfile} />
          </label>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">
          Match picks{" "}
          <span className="text-sm font-normal text-[var(--muted)]">
            ({predEntries.length} entered)
          </span>
        </h2>
        {predEntries.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No predictions entered yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-elev)] text-left text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2 text-center">Pick</th>
                  <th className="px-3 py-2 text-center">Result</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {predEntries.map(({ p, m }) => {
                  const played = m && isPlayed(m);
                  const pts = played
                    ? scoreMatch(
                        { home: p.home, away: p.away },
                        { home: m!.goals.home as number, away: m!.goals.away as number },
                        m!.decidedWinner,
                      ).total
                    : null;
                  return (
                    <tr key={p.fixtureId} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 truncate">
                          <TeamBadge name={m!.homeTeamName} logo={m!.homeLogo} size={16} />
                          <span className="text-[var(--muted)]">v</span>
                          <TeamBadge name={m!.awayTeamName} logo={m!.awayLogo} size={16} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono">
                        {p.home}-{p.away}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-[var(--muted)]">
                        {played ? `${m!.goals.home}-${m!.goals.away}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {pts === null ? "—" : pts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Predicted group finishes</h2>
        {Object.keys(preds.groups).length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No group finishes set yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wc.groups.map((g) => {
              const order = preds.groups[g.group]?.order;
              if (!order) return null;
              const byId = new Map(g.teams.map((t) => [t.id, t]));
              return (
                <div key={g.group} className="rounded-lg border border-[var(--border)] p-2">
                  <div className="mb-1 text-xs font-semibold text-[var(--accent-2)]">
                    {g.group}
                  </div>
                  <ol className="space-y-0.5 text-sm">
                    {order.map((id, i) => (
                      <li key={id} className="flex items-center gap-1.5">
                        <span className="w-4 text-xs text-[var(--muted)]">{i + 1}</span>
                        <TeamBadge
                          name={byId.get(id)?.name ?? "?"}
                          logo={byId.get(id)?.logo}
                          size={16}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs uppercase text-[var(--muted)]">{label}</div>
    </div>
  );
}

function HideScoresToggle({
  current,
  onToggle,
}: {
  current: boolean;
  onToggle: () => Promise<void>;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !value;
    setValue(next);
    try {
      const { getClientAuth } = await import("@/lib/firebase/client");
      const auth = getClientAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hideScores: next }),
      });
      await onToggle();
    } catch {
      setValue(!next); // revert on error
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
        value ? "bg-[var(--accent)]" : "bg-[var(--border)]"
      } disabled:opacity-60`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
