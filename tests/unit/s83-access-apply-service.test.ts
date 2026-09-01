import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  applyAccessDecision,
  denyAccessRequest,
  previewAccessDecision,
  reconcileAccessRequest,
  resolveAccessRequestAfterCorrection,
  type AccessApplyServiceDependencies,
} from "@/lib/access/apply-service";
import {
  previewAccessRequest,
  submitAccessRequest,
  type AccessRequestServiceDependencies,
} from "@/lib/access/request-service";
import { InMemoryAccessRequestRepository } from "@/lib/access/request-store-memory";
import type {
  AccessDirectoryAuthLike,
  AccessDirectoryUserRecordLike,
} from "@/lib/access/directory";

const requester: AuthenticatedUser = {
  uid: "requester-1",
  email: "requester@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
};
const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  scopes: ["maintenance"],
};

class FakeDirectory implements AccessDirectoryAuthLike {
  readonly setCustomUserClaims = vi.fn(
    async (uid: string, claims: Record<string, unknown>) => {
      const current = this.users.get(uid);
      if (!current) throw new Error("missing user");
      this.users.set(uid, { ...current, customClaims: structuredClone(claims) });
    },
  );

  constructor(readonly users: Map<string, AccessDirectoryUserRecordLike>) {}

  async getUser(uid: string) {
    const user = this.users.get(uid);
    if (!user) throw { code: "auth/user-not-found" };
    return structuredClone(user);
  }

  async listUsers() {
    return { users: [...this.users.values()].map((user) => structuredClone(user)) };
  }
}

describe("S83 exact Admin access application", () => {
  let repository: InMemoryAccessRequestRepository;
  let directory: FakeDirectory;
  let requestDependencies: AccessRequestServiceDependencies;
  let applyDependencies: AccessApplyServiceDependencies;
  let tick: number;

  beforeEach(async () => {
    tick = 0;
    repository = new InMemoryAccessRequestRepository();
    directory = new FakeDirectory(
      new Map([
        [
          requester.uid,
          {
            uid: requester.uid,
            email: requester.email,
            displayName: "Requesting Editor",
            customClaims: {
              role: "Editor",
              scopes: ["maintenance"],
              unrelated_flag: { retain: true },
            },
          },
        ],
        [
          admin.uid,
          {
            uid: admin.uid,
            email: admin.email,
            displayName: "Reviewing Admin",
            customClaims: { role: "Admin", scopes: ["maintenance"] },
          },
        ],
      ]),
    );
    const now = () =>
      new Date(`2026-09-01T13:00:${String(tick++).padStart(2, "0")}.000Z`);
    requestDependencies = {
      repository,
      directoryAuth: directory,
      now,
      createAttemptId: () => "11111111-1111-4111-8111-111111111111",
      createRequestId: () => "request_0001",
    };
    applyDependencies = {
      repository,
      directoryAuth: directory,
      now,
      createNonce: () => "22222222-2222-4222-8222-222222222222",
      createExecutionId: () => "execution_0001",
      createAuditRef: () => "audit_0001",
      writeAudit: vi.fn(async () => undefined),
    };
    await createPendingRequest(requestDependencies);
  });

  it("applies a combined role/Space plan in one merged attempt and exact readback", async () => {
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("expected ready apply preview");

    const result = await applyAccessDecision(
      admin,
      {
        schema_version: "access-request-apply-command-v1",
        preview: preview.preview,
        preview_hash: preview.preview_hash,
      },
      applyDependencies,
    );

    expect(result).toMatchObject({ status: "applied", request: { state: "applied" } });
    expect(directory.setCustomUserClaims).toHaveBeenCalledTimes(1);
    expect(directory.setCustomUserClaims).toHaveBeenCalledWith("requester-1", {
      role: "Approver",
      scopes: ["maintenance", "renewals"],
      unrelated_flag: { retain: true },
    });
    expect(applyDependencies.writeAudit).toHaveBeenCalledTimes(1);
    expect((await repository.getRequest("request_0001"))?.execution?.audit_ref).toBe(
      "audit_0001",
    );
  });

  it("audits an already-satisfied decision before closing it without a claim mutation", async () => {
    directory.users.set(requester.uid, {
      uid: requester.uid,
      email: requester.email,
      customClaims: {
        role: "Approver",
        scopes: ["maintenance", "renewals"],
        unrelated_flag: { retain: true },
      },
    });

    const result = await previewAccessDecision(admin, "request_0001", applyDependencies);

    expect(result).toMatchObject({
      status: "already_applied",
      request: { state: "applied" },
    });
    expect(applyDependencies.writeAudit).toHaveBeenCalledTimes(1);
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
    expect((await repository.getRequest("request_0001"))?.execution).toMatchObject({
      audit_ref: "audit_0001",
      outcome: "already_satisfied",
    });
  });

  it("supersedes a request when the managed requester was removed", async () => {
    directory.users.delete(requester.uid);

    const result = await previewAccessDecision(admin, "request_0001", applyDependencies);

    expect(result).toMatchObject({
      status: "superseded",
      request: { state: "superseded" },
    });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("does not attempt Firebase when the append-only audit fails", async () => {
    applyDependencies = {
      ...applyDependencies,
      writeAudit: vi.fn(async () => {
        throw new Error("audit unavailable");
      }),
    };
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    if (preview.status !== "ready") throw new Error("expected ready apply preview");
    const result = await applyAccessDecision(
      admin,
      {
        schema_version: "access-request-apply-command-v1",
        preview: preview.preview,
        preview_hash: preview.preview_hash,
      },
      applyDependencies,
    );
    expect(result).toMatchObject({
      status: "audit_failed",
      request: { state: "pending" },
    });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("makes a failed or uncertain mutation reconciliation-required and never retries it", async () => {
    directory.setCustomUserClaims.mockRejectedValueOnce(new Error("timeout"));
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    if (preview.status !== "ready") throw new Error("expected ready apply preview");
    const command = {
      schema_version: "access-request-apply-command-v1" as const,
      preview: preview.preview,
      preview_hash: preview.preview_hash,
    };
    const first = await applyAccessDecision(admin, command, applyDependencies);
    expect(first).toMatchObject({
      status: "reconciliation_required",
      request: { state: "reconciliation_required" },
    });
    const replay = await applyAccessDecision(admin, command, applyDependencies);
    expect(replay).toMatchObject({ status: "reconciliation_required" });
    expect(directory.setCustomUserClaims).toHaveBeenCalledTimes(1);
  });

  it("reconcile is read-only and closes only exact target plus unrelated-claim readback", async () => {
    directory.setCustomUserClaims.mockRejectedValueOnce(new Error("response lost"));
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    if (preview.status !== "ready") throw new Error("expected ready apply preview");
    await applyAccessDecision(
      admin,
      {
        schema_version: "access-request-apply-command-v1",
        preview: preview.preview,
        preview_hash: preview.preview_hash,
      },
      applyDependencies,
    );
    directory.users.set(requester.uid, {
      uid: requester.uid,
      email: requester.email,
      customClaims: {
        role: "Approver",
        scopes: ["maintenance", "renewals"],
        unrelated_flag: { retain: true },
      },
    });
    directory.setCustomUserClaims.mockClear();

    const reconciled = await reconcileAccessRequest(
      admin,
      "request_0001",
      applyDependencies,
    );
    expect(reconciled).toMatchObject({
      status: "applied",
      request: { state: "applied" },
    });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("closes a reviewed correction when current access satisfies the approved target", async () => {
    directory.setCustomUserClaims.mockRejectedValueOnce(new Error("response lost"));
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    if (preview.status !== "ready") throw new Error("expected ready apply preview");
    await applyAccessDecision(
      admin,
      {
        schema_version: "access-request-apply-command-v1",
        preview: preview.preview,
        preview_hash: preview.preview_hash,
      },
      applyDependencies,
    );
    directory.users.set(requester.uid, {
      uid: requester.uid,
      email: requester.email,
      customClaims: { role: "Admin", unrelated_flag: { retain: true } },
    });
    directory.setCustomUserClaims.mockClear();

    const resolved = await resolveAccessRequestAfterCorrection(
      admin,
      "request_0001",
      {
        schema_version: "access-request-resolution-command-v1",
        reason:
          "The separately audited direct correction now satisfies the approved access.",
      },
      applyDependencies,
    );

    expect(resolved).toMatchObject({ status: "applied", request: { state: "applied" } });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
    expect(
      (await repository.listRequestActivity("request_0001", 200)).at(-1),
    ).toMatchObject({
      actor_uid: admin.uid,
      action: "reconciled",
    });
  });

  it("supersedes a reviewed correction mismatch with the Admin's required reason", async () => {
    directory.setCustomUserClaims.mockRejectedValueOnce(new Error("timeout"));
    const preview = await previewAccessDecision(admin, "request_0001", applyDependencies);
    if (preview.status !== "ready") throw new Error("expected ready apply preview");
    await applyAccessDecision(
      admin,
      {
        schema_version: "access-request-apply-command-v1",
        preview: preview.preview,
        preview_hash: preview.preview_hash,
      },
      applyDependencies,
    );
    directory.setCustomUserClaims.mockClear();
    const reason =
      "A separately reviewed role plan replaced this requested access bundle.";

    const resolved = await resolveAccessRequestAfterCorrection(
      admin,
      "request_0001",
      {
        schema_version: "access-request-resolution-command-v1",
        reason,
      },
      applyDependencies,
    );

    expect(resolved).toMatchObject({
      status: "superseded",
      request: { state: "superseded" },
    });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
    expect(await repository.getRequest("request_0001")).toMatchObject({
      decision_reason: reason,
      state: "superseded",
    });
  });

  it("requires a different Admin and a normalized denial reason", async () => {
    directory.users.set(requester.uid, {
      uid: requester.uid,
      email: requester.email,
      customClaims: { role: "Admin", scopes: ["maintenance"] },
    });
    await expect(
      previewAccessDecision(
        { ...admin, uid: requester.uid, email: requester.email },
        "request_0001",
        applyDependencies,
      ),
    ).rejects.toThrow("cannot review your own");

    const denied = await denyAccessRequest(
      admin,
      "request_0001",
      { request_version: 1, reason: "Not required for the assigned staff duty." },
      applyDependencies,
    );
    expect(denied).toMatchObject({ state: "denied" });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("rejects unsafe decision text as a client error without changing request state", async () => {
    await expect(
      denyAccessRequest(
        admin,
        "request_0001",
        { request_version: 1, reason: "Review https://example.test" },
        applyDependencies,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await repository.getRequest("request_0001")).toMatchObject({
      state: "pending",
    });
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

async function createPendingRequest(dependencies: AccessRequestServiceDependencies) {
  const preview = await previewAccessRequest(
    requester,
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
  if (preview.status !== "ready") throw new Error("expected ready request preview");
  await submitAccessRequest(
    requester,
    {
      schema_version: "access-request-submit-command-v1",
      attempt_id: preview.attempt_id,
      preview_hash: preview.preview_hash,
    },
    dependencies,
  );
}
