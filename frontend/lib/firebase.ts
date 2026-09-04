import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAf3WygUM640CAge9OpsnLHvx_SAZhMDmQ",
  authDomain: "sih-winners-58b67.firebaseapp.com",
  projectId: "sih-winners-58b67",
  storageBucket: "sih-winners-58b67.firebasestorage.app",
  messagingSenderId: "1008994046853",
  appId: "1:1008994046853:web:997f3f60bc079bd32ceaec",
  measurementId: "G-944ZFBCFCW"
};

// Initialize Firebase app singleton (client-safe)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  app,
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
};
