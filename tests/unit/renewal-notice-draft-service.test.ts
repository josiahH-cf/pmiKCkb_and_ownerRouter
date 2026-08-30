import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => ({ status: "clear" })),
}));

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import type { GovernedDraftSeams } from "@/lib/external-execution/governed-draft-execution";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
} from "@/lib/external-execution/s20-bridge";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseCurrentRent } from "@/lib/integrations/rentvine/lease-mapper";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  prepareRenewalNoticeDraft,
  type RenewalNoticeDraftDeps,
  type RenewalNoticeDraftInput,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import { RENEWAL_COPY_TEMPLATE_SOURCES } from "@/lib/lease-renewal/renewal-copy-contract";
import { createRenewalCopyTemplate } from "@/lib/lease-renewal/renewal-copy-governance";
import {
  TEST_COMP_SCREENSHOT_ATTACHMENT,
  TEST_RESOLVED_RENEWAL_ATTACHMENT,
} from "@/tests/helpers/renewal-draft-attachment";

const MAILBOX = { email: "workflow@pmikcmetro.com", sourceRef: "app:session:u1" };

const approvedCopy = {
  owner: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.owner,
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: "client-approval:unit-owner",
    },
  }),
  tenant: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
    publication: {
      status: "approved",
      approvedAtIso: "2026-08-30T00:00:00.000Z",
      evidenceRef: "client-approval:unit-tenant",
    },
  }),
};

const tenantLease: RawLease = {
  leaseID: 42,
  endDate: "2026-09-30",
  currentRent: 1400,
  tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
};

const ownerLease: RawLease = {
  leaseID: 42,
  endDate: "2026-09-30",
  currentRent: 1400,
  tenants: [{ name: "Ada Rowan" }],
  property: {
    streetName: "200 Cedar Ct",
    owner: { email: "owner42@cedar-holdings.com" },
  },
};

const actor: AuthenticatedUser = {
  uid: "u1",
  email: "workflow@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

/**
 * Drive the REAL S20 bridge against an in-memory Firestore, so these tests exercise the committed
 * one-attempt ledger rather than a stand-in for it. Only Gmail and the lease read are faked.
 */
function s20Seams(db: FakeFirestore): GovernedDraftSeams {
  const firestore = db as unknown as Firestore;
  return {
    prepare: (user, request) =>
      prepareExternalActionWithS20(user, request, { db: firestore }),
    execute: (user, request) =>
      executeExternalActionWithS20(user, request, { db: firestore }),
    reconcile: (user, request) =>
      reconcileExternalActionWithS20(user, request, { db: firestore }),
    assertEffectEnvironment: () => undefined,
  };
}

function deps(
  lease: RawLease | null,
  options: {
    createDraft?: () => Promise<{ draftId: string }>;
    findDraft?: (messageId: string) => Promise<{ draftId: string } | null>;
  } = {},
) {
  const createDraft = vi.fn(
    options.createDraft ?? (async () => ({ draftId: "draft-svc-1" })),
  );
  const findDraft = vi.fn(options.findDraft ?? (async () => null));
  const db = new FakeFirestore();
  const d: RenewalNoticeDraftDeps = {
    loadLease: async () => lease,
    loadOwnerCurrentRentDecision: async () => {
      const currentRent = lease ? leaseCurrentRent(lease) : undefined;
      return currentRent !== undefined
        ? {
            currentRent,
            currentRentEvidence: {
              agreement: "agree",
              currencyState: "fresh",
              readAtIso: "2026-08-26T13:00:00.000Z",
            },
          }
        : null;
    },
    loadCompScreenshotAttachment: async () => TEST_COMP_SCREENSHOT_ATTACHMENT,
    resolveCompScreenshotAttachment: async () => TEST_RESOLVED_RENEWAL_ATTACHMENT,
    createGmailClient: (subject): RenewalDraftGmailClient => ({
      subject,
      createDraft,
      findDraftByRfcMessageId: findDraft,
    }),
    actor,
    resolveCopyTemplate: (channel) => approvedCopy[channel],
    seams: s20Seams(db),
  };
  return { d, createDraft, findDraft, db };
}

type Confirmation = { executionId: string; previewHash: string };

const tenantInput = (confirm?: Confirmation): RenewalNoticeDraftInput => ({
  mailbox: MAILBOX,
  request: {
    leaseId: "42",
    ...(confirm ? { confirm } : {}),
    offer: {
      channel: "tenant",
      ownerDecision: "increase",
      offeredRent: 1550,
    },
  },
});

const ownerInput = (confirm?: Confirmation): RenewalNoticeDraftInput => ({
  mailbox: MAILBOX,
  request: {
    leaseId: "42",
    ...(confirm ? { confirm } : {}),
    offer: {
      channel: "owner",
      market: {
        specificNumber: 1550,
        rangeLow: 1450,
        rangeHigh: 1650,
      },
    },
  },
});

describe("prepareRenewalNoticeDraft", () => {
  it("renders current production wording as review-only and creates no execution or Gmail draft", async () => {
    const { d, createDraft, db } = deps(tenantLease);
    delete d.resolveCopyTemplate;

    const outcome = await prepareRenewalNoticeDraft(d, tenantInput());

    expect(outcome).toMatchObject({
      status: "review_only",
      channel: "tenant",
      template: { status: "review_only", ref: "tenant-renewal:v1.0" },
    });
    if (outcome.status !== "review_only") return;
    expect(outcome.body).toContain("$1,550");
    expect(outcome.reasons.join(" ")).toMatch(/client-approved wording/i);
    expect(createDraft).not.toHaveBeenCalled();
    expect([...db.store.keys()].some((key) => key.includes("external_action"))).toBe(
      false,
    );
  });

  it("previews a tenant draft from live facts + operator offer without touching Gmail", async () => {
    const { d, createDraft } = deps(tenantLease);
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput());

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.recipient).toEqual({
      to: "tenant42@northend-apts.com",
      sourceRef: "rentvine:lease:42:tenants[0].email",
    });
    expect(outcome.subject.length).toBeGreaterThan(0);
    expect(outcome.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("creates a real unsent tenant draft only for a prepared, exactly-confirmed execution", async () => {
    const { d, createDraft } = deps(tenantLease);
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    expect(prepared.status).toBe("preview");
    if (prepared.status !== "preview") return;
    expect(createDraft).not.toHaveBeenCalled();

    const outcome = await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );

    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    expect(outcome.draftId).toBe("draft-svc-1");
    expect(outcome.recipient.to).toBe("tenant42@northend-apts.com");
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ to: "tenant42@northend-apts.com" }),
    );
  });

  it("rejects exact confirmation when a locked decision fact changes without changing visible prose", async () => {
    const { d, createDraft } = deps(tenantLease);
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    if (prepared.status !== "preview") throw new Error("Expected preview.");

    await expect(
      prepareRenewalNoticeDraft(d, {
        ...tenantInput({
          executionId: prepared.executionId,
          previewHash: prepared.previewHash,
        }),
        request: {
          ...tenantInput({
            executionId: prepared.executionId,
            previewHash: prepared.previewHash,
          }).request,
          offer: {
            channel: "tenant",
            ownerDecision: "custom",
            offeredRent: 1550,
          },
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("blocks an exact confirmation when the template is no longer client-approved", async () => {
    const { d, createDraft } = deps(tenantLease);
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    expect(prepared.status).toBe("preview");
    if (prepared.status !== "preview") return;

    delete d.resolveCopyTemplate;
    const outcome = await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );

    expect(outcome).toMatchObject({ status: "review_only", channel: "tenant" });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("reconciles one uncertain attempt by exact Message-ID without drafting again", async () => {
    const { d, createDraft, findDraft } = deps(tenantLease, {
      createDraft: async () => {
        throw new Error("gmail timeout");
      },
      findDraft: async () => ({ draftId: "draft-recovered-1" }),
    });
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    expect(prepared.status).toBe("preview");
    if (prepared.status !== "preview") return;

    const uncertain = await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );
    expect(uncertain).toMatchObject({
      status: "needs_reconciliation",
      executionId: prepared.executionId,
    });

    const reconciled = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        reconcile: { executionId: prepared.executionId },
      },
    });

    expect(reconciled).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      executionId: prepared.executionId,
      draftId: "draft-recovered-1",
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).toHaveBeenCalledWith(expect.stringMatching(/^<gmail-draft-/));

    const repeated = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        reconcile: { executionId: prepared.executionId },
      },
    });
    expect(repeated).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      duplicate: true,
      executionId: prepared.executionId,
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps read-only reconciliation available after copy publication closes", async () => {
    const { d, createDraft, findDraft } = deps(tenantLease, {
      createDraft: async () => {
        throw new Error("gmail timeout");
      },
      findDraft: async () => ({ draftId: "draft-recovered-after-close" }),
    });
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    if (prepared.status !== "preview") throw new Error("Expected preview.");
    await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );

    delete d.resolveCopyTemplate;
    const reconciled = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        reconcile: { executionId: prepared.executionId },
      },
    });

    expect(reconciled).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      draftId: "draft-recovered-after-close",
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps a not-found exact attempt unresolved and never creates a second draft", async () => {
    const { d, createDraft, findDraft } = deps(tenantLease, {
      createDraft: async () => {
        throw new Error("gmail timeout");
      },
      findDraft: async () => null,
    });
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    if (prepared.status !== "preview") throw new Error("Expected preview.");
    await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );

    const checked = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        reconcile: { executionId: prepared.executionId },
      },
    });

    expect(checked).toMatchObject({
      status: "reconciliation",
      resolution: "not_found",
      executionId: prepared.executionId,
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).toHaveBeenCalledTimes(1);
  });

  it("returns needs-review when the retained offer no longer matches the consumed attempt", async () => {
    const { d, createDraft, findDraft } = deps(tenantLease, {
      createDraft: async () => {
        throw new Error("gmail timeout");
      },
      findDraft: async () => ({ draftId: "must-not-read" }),
    });
    const prepared = await prepareRenewalNoticeDraft(d, tenantInput());
    if (prepared.status !== "preview") throw new Error("Expected preview.");
    await prepareRenewalNoticeDraft(
      d,
      tenantInput({
        executionId: prepared.executionId,
        previewHash: prepared.previewHash,
      }),
    );

    const checked = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        offer: {
          channel: "tenant",
          ownerDecision: "increase",
          offeredRent: 1600,
        },
        reconcile: { executionId: prepared.executionId },
      },
    });

    expect(checked).toMatchObject({
      status: "reconciliation",
      resolution: "needs_review",
      executionId: prepared.executionId,
    });
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(findDraft).not.toHaveBeenCalled();
  });

  it("previews an owner draft from the joined property.owner email", async () => {
    const { d } = deps(ownerLease);
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput());

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.recipient.to).toBe("owner42@cedar-holdings.com");
    expect(outcome.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
  });

  it("fails closed when no canonical current-rent reconciliation is supplied", async () => {
    const { d, createDraft } = deps(ownerLease);
    delete d.loadOwnerCurrentRentDecision;

    const outcome = await prepareRenewalNoticeDraft(d, ownerInput());

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/current rent confirmation/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("throws 404 when the lease is not in the live read", async () => {
    const { d, createDraft } = deps(null);
    await expect(prepareRenewalNoticeDraft(d, tenantInput())).rejects.toBeInstanceOf(
      EditableLayerError,
    );
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("blocks (never invents) when the recipient email is absent", async () => {
    const { d, createDraft } = deps({
      leaseID: 42,
      endDate: "2026-09-30",
      currentRent: 1400,
      tenants: [{ name: "Ada Rowan" }],
    });
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput());

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/needs verification/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("blocks with a lease-fact reason when the lease end date is missing", async () => {
    const { d } = deps({
      leaseID: 42,
      currentRent: 1400,
      tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
    });
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput());

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/lease end date was not found/i);
  });

  it("blocks an owner draft when current rent is missing from the lease", async () => {
    const { d } = deps({
      leaseID: 42,
      endDate: "2026-09-30",
      tenants: [{ name: "Ada Rowan" }],
      property: {
        streetName: "200 Cedar Ct",
        owner: { email: "owner42@cedar-holdings.com" },
      },
    });
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput());

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/current rent was not found/i);
  });

  it("composes an owner draft even when the lease has no resolvable tenant name", async () => {
    // Owner-channel facts (address + rent) must not be gated on tenant-name resolution.
    const { d } = deps({
      leaseID: 42,
      endDate: "2026-09-30",
      currentRent: "1400.00",
      tenants: [{ email: "resident-only@x.com" }], // no name / firstName / lastName
      property: {
        streetName: "200 Cedar Ct",
        owner: { email: "owner42@cedar-holdings.com" },
      },
    });
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput());

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.recipient.to).toBe("owner42@cedar-holdings.com");
    expect(outcome.subject).toContain("200 Cedar Ct");
  });

  it("blocks a tenant draft with a non-positive offered rent (never composes a $0 offer)", async () => {
    const { d, createDraft } = deps(tenantLease);
    const outcome = await prepareRenewalNoticeDraft(d, {
      ...tenantInput(),
      request: {
        ...tenantInput().request,
        offer: {
          channel: "tenant",
          ownerDecision: "increase",
          offeredRent: 0,
        },
      },
    });

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/greater than zero/i);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("sanitizes a CR/LF in the property address so it never reaches the Subject", async () => {
    const { d } = deps({
      leaseID: 42,
      endDate: "2026-09-30",
      currentRent: 1400,
      tenants: [{ name: "Ada Rowan" }],
      property: {
        streetName: "200 Cedar Ct\r\nInjected: header",
        owner: { email: "owner42@cedar-holdings.com" },
      },
    });
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput());

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.subject).not.toMatch(/[\r\n]/);
    expect(outcome.subject).toContain("200 Cedar Ct Injected: header");
  });
});
