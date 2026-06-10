"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FauxTweet } from "@/lib/feedTypes";

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "GF";
}

/** Render tweet text with hashtags highlighted. */
function TweetText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-snug">
      {text.split(/(\s+)/).map((tok, i) =>
        tok.startsWith("#")
          ? <span key={i} className="font-semibold text-[var(--accent-2)]">{tok}</span>
          : <span key={i}>{tok}</span>,
      )}
    </p>
  );
}

function TweetCard({ t }: { t: FauxTweet }) {
  return (
    <div className="flex gap-2.5 border-b border-[var(--border)] px-3 py-2.5 last:border-0">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-2)] text-xs font-bold text-white">
        {initials(t.fanOf)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="truncate font-bold">{t.displayName}</span>
          <span className="truncate text-[var(--muted)]">{t.handle}</span>
        </div>
        <TweetText text={t.text} />
      </div>
    </div>
  );
}

/** Faux fan feed. Pass `tweets` to render directly (admin preview), or it
 *  self-fetches from /api/social. */
export function SocialFeed({
  compact = false,
  limit,
  tweets: tweetsProp,
}: {
  compact?: boolean;
  limit?: number;
  tweets?: FauxTweet[];
}) {
  const [tweets, setTweets] = useState<FauxTweet[]>(tweetsProp ?? []);
  const [loading, setLoading] = useState(!tweetsProp);

  useEffect(() => {
    if (tweetsProp) { setTweets(tweetsProp); setLoading(false); return; }
    fetch("/api/social")
      .then((r) => r.json())
      .then((d) => setTweets(d.tweets ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tweetsProp]);

  const shown = limit ? tweets.slice(0, limit) : tweets;

  const body = loading ? (
    <p className="px-3 py-4 text-sm text-[var(--muted)]">Loading buzz…</p>
  ) : shown.length === 0 ? (
    <p className="px-3 py-4 text-sm text-[var(--muted)]">No buzz yet — fan reactions post as goals and results roll in.</p>
  ) : (
    shown.map((t) => <TweetCard key={t.id} t={t} />)
  );

  if (compact) {
    return (
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
            <span>📣</span> Match Buzz
          </span>
          <Link href="/social" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">View all</Link>
        </div>
        <div>{body}</div>
      </div>
    );
  }

  return <div className="card overflow-hidden">{body}</div>;
}
