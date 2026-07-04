"use client";

/** Admin actions: mock-mode operates locally; live mode calls token-gated routes. */

import { USE_MOCK } from "./config";
import type { FriendGroup, Outcome, UserProfile } from "./types";
import type { PunditLine, WeeklyTimes, FauxTweet } from "./feedTypes";
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
  // Pick-backup detail
  backed?: number;
  skipped?: number;
  // Bulk unlock detail
  users?: number;
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
    backed: data.backed as number | undefined,
    skipped: data.skipped as number | undefined,
    users: data.users as number | undefined,
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

export async function backupLockedPicks(): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  return post("/api/admin/backup-picks", {});
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

export interface PunditTestMatch {
  homeTeam: string; awayTeam: string; homeScore: number; awayScore: number;
}
export async function generatePunditTest(
  args: { sample?: boolean; fixtureId?: number },
): Promise<{ ok: boolean; commentary?: PunditLine[]; match?: PunditTestMatch; hasKey?: boolean; error?: string }> {
  const token = await adminToken();
  const res = await fetch("/api/admin/commentary", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  });
  const data = (await res.json().catch(() => ({}))) as {
    commentary?: PunditLine[]; hasKey?: boolean; error?: string;
    context?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };
  };
  const match = data.context
    ? { homeTeam: data.context.homeTeam, awayTeam: data.context.awayTeam, homeScore: data.context.homeScore, awayScore: data.context.awayScore }
    : undefined;
  return { ok: res.ok, commentary: data.commentary, match, hasKey: data.hasKey, error: data.error };
}

export async function generateWeeklyTimesTest(
  preview = true,
): Promise<{ ok: boolean; times?: WeeklyTimes; hasKey?: boolean; error?: string }> {
  const token = await adminToken();
  const res = await fetch("/api/feed/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ preview }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    times?: WeeklyTimes; hasKey?: boolean; error?: string;
  };
  return { ok: res.ok, times: data.times, hasKey: data.hasKey, error: data.error };
}

export async function generateTweetTest(
  phase: "result" | "prematch" | "halftime" = "result",
): Promise<{ ok: boolean; tweets?: FauxTweet[]; hasKey?: boolean; error?: string }> {
  const token = await adminToken();
  const res = await fetch("/api/admin/social", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phase }),
  });
  const data = (await res.json().catch(() => ({}))) as { tweets?: FauxTweet[]; hasKey?: boolean; error?: string };
  return { ok: res.ok, tweets: data.tweets, hasKey: data.hasKey, error: data.error };
}

export interface ReminderTestResult {
  ok: boolean;
  error?: string;
  sent?: number;
  count?: number;
  recipients?: { email: string; firstName: string; teamName: string }[];
}

/**
 * Trigger a prediction-reminder send via the admin route.
 *   mode "test" — sends the chosen email only to the admin (to preview/approve).
 *   mode "dry"  — returns the live recipient list without sending anything.
 */
export async function sendReminderTest(
  phase: "4h" | "1h",
  mode: "test" | "dry" = "test",
): Promise<ReminderTestResult> {
  if (USE_MOCK) return { ok: true };
  const token = await adminToken();
  const res = await fetch("/api/reminders/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phase, mode }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    sent?: number;
    count?: number;
    recipients?: { email: string; firstName: string; teamName: string }[];
  };
  return { ok: res.ok, error: data.error, sent: data.sent, count: data.count, recipients: data.recipients };
}

export async function sendKnockoutReminder(
  mode: "send" | "test" | "dry" = "send",
): Promise<ReminderTestResult> {
  if (USE_MOCK) return { ok: true };
  const token = await adminToken();
  const res = await fetch("/api/reminders/knockout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ".concat(token ?? "") },
    body: JSON.stringify({ mode }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    sent?: number;
    count?: number;
    candidates?: number;
    recipients?: { email: string; firstName: string; teamName: string }[];
  };
  return {
    ok: res.ok,
    error: data.error,
    sent: data.sent,
    count: data.count ?? data.candidates,
    recipients: data.recipients,
  };
}

export interface ReminderPhaseState { at: number; candidates: number; sent: number; failed: number; }
export interface ReminderStatus { sent4h?: ReminderPhaseState; sent1h?: ReminderPhaseState; }

/** Read whether the 4-hour / final-hour reminder emails have been sent, with counts. */
export async function getReminderStatus(): Promise<ReminderStatus> {
  if (USE_MOCK) return {};
  const token = await adminToken();
  const res = await fetch("/api/reminders/predictions?mode=status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as { status?: ReminderStatus };
  return data.status ?? {};
}

export async function unlockUser(uid: string): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  return post("/api/admin/unlock", { uid });
}

export async function unlockAllUsers(): Promise<AdminResult> {
  if (USE_MOCK) return { ok: true, mock: true };
  return post("/api/admin/unlock", { all: true });
}

export async function getPredCounts(
  uids: string[],
): Promise<Record<string, { matches: number; locked: boolean }>> {
  const token = await adminToken();
  const res = await fetch("/api/admin/pred-counts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uids }),
  });
  const data = (await res.json().catch(() => ({}))) as { counts?: Record<string, { matches: number; locked: boolean }> };
  return data.counts ?? {};
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
