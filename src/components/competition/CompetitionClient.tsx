"use client";

import { useState } from "react";
import { GroupsClient } from "@/components/groups/GroupsClient";
import { BracketClient } from "@/components/bracket/BracketClient";
import { LeaderboardClient } from "@/components/LeaderboardClient";

type Tab = "leaderboard" | "groups" | "bracket";

const TABS: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "groups", label: "Groups" },
  { id: "bracket", label: "Bracket" },
];

export function CompetitionClient() {
  const [tab, setTab] = useState<Tab>("leaderboard");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Competition</h1>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "leaderboard" && <LeaderboardClient />}
      {tab === "groups"      && <GroupsClient />}
      {tab === "bracket"     && <BracketClient />}
    </div>
  );
}
