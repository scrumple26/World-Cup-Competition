"use client";

import Link from "next/link";
import type { Bracket, BracketMatchup, BracketTeam } from "@/lib/bracket";

function TeamSlot({
  team,
  label,
  isWinner,
  highlightUid,
}: {
  team: BracketTeam | null;
  label: string;
  isWinner: boolean;
  highlightUid?: string;
}) {
  if (!team) {
    return (
      <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[var(--muted)]">
        <span className="italic">{label}</span>
      </div>
    );
  }
  const me = team.uid === highlightUid;
  return (
    <Link
      href={`/team/${team.uid}`}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition hover:bg-[var(--bg-elev)] ${
        isWinner ? "font-bold text-[var(--accent)]" : ""
      } ${me ? "ring-1 ring-[var(--accent)]" : ""}`}
      title="View team profile"
    >
      <span className="flex items-center gap-1.5 truncate">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[var(--border)] text-[10px] text-[var(--muted)]">
          {team.seed}
        </span>
        <span className="truncate">{team.teamName}</span>
      </span>
      <span className="ml-2 shrink-0 text-[var(--muted)]">{team.points}</span>
    </Link>
  );
}

function MatchupCard({
  m,
  highlightUid,
}: {
  m: BracketMatchup;
  highlightUid?: string;
}) {
  return (
    <div className="w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1">
      <TeamSlot
        team={m.a}
        label={m.aLabel}
        isWinner={!!m.winnerUid && m.a?.uid === m.winnerUid}
        highlightUid={highlightUid}
      />
      <div className="my-0.5 border-t border-[var(--border)]" />
      <TeamSlot
        team={m.b}
        label={m.bLabel}
        isWinner={!!m.winnerUid && m.b?.uid === m.winnerUid}
        highlightUid={highlightUid}
      />
    </div>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">{children}</div>
    </div>
  );
}

export function BracketView({
  bracket,
  highlightUid,
}: {
  bracket: Bracket;
  highlightUid?: string;
}) {
  const champion =
    bracket.final.winnerUid &&
    [bracket.final.a, bracket.final.b].find((t) => t?.uid === bracket.final.winnerUid);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[760px] gap-5">
        <Column title="Round 1 · WC R32">
          {bracket.r1.map((m) => (
            <MatchupCard key={m.id} m={m} highlightUid={highlightUid} />
          ))}
        </Column>
        <Column title="Semis · WC R16">
          {bracket.sf.map((m) => (
            <MatchupCard key={m.id} m={m} highlightUid={highlightUid} />
          ))}
        </Column>
        <Column title="Final · WC QF→Final">
          <MatchupCard m={bracket.final} highlightUid={highlightUid} />
        </Column>
        <Column title="Champion">
          <div className="flex w-40 flex-col items-center justify-center rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/5 p-3 text-center">
            <div className="text-2xl">🏆</div>
            <div className="mt-1 text-sm font-bold">
              {champion ? champion.teamName : "TBD"}
            </div>
          </div>
        </Column>
      </div>
    </div>
  );
}
