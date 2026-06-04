"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LogoUpload } from "./LogoUpload";

export function AuthScreen() {
  const { signUp, logIn, mockMode } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mockMode) throw new Error("Password reset isn't available in demo mode.");
      const { getClientAuth } = await import("@/lib/firebase/client");
      const { sendPasswordResetEmail } = await import("firebase/auth");
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase not configured.");
      await sendPasswordResetEmail(auth, resetEmail.trim().toLowerCase());
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(email, password, teamName, firstName, lastName, logoDataUrl);
      else await logIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-5xl">🏆</div>
          <h1 className="mt-2 text-2xl font-bold">World Cup Competition</h1>
          <p className="text-sm text-[var(--muted)]">
            Predict World Cup 2026. Outscore your friends. Win the bracket.
          </p>
        </div>

        <div className="card p-6">
          <div className="mb-4 flex rounded-lg border border-[var(--border)] p-1">
            {(["signup", "login"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setShowReset(false); setResetSent(false); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  mode === m
                    ? "bg-[var(--accent)] text-[#06210f]"
                    : "text-[var(--muted)]"
                }`}
              >
                {m === "signup" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          {/* ---- Forgot password panel ---- */}
          {showReset && (
            <div className="space-y-3">
              {resetSent ? (
                <p className="rounded-lg bg-green-500/10 px-3 py-3 text-sm text-green-300">
                  Check your email for a password reset link.
                </p>
              ) : (
                <form onSubmit={sendReset} className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                  <input
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                  {error && (
                    <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
                  )}
                  <button type="submit" className="btn-primary w-full" disabled={busy}>
                    {busy ? "Sending…" : "Send reset email"}
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => { setShowReset(false); setResetSent(false); setError(null); }}
                className="w-full text-center text-xs text-[var(--muted)] hover:text-[var(--fg)]"
              >
                ← Back to sign in
              </button>
            </div>
          )}

          {/* ---- Normal sign-in / sign-up form ---- */}
          {!showReset && <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First name</label>
                    <input
                      className="input"
                      placeholder="Nolan"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Last name</label>
                    <input
                      className="input"
                      placeholder="Smith"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Team name</label>
                  <input
                    className="input"
                    placeholder="e.g. Galaxy Strikers"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>
                <LogoUpload onDataUrl={setLogoDataUrl} size={52} />
              </>
            )}
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Password</label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setShowReset(true); setResetEmail(email); setError(null); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!mockMode}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account & join"
                  : "Sign in"}
            </button>
          </form>}

          {mode === "signup" && !showReset && (
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              You&apos;ll be randomly assigned to one of 4 groups.
            </p>
          )}
        </div>

        {mockMode && (
          <p className="mt-4 text-center text-xs text-amber-300/80">
            Demo mode: sign up with any email (password optional), or sign in as a
            sample team. Use <b>nolan.leyse@yahoo.com</b> for the admin view.
          </p>
        )}
      </div>
    </div>
  );
}
