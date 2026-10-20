import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  clearLiveLeaseCache,
  LEASE_EXPORT_MAX_AGE_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { AuthenticatedUser } from "@/lib/auth/session";

// Synthetic identities use the existing fixture-domain shape to exercise normal transport admission.
// The injected Gmail client and OS no-egress boundary prevent any actual mailbox/provider access.
// S161/S162/S163 against the actual Firestore emulator and the message-preparation route: the
// first save of a lease's message establishes its work record (no cycle step), authored subject
// and body persist exactly through changed working information, and the explicit draft action
// saves what is displayed, refuses a mismatch before any Gmail call, gives a changed envelope its
// own attempt and creates exactly one unsent draft with its markers. Live lease views, the Gmail
// client and the session are deterministic doubles; nothing reaches a provider.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  statusUnavailable: false,
  leaseUnavailable: false,
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31" as string | null,
    increaseEligibilityDate: null as string | null,
  },
  actor: {
    uid: "synthetic-journey-operator",
    email: "synthetic-journey-operator@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
}));
const gmail = vi.hoisted(() => ({ creates: 0, raw: "" }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => testState.actor,
  requireCapability: async () => testState.actor,
}));
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const { RentVineError } = await import("@/lib/integrations/rentvine/client");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => {
      if (testState.leaseUnavailable)
        throw new RentVineError("synthetic source unavailable", 503);
      return {
        rows: [
          {
            lease: {
              leaseID: 701,
              leaseStatusID: "2",
              ...testState.leaseDates,
              baseRentAmount: 1000,
              noticeDate: null,
              expectedMoveOutDate: null,
              moveOutDate: null,
              tenants: [
                {
                  contactID: "1701",
                  name: "Synthetic Tenant One",
                  firstName: "Emulator",
                  email: "tenant-one@fixture-rental.net",
                },
                {
                  contactID: "1702",
                  name: "Synthetic Tenant Two",
                  email: "tenant-two@fixture-rental.net",
                },
              ],
            },
            unit: { unitID: "2701" },
            property: { streetName: "701 Synthetic Journey Avenue" },
            portfolio: {
              owners: [
                {
                  contactID: "3701",
                  name: "Synthetic Owner",
                  email: "owner@fixture-rental.net",
                },
              ],
            },
          },
        ],
        pages: 1,
        complete: true,
      };
    },
    listLeaseStatuses: async () => {
      if (testState.statusUnavailable) throw new Error("synthetic status unavailable");
      return [
        {
          leaseStatusID: "2",
          name: "Emulator Active",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: false,
          isCompletedMoveOutStatus: false,
          isPendingMoveInStatus: false,
          isSystemStatus: true,
        },
      ];
    },
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
      return { draftId: "synthetic-unsent-draft" };
    },
    getDraftById: async () => ({ draftId: "synthetic-unsent-draft", raw: gmail.raw }),
    findDraftByRfcMessageId: async () =>
      gmail.raw ? { draftId: "synthetic-unsent-draft", raw: gmail.raw } : null,
  }),
}));

import {
  GET as getMessageRoute,
  POST as postMessageRoute,
} from "@/app/api/lease-renewal/message-preparation/route";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";

const projectId = "demo-pmi-isolated-renewal-journey";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
const editor = testState.actor;

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
  app = initializeApp({ projectId }, `isolated-renewal-journey-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  vi.useRealTimers();
  await testEnv.clearFirestore();
  refreshSource();
  gmail.creates = 0;
  gmail.raw = "";
  testState.actor = editor;
  testState.statusUnavailable = false;
  testState.leaseUnavailable = false;
  testState.leaseDates = {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: null,
  };
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { publishChargePolicy } from "@/lib/firestore/lease-charge-policy";
import {
  saveRenewalWorkspace,
  renewalWorkspaceDocId,
} from "@/lib/firestore/renewal-workspace";
import {
  resolveLivePacketInput,
  PACKET_SOURCE_COLLECTIONS,
} from "@/lib/lease-documents/live-input";
import { readyS66Input, s66Source } from "@/tests/fixtures/s66-packet";
import { POST as evaluatePacketRoute } from "@/app/api/lease-renewal/packet-truth/route";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import { resolveApprovedDotloopArtifact } from "@/lib/lease-documents/approved-artifact-content";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import { createDotloopLoopFake } from "@/tests/helpers/dotloop-loop-fake";
import { DotloopClient } from "@/lib/integrations/dotloop/client";
import { DOTLOOP_PARTICIPANT_ROLES } from "@/lib/integrations/dotloop/participant-roles";
import {
  LiveDotloopProvider,
  type DotloopRenewalParticipant,
} from "@/lib/integrations/dotloop/renewal-provider";
import { executeDotloopPacketWithS20 } from "@/lib/lease-renewal/execution/dotloop-runtime";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { POST as communicationCommand } from "@/app/api/gmail-hub/sequences/route";
import {
  runProductionRuntimeGatedAction,
  isProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { changeRuntimeActionSuspension } from "@/lib/firestore/runtime-action-suspensions";
import { claimActiveS97RenewalEffect } from "@/lib/firestore/s97-renewal-writeback-claim";
import { buildRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";
import { saveRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import {
  RenewalWritebackService,
  type RenewalWritebackWriter,
} from "@/lib/lease-renewal/writeback/execution-service";
import { decodeRawDraft } from "@/lib/gmail-runtime/raw-message";

const approver: AuthenticatedUser = {
  ...editor,
  uid: "synthetic-journey-approver",
  email: "synthetic-journey-approver@pmikcmetro.com",
  role: "Admin",
};
const terms = { rent: 1525, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
function routeRequest(body: unknown) {
  return new Request("http://fixture.invalid/api/lease-renewal/packet-truth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function saveTermsAndOwnerApproval() {
  for (const [field, value] of [
    ["terms_rent", terms.rent],
    ["terms_effective_date", terms.effectiveDate],
    ["terms_end_date", terms.endDate],
  ] as const)
    await saveRenewalWorkingField(
      editor,
      { leaseId: "701", field, value, expectedRevision: 0, operationId: randomUUID() },
      db,
    );
  await publishChargePolicy(
    approver,
    {
      content: { residentBenefitPackage: null, insuranceProgram: null, animals: null },
      effectiveFrom: "2026-01-01",
      expectedVersion: 0,
      operationId: randomUUID(),
    },
    db,
  );
  const state = (await getRenewalWorkspace(editor, "701", db))!;
  await saveRenewalWorkspace(
    editor,
    {
      leaseId: "701",
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: randomUUID(),
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        source: "Synthetic external human approval in an isolated fixture; no real owner",
      },
    },
    db,
  );
}

describe("synthetic isolated renewal journey through current services and durable storage", () => {
  it("replays a lost preview/save response with one saved revision, one preparation and no Gmail call", async () => {
    const initial = await read();
    await publishSuppliedRenewalTemplate(approver, "tenant", db);
    const request = {
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: initial.content.subject, body: initial.content.plainText },
      save: { expectedRevision: 0, operationId: randomUUID(), inputs: initial.inputs },
    };
    // The first save establishes a new work scope; its old source generation cannot approve it.
    const firstSaveHold = await post(request);
    expect(firstSaveHold.data.status).toBe("blocked");
    expect((await db.collection("action_executions").get()).size).toBe(0);
    refreshSource();
    const committedButUndelivered = await post(request);
    expect(
      committedButUndelivered.data.status,
      JSON.stringify(committedButUndelivered.data),
    ).toBe("preview");
    const retried = await post(request);
    expect(retried.data.executionId).toBe(committedButUndelivered.data.executionId);
    expect((await read()).saved.revision).toBe(1);
    expect((await db.collection("action_executions").get()).size).toBe(1);
    expect(gmail.creates).toBe(0);
  });

  it("refuses confirmation after the source expires without consuming an attempt, then permits a fresh preview", async () => {
    const initial = await read();
    await post({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      expectedRevision: 0,
      operationId: randomUUID(),
      inputs: initial.inputs,
    });
    await publishSuppliedRenewalTemplate(approver, "tenant", db);
    refreshSource();
    const preview = await post({ kind: "draft", leaseId: "701", channel: "tenant" });
    expect(preview.data.status, JSON.stringify(preview.data)).toBe("preview");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + LEASE_EXPORT_MAX_AGE_MS + 1000);
    testState.leaseUnavailable = true;
    try {
      const refused = await post({
        kind: "draft",
        leaseId: "701",
        channel: "tenant",
        confirm: {
          executionId: preview.data.executionId,
          previewHash: preview.data.previewHash,
        },
      });
      expect(refused.status).toBe(409);
      expect(refused.data.providerCallAttempted).toBe(false);
      expect(
        (
          await db.collection("action_executions").doc(preview.data.executionId).get()
        ).get("attempt_count"),
      ).toBe(0);
      expect(gmail.creates).toBe(0);
      testState.leaseUnavailable = false;
      refreshSource();
      const renewed = await post({ kind: "draft", leaseId: "701", channel: "tenant" });
      expect(renewed.data.status, JSON.stringify(renewed.data)).toBe("preview");
      const created = await post({
        kind: "draft",
        leaseId: "701",
        channel: "tenant",
        confirm: {
          executionId: renewed.data.executionId,
          previewHash: renewed.data.previewHash,
        },
      });
      expect(created.data.status, JSON.stringify(created.data)).toBe("created");
      expect(gmail.creates).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds mapped identities, a confirmed unsent draft, the exact packet, simulated human work and one confirmed RentVine renewal-date update", async () => {
    const initial = await read();
    expect(initial.recipients).toEqual({
      status: "ready",
      to: "tenant-one@fixture-rental.net",
      cc: ["tenant-two@fixture-rental.net"],
    });
    const owner = await getMessageRoute(
      new Request(
        "http://fixture.invalid/api/lease-renewal/message-preparation?leaseId=701&channel=owner",
      ),
    );
    expect(owner.status).toBe(200);
    expect((await owner.json()).facts.currentBaseRent?.value).toBe(1000);
    const saved = await post({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      expectedRevision: 0,
      operationId: randomUUID(),
      inputs: initial.inputs,
    });
    expect(saved.status).toBe(200);
    await saveTermsAndOwnerApproval();
    await publishSuppliedRenewalTemplate(approver, "tenant", db);
    refreshSource();
    let current = await currentRenewalMessage(editor, "701", "tenant", db);
    const identity = projectRenewalDeskIdentity(current.lease);
    expect(identity.tenants.map((p) => p.contactId?.label)).toEqual(["1701", "1702"]);
    expect(identity.owners.map((p) => p.contactId?.label)).toEqual(["3701"]);
    expect(current.facts.ownerTerms).toMatchObject(terms);

    const changed = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: {
        subject: current.content.subject,
        body: "Synthetic stale screen contents",
      },
    });
    expect(changed.status).toBe(409);
    expect(changed.data.code).toBe("message_changed");
    expect(gmail.creates).toBe(0);
    const preview = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      displayed: { subject: current.content.subject, body: current.content.plainText },
    });
    expect(preview.status, JSON.stringify(preview.data)).toBe(200);
    expect(preview.data.status, JSON.stringify(preview.data)).toBe("preview");
    expect(gmail.creates).toBe(0);
    testState.statusUnavailable = true;
    clearLeaseStatusTableCache();
    const held = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: {
        executionId: preview.data.executionId,
        previewHash: preview.data.previewHash,
      },
    });
    expect(held.status).toBe(409);
    expect(held.data).toMatchObject({
      providerCallAttempted: false,
      reason: "status_unavailable",
    });
    expect(gmail.creates).toBe(0);
    expect(
      (await db.collection("action_executions").doc(preview.data.executionId).get()).get(
        "attempt_count",
      ),
    ).toBe(0);
    testState.statusUnavailable = false;
    clearLeaseStatusTableCache();
    const renewed = await post({ kind: "draft", leaseId: "701", channel: "tenant" });
    expect(renewed.data.status, JSON.stringify(renewed.data)).toBe("preview");
    expect(renewed.data.executionId).not.toBe(preview.data.executionId);
    const confirmation = {
      executionId: renewed.data.executionId,
      previewHash: renewed.data.previewHash,
    };
    const wrongHash = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: { ...confirmation, previewHash: "f".repeat(64) },
    });
    expect(wrongHash.status).toBe(409);
    expect(gmail.creates).toBe(0);
    const draftKey = "gmail.renewal_notice.draft_create";
    const suspension = await changeRuntimeActionSuspension(
      approver,
      {
        action: "suspend",
        actionKey: draftKey,
        reasonCode: "planned_maintenance",
        confirmation: draftKey,
      },
      { operationId: randomUUID() },
      db,
    );
    const runtimeHeld = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: confirmation,
    });
    expect(runtimeHeld.status).toBe(409);
    expect(runtimeHeld.data).toMatchObject({
      code: "gmail_draft_preclaim_refused",
      providerCallAttempted: false,
    });
    expect(
      (await db.collection("action_executions").doc(confirmation.executionId).get()).get(
        "attempt_count",
      ),
    ).toBe(0);
    expect(gmail.creates).toBe(0);
    await changeRuntimeActionSuspension(
      approver,
      {
        action: "clear",
        actionKey: draftKey,
        reasonCode: "incident_resolved",
        confirmation: draftKey,
      },
      { operationId: randomUUID(), expectedSuspensionId: suspension.suspensionId },
      db,
    );
    const created = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      confirm: confirmation,
    });
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    expect(created.data.status).toBe("created");
    expect(gmail.creates).toBe(1);
    expect(
      (
        await post({
          kind: "draft",
          leaseId: "701",
          channel: "tenant",
          confirm: confirmation,
        })
      ).data.draftId,
    ).toBe(created.data.draftId);
    expect(gmail.creates).toBe(1);
    const decoded = decodeRawDraft(gmail.raw);
    expect(decoded.body).toContain("$1,525.00");
    expect(decoded.body).toContain("2027");

    // These genuine current operation boundaries remain closed even in this positive fixture.
    for (const action of ["send", "schedule", "resume"]) {
      const refused = await communicationCommand(
        new Request("http://fixture.invalid/api/gmail-hub/sequences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            id: randomUUID(),
            expectedVersion: 0,
            operationId: randomUUID(),
            reviewedDraftHash: "a".repeat(64),
            reviewedTargetHash: "b".repeat(64),
            schedule: null,
          }),
        }),
      );
      expect(refused.status).toBe(410);
    }
    for (const actionKey of [
      "dotloop.loop.create_from_template",
      "dotloop.document.upload",
    ]) {
      expect(isActionExecutable(actionKey)).toBe(false);
      await expect(
        executeDotloopPacketWithS20(editor, {
          request: { action: { actionKey } },
        } as never),
      ).rejects.toThrow(/not enabled/);
    }

    // The legal/template provider below is a separate synthetic port. No production write gate
    // is mocked or opened. Actual publications, current mapping and packet routes run in Firestore.
    current = await currentRenewalMessage(editor, "701", "tenant", db);
    const source = await resolveLivePacketInput(
      editor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(source.input.catalog.artifacts).toEqual([]);
    const fixture = readyS66Input();
    const people = [
      ...identity.tenants.map((p) => ({ p, kind: "tenant" as const })),
      ...identity.owners.map((p) => ({ p, kind: "owner" as const })),
    ];
    const parties = people.map(({ p, kind }, order) => ({
      participantId: p.contactId!.label,
      kind,
      signerRole: kind,
      source: {
        ...s66Source("rentvine", p.sourceRef),
        retrievedAt: new Date().toISOString(),
      },
      confidence: "Verified" as const,
      authoritativeOrder: order,
      providerBindings: {
        dotloopParticipantRef: `synthetic-dotloop-contact-${p.contactId!.label}`,
      },
    }));
    const syntheticDocument = {
      fixtureOnly: true,
      legalContent: false,
      leaseId: "701",
      terms,
      parties: people.map(({ p, kind }) => ({
        id: p.contactId!.label,
        name: p.label,
        email: p.email!.label,
        kind,
      })),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(syntheticDocument));
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const contentRef = await new FirestorePublicationContentStore(db).put({
      content: bytes,
      contentHash,
      contentId: "synthetic-journey-content",
    });
    for (const artifact of fixture.catalog.artifacts) {
      artifact.contentHash = contentHash;
      if (["standard_lease", "renewal_extension"].includes(artifact.kind))
        artifact.fieldBindings = [
          {
            fieldId: "synthetic-approved-rent",
            factKey: "renewal.approved_rent",
            required: true,
            allowedSourceSystems: ["staff_recorded_owner_approval"],
          },
          {
            fieldId: "synthetic-start",
            factKey: "renewal.effective_date",
            required: true,
            allowedSourceSystems: ["staff_recorded_owner_approval"],
          },
          {
            fieldId: "synthetic-end",
            factKey: "renewal.end_date",
            required: true,
            allowedSourceSystems: ["staff_recorded_owner_approval"],
          },
        ];
      const id = artifact.publicationSource.reference.slice("publication:".length);
      await db.collection("publication_versions").doc(id).set({
        id,
        validated: true,
        data_mode: "live",
        spaceId: "renewals",
        contentHash,
        resourceId: artifact.artifactId,
        contentRef,
        contentByteSize: bytes.byteLength,
        fileName: "synthetic-not-a-legal-form.txt",
        detectedMimeType: "text/plain",
      });
      await db
        .collection("publication_resources")
        .doc(artifact.artifactId)
        .set({ activeVersionId: id });
    }
    await db.collection(PACKET_SOURCE_COLLECTIONS.catalog).doc("current").set({
      schemaVersion: "approved-lease-catalog/v1",
      data_mode: "live",
      approvedByUid: approver.uid,
      approvedAt: new Date().toISOString(),
      catalog: fixture.catalog,
    });
    const workspace = (await getRenewalWorkspace(editor, "701", db))!;
    await db
      .collection(PACKET_SOURCE_COLLECTIONS.sources)
      .doc(renewalWorkspaceDocId("701"))
      .set({
        schemaVersion: "approved-renewal-packet-sources/v1",
        data_mode: "live",
        leaseId: "701",
        cycleId: workspace.cycleId,
        termsRevision: workspace.termsRevision,
        leaseSourceHash: source.leaseSourceHash,
        approvedByUid: approver.uid,
        approvedAt: new Date().toISOString(),
        source: fixture.catalog.source,
        facts: fixture.facts.filter((f) => f.fieldKey !== "lease.monthly_rent_cents"),
        participants: parties,
        charges: fixture.charges,
        animals: [],
        contacts: people.map<DotloopRenewalParticipant>(({ p, kind }) => ({
          participantRef: `synthetic-dotloop-contact-${p.contactId!.label}`,
          fullName: p.label,
          email: p.email!.label,
          role: kind === "tenant" ? "TENANT" : "LANDLORD",
        })),
      });
    const resolved = await resolveLivePacketInput(
      editor,
      "701",
      "701",
      new Date().toISOString(),
      db,
    );
    expect(resolved.ownerApproval).toBe("current");
    const evaluated = await evaluatePacketRoute(
      routeRequest({
        action: "evaluate",
        leaseId: "701",
        transactionId: "701",
        expectedCurrentSnapshotId: null,
      }),
    );
    expect(evaluated.status, JSON.stringify(await evaluated.clone().json())).toBe(200);
    const packet = (await evaluated.json()).snapshot;
    expect(packet.state, JSON.stringify(packet.blockers)).toBe("Ready for preview");
    expect(packet.manifest.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factKey: "renewal.approved_rent",
          normalizedValue: terms.rent,
        }),
        expect.objectContaining({
          factKey: "renewal.effective_date",
          normalizedValue: terms.effectiveDate,
        }),
        expect.objectContaining({
          factKey: "renewal.end_date",
          normalizedValue: terms.endDate,
        }),
      ]),
    );
    const persisted = (await getCurrentPacketSnapshot(editor, "701", "701", db))!;
    const head = {
      leaseId: "701",
      transactionId: "701",
      snapshotId: persisted.snapshotId,
      snapshotVersion: persisted.snapshotVersion,
      payloadHash: persisted.payloadHash,
    };
    expect(() =>
      bindCurrentPacketForDotloop({
        snapshot: persisted,
        currentHead: { ...head, leaseId: "702" },
        catalog: resolved.input.catalog,
        confirmedPayloadHash: persisted.payloadHash,
      }),
    ).toThrow(/stale/);
    const binding = bindCurrentPacketForDotloop({
      snapshot: persisted,
      currentHead: head,
      catalog: resolved.input.catalog,
      confirmedPayloadHash: persisted.payloadHash,
    });
    expect(binding.participantRefs).toEqual(
      parties
        .filter((p) => p.kind === "tenant")
        .map((p) => p.providerBindings.dotloopParticipantRef),
    );
    const fake = createDotloopLoopFake();
    const mappedContacts = resolved.contacts
      .filter((c) => binding.participantRefs.includes(c.participantRef))
      .map<DotloopRenewalParticipant>((contact) => {
        const role = DOTLOOP_PARTICIPANT_ROLES.find((value) => value === contact.role);
        if (!role) throw new Error("Synthetic packet has an unsupported Dotloop role");
        return { ...contact, role };
      });
    const provider = () =>
      new LiveDotloopProvider({
        client: new DotloopClient({
          transport: fake,
          tokens: {
            accessToken: async () => "synthetic-not-a-credential",
            refresh: async () => null,
          },
          sleep: async () => undefined,
        }),
        selection: {
          profileId: "synthetic-profile",
          templateId: binding.templateRef,
          transactionType: "LEASE_OFFER",
          initialStatus: "PRE_OFFER",
        },
        participants: mappedContacts,
        packetSnapshotId: persisted.snapshotId,
        propertyAddress: {
          streetName: "701 Synthetic Journey Avenue",
          city: "Synthetic City",
          state: "MO",
          zip: "00000",
        },
        artifactContent: (documentRef) =>
          resolveApprovedDotloopArtifact(editor, {
            catalog: resolved.input.catalog,
            documentRef,
            expectedContentHash: binding.documents.find(
              (d) => d.documentRef === documentRef,
            )!.contentHash,
          }),
      });
    const loop = await provider().createLoop({
      templateRef: binding.templateRef,
      participantRefs: binding.participantRefs,
      idempotencyKey: "synthetic-loop-create",
    });
    // A matching name without the original create receipt never becomes provider causality.
    await expect(
      provider().createLoop({
        templateRef: binding.templateRef,
        participantRefs: binding.participantRefs,
        idempotencyKey: "synthetic-loop-create",
      }),
    ).rejects.toThrow("without this attempt's create receipt");
    expect(fake.createCount).toBe(1);
    const document = binding.documents[0];
    const uploaded = await provider().uploadDocument({
      loopRef: loop.loopRef,
      documentRef: document.documentRef,
      documentType: "renewal_agreement",
      contentHash: document.contentHash,
      idempotencyKey: "synthetic-upload",
    });
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0].bytes).toEqual(bytes);
    const observed = await provider().readDocument(uploaded.documentRef);
    expect(observed).toMatchObject({ loopRef: loop.loopRef, active: true });
    expect(observed).not.toHaveProperty("signed");
    expect(fake.loops.get(loop.loopRef)?.participants.map((p) => p.email)).toEqual([
      "tenant-one@fixture-rental.net",
      "tenant-two@fixture-rental.net",
    ]);

    // External human actions are simulated outside application dispatch. This fixture-owned port
    // record is deliberately not a provider-verified signature, application milestone or receipt.
    await db.collection("synthetic_renewal_journey_ports").doc("human-handoff").set({
      fixtureOnly: true,
      simulatedHumanSentDraft: created.data.draftId,
      loopRef: loop.loopRef,
      packetHash: persisted.payloadHash,
      simulatedSigners: binding.participantRefs,
      providerSignatureVerified: false,
    });
    expect(
      (
        await db.collection("synthetic_renewal_journey_ports").doc("human-handoff").get()
      ).get("providerSignatureVerified"),
    ).toBe(false);

    const write = vi.fn(
      async (
        leaseId: string,
        payload: { startDate: string; endDate?: string | null },
      ) => {
        expect(leaseId).toBe("701");
        testState.leaseDates = {
          ...testState.leaseDates,
          ...payload,
          endDate: payload.endDate ?? testState.leaseDates.endDate,
        };
        await db
          .collection("synthetic_renewal_journey_ports")
          .doc("rentvine-701")
          .set({
            fixtureOnly: true,
            syntheticAccountId: "synthetic-rentvine-account",
            leaseID: "701",
            ...testState.leaseDates,
          });
        return { lease: { leaseID: "701" } };
      },
    );
    const writer: RenewalWritebackWriter = {
      updateLease: write,
      updateExistingRecurringCharge: async () => {
        throw new Error("unexpected charge write");
      },
      createRecurringCharge: async () => {
        throw new Error("unexpected charge creation");
      },
      deleteRecurringChargeForCreateReversal: async () => {
        throw new Error("unexpected delete");
      },
    };
    const service = () =>
      new RenewalWritebackService({
        descriptor: {
          environmentKind: "production",
          dataContext: "live",
          source: "explicit",
        },
        store: new FirestoreExternalExecutionStore(db),
        reads: {
          getLease: async (id) => {
            expect(id).toBe("701");
            return { ...testState.leaseDates };
          },
          getRecurringCharge: async () => {
            throw new Error("unexpected charge read");
          },
          listRecurringCharges: async () => [],
        },
        createWriter: () => writer,
        gateFor: (key) => ({
          isExecutable: () => isProductionRuntimeActionExecutable(key),
          run: (effect) => runProductionRuntimeGatedAction(key, effect),
        }),
        claimActiveEffect: (input) => claimActiveS97RenewalEffect(db, input),
      });
    const proposal = buildRenewalWritebackProposal({
      leaseId: "701",
      account: "pmikcmetro",
      actorUid: editor.uid,
      actorEmail: editor.email,
      actorRole: editor.role,
      leaseState: { ...testState.leaseDates },
      sourceReadAtIso: new Date().toISOString(),
      evidenceRef: `synthetic-human-handoff:${persisted.snapshotId}`,
      effects: [
        {
          kind: "renewal_dates_update",
          before: { ...testState.leaseDates },
          after: { endDate: terms.endDate },
        },
      ],
      nowMs: Date.now(),
    });
    await saveRenewalWritebackProposal(editor, proposal, null, db);
    const effect = proposal.effects[0];
    const confirmed = {
      proposal,
      effectHash: effect.effectHash,
      confirmation: {
        previewHash: proposal.previewHash,
        effectHash: effect.effectHash,
        confirmedAtIso: new Date().toISOString(),
      },
    };
    const corrected = await service().executeEffect(confirmed);
    expect(corrected.duplicate).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(testState.leaseDates).toMatchObject({
      startDate: "2026-01-01",
      endDate: terms.endDate,
    });
    expect((await service().executeEffect(confirmed)).duplicate).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);

    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "tests/fixtures/isolated-renewal-readback.ts",
        projectId,
        "701",
        persisted.snapshotId,
        confirmation.executionId,
        corrected.executionId,
      ],
      {
        env: { ...process.env },
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toMatchObject({
      kind: "fresh_process_emulator_readback",
      packetPersisted: true,
      ownGmailReceiptPersisted: true,
      writebackReceiptPersisted: true,
      simulatedProviderDatesReadBack: true,
      realProviderCalls: 0,
    });
    refreshSource();
    const refreshedSource = await read();
    expect(initial.facts.leaseEndDate).toBe("2026-12-31");
    expect(refreshedSource.facts.leaseEndDate).toBe(terms.endDate);
    const recovered = await post({
      kind: "draft",
      leaseId: "701",
      channel: "tenant",
      reconcile: { executionId: confirmation.executionId },
    });
    expect(recovered.data.draftId).toBe(created.data.draftId);
    expect(gmail.creates).toBe(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(isActionExecutable("dotloop.loop.create_from_template")).toBe(false);
    expect(isActionExecutable("dotloop.document.upload")).toBe(false);
  });
});
