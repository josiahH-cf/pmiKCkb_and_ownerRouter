import { describe, expect, it } from "vitest";

import { DriveSetupError, GoogleDriveClient } from "@/lib/google-drive/drive-dwd";

// Keyless DWD Drive client (in-boundary, acts AS the pmikcmetro.com subject). The live token mint is
// not unit-tested (live-only, like the Sheets mint); these exercise the folder find/create/ensure logic
// with an injected token + fetch — offline and free.

function fakeFetch(handlers: Array<(url: string, init?: RequestInit) => unknown>) {
  let call = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const body = handlers[Math.min(call, handlers.length - 1)](url, init);
    call += 1;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const TOKEN = async () => "tok";

describe("GoogleDriveClient.findFolder", () => {
  it("returns the first matching folder or null", async () => {
    const found = fakeFetch([() => ({ files: [{ id: "f1", name: "Photos" }] })]);
    const client = new GoogleDriveClient({ getToken: TOKEN, fetchImpl: found.fn });
    expect(await client.findFolder("Photos")).toEqual({ id: "f1", name: "Photos" });
    expect(found.calls[0].url).toContain("drive/v3/files");
    expect(found.calls[0].url).toContain(encodeURIComponent("mimeType = 'application/vnd.google-apps.folder'"));

    const empty = fakeFetch([() => ({ files: [] })]);
    const client2 = new GoogleDriveClient({ getToken: TOKEN, fetchImpl: empty.fn });
    expect(await client2.findFolder("Photos")).toBeNull();
  });
});

describe("GoogleDriveClient.ensureFolder", () => {
  it("returns the existing folder without creating it", async () => {
    const f = fakeFetch([() => ({ files: [{ id: "f1", name: "Photos" }] })]);
    const client = new GoogleDriveClient({ getToken: TOKEN, fetchImpl: f.fn });
    const result = await client.ensureFolder("Photos");
    expect(result).toEqual({ folder: { id: "f1", name: "Photos" }, created: false });
    expect(f.calls).toHaveLength(1); // find only, no create
  });

  it("creates the folder when none exists", async () => {
    const f = fakeFetch([
      () => ({ files: [] }), // find → none
      () => ({ id: "new1", name: "Photos" }), // create
    ]);
    const client = new GoogleDriveClient({ getToken: TOKEN, fetchImpl: f.fn });
    const result = await client.ensureFolder("Photos");
    expect(result).toEqual({ folder: { id: "new1", name: "Photos" }, created: true });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].init?.method).toBe("POST");
    const createBody = JSON.parse(String(f.calls[1].init?.body));
    expect(createBody.mimeType).toBe("application/vnd.google-apps.folder");
    expect(createBody.name).toBe("Photos");
  });
});

describe("mintDriveDwdToken (via the client default) setup guard", () => {
  it("throws DriveSetupError when no SA/subject is configured", async () => {
    const savedSa = process.env.SHEETS_IMPERSONATE_SA;
    const savedSubject = process.env.SHEETS_DWD_SUBJECT;
    delete process.env.SHEETS_IMPERSONATE_SA;
    delete process.env.SHEETS_DWD_SUBJECT;
    try {
      const client = new GoogleDriveClient({ fetchImpl: fakeFetch([() => ({ files: [] })]).fn });
      await expect(client.findFolder("Photos")).rejects.toBeInstanceOf(DriveSetupError);
    } finally {
      if (savedSa !== undefined) process.env.SHEETS_IMPERSONATE_SA = savedSa;
      if (savedSubject !== undefined) process.env.SHEETS_DWD_SUBJECT = savedSubject;
    }
  });
});
