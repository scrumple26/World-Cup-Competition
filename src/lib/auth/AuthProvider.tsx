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
  signUp: (email: string, password: string, teamName: string, firstName: string, lastName: string, logoFile?: File | null) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
      const { getClientAuth } = await import("../firebase/client");
      const { onAuthStateChanged } = await import("firebase/auth");
      const auth = getClientAuth();
      if (!auth) {
        setLoading(false);
        return;
      }
      unsub = onAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) {
          setUser(null);
          setLoading(false);
          return;
        }
        const profile = await loadFirebaseProfile(fbUser.uid);
        setUser(profile);
        setLoading(false);
      });
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

    // Upload logo first (if provided); failures are non-fatal.
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
      } catch {
        // proceed without logo
      }
    }

    const profile = await createFirebaseProfile(idToken, teamName, firstName, lastName, logoUrl);
    setUser(profile);
  }

  async function refreshProfile() {
    if (USE_MOCK || !user) return;
    const profile = await loadFirebaseProfile(user.uid);
    setUser(profile);
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
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = getClientAuth();
    if (!auth) throw new Error("Firebase not configured.");
    await signInWithEmailAndPassword(auth, normEmail, password);
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
      value={{ user, loading, signUp, logIn, logOut, refreshProfile, mockMode: USE_MOCK }}
    >
      {children}
    </Ctx.Provider>
  );
}

// ---- Firebase profile helpers (used only in Firebase mode) ----

async function loadFirebaseProfile(uid: string): Promise<UserProfile | null> {
  const { getClientDb } = await import("../firebase/client");
  const { doc, getDoc } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
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
