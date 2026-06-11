import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { UserProfile, ScoreDoc } from "./types";
import type { FeedEntry } from "./feedTypes";

/**
 * Manager-banter context: each Global Football Cup team is "managed" by its
 * player, so fans can playfully call out a struggling manager by first name and
 * question their tactics/lineup/selection. This gathers who's struggling
 * (bottom of their friend group, or on a cold run) so the tweet generators can
 * aim that banter where it's earned — kept light, never genuinely mean.
 */

export interface StrugglingManager {
  team: string;
  manager: string; // player's first name
  reason: string;
}

export interface ManagerContext {
  /** team name → manager (player) first name. */
  managers: Record<string, string>;
  strugglers: StrugglingManager[];
}

export async function gatherManagerContext(
  db: Firestore,
  users: UserProfile[],
): Promise<ManagerContext> {
  const managers: Record<string, string> = {};
  for (const u of users) managers[u.teamName] = u.firstName || u.teamName;

  const totalByUid = new Map<string, number>();
  try {
    const snap = await db.collection("scores").get();
    snap.forEach((d) => { const s = d.data() as ScoreDoc; totalByUid.set(s.uid, s.total ?? 0); });
  } catch { /* scores may not exist yet */ }

  const strugglers = new Map<string, StrugglingManager>();

  // Bottom of each friend group (only meaningful with 3+ in the group, and only
  // if someone is actually above them — not a flat tie).
  const byGroup = new Map<string, UserProfile[]>();
  for (const u of users) {
    const arr = byGroup.get(u.friendGroup) ?? [];
    arr.push(u);
    byGroup.set(u.friendGroup, arr);
  }
  for (const [g, members] of byGroup) {
    if (members.length < 3) continue;
    const sorted = [...members].sort((a, b) => (totalByUid.get(b.uid) ?? 0) - (totalByUid.get(a.uid) ?? 0));
    const top = sorted[0];
    const last = sorted[sorted.length - 1];
    if (last && top && (totalByUid.get(top.uid) ?? 0) > (totalByUid.get(last.uid) ?? 0)) {
      strugglers.set(last.teamName, {
        team: last.teamName,
        manager: managers[last.teamName] ?? last.teamName,
        reason: `rooted to the bottom of Group ${g}`,
      });
    }
  }

  // Cold run: trailing scored matches with zero points (>= 3).
  try {
    const snap = await db.collection("feedEntries").orderBy("kickoff").get();
    const seq = new Map<string, number[]>();
    snap.forEach((d) => {
      const e = d.data() as FeedEntry;
      for (const u of e.perUser) {
        const arr = seq.get(u.teamName) ?? [];
        arr.push(u.pts);
        seq.set(u.teamName, arr);
      }
    });
    for (const [team, pts] of seq) {
      let c = 0;
      for (let i = pts.length - 1; i >= 0 && pts[i] === 0; i--) c++;
      if (c >= 3) {
        const reason = `${c} straight matches without a point`;
        const existing = strugglers.get(team);
        if (existing) existing.reason = `${existing.reason}, and ${reason}`;
        else strugglers.set(team, { team, manager: managers[team] ?? team, reason });
      }
    }
  } catch { /* no feed history yet */ }

  return { managers, strugglers: [...strugglers.values()] };
}
