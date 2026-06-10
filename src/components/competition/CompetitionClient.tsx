"use client";

import { useEffect, useState } from "react";
import { GroupsClient } from "@/components/groups/GroupsClient";
import { BracketClient } from "@/components/bracket/BracketClient";
import { LeaderboardClient } from "@/components/LeaderboardClient";
import { useWcData } from "@/lib/useWcData";
import { competitionStage } from "@/lib/wc";

type Tab = "leaderboard" | "groups" | "bracket";

const TABS: { id: Tab; label: string }[] = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "groups", label: "Groups" },
  { id: "bracket", label: "Bracket" },
];

export function CompetitionClient() {
  const { data: wc } = useWcData();
  // Default to Groups during the group phase, Bracket once the knockout begins.
  // null until fixtures load so we can pick the right default; user can override.
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (tab !== null || !wc) return;
    setTab(competitionStage(wc.fixtures) === "knockout" ? "bracket" : "groups");
  }, [wc, tab]);

  const activeTab: Tab = tab ?? "groups";

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
                activeTab === t.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "leaderboard" && <LeaderboardClient />}
      {activeTab === "groups"      && <GroupsClient />}
      {activeTab === "bracket"     && <BracketClient />}
    </div>
  );
}
