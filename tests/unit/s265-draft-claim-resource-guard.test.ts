import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  noticeSafetyMarkerRef,
  observeRenewalNotice,
  type NoticeSourceRead,
} from "@/lib/firestore/renewal-notice-safety";
import { noticeScopeHash, pendingNoticeHash } from "@/lib/lease-renewal/notice-safety";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { assertCurrentRenewalMessageClaim } from "@/lib/firestore/renewal-message-claim";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  messageResourceFingerprint,
  workingTermsFingerprint,
  workspaceMessageBasisFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import {
  TENANT_RESOURCE_PURPOSES,
  type FrozenTenantResource,
} from "@/lib/lease-renewal/tenant-resource-evidence";

// S265 AC-S265-4 (R-S265-4, ARCH-S265-4, BEH-S265-4) at the real Gmail draft claim guard
// (`assertCurrentRenewalMessageClaim`, the S20 companion that runs inside the claim transaction).
// The reviewed message freezes the evidence of the resources its exact content includes. A
// same-link proof change, a revocation, an expiry or a restricted proof that does not cover the
// draft's actual recipient refuses before any Gmail call, with the exact re-review recovery. A
// change to a resource the message omits invalidates nothing. A draft reviewed before S265 holds
// only when its stored content includes a tenant resource. Synthetic fixtures only.

const actor = {
  uid: "s265-editor",
  email: "s265-editor@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as AuthenticatedUser;
const cycle = "10000000-0000-4000-8000-000000000265";
const at = Date.parse("2026-11-12T15:00:00.000Z");
const RECIPIENT = "tenant-one@fixture-rental.net";
const URLS = {
  insurance_flyer: "https://fixture-rental.net/insurance-flyer.pdf",
  rbp_flyer: "https://fixture-rental.net/rbp-flyer.pdf",
  renewal_information_form: "https://fixture-rental.net/renewal-form",
} as const;
type Id = keyof typeof URLS;

function source(time = at): NoticeSourceRead {
  const [lease] = leaseViewsFromExport([
    {
      lease: { leaseID: "9265", leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
      unit: { unitID: "9201" },
    },
  ]);
  applyLeaseDetailToView(lease, {
    leaseStatusID: "2",
    noticeDate: null,
    expectedMoveOutDate: null,
    moveOutDate: null,
    isMonthToMonth: "0",
  });
  return {
    lease,
    statusTable: {
      status: "available",
      statuses: [
        {
          leaseStatusID: "2",
          name: "Synthetic active",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: false,
          isCompletedMoveOutStatus: false,
          isPendingMoveInStatus: false,
          isSystemStatus: true,
        },
      ],
      readAtMs: time,
      noticeAdmitted: true,
      admittedLeaseKeys: [renewalWorkspaceDocId("9265")],
    },
    freshness: "fresh",
    leaseReadAtMs: time,
    observedAtMs: time,
    noticeAdmitted: true,
    admittedLeaseKeys: [renewalWorkspaceDocId("9265")],
  };
}

function checked(
  id: Id,
  proof: { id: string; version: number },
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    url: URLS[id],
    verified: true,
    recordedAt: "2026-11-10T15:00:00.000Z",
    recordedByUid: "fixture-admin",
    tenantAccess: {
      purpose: TENANT_RESOURCE_PURPOSES[id],
      destination: URLS[id],
      documentVersion: `${id} 2026-11`,
      audience: { kind: "tenant_wide" },
      method: "signed_out_open",
      result: "current_document",
      checkedBy: "Fixture Resource Owner",
      checkedOn: "2026-11-10",
      validUntil: "2026-12-31",
      proof,
      ...overrides,
    },
  };
}
const PROOF_1 = { id: "1".repeat(32), version: 4 };
const PROOF_2 = { id: "2".repeat(32), version: 7 };
const RBP_PROOF = { id: "3".repeat(32), version: 5 };
function frozen(id: Id, proof: { id: string; version: number }): FrozenTenantResource {
  return {
    id,
    purpose: TENANT_RESOURCE_PURPOSES[id],
    url: URLS[id],
    documentVersion: `${id} 2026-11`,
    audience: { kind: "tenant_wide" },
    proof,
    validUntil: "2026-12-31",
  };
}

async function setup(time = at) {
  const fake = new FakeTransactionalFirestore();
  const db = fake as unknown as Firestore;
  const scopeHash = noticeScopeHash("9265", null, null),
    sourceReadAt = { lease: 0, status: 0 };
  fake.seed(noticeSafetyMarkerRef(db, "9265").path, {
    scopeHash,
    sourceReadAt,
    semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    version: 1,
    observedAt: new Date(time).toISOString(),
  });
  fake.seed(`lease_renewal_workspaces/${renewalWorkspaceDocId("9265")}`, {
    ...emptyRenewalWorkspace("9265", cycle, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "synthetic",
    }),
  });
  const notice = await observeRenewalNotice(actor, source(time), db);
  return { fake, db, notice: notice.basis! };
}

/** One unused prepared attempt whose exact preview content and claim basis are given. */
function seedAttempt(
  fake: FakeTransactionalFirestore,
  db: Firestore,
  input: {
    notice: NonNullable<Awaited<ReturnType<typeof observeRenewalNotice>>["basis"]>;
    settings: Record<string, unknown>;
    includedResources?: FrozenTenantResource[];
    body: string;
    to?: string;
  },
) {
  const headPath = `lease_renewal_workspaces/${renewalWorkspaceDocId("9265")}`;
  const identity = hashExecutionPreview({
    leaseId: "9265",
    cycleId: cycle,
    channel: "tenant",
  });
  const basis = {
    workspaceFingerprint: workspaceMessageBasisFingerprint(fake.read(headPath)!),
    sourceFingerprint: "synthetic-source",
    preparationRevision: 1,
    resourceFingerprint: messageResourceFingerprint(input.settings),
    noticeSafety: input.notice,
    workingTermsFingerprint: workingTermsFingerprint(null),
    ...(input.includedResources ? { includedResources: input.includedResources } : {}),
  };
  const execution = {
    id: `attempt-${Math.random().toString(16).slice(2)}`,
    action_key: "gmail.renewal_notice.draft_create",
    scope_ref: `external-workflow:live:renewal-live:9265:cycle:${cycle}`,
    preview_hash: "synthetic-preview",
    context_hash: "synthetic-context",
  } as ActionExecutionRecord;
  const preview = {
    status: "ready",
    channel: "tenant",
    subject: "Lease Renewal for 9265 Fixture Lane",
    body: input.body,
    htmlBody: `<div>${input.body
      .split("\n\n")
      .map((paragraph) => `<p>${paragraph}</p>`)
      .join("")}</div>`,
    recipient: { to: input.to ?? RECIPIENT, sourceRef: "rentvine:contact:9101" },
  };
  fake.seed(`renewal_message_draft_snapshots/${execution.id}`, {
    leaseId: "9265",
    cycleId: cycle,
    actorUid: actor.uid,
    channel: "tenant",
    claimBasis: basis,
    previewHash: execution.preview_hash,
    contextHash: execution.context_hash,
    preview,
    snapshotHash: hashExecutionPreview({ preview, claimBasis: basis }),
  });
  fake.seed(`renewal_message_preparations/${identity}`, {
    revision: 1,
    reviewedSourceFingerprint: basis.sourceFingerprint,
    signatureActorUid: actor.uid,
    signatureEmail: actor.email,
  });
  fake.seed(`renewal_message_draft_heads/${identity}`, { executionId: execution.id });
  const publication = suppliedRenewalPublication("tenant");
  fake.seed("templates/synthetic", {
    space_id: "lease-renewals",
    name: publication.name,
    body: publication.body,
    status: "Approved",
    approved_by_uid: actor.uid,
    last_reviewed_at: "synthetic",
  });
  fake.seed("renewal_resource_locations/current", input.settings);
  return () =>
    db.runTransaction((tx) =>
      assertCurrentRenewalMessageClaim(tx as Transaction, db, actor, execution),
    );
}
const settingsOf = (entries: Record<string, unknown>, version = 9) => ({
  version,
  entries,
});
const OFFER_WITH_RBP = `Hello Fixture,\n\nRent: $1,100.00 per month, effective 01/01/2027.\n\nResident Benefits Package information: ${URLS.rbp_flyer}\n\nKindest Regards,`;
const OFFER_WITHOUT_RESOURCES =
  "Hello Fixture,\n\nRent: $1,100.00 per month, effective 01/01/2027.\n\nKindest Regards,";

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at + 5000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("S265 AC-S265-4: the Gmail draft claim rechecks the included resource proof", () => {
  it("claims with the reviewed proof, and refuses a same-link proof change before any Gmail call", async () => {
    const { fake, db, notice } = await setup();
    const settings = settingsOf({ rbp_flyer: checked("rbp_flyer", RBP_PROOF) });
    const claim = seedAttempt(fake, db, {
      notice,
      settings,
      includedResources: [frozen("rbp_flyer", RBP_PROOF)],
      body: OFFER_WITH_RBP,
    });
    await expect(claim()).resolves.toBeUndefined();
    // An Admin records a new proof for the same link after the review.
    fake.seed(
      "renewal_resource_locations/current",
      settingsOf({ rbp_flyer: checked("rbp_flyer", PROOF_2) }, 10),
    );
    await expect(claim()).rejects.toThrow(
      "The Resident Benefits Package information link or its tenant audience check changed after this message was reviewed. No Gmail draft was created. Review the message again.",
    );
  });

  it("refuses a revoked proof at the same link", async () => {
    const { fake, db, notice } = await setup();
    const settings = settingsOf({ rbp_flyer: checked("rbp_flyer", RBP_PROOF) });
    const claim = seedAttempt(fake, db, {
      notice,
      settings,
      includedResources: [frozen("rbp_flyer", RBP_PROOF)],
      body: OFFER_WITH_RBP,
    });
    const { tenantAccess: _revoked, ...withoutCheck } = checked("rbp_flyer", RBP_PROOF);
    void _revoked;
    fake.seed(
      "renewal_resource_locations/current",
      settingsOf({ rbp_flyer: withoutCheck }, 10),
    );
    await expect(claim()).rejects.toThrow(
      /Source pending now\. No tenant audience check is recorded for this link\. No Gmail draft was created\./,
    );
  });

  it("refuses the same reviewed proof once it expires before the claim", async () => {
    // 11:55 p.m. Central on November 12; the proof holds through that day only.
    const late = Date.parse("2026-11-13T05:55:00.000Z");
    vi.setSystemTime(late);
    const { fake, db, notice } = await setup(late);
    const lastDay = checked("rbp_flyer", RBP_PROOF, { validUntil: "2026-11-12" });
    const claim = seedAttempt(fake, db, {
      notice,
      settings: settingsOf({ rbp_flyer: lastDay }),
      includedResources: [
        { ...frozen("rbp_flyer", RBP_PROOF), validUntil: "2026-11-12" },
      ],
      body: OFFER_WITH_RBP,
    });
    await expect(claim()).resolves.toBeUndefined();
    // Ten minutes later it is November 13 in Kansas City; the notice read is still current.
    vi.setSystemTime(late + 10 * 60_000);
    await expect(claim()).rejects.toThrow(/expired on 11\/12\/2026/);
  });

  it("refuses a restricted proof that does not cover the draft's actual recipient", async () => {
    const { fake, db, notice } = await setup();
    const restricted = checked("rbp_flyer", RBP_PROOF, {
      audience: { kind: "restricted", recipients: ["another-tenant@fixture-rental.net"] },
      method: "sharing_list",
    });
    const claim = seedAttempt(fake, db, {
      notice,
      settings: settingsOf({ rbp_flyer: restricted }),
      includedResources: [
        {
          ...frozen("rbp_flyer", RBP_PROOF),
          audience: {
            kind: "restricted",
            recipients: ["another-tenant@fixture-rental.net"],
          },
        },
      ],
      body: OFFER_WITH_RBP,
    });
    await expect(claim()).rejects.toThrow(/does not cover everyone this message goes to/);
  });

  it("a change to a resource the message omits invalidates nothing and adds nothing", async () => {
    const { fake, db, notice } = await setup();
    const settings = settingsOf({
      rbp_flyer: checked("rbp_flyer", RBP_PROOF),
      insurance_flyer: checked("insurance_flyer", PROOF_1),
    });
    const claim = seedAttempt(fake, db, {
      notice,
      settings,
      includedResources: [frozen("rbp_flyer", RBP_PROOF)],
      body: OFFER_WITH_RBP,
    });
    fake.seed(
      "renewal_resource_locations/current",
      settingsOf(
        {
          rbp_flyer: checked("rbp_flyer", RBP_PROOF),
          insurance_flyer: checked("insurance_flyer", PROOF_2),
          renewal_information_form: checked("renewal_information_form", PROOF_1),
        },
        11,
      ),
    );
    await expect(claim()).resolves.toBeUndefined();
  });

  it("a draft reviewed before S265 holds only when its stored content includes a tenant resource", async () => {
    const { fake, db, notice } = await setup();
    // Legacy basis: no included-resource evidence. Its text links the saved form.
    const legacySettings = settingsOf({
      renewal_information_form: {
        id: "renewal_information_form",
        url: URLS.renewal_information_form,
        verified: true,
        recordedAt: "2026-09-10T12:00:00.000Z",
        recordedByUid: "fixture-admin",
      },
    });
    const includes = seedAttempt(fake, db, {
      notice,
      settings: legacySettings,
      body: `${OFFER_WITHOUT_RESOURCES}\n\nPlease complete the renewal information form so we have your updated information.\n\nRenewal information form: ${URLS.renewal_information_form}`,
    });
    await expect(includes()).rejects.toThrow(
      "This message was reviewed before tenant link checks and includes the renewal information form. No Gmail draft was created. Review the message again.",
    );
    // A legacy draft whose stored text omits every tenant resource keeps its other guards, even
    // after the shared settings changed.
    const omits = seedAttempt(fake, db, {
      notice,
      settings: legacySettings,
      body: OFFER_WITHOUT_RESOURCES,
    });
    fake.seed(
      "renewal_resource_locations/current",
      settingsOf({ insurance_flyer: checked("insurance_flyer", PROOF_1) }, 12),
    );
    await expect(omits()).resolves.toBeUndefined();
  });
});
