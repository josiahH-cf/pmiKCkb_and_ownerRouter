import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => ({ status: "clear" })),
}));

import { createRenewalCompScreenshotRouteHandlers } from "@/app/api/lease-renewal/comp-screenshot/route";
import { createRenewalCompScreenshotRollbackHandler } from "@/app/api/lease-renewal/comp-screenshot/rollback/route";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type {
  CreateReservedRenewalCompScreenshotInput,
  RenewalCompScreenshotDriveFile,
  RenewalCompScreenshotDriveProvider,
} from "@/lib/google-drive/renewal-comp-screenshot";
import { RENEWAL_COMP_SCREENSHOT_FOLDER_MIME } from "@/lib/google-drive/renewal-comp-screenshot";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { MemoryCompScreenshotExecutionStore } from "@/lib/lease-renewal/comp-screenshot-contract";
import type {
  CompScreenshotExecutionContext,
  CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";

const ACTOR: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString("base64");

function openRegistry(): CreateActionRegistryInput[] {
  const row = ACTION_REGISTRY_SEED.find(
    (entry) => entry.key === "google_drive.renewal_comp_screenshot.store",
  );
  if (!row) throw new Error("Missing screenshot action row.");
  return [
    {
      ...row,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      production_allowed: true,
    },
  ];
}

function fileFor(
  input: CreateReservedRenewalCompScreenshotInput,
  overrides: Partial<RenewalCompScreenshotDriveFile> = {},
): RenewalCompScreenshotDriveFile {
  return {
    id: input.fileId,
    name: input.name,
    mimeType: input.mimeType,
    size: String(input.bytes.byteLength),
    md5Checksum: createHash("md5").update(input.bytes).digest("hex"),
    sha256Checksum: createHash("sha256").update(input.bytes).digest("hex"),
    parents: [input.parentFolderId],
    trashed: false,
    explicitlyTrashed: false,
    appProperties: { ...input.appProperties },
    createdTime: "2026-07-30T00:00:00.000Z",
    modifiedTime: "2026-07-30T00:00:00.000Z",
    version: "1",
    headRevisionId: "revision-1",
    webViewLink: `https://drive.google.com/file/d/${input.fileId}/view`,
    isAppAuthorized: true,
    ownedByMe: true,
    capabilities: {
      canTrash: true,
      canUntrash: true,
      canMoveItemOutOfDrive: true,
    },
    ...overrides,
  };
}

function makeRuntime() {
  const store = new MemoryCompScreenshotExecutionStore();
  let createdInput: CreateReservedRenewalCompScreenshotInput | null = null;
  let currentFile: RenewalCompScreenshotDriveFile | null = null;
  const provider: RenewalCompScreenshotDriveProvider = {
    reserveFileId: vi.fn(async () => ({
      outcome: "reserved" as const,
      fileId: "reserved_drive_file_123",
    })),
    getFolder: vi.fn(async (folderId) => ({
      outcome: "found" as const,
      httpStatus: 200,
      folder: {
        id: folderId,
        mimeType: RENEWAL_COMP_SCREENSHOT_FOLDER_MIME,
        trashed: false,
        version: "1",
        isAppAuthorized: true,
        ownedByMe: true,
        capabilities: { canAddChildren: true },
      },
    })),
    createReservedFile: vi.fn(async (input) => {
      createdInput = input;
      currentFile = fileFor(input);
      return { outcome: "accepted" as const, httpStatus: 200, file: currentFile };
    }),
    getFile: vi.fn(async () =>
      currentFile
        ? { outcome: "found" as const, httpStatus: 200, file: currentFile }
        : { outcome: "absent" as const, httpStatus: 404 as const },
    ),
    downloadFile: vi.fn(async () => ({
      outcome: "absent" as const,
      httpStatus: 404 as const,
    })),
    trashFile: vi.fn(async (fileId) => {
      if (!createdInput || !currentFile || currentFile.id !== fileId) {
        return {
          outcome: "rejected" as const,
          certainty: "not_applied" as const,
          reason: "http" as const,
          httpStatus: 404,
        };
      }
      currentFile = fileFor(createdInput, {
        trashed: true,
        explicitlyTrashed: true,
        modifiedTime: "2026-07-30T00:01:00.000Z",
        version: "2",
        headRevisionId: "revision-2",
      });
      return { outcome: "accepted" as const, httpStatus: 200, file: currentFile };
    }),
  };
  const createProvider = vi.fn(() => provider);
  let nowMs = Date.parse("2026-07-30T00:00:00.000Z");
  const deps: CompScreenshotServiceDeps = {
    store,
    folderId: "approved_drive_folder_123",
    providerIdentityHash: "f".repeat(64),
    createProvider,
    now: () => new Date(nowMs++),
    nonce: () => "route-test-nonce",
  };
  const context: CompScreenshotExecutionContext = {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    registry: openRegistry(),
  };
  return { deps, context, provider, createProvider };
}

function storeRequest(
  confirm: boolean,
  identifiers: { executionId?: string; previewHash?: string } = {},
) {
  return new Request("http://localhost/api/lease-renewal/comp-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operation: "store",
      confirm,
      leaseId: "lease-route-1",
      filename: "comp.png",
      mimeType: "image/png",
      base64: PNG_BASE64,
      ...identifiers,
    }),
  });
}

function resumeRequest(
  executionId: string,
  overrides: Partial<{
    leaseId: string;
    filename: string;
    mimeType: string;
    base64: string;
  }> = {},
) {
  return new Request("http://localhost/api/lease-renewal/comp-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operation: "resume",
      leaseId: "lease-route-1",
      executionId,
      filename: "comp.png",
      mimeType: "image/png",
      base64: PNG_BASE64,
      ...overrides,
    }),
  });
}

describe("renewal comp screenshot route contract", () => {
  it("refuses Live-read-only reconcile before any ledger or Drive operation", async () => {
    const runtime = makeRuntime();
    runtime.context.descriptor = {
      environmentKind: "demo",
      dataContext: "live_readonly",
      source: "explicit",
    };
    const getExecution = vi.spyOn(runtime.deps.store, "getExecution");
    const markAbsent = vi.spyOn(runtime.deps.store, "markAbsentIfNotStarted");
    const markAmbiguous = vi.spyOn(runtime.deps.store, "markAmbiguous");
    const finish = vi.spyOn(runtime.deps.store, "finish");
    const handlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });

    const response = await handlers.GET(
      new Request(
        `http://localhost/api/lease-renewal/comp-screenshot?operation=reconcile&executionId=comp_store_${"a".repeat(48)}`,
      ),
    );

    expect(response.status).toBe(409);
    expect(getExecution).not.toHaveBeenCalled();
    expect(markAbsent).not.toHaveBeenCalled();
    expect(markAmbiguous).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
    expect(runtime.createProvider).not.toHaveBeenCalled();
  });

  it("refuses a closed action before runtime setup or request-body parsing", async () => {
    const buildRuntime = vi.fn();
    const request = storeRequest(false);
    const json = vi.spyOn(request, "json");
    const handlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => {
        throw new ActionNotExecutableError("google_drive.renewal_comp_screenshot.store");
      },
      buildRuntime,
    });

    const response = await handlers.POST(request);

    expect(response.status).toBe(409);
    expect(buildRuntime).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("refuses missing setup and a non-live descriptor before provider construction", async () => {
    const runtime = makeRuntime();
    runtime.deps.folderId = "";
    const request = storeRequest(false);
    const json = vi.spyOn(request, "json");
    const handlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });
    const response = await handlers.POST(request);
    expect(response.status).toBe(503);
    expect(json).toHaveBeenCalledTimes(1);
    expect(runtime.createProvider).not.toHaveBeenCalled();

    const demo = makeRuntime();
    demo.context.descriptor = {
      environmentKind: "demo",
      dataContext: "demo",
      source: "explicit",
    };
    const demoRequest = storeRequest(false);
    const demoJson = vi.spyOn(demoRequest, "json");
    const demoResponse = await createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => demo,
    }).POST(demoRequest);
    expect(demoResponse.status).toBe(409);
    expect(demoJson).not.toHaveBeenCalled();
    expect(demo.createProvider).not.toHaveBeenCalled();
  });

  it("resumes a claimed execution after folder config removal without Drive, then commits its stored target", async () => {
    const runtime = makeRuntime();
    const handlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });
    const prepared = (await (await handlers.POST(storeRequest(false))).json()) as {
      preview: { executionId: string; previewHash: string };
    };
    await runtime.deps.store.claim({
      previewHash: prepared.preview.previewHash,
      executionId: prepared.preview.executionId,
      actorUid: ACTOR.uid,
      nowMs: Date.parse("2026-07-30T00:00:01.000Z"),
    });
    runtime.deps.folderId = "";

    const resumedResponse = await handlers.POST(
      resumeRequest(prepared.preview.executionId),
    );
    expect(
      resumedResponse.status,
      JSON.stringify(await resumedResponse.clone().json()),
    ).toBe(200);
    expect(await resumedResponse.json()).toEqual({
      status: "resume",
      preview: {
        executionId: prepared.preview.executionId,
        previewHash: prepared.preview.previewHash,
      },
      file: {
        filename: "comp.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        targetLabel: "PMI KC in-boundary Drive image folder",
      },
    });
    expect(runtime.createProvider).not.toHaveBeenCalled();
    expect(runtime.provider.reserveFileId).not.toHaveBeenCalled();
    expect(runtime.provider.createReservedFile).not.toHaveBeenCalled();

    const committedResponse = await handlers.POST(
      storeRequest(true, {
        executionId: prepared.preview.executionId,
        previewHash: prepared.preview.previewHash,
      }),
    );
    expect(
      committedResponse.status,
      JSON.stringify(await committedResponse.clone().json()),
    ).toBe(200);
    expect(await committedResponse.json()).toMatchObject({
      status: "delivered",
      executionId: prepared.preview.executionId,
      receipt: { ref: "drive:reserved_drive_file_123" },
    });
    expect(runtime.provider.getFolder).toHaveBeenCalledWith("approved_drive_folder_123");
  });

  it("previews with zero Drive construction, then uploads only after exact confirmation", async () => {
    const runtime = makeRuntime();
    const handlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });

    const previewResponse = await handlers.POST(storeRequest(false));
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as {
      status: string;
      preview: { executionId: string; previewHash: string };
    };
    expect(preview.status).toBe("preview");
    expect(runtime.createProvider).not.toHaveBeenCalled();

    const commitResponse = await handlers.POST(
      storeRequest(true, {
        executionId: preview.preview.executionId,
        previewHash: preview.preview.previewHash,
      }),
    );
    expect(
      commitResponse.status,
      JSON.stringify(await commitResponse.clone().json()),
    ).toBe(200);
    const commit = (await commitResponse.json()) as {
      status: string;
      receipt: { ref: string };
    };
    expect(commit).toMatchObject({
      status: "delivered",
      receipt: { ref: "drive:reserved_drive_file_123" },
    });
    expect(runtime.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(runtime.provider.createReservedFile).toHaveBeenCalledTimes(1);
    expect(runtime.provider.getFile).toHaveBeenCalledTimes(1);
  });

  it("keeps status/reconcile reachable and exact rollback available while its runtime gate is open", async () => {
    const runtime = makeRuntime();
    const openHandlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });
    const prepared = (await (await openHandlers.POST(storeRequest(false))).json()) as {
      preview: { executionId: string; previewHash: string };
    };
    await openHandlers.POST(
      storeRequest(true, {
        executionId: prepared.preview.executionId,
        previewHash: prepared.preview.previewHash,
      }),
    );

    const closedHandlers = createRenewalCompScreenshotRouteHandlers({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => {
        throw new ActionNotExecutableError("google_drive.renewal_comp_screenshot.store");
      },
      buildRuntime: () => runtime,
    });
    const statusResponse = await closedHandlers.GET(
      new Request(
        `http://localhost/api/lease-renewal/comp-screenshot?operation=status&executionId=${prepared.preview.executionId}`,
      ),
    );
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ status: "delivered" });

    const rollback = createRenewalCompScreenshotRollbackHandler({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => undefined,
      buildRuntime: () => runtime,
    });
    const missingLeaseResponse = await rollback(
      new Request("http://localhost/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: false,
          executionId: prepared.preview.executionId,
        }),
      }),
    );
    expect(missingLeaseResponse.status).toBe(400);

    const wrongLeaseResponse = await rollback(
      new Request("http://localhost/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: false,
          leaseId: "lease-route-other",
          executionId: prepared.preview.executionId,
        }),
      }),
    );
    expect(wrongLeaseResponse.status).toBe(409);
    expect(runtime.provider.trashFile).not.toHaveBeenCalled();

    const rollbackPreviewResponse = await rollback(
      new Request("http://localhost/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: false,
          leaseId: "lease-route-1",
          executionId: prepared.preview.executionId,
        }),
      }),
    );
    const rollbackPreview = (await rollbackPreviewResponse.json()) as {
      preview: { rollbackId: string; previewHash: string };
    };
    expect(runtime.provider.trashFile).not.toHaveBeenCalled();

    const rollbackCommitResponse = await rollback(
      new Request("http://localhost/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: true,
          leaseId: "lease-route-1",
          executionId: prepared.preview.executionId,
          rollbackId: rollbackPreview.preview.rollbackId,
          previewHash: rollbackPreview.preview.previewHash,
        }),
      }),
    );
    expect(rollbackCommitResponse.status).toBe(200);
    expect(await rollbackCommitResponse.json()).toMatchObject({
      status: "rolled_back",
      receipt: { explicitlyTrashed: true },
    });
    expect(runtime.provider.trashFile).toHaveBeenCalledTimes(1);

    const duplicate = await rollback(
      new Request("http://localhost/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: true,
          leaseId: "lease-route-1",
          executionId: prepared.preview.executionId,
          rollbackId: rollbackPreview.preview.rollbackId,
          previewHash: rollbackPreview.preview.previewHash,
        }),
      }),
    );
    expect(await duplicate.json()).toMatchObject({
      status: "rolled_back",
      duplicate: true,
    });
    expect(runtime.provider.trashFile).toHaveBeenCalledTimes(1);
  });

  it("maps a runtime-suspended rollback to 409 before runtime or body work", async () => {
    const buildRuntime = vi.fn(() => makeRuntime());
    const rollback = createRenewalCompScreenshotRollbackHandler({
      authenticate: async () => ACTOR,
      assertRuntimeExecutable: async () => {
        throw new ActionRuntimeSuspendedError(
          "google_drive.renewal_comp_screenshot.store",
        );
      },
      buildRuntime,
    });
    const request = new Request(
      "http://localhost/api/lease-renewal/comp-screenshot/rollback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      },
    );

    const response = await rollback(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      action_key: "google_drive.renewal_comp_screenshot.store",
      error_type: "action_runtime_suspended",
    });
    expect(buildRuntime).not.toHaveBeenCalled();
    await expect(request.text()).resolves.toBe("{not valid json");
  });
});
