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

      <Section title="How the competition works">
        <p>
          16 friends compete in a season that mirrors the real World Cup. You&apos;re
          split into <b>4 groups of 4</b> for a group stage, then the top scorers
          advance to a head-to-head knockout bracket.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>You earn points by predicting <b>real World Cup 2026 matches</b>.</li>
          <li>The <b>top 2 point-getters in each group</b> (8 total) advance to the knockout.</li>
          <li>Knockout seeds 1–8 are set by group-stage points; matchups are 1v8, 2v7, 3v6, 4v5.</li>
          <li>
            In each knockout round you go head-to-head: whoever scores more points on
            that round&apos;s WC matches advances. Ties break on total points (group +
            knockout).
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

      <Section title="How the World Cup 2026 works">
        <p>
          The 2026 World Cup has <b>48 teams</b> in <b>12 groups (A–L)</b> of 4. Each
          team plays 3 group matches.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>The top 2 of each group advance (24 teams)…</li>
          <li>…plus the <b>8 best 3rd-place teams</b> — making 32 for the knockout.</li>
          <li>
            Knockout rounds: <b>Round of 32 → Round of 16 → Quarter-finals →
            Semi-finals → Final</b> (single elimination; extra time then penalties
            decide level matches).
          </li>
        </ul>
        <p className="text-[var(--muted)]">
          Live fixtures, results and stats come from API-Football. When you predict a
          match you can open “Insights &amp; stats” for win probabilities and team
          comparisons.
        </p>
      </Section>
    </div>
  );
}
