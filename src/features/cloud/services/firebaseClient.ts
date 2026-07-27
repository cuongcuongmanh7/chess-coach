import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig, firebaseConfigured } from "./firebaseConfig";

export { firebaseConfigured };

let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.useDeviceLanguage();
  firestore = getFirestore(app);
}

export function requireAuth() {
  if (!auth) throw new Error("Firebase chưa được cấu hình cho bản build này.");
  return auth;
}

export function optionalAuth() {
  return auth;
}

export function requireFirestore() {
  if (!firestore) throw new Error("Cloud Firestore chưa được cấu hình cho bản build này.");
  return firestore;
}
