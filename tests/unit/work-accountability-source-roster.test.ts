import { describe, expect, it } from "vitest";

import type { AdminAuthLike } from "@/lib/admin/users";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { listWorkAssignableUsers } from "@/lib/work-accountability/roster";
import {
  ExistingWorkSourceResolver,
  type WorkSourceReaderDependencies,
} from "@/lib/work-accountability/source-resolver";

const wildcardActor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

describe("S68 bounded source adapters", () => {
  it("records only the canonical link, owning Space, and source version", async () => {
    const resolver = new ExistingWorkSourceResolver(
      undefined,
      readers({
        workflow: {
          id: "run-1",
          definition_id: "lease-renewal",
          space_id: "lease-renewals",
          updated_at: "2026-08-11T12:00:00.000Z",
        },
      }),
    );

    await expect(
      resolver.resolve(wildcardActor, {
        type: "workflow_run",
        id: "run-1",
        space_id: "lease-renewals",
      }),
    ).resolves.toEqual({
      space_id: "lease-renewals",
      source: {
        type: "workflow_run",
        id: "run-1",
        link: "/workflow-runs/run-1",
        version: "2026-08-11T12:00:00.000Z",
        status: "verified",
      },
    });
  });

  it("returns no link or version when the supplied Space does not own the source", async () => {
    const resolver = new ExistingWorkSourceResolver(
      undefined,
      readers({
        workflow: {
          id: "run-1",
          definition_id: "lease-renewal",
          space_id: "lease-renewals",
          updated_at: "2026-08-11T12:00:00.000Z",
        },
      }),
    );
    const result = await resolver.resolve(wildcardActor, {
      type: "workflow_run",
      id: "run-1",
      space_id: "maintenance-work-order-intake",
    });
    expect(result).toEqual({
      source: { type: "workflow_run", id: "run-1", status: "unverified" },
    });
  });

  it("fails before returning source evidence when the canonical Space is inaccessible", async () => {
    const scopedActor: AuthenticatedUser = {
      ...wildcardActor,
      scopes: ["renewals"],
    };
    const resolver = new ExistingWorkSourceResolver(
      undefined,
      readers({
        workflow: {
          id: "run-1",
          definition_id: "maintenance-work-order-intake",
          space_id: "maintenance-work-order-intake",
          updated_at: "2026-08-11T12:00:00.000Z",
        },
      }),
    );
    await expect(
      resolver.resolve(scopedActor, {
        type: "workflow_run",
        id: "run-1",
        space_id: "lease-renewals",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("turns missing records into explicit unverified identities", async () => {
    const resolver = new ExistingWorkSourceResolver(
      undefined,
      readers({ workflow: null }),
    );
    await expect(
      resolver.resolve(wildcardActor, {
        type: "workflow_run",
        id: "missing-run",
        space_id: "lease-renewals",
      }),
    ).resolves.toEqual({
      source: {
        type: "workflow_run",
        id: "missing-run",
        status: "unverified",
      },
    });
  });

  it("uses a bounded progress version for an existing renewal record", async () => {
    const resolver = new ExistingWorkSourceResolver(
      undefined,
      readers({
        renewal: {
          leaseId: "lease-1",
          stageIndex: 3,
          ownerDecision: null,
          tenantOfferDraftId: null,
          complete: false,
        },
      }),
    );
    const result = await resolver.resolve(wildcardActor, {
      type: "renewal_lease",
      id: "lease-1",
      space_id: "lease-renewals",
    });
    expect(result.source).toMatchObject({
      status: "verified",
      link: "/lease-renewal/live/desk/lease/lease-1",
      version: "rentvine:test-read:progress:3:open",
    });
  });
});

describe("S68 assignable staff roster", () => {
  it("keeps active managed internal identities and rejects disabled, vendor, external, and malformed claims", async () => {
    const auth = fakeAuth([
      { uid: "ok", email: "ok@pmikcmetro.com", customClaims: { role: "Approver" } },
      { uid: "disabled", email: "disabled@pmikcmetro.com", disabled: true },
      {
        uid: "vendor",
        email: "vendor@pmikcmetro.com",
        customClaims: { vendor: true, vendor_id: "v1" },
      },
      { uid: "personal", email: "person@gmail.com" },
      {
        uid: "bad-scope",
        email: "bad@pmikcmetro.com",
        customClaims: { scopes: ["unknown"] },
      },
    ]);
    const roster = await listWorkAssignableUsers({
      config: readServerConfig({}),
      auth,
    });
    expect(roster).toEqual([
      {
        uid: "ok",
        email: "ok@pmikcmetro.com",
        role: "Approver",
        scopes: undefined,
      },
    ]);
  });

  it("uses only the existing synthetic managed users in local Demo", async () => {
    const roster = await listWorkAssignableUsers({
      config: readServerConfig({ LOCAL_DEMO_AUTH: "true" }),
    });
    expect(roster).toHaveLength(3);
    expect(roster.every((person) => person.email.endsWith("@pmikcmetro.com"))).toBe(true);
  });
});

function readers(options: {
  workflow?: Record<string, unknown> | null;
  renewal?: {
    leaseId: string;
    stageIndex: number;
    ownerDecision: null;
    tenantOfferDraftId: null;
    complete: boolean;
  } | null;
}): WorkSourceReaderDependencies {
  return {
    getWorkflowRun: (async () => {
      if (!options.workflow) throw Object.assign(new Error("not found"), { status: 404 });
      return options.workflow;
    }) as unknown as WorkSourceReaderDependencies["getWorkflowRun"],
    getApprovalQueueItem: (async () => {
      throw Object.assign(new Error("not found"), { status: 404 });
    }) as WorkSourceReaderDependencies["getApprovalQueueItem"],
    getMaintenanceTicket: (async () =>
      null) as WorkSourceReaderDependencies["getMaintenanceTicket"],
    getRenewalProgress: (async () =>
      options.renewal ?? null) as WorkSourceReaderDependencies["getRenewalProgress"],
    getRenewalLeaseVersion: async () =>
      options.renewal === undefined ? null : "rentvine:test-read",
  };
}

function fakeAuth(
  users: Array<{
    uid: string;
    email?: string;
    disabled?: boolean;
    customClaims?: Record<string, unknown> | null;
  }>,
): AdminAuthLike {
  return {
    listUsers: async () => ({ users }),
    getUser: async (uid) => users.find((user) => user.uid === uid) ?? { uid },
    setCustomUserClaims: async () => undefined,
  };
}
