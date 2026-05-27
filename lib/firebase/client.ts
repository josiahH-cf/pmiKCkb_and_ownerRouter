import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

let clientApp: FirebaseApp | null = null;

export function hasFirebaseBrowserConfig() {
  return Object.values(firebaseConfig).every(isNonEmptyString);
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseClientApp());
}

function getFirebaseClientApp() {
  if (clientApp) {
    return clientApp;
  }

  if (!hasFirebaseBrowserConfig()) {
    throw new Error("Firebase browser configuration is incomplete.");
  }

  clientApp = getApps()[0] ?? initializeApp(readFirebaseBrowserConfig());
  return clientApp;
}

function readFirebaseBrowserConfig(): FirebaseOptions {
  return {
    apiKey: readConfigValue(firebaseConfig.apiKey),
    appId: readConfigValue(firebaseConfig.appId),
    authDomain: readConfigValue(firebaseConfig.authDomain),
    projectId: readConfigValue(firebaseConfig.projectId),
  };
}

function readConfigValue(value: string | undefined) {
  if (!isNonEmptyString(value)) {
    throw new Error("Firebase browser configuration is incomplete.");
  }

  return value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
