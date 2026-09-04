/**
 * Optional Firebase sign-in.
 *
 * The workbench authenticates locally: the API issues its own session token
 * and an HttpOnly cookie, and nothing about identity needs to leave the host.
 * Firebase is a convenience layer on top of that for hosted demos, so it is
 * configured entirely from the environment and is off unless a deployment
 * turns it on. An air-gapped install must be able to sign in with no route to
 * Google, and hardcoded credentials in the repository cannot be rotated.
 *
 * Set NEXT_PUBLIC_FIREBASE_ENABLED=true plus the values below in
 * frontend/.env.local. See frontend/.env.example.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

/**
 * Both the switch and the credentials have to be present. A deployment that
 * sets the flag but forgets the keys should fall back to local sign-in rather
 * than render a Google button that throws when pressed.
 */
export const firebaseEnabled =
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED === 'true' &&
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.appId)

// Nothing is initialised while disabled, so a host with no outbound route
// never attempts the connection in the first place.
const app: FirebaseApp | null = firebaseEnabled
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  : null

const auth: Auth | null = app ? getAuth(app) : null
const googleProvider = new GoogleAuthProvider()

/** The Auth instance, or a readable failure if the host has it switched off. */
export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase sign-in is not configured on this host. Use a workbench ' +
        'account instead, or set NEXT_PUBLIC_FIREBASE_* in frontend/.env.local.',
    )
  }
  return auth
}

// Analytics is deliberately absent. It is an outbound reporting channel to
// Google on every page view, which the interface's own posture line ("0
// EXTERNAL CALLS") states does not happen.

export {
  app,
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
}
