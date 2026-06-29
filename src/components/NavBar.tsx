"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWcData } from "@/lib/useWcData";
import { competitionStage, isGroupRound } from "@/lib/wc";
import { isLocked } from "@/lib/wcMap";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/",             label: "Dashboard"    },
  { href: "/predictions",  label: "Predictions"  },
  { href: "/worldcup",     label: "World Cup"     },
  { href: "/competition",  label: "Competition"   },
  { href: "/rules",        label: "Rules"         },
];

interface PredStatus {
  locked: boolean;
  matchCount: number;   // match scores entered
  groupCount: number;   // group finish orders set (out of 12)
  thirdCount: number;   // 3rd-place picks selected (out of 8)
  // Set only during the knockout stage — drives a knockout-completeness badge.
  knockout?: {
    total: number;      // open, predictable knockout fixtures
    entered: number;    // how many already have a prediction
  };
}

export function NavBar() {
  const { user, logOut } = useAuth();
  const pathname = usePathname();
  const { data: wc } = useWcData();
  const [predStatus, setPredStatus] = useState<PredStatus | null>(null);

  // Knockout fixtures still open to predict: drawn (real teams) and not yet
  // kicked off. Empty unless the competition has reached the knockout stage.
  const openKoIds = useMemo(() => {
    if (!wc || competitionStage(wc.fixtures) !== "knockout") return [];
    return wc.fixtures
      .filter(
        (m) =>
          !isGroupRound(m.round) &&
          m.homeTeamId > 0 &&
          m.awayTeamId > 0 &&
          !isLocked(m),
      )
      .map((m) => m.id);
  }, [wc]);
  const inKnockoutStage = !!wc && competitionStage(wc.fixtures) === "knockout";

  // Fetch prediction status once when user loads (and refresh on path change so
  // it updates after the user visits the Predictions page).
  useEffect(() => {
    if (!user) return;

    // --- Knockout stage: badge reflects knockout pick completeness instead. ---
    if (inKnockoutStage) {
      if (openKoIds.length === 0) { setPredStatus(null); return; }
      const openSet = new Set(openKoIds);

      // Locally soft-saved knockout picks (entered, maybe not yet synced/locked).
      const localKo = new Set<number>();
      try {
        const raw = localStorage.getItem(`pred_pending_${user.uid}`);
        if (raw) {
          const p = JSON.parse(raw) as { matches?: Record<string, unknown> };
          for (const k of Object.keys(p.matches ?? {})) {
            const id = Number(k);
            if (openSet.has(id)) localKo.add(id);
          }
        }
      } catch { /* ignore */ }

      const apply = (firestoreIds: number[]) => {
        const entered = new Set<number>(localKo);
        for (const id of firestoreIds) if (openSet.has(id)) entered.add(id);
        setPredStatus({
          locked: false, matchCount: 0, groupCount: 0, thirdCount: 0,
          knockout: { total: openKoIds.length, entered: entered.size },
        });
      };

      const cacheKey = `ko_summary_${user.uid}`;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const c = JSON.parse(raw) as { t: number; ids: number[] };
          if (Date.now() - c.t < 10 * 60_000) { apply(c.ids); return; }
        }
      } catch { /* ignore */ }

      fetch(`/api/predictions?uid=${user.uid}`)
        .then((r) => r.json())
        .then((d) => {
          const ids = Object.keys(d.matches ?? {}).map(Number);
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), ids })); } catch { /* ignore */ }
          apply(ids);
        })
        .catch(() => {});
      return;
    }

    // Check localStorage first — predictions are soft-saved there until Lock In
    try {
      const raw = localStorage.getItem(`pred_pending_${user.uid}`);
      if (raw) {
        const p = JSON.parse(raw) as {
          matches?: Record<string, unknown>;
          groups?:  Record<string, unknown>;
          thirdPlace?: unknown[];
        };
        const mc = Object.keys(p.matches  ?? {}).length;
        const gc = Object.keys(p.groups   ?? {}).length;
        const tc = (p.thirdPlace ?? []).length;
        if (mc > 0 || gc > 0 || tc > 0) {
          setPredStatus({ locked: false, matchCount: mc, groupCount: gc, thirdCount: tc });
          return;
        }
      }
    } catch { /* ignore */ }

    // Nothing in localStorage — use the cheap summary endpoint, cached in
    // sessionStorage so we don't re-read on every navigation. ~4 reads per
    // 10 min instead of the full prediction set (~85) on each page change.
    const cacheKey = `pred_summary_${user.uid}`;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const c = JSON.parse(raw) as { t: number; s: PredStatus };
        if (Date.now() - c.t < 10 * 60_000) { setPredStatus(c.s); return; }
      }
    } catch { /* ignore */ }

    fetch(`/api/predictions?uid=${user.uid}&summary=1`)
      .then(r => r.json())
      .then(d => {
        const s: PredStatus = {
          locked:     !!d.userLocked,
          matchCount: d.matchCount ?? 0,
          groupCount: d.groupCount ?? 0,
          thirdCount: d.thirdCount ?? 0,
        };
        setPredStatus(s);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), s })); } catch { /* ignore */ }
      })
      .catch(() => {});
  }, [user?.uid, pathname, inKnockoutStage, openKoIds]);

  const tabs = [...TABS];
  if (user?.isAdmin) tabs.push({ href: "/admin", label: "Admin" });

  // In the knockout stage the badge tracks knockout-pick completeness; otherwise
  // it tracks whether the user has locked in their group-stage predictions.
  const koStatus = predStatus?.knockout;
  const showBadge =
    predStatus !== null &&
    (koStatus ? koStatus.entered < koStatus.total : !predStatus.locked);

  const badgeTitle = koStatus ? "Knockout picks incomplete" : "Predictions not locked in";

  const tooltipLines = !showBadge
    ? []
    : koStatus
    ? [
        `🏆 Knockout picks: ${koStatus.entered}/${koStatus.total}`,
        "",
        "Head to Predictions → Knockout to finish your picks.",
      ]
    : [
        `📊 Match scores: ${predStatus!.matchCount}/72`,
        `📋 Group finishes: ${predStatus!.groupCount}/12`,
        `🔢 3rd-place picks: ${predStatus!.thirdCount}/8`,
        "",
        predStatus!.matchCount === 0
          ? "Head to Predictions to start entering your picks."
          : "Go to Predictions → scroll to the bottom → Lock In Predictions to submit.",
      ];

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
            const isPredTab = t.href === "/predictions";

            return isPredTab && showBadge ? (
              // Predictions tab with badge + tooltip
              <div key={t.href} className="group relative">
                <Link
                  href={t.href}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--bg-card)] hover:text-[var(--fg)]"
                  }`}
                >
                  {t.label}
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-[var(--accent)] text-white"
                    }`}
                  >
                    !
                  </span>
                </Link>
                {/* Tooltip */}
                <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-3 text-xs text-[var(--fg)] shadow-xl opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="font-semibold text-[var(--accent)] mb-2">{badgeTitle}</p>
                  <div className="space-y-1">
                    {tooltipLines.map((line, i) =>
                      line === "" ? (
                        <div key={i} className="border-t border-[var(--border)] my-1" />
                      ) : (
                        <p key={i} className={line.startsWith("Go to") || line.startsWith("Head to") ? "text-[var(--muted)] leading-relaxed mt-1" : "font-medium"}>
                          {line}
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white"
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
            className="flex items-center gap-2 hover:opacity-90 transition"
          >
            {user?.logoUrl ? (
              <img
                src={user.logoUrl}
                alt="Team logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-xs font-bold text-[var(--muted)]">
                {user?.teamName?.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="text-right text-sm leading-tight">
              <div className="font-semibold">{user?.teamName}</div>
              <div className="text-xs text-[var(--muted)]">Group {user?.friendGroup}</div>
            </div>
          </Link>
          <ThemeToggle />
          <button onClick={() => logOut()} className="btn-ghost px-3 py-1.5 text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
