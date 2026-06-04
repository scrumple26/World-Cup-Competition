"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildBracket, type SeedRow } from "@/lib/bracket";
import { BracketView } from "./BracketView";

export function BracketClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading bracket…</p>;
  }

  const rows: SeedRow[] = data.users.map((u) => {
    const s = data.scores[u.uid];
    return {
      uid: u.uid,
      teamName: u.teamName,
      friendGroup: u.friendGroup,
      groupPoints: s.groupPts || s.total,
      perfectScores: s.perfectScores,
      perfectGroups: s.perfectGroups,
    };
  });

  const enoughPlayers = data.users.length >= 8;
  const bracket = buildBracket(rows);
  // Knockout begins once the WC group stage is done; until then this is a
  // projection from current standings.
  const started = false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Knockout Bracket</h1>
        <span
          className={`chip ${started ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-amber-500/15 text-amber-300"}`}
        >
          {started ? "Live" : "Projected"}
        </span>
      </div>

      {!started && (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-200/90">
          The knockout hasn&apos;t started yet. This shows who&apos;s
          <b> currently projected</b> to qualify and their seeding, based on live
          group-stage points. It updates as results come in. Tap any team to see
          their picks.
        </p>
      )}

      {!enoughPlayers ? (
        <div className="card p-6 text-center text-[var(--muted)]">
          Need at least 8 players with scores to project the bracket.
        </div>
      ) : (
        <div className="card p-4">
          <BracketView bracket={bracket} highlightUid={user?.uid} />
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">Projected seeds</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {bracket.seeds.map((s) => (
            <div
              key={s.uid}
              className={`rounded-lg border px-3 py-2 text-sm ${
                s.uid === user?.uid
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg-elev)]"
              }`}
            >
              <div className="text-xs text-[var(--muted)]">
                Seed {s.seed} · Grp {s.friendGroup}
              </div>
              <div className="truncate font-medium">{s.teamName}</div>
              <div className="text-xs text-[var(--muted)]">{s.points} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
