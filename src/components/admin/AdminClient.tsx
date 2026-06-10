"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { useWcData } from "@/lib/useWcData";
import { FRIEND_GROUPS, type FriendGroup } from "@/lib/wc";
import type { Outcome, UserProfile } from "@/lib/types";
import type { FeedPost } from "@/lib/feedTypes";
import { backupLockedPicks, createFeedPost, deleteFeedPost, fillTeams, generatePunditTest, generateWeeklyTimesTest, overrideResult, removeUser, setUserGroup, syncNow, uploadTeamLogo } from "@/lib/adminRepo";
import { PredictionsClient } from "@/components/predictions/PredictionsClient";
import { LogoUpload } from "@/components/LogoUpload";
import { PunditDesk } from "@/components/PunditDesk";
import { WeeklyTimesCard } from "@/components/WeeklyTimesCard";
import type { PunditLine, WeeklyTimes } from "@/lib/feedTypes";

export function AdminClient() {
  const { user, mockMode } = useAuth();
  const { data: league } = useLeague();
  const { data: wc } = useWcData();
  const [actAs, setActAs] = useState<UserProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [weeklyMsg, setWeeklyMsg] = useState("");
  const [msgSaving, setMsgSaving] = useState(false);
  const [predCounts, setPredCounts] = useState<Record<string, number>>({});
  const [posting, setPosting] = useState(false);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [filling, setFilling] = useState(false);
  const [logoOverrides, setLogoOverrides] = useState<Record<string, string>>({});
  const [logoBusyUid, setLogoBusyUid] = useState<string | null>(null);
  const [backing, setBacking] = useState(false);
  const [punditLines, setPunditLines] = useState<PunditLine[] | null>(null);
  const [punditBusy, setPunditBusy] = useState(false);
  const [punditFixtureId, setPunditFixtureId] = useState("");
  const [punditNote, setPunditNote] = useState<string | null>(null);
  const [punditMatch, setPunditMatch] = useState<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null>(null);
  const [weeklyTimes, setWeeklyTimes] = useState<WeeklyTimes | null>(null);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyNote, setWeeklyNote] = useState<string | null>(null);

  // Load current weekly message
  useEffect(() => {
    fetch("/api/config/weekly-message")
      .then(r => r.json())
      .then(d => setWeeklyMsg(d.text ?? ""))
      .catch(() => {});
  }, []);

  const loadPosts = () => {
    fetch("/api/feed")
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .catch(() => {});
  };
  useEffect(() => { loadPosts(); }, []);

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

  async function runPunditTest(args: { sample?: boolean; fixtureId?: number }) {
    setPunditBusy(true);
    setPunditNote(null);
    setPunditLines(null);
    try {
      const r = await generatePunditTest(args);
      if (!r.ok) { setPunditNote(`Failed: ${r.error ?? "unknown error"}`); return; }
      setPunditLines(r.commentary ?? []);
      setPunditMatch(r.match ?? null);
      setPunditNote(r.hasKey
        ? "Generated with Gemini."
        : "No GEMINI_API_KEY set — showing the templated fallback. Add the key to see AI commentary.");
    } catch {
      setPunditNote("Request failed.");
    } finally {
      setPunditBusy(false);
    }
  }

  async function runWeeklyTimesTest() {
    setWeeklyBusy(true);
    setWeeklyNote(null);
    setWeeklyTimes(null);
    try {
      const r = await generateWeeklyTimesTest(true);
      if (!r.ok) { setWeeklyNote(`Failed: ${r.error ?? "unknown error"}`); return; }
      setWeeklyTimes(r.times ?? null);
      setWeeklyNote(r.hasKey
        ? "Preview generated with Gemini (not saved to the feed)."
        : "No GEMINI_API_KEY set — showing the templated fallback. Add the key for AI prose.");
    } catch {
      setWeeklyNote("Request failed.");
    } finally {
      setWeeklyBusy(false);
    }
  }

  async function handleTeamLogo(uid: string, teamName: string, file: File) {
    setLogoBusyUid(uid);
    try {
      const r = await uploadTeamLogo(uid, file);
      if (r.ok && r.url) {
        setLogoOverrides((prev) => ({ ...prev, [uid]: r.url as string }));
        flash(`✓ Updated logo for ${teamName}`);
      } else {
        flash(`Failed: ${r.error ?? "unknown error"}`);
      }
    } finally {
      setLogoBusyUid(null);
    }
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

      {/* Pundit commentary tester */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Pundit commentary (test)</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Preview the AI pundit desk before real matches finish. Generate a sample match, or pull a
          real fixture by its API-Football ID.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-primary"
            disabled={punditBusy}
            onClick={() => runPunditTest({ sample: true })}
          >
            {punditBusy ? "Generating…" : "Generate sample match"}
          </button>
          <input
            className="input w-32"
            placeholder="Fixture ID"
            value={punditFixtureId}
            onChange={(e) => setPunditFixtureId(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <button
            className="btn-ghost"
            disabled={punditBusy || !punditFixtureId}
            onClick={() => runPunditTest({ fixtureId: Number(punditFixtureId) })}
          >
            Generate for fixture
          </button>
        </div>
        {punditNote && <p className="mt-2 text-xs text-[var(--muted)]">{punditNote}</p>}
        {punditLines && punditLines.length > 0 && (
          <div className="mt-3">
            <PunditDesk lines={punditLines} match={punditMatch ?? undefined} />
          </div>
        )}
      </section>

      {/* Weekly newspaper tester */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Pundit Football Times (test)</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Preview this week&apos;s AI newspaper edition from live data (group movement, top points,
          perfect games, close races). This preview is <b>not</b> saved to the feed. The real edition
          posts automatically every Sunday 9 AM.
        </p>
        <button className="btn-primary" disabled={weeklyBusy} onClick={runWeeklyTimesTest}>
          {weeklyBusy ? "Writing the paper…" : "Generate this week's edition"}
        </button>
        {weeklyNote && <p className="mt-2 text-xs text-[var(--muted)]">{weeklyNote}</p>}
        {weeklyTimes && (
          <div className="mt-3">
            <WeeklyTimesCard times={weeklyTimes} defaultExpanded />
          </div>
        )}
      </section>

      {/* Post to the activity feed */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Post to the activity feed</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Share an update with everyone — add a message, an image, or both. It appears at the top of the feed on the home page.
        </p>
        <textarea
          className="input min-h-[70px] resize-y text-sm"
          placeholder="Write something for the feed…"
          value={postText}
          onChange={e => setPostText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            key={fileInputKey}
            type="file"
            accept="image/*"
            onChange={e => setPostImage(e.target.files?.[0] ?? null)}
            className="text-xs text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bg-elev)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--fg)]"
          />
          <button
            className="btn-primary px-4 py-2 text-sm"
            disabled={posting || (!postText.trim() && !postImage)}
            onClick={async () => {
              setPosting(true);
              try {
                const r = await createFeedPost(postText.trim(), postImage);
                if (r.ok) {
                  setPostText("");
                  setPostImage(null);
                  setFileInputKey(k => k + 1);
                  flash("✓ Posted to the feed");
                  loadPosts();
                } else {
                  flash(`Failed: ${r.error ?? "unknown error"}`);
                }
              } finally {
                setPosting(false);
              }
            }}
          >
            {posting ? "Posting…" : "Post to feed"}
          </button>
        </div>
        {posts.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Recent posts</div>
            {posts.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-sm">
                {p.imageUrl && <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />}
                <span className="flex-1 truncate">{p.text || "(image)"}</span>
                <button
                  className="text-xs text-red-300 hover:text-red-200"
                  onClick={async () => {
                    if (!window.confirm("Delete this post?")) return;
                    const r = await deleteFeedPost(p.id);
                    if (r.ok) { flash("✓ Post deleted"); loadPosts(); }
                    else flash(`Failed: ${r.error ?? "unknown error"}`);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fill-in teams */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Fill-in teams</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          {(league?.users.filter(u => !u.isBot).length ?? 0)} of 16 spots are real teams. If fewer than 16 people
          sign up by the lock-in deadline, the rest are filled with “Random Not Human FC” bots that make random
          predictions. This runs automatically at the deadline — use the button to do it now. Does nothing once 16 real teams exist.
        </p>
        <button
          className="btn-primary px-4 py-2 text-sm"
          disabled={filling}
          onClick={async () => {
            setFilling(true);
            try {
              const r = await fillTeams();
              flash(
                r.ok
                  ? (r.created ? `✓ Created ${r.created} fill-in team(s)` : "Already 16 teams — nothing to do.")
                  : `Failed: ${r.error ?? "unknown error"}`,
              );
            } finally {
              setFilling(false);
            }
          }}
        >
          {filling ? "Creating…" : "Generate fill-in teams"}
        </button>
      </section>

      {/* Pick backups */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Pick backups</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Each player&apos;s picks are snapshotted automatically the moment they lock in. Use this to
          back-fill a safety copy for everyone who has already locked in. Skips players who already have a backup.
        </p>
        <button
          className="btn-primary px-4 py-2 text-sm"
          disabled={backing}
          onClick={async () => {
            setBacking(true);
            try {
              const r = await backupLockedPicks();
              flash(
                r.ok
                  ? `✓ Backed up ${r.backed ?? 0} player(s)${r.skipped ? ` · ${r.skipped} skipped` : ""}`
                  : `Failed: ${r.error ?? "unknown error"}`,
              );
            } finally {
              setBacking(false);
            }
          }}
        >
          {backing ? "Backing up…" : "Back up locked-in picks"}
        </button>
      </section>

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

      {/* Team logos */}
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Team logos</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Upload or change the logo for any team on their behalf.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {league?.users.map((u) => {
            const url = logoOverrides[u.uid] ?? u.logoUrl;
            return (
              <div
                key={u.uid}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2"
              >
                {url ? (
                  <img src={url} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--border)] text-xs font-bold text-[var(--muted)] flex-shrink-0">
                    {u.teamName.charAt(0)}
                  </span>
                )}
                <span className="flex-1 truncate text-sm">{u.teamName}</span>
                <LogoUpload
                  triggerOnly
                  uploading={logoBusyUid === u.uid}
                  onFilePicked={(f) => handleTeamLogo(u.uid, u.teamName, f)}
                />
              </div>
            );
          })}
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
