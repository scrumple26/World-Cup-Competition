"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NavBar } from "./NavBar";
import { AuthScreen } from "./AuthScreen";

export function AppFrame({ children }: { children: ReactNode }) {
  const { user, loading, mockMode } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen">
      <NavBar />
      {mockMode && (
        <div className="bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-300">
          Demo mode — using in-memory sample data. Connect Firebase to go live.
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
