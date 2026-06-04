"use client";

/**
 * Firebase Web SDK singletons (browser). Safe to import when Firebase is not
 * configured: getters return null and the app falls back to mock mode.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { FIREBASE_WEB_CONFIGURED, firebaseWebConfig } from "../config";

let app: FirebaseApp | null = null;

function getClientApp(): FirebaseApp | null {
  if (!FIREBASE_WEB_CONFIGURED) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseWebConfig);
  }
  return app;
}

export function getClientAuth(): Auth | null {
  const a = getClientApp();
  return a ? getAuth(a) : null;
}

export function getClientDb(): Firestore | null {
  const a = getClientApp();
  return a ? getFirestore(a) : null;
}
