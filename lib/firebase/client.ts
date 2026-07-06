import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";

/**
 * Use the page's own host as authDomain in the browser so the OAuth
 * redirect handler stays first-party. Combined with the rewrites in
 * next.config.ts, Firebase's auth handler is proxied under our domain
 * — Safari ITP no longer partitions/blocks the storage it needs.
 *
 * On the server (and on localhost) we keep the configured Firebase
 * authDomain. localhost is allowed by Firebase for local dev.
 */
function getAuthDomain(): string | undefined {
  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
      return host;
    }
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
}

function getConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: getAuthDomain(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps()[0] ?? initializeApp(getConfig());
  return _app;
}

export function db(): Firestore {
  if (_db) return _db;
  // Memory-only cache: every tab starts cold and reads from the
  // server on first watch. block_do learned the hard way that
  // persistentLocalCache can store "doc doesn't exist" tombstones on
  // sign-out/sign-in churn and never recover — memory cache pays a
  // small first-paint cost in exchange for never lying.
  _db = initializeFirestore(firebaseApp(), {
    localCache: memoryLocalCache(),
  });
  return _db;
}

export function auth(): Auth {
  if (_auth) return _auth;
  // Explicit persistence chain + redirect resolver so Safari ITP can't
  // wipe pending-redirect state mid-flight. Falls through IDB →
  // localStorage → in-memory.
  if (typeof window !== "undefined") {
    _auth = initializeAuth(firebaseApp(), {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    return _auth;
  }
  _auth = getAuth(firebaseApp());
  return _auth;
}

export const googleProvider = new GoogleAuthProvider();
