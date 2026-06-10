"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildGroupStandings } from "@/lib/league";
import { FRIEND_GROUPS } from "@/lib/wc";
import { displayName } from "@/lib/types";
import type { WeeklyMessage } from "@/app/api/config/weekly-message/route";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LiveNow } from "@/components/LiveNow";
import { SocialFeed } from "@/components/SocialFeed";
import type { FeedEntry } from "@/lib/feedTypes";

const CARDS = [
  { href: "/predictions", emoji: "📝", title: "Predictions",  desc: "Pick scores, group finishes & who advances." },
  { href: "/worldcup",    emoji: "🌍", title: "World Cup",    desc: "Live standings, schedule & knockout bracket." },
  { href: "/rules",       emoji: "📖", title: "Rules",        desc: "Scoring and how the competition works." },
];

// ---- helpers ----

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayStr(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return isoDate(d);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function scoreOnDate(
  history: { date: string; total: number }[],
  dateStr: string,
): number {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const on = sorted.filter(h => h.date <= dateStr);
  return on.length > 0 ? on[on.length - 1].total : 0;
}

// ---- page ----

export default function Home() {
  const { user } = useAuth();
  const { data: league } = useLeague();
  const [weeklyMsg, setWeeklyMsg] = useState<WeeklyMessage | null>(null);
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);

  useEffect(() => {
    fetch("/api/config/weekly-message")
      .then(r => r.json())
      .then(setWeeklyMsg)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/feed")
      .then(r => r.json())
      .then(d => setFeedEntries(d.entries ?? []))
      .catch(() => {});
  }, []);

  // Player of the Week — most points since Monday
  const potw = useMemo(() => {
    if (!league?.users.length) return null;
    const monday = mondayStr();
    const ranked = league.users.map(u => {
      const s = league.scores[u.uid];
      const weekPts = (s?.total ?? 0) - scoreOnDate(s?.history ?? [], monday);
      return { user: u, score: s, weekPts };
    }).sort((a, b) => b.weekPts - a.weekPts);
    return ranked[0]?.weekPts > 0 ? ranked[0] : null;
  }, [league]);

  // Biggest jump — most points gained yesterday
  const bigJump = useMemo(() => {
    if (!league?.users.length) return null;
    const yesterday = yesterdayStr();
    const dayBefore = isoDate(new Date(new Date(yesterday).getTime() - 86400_000));
    const ranked = league.users.map(u => {
      const s = league.scores[u.uid];
      const end   = scoreOnDate(s?.history ?? [], yesterday);
      const start = scoreOnDate(s?.history ?? [], dayBefore);
      return { user: u, jump: end - start };
    }).sort((a, b) => b.jump - a.jump);
    return ranked[0]?.jump > 0 ? ranked[0] : null;
  }, [league]);

  // Hot Hand — most points in last 5 scored matches
  const hotHand = useMemo(() => {
    if (!feedEntries.length || !league) return null;
    const last5 = feedEntries.slice(0, 5);
    const totals: Record<string, { uid: string; pts: number }> = {};
    for (const entry of last5) {
      for (const u of entry.perUser) {
        totals[u.uid] = { uid: u.uid, pts: (totals[u.uid]?.pts ?? 0) + u.pts };
      }
    }
    const ranked = Object.values(totals).sort((a, b) => b.pts - a.pts);
    const top = ranked[0];
    if (!top || top.pts === 0) return null;
    const profile = league.users.find(u => u.uid === top.uid);
    return profile ? { user: profile, pts: top.pts, matchCount: last5.length } : null;
  }, [feedEntries, league]);

  // Competition groups
  const groupStandings = useMemo(
    () => league ? buildGroupStandings(league.users, league.scores) : null,
    [league],
  );

  // Overall leader (for feed banner)
  const overallLeader = useMemo(() => {
    if (!league?.users.length) return undefined;
    const sorted = [...league.users].sort(
      (a, b) => (league.scores[b.uid]?.total ?? 0) - (league.scores[a.uid]?.total ?? 0),
    );
    const leader = sorted[0];
    return leader ? { uid: leader.uid, teamName: leader.teamName } : undefined;
  }, [league]);

  return (
    <div className="space-y-5">
      {/* Admin weekly message */}
      {weeklyMsg?.text && (
        <div className="card border-[var(--accent)] bg-[var(--accent)]/5 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            📣 Message from the Commissioner
          </div>
          <p className="text-sm leading-relaxed">{weeklyMsg.text}</p>
        </div>
      )}

      {/* Welcome + Match Buzz (top right) */}
      <div className="grid gap-5 lg:grid-cols-3">
      <div className="card p-5 lg:col-span-2">
        <h1 className="text-2xl font-bold">Welcome back, {user?.teamName} 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Group <b>{user?.friendGroup}</b> · Lock in your predictions before each kickoff.
        </p>

        {/* Player of the Week + Biggest Jump + Hot Hand */}
        {(potw || bigJump || hotHand) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {potw && (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--gold)]/30 bg-[var(--gold)]/5 px-4 py-3">
                {potw.user.logoUrl ? (
                  <img src={potw.user.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elev)] text-xs font-bold text-[var(--muted)] flex-shrink-0">
                    {potw.user.teamName.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gold)]">⭐ Player of the Week</div>
                  <Link href={`/team/${potw.user.uid}`} className="truncate font-bold hover:underline block">
                    {displayName(potw.user)}
                    {potw.user.uid === user?.uid && <span className="ml-1 text-xs font-normal text-[var(--muted)]">you!</span>}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">{potw.user.teamName} · +{potw.weekPts} pts</div>
                </div>
              </div>
            )}
            {bigJump && (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--accent-2)]/30 bg-[var(--accent-2)]/5 px-4 py-3">
                {bigJump.user.logoUrl ? (
                  <img src={bigJump.user.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elev)] text-xs font-bold text-[var(--muted)] flex-shrink-0">
                    {bigJump.user.teamName.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-2)]">📈 Biggest Jump Yesterday</div>
                  <Link href={`/team/${bigJump.user.uid}`} className="truncate font-bold hover:underline block">
                    {displayName(bigJump.user)}
                    {bigJump.user.uid === user?.uid && <span className="ml-1 text-xs font-normal text-[var(--muted)]">you!</span>}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">{bigJump.user.teamName} · +{bigJump.jump} pts yesterday</div>
                </div>
              </div>
            )}
            {hotHand && (
              <div className="flex items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
                {hotHand.user.logoUrl ? (
                  <img src={hotHand.user.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elev)] text-xs font-bold text-[var(--muted)] flex-shrink-0">
                    {hotHand.user.teamName.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">🔥 Hot Hand</div>
                  <Link href={`/team/${hotHand.user.uid}`} className="truncate font-bold hover:underline block">
                    {displayName(hotHand.user)}
                    {hotHand.user.uid === user?.uid && <span className="ml-1 text-xs font-normal text-[var(--muted)]">you!</span>}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">{hotHand.user.teamName} · +{hotHand.pts} pts last {hotHand.matchCount} games</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <SocialFeed compact limit={6} />
      </div>

      {/* Live now */}
      <LiveNow spoilerMode={user?.hideScores} />

      {/* Competition groups */}
      {groupStandings && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Your Competition</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {FRIEND_GROUPS.map(g => (
              <div key={g} className="card overflow-hidden">
                <div className="bg-[var(--bg-elev)] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-2)]">
                  Group {g}
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {groupStandings[g].map((row, i) => {
                    const isMe = row.user.uid === user?.uid;
                    return (
                      <Link
                        key={row.user.uid}
                        href={`/team/${row.user.uid}`}
                        className={`flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-[var(--bg-elev)] ${isMe ? "bg-[var(--accent)]/10" : ""}`}
                      >
                        <span className={`w-4 text-xs font-bold ${i < 2 ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{row.rank}</span>
                        {row.user.logoUrl ? (
                          <img src={row.user.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--border)] text-[9px] font-bold text-[var(--muted)] flex-shrink-0">
                            {row.user.teamName.charAt(0)}
                          </span>
                        )}
                        <span className="flex-1 truncate font-medium">{row.user.teamName}</span>
                        <span className="text-xs font-bold">{row.score?.total ?? 0}</span>
                        {i < 2 && <span className="text-[var(--accent)] text-[10px]">●</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--muted)]">● = projects to qualify · red = your row</p>
        </div>
      )}

      {/* Activity feed */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Recent Activity</h2>
        <ActivityFeed myUid={user?.uid} overallLeader={overallLeader} spoilerMode={user?.hideScores} />
      </div>

      {/* Quick nav */}
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-5 transition hover:border-[var(--accent-2)]"
          >
            <div className="text-3xl">{c.emoji}</div>
            <div className="mt-2 font-semibold">{c.title}</div>
            <div className="text-sm text-[var(--muted)]">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
