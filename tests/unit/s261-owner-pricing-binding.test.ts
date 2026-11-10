import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, Transaction } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { assertCurrentRenewalMessageClaim } from "@/lib/firestore/renewal-message-claim";
import { suppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import {
  observeRenewalNotice,
  noticeSafetyMarkerRef,
  type NoticeSourceRead,
} from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkingRecordDocId } from "@/lib/firestore/renewal-working-record";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  messageResourceFingerprint,
  workingBaseFingerprint,
  workingTermsFingerprint,
  workspaceMessageBasisFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { noticeScopeHash, pendingNoticeHash } from "@/lib/lease-renewal/notice-safety";
import { ownerPricingWordingReview } from "@/lib/lease-renewal/owner-pricing-wording";
import { applyRefinedBody } from "@/lib/lease-renewal/refined-message";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

// S261 R-S261-2 / ARCH-S261-2 / BEH-S261-2 / AC-S261-2: owner pricing stays on the base. A preview
// calculated from one base or recommendation is bound to it: saved wording that still states an
// earlier base needs staff review before the current exact review, and a draft claim prepared
// before a newer base correction is refused. Saved wording is kept exactly as written. Every amount,
// lease and person is synthetic.

function facts(base: number | null, suggested: number | null): RenewalMessageFacts {
  return {
    outgoingContract: true,
    ownerIntent: "recommend_rent",
    // A saved blank signature choice: no signature marker in the wording.
    signatureConfigured: true,
    channel: "owner",
    names: ["Sample Owner"],
    firstNames: ["Sample"],
    address: "4821 Example Avenue",
    currentBaseRent: base === null ? null : { value: base, source: "Synthetic base" },
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: { low: 950, high: 1050, source: "Synthetic comparison" },
    suggestedRent:
      suggested === null
        ? null
        : { value: suggested, source: "Synthetic proposal", kind: "proposal" },
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: [],
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
  } as RenewalMessageFacts;
}

describe("S261 owner wording stays bound to the base it was calculated from", () => {
  it("BEH-S261-2: wording saved from the earlier $940 preview needs staff review against the current $900 base", () => {
    const earlier = composeRenewalMessage(facts(940, 980)).plainText;
    expect(earlier).toContain("We are currently charging them $940.00 per month.");
    const review = ownerPricingWordingReview({
      text: earlier,
      currentBase: 900,
      recommendation: 980,
    });
    expect(review).toMatch(/\$940\.00/);
    expect(review).toMatch(/\$900\.00/);
    // The same base, written with or without cents, qualifies as it is.
    expect(
      ownerPricingWordingReview({ text: earlier, currentBase: 940, recommendation: 980 }),
    ).toBeNull();
    expect(
      ownerPricingWordingReview({
        text: earlier.replace("$940.00", "$940"),
        currentBase: 940,
        recommendation: 980,
      }),
    ).toBeNull();
  });

  it("BEH-S261-2: while the base needs verification, wording that states any base needs review", () => {
    const earlier = composeRenewalMessage(facts(940, 980)).plainText;
    expect(
      ownerPricingWordingReview({
        text: earlier,
        currentBase: null,
        recommendation: 980,
      }),
    ).toMatch(/needs verification/);
  });

  it("ARCH-S261-2: wording that suggests an earlier recommendation needs review against the current Rent to recommend", () => {
    const earlier = composeRenewalMessage(facts(900, 1050)).plainText;
    const review = ownerPricingWordingReview({
      text: earlier,
      currentBase: 900,
      recommendation: 1000,
    });
    expect(review).toMatch(/\$1,050\.00/);
    expect(review).toMatch(/\$1,000\.00/);
  });

  it("AC-S261-2: a reviewed case-specific amount stays outside the base slot and needs no extra review", () => {
    const composed = composeRenewalMessage(facts(900, 980));
    const reviewed = `${composed.plainText}\n\nPet rent of $40.00 per month is billed separately and is not part of the base rent.`;
    const content = applyRefinedBody(composed, reviewed);
    expect(content.plainText).toContain(
      "We are currently charging them $900.00 per month.",
    );
    expect(content.plainText).toContain("Pet rent of $40.00 per month");
    expect(content.missing).toEqual([]);
    expect(
      ownerPricingWordingReview({
        text: content.plainText,
        currentBase: 900,
        recommendation: 980,
      }),
    ).toBeNull();
  });

  it("ARCH-S261-2: the base binding follows the working correction's revision and leaves the terms binding alone", () => {
    const record = (value: number, revision: number): RenewalWorkingRecord => ({
      schemaVersion: "renewal-working-record/v1",
      leaseId: "9001",
      revision,
      fields: {
        current_rent: {
          value,
          revision,
          eventId: `10000000-0000-4000-8000-00000000000${revision}`,
          recordedAt: "2026-11-10T15:00:00.000Z",
          recordedByUid: "synthetic-editor",
          recordedByLabel: "editor@pmikcmetro.com",
          origin: "staff_entry",
        },
      },
    });
    expect(workingBaseFingerprint(record(900, 1))).toBe(
      workingBaseFingerprint(record(900, 1)),
    );
    expect(workingBaseFingerprint(record(900, 2))).not.toBe(
      workingBaseFingerprint(record(900, 1)),
    );
    expect(workingBaseFingerprint(record(905, 2))).not.toBe(
      workingBaseFingerprint(record(900, 2)),
    );
    expect(workingBaseFingerprint(null)).not.toBe(workingBaseFingerprint(record(900, 1)));
    expect(workingTermsFingerprint(record(905, 2))).toBe(workingTermsFingerprint(null));
  });
});

// ---- The draft claim re-reads the base correction it was previewed with -------------------------

const actor = {
  uid: "base-editor",
  email: "base-editor@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as AuthenticatedUser;
const cycle = "10000000-0000-4000-8000-000000000001";
const at = Date.parse("2026-11-10T15:00:00.000Z");
const statuses = [
  {
    leaseStatusID: "2",
    name: "Synthetic active",
    primaryLeaseStatusID: "2",
    isPendingMoveOutStatus: false,
    isCompletedMoveOutStatus: false,
    isPendingMoveInStatus: false,
    isSystemStatus: true,
  },
];

function source(): NoticeSourceRead {
  const [lease] = leaseViewsFromExport([
    {
      lease: { leaseID: "9001", leaseStatusID: "2", tenants: [{ contactID: "9101" }] },
      unit: { unitID: "9201" },
    },
  ]);
  applyLeaseDetailToView(lease!, {
    leaseStatusID: "2",
    noticeDate: null,
    expectedMoveOutDate: null,
    moveOutDate: null,
    isMonthToMonth: "0",
  });
  return {
    lease: lease!,
    statusTable: {
      status: "available",
      statuses,
      readAtMs: at,
      noticeAdmitted: true,
      admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
    },
    freshness: "fresh",
    leaseReadAtMs: at,
    observedAtMs: at,
    noticeAdmitted: true,
    admittedLeaseKeys: [renewalWorkspaceDocId("9001")],
  };
}

function workingRecord(value: number, revision: number): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "9001",
    revision,
    fields: {
      current_rent: {
        value,
        revision,
        eventId: `20000000-0000-4000-8000-00000000000${revision}`,
        recordedAt: "2026-11-10T15:00:00.000Z",
        recordedByUid: actor.uid,
        recordedByLabel: actor.email,
        origin: "staff_entry",
      },
    },
  };
}

async function seededOwnerClaim(withBaseBinding: boolean) {
  const fake = new FakeTransactionalFirestore();
  const db = fake as unknown as Firestore;
  const scopeHash = noticeScopeHash("9001", null, null),
    sourceReadAt = { lease: 0, status: 0 };
  fake.seed(noticeSafetyMarkerRef(db, "9001").path, {
    scopeHash,
    sourceReadAt,
    semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    version: 1,
    observedAt: new Date(at).toISOString(),
  });
  const headPath = `lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}`;
  fake.seed(headPath, {
    ...emptyRenewalWorkspace("9001", cycle, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "synthetic",
    }),
  });
  const workingPath = `lease_renewal_working_records/${renewalWorkingRecordDocId("9001")}`;
  const previewed = workingRecord(900, 1);
  fake.seed(workingPath, { ...previewed });
  const notice = (await observeRenewalNotice(actor, source(), db)).basis!;
  const identity = hashExecutionPreview({
    leaseId: "9001",
    cycleId: cycle,
    channel: "owner",
  });
  const basis = {
    workspaceFingerprint: workspaceMessageBasisFingerprint(fake.read(headPath)!),
    sourceFingerprint: "synthetic-source",
    preparationRevision: 1,
    resourceFingerprint: messageResourceFingerprint({ version: 0, entries: {} }),
    noticeSafety: notice,
    workingTermsFingerprint: workingTermsFingerprint(previewed),
    ...(withBaseBinding
      ? { workingBaseFingerprint: workingBaseFingerprint(previewed) }
      : {}),
  };
  const execution = {
    id: "synthetic-owner-attempt",
    action_key: "gmail.renewal_notice.draft_create",
    scope_ref: `external-workflow:live:renewal-live:9001:cycle:${cycle}`,
    preview_hash: "synthetic-preview",
    context_hash: "synthetic-context",
  } as ActionExecutionRecord;
  const preview = { synthetic: true };
  fake.seed(`renewal_message_draft_snapshots/${execution.id}`, {
    leaseId: "9001",
    cycleId: cycle,
    actorUid: actor.uid,
    channel: "owner",
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
  const publication = suppliedRenewalPublication("owner");
  fake.seed("templates/synthetic", {
    space_id: "lease-renewals",
    name: publication.name,
    body: publication.body,
    status: "Approved",
    approved_by_uid: actor.uid,
    last_reviewed_at: "synthetic",
  });
  const claim = () =>
    db.runTransaction((tx) =>
      assertCurrentRenewalMessageClaim(tx as Transaction, db, actor, execution),
    );
  return { fake, claim, workingPath };
}

describe("S261 ARCH-S261-2: a draft claim is bound to the base correction it was previewed with", () => {
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

  it("an unchanged correction claims; a newer correction after the preview refuses the older preview", async () => {
    const { fake, claim, workingPath } = await seededOwnerClaim(true);
    await expect(claim()).resolves.toBeUndefined();
    // Staff correct the base again after this preview, even to the same amount.
    fake.seed(workingPath, { ...workingRecord(900, 2) });
    await expect(claim()).rejects.toThrow(/changed after this preview/);
    fake.seed(workingPath, { ...workingRecord(905, 3) });
    await expect(claim()).rejects.toThrow(/changed after this preview/);
  });

  it("a historical snapshot without the base binding keeps its recovery", async () => {
    const { fake, claim, workingPath } = await seededOwnerClaim(false);
    fake.seed(workingPath, { ...workingRecord(900, 1) });
    await expect(claim()).resolves.toBeUndefined();
  });
});
