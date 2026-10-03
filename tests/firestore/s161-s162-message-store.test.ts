import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S161/S162/S163 against the actual Firestore emulator and the message-preparation route: the
// first save of a lease's message establishes its work record (no cycle step), authored subject
// and body persist exactly through changed working information, and the explicit draft action
// saves what is displayed, refuses a mismatch before any Gmail call, gives a changed envelope its
// own attempt and creates exactly one unsent draft with its markers. Live lease views, the Gmail
// client and the session are deterministic doubles; nothing reaches a provider.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "s161-editor",
    email: "s161-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
}));
const gmail = vi.hoisted(() => ({ creates: 0, raw: "" }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => testState.actor,
}));
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: [
        {
          lease: {
            leaseID: 701,
            leaseStatusID: "2",
            endDate: "2026-12-31",
            baseRentAmount: 1000,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "1701",
                name: "Emulator Tenant",
                firstName: "Emulator",
                email: "tenant@fixture-rental.net",
              },
              {
                contactID: "1702",
                name: "Second Household Member",
                email: "second@fixture-rental.net",
              },
            ],
          },
          unit: { unitID: "2701" },
          property: { streetName: "701 Emulator Avenue" },
          portfolio: {
            owners: [{ name: "Emulator Owner", email: "owner@fixture-rental.net" }],
          },
        },
      ],
      pages: 1,
      complete: true,
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Emulator Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({ ok: false, reason: "test_source_not_configured" }),
  };
});
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: (subject: string) => ({
    subject,
    createDraft: async (
      input: Parameters<
        typeof import("@/lib/gmail-runtime/raw-message").encodeRawDraft
      >[0],
    ) => {
      gmail.creates++;
      const { encodeRawDraft } = await import("@/lib/gmail-runtime/raw-message");
      gmail.raw = encodeRawDraft({ ...input, from: subject });
      return { draftId: "fixture-unsent-draft" };
    },
    getDraftById: async () => ({ draftId: "fixture-unsent-draft", raw: gmail.raw }),
    findDraftByRfcMessageId: async () =>
      gmail.raw ? { draftId: "fixture-unsent-draft", raw: gmail.raw } : null,
  }),
}));

import {
  GET as getMessageRoute,
  POST as postMessageRoute,
} from "@/app/api/lease-renewal/message-preparation/route";
import { MESSAGE_SUBJECT_OVERRIDE_COLLECTION } from "@/lib/firestore/renewal-message-body-overrides";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { decodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import { DRAFT_BANNER } from "@/lib/constants";
import { missingValueMarker } from "@/lib/lease-renewal/renewal-message-content";

const projectId = "pmi-kc-kb-s161-message-store-test";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
const editor = testState.actor;
const canary: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function request(body: unknown) {
  return new Request("http://local.test/api/lease-renewal/message-preparation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function read() {
  const response = await getMessageRoute(
    new Request(
      "http://local.test/api/lease-renewal/message-preparation?leaseId=701&channel=tenant",
    ),
  );
  expect(response.status).toBe(200);
  return response.json();
}
async function post(body: Record<string, unknown>) {
  const response = await postMessageRoute(request(body));
  return { status: response.status, data: await response.json() };
}
/** Admit a fresh source generation, as Refresh data does, so notice safety reads as current. */
function refreshSource() {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s161-message-store-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  refreshSource();
  gmail.creates = 0;
  gmail.raw = "";
  testState.actor = editor;
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S161 message persistence without a cycle step", () => {
  it("BEH-S161-3, BEH-S161-7, BEH-S163-1, AC-S161-1, AC-S161-2: the first save establishes the work record and authored wording survives changed working information exactly", async () => {
    const fresh = await read();
    expect(fresh.cycleId).toBeNull();
    expect(fresh.saved).toBeNull();
    expect(await getRenewalWorkspace(editor, "701", db)).toBeNull();
    // S163: the recorded first name greets; the person without one is named in the callout.
    expect(fresh.content.plainText.startsWith("Hello Emulator,")).toBe(true);
    expect(fresh.content.missing).toContainEqual({
      field: "names",
      message:
        "No first name is recorded for Second Household Member, so the greeting leaves that name out.",
    });
    expect(fresh.content.plainText).toContain(missingValueMarker("renewal rent"));
    expect(fresh.recipients).toEqual({
      status: "ready",
      to: "tenant@fixture-rental.net",
      cc: ["second@fixture-rental.net"],
    });

    const body = fresh.content.plainText.replace(
      "Hello Emulator,",
      "Hi Emulator and all,",
    );
    const operationId = randomUUID();
    const save = {
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      expectedRevision: 0,
      operationId,
      inputs: fresh.inputs,
      bodyOverride: { text: body, baseHash: fresh.bodyBaseHash },
      subjectOverride: "Your renewal at 701 Emulator Avenue",
    };
    const saved = await post(save);
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.duplicate).toBe(false);
    expect(saved.data.cycleId).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.data.saved.revision).toBe(1);
    expect(saved.data.saved.reviewedSourceFingerprint).toBeNull();
    expect(saved.data.content.plainText).toBe(body);
    expect(saved.data.content.subject).toBe("Your renewal at 701 Emulator Avenue");
    expect(saved.data.subjectOverride).toBe("Your renewal at 701 Emulator Avenue");
    expect(saved.data.bodyOverride).toMatchObject({ state: "applied", text: body });
    const record = await getRenewalWorkspace(editor, "701", db);
    expect(record?.cycleId).toBe(saved.data.cycleId);
    expect(record?.basis).toMatchObject({ kind: "lease_end", dateIso: "2026-12-31" });
    expect((await db.collection(MESSAGE_SUBJECT_OVERRIDE_COLLECTION).get()).size).toBe(1);

    // The same operation is one save; a stale revision or a different record is a conflict.
    expect((await post(save)).data.duplicate).toBe(true);
    expect((await post({ ...save, operationId: randomUUID() })).status).toBe(409);
    expect(
      (
        await post({
          ...save,
          operationId: randomUUID(),
          expectedRevision: 1,
          cycleId: randomUUID(),
        })
      ).status,
    ).toBe(409);

    // S161 (BEH-S161-6/7): a working rent entered later feeds a new composition, while the
    // authored subject and body stay exactly as written and are reported as kept.
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "terms_rent",
        value: 1525,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      db,
    );
    const after = await read();
    expect(after.saved.revision).toBe(1);
    expect(after.content.plainText).toBe(body);
    expect(after.content.subject).toBe("Your renewal at 701 Emulator Avenue");
    expect(after.bodyOverride).toMatchObject({ state: "stale", text: body });
    expect(after.facts.ownerTerms).toMatchObject({
      rent: 1525,
      effectiveDate: null,
      source: "Working renewal terms",
    });
    expect(
      after.content.missing.map((entry: { field: string }) => entry.field),
    ).not.toContain("refinedBody");

    // Returning to the standard wording is a deliberate save and then uses the working rent.
    const standard = await post({
      ...save,
      operationId: randomUUID(),
      expectedRevision: 1,
      cycleId: saved.data.cycleId,
      bodyOverride: null,
      subjectOverride: null,
    });
    expect(standard.status).toBe(200);
    expect(standard.data.content.plainText).toContain("Rent: $1,525.00 per month");
    expect(standard.data.content.subject).toBe("Lease Renewal for 701 Emulator Avenue");
    expect((await db.collection(MESSAGE_SUBJECT_OVERRIDE_COLLECTION).get()).size).toBe(0);
  });

  it("BEH-S157-10, BEH-S161-6, AC-S157-2: the owner message's current rent has the one shared meaning, and a working value feeds only new preparation", async () => {
    const owner = async () => {
      const response = await getMessageRoute(
        new Request(
          "http://local.test/api/lease-renewal/message-preparation?leaseId=701&channel=owner",
        ),
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    // No working value and no charge read here: the contractual amount under its own label.
    const contractual = await owner();
    expect(contractual.facts.currentBaseRent).toEqual({
      value: 1000,
      source: "RentVine contractual lease amount",
    });
    expect(contractual.content.plainText).toContain(
      "We are currently charging them $1,000.00 per month.",
    );
    // Staff keep their own wording, then enter a working current rent.
    const authored = contractual.content.plainText.replace(
      "$1,000.00",
      "$1,000.00 (current)",
    );
    const saved = await post({
      kind: "save",
      leaseId: "701",
      channel: "owner",
      expectedRevision: 0,
      operationId: randomUUID(),
      inputs: contractual.inputs,
      bodyOverride: { text: authored, baseHash: contractual.bodyBaseHash },
    });
    expect(saved.status).toBe(200);
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1050,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      db,
    );
    const working = await owner();
    expect(working.facts.currentBaseRent).toEqual({
      value: 1050,
      source: "Staff working value",
    });
    // New preparation uses the working value; the authored text is not regenerated.
    expect(working.content.plainText).toBe(authored);
    expect(working.content.plainText).not.toContain("$1,050.00");
    expect(working.bodyOverride).toMatchObject({ state: "stale", text: authored });
  });

  it("keeps the verification-account refusal on the save", async () => {
    const fresh = await read();
    testState.actor = canary;
    const refused = await post({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      expectedRevision: 0,
      operationId: randomUUID(),
      inputs: fresh.inputs,
    });
    expect(refused.status).toBe(403);
    expect(await getRenewalWorkspace(editor, "701", db)).toBeNull();
  });
});

describe("S162 the explicit draft action from the displayed message", () => {
  it("BEH-S162-4/5/6/7/8/10, ARCH-S162-2/3, AC-S162-2/3: saves what is displayed, refuses a mismatch before Gmail, gives a changed envelope its own attempt and creates one unsent draft with its markers", async () => {
    // Publication is the existing Admin step; it stays the one prerequisite of the Gmail action.
    await publishSuppliedRenewalTemplate(
      { ...editor, uid: "s161-admin", email: "s161-admin@pmikcmetro.com", role: "Admin" },
      "tenant",
      db,
    );
    const fresh = await read();
    expect(fresh.publication.status).toBe("approved");
    const body = fresh.content.plainText.replace(
      "Hello Emulator,",
      "Hi Emulator and all,",
    );

    // R-S162-7: the needed save fails honestly inside the action; nothing is previewed.
    const failedSave = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: fresh.content.subject, body },
      save: {
        expectedRevision: 4,
        operationId: randomUUID(),
        inputs: fresh.inputs,
        bodyOverride: { text: body, baseHash: fresh.bodyBaseHash },
      },
    });
    expect(failedSave.status).toBe(409);
    expect(failedSave.data).toMatchObject({
      code: "message_save_failed",
      providerCallAttempted: false,
    });
    expect(failedSave.data.error).toContain("no draft was prepared");
    expect(await getRenewalWorkspace(editor, "701", db)).toBeNull();

    // The one action saves the displayed message (establishing the work record) and previews
    // exactly that content. The first save moves the notice-safety scope to the new record, so
    // the draft waits for one fresh admitted source read, as Refresh data provides.
    const first = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: fresh.content.subject, body },
      save: {
        expectedRevision: 0,
        operationId: randomUUID(),
        inputs: fresh.inputs,
        bodyOverride: { text: body, baseHash: fresh.bodyBaseHash },
      },
    });
    expect(first.status).toBe(200);
    const afterSave = await read();
    expect(afterSave.saved.revision).toBe(1);
    expect(afterSave.content.plainText).toBe(body);
    if (first.data.status !== "preview") {
      expect(first.data.status).toBe("blocked");
      expect(first.data.reasons.join(" ")).toMatch(/notice|Refresh/i);
      refreshSource();
    }
    const preview = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: afterSave.content.subject, body },
    });
    expect(preview.status, JSON.stringify(preview.data)).toBe(200);
    expect(preview.data.status, JSON.stringify(preview.data)).toBe("preview");
    expect(preview.data.subject).toBe(afterSave.content.subject);
    expect(preview.data.body).toBe(`${DRAFT_BANNER}\n\n${body}`);
    expect(preview.data.body).toContain("Hi Emulator and all,");
    expect(preview.data.body).toContain(missingValueMarker("renewal rent"));
    expect(preview.data.recipient).toMatchObject({
      to: "tenant@fixture-rental.net",
      cc: ["second@fixture-rental.net"],
    });
    expect(gmail.creates).toBe(0);

    // R-S162-6: what is on screen must be what is saved; otherwise nothing is prepared.
    const mismatch = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: afterSave.content.subject, body: `${body}\n\nUnsaved line.` },
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.data).toMatchObject({
      code: "message_changed",
      providerCallAttempted: false,
    });

    // The same revision now reads with a changed envelope (the working rent changed the facts
    // behind the message). The preview gets its own attempt instead of an idempotency refusal.
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "terms_rent",
        value: 1600,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      db,
    );
    const changed = await read();
    expect(changed.saved.revision).toBe(1);
    expect(changed.content.plainText).toBe(body);
    const again = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: changed.content.subject, body },
    });
    expect(again.status, JSON.stringify(again.data)).toBe(200);
    expect(again.data.status).toBe("preview");
    expect(again.data.executionId).not.toBe(preview.data.executionId);
    expect((await read()).saved.revision).toBe(2);
    const earlier = await db
      .collection("action_executions")
      .doc(preview.data.executionId)
      .get();
    expect(earlier.get("attempt_count")).toBe(0);
    expect(gmail.creates).toBe(0);

    // The stale confirmation is refused exactly; the current one creates one unsent draft.
    const stale = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: {
        executionId: preview.data.executionId,
        previewHash: preview.data.previewHash,
      },
    });
    expect(stale.status).toBe(409);
    expect(gmail.creates).toBe(0);
    const confirm = {
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: {
        executionId: again.data.executionId,
        previewHash: again.data.previewHash,
      },
    };
    const created = await post(confirm);
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    expect(created.data.status).toBe("created");
    expect(gmail.creates).toBe(1);
    const decoded = decodeRawDraft(gmail.raw);
    expect(decoded.to).toBe("tenant@fixture-rental.net");
    expect(decoded.from).toBe(editor.email);
    expect(decoded.body).toBe(again.data.body);
    expect(decoded.body).toContain(missingValueMarker("renewal rent"));
    expect(decoded.body).toContain("Hi Emulator and all,");
    // BEH-S162-10: the same confirmation again is the same draft, never a second one.
    expect((await post(confirm)).data.status).toBe("created");
    expect(gmail.creates).toBe(1);
    // BEH-S162-11: a later save does not touch the created draft.
    const later = await read();
    const edited = await post({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      cycleId: later.cycleId,
      expectedRevision: later.saved.revision,
      operationId: randomUUID(),
      inputs: later.inputs,
      bodyOverride: {
        text: `${body}\n\nEdited after the draft.`,
        baseHash: later.bodyBaseHash,
      },
    });
    expect(edited.status).toBe(200);
    expect(gmail.creates).toBe(1);
    expect(decodeRawDraft(gmail.raw).body).not.toContain("Edited after the draft.");
    expect((await read()).draftAttempt).toMatchObject({
      executionId: again.data.executionId,
      state: "Succeeded",
    });
  });
});
