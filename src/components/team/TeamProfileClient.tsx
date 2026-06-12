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
  const [viewerHasPreds, setViewerHasPreds] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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

  // Check if the current viewer has submitted their own predictions (for gating)
  useEffect(() => {
    if (!user || uid === user.uid) { setViewerHasPreds(true); return; }
    fetch(`/api/predictions?uid=${user.uid}`)
      .then(r => r.json())
      .then(d => setViewerHasPreds(Object.keys(d.matches ?? {}).length > 0))
      .catch(() => setViewerHasPreds(false));
  }, [uid, user]);

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
            {/* Logo — click to enlarge; self gets a change link too */}
            {effectiveLogoUrl ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="h-[72px] w-[72px] overflow-hidden rounded-full border border-[var(--border)] transition hover:opacity-80"
                  title="Click to enlarge"
                >
                  <img src={effectiveLogoUrl} alt="Team logo" className="h-full w-full object-cover" />
                </button>
                {isSelf && (
                  <LogoUpload
                    onFilePicked={handleLogoPick}
                    uploading={logoUploading}
                    triggerOnly
                  />
                )}
              </div>
            ) : isSelf ? (
              <LogoUpload
                onFilePicked={handleLogoPick}
                uploading={logoUploading}
                size={72}
                showLabel={false}
              />
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

      <Passport predEntries={predEntries} isSelf={isSelf} />

      {isSelf && <ReportIssue user={p} />}

      {isSelf && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Preferences</h2>
          <label className="flex cursor-pointer items-center justify-between">
            <div>
              <div className="text-sm font-medium">Spoiler protection</div>
              <div className="text-xs text-[var(--muted)]">Hides real game results in the schedule and activity feed — click any result to reveal it</div>
            </div>
            <HideScoresToggle current={p.hideScores ?? false} onToggle={refreshProfile} />
          </label>
        </section>
      )}

      {/* Gate: must have your own predictions to see others' */}
      {!isSelf && viewerHasPreds === false && (
        <div className="card p-5 text-center">
          <p className="text-sm text-[var(--muted)]">
            Submit at least one match prediction to see other players&apos; picks.
          </p>
        </div>
      )}

      <section className={`card p-4 ${!isSelf && viewerHasPreds === false ? "hidden" : ""}`}>
        <h2 className="mb-3 font-semibold">
          {isSelf ? "My picks" : "Match picks"}{" "}
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

      {/* Lightbox */}
      {lightboxOpen && effectiveLogoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={effectiveLogoUrl}
              alt="Team logo"
              className="max-h-[80vh] max-w-[80vw] rounded-2xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-elev)] text-[var(--fg)] shadow hover:bg-[var(--bg-card)]"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Passport ──────────────────────────────────────────────────────────────────

function roundLabel(round: string): string {
  if (round.startsWith("Group Stage")) return round.replace("Group Stage - ", "").trim();
  if (round === "Round of 32") return "R32";
  if (round === "Round of 16") return "R16";
  if (round === "Quarter-finals") return "QF";
  if (round === "Semi-finals") return "SF";
  if (round === "3rd Place Final") return "3rd";
  if (round === "Final") return "Final";
  return round;
}

const STAMP_ROTATIONS = [-2, 1.5, -1, 2.5, -1.5, 1, -2.5, 2, -1, 1.5, -2, 1];

/** One country flag earned in the passport, plus every match that earned it. */
interface CollectedCountry {
  country: string;
  flag: string;
  from: { match: string; round: string }[];
}

/**
 * Build the distinct country flags collected from a player's perfect (exact-score)
 * predictions. Each nailed match yields BOTH countries; repeats are merged so a
 * country shows once with all the games that earned it.
 */
export function collectCountries(
  predEntries: { p: MatchPrediction; m: import("@/lib/types").WcMatch | undefined }[],
): CollectedCountry[] {
  const byCountry = new Map<string, CollectedCountry>();
  for (const { p, m } of predEntries) {
    if (!m || m.goals.home === null || m.goals.away === null) continue;
    if (!["FT", "AET", "PEN"].includes(m.status)) continue;
    if (p.home !== m.goals.home || p.away !== m.goals.away) continue;
    const matchLabel = `${m.homeTeamName} ${m.goals.home}–${m.goals.away} ${m.awayTeamName}`;
    for (const [country, flag] of [
      [m.homeTeamName, m.homeLogo],
      [m.awayTeamName, m.awayLogo],
    ] as const) {
      const c = byCountry.get(country) ?? { country, flag, from: [] };
      c.from.push({ match: matchLabel, round: roundLabel(m.round) });
      byCountry.set(country, c);
    }
  }
  return [...byCountry.values()].sort((a, b) => a.country.localeCompare(b.country));
}

function Passport({
  predEntries,
  isSelf,
}: {
  predEntries: { p: MatchPrediction; m: import("@/lib/types").WcMatch | undefined }[];
  isSelf: boolean;
}) {
  const countries = collectCountries(predEntries);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "linear-gradient(135deg, #0d3320 0%, #0a2318 100%)" }}
    >
      {/* Passport cover bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">
            Prediction Passport
          </div>
          <div className="mt-0.5 text-xs font-semibold text-emerald-100/60">
            {countries.length > 0
              ? `${countries.length} ${countries.length === 1 ? "country" : "countries"} stamped`
              : "FIFA World Cup 2026"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌍</span>
          {countries.length > 0 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">
              {countries.length}
            </span>
          )}
        </div>
      </div>

      {/* Flag stamp grid — one flag per country, hover to see the match(es) */}
      <div className="px-5 pb-5">
        {countries.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-emerald-800/60">
            <p className="text-center text-xs text-emerald-700/80">
              {isSelf
                ? "Predict the exact score of a match to stamp your first country"
                : "No countries stamped yet"}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {countries.map((c, idx) => (
              <div
                key={c.country}
                className="group relative flex flex-col items-center rounded border-2 border-amber-100/30 bg-amber-50/95 px-3 py-2 shadow-md"
                style={{
                  transform: `rotate(${STAMP_ROTATIONS[idx % STAMP_ROTATIONS.length]}deg)`,
                  minWidth: 84,
                }}
              >
                {/* Perforated edges */}
                <div className="absolute inset-x-0 top-0 flex justify-between px-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className="h-1.5 w-1.5 -translate-y-[3px] rounded-full bg-[#0d3320]" />
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 flex justify-between px-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className="h-1.5 w-1.5 translate-y-[3px] rounded-full bg-[#0d3320]" />
                  ))}
                </div>

                {/* Flag */}
                <img src={c.flag} alt={c.country} className="mt-1 h-8 w-12 rounded-sm object-contain drop-shadow" />
                <div className="mt-1 max-w-[72px] truncate text-[10px] font-bold text-gray-700">{c.country}</div>
                {c.from.length > 1 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow">
                    ×{c.from.length}
                  </span>
                )}

                {/* Hover tooltip: which game(s) earned this flag */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-[#04140c] px-3 py-2 text-left opacity-0 shadow-xl ring-1 ring-emerald-500/30 transition-opacity group-hover:block group-hover:opacity-100">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                    {c.country} — nailed in
                  </div>
                  {c.from.map((f, i) => (
                    <div key={i} className="mt-0.5 text-[11px] text-emerald-50">
                      {f.match} <span className="text-emerald-400/70">({f.round})</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportIssue({ user: u }: { user: UserProfile }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const { getClientAuth } = await import("@/lib/firebase/client");
      const auth = getClientAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/report-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message,
          name: `${u.firstName} ${u.lastName}`,
          teamName: u.teamName,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("sent");
      setMessage("");
      setTimeout(() => { setOpen(false); setStatus("idle"); }, 2500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Report an issue</h2>
          <p className="text-xs text-[var(--muted)]">Bug, scoring error, or anything wrong</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          {open ? "Cancel" : "Report"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <textarea
            className="input min-h-[100px] resize-y text-sm"
            placeholder="Describe the issue…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          {status === "error" && (
            <p className="text-xs text-red-400">Failed to send — try again.</p>
          )}
          {status === "sent" && (
            <p className="text-xs text-green-400">✓ Report sent to the admin.</p>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={status === "sending" || status === "sent"}
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent!" : "Send report"}
          </button>
        </form>
      )}
    </section>
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
