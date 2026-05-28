import {
  applicationDefault,
  getApps,
  initializeApp,
  type AppOptions,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { readServerConfig } from "@/lib/config/server";

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  return getAuth(getFirebaseAdminApp()).verifyIdToken(idToken, true);
}

export async function createFirebaseSessionCookie(
  idToken: string,
  expiresInMs: number,
): Promise<string> {
  return getAuth(getFirebaseAdminApp()).createSessionCookie(idToken, {
    expiresIn: expiresInMs,
  });
}

export async function verifyFirebaseSessionCookie(
  sessionCookie: string,
): Promise<DecodedIdToken> {
  return getAuth(getFirebaseAdminApp()).verifySessionCookie(sessionCookie, true);
}

export function getFirebaseAdminApp() {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  const options: AppOptions = {
    credential: applicationDefault(),
  };
  const projectId = readFirebaseProjectId();

  if (projectId) {
    options.projectId = projectId;
  }

  return initializeApp(options);
}

function readFirebaseProjectId() {
  const config = readServerConfig();
  return (
    config.firebaseProjectId ??
    config.gcpProjectId ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT
  )?.trim();
}
