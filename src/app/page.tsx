"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { displayName } from "@/lib/types";
import type { WeeklyMessage } from "@/app/api/config/weekly-message/route";

const CARDS = [
  { href: "/predictions", emoji: "📝", title: "Make Predictions", desc: "Pick scores, group finishes & who advances." },
  { href: "/worldcup",    emoji: "🌍", title: "World Cup",       desc: "Live standings, schedule & knockout bracket." },
  { href: "/competition", emoji: "🏅", title: "Competition",     desc: "Leaderboard, groups & bracket." },
  { href: "/rules",       emoji: "📖", title: "Rules",           desc: "Scoring and how the World Cup works." },
];

// ---- Player of the Week helper ----

function mondayStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function scoreBeforeDate(history: { date: string; total: number }[], dateStr: string): number {
  const before = [...history].sort((a, b) => a.date.localeCompare(b.date)).filter(h => h.date < dateStr);
  return before.length > 0 ? before[before.length - 1].total : 0;
}

// ---- Home page ----

export default function Home() {
  const { user } = useAuth();
  const { data: league } = useLeague();
  const [weeklyMsg, setWeeklyMsg] = useState<WeeklyMessage | null>(null);

  useEffect(() => {
    fetch("/api/config/weekly-message")
      .then(r => r.json())
      .then(setWeeklyMsg)
      .catch(() => {});
  }, []);

  // Player of the week — highest points gained since last Monday
  const potw = useMemo(() => {
    if (!league || league.users.length === 0) return null;
    const monday = mondayStr();
    const ranked = league.users.map(u => {
      const score = league.scores[u.uid];
      const weekPts = (score?.total ?? 0) - scoreBeforeDate(score?.history ?? [], monday);
      return { user: u, score, weekPts };
    }).sort((a, b) => b.weekPts - a.weekPts);
    const top = ranked[0];
    return top.weekPts > 0 ? top : null;
  }, [league]);

  return (
    <div className="space-y-5">
      {/* Weekly admin message */}
      {weeklyMsg?.text && (
        <div className="card border-[var(--accent)] bg-[var(--accent)]/5 p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            📣 Message from the Commissioner
          </div>
          <p className="text-sm leading-relaxed">{weeklyMsg.text}</p>
        </div>
      )}

      {/* Welcome + Player of the Week */}
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Welcome back, {user?.teamName} 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          You&apos;re in <b>Group {user?.friendGroup}</b>. Lock in your World Cup
          2026 predictions before kickoff to climb the table.
        </p>

        {potw && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--gold)]/30 bg-[var(--gold)]/5 px-4 py-3">
            {potw.user.logoUrl ? (
              <img src={potw.user.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-elev)] text-sm font-bold text-[var(--muted)]">
                {potw.user.teamName.charAt(0)}
              </span>
            )}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--gold)]">
                ⭐ Player of the Week
              </div>
              <div className="font-bold">
                <Link href={`/team/${potw.user.uid}`} className="hover:underline">
                  {displayName(potw.user)}
                </Link>
                {potw.user.uid === user?.uid && (
                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">that&apos;s you!</span>
                )}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {potw.user.teamName} · +{potw.weekPts} pts this week
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick nav cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
