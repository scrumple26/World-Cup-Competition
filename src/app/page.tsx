"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

const CARDS = [
  { href: "/predictions", emoji: "📝", title: "Make Predictions", desc: "Pick scores, group finishes & who advances." },
  { href: "/groups", emoji: "👥", title: "Groups", desc: "Track your group and all groups over time." },
  { href: "/bracket", emoji: "🗺️", title: "Knockout Bracket", desc: "See projected qualifiers and the bracket." },
  { href: "/leaderboard", emoji: "🏅", title: "Leaderboard", desc: "Overall standings across all 16 players." },
  { href: "/rules", emoji: "📖", title: "Rules", desc: "Scoring and how the World Cup works." },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Welcome back, {user?.teamName} 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          You&apos;re in <b>Group {user?.friendGroup}</b>. Lock in your World Cup
          2026 predictions before kickoff to climb the table.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-5 transition hover:border-[var(--accent-2)]"
          >
            <div className="text-3xl">{c.emoji}</div>
            <div className="mt-2 font-semibold">{c.title}</div>
            <div className="text-sm text-[var(--muted)]">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
