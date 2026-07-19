import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  prepareRenewalNoticeDraft,
  type RenewalNoticeDraftDeps,
  type RenewalNoticeDraftInput,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-service";

const MAILBOX = { email: "workflow@pmikcmetro.com", sourceRef: "app:session:u1" };
const READ_TS = "2026-07-19T00:00:00.000Z";

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

function deps(lease: RawLease | null) {
  const createDraft = vi.fn(async () => ({ draftId: "draft-svc-1" }));
  const d: RenewalNoticeDraftDeps = {
    loadLease: async () => lease,
    createGmailClient: (subject): RenewalDraftGmailClient => ({ subject, createDraft }),
  };
  return { d, createDraft };
}

const tenantInput = (
  confirm: boolean,
): Extract<RenewalNoticeDraftInput, { channel: "tenant" }> => ({
  channel: "tenant",
  leaseId: "42",
  mailbox: MAILBOX,
  confirm,
  readTimestamp: READ_TS,
  offer: { ownerDecision: "increase", offeredRent: 1550 },
});

const ownerInput = (
  confirm: boolean,
): Extract<RenewalNoticeDraftInput, { channel: "owner" }> => ({
  channel: "owner",
  leaseId: "42",
  mailbox: MAILBOX,
  confirm,
  readTimestamp: READ_TS,
  offer: {
    market: {
      specificNumber: 1550,
      rangeLow: 1450,
      rangeHigh: 1650,
      compsScreenshotRef: "drive://comps/cedar.png",
    },
  },
});

describe("prepareRenewalNoticeDraft", () => {
  it("previews a tenant draft from live facts + operator offer without touching Gmail", async () => {
    const { d, createDraft } = deps(tenantLease);
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput(false));

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

  it("creates a real unsent tenant draft on confirm", async () => {
    const { d, createDraft } = deps(tenantLease);
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput(true));

    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    expect(outcome.draftId).toBe("draft-svc-1");
    expect(outcome.recipient.to).toBe("tenant42@northend-apts.com");
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ to: "tenant42@northend-apts.com" }),
    );
  });

  it("previews an owner draft from the joined property.owner email", async () => {
    const { d } = deps(ownerLease);
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput(false));

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") return;
    expect(outcome.recipient.to).toBe("owner42@cedar-holdings.com");
    expect(outcome.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
  });

  it("throws 404 when the lease is not in the live read", async () => {
    const { d, createDraft } = deps(null);
    await expect(prepareRenewalNoticeDraft(d, tenantInput(true))).rejects.toBeInstanceOf(
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
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput(true));

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
    const outcome = await prepareRenewalNoticeDraft(d, tenantInput(true));

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
    const outcome = await prepareRenewalNoticeDraft(d, ownerInput(true));

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.reasons.join(" ")).toMatch(/current rent was not found/i);
  });
});
