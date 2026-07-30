import { describe, expect, it, vi } from "vitest";

import {
  createLiveVendorLifecyclePostHandler,
  type LiveVendorLifecycleRouteDeps,
} from "@/app/api/admin/vendors/live/actions/route";
import { AuthError, type AuthenticatedUser } from "@/lib/auth/session";
import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import { INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS } from "@/lib/vendor/live-lifecycle-service";

const ACTOR: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};

const EXPLICIT_LIVE = {
  dataContext: "live",
  environmentKind: "production",
  source: "explicit",
} as const;

const INVITE_PREPARE = {
  actionKey: "vendor.account.invite",
  company: "Acme Plumbing",
  email: "dispatch@acme.example",
  operation: "prepare",
  reason: "Approved plumbing partner",
  ticketId: "ticket-101",
} as const;

describe("Live Vendor lifecycle Admin route", () => {
  it("authenticates before environment, body, gate, or runtime assembly", async () => {
    const harness = routeHarness();
    harness.authenticate.mockRejectedValue(new AuthError("Sign in required.", 401));

    const response = await harness.handler(jsonRequest(INVITE_PREPARE));

    expect(response.status).toBe(401);
    expect(harness.resolveDescriptor).not.toHaveBeenCalled();
    expect(harness.assertExecutable).not.toHaveBeenCalled();
    expect(harness.buildServiceDeps).not.toHaveBeenCalled();
  });

  it.each([
    {
      dataContext: "demo" as const,
      environmentKind: "demo" as const,
      source: "explicit" as const,
    },
    {
      dataContext: "live_readonly" as const,
      environmentKind: "demo" as const,
      source: "explicit" as const,
    },
    {
      dataContext: "live" as const,
      environmentKind: "production" as const,
      source: "legacy-node-env" as const,
    },
  ])(
    "refuses $environmentKind+$dataContext from $source before body/gate/runtime",
    async (descriptor) => {
      const harness = routeHarness({ descriptor });
      const request = jsonRequest(INVITE_PREPARE);
      const text = vi.spyOn(request, "text");

      const response = await harness.handler(request);

      expect(response.status).toBe(409);
      expect(text).not.toHaveBeenCalled();
      expect(harness.assertExecutable).not.toHaveBeenCalled();
      expect(harness.buildServiceDeps).not.toHaveBeenCalled();
    },
  );

  it("requires JSON and bounds the body before named gate/runtime work", async () => {
    const wrongType = routeHarness();
    const wrongTypeResponse = await wrongType.handler(
      new Request("http://localhost/api/admin/vendors/live/actions", {
        body: JSON.stringify(INVITE_PREPARE),
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
    );
    expect(wrongTypeResponse.status).toBe(415);
    expect(wrongType.assertExecutable).not.toHaveBeenCalled();
    expect(wrongType.buildServiceDeps).not.toHaveBeenCalled();

    const oversized = routeHarness();
    const oversizedResponse = await oversized.handler(
      jsonRequest({ ...INVITE_PREPARE, ignored: "x".repeat(33 * 1024) }),
    );
    expect(oversizedResponse.status).toBe(413);
    expect(oversized.assertExecutable).not.toHaveBeenCalled();
    expect(oversized.buildServiceDeps).not.toHaveBeenCalled();
  });

  it.each(INTENTIONALLY_CLOSED_VENDOR_GMAIL_ACTION_KEYS)(
    "returns an intentional 409 for %s without gate/runtime construction",
    async (actionKey) => {
      const harness = routeHarness();
      const response = await harness.handler(
        jsonRequest({ actionKey, operation: "prepare" }),
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload).toMatchObject({
        code: "vendor_gmail_lifecycle_intentionally_closed",
      });
      expect(harness.assertExecutable).not.toHaveBeenCalled();
      expect(harness.buildServiceDeps).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["authority", { actor: { role: "Admin", uid: ACTOR.uid } }],
    ["dependencyExecutionIds", { "vendor.account.invite": "forged" }],
    ["idempotencyKey", "forged"],
    ["receipt", { providerRef: "forged" }],
    ["dataMode", "live"],
  ])("strictly rejects browser-supplied %s", async (key, value) => {
    const harness = routeHarness();
    const response = await harness.handler(
      jsonRequest({ ...INVITE_PREPARE, [key]: value }),
    );

    expect(response.status).toBe(400);
    expect(harness.assertExecutable).not.toHaveBeenCalled();
    expect(harness.buildServiceDeps).not.toHaveBeenCalled();
  });

  it("rejects an unknown key and too-short reason before the action gate", async () => {
    const unknown = routeHarness();
    expect(
      (
        await unknown.handler(
          jsonRequest({ ...INVITE_PREPARE, actionKey: "vendor.account.unknown" }),
        )
      ).status,
    ).toBe(400);
    expect(unknown.assertExecutable).not.toHaveBeenCalled();

    const shortReason = routeHarness();
    expect(
      (await shortReason.handler(jsonRequest({ ...INVITE_PREPARE, reason: "no" })))
        .status,
    ).toBe(400);
    expect(shortReason.assertExecutable).not.toHaveBeenCalled();
  });

  it.each([
    ["a slash-bearing ticket id", { ticketId: "ticket/child" }],
    ["a control-bearing ticket id", { ticketId: "ticket-\u0000-child" }],
    ["a company beyond the delivery bound", { company: "x".repeat(161) }],
  ])("rejects %s before the action gate or runtime", async (_label, patch) => {
    const harness = routeHarness();

    const response = await harness.handler(jsonRequest({ ...INVITE_PREPARE, ...patch }));

    expect(response.status).toBe(400);
    expect(harness.assertExecutable).not.toHaveBeenCalled();
    expect(harness.buildServiceDeps).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
  });

  it("checks a prepare action gate before service-dependency construction", async () => {
    const harness = routeHarness();
    harness.assertExecutable.mockImplementation(() => {
      throw new ActionNotExecutableError("vendor.account.invite");
    });

    const response = await harness.handler(jsonRequest(INVITE_PREPARE));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "action_not_production_allowed",
    });
    expect(harness.assertExecutable).toHaveBeenCalledWith("vendor.account.invite");
    expect(harness.buildServiceDeps).not.toHaveBeenCalled();
    expect(harness.prepare).not.toHaveBeenCalled();
  });

  it("dispatches strict prepare and execute requests only after the named gate", async () => {
    const prepareHarness = routeHarness();
    const prepareResponse = await prepareHarness.handler(jsonRequest(INVITE_PREPARE));
    expect(prepareResponse.status).toBe(200);
    expect(prepareHarness.assertExecutable).toHaveBeenCalledWith("vendor.account.invite");
    expect(prepareHarness.buildServiceDeps).toHaveBeenCalledTimes(1);
    expect(prepareHarness.prepare).toHaveBeenCalledWith(
      ACTOR,
      INVITE_PREPARE,
      prepareHarness.serviceDeps,
      { descriptor: EXPLICIT_LIVE },
    );

    const executeHarness = routeHarness();
    const executeBody = {
      ...INVITE_PREPARE,
      confirmedPreviewHash: "b".repeat(64),
      executionId: `exec_${"a".repeat(40)}`,
      operation: "execute",
    } as const;
    const executeResponse = await executeHarness.handler(jsonRequest(executeBody));
    expect(executeResponse.status).toBe(200);
    expect(executeHarness.assertExecutable).toHaveBeenCalledWith("vendor.account.invite");
    expect(executeHarness.execute).toHaveBeenCalledWith(
      ACTOR,
      executeBody,
      executeHarness.serviceDeps,
      { descriptor: EXPLICIT_LIVE },
    );
  });

  it("dispatches reconciliation without consulting a newly closed mutation gate", async () => {
    const harness = routeHarness();
    harness.assertExecutable.mockImplementation(() => {
      throw new ActionNotExecutableError("vendor.account.invite");
    });
    const body = {
      ...INVITE_PREPARE,
      executionId: `exec_${"a".repeat(40)}`,
      operation: "reconcile",
    } as const;

    const response = await harness.handler(jsonRequest(body));

    expect(response.status).toBe(200);
    expect(harness.assertExecutable).not.toHaveBeenCalled();
    expect(harness.buildServiceDeps).toHaveBeenCalledTimes(1);
    expect(harness.reconcile).toHaveBeenCalledWith(ACTOR, body, harness.serviceDeps, {
      descriptor: EXPLICIT_LIVE,
    });
  });
});

function routeHarness(
  options: {
    descriptor?: EnvironmentDescriptor;
  } = {},
) {
  const authenticate = vi.fn(async () => ACTOR);
  const resolveDescriptor = vi.fn(() => options.descriptor ?? EXPLICIT_LIVE);
  const assertExecutable = vi.fn();
  const serviceDeps = {} as ReturnType<LiveVendorLifecycleRouteDeps["buildServiceDeps"]>;
  const buildServiceDeps = vi.fn(() => serviceDeps);
  const prepare = vi.fn(async () => ({
    approvalQueueHref: "/approval-queue?item_id=queue-1",
    preview: {
      actionKey: "vendor.account.invite" as const,
      exactEffect: "Invite one Vendor.",
      executionId: `exec_${"a".repeat(40)}`,
      fields: [],
      previewHash: "b".repeat(64),
      projection: {},
      target: "Acme Plumbing",
    },
    status: "awaiting_approval" as const,
  }));
  const execute = vi.fn(async () => ({
    executionId: `exec_${"a".repeat(40)}`,
    resultRecorded: true,
    status: "succeeded" as const,
  }));
  const reconcile = vi.fn(async () => ({
    duplicate: false,
    executionId: `exec_${"a".repeat(40)}`,
    status: "not_found" as const,
  }));
  const handler = createLiveVendorLifecyclePostHandler({
    assertExecutable,
    authenticate,
    buildServiceDeps,
    execute,
    prepare,
    reconcile,
    resolveDescriptor,
  });

  return {
    assertExecutable,
    authenticate,
    buildServiceDeps,
    execute,
    handler,
    prepare,
    reconcile,
    resolveDescriptor,
    serviceDeps,
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/vendors/live/actions", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
