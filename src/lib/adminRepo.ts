"use client";

/** Admin actions: mock-mode operates locally; live mode calls token-gated routes. */

import { USE_MOCK } from "./config";
import type { FriendGroup, Outcome, UserProfile } from "./types";
import { saveUser } from "./mock/store";

async function adminToken(): Promise<string | null> {
  const { getClientAuth } = await import("./firebase/client");
  const u = getClientAuth()?.currentUser;
  return u ? u.getIdToken() : null;
}

export interface AdminResult {
  ok: boolean;
  mock?: boolean;
  error?: string;
  // Sync-specific detail fields
  matchesSynced?: number;
  groupsSynced?: number;
  usersScored?: number;
}

async function post(path: string, body: unknown): Promise<AdminResult> {
  const token = await adminToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return {
    ok: res.ok,
    error: data.error as string | undefined,
    matchesSynced: data.matchesSynced as number | undefined,
    groupsSynced: data.groupsSynced as number | undefined,
    usersScored: data.usersScored as number | undefined,
  };
}

export async function setUserGroup(
  user: UserProfile,
  group: FriendGroup,
): Promise<AdminResult> {
  if (USE_MOCK) {
    saveUser({ ...user, friendGroup: group });
    return { ok: true };
  }
  return post("/api/admin/group", { uid: user.uid, group });
}

export async function overrideResult(args: {
  fixtureId: number;
  home: number;
  away: number;
  decidedWinner?: Outcome;
}): Promise<AdminResult> {
  if (USE_MOCK) {
    // Mock scores are static sample data; acknowledge without recompute.
    return { ok: true, mock: true };
  }
  return post("/api/admin/override", args);
}

export async function syncNow(): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  return post("/api/sync", {});
}
