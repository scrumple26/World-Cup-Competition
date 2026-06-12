"use client";

import Link from "next/link";
import { useMemo } from "react";
import { displayName, type UserProfile } from "@/lib/types";
import type { FeedEntry } from "@/lib/feedTypes";

interface CollectedCountry {
  country: string;
  flag: string;
}

interface PassportRow {
  uid: string;
  user: UserProfile;
  countries: CollectedCountry[]; // distinct, sorted
}

/**
 * Aggregate distinct countries each player has "stamped" (earned via an exact-score
 * prediction) from the match feed. A nailed match stamps BOTH of its countries.
 */
function buildRows(feedEntries: FeedEntry[], users: UserProfile[]): PassportRow[] {
  const userByUid = new Map(users.map((u) => [u.uid, u]));
  const byUid = new Map<string, Map<string, string>>(); // uid → (country → flag)

  for (const e of feedEntries) {
    for (const pu of e.perUser) {
      if (!pu.perfect) continue;
      const m = byUid.get(pu.uid) ?? new Map<string, string>();
      m.set(e.homeTeam, e.homeLogo);
      m.set(e.awayTeam, e.awayLogo);
      byUid.set(pu.uid, m);
    }
  }

  const rows: PassportRow[] = [];
  for (const [uid, m] of byUid) {
    const user = userByUid.get(uid);
    if (!user) continue;
    const countries = [...m.entries()]
      .map(([country, flag]) => ({ country, flag }))
      .sort((a, b) => a.country.localeCompare(b.country));
    rows.push({ uid, user, countries });
  }
  return rows
    .sort((a, b) => b.countries.length - a.countries.length || a.user.teamName.localeCompare(b.user.teamName))
    .slice(0, 5);
}

export function PassportLeaderboard({
  feedEntries,
  users,
  currentUid,
}: {
  feedEntries: FeedEntry[];
  users: UserProfile[];
  currentUid?: string;
}) {
  const rows = useMemo(() => buildRows(feedEntries, users), [feedEntries, users]);
  const max = rows[0]?.countries.length ?? 0;
  if (rows.length === 0 || max === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: "linear-gradient(135deg, #0d3320 0%, #0a2318 100%)" }}
      >
        {/* Title with hover explainer */}
        <div className="group relative flex items-center gap-2">
          <span className="text-lg">🛂</span>
          <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-300">
            Passport Leaderboard
          </h2>
          <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-emerald-400/50 text-[9px] font-bold text-emerald-400/80">
            ?
          </span>
          <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg bg-[#04140c] px-3 py-2 text-left opacity-0 shadow-xl ring-1 ring-emerald-500/30 transition-opacity group-hover:block group-hover:opacity-100">
            <p className="text-[11px] leading-relaxed text-emerald-50">
              Every time you nail a match&apos;s <strong>exact score</strong>, you stamp BOTH
              countries into your passport. This ranks the top globetrotters by how many
              distinct countries they&apos;ve collected. Hover a player to see their stamps.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-100/50">
          Top 5
        </span>
      </div>

      <div className="space-y-2.5 p-4">
        {rows.map((row, i) => {
          const isMe = row.uid === currentUid;
          const pct = Math.max(8, Math.round((row.countries.length / max) * 100));
          return (
            <div key={row.uid} className="group relative flex items-center gap-3">
              <span className="w-4 text-right text-xs font-bold text-[var(--muted)]">{i + 1}</span>
              {row.user.logoUrl ? (
                <img src={row.user.logoUrl} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-elev)] text-[10px] font-bold text-[var(--muted)]">
                  {row.user.teamName.charAt(0)}
                </span>
              )}

              {/* Bar + label */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/team/${row.uid}`}
                  className={`block truncate text-sm font-semibold hover:underline ${isMe ? "text-[var(--accent)]" : ""}`}
                >
                  {displayName(row.user)}
                  {isMe && <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">you!</span>}
                </Link>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-[var(--bg-elev)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #10b981, #34d399)" }}
                  />
                </div>
              </div>

              <span className="w-8 flex-shrink-0 text-right text-sm font-bold text-emerald-400">
                {row.countries.length}
              </span>

              {/* Hover tooltip: which countries they hold */}
              <div className="pointer-events-none absolute left-10 top-full z-20 mt-1 hidden w-max max-w-[280px] rounded-lg bg-[#04140c] px-3 py-2 text-left opacity-0 shadow-xl ring-1 ring-emerald-500/30 transition-opacity group-hover:block group-hover:opacity-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                  {displayName(row.user)} · {row.countries.length} countries
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {row.countries.map((c) => (
                    <span key={c.country} className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-50">
                      <img src={c.flag} alt="" className="h-3 w-4 rounded-[1px] object-contain" />
                      {c.country}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
