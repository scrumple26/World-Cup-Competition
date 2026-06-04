"use client";

import Link from "next/link";
import type { Bracket, BracketMatchup, BracketTeam } from "@/lib/bracket";

// ---- Shared slot component ----

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
  const me = team?.uid === highlightUid;
  const base = "flex items-center gap-1.5 px-2 py-1.5 text-xs";
  const cls = `${base} ${isWinner ? "font-bold text-[var(--accent)]" : ""} ${me ? "ring-1 ring-inset ring-[var(--accent)] rounded" : ""}`;

  if (!team) {
    return (
      <div className={`${base} text-[var(--muted)] italic`}>{label}</div>
    );
  }
  return (
    <Link href={`/team/${team.uid}`} className={`${cls} hover:bg-[var(--bg-elev)] rounded transition`}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--border)] text-[10px] text-[var(--muted)]">
        {team.seed}
      </span>
      <span className="min-w-0 flex-1 truncate">{team.teamName}</span>
      <span className="shrink-0 text-[var(--muted)]">{team.points}</span>
    </Link>
  );
}

// ---- Match card ----

function MatchCard({
  m,
  highlightUid,
}: {
  m: BracketMatchup;
  highlightUid?: string;
}) {
  return (
    <div className="w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
      <TeamSlot team={m.a} label={m.aLabel} isWinner={!!m.winnerUid && m.a?.uid === m.winnerUid} highlightUid={highlightUid} />
      <div className="border-t border-[var(--border)]" />
      <TeamSlot team={m.b} label={m.bLabel} isWinner={!!m.winnerUid && m.b?.uid === m.winnerUid} highlightUid={highlightUid} />
    </div>
  );
}

// ---- Bracket arm connector (CSS border trick) ----
// Draws the ─┐ (top) or ─┘ (bottom) bracket arms between rounds.

function Arm({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      className={`w-5 border-[var(--border)] ${
        position === "top"
          ? "self-end border-r border-t"   // ─┐ shape (bottom half of top arm)
          : "self-start border-b border-r" // ─┘ shape (top half of bottom arm)
      }`}
      style={{ height: "50%" }}
    />
  );
}

// ---- Bracket round column ----

function RoundColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0">
      <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

// ---- Pair: two R1 matches + bracket arms connecting to one SF match ----

function R1Pair({
  top,
  bottom,
  highlightUid,
}: {
  top: BracketMatchup;
  bottom: BracketMatchup;
  highlightUid?: string;
}) {
  // card height ~52px, gap 8px → total pair height ~112px
  return (
    <div className="flex items-stretch">
      <div className="flex flex-col gap-2">
        <MatchCard m={top} highlightUid={highlightUid} />
        <MatchCard m={bottom} highlightUid={highlightUid} />
      </div>
      {/* Connector arms */}
      <div className="flex w-5 flex-col">
        <Arm position="top" />
        <Arm position="bottom" />
      </div>
    </div>
  );
}

// ---- Horizontal bridge between rounds ----

function HBridge() {
  return <div className="w-3 self-center border-t border-[var(--border)]" />;
}

// ---- Main export ----

export function BracketView({
  bracket,
  highlightUid,
}: {
  bracket: Bracket;
  highlightUid?: string;
}) {
  // R1 display order (classic bracket): M1, M4 | M2, M3
  // sf[0] = W(M1) vs W(M4), sf[1] = W(M2) vs W(M3)
  const r1TopPair = { top: bracket.r1[0], bottom: bracket.r1[3] };  // 1v8, 4v5
  const r1BotPair = { top: bracket.r1[1], bottom: bracket.r1[2] };  // 2v7, 3v6

  const champion =
    bracket.final.winnerUid
      ? [bracket.final.a, bracket.final.b].find((t) => t?.uid === bracket.final.winnerUid)
      : null;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="inline-flex min-w-max items-center gap-0 py-2">

        {/* ---- Round 1 ---- */}
        <RoundColumn title="Round 1">
          <div className="flex flex-col gap-6">
            <R1Pair top={r1TopPair.top} bottom={r1TopPair.bottom} highlightUid={highlightUid} />
            <R1Pair top={r1BotPair.top} bottom={r1BotPair.bottom} highlightUid={highlightUid} />
          </div>
        </RoundColumn>

        {/* ---- Connector R1 → SF ---- */}
        <div className="flex flex-col gap-6 self-stretch">
          {/* top SF arm */}
          <div className="flex flex-1 flex-col">
            <div className="flex-1 border-r border-[var(--border)]" />
          </div>
          {/* bottom SF arm */}
          <div className="flex flex-1 flex-col">
            <div className="flex-1 border-r border-[var(--border)]" />
          </div>
        </div>

        {/* ---- Semis ---- */}
        <RoundColumn title="Semis">
          <div className="flex flex-col justify-around gap-6" style={{ height: "100%" }}>
            <MatchCard m={bracket.sf[0]} highlightUid={highlightUid} />
            <MatchCard m={bracket.sf[1]} highlightUid={highlightUid} />
          </div>
        </RoundColumn>

        {/* Connector SF → Final */}
        <div className="flex flex-col items-stretch self-stretch">
          <Arm position="top" />
          <Arm position="bottom" />
        </div>
        <HBridge />

        {/* ---- Final ---- */}
        <RoundColumn title="Final">
          <div className="flex flex-1 items-center">
            <MatchCard m={bracket.final} highlightUid={highlightUid} />
          </div>
        </RoundColumn>

        {/* Connector → Champion */}
        <HBridge />

        {/* ---- Champion ---- */}
        <RoundColumn title="Champion">
          <div className="flex h-full w-36 items-center justify-center rounded-xl border border-[var(--gold)]/40 bg-[var(--gold)]/5 px-3 py-4 text-center">
            <div>
              <div className="text-3xl">🏆</div>
              <div className="mt-2 text-sm font-bold">
                {champion ? champion.teamName : "TBD"}
              </div>
            </div>
          </div>
        </RoundColumn>

      </div>
    </div>
  );
}
