// S182 ARCH-S182-1 / AC-S182-1 / AC-S182-2 / AC-S182-7 (fail-first): one operation matrix lets the
// actual staff actor approve exact lease output, confirm an exact packet effect and refresh its
// readback, through the real S20 ledger rather than an Admin or the last settings recorder. Admin
// configuration, verification-account refusals and every exact key still hold.

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { decideExecutionAuthority } from "@/lib/execution/authority";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  canConfirmAsStaff,
  STAFF_CONFIRMED_ACTION_KEYS,
} from "@/lib/execution/staff-confirmation";
import type { ExecutionClassification } from "@/lib/execution/types";
import { EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL } from "@/lib/external-execution/identity";
import {
  approveActionExecution,
  claimActionExecution,
  getActionExecution,
  prepareActionExecutionRecord,
  type ActionExecutionCompanion,
} from "@/lib/firestore/action-executions";
import {
  assertRenewalRoleAuthority,
  evaluateRenewalAuthority,
  hasRenewalRoleAuthority,
} from "@/lib/lease-renewal/role-action-governance";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const preparer: AuthenticatedUser = {
  email: "renewals-a@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-a",
};
const colleague: AuthenticatedUser = {
  email: "renewals-b@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-b",
};
const approver: AuthenticatedUser = {
  email: "approver@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
  uid: "approver-1",
};
const canaryEditor: AuthenticatedUser = {
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "canary-editor",
};
const previewHash = hashExecutionPreview({ document: "fixture-only" });
const contextHash = "d".repeat(64);
let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

function classification(actionKey: string): ExecutionClassification & {
  kind: "document_write" | "system_of_record_write";
  risk: "High";
} {
  return {
    actionKey,
    blockers: [],
    defaultRisk: "High",
    kind: actionKey.startsWith("dotloop.") ? "document_write" : "system_of_record_write",
    requiresActionRegistry: true,
    risk: "High",
  };
}

async function prepare(actionKey: string, idempotencyKey: string) {
  return prepareActionExecutionRecord(
    preparer,
    {
      classification: classification(actionKey),
      contextHash,
      idempotencyKey,
      previewHash,
    },
    db,
  );
}

describe("S182 operation matrix: ordinary staff rows", () => {
  it("lets Editors and Approvers approve output, confirm packet effects and refresh readback", () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      for (const key of [
        "approve_filled_artifact",
        "execute_document_packet",
        "record_packet_readback",
      ] as const) {
        expect(hasRenewalRoleAuthority(key, role)).toBe(true);
        expect(() => assertRenewalRoleAuthority(key, role)).not.toThrow();
      }
    }
  });

  it("keeps company configuration with Admin and every exact key in force", () => {
    expect(() =>
      assertRenewalRoleAuthority("manage_renewal_configuration", "Editor"),
    ).toThrow(/Admin authority/);
    expect(
      evaluateRenewalAuthority("execute_document_packet", {
        role: "Editor",
        managedIdentity: true,
        hasRenewalsSpace: true,
        externalState: "closed",
      }),
    ).toMatchObject({ code: "action_closed", roleEligible: true, mayBegin: false });
    expect(
      evaluateRenewalAuthority("execute_document_packet", {
        role: "Editor",
        managedIdentity: true,
        hasRenewalsSpace: true,
        externalState: "ready",
      }),
    ).toMatchObject({ code: "confirmation_required" });
    expect(
      evaluateRenewalAuthority("execute_document_packet", {
        role: "Editor",
        managedIdentity: true,
        hasRenewalsSpace: false,
        externalState: "ready",
        exactConfirmation: true,
      }),
    ).toMatchObject({ code: "missing_space" });
  });
});

describe("S182 staff confirmation through the actual S20 ledger", () => {
  it("lets a colleague view, confirm and claim a packet action someone else prepared", async () => {
    const record = await prepare("dotloop.document.upload", "fixture-upload-1");
    expect(record.state).toBe("Awaiting Admin");
    await expect(getActionExecution(colleague, record.id, db)).resolves.toMatchObject({
      id: record.id,
    });
    await expect(
      claimActionExecution(colleague, record.id, previewHash, db, contextHash),
    ).rejects.toThrow(/approval does not bind/);
    const confirmed = await approveActionExecution(
      colleague,
      record.id,
      { previewHash, contextHash, reason: "Reviewed the exact lease file and loop." },
      db,
    );
    expect(confirmed).toMatchObject({
      state: "Approved",
      approval: {
        approvedByRole: "Editor",
        approvedByUid: colleague.uid,
        basis: "staff_confirmation",
        previewHash,
        contextHash,
      },
    });
    await expect(
      claimActionExecution(colleague, record.id, previewHash, db, contextHash),
    ).resolves.toMatchObject({ attempt_count: 1, state: "Executing" });
    // One attempt only: a second claim is refused, whoever asks.
    await expect(
      claimActionExecution(preparer, record.id, previewHash, db, contextHash),
    ).rejects.toThrow();
  });

  it("lets the preparer confirm their own exact preview without an Admin", async () => {
    const record = await prepare("dotloop.loop.create_from_template", "fixture-loop-1");
    await expect(
      approveActionExecution(
        preparer,
        record.id,
        { previewHash, contextHash, reason: "Reviewed the new loop preview." },
        db,
      ),
    ).resolves.toMatchObject({ state: "Approved" });
  });

  it("still binds the exact preview and context", async () => {
    const record = await prepare("dotloop.document.upload", "fixture-upload-2");
    await expect(
      approveActionExecution(
        approver,
        record.id,
        { previewHash: "c".repeat(64), contextHash, reason: "Stale preview." },
        db,
      ),
    ).rejects.toThrow(/stale/);
    await expect(
      approveActionExecution(
        approver,
        record.id,
        { previewHash, contextHash: "e".repeat(64), reason: "Other target." },
        db,
      ),
    ).rejects.toThrow(/target or source context is stale/);
  });

  it("refuses verification identities and every non-packet High action", async () => {
    const packet = await prepare("dotloop.document.upload", "fixture-upload-3");
    await expect(
      approveActionExecution(
        canaryEditor,
        packet.id,
        { previewHash, contextHash, reason: "Verification account." },
        db,
      ),
    ).rejects.toThrow(/Only an Admin/);
    await expect(getActionExecution(canaryEditor, packet.id, db)).rejects.toThrow(
      /not available/,
    );
    const other = await prepare("rentvine.work_order.create", "fixture-other-1");
    await expect(
      approveActionExecution(
        colleague,
        other.id,
        { previewHash, contextHash, reason: "Not a packet action." },
        db,
      ),
    ).rejects.toThrow(/Only an Admin/);
    await expect(getActionExecution(colleague, other.id, db)).rejects.toThrow(
      /not available/,
    );
  });

  it("never lets a staff-confirmation basis authorize another action key", () => {
    expect(STAFF_CONFIRMED_ACTION_KEYS).toEqual([
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ]);
    expect(canConfirmAsStaff("Vendor", "dotloop.document.upload")).toBe(false);
    const decision = decideExecutionAuthority({
      actor: { role: "Editor", uid: "editor-b" },
      approval: {
        approvedByRole: "Editor",
        approvedByUid: "editor-b",
        basis: "staff_confirmation",
        previewHash,
        reason: "Forged basis on another key.",
      },
      classification: classification("rentvine.work_order.create"),
      previewHash,
    });
    expect(decision).toMatchObject({ canExecute: false, disposition: "denied" });
  });
});

// S182 AC-S182-2 (fail-first): the execution record and its feature companion are written in one
// transaction, so no half-prepared action can exist, and a colleague who prepares the identical
// action continues it: after a first preparer's request stopped between the two former writes,
// or while that preparation is in flight. Continuation is bound to the exact action key, preview
// and context hashes, the exact companion and the actor's own capability.

const COMPANIONS = "fixture_action_companions";

function companion(preparation: string): ActionExecutionCompanion {
  return {
    collection: COMPANIONS,
    document: ({ previewHash: boundPreview, contextHash: boundContext }) => {
      const stored = {
        preparation,
        previewHash: boundPreview,
        contextHash: boundContext ?? null,
      };
      return { ...stored, snapshotHash: hashExecutionPreview(stored) };
    },
  };
}

function companionOf(id: string) {
  return (db as unknown as FakeFirestore).store.get(`${COMPANIONS}/${id}`);
}

// External actions name one execution per action, whoever prepares it (the shared principal).
async function prepareShared(
  actor: AuthenticatedUser,
  actionKey: string,
  idempotencyKey: string,
  options: { preparation?: string; previewHash?: string; companion?: false } = {},
) {
  return prepareActionExecutionRecord(
    actor,
    {
      classification: classification(actionKey),
      contextHash,
      idempotencyKey,
      idempotencyPrincipal: EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL,
      previewHash: options.previewHash ?? previewHash,
      ...(options.companion === false
        ? {}
        : { companion: companion(options.preparation ?? "fixture-preparation") }),
    },
    db,
  );
}

const prepareWithCompanion = (
  actor: AuthenticatedUser,
  actionKey: string,
  idempotencyKey: string,
  options: { preparation?: string; previewHash?: string } = {},
) => prepareShared(actor, actionKey, idempotencyKey, options);

describe("S182 a colleague continues a packet action whatever happened to its preparation", () => {
  it("writes the execution record and its companion in one transaction", async () => {
    const transactions = vi.spyOn(db, "runTransaction");
    const record = await prepareWithCompanion(
      preparer,
      "dotloop.document.upload",
      "fixture-upload-10",
    );
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(companionOf(record.id)).toMatchObject({
      preparation: "fixture-preparation",
      previewHash: record.preview_hash,
      contextHash: record.context_hash,
    });
  });

  it("lets a colleague continue a preparation whose request stopped before its companion", async () => {
    // What a request that stopped between the two former writes left behind: the record alone.
    const record = await prepareShared(
      preparer,
      "dotloop.document.upload",
      "fixture-upload-11",
      {
        companion: false,
      },
    );
    expect(companionOf(record.id)).toBeUndefined();
    const continued = await prepareWithCompanion(
      colleague,
      "dotloop.document.upload",
      "fixture-upload-11",
    );
    expect(continued).toMatchObject({
      id: record.id,
      actor_uid: preparer.uid,
      state: "Awaiting Admin",
    });
    expect(companionOf(record.id)).toMatchObject({ previewHash, contextHash });
    // The colleague then confirms the exact preview and claims its one attempt.
    await approveActionExecution(
      colleague,
      record.id,
      { previewHash, contextHash, reason: "Reviewed the exact lease file and loop." },
      db,
    );
    await expect(
      claimActionExecution(colleague, record.id, previewHash, db, contextHash),
    ).resolves.toMatchObject({ attempt_count: 1, state: "Executing" });
  });

  it("lets a colleague who previews while the first preparation is in flight continue it", async () => {
    const first = await prepareWithCompanion(
      preparer,
      "dotloop.loop.create_from_template",
      "fixture-loop-12",
    );
    const again = await prepareWithCompanion(
      preparer,
      "dotloop.loop.create_from_template",
      "fixture-loop-12",
    );
    const second = await prepareWithCompanion(
      colleague,
      "dotloop.loop.create_from_template",
      "fixture-loop-12",
    );
    for (const record of [again, second])
      expect(record).toMatchObject({ id: first.id, actor_uid: preparer.uid });
    const store = (db as unknown as FakeFirestore).store;
    expect(
      [...store.keys()].filter((path) => path.startsWith("action_executions/")),
    ).toHaveLength(1);
    expect([...store.keys()].filter((path) => path.startsWith(`${COMPANIONS}/`))).toEqual(
      [`${COMPANIONS}/${first.id}`],
    );
  });

  it("binds continuation to the identical action, preparation and the actor's capability", async () => {
    const record = await prepareWithCompanion(
      preparer,
      "dotloop.document.upload",
      "fixture-upload-13",
    );
    await expect(
      prepareWithCompanion(colleague, "dotloop.document.upload", "fixture-upload-13", {
        previewHash: hashExecutionPreview({ document: "another-file" }),
      }),
    ).rejects.toThrow(/different execution preview/);
    await expect(
      prepareWithCompanion(colleague, "dotloop.document.upload", "fixture-upload-13", {
        preparation: "changed-sources",
      }),
    ).rejects.toThrow(/different immutable preparation/);
    await expect(
      prepareWithCompanion(canaryEditor, "dotloop.document.upload", "fixture-upload-13"),
    ).rejects.toThrow(/not available/);
    expect(companionOf(record.id)).toMatchObject({ preparation: "fixture-preparation" });

    // Another person's non-packet High action is never continued by a colleague.
    await prepareWithCompanion(
      preparer,
      "rentvine.work_order.create",
      "fixture-other-13",
    );
    await expect(
      prepareWithCompanion(colleague, "rentvine.work_order.create", "fixture-other-13"),
    ).rejects.toThrow(/not available/);
  });

  it("refuses a companion that has no execution record and writes neither", async () => {
    const orphan = await prepareWithCompanion(
      preparer,
      "dotloop.document.upload",
      "fixture-upload-14",
    );
    const store = (db as unknown as FakeFirestore).store;
    store.delete(`action_executions/${orphan.id}`);
    await expect(
      prepareWithCompanion(colleague, "dotloop.document.upload", "fixture-upload-14"),
    ).rejects.toThrow(/no execution record/);
    expect(store.has(`action_executions/${orphan.id}`)).toBe(false);
  });
});
