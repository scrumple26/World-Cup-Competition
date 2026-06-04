"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

const TABS = [
  { href: "/predictions", label: "Predictions" },
  { href: "/groups", label: "Groups" },
  { href: "/bracket", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rules", label: "Rules" },
];

export function NavBar() {
  const { user, logOut } = useAuth();
  const pathname = usePathname();

  const tabs = [...TABS];
  if (user?.isAdmin) tabs.push({ href: "/admin", label: "Admin" });

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-elev)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-xl">🏆</span>
          <span className="hidden sm:inline">WC Competition</span>
        </Link>

        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-[#06210f]"
                    : "text-[var(--muted)] hover:bg-[var(--bg-card)] hover:text-[var(--fg)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={`/team/${user?.uid}`}
            className="text-right text-sm leading-tight hover:underline"
          >
            <div className="font-semibold">{user?.teamName}</div>
            <div className="text-xs text-[var(--muted)]">Group {user?.friendGroup}</div>
          </Link>
          <button onClick={() => logOut()} className="btn-ghost px-3 py-1.5 text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
