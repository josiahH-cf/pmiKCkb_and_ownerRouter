import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { validateExternalReadiness } from "@/lib/external-execution/orchestrator";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  missingValueMarker,
} from "@/lib/lease-renewal/renewal-message-content";
import { applyRefinedBody } from "@/lib/lease-renewal/refined-message";
import { projectMessagePreflight } from "@/lib/lease-renewal/message-preflight";
import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";

// S162: the server preview is the one boundary an unsent-draft request crosses. Business
// completeness, a recorded owner or tenant response, a review checkbox and a policy note no longer
// refuse it; notice safety, the confirmed move-out, exact recipients, the approved publication and
// attempt recovery still do. No Gmail client is constructed and nothing is created. Synthetic values.

const actor: AuthenticatedUser = {
  uid: "sample-op",
  email: "sample.op@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const cycleId = "6c37bdcd-8264-4249-813f-0289307dd725";

function lease() {
  const [view] = leaseViewsFromExport([
    {
      lease: {
        leaseID: 8800,
        tenants: [
          { contactID: 11, firstName: "Jordan", email: "jordan.s@fixture-rental.net" },
          { contactID: 12, firstName: "Riley", email: "riley.s@fixture-rental.net" },
        ],
      },
      property: { streetNumber: "88", streetName: "Sample Row" },
      portfolio: { owners: [{ contactID: 21, email: "avery.o@fixture-rental.net" }] },
      unit: { rent: "1400.00" },
    },
  ]);
  return view!;
}

/** A tenant message with nothing entered: every business value is a marker. */
function markedContent() {
  const composed = composeRenewalMessage({
    channel: "tenant",
    names: ["Jordan Sampleton", "Riley Sampleton"],
    firstNames: ["Jordan", "Riley"],
    address: "88 Sample Row",
    currentBaseRent: null,
    leaseEndDate: null,
    ownerTerms: null,
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: Object.keys(MESSAGE_CHARGES).map((id) => ({
      id: id as keyof typeof MESSAGE_CHARGES,
      applicable: null,
      amount: null,
      cadence: null,
      effectiveDate: null,
      source: null,
      comparison: "unverified" as const,
    })),
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
  });
  return applyRefinedBody(
    composed,
    composed.plainText.replace("Hello Jordan and Riley,", "Hi Jordan and Riley,"),
  );
}

type Current = Parameters<typeof buildSuppliedRenewalDraftPreview>[1];

function current(overrides: Record<string, unknown> = {}): Current {
  return {
    content: markedContent(),
    saved: { revision: 4 },
    workspace: { leaseId: "8800", cycleId, ownerResponse: null, tenantResponse: null },
    publication: {
      status: "approved",
      reason: "",
      ref: "tenant-renewal:v2.0",
      templateId: "sample-template",
      contentHash: "a".repeat(64),
    },
    draftJournalAvailable: true,
    noticeBlock: null,
    signatureMatchesActor: false,
    lease: lease(),
    basis: {
      noticeSafety: {
        scopeHash: "b".repeat(64),
        version: 1,
        semanticHash: "c".repeat(64),
      },
      sourceFingerprint: "d".repeat(64),
      workspaceFingerprint: "e".repeat(64),
      resourceFingerprint: "f".repeat(64),
    },
    attachment: null,
    moveOut: { state: "none", label: "No move-out notice" },
    bodyOverride: null,
    policyGates: [
      { field: "policy.rhino", message: "Sample policy note for this lease." },
    ],
    inputs: { edits: { responseRequest: "" } },
    ...overrides,
  } as unknown as Current;
}

function reasons(value: Current) {
  const preview = buildSuppliedRenewalDraftPreview(actor, value);
  expect(preview.status).toBe("blocked");
  return preview.status === "blocked" ? preview.reasons : [];
}

describe("S162 unsent draft from the displayed message", () => {
  it("BEH-S162-4, BEH-S162-5, BEH-S162-8, AC-S162-2: a marked message with no recorded response, no review and a policy note previews exactly as displayed", () => {
    const value = current();
    const preview = buildSuppliedRenewalDraftPreview(actor, value);
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("expected a ready preview");
    const displayed = markedContent();
    expect(preview.subject).toBe(displayed.subject);
    // The unsent draft carries the displayed body after the standing review-before-sending line.
    expect(preview.body).toBe(`${DRAFT_BANNER}\n\n${displayed.plainText}`);
    expect(preview.body).toContain("Hi Jordan and Riley,");
    expect(preview.body).toContain(missingValueMarker("renewal rent"));
    expect(preview.body).toContain(missingValueMarker("sender signature"));
    expect(preview.action.actionKey).toBe("gmail.renewal_notice.draft_create");
    expect(preview.action.actionId).toBe(
      `renewal-notice-draft:tenant:8800:cycle:${cycleId}:preparation:4`,
    );
  });

  it("BEH-S162-6, AC-S162-2: the preview carries every tenant as To and Cc and the signed-in mailbox, with no fanout", () => {
    const preview = buildSuppliedRenewalDraftPreview(actor, current());
    if (preview.status !== "ready") throw new Error("expected a ready preview");
    expect(preview.recipient.to).toBe("jordan.s@fixture-rental.net");
    expect(preview.recipient.cc).toEqual(["riley.s@fixture-rental.net"]);
    expect(preview.action.values.from).toBe("sample.op@pmikcmetro.com");
    expect(preview.action.values.to).toBe("jordan.s@fixture-rental.net");
    expect(preview.action.values.cc).toBe("riley.s@fixture-rental.net");
  });

  it("BEH-S162-9, AC-S162-2: an unknown recipient refuses only the draft, and names the person", () => {
    const view = lease();
    delete (view.tenants as Array<Record<string, unknown>>)[1]!.email;
    expect(reasons(current({ lease: view })).join(" ")).toMatch(/no email on file/i);
  });

  it("keeps notice safety, the confirmed move-out, the staff non-renewal decision, the publication and attempt history as refusals of the draft", () => {
    expect(
      reasons(current({ noticeBlock: "Notice approval safety is unavailable." })),
    ).toContain("Notice approval safety is unavailable.");
    expect(
      reasons(
        current({
          basis: {
            noticeSafety: null,
            sourceFingerprint: "d".repeat(64),
            workspaceFingerprint: "e".repeat(64),
            resourceFingerprint: "f".repeat(64),
          },
        }),
      ),
    ).toContain("Current notice approval safety must be verified before drafting.");
    expect(
      reasons(
        current({
          moveOut: {
            state: "initiated",
            label: "Move-out initiated in RentVine: Active - Notice Given.",
          },
        }),
      ),
    ).toContain("Move-out initiated in RentVine: Active - Notice Given.");
    expect(
      reasons(
        current({
          workspace: {
            leaseId: "8800",
            cycleId,
            ownerResponse: { outcome: "declined_non_renewal" },
            tenantResponse: null,
          },
        }),
      ).join(" "),
    ).toMatch(/non-renewal decision/);
    expect(
      reasons(
        current({
          publication: { status: "unavailable", reason: "Publication readback pending." },
        }),
      ),
    ).toContain("Publication readback pending.");
    expect(reasons(current({ draftJournalAvailable: false }))).toContain(
      "Reload the Gmail attempt history before preparing a new draft.",
    );
  });

  it("BEH-S162-7: a message with no saved record is refused honestly instead of drafting something else", () => {
    expect(reasons(current({ saved: null })).join(" ")).toMatch(
      /could not be saved|not saved/i,
    );
    expect(reasons(current({ bodyOverride: { state: "unreadable" } })).join(" ")).toMatch(
      /could not be read/i,
    );
  });
});

describe("S162 preflight is information only", () => {
  it("BEH-S162-5: marked values and an unsigned message leave the draft step available; no cycle or review item exists", () => {
    const readiness = projectMessageReadiness({
      channel: "tenant",
      missing: markedContent().missing,
    });
    const preflight = projectMessagePreflight({
      channel: "tenant",
      canEdit: true,
      senderEmail: "sample.op@pmikcmetro.com",
      signatureOrigin: "none",
      signatureMatchesActor: false,
      readiness,
      recipients: { status: "ready", to: "jordan.s@fixture-rental.net", cc: [] },
      publication: { status: "approved", ref: "tenant-renewal:v2.0" },
      gmailDestination: true,
      draftAttempt: null,
      notices: [],
      loadedAtIso: "2026-10-02T15:00:00.000Z",
    });
    expect(preflight.items.map((item) => item.id)).not.toContain("cycle");
    expect(preflight.items.map((item) => item.id)).not.toContain("review");
    expect(preflight.draftStepAvailable).toBe(true);
    expect(preflight.proceedWithoutGmail).toBe(true);
    expect(preflight.summary).not.toMatch(/cycle/i);
  });

  it("BEH-S162-9: an unresolved recipient or an unapproved publication is local to the draft step", () => {
    const preflight = projectMessagePreflight({
      channel: "tenant",
      canEdit: true,
      senderEmail: "sample.op@pmikcmetro.com",
      signatureOrigin: "none",
      signatureMatchesActor: false,
      readiness: projectMessageReadiness({ channel: "tenant", missing: [] }),
      recipients: { status: "blocked", reasons: ["Tenant 2 has no email on file."] },
      publication: { status: "unpublished", reason: "Publication pending." },
      gmailDestination: true,
      draftAttempt: null,
      notices: [],
      loadedAtIso: "2026-10-02T15:00:00.000Z",
    });
    expect(preflight.draftStepAvailable).toBe(false);
  });
});

describe("S162 governed readiness with fill-in markers", () => {
  it("BEH-S162-8: an unsent draft may carry markers in its own content, while recipients and sends keep refusing them", () => {
    const value = current();
    const preview = buildSuppliedRenewalDraftPreview(actor, value);
    if (preview.status !== "ready") throw new Error("expected a ready preview");
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    expect(String(preview.action.values.body)).toContain("Needs Verification");
    expect(validateExternalReadiness(definition, preview.action)).toBeNull();
    const markedRecipient = {
      ...preview.action,
      values: { ...preview.action.values, to: "Needs Verification: tenant email" },
    };
    expect(validateExternalReadiness(definition, markedRecipient)).toBe(
      "Authoritative values are missing or unverified.",
    );
    const sendDefinition = { ...definition, key: "gmail.renewal_notice.send" };
    expect(
      validateExternalReadiness(sendDefinition, {
        ...preview.action,
        actionKey: "gmail.renewal_notice.send",
      }),
    ).toBe("Authoritative values are missing or unverified.");
  });
});
