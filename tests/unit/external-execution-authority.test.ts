import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import {
  externalPreviewHash,
  ExternalActionOrchestrator,
  validateExternalInput,
} from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import { buildSyntheticActionInput } from "@/lib/release/synthetic-execution";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

function input(
  definition: ExternalActionDefinition,
  role: "Admin" | "Editor" | "Vendor" = "Admin",
): ExternalActionInput {
  const lane = LEASE_EXECUTION_DEFINITION_MAP.has(definition.key)
    ? "lease"
    : "maintenance";
  const value = buildSyntheticActionInput(lane, definition.key, 0, definition);
  value.authority = {
    actor: { role, uid: `${role.toLowerCase()}-1` },
    roleScopeAuthorized: true,
    technical: syntheticExternalTechnicalGates(),
    communication: value.authority?.communication,
  };
  return value;
}

function approve(value: ExternalActionInput) {
  value.authority = {
    ...value.authority!,
    approval: {
      approvedByRole: "Admin",
      approvedByUid: "admin-1",
      previewHash: externalPreviewHash(value),
      reason: "Approve the exact synthetic preview.",
    },
  };
  return value;
}

function vendorScope(value: ExternalActionInput) {
  value.authority = {
    ...value.authority!,
    vendor: {
      assignedTicket: true,
      sameMailbox: true,
      selfConsent: true,
      verifiedEmailTotp: true,
    },
  };
  return value;
}

describe("external execution authority integration", () => {
  it("requires server authority, role scope, exact Medium confirmation, and S20 High approval", () => {
    const send = LEASE_EXECUTION_DEFINITION_MAP.get("gmail.renewal_notice.send")!;
    const missing = input(send, "Editor");
    delete missing.authority;
    expect(validateExternalInput(send, missing, true)).toContain("Server-verified");

    const wrongScope = input(send, "Editor");
    wrongScope.authority!.roleScopeAuthorized = false;
    expect(validateExternalInput(send, wrongScope, true)).toContain("scope");

    const confirmed = input(send, "Editor");
    confirmed.authority!.exactConfirmationHash = externalPreviewHash(confirmed);
    expect(validateExternalInput(send, confirmed, true)).toBeNull();
    confirmed.values = { value: "drifted" };
    expect(validateExternalInput(send, confirmed, true)).toContain(
      "exact_confirmation_missing",
    );

    const sheet = LEASE_EXECUTION_DEFINITION_MAP.get(
      "google_sheets.renewal_checklist.writeback",
    )!;
    expect(validateExternalInput(sheet, input(sheet), true)).toContain("Admin approval");
    const approved = approve(input(sheet));
    expect(validateExternalInput(sheet, approved, true)).toBeNull();
    approved.values = { value: "drifted" };
    expect(validateExternalInput(sheet, approved, true)).toContain("stale");
  });

  it("uses S22 Vendor self-consent, TOTP, same-mailbox, and assigned-ticket scope", () => {
    const connect = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.gmail.connect")!;
    const vendorConnect = vendorScope(input(connect, "Vendor"));
    expect(validateExternalInput(connect, vendorConnect, true)).toBeNull();
    vendorConnect.authority!.vendor!.selfConsent = false;
    expect(validateExternalInput(connect, vendorConnect, true)).toContain("self-consent");

    const read = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.gmail.thread.read")!;
    const vendorRead = vendorScope(input(read, "Vendor"));
    vendorRead.authority!.vendor!.assignedTicket = false;
    expect(validateExternalInput(read, vendorRead, true)).toContain("not assigned");
    vendorRead.authority!.vendor!.assignedTicket = true;
    vendorRead.authority!.vendor!.sameMailbox = false;
    expect(validateExternalInput(read, vendorRead, true)).toContain("does not match");

    const invite = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.account.invite")!;
    expect(validateExternalInput(invite, input(invite, "Vendor"), true)).toContain(
      "does not include",
    );
  });

  it("revalidates a revoked High approval immediately before provider claim", async () => {
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.account.invite")!;
    const value = approve(input(definition));
    const execute = vi.fn<ExternalExecutor["execute"]>();
    const store = new MemoryExternalExecutionStore();
    const orchestrator = new ExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      store,
      new Map([
        [
          definition.key,
          { execute, reconcile: vi.fn(async () => null) } satisfies ExternalExecutor,
        ],
      ]),
      { isExecutable: () => true, allowFakeContracts: true },
    );
    const prepared = await orchestrator.prepare(value);
    value.authority = { ...value.authority!, approval: undefined };
    await expect(orchestrator.execute(value, prepared.previewHash)).rejects.toThrow(
      "Admin approval",
    );
    expect(execute).not.toHaveBeenCalled();
    expect((await store.get(prepared.id))?.attemptCount).toBe(0);
  });

  it("allows one provider claim under concurrent duplicate execution", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const value = input(definition, "Editor");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async (request: ExternalActionInput) => {
      await gate;
      return {
        actionKey: request.actionKey,
        providerRef: "fake:concurrent",
        resultHash: "a".repeat(64),
        reconciled: false,
        createdAt: "2026-07-14T00:00:00.000Z",
      };
    });
    const store = new MemoryExternalExecutionStore();
    const orchestrator = new ExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      store,
      new Map([
        [
          definition.key,
          { execute, reconcile: vi.fn(async () => null) } satisfies ExternalExecutor,
        ],
      ]),
      { isExecutable: () => true, allowFakeContracts: true },
    );
    const prepared = await orchestrator.prepare(value);
    const first = orchestrator.execute(value, prepared.previewHash);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const second = orchestrator.execute(value, prepared.previewHash);
    await expect(second).rejects.toThrow("claim");
    release();
    await expect(first).resolves.toMatchObject({ duplicate: false });
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await store.get(prepared.id))?.attemptCount).toBe(1);
  });
});
