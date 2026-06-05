"use client";

/**
 * Auth context that works in both mock and Firebase modes.
 *
 * Mock mode: current user persisted in localStorage; signUp creates a profile
 * with a balanced random group assignment; login matches by email.
 * Firebase mode: Firebase Auth + a Firestore `users/{uid}` profile doc.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ADMIN_EMAIL, USE_MOCK } from "../config";
import type { UserProfile } from "../types";
import { assignFriendGroup, groupCounts } from "../groups";
import {
  getAllUsers,
  getCurrentUid,
  saveUser,
  setCurrentUid,
} from "../mock/store";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  needsProfile: boolean;
  /** Set when Firebase Auth user exists but email is not yet verified. */
  awaitingVerification: boolean;
  unverifiedEmail: string;
  signUp: (email: string, password: string, teamName: string, firstName: string, lastName: string, logoFile?: File | null) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeProfile: (firstName: string, lastName: string, teamName: string, logoFile?: File | null) => Promise<void>;
  resendVerification: () => Promise<void>;
  markVerified: () => void;
  mockMode: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  // ---- mock mode bootstrap ----
  useEffect(() => {
    if (!USE_MOCK) return;
    const uid = getCurrentUid();
    if (uid) {
      const found = getAllUsers().find((u) => u.uid === uid) ?? null;
      setUser(found);
    }
    setLoading(false);
  }, []);

  // ---- Firebase mode bootstrap ----
  useEffect(() => {
    if (USE_MOCK) return;
    let unsub = () => {};
    (async () => {
      try {
        const { getClientAuth } = await import("../firebase/client");
        const { onAuthStateChanged } = await import("firebase/auth");
        const auth = getClientAuth();
        if (!auth) {
          setLoading(false);
          return;
        }
        unsub = onAuthStateChanged(auth, async (fbUser) => {
          try {
            if (!fbUser) {
              setUser(null);
              setNeedsProfile(false);
              setAwaitingVerification(false);
              return;
            }
            // Require email verification except for the admin account.
            const email = (fbUser.email ?? "").toLowerCase();
            if (!fbUser.emailVerified && email !== ADMIN_EMAIL) {
              setUser(null);
              setNeedsProfile(false);
              setAwaitingVerification(true);
              setUnverifiedEmail(fbUser.email ?? "");
              return;
            }
            setAwaitingVerification(false);
            const idToken = await fbUser.getIdToken();
            const res = await fetch("/api/profile", {
              headers: { Authorization: `Bearer ${idToken}` },
            });
            const profile = res.ok ? (await res.json() as UserProfile | null) : null;
            if (profile) {
              setUser(profile);
              setNeedsProfile(false);
            } else {
              // No Firestore profile yet. Try to auto-create from stored signup data
              // (stored in displayName during signUp before email verification).
              const stored = parseStoredSignupData(fbUser.displayName);
              if (stored) {
                const created = await createFirebaseProfile(
                  idToken, stored.tn, stored.fn, stored.ln, stored.lu,
                ).catch(() => null);
                if (created) {
                  setUser(created);
                  setNeedsProfile(false);
                } else {
                  setUser(null);
                  setNeedsProfile(true);
                }
              } else {
                // Manually-created account — show profile setup screen.
                setUser(null);
                setNeedsProfile(true);
              }
            }
          } catch {
            setUser(null);
            setNeedsProfile(false);
          } finally {
            setLoading(false);
          }
        });
      } catch {
        // Firebase failed to initialise — fall through to login screen.
        setLoading(false);
      }
    })();
    return () => unsub();
  }, []);

  async function signUp(email: string, password: string, teamName: string, firstName: string, lastName: string, logoFile?: File | null) {
    const normEmail = email.trim().toLowerCase();
    const isAdmin = normEmail === ADMIN_EMAIL;

    if (USE_MOCK) {
      const all = getAllUsers();
      if (all.some((u) => u.email.toLowerCase() === normEmail)) {
        throw new Error("An account with that email already exists.");
      }
      const friendGroup = assignFriendGroup(groupCounts(all));
      const profile: UserProfile = {
        uid: `local-${Date.now()}`,
        email: normEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        teamName: teamName.trim(),
        friendGroup,
        isAdmin,
        createdAt: Date.now(),
      };
      saveUser(profile);
      setCurrentUid(profile.uid);
      setUser(profile);
      return;
    }

    // Firebase mode
    const { getClientAuth } = await import("../firebase/client");
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    const auth = getClientAuth();
    if (!auth) throw new Error("Firebase not configured.");
    const cred = await createUserWithEmailAndPassword(auth, normEmail, password);
    const idToken = await cred.user.getIdToken();

    // Upload logo first if provided (we have a valid token right now).
    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        const form = new FormData();
        form.append("image", logoFile);
        const res = await fetch("/api/upload-logo", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
          body: form,
        });
        if (res.ok) logoUrl = (await res.json()).url;
      } catch { /* proceed without logo */ }
    }

    // Store signup data in Firebase Auth displayName so onAuthStateChanged can
    // auto-create the Firestore profile AFTER email verification.
    // This prevents unverified accounts from appearing in the app/leaderboard.
    try {
      const { updateProfile } = await import("firebase/auth");
      await updateProfile(cred.user, {
        displayName: JSON.stringify({
          fn: firstName.trim(),
          ln: lastName.trim(),
          tn: teamName.trim(),
          ...(logoUrl ? { lu: logoUrl } : {}),
        }),
      });
    } catch { /* non-fatal */ }

    // Send verification email via Resend (better deliverability than Firebase default).
    try {
      const freshToken = await cred.user.getIdToken(true);
      await fetch("/api/send-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${freshToken}` },
      });
    } catch { /* non-fatal — user can resend from verification screen */ }

    // Show verification screen — profile is created only after email is verified.
    setAwaitingVerification(true);
    setUnverifiedEmail(normEmail);
    setLoading(false);
  }

  async function completeProfile(firstName: string, lastName: string, teamName: string, logoFile?: File | null) {
    const { getClientAuth } = await import("../firebase/client");
    const auth = getClientAuth();
    const fbUser = auth?.currentUser;
    if (!fbUser) throw new Error("Not signed in.");
    const idToken = await fbUser.getIdToken();

    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        const form = new FormData();
        form.append("image", logoFile);
        const res = await fetch("/api/upload-logo", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
          body: form,
        });
        if (res.ok) logoUrl = (await res.json()).url;
      } catch { /* proceed without logo */ }
    }

    const profile = await createFirebaseProfile(idToken, teamName, firstName, lastName, logoUrl);
    setUser(profile);
    setNeedsProfile(false);
  }

  async function resendVerification() {
    const { getClientAuth } = await import("../firebase/client");
    const auth = getClientAuth();
    if (!auth?.currentUser) throw new Error("Not signed in.");
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/send-verification", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(error ?? "Failed to send verification email");
    }
  }

  function markVerified() {
    // Called by VerificationScreen when polling detects emailVerified = true.
    // Trigger a reload so onAuthStateChanged fires with fresh user state.
    window.location.reload();
  }

  async function refreshProfile() {
    if (USE_MOCK || !user) return;
    const { getClientAuth } = await import("../firebase/client");
    const auth = getClientAuth();
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const profile = await res.json() as UserProfile | null;
      if (profile) setUser(profile);
    }
  }

  async function logIn(email: string, password: string) {
    const normEmail = email.trim().toLowerCase();
    if (USE_MOCK) {
      const found = getAllUsers().find(
        (u) => u.email.toLowerCase() === normEmail,
      );
      if (!found) throw new Error("No account found for that email.");
      setCurrentUid(found.uid);
      setUser(found);
      return;
    }
    const { getClientAuth } = await import("../firebase/client");
    const { signInWithEmailAndPassword, onAuthStateChanged } = await import("firebase/auth");
    const auth = getClientAuth();
    if (!auth) throw new Error("Firebase not configured.");
    const cred = await signInWithEmailAndPassword(auth, normEmail, password);

    // Firebase notifies Firestore's internal auth listener BEFORE calling external
    // onAuthStateChanged observers. Waiting here ensures Firestore has the token
    // by the time the app renders and data hooks start reading.
    await new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser?.uid === cred.user.uid) { unsub(); resolve(); }
      });
    });

    // Load profile via server API (Admin SDK — bypasses client Firestore timing).
    const idToken = await cred.user.getIdToken();
    const res = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const profile = res.ok ? (await res.json() as UserProfile | null) : null;
    if (profile) {
      setUser(profile);
      setNeedsProfile(false);
    } else {
      setNeedsProfile(true);
    }
  }

  async function logOut() {
    if (USE_MOCK) {
      setCurrentUid(null);
      setUser(null);
      return;
    }
    const { getClientAuth } = await import("../firebase/client");
    const { signOut } = await import("firebase/auth");
    const auth = getClientAuth();
    if (auth) await signOut(auth);
    setUser(null);
  }

  return (
    <Ctx.Provider
      value={{ user, loading, needsProfile, awaitingVerification, unverifiedEmail, signUp, logIn, logOut, refreshProfile, completeProfile, resendVerification, markVerified, mockMode: USE_MOCK }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ---- Firebase profile helpers (used only in Firebase mode) ----

/** Parse signup data that was stashed in Firebase Auth displayName before verification. */
function parseStoredSignupData(
  displayName: string | null,
): { fn: string; ln: string; tn: string; lu?: string } | null {
  if (!displayName) return null;
  try {
    const d = JSON.parse(displayName);
    if (d.fn && d.ln && d.tn) return d;
  } catch { /* not JSON */ }
  return null;
}

async function createFirebaseProfile(
  idToken: string,
  teamName: string,
  firstName: string,
  lastName: string,
  logoUrl?: string,
): Promise<UserProfile> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ teamName, firstName: firstName.trim(), lastName: lastName.trim(), ...(logoUrl ? { logoUrl } : {}) }),
  });
  if (!res.ok) throw new Error("Failed to create profile");
  return (await res.json()) as UserProfile;
}
