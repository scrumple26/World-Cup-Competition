import "server-only";

/**
 * Firebase Admin SDK singleton (server). Returns null when credentials are
 * absent so server routes can degrade gracefully during mock-mode development.
 */

import {
  getApps,
  initializeApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

let app: App | null = null;

function getAdminApp(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;

  // .env stores the key with literal \n; convert to real newlines.
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return app;
}

let firestore: Firestore | null = null;

export function getAdminDb(): Firestore | null {
  const a = getAdminApp();
  if (!a) return null;
  if (!firestore) {
    firestore = getFirestore(a);
    // Ignore (drop) undefined fields instead of throwing on them. Without this,
    // a single optional field left undefined — e.g. a logo-less profile's
    // `logoUrl` nested inside a feed entry's perUser array — makes the entire
    // .set() throw, which silently aborted ALL feed/pundit/tweet generation.
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function getAdminAuth(): Auth | null {
  const a = getAdminApp();
  return a ? getAuth(a) : null;
}

export function getAdminStorage(): Storage | null {
  const a = getAdminApp();
  return a ? getStorage(a) : null;
}

export function isAdminConfigured(): boolean {
  return getAdminApp() !== null;
}
