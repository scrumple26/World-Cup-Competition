export const metadata = { title: "Rules · World Cup Competition" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-sm text-[var(--fg)]/90">{children}</div>
    </section>
  );
}

function Pts({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip ml-2 bg-[var(--accent)]/15 text-[var(--accent)]">{children}</span>
  );
}

export default function RulesPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Rules &amp; Scoring</h1>

      {/* ---- WC format first ---- */}
      <Section title="How World Cup 2026 works">
        <p>
          The 2026 World Cup has <b>48 teams</b> in <b>12 groups (A–L)</b> of 4. Each
          team plays 3 group-stage matches.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>The <b>top 2 teams in each group</b> advance automatically (24 teams).</li>
          <li>
            The <b>8 best 3rd-place teams</b> also advance, filling out the 32-team knockout.
          </li>
          <li>
            Knockout rounds: <b>Round of 32 → Round of 16 → Quarter-finals →
            Semi-finals → Final</b> (single elimination; extra time then penalties
            if tied at 90 min).
          </li>
        </ul>
        <p className="font-semibold mt-1">How the 8 best 3rd-place teams are picked:</p>
        <p>
          All 12 third-place teams are ranked against each other using the same
          criteria as group-stage tiebreakers, in this order:
        </p>
        <ol className="ml-5 list-decimal space-y-0.5">
          <li>Most <b>points</b></li>
          <li>Best <b>goal difference</b></li>
          <li>Most <b>goals scored</b></li>
          <li>Most <b>wins</b></li>
          <li>Fewest <b>disciplinary points</b> (yellow = 1, red = 3, yellow+red = 4)</li>
          <li><b>Drawing of lots</b> if still tied</li>
        </ol>
        <p className="text-[var(--muted)]">
          The 8 teams with the best records among all 12 third-place finishers advance.
          This is why predicting which 3rd-place teams advance is one of the harder
          picks — it depends on results across all 12 groups.
        </p>
      </Section>

      {/* ---- Competition format ---- */}
      <Section title="How our competition works">
        <p>
          16 friends compete in a season that mirrors the real World Cup. You&apos;re
          split into <b>4 groups of 4</b> for a group stage, then the top scorers
          advance to a head-to-head knockout bracket.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>You earn points by predicting <b>real World Cup 2026 matches</b>.</li>
          <li>The <b>top 2 point-getters in each group</b> (8 total) advance to the knockout.</li>
          <li>Knockout seeds 1–8 are set by group-stage points; matchups are 1v8, 2v7, 3v6, 4v5.</li>
          <li>Tiebreakers (group stage &amp; seeding): points → perfect scores → perfect groups → <b>coin flip</b>.</li>
          <li>
            In each knockout round you go head-to-head: whoever scores more points on
            that round&apos;s WC matches advances. Ties break on total points.
          </li>
          <li>Everyone may keep making predictions every round, even after elimination.</li>
        </ul>
      </Section>

      <Section title="Group round — scoring">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Predict the winner of each group match <Pts>1 pt</Pts></li>
          <li>Correct home score (exact goals) <Pts>0.5 pt</Pts></li>
          <li>Correct away score (exact goals) <Pts>0.5 pt</Pts></li>
          <li>
            Perfect score (both sides exact) <Pts>+1 bonus</Pts>
            <span className="text-[var(--muted)]"> — so a perfect prediction is worth 3 pts total.</span>
          </li>
          <li>Each team you place in its correct final group position <Pts>1 pt</Pts></li>
          <li>Perfectly predicting an entire group (all 4 positions) <Pts>+2 bonus</Pts></li>
          <li>Each correctly picked advancing 3rd-place team (8 of 12 advance) <Pts>1 pt</Pts></li>
        </ul>
      </Section>

      <Section title="Knockout round — scoring">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Predict the winner of each match <Pts>1 pt</Pts></li>
          <li>Correct home score <Pts>0.5 pt</Pts></li>
          <li>Correct away score <Pts>0.5 pt</Pts></li>
          <li>Perfect score (both sides exact) <Pts>+1 bonus</Pts></li>
        </ul>
        <div className="rounded-lg bg-[var(--bg-elev)] px-4 py-3 text-sm space-y-1">
          <p className="font-semibold">Predicting ties in knockout matches:</p>
          <p className="text-[var(--muted)]">
            If you predict a draw (e.g. 1–1), you <b>must also pick which team
            wins</b> — that pick is used for your outcome point.
          </p>
          <p className="text-[var(--muted)]">
            <b>Penalties don&apos;t affect score accuracy.</b> Score points (exact home/away goals)
            are based on the regulation or extra-time scoreline only — not the
            penalty shootout result.
          </p>
        </div>
        <p className="text-[var(--muted)]">
          Tiebreaker for a knockout matchup: total points across the group stage and
          knockout so far.
        </p>
        <p className="mt-2">Which WC matches you predict each knockout round:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><b>Round 1</b> → all WC Round of 32 matches</li>
          <li><b>Your Semifinals</b> → all WC Round of 16 matches</li>
          <li><b>Your Final</b> → WC Quarter-finals, Semi-finals &amp; the Final</li>
        </ul>
      </Section>
    </div>
  );
}
