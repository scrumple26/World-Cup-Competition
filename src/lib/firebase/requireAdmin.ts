import "server-only";

import { NextRequest } from "next/server";
import { getAdminAuth } from "./admin";
import { ADMIN_EMAIL } from "../config";

/**
 * Verify the request carries a valid Firebase ID token for the admin account.
 * Returns the decoded uid/email, or null if unauthorized/not configured.
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ uid: string; email: string } | null> {
  const auth = getAdminAuth();
  if (!auth) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email ?? "").toLowerCase();
    if (email !== ADMIN_EMAIL) return null;
    return { uid: decoded.uid, email };
  } catch {
    return null;
  }
}
