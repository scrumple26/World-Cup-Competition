"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

export function VerificationScreen({
  email,
  onVerified,
  onResend,
}: {
  email: string;
  onVerified: () => void;
  onResend: () => Promise<void>;
}) {
  const { logOut } = useAuth();
  const [resent, setResent] = useState(false);
  const [resending, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll every 4 seconds — reload Firebase user and check emailVerified
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { getClientAuth } = await import("@/lib/firebase/client");
        const auth = getClientAuth();
        if (!auth?.currentUser) return;
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          clearInterval(timer);
          onVerified();
        }
      } catch { /* silent */ }
    }, 4_000);
    return () => clearInterval(timer);
  }, [onVerified]);

  async function handleResend() {
    setBusy(true);
    setError(null);
    try {
      await onResend();
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="text-5xl">📧</div>
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-sm text-[var(--muted)]">
          We sent a verification link to <b className="text-[var(--fg)]">{email}</b>.
          Click the link to activate your account — this page updates automatically.
        </p>
        <p className="text-sm text-amber-400/90">
          📬 <b>Check your spam / junk folder</b> — the email comes from{" "}
          <b>worldcupcompetition1@gmail.com</b>. Mark it &quot;Not Spam&quot; and
          add that address to your contacts so future emails land in your inbox.
        </p>

        <div className="card p-5 space-y-3">
          {resent ? (
            <p className="text-sm text-green-400">Verification email resent!</p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">Didn&apos;t get it? Check spam or resend.</p>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                onClick={handleResend}
                disabled={resending}
                className="btn-primary w-full"
              >
                {resending ? "Sending…" : "Resend verification email"}
              </button>
            </>
          )}
          <button
            onClick={() => logOut()}
            className="w-full text-xs text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
