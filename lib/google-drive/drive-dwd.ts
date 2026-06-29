// Keyless domain-wide-delegation Google Drive client (in-boundary). Identity: acts AS a
// `pmikcmetro.com` user (the DWD subject) via a service account that signs a JWT — NEVER the personal
// account, never a key file. Mirrors the Sheets reader's DWD posture (lib/google-sheets/read-client.ts):
// the SA's client id must be authorized for the Drive scope in Admin console → Security → API controls →
// Domain-wide delegation. Folders/files it creates are owned by the subject user, inside the boundary.
//
// The token mint is live-only (signJwt + token exchange) and not unit-tested, exactly like the Sheets
// mint; the folder/upload methods take an injectable token + fetch so they ARE unit-tested offline.

import { GoogleAuth } from "google-auth-library";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
// Least privilege: the app only ever touches files/folders it creates on the user's behalf.
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export class DriveSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveSetupError";
  }
}

export interface DriveFile {
  id: string;
  name?: string;
  webViewLink?: string;
}

/**
 * Mint a keyless DWD access token scoped to Drive, acting AS the subject user. The SA signs a JWT (via
 * iamcredentials.signJwt — the caller holds Token Creator on the SA), exchanged for a user-scoped token.
 * Live-only. Throws DriveSetupError when the SA/subject are unset or the exchange is refused (e.g. the
 * Drive scope is not yet authorized for the SA in Admin console → Domain-wide delegation).
 */
export async function mintDriveDwdToken(
  options: { serviceAccount?: string; subject?: string; scope?: string } = {},
): Promise<string> {
  const saEmail = options.serviceAccount ?? process.env.SHEETS_IMPERSONATE_SA?.trim();
  const subject = options.subject ?? process.env.SHEETS_DWD_SUBJECT?.trim();
  const scope = options.scope ?? DRIVE_FILE_SCOPE;
  if (!saEmail || !subject) {
    throw new DriveSetupError(
      "Drive DWD needs SHEETS_IMPERSONATE_SA (service account) + SHEETS_DWD_SUBJECT (a pmikcmetro.com user).",
    );
  }

  const sourceClient = await new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] }).getClient();
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iss: saEmail,
    sub: subject,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signResponse = await sourceClient.request<{ signedJwt: string }>({
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(saEmail)}:signJwt`,
    method: "POST",
    data: { payload },
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signResponse.data.signedJwt,
    }),
  });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new DriveSetupError(
      `Drive DWD token exchange failed (HTTP ${tokenResponse.status}): ${tokenData.error ?? ""} ${tokenData.error_description ?? ""}`.trim() +
        " — confirm the Drive scope is authorized for the service account in Admin console → Domain-wide delegation.",
    );
  }
  return tokenData.access_token;
}

type FetchImpl = typeof fetch;

/** Drive folder/file operations as the DWD subject. Token + fetch are injectable for offline tests. */
export class GoogleDriveClient {
  private readonly getToken: () => Promise<string>;
  private readonly fetchImpl: FetchImpl;

  constructor(
    options: {
      getToken?: () => Promise<string>;
      fetchImpl?: FetchImpl;
      serviceAccount?: string;
      subject?: string;
    } = {},
  ) {
    this.getToken =
      options.getToken ??
      (() =>
        mintDriveDwdToken({ serviceAccount: options.serviceAccount, subject: options.subject }));
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async authHeader(): Promise<string> {
    return `Bearer ${await this.getToken()}`;
  }

  /** Find an app-created folder by exact name (optionally within a parent), or null. */
  async findFolder(name: string, parentId?: string): Promise<DriveFile | null> {
    const clauses = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
      ...(parentId ? [`'${parentId}' in parents`] : []),
    ];
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id,name,webViewLink)&pageSize=1`;
    const response = await this.fetchImpl(url, { headers: { authorization: await this.authHeader() } });
    if (!response.ok) {
      throw new DriveSetupError(`Drive folder lookup failed (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as { files?: DriveFile[] };
    return body.files && body.files.length > 0 ? body.files[0] : null;
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const response = await this.fetchImpl(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          authorization: await this.authHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          mimeType: DRIVE_FOLDER_MIME,
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      },
    );
    if (!response.ok) {
      throw new DriveSetupError(`Drive folder create failed (HTTP ${response.status}).`);
    }
    return (await response.json()) as DriveFile;
  }

  /** Idempotent: return the existing folder or create it. */
  async ensureFolder(
    name: string,
    parentId?: string,
  ): Promise<{ folder: DriveFile; created: boolean }> {
    const existing = await this.findFolder(name, parentId);
    if (existing) {
      return { folder: existing, created: false };
    }
    return { folder: await this.createFolder(name, parentId), created: true };
  }
}
