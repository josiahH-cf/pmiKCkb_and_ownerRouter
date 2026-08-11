import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { deterministicDraftRfcMessageId } from "@/lib/external-execution/draft-identity";
import {
  executeGovernedDraft,
  prepareGovernedDraft,
  reconcileGovernedDraft,
  type GovernedDraftSeams,
} from "@/lib/external-execution/governed-draft-execution";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
} from "@/lib/external-execution/s20-bridge";
import { getActionExecution } from "@/lib/firestore/action-executions";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  buildRenewalNoticeDraftAction,
  RENEWAL_NOTICE_DRAFT_ACTION_KEY,
} from "@/lib/lease-renewal/execution/renewal-draft-request";
import type { LiveEffectAttentionEvent } from "@/lib/operations/live-effect-attention-log";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

/**
 * S25/S26/S38 falsification for the governed unsent-draft pair on the S20 one-attempt contract.
 *
 * The real S20 bridge runs against an in-memory Firestore, so the ledger under test is the committed
 * one. Only Gmail is faked.
 */

const MAILBOX = { email: "workflow@pmikcmetro.com", sourceRef: "app:session:u1" };
const actor: AuthenticatedUser = {
  uid: "u1",
  email: MAILBOX.email,
  hd: "pmikcmetro.com",
  role: "Editor",
};

function draftAction(overrides: { body?: string } = {}) {
  return buildRenewalNoticeDraftAction({
    workflowId: "renewal-live:lease-42",
    actionId: "renewal-notice-draft:tenant:lease-42",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
    recipient: {
      channel: "tenant",
      to: "resident@northend-apts.com",
      sourceRef: "rentvine:lease:42:tenants[0].email",
    },
    mailbox: MAILBOX,
    subject: "Your lease renewal",
    body: overrides.body ?? "An owner-approved renewal offer.",
    workflowContext: "renewal:lease-42",
    sourceRefs: ["rentvine:lease:42"],
  });
}

interface HarnessOptions {
  createDraftImpl?: RenewalDraftGmailClient["createDraft"];
  findDraftImpl?: RenewalDraftGmailClient["findDraftByRfcMessageId"];
  assertEffectEnvironment?: () => void;
}

function harness(options: HarnessOptions = {}) {
  const db = new FakeFirestore();
  const firestore = db as unknown as Firestore;
  const attention: LiveEffectAttentionEvent[] = [];
  const createDraft = vi.fn(
    options.createDraftImpl ?? (async () => ({ draftId: "draft-1" })),
  );
  const findDraft = vi.fn(options.findDraftImpl ?? (async () => null));
  const createClient = vi.fn(
    (): RenewalDraftGmailClient => ({
      subject: MAILBOX.email,
      createDraft,
      findDraftByRfcMessageId: findDraft,
    }),
  );
  const seams: GovernedDraftSeams = {
    prepare: (user, request) =>
      prepareExternalActionWithS20(user, request, { db: firestore }),
    execute: (user, request) =>
      executeExternalActionWithS20(user, request, {
        db: firestore,
        emitAttention: (event) => {
          attention.push(event);
        },
      }),
    reconcile: (user, request) =>
      reconcileExternalActionWithS20(user, request, { db: firestore }),
    assertEffectEnvironment: options.assertEffectEnvironment ?? (() => undefined),
  };
  const request = (action = draftAction()) => ({
    action: action as never,
    definition: LEASE_EXECUTION_DEFINITION_MAP.get(RENEWAL_NOTICE_DRAFT_ACTION_KEY)!,
    createClient,
  });
  return {
    attention,
    createClient,
    createDraft,
    db,
    findDraft,
    firestore,
    request,
    seams,
  };
}

beforeEach(() => {
  runtimeSuspension.current = { status: "clear" };
});

describe("governed draft — one attempt through the S20 ledger", () => {
  it("prepares without contacting Gmail and stamps a deterministic RFC Message-ID", async () => {
    const h = harness();
    const action = draftAction();

    const prepared = await prepareGovernedDraft(actor, h.request(action), h.seams);

    expect(prepared.action_key).toBe(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
    expect(prepared.attempt_count).toBe(0);
    expect(prepared.risk).toBe("Medium");
    expect(h.createClient).not.toHaveBeenCalled();
    expect(action.values.rfc_message_id).toBe(
      deterministicDraftRfcMessageId(action, MAILBOX.email),
    );
    // Deterministic means a re-derivation of the same action yields the same identifier.
    expect(draftAction().values.rfc_message_id).toBe(action.values.rfc_message_id);
  });

  it("creates exactly one draft and settles the claimed attempt", async () => {
    const h = harness();
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);

    const outcome = await executeGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id, previewHash: prepared.preview_hash },
      h.seams,
    );

    expect(outcome.execution.state).toBe("Succeeded");
    expect(outcome.execution.attempt_count).toBe(1);
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(h.createDraft.mock.calls[0][0]).toMatchObject({
      to: "resident@northend-apts.com",
      messageId: deterministicDraftRfcMessageId(draftAction(), MAILBOX.email),
    });
    expect(h.attention).toEqual([]);
  });

  it("refuses a second attempt instead of creating a second draft", async () => {
    const h = harness();
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);
    const confirm = {
      ...h.request(),
      executionId: prepared.id,
      previewHash: prepared.preview_hash,
    };
    await executeGovernedDraft(actor, confirm, h.seams);

    await expect(executeGovernedDraft(actor, confirm, h.seams)).rejects.toThrow(
      /already has an attempt/,
    );

    expect(h.createDraft).toHaveBeenCalledTimes(1);
  });

  it("refuses a stale confirmation whose preview no longer matches", async () => {
    const h = harness();
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);
    // The operator's offer changed after review; the body — and so the preview hash — differs.
    const drifted = draftAction({ body: "A different, unreviewed offer." });

    await expect(
      executeGovernedDraft(
        actor,
        {
          ...h.request(drifted),
          executionId: prepared.id,
          previewHash: prepared.preview_hash,
        },
        h.seams,
      ),
    ).rejects.toThrow();

    expect(h.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that names a different execution", async () => {
    const h = harness();
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);

    await expect(
      executeGovernedDraft(
        actor,
        {
          ...h.request(),
          executionId: `exec_${"b".repeat(40)}`,
          previewHash: prepared.preview_hash,
        },
        h.seams,
      ),
    ).rejects.toThrow();
    expect(h.createDraft).not.toHaveBeenCalled();
  });
});

describe("governed draft — terminal states and A2", () => {
  it("records an ambiguous outcome and emits one value-free A2 event", async () => {
    const h = harness({
      createDraftImpl: async () => {
        throw new Error("gmail timeout");
      },
    });
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);

    const outcome = await executeGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id, previewHash: prepared.preview_hash },
      h.seams,
    );

    expect(outcome.execution.state).toBe("Needs reconciliation");
    expect(outcome.execution.attempt_count).toBe(1);
    expect(h.attention).toEqual([
      {
        marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
        action_key: RENEWAL_NOTICE_DRAFT_ACTION_KEY,
        execution_id: prepared.id,
        state: "ambiguous",
        data_mode: "live",
      },
    ]);
    const emitted = JSON.stringify(h.attention);
    for (const forbidden of ["resident@northend-apts.com", MAILBOX.email, DRAFT_BANNER]) {
      expect(emitted).not.toContain(forbidden);
    }
  });

  it("reconciles a consumed ambiguous attempt by identifier without drafting again", async () => {
    const h = harness({
      createDraftImpl: async () => {
        throw new Error("gmail timeout");
      },
      // The draft had in fact landed before the ambiguous response.
      findDraftImpl: async () => ({ draftId: "draft-recovered-1" }),
    });
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);
    await executeGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id, previewHash: prepared.preview_hash },
      h.seams,
    );
    const draftsBefore = h.createDraft.mock.calls.length;

    const resolved = await reconcileGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id },
      h.seams,
    );

    expect(resolved.status).toBe("succeeded");
    expect(h.findDraft).toHaveBeenCalledWith(
      deterministicDraftRfcMessageId(draftAction(), MAILBOX.email),
    );
    expect(h.createDraft).toHaveBeenCalledTimes(draftsBefore);
    expect(await getActionExecution(actor, prepared.id, h.firestore)).toMatchObject({
      state: "Succeeded",
      attempt_count: 1,
    });
  });

  it("leaves the attempt unresolved when the draft cannot be found", async () => {
    const h = harness({
      createDraftImpl: async () => {
        throw new Error("gmail timeout");
      },
      findDraftImpl: async () => null,
    });
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);
    await executeGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id, previewHash: prepared.preview_hash },
      h.seams,
    );

    const resolved = await reconcileGovernedDraft(
      actor,
      { ...h.request(), executionId: prepared.id },
      h.seams,
    );

    expect(resolved.status).toBe("not_found");
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(await getActionExecution(actor, prepared.id, h.firestore)).toMatchObject({
      state: "Needs reconciliation",
    });
  });
});

describe("governed draft — refusals before any provider construction", () => {
  const environments = [
    {
      name: "Demo",
      assert: () =>
        assertLiveProviderActionAllowed({
          environmentKind: "demo",
          dataContext: "demo",
          source: "explicit",
        } satisfies EnvironmentDescriptor),
    },
    {
      name: "Live read-only",
      assert: () =>
        assertLiveProviderActionAllowed({
          environmentKind: "demo",
          dataContext: "live_readonly",
          source: "explicit",
        } satisfies EnvironmentDescriptor),
    },
    {
      name: "an invalid descriptor",
      assert: () => {
        requireEnvironmentDescriptor({ ENVIRONMENT_KIND: "production" });
      },
    },
  ] as const;

  it("refuses Live-read-only before preparation can write the execution ledger", async () => {
    const prepare = vi.fn(harness().seams.prepare);
    const h = harness({
      assertEffectEnvironment: () =>
        assertLiveProviderActionAllowed({
          environmentKind: "demo",
          dataContext: "live_readonly",
          source: "explicit",
        }),
    });

    await expect(
      prepareGovernedDraft(actor, h.request(), { ...h.seams, prepare }),
    ).rejects.toThrow(/requires the Production environment with Live data/i);
    expect(prepare).not.toHaveBeenCalled();
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it.each(environments)("constructs no Gmail client in $name", async ({ assert }) => {
    const h = harness();
    const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);

    await expect(
      executeGovernedDraft(
        actor,
        { ...h.request(), executionId: prepared.id, previewHash: prepared.preview_hash },
        { ...h.seams, assertEffectEnvironment: assert },
      ),
    ).rejects.toThrow();
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.createDraft).not.toHaveBeenCalled();
  });

  // S51_DYNAMIC_REFUSAL:governed-draft-execute-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "constructs no Gmail client while runtime state is %s",
    async (status) => {
      const h = harness();
      const prepared = await prepareGovernedDraft(actor, h.request(), h.seams);
      h.createClient.mockClear();
      runtimeSuspension.current = { status };

      await expect(
        executeGovernedDraft(
          actor,
          {
            ...h.request(),
            executionId: prepared.id,
            previewHash: prepared.preview_hash,
          },
          h.seams,
        ),
      ).rejects.toThrow();
      expect(h.createClient).not.toHaveBeenCalled();
    },
  );

  // Repository scans are I/O-bound on the supported Windows/WSL workspace. The default five-second
  // timeout flakes only under full-suite contention; this local ceiling leaves the assertion intact.
  it("keeps the pre-ledger execute helpers out of every product path", async () => {
    // These helpers create a draft WITHOUT the S20 claim. They are retained (the live smoke still
    // uses the renewal one for a bounded self-addressed diagnostic) but must never be reachable from
    // a route or service again, or a caller could quietly re-open the no-ledger path this slice closed.
    const { readFileSync } = await import("node:fs");
    const { globSync } = await import("node:fs");
    const productPaths = globSync("{app/api,lib}/**/*.ts", {
      cwd: process.cwd(),
    }).filter(
      (file) =>
        !file.includes("renewal-draft-request.ts") &&
        !file.includes("owner-notice-draft-request.ts"),
    );

    const offenders = productPaths.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /\bexecuteRenewalNoticeDraft\s*\(/.test(source) ||
        /\bexecuteMaintenanceOwnerNoticeDraft\s*\(/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  }, 20_000);

  it("refuses a non-routable or non-authoritative recipient at preparation", async () => {
    const h = harness();
    const sampleRecipient = buildRenewalNoticeDraftAction({
      workflowId: "renewal-live:lease-99",
      actionId: "renewal-notice-draft:tenant:lease-99",
      channel: "tenant",
      templateRef: "tenant-renewal:v1.0",
      recipient: {
        channel: "tenant",
        to: "resident@example.invalid",
        sourceRef: "sample:tenant",
      },
      mailbox: MAILBOX,
      subject: "Your lease renewal",
      body: "An owner-approved renewal offer.",
      workflowContext: "renewal:lease-99",
      sourceRefs: ["rentvine:lease:99"],
    });

    await expect(
      prepareGovernedDraft(actor, h.request(sampleRecipient), h.seams),
    ).rejects.toThrow(/non-routable|authoritative/i);
    expect(h.createClient).not.toHaveBeenCalled();
  });
});
