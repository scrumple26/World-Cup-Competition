"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildBracket, resolveBracketWinners, type BracketMatchup, type SeedRow } from "@/lib/bracket";
import { useLiveGfcPoints } from "@/lib/useLiveGfcPoints";
import { useKnockoutRoundPoints } from "@/lib/useKnockoutRoundPoints";
import { FRIEND_STAGE_WC_ROUNDS } from "@/lib/wc";
import { fetchFixtures } from "@/lib/wcClient";
import { isPlayed } from "@/lib/wcMap";
import type { MatchPrediction, WcMatch } from "@/lib/types";
import { BracketView } from "./BracketView";

// Map bracket round keys to WC round arrays
const ROUND_MAP: Record<"r1" | "sf" | "final", string[]> = {
  r1:    FRIEND_STAGE_WC_ROUNDS.ko1,
  sf:    FRIEND_STAGE_WC_ROUNDS.ko2,
  final: FRIEND_STAGE_WC_ROUNDS.kofinal,
};

export function BracketClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();
  const { deltaByUid, liveActive } = useLiveGfcPoints();
  const ko = useKnockoutRoundPoints();
  const [selected, setSelected] = useState<BracketMatchup | null>(null);

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading bracket…</p>;
  }

  // During the group phase the seed (group) points keep moving with live games;
  // once the knockout starts the seeding is frozen, so don't fold in live group
  // deltas anymore — the live action now lives in each round's head-to-head.
  const rows: SeedRow[] = data.users.map((u) => {
    const s = data.scores[u.uid];
    const liveDelta = !ko.started && liveActive ? (deltaByUid[u.uid] ?? 0) : 0;
    return {
      uid: u.uid,
      teamName: u.teamName,
      friendGroup: u.friendGroup,
      groupPoints: (s.groupPts || s.total) + liveDelta,
      perfectScores: s.perfectScores,
      perfectGroups: s.perfectGroups,
    };
  });

  const enoughPlayers = data.users.length >= 8;
  const started = ko.started;
  // Once the knockout begins, resolve real winners from each round's live/played
  // points; before that the bracket is a projection from current seeding.
  const winners = started
    ? resolveBracketWinners(rows, { points: ko.points, roundActive: ko.roundActive })
    : {};
  const bracket = buildBracket(rows, winners);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Knockout Bracket</h2>
        <div className="flex items-center gap-2">
          {(started ? ko.liveActive : liveActive) && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-green-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              live points
            </span>
          )}
          <span className={`chip ${started ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-amber-500/15 text-amber-300"}`}>
            {started ? "Live" : "Projected"}
          </span>
        </div>
      </div>

      {started ? (
        <p className="rounded-lg bg-[var(--accent)]/10 px-4 py-2 text-sm text-[var(--accent)]">
          The knockout is underway — each matchup shows <b>live head-to-head points</b> from that
          round&apos;s World Cup games. Winners advance as the round finishes. Click any matchup for the
          prediction comparison.
        </p>
      ) : (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-200/90">
          The knockout hasn&apos;t started yet — this is a <b>projection</b> based on current points.
          Click any matchup to see a head-to-head prediction comparison.
        </p>
      )}

      {!enoughPlayers ? (
        <div className="card p-6 text-center text-[var(--muted)]">
          Need at least 8 players with scores to project the bracket.
        </div>
      ) : (
        <div className="card p-4">
          <BracketView
            bracket={bracket}
            highlightUid={user?.uid}
            roundPoints={started ? ko.points : undefined}
            roundComplete={started ? ko.roundComplete : undefined}
            onMatchupClick={(m) => setSelected((prev) => prev?.id === m.id ? null : m)}
          />
        </div>
      )}

      {/* Head-to-head panel */}
      {selected && selected.a && selected.b && (
        <HeadToHeadPanel
          matchup={selected}
          userA={data.users.find((u) => u.uid === selected.a!.uid)!}
          userB={data.users.find((u) => u.uid === selected.b!.uid)!}
          wcRounds={ROUND_MAP[selected.round]}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="card p-4">
        <h2 className="mb-2 font-semibold">{started ? "Seeds" : "Projected seeds"}</h2>
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
              <div className="text-xs text-[var(--muted)]">Seed {s.seed} · Grp {s.friendGroup}</div>
              <div className="truncate font-medium">{s.teamName}</div>
              <div className="text-xs text-[var(--muted)]">{s.points} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Head-to-head panel ----

import type { UserProfile } from "@/lib/types";

function HeadToHeadPanel({
  matchup,
  userA,
  userB,
  wcRounds,
  onClose,
}: {
  matchup: BracketMatchup;
  userA: UserProfile;
  userB: UserProfile;
  wcRounds: string[];
  onClose: () => void;
}) {
  const [fixtures, setFixtures] = useState<WcMatch[]>([]);
  const [predsA, setPredsA] = useState<Record<number, MatchPrediction>>({});
  const [predsB, setPredsB] = useState<Record<number, MatchPrediction>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [allFixtures, pA, pB] = await Promise.all([
        Promise.all(wcRounds.map((r) => fetchFixtures(r))).then((a) => a.flat()),
        fetch(`/api/predictions?uid=${userA.uid}`).then((r) => r.json()).then((d) => d.matches ?? {}),
        fetch(`/api/predictions?uid=${userB.uid}`).then((r) => r.json()).then((d) => d.matches ?? {}),
      ]);
      setFixtures(allFixtures.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()));
      setPredsA(pA);
      setPredsB(pB);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [userA.uid, userB.uid, wcRounds]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between bg-[var(--bg-elev)] px-4 py-3">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="text-[var(--accent)]">#{matchup.a!.seed} {userA.teamName}</span>
          <span className="text-[var(--muted)] text-xs">vs</span>
          <span className="text-[var(--accent-2)]">#{matchup.b!.seed} {userB.teamName}</span>
        </div>
        <button onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--fg)]">✕</button>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Loading predictions…</p>
      ) : fixtures.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
          Fixtures for this round haven&apos;t been published yet.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 bg-[var(--bg-elev)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <span>Match</span>
            <span className="w-20 text-center text-[var(--accent)]">{userA.teamName}</span>
            <span className="w-20 text-center text-[var(--accent-2)]">{userB.teamName}</span>
            <span className="w-16 text-center">Result</span>
          </div>
          {fixtures.map((m) => {
            const pA = predsA[m.id];
            const pB = predsB[m.id];
            const played = isPlayed(m);
            return (
              <div key={m.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-2 text-xs">
                <span className="truncate text-[var(--fg)]">
                  {m.homeTeamName} v {m.awayTeamName}
                </span>
                <span className={`w-20 text-center font-mono ${pA ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                  {pA ? `${pA.home}–${pA.away}` : "—"}
                </span>
                <span className={`w-20 text-center font-mono ${pB ? "text-[var(--accent-2)]" : "text-[var(--muted)]"}`}>
                  {pB ? `${pB.home}–${pB.away}` : "—"}
                </span>
                <span className="w-16 text-center font-mono text-[var(--muted)]">
                  {played ? `${m.goals.home}–${m.goals.away}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
