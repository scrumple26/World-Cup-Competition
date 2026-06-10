"use client";

import { useEffect, useState } from "react";
import type { FeedEntry, FeedPost, PerUserMatchResult, WeeklyTimes } from "@/lib/feedTypes";
import { WeeklyTimesCard } from "./WeeklyTimesCard";
import { PunditDesk } from "./PunditDesk";

// ── helpers ──────────────────────────────────────────────────────────────────

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function scoreLabel(u: PerUserMatchResult): string {
  return `${u.predictedHome}–${u.predictedAway}`;
}

function buildNarrative(entry: FeedEntry, myUid?: string): string[] {
  const lines: string[] = [];
  const { perUser, lateDrama } = entry;

  // Perfect scorers
  const perfect = perUser.filter((u) => u.perfect);
  if (perfect.length > 0) {
    const names = perfect.map((u) =>
      u.uid === myUid ? "You" : u.teamName,
    );
    lines.push(
      `${joinNames(names)} nailed the exact score (${perfect[0].predictedHome}–${perfect[0].predictedAway}) — maximum points!`,
    );
  }

  // Outcome correct (not perfect)
  const outcomeOnly = perUser.filter((u) => u.outcomeCorrect && !u.perfect);
  if (outcomeOnly.length > 0) {
    const names = outcomeOnly.map((u) => (u.uid === myUid ? "You" : u.teamName));
    const verb = outcomeOnly.length === 1 && names[0] === "You" ? "got" : "got";
    lines.push(
      `${joinNames(names)} ${verb} the result right (${outcomeOnly.map(scoreLabel).join(", ")}) for a point.`,
    );
  }

  // Scored zero
  const zero = perUser.filter((u) => u.pts === 0);
  if (zero.length > 0) {
    const names = zero.map((u) => (u.uid === myUid ? "You" : u.teamName));
    if (zero.length === 1 && names[0] === "You") {
      lines.push("Tough one — no points this game for you.");
    } else if (zero.length <= 2) {
      lines.push(`Hard luck for ${joinNames(names)} — no points from this one.`);
    } else {
      lines.push(`${joinNames(names)} all walked away empty-handed.`);
    }
  }

  // Late drama
  if (lateDrama) {
    const { elapsed, scoringTeam, lostPerfect, gainedPerfect, lostOutcome, gainedOutcome } = lateDrama;
    const minute = ordinal(elapsed);

    if (lostPerfect.length > 0) {
      const names = lostPerfect.map((n) => (n === perUser.find((u) => u.uid === myUid)?.teamName ? "your" : `${n}'s`));
      lines.push(
        `Drama in the ${minute} minute — ${scoringTeam} changed the scoreline and cost ${joinNames(names)} perfect pick${lostPerfect.length > 1 ? "s" : ""}.`,
      );
    } else if (gainedPerfect.length > 0) {
      const names = gainedPerfect.map((n) => (n === perUser.find((u) => u.uid === myUid)?.teamName ? "your" : `${n}'s`));
      lines.push(
        `${scoringTeam} struck in the ${minute} minute and handed ${joinNames(names)} an unexpected perfect pick!`,
      );
    } else if (lostOutcome.length > 0) {
      const names = lostOutcome.map((n) => (n === perUser.find((u) => u.uid === myUid)?.teamName ? "you" : n));
      lines.push(
        `A ${minute}-minute goal for ${scoringTeam} flipped the result, ruining ${joinNames(names)} correct pick${lostOutcome.length > 1 ? "s" : ""}.`,
      );
    } else if (gainedOutcome.length > 0) {
      const names = gainedOutcome.map((n) => (n === perUser.find((u) => u.uid === myUid)?.teamName ? "you" : n));
      lines.push(
        `${scoringTeam} scored in the ${minute} to change the result — a lucky break for ${joinNames(names)}.`,
      );
    } else {
      lines.push(
        `A ${minute}-minute goal from ${scoringTeam} added some late drama, but didn't change anyone's picks.`,
      );
    }
  }

  return lines;
}

// ── FeedCard ─────────────────────────────────────────────────────────────────

function FeedCard({ entry, myUid, spoilerMode }: { entry: FeedEntry; myUid?: string; spoilerMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(!spoilerMode);
  const { homeTeam, awayTeam, homeScore, awayScore, homeLogo, awayLogo, kickoff, perUser } = entry;
  const dateStr = new Date(kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const narrative = buildNarrative(entry, myUid);

  return (
    <div className="card overflow-hidden">
      {/* Match header — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elev)] px-4 py-2.5 text-left hover:bg-[var(--bg-card)]"
      >
        <div className="flex flex-1 items-center justify-end gap-2">
          {homeLogo && <img src={homeLogo} alt="" className="h-5 w-5 object-contain flex-shrink-0" />}
          <span className="text-sm font-semibold">{homeTeam}</span>
        </div>
        <span className={`mx-2 text-base font-bold tabular-nums ${revealed ? "" : "text-[var(--muted)]"}`}>
          {revealed ? `${homeScore} – ${awayScore}` : "vs"}
        </span>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm font-semibold">{awayTeam}</span>
          {awayLogo && <img src={awayLogo} alt="" className="h-5 w-5 object-contain flex-shrink-0" />}
        </div>
        <span className="ml-auto flex-shrink-0 text-xs text-[var(--muted)]">{dateStr}</span>
        <span className="flex-shrink-0 text-xs text-[var(--muted)]">{open ? "▴" : "▾"}</span>
      </button>

      {!open ? null : !revealed ? (
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-[var(--muted)]">Result hidden (spoiler protection)</span>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            Show result
          </button>
        </div>
      ) : (
        <>
      {/* Per-user points */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
        {perUser.map((u) => {
          const isMe = u.uid === myUid;
          return (
            <div key={u.uid} className={`flex items-center gap-1.5 text-sm ${isMe ? "font-semibold" : ""}`}>
              {u.logoUrl ? (
                <img src={u.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-elev)] text-[9px] font-bold text-[var(--muted)] flex-shrink-0">
                  {u.teamName.charAt(0)}
                </span>
              )}
              <span className={isMe ? "text-[var(--accent)]" : ""}>{isMe ? "You" : u.teamName}</span>
              <span className="text-[var(--muted)] text-xs">{scoreLabel(u)}</span>
              <span className={`font-bold text-xs ${u.pts >= 3 ? "text-[var(--gold)]" : u.pts > 0 ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                +{u.pts}
              </span>
              {u.perfect && <span className="text-[10px] text-[var(--gold)]" title="Perfect score">★</span>}
            </div>
          );
        })}
      </div>

      {/* Narrative */}
      {narrative.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5 space-y-1">
          {narrative.map((line, i) => (
            <p key={i} className="text-sm text-[var(--muted)] leading-snug">{line}</p>
          ))}
        </div>
      )}

      {/* Pundit desk reaction */}
      {entry.commentary && entry.commentary.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <PunditDesk lines={entry.commentary} />
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ── PostCard (admin posts) ───────────────────────────────────────────────────

function PostCard({ post }: { post: FeedPost }) {
  const dateStr = new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="card overflow-hidden border-[var(--accent)]/40">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/5 px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
          📣 {post.authorName}
        </span>
        <span className="ml-auto text-xs text-[var(--muted)]">{dateStr}</span>
      </div>
      {post.text && (
        <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">{post.text}</p>
      )}
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="max-h-[28rem] w-full object-cover" />
      )}
    </div>
  );
}

// ── ActivityFeed ─────────────────────────────────────────────────────────────

export function ActivityFeed({ myUid, overallLeader, spoilerMode }: { myUid?: string; overallLeader?: { teamName: string; uid: string }; spoilerMode?: boolean }) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [times, setTimes] = useState<WeeklyTimes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/feed")
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries ?? []); setPosts(d.posts ?? []); setTimes(d.times ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-[var(--muted)] py-4 text-center">Loading activity…</div>
    );
  }

  if (entries.length === 0 && posts.length === 0 && times.length === 0) {
    return (
      <div className="card p-4 text-sm text-[var(--muted)]">
        Activity will appear here once matches are played and scored.
      </div>
    );
  }

  // Merge admin posts, match entries, and weekly editions into one stream, newest first.
  const items = [
    ...posts.map((p) => ({ kind: "post" as const, t: p.createdAt, post: p })),
    ...entries.map((e) => ({ kind: "match" as const, t: e.createdAt ?? e.kickoff, entry: e })),
    ...times.map((w) => ({ kind: "times" as const, t: w.createdAt, times: w })),
  ].sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));

  return (
    <div className="space-y-3">
      {overallLeader && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="text-[var(--gold)]">👑</span>
          <span>
            <span className="font-semibold text-[var(--fg)]">
              {overallLeader.uid === myUid ? "You're" : `${overallLeader.teamName} is`}
            </span>{" "}
            currently leading the overall standings.
          </span>
        </div>
      )}
      {items.map((it) =>
        it.kind === "post" ? (
          <PostCard key={`post-${it.post.id}`} post={it.post} />
        ) : it.kind === "times" ? (
          <WeeklyTimesCard key={`times-${it.times.id}`} times={it.times} />
        ) : (
          <FeedCard key={`match-${it.entry.fixtureId}`} entry={it.entry} myUid={myUid} spoilerMode={spoilerMode} />
        ),
      )}
    </div>
  );
}
