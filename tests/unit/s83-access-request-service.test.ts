import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  cancelAccessRequest,
  getAdminAccessRequestDetail,
  listAdminAccessRequests,
  listOwnAccessRequests,
  previewAccessRequest,
  submitAccessRequest,
  type AccessRequestServiceDependencies,
} from "@/lib/access/request-service";
import { InMemoryAccessRequestRepository } from "@/lib/access/request-store-memory";
import type { AccessDirectoryAuthLike } from "@/lib/access/directory";

const editor: AuthenticatedUser = {
  uid: "requester-1",
  email: "requester@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
};
const otherEditor: AuthenticatedUser = {
  ...editor,
  uid: "requester-2",
  email: "other@pmikcmetro.com",
};
const admin: AuthenticatedUser = {
  ...editor,
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  role: "Admin",
  scopes: ["maintenance"],
};

describe("S83 durable access request service", () => {
  let repository: InMemoryAccessRequestRepository;
  let dependencies: AccessRequestServiceDependencies;
  let sequence: number;

  beforeEach(() => {
    sequence = 0;
    repository = new InMemoryAccessRequestRepository();
    const auth: AccessDirectoryAuthLike = {
      getUser: async (uid) => ({
        uid,
        email:
          uid === editor.uid
            ? editor.email
            : uid === otherEditor.uid
              ? otherEditor.email
              : admin.email,
        displayName: uid === editor.uid ? "Requesting Editor" : "Staff Member",
        disabled: false,
        customClaims:
          uid === admin.uid
            ? { role: "Admin", scopes: ["maintenance"] }
            : { role: "Editor", scopes: ["maintenance"] },
      }),
      listUsers: async () => ({
        users: [editor, otherEditor, admin].map((user) => ({
          uid: user.uid,
          email: user.email,
          displayName: user.uid === editor.uid ? "Requesting Editor" : "Staff Member",
          disabled: false,
          customClaims:
            user.uid === admin.uid
              ? { role: "Admin", scopes: ["maintenance"] }
              : { role: "Editor", scopes: ["maintenance"] },
        })),
      }),
      setCustomUserClaims: async () => undefined,
    };
    dependencies = {
      repository,
      directoryAuth: auth,
      now: () => new Date(`2026-09-01T12:00:${String(sequence++).padStart(2, "0")}.000Z`),
      createAttemptId: () => "11111111-1111-4111-8111-111111111111",
      createRequestId: () => "request_0001",
    };
  });

  it("creates one request, indexes the attempt, and replays without duplication", async () => {
    const preview = await previewAccessRequest(
      editor,
      {
        schema_version: "access-request-preview-command-v1",
        intent: {
          schema_version: "access-intent-v1",
          intent_kind: "capability",
          catalog_version: "catalog-v1",
          catalog_key: "approve",
          scope: { kind: "named_spaces", space_ids: ["renewals"] },
        },
        reason: "Approve lease renewal work for my staff duties.",
      },
      dependencies,
    );
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("expected ready preview");
    expect(preview.preview.target_access).toEqual({
      role: "Approver",
      scope: { kind: "named_spaces", space_ids: ["maintenance", "renewals"] },
    });

    const command = {
      schema_version: "access-request-submit-command-v1" as const,
      attempt_id: preview.attempt_id,
      preview_hash: preview.preview_hash,
    };
    const created = await submitAccessRequest(editor, command, dependencies);
    expect(created).toMatchObject({
      status: "created",
      message: "Access request submitted.",
      request: { request_ref: "request_0001", state: "pending" },
    });
    const replayed = await submitAccessRequest(editor, command, dependencies);
    expect(replayed).toMatchObject({
      status: "replayed",
      message: "This access request was already submitted.",
      request: { request_ref: "request_0001" },
    });
    expect(repository.requests).toHaveLength(1);
  });

  it("refuses an indexed replay whose server identity no longer matches its request", async () => {
    const preview = await previewAccessRequest(
      editor,
      previewCommand("approve", "renewals"),
      dependencies,
    );
    if (preview.status !== "ready") throw new Error("expected ready preview");
    const command = {
      schema_version: "access-request-submit-command-v1" as const,
      attempt_id: preview.attempt_id,
      preview_hash: preview.preview_hash,
    };
    await submitAccessRequest(editor, command, dependencies);
    repository.attemptIndexes[0] = {
      ...repository.attemptIndexes[0],
      identity: `access-intent-v1:${"z".repeat(43)}`,
    };

    await expect(
      submitAccessRequest(editor, command, dependencies),
    ).resolves.toMatchObject({
      status: "idempotency_conflict",
      commit_state: "unknown",
    });
    expect(repository.requests).toHaveLength(1);
  });

  it("maps semantic intent and reason refusals to a bounded client error", async () => {
    await expect(
      previewAccessRequest(
        editor,
        { ...previewCommand("approve", "renewals"), reason: "short" },
        dependencies,
      ),
    ).rejects.toMatchObject({ status: 400, message: "Invalid access request body." });
    await expect(
      previewAccessRequest(editor, previewCommand("read"), dependencies),
    ).rejects.toMatchObject({
      status: 400,
      message: "The selected request does not add access.",
    });
    expect(repository.previews).toEqual([]);
    expect(repository.requests).toEqual([]);
  });

  it("returns an existing active request before issuing another attempt", async () => {
    const command = previewCommand("approve", "renewals");
    const first = await previewAccessRequest(editor, command, dependencies);
    if (first.status !== "ready") throw new Error("expected ready preview");
    await submitAccessRequest(
      editor,
      {
        schema_version: "access-request-submit-command-v1",
        attempt_id: first.attempt_id,
        preview_hash: first.preview_hash,
      },
      dependencies,
    );

    const second = await previewAccessRequest(editor, command, dependencies);
    expect(second).toMatchObject({
      status: "existing_request",
      request: { request_ref: "request_0001" },
    });
    expect(repository.previews).toHaveLength(0);
  });

  it("distinguishes proved no-commit storage failure from an ambiguous indexed read", async () => {
    const unknownRepository = new InMemoryAccessRequestRepository();
    vi.spyOn(unknownRepository, "getAttemptIndex").mockRejectedValueOnce(
      new Error("index unavailable"),
    );
    await expect(
      submitAccessRequest(
        editor,
        {
          schema_version: "access-request-submit-command-v1",
          attempt_id: "11111111-1111-4111-8111-111111111111",
          preview_hash: "a".repeat(64),
        },
        { ...dependencies, repository: unknownRepository },
      ),
    ).resolves.toEqual({
      schema_version: "access-request-submit-response-v1",
      status: "unavailable",
      message: "Request status could not be verified. Check request status.",
      commit_state: "unknown",
    });

    const preview = await previewAccessRequest(
      editor,
      previewCommand("approve", "renewals"),
      dependencies,
    );
    if (preview.status !== "ready") throw new Error("expected ready preview");
    vi.spyOn(repository, "getPreviewAttempt").mockRejectedValueOnce(
      new Error("preview store unavailable"),
    );
    await expect(
      submitAccessRequest(
        editor,
        {
          schema_version: "access-request-submit-command-v1",
          attempt_id: preview.attempt_id,
          preview_hash: preview.preview_hash,
        },
        dependencies,
      ),
    ).resolves.toEqual({
      schema_version: "access-request-submit-response-v1",
      status: "unavailable",
      message: "Access requests are temporarily unavailable.",
      commit_state: "not_committed",
    });
  });

  it("allows independent intents while another request is pending", async () => {
    const first = await previewAccessRequest(
      editor,
      previewCommand("approve", "renewals"),
      dependencies,
    );
    if (first.status !== "ready") throw new Error("expected ready preview");
    await submitAccessRequest(
      editor,
      {
        schema_version: "access-request-submit-command-v1",
        attempt_id: first.attempt_id,
        preview_hash: first.preview_hash,
      },
      dependencies,
    );

    dependencies = {
      ...dependencies,
      createAttemptId: () => "22222222-2222-4222-8222-222222222222",
      createRequestId: () => "request_0002",
    };
    const second = await previewAccessRequest(
      editor,
      previewCommand("manageAdmin"),
      dependencies,
    );
    expect(second.status).toBe("ready");
  });

  it("keeps own history private and allows only version-matched pending cancellation", async () => {
    const preview = await previewAccessRequest(
      editor,
      previewCommand("approve", "renewals"),
      dependencies,
    );
    if (preview.status !== "ready") throw new Error("expected ready preview");
    await submitAccessRequest(
      editor,
      {
        schema_version: "access-request-submit-command-v1",
        attempt_id: preview.attempt_id,
        preview_hash: preview.preview_hash,
      },
      dependencies,
    );

    expect((await listOwnAccessRequests(otherEditor, {}, dependencies)).items).toEqual(
      [],
    );
    const own = await listOwnAccessRequests(editor, {}, dependencies);
    expect(own.items).toHaveLength(1);
    await expect(
      cancelAccessRequest(
        otherEditor,
        "request_0001",
        { schema_version: "access-request-cancel-command-v1", request_version: 1 },
        dependencies,
      ),
    ).rejects.toThrow("not available");
    const cancelled = await cancelAccessRequest(
      editor,
      "request_0001",
      { schema_version: "access-request-cancel-command-v1", request_version: 1 },
      dependencies,
    );
    expect(cancelled.state).toBe("cancelled");
  });

  it("exposes the oldest pending pool only to Admins", async () => {
    await expect(listAdminAccessRequests(editor, {}, dependencies)).rejects.toThrow(
      "Admin access is required",
    );
    await expect(listAdminAccessRequests(admin, {}, dependencies)).resolves.toEqual({
      items: [],
      next_cursor: null,
      pending_count: 0,
    });
  });

  it("filters the Admin pool without URL identity and loads exact activity plus directory detail", async () => {
    const preview = await previewAccessRequest(
      editor,
      previewCommand("approve", "renewals"),
      dependencies,
    );
    if (preview.status !== "ready") throw new Error("expected ready preview");
    await submitAccessRequest(
      editor,
      {
        schema_version: "access-request-submit-command-v1",
        attempt_id: preview.attempt_id,
        preview_hash: preview.preview_hash,
      },
      dependencies,
    );

    const pool = await listAdminAccessRequests(
      admin,
      {
        requester_query: "  requesting   editor ",
        intent_kind: "capability",
        catalog_key: "approve",
        space_id: "renewals",
        state: "pending",
      },
      dependencies,
    );
    expect(pool.items).toHaveLength(1);
    expect(pool.items[0].requester_directory).toEqual({
      state: "eligible",
      current_label: "Requesting Editor",
    });

    const detail = await getAdminAccessRequestDetail(admin, "request_0001", dependencies);
    expect(detail.requester_directory).toMatchObject({
      state: "eligible",
      current_access: {
        role: "Editor",
        scope: { kind: "named_spaces", space_ids: ["maintenance"] },
      },
    });
    expect(detail.activity.map((activity) => activity.action)).toEqual(["submitted"]);
  });
});

function previewCommand(capability: string, space?: string) {
  return {
    schema_version: "access-request-preview-command-v1" as const,
    intent: {
      schema_version: "access-intent-v1" as const,
      intent_kind: "capability" as const,
      catalog_version: "catalog-v1" as const,
      catalog_key: capability,
      scope: space
        ? { kind: "named_spaces" as const, space_ids: [space] }
        : { kind: "global" as const, space_ids: [] },
    },
    reason: "Perform the staff duties assigned to my role.",
  };
}
