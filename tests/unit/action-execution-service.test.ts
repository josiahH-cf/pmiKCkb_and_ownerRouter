import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  AmbiguousExecutionError,
  executePreparedAction,
  prepareActionExecution,
  type TrustedExecutionContext,
} from "@/lib/execution/service";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
const preview = {
  body: "Fixture-only exact reply.",
  from: "fixture-sender@pmikcmetro.com",
  recipients: "fixture-recipient@example.com",
  rfc_message_id: "fixture-message-id",
  subject: "Fixture subject",
  template_ref: "fixture-template-v1",
  thread_ref: "fixture-thread",
  workflow_context: "fixture-workflow",
};
const context: TrustedExecutionContext = {
  communication: {
    bulk: false,
    exactConfirmed: true,
    humanInitiated: true,
    mailboxScopeAuthorized: true,
    modelTriggered: false,
    recipientMatchesPreview: true,
    scheduled: false,
    workflowLinked: true,
  },
  connectionReady: true,
  endpointDocumented: true,
  permissionGranted: true,
  roleScopeAuthorized: true,
  sourceValidated: true,
};
let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("action execution service", () => {
  it("prepares and executes one enabled Medium action without an approval queue detour", async () => {
    const prepared = await prepareActionExecution(
      editor,
      {
        actionKey: "gmail.thread.reply",
        idempotencyKey: "fixture-reply-1",
        preview,
        trustedContext: context,
      },
      { db },
    );
    expect(prepared).toMatchObject({ risk: "Medium", state: "Ready" });

    const executor = vi.fn().mockResolvedValue({ providerCode: "fixture-sent" });
    const completed = await executePreparedAction({
      actor: editor,
      db,
      executionId: prepared.id,
      executor,
      preview,
      resultCode: (result) => (result as { providerCode: string }).providerCode,
      trustedContext: context,
    });
    expect(completed.execution).toMatchObject({
      attempt_count: 1,
      result_code: "fixture-sent",
      state: "Succeeded",
    });
    expect(executor).toHaveBeenCalledTimes(1);

    await expect(
      executePreparedAction({
        actor: editor,
        db,
        executionId: prepared.id,
        executor,
        preview,
        resultCode: (result) => (result as { providerCode: string }).providerCode,
        trustedContext: context,
      }),
    ).rejects.toThrow();
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("blocks a registry-closed action before creating a ledger or invoking an executor", async () => {
    await expect(
      prepareActionExecution(
        editor,
        {
          actionKey: "gmail.thread.reply",
          idempotencyKey: "fixture-closed",
          preview,
          trustedContext: context,
        },
        { db, registry: closeRegistryAction("gmail.thread.reply") },
      ),
    ).rejects.toMatchObject({
      blockers: expect.arrayContaining(["action_not_production_allowed"]),
    });
  });

  it("moves unknown post-claim errors to reconciliation and never retries", async () => {
    const prepared = await prepareActionExecution(
      editor,
      {
        actionKey: "gmail.thread.reply",
        idempotencyKey: "fixture-ambiguous",
        preview,
        trustedContext: context,
      },
      { db },
    );
    const executor = vi
      .fn()
      .mockRejectedValue(new AmbiguousExecutionError("fixture_timeout", "Timed out."));
    const result = await executePreparedAction({
      actor: editor,
      db,
      executionId: prepared.id,
      executor,
      preview,
      resultCode: () => "unused",
      trustedContext: context,
    });

    expect(result.execution).toMatchObject({
      attempt_count: 1,
      last_error_code: "fixture_timeout",
      state: "Needs reconciliation",
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("requires a resolved Admin approval route before preparing High work", async () => {
    const highRegistry = openRegistryAction("rentvine.work_order.create");
    const highPreview = {
      description: "Fixture-only repair",
      expected_status: "New",
      priority: "Normal",
      property_unit: "fixture-property",
      vendor_trade: "fixture-vendor",
    };

    await expect(
      prepareActionExecution(
        editor,
        {
          actionKey: "rentvine.work_order.create",
          idempotencyKey: "fixture-high",
          preview: highPreview,
          trustedContext: context,
        },
        { db, registry: highRegistry },
      ),
    ).rejects.toMatchObject({
      blockers: ["approval_route_missing"],
    });
  });
});

function closeRegistryAction(key: string): CreateActionRegistryInput[] {
  return ACTION_REGISTRY_SEED.map((entry) =>
    entry.key === key ? { ...entry, production_allowed: false } : entry,
  );
}

function openRegistryAction(key: string): CreateActionRegistryInput[] {
  return ACTION_REGISTRY_SEED.map((entry) =>
    entry.key === key
      ? {
          ...entry,
          documented_evidence: "Fixture-only documented adapter contract.",
          evidence_status: "Documented" as const,
          production_allowed: true,
          readiness: "Approved for Execution" as const,
        }
      : entry,
  );
}
