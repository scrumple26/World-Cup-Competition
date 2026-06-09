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
  // Fill-teams detail
  created?: number;
  // Logo upload detail
  url?: string;
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
    created: data.created as number | undefined,
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

export async function fillTeams(): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  return post("/api/admin/fill-teams", {});
}

export async function uploadTeamLogo(uid: string, file: File): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  const token = await adminToken();
  const form = new FormData();
  form.append("uid", uid);
  form.append("image", file);
  const res = await fetch("/api/admin/upload-logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({})) as { error?: string; url?: string };
  return { ok: res.ok, error: data.error, url: data.url };
}

export async function createFeedPost(text: string, image: File | null): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  const token = await adminToken();
  const form = new FormData();
  form.append("text", text);
  if (image) form.append("image", image);
  const res = await fetch("/api/feed/post", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  return { ok: res.ok, error: data.error };
}

export async function deleteFeedPost(id: string): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  const token = await adminToken();
  const res = await fetch("/api/feed/post", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  return { ok: res.ok, error: data.error };
}

export async function removeUser(uid: string): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  const token = await adminToken();
  const res = await fetch("/api/admin/remove-user", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid }),
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  return { ok: res.ok, error: data.error };
}
