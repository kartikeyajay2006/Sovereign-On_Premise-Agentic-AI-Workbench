/**
 * Optional Firebase authentication.
 *
 * Configuration comes from the environment, never from source. The module is
 * inert unless `NEXT_PUBLIC_FIREBASE_ENABLED` is `true` and a full config is
 * present, so the workbench runs — and builds — with no Firebase at all.
 *
 * Why it is off by default: Firebase authenticates against Google's servers.
 * An air-gapped deployment cannot reach them, and a connected one would be
 * sending identity traffic off the host, which contradicts the platform's
 * central claim and is recorded as egress by its own sovereignty monitor.
 * Local sign-in (PBKDF2, roles from policies/access-control.yaml) is the
 * supported path for anything confidential.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only when explicitly enabled and fully configured. */
export const firebaseEnabled: boolean =
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED === "true" &&
  Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let cachedApp: FirebaseApp | null = null;

function app(): FirebaseApp {
  if (!firebaseEnabled) {
    throw new Error(
      "Firebase is not enabled on this deployment. Sign in with a local " +
        "workbench account instead.",
    );
  }
  if (!cachedApp) {
    cachedApp = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: config.apiKey!,
          authDomain: config.authDomain!,
          projectId: config.projectId!,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId!,
        });
  }
  return cachedApp;
}

/** Auth handle, created on first use so nothing initialises at import time. */
export function firebaseAuth(): Auth {
  return getAuth(app());
}

export function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
};
