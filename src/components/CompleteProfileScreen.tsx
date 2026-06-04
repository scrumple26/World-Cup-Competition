"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LogoUpload } from "./LogoUpload";

export function CompleteProfileScreen() {
  const { completeProfile, logOut } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await completeProfile(firstName, lastName, teamName, logoFile);
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
          <h1 className="mt-2 text-2xl font-bold">Complete your account</h1>
          <p className="text-sm text-[var(--muted)]">
            Your login exists — just fill in your profile to get started.
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={submit} className="space-y-4">
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

            <LogoUpload onFilePicked={setLogoFile} size={52} />

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Setting up…" : "Complete setup"}
            </button>
          </form>
        </div>

        <button
          onClick={() => logOut()}
          className="mt-4 w-full text-center text-xs text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}
