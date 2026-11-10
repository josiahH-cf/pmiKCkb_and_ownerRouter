// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import {
  PACKET_INPUTS_REQUEST_EVENT,
  PacketInputsEditor,
} from "@/components/lease-renewal/PacketInputsEditor";
import { PacketNextStep } from "@/components/lease-renewal/PacketNextStep";
import { mapHashOf } from "@/lib/lease-documents/artifact-intake";
import {
  ArtifactIntakeEntrySchema,
  emptyArtifactIntakeManifest,
  type ArtifactFieldMap,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  FAMILY_NOT_USED_REASON,
  evaluateRenewalPacket,
} from "@/lib/lease-documents/evaluate-packet";
import { nextFamilyUseRecord, resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  projectLeasePacketReadiness,
  projectPacketContextReadiness,
  projectPacketLead,
  type LeasePacketFamilyRow,
  type OfferPacketChargeComparison,
} from "@/lib/lease-documents/lease-packet-readiness";
import { buildPacketInputsView } from "@/lib/lease-documents/packet-inputs-view";
import type {
  LeaseArtifactKind,
  PacketEvaluationInput,
} from "@/lib/lease-documents/packet-types";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

// S268 R-S268-1 / AC-S268-1 and the shared-charge hold: the first reviewed case's forms are bound
// to their exact approved original and map version. A stale map, a changed original or a
// competing version holds only that family; every other family keeps its readiness and the manual
// handoff. Documents and signatures leads with the first packet input or the exact Source pending
// handoff naming the form, the missing evidence and the responsible role. Synthetic only: no
// approved original, map, policy or lease value is used, and nothing is prepared or sent.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const AT = "2026-11-10T15:00:00.000Z";
const familyUse = { readable: true, families: resolveFamilyUse(null, AT) };
const id = (kind: string) => `fixture-${kind.replaceAll("_", "-")}-v1`;

/** The reviewed case: the S66 fixture with each catalog form bound to its own publication. */
function reviewedCase(): PacketEvaluationInput {
  const input = readyS66Input();
  input.catalog.artifacts = input.catalog.artifacts.map((artifact) => ({
    ...artifact,
    version: id(artifact.kind),
    publicationSource: {
      ...artifact.publicationSource,
      reference: `publication:${id(artifact.kind)}`,
    },
  }));
  return input;
}

function fieldMap(kind: LeaseArtifactKind, templateVersion: string): ArtifactFieldMap {
  return {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: kind,
    mapVersion: `${id(kind)}-map`,
    templateVersion,
    formFamily: "fixture-standard-family",
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      {
        fieldId: "Rent",
        factKey: "lease.monthly_rent_cents",
        meaning: "SYNTHETIC monthly rent",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["rentvine"],
      },
    ],
    signers: [
      {
        signerRole: "tenant",
        participantKind: "tenant",
        required: true,
        location: "Tenant signature",
      },
    ],
    reviewNote: "SYNTHETIC review",
  };
}

/** An approved intake entry exactly as the reviewed case's catalog holds it. */
function approved(
  input: PacketEvaluationInput,
  kind: LeaseArtifactKind,
  overrides: {
    templateVersion?: string;
    reviewedHash?: string;
    mapHash?: string;
    publicationHash?: string;
  } = {},
): ArtifactIntakeEntry {
  const artifact = input.catalog.artifacts.find((entry) => entry.kind === kind)!;
  const reference = `publication:${id(kind)}`;
  const contentHash = overrides.publicationHash ?? artifact.contentHash;
  const map = fieldMap(kind, overrides.templateVersion ?? reference);
  return ArtifactIntakeEntrySchema.parse({
    id: kind,
    kind,
    state: "approved",
    revision: 3,
    publication: { system: "s21_publication", reference, contentHash },
    classification: {
      format: "static_pdf",
      contentHash: overrides.reviewedHash ?? contentHash,
      byteSize: 1024,
      detectedMimeType: "application/pdf",
      hasAcroForm: false,
      hasXfa: false,
      hasEmbeddedScript: false,
      hasEmbeddedFiles: false,
      approximatePages: 2,
      reasons: ["SYNTHETIC static form"],
    },
    providerBindings: { dotloopDocumentRef: `fixture-document-ref-${kind}` },
    fieldMap: map,
    mapHash: overrides.mapHash ?? mapHashOf(map),
    updated_at: AT,
  });
}

function manifestWith(...entries: ArtifactIntakeEntry[]): ArtifactIntakeManifest {
  const manifest = emptyArtifactIntakeManifest();
  return {
    ...manifest,
    entries: {
      ...manifest.entries,
      ...Object.fromEntries(entries.map((entry) => [entry.kind, entry])),
    },
  };
}

function rows(
  input: PacketEvaluationInput,
  manifest: ArtifactIntakeManifest,
  offerComparisons?: readonly OfferPacketChargeComparison[],
) {
  return projectLeasePacketReadiness({
    manifest,
    evaluation: evaluateRenewalPacket(input),
    familyUse,
    ...(offerComparisons ? { offerComparisons } : {}),
  });
}
const row = (list: readonly LeasePacketFamilyRow[], kind: string) =>
  list.find((entry) => entry.kind === kind)!;
const unrelated = (list: readonly LeasePacketFamilyRow[]) =>
  list
    .filter((entry) => entry.kind !== "renewal_extension")
    .map(({ kind, applicability, missing, original, map }) => ({
      kind,
      applicability,
      missing,
      original,
      map,
    }));

describe("AC-S268-1: per-family applicability and version binding for the reviewed case", () => {
  it("names each family as required, conditional or not used, with why", () => {
    const input = reviewedCase();
    const notUsed = nextFamilyUseRecord(
      null,
      {
        kind: "kcrar_additional_disclosures",
        use: "not_used",
        expectedVersion: 0,
        operationId: crypto.randomUUID(),
      },
      "fixture-admin",
      AT,
    );
    const uses = resolveFamilyUse(notUsed, AT);
    // The approved configuration lists every family with its recorded use.
    input.catalog = {
      ...input.catalog,
      requirements: [...LEASE_ARTIFACT_FAMILIES],
      familyUse: uses,
    };
    const list = projectLeasePacketReadiness({
      manifest: manifestWith(approved(input, "renewal_extension")),
      evaluation: evaluateRenewalPacket(input),
      familyUse: { readable: true, families: uses },
    });
    const extension = row(list, "renewal_extension");
    expect(extension).toMatchObject({
      applicability: "Applies to this lease",
      missing: [],
      pending: [],
    });
    expect(extension.applicabilityReason).toMatch(/\S/);
    expect(extension.original).toBe(
      `Approved original publication:${id("renewal_extension")} · ${input.catalog.artifacts
        .find((entry) => entry.kind === "renewal_extension")!
        .contentHash.slice(0, 12)}`,
    );
    expect(extension.map).toMatch(/^Reviewed map fixture-renewal-extension-v1-map · /);
    // A conditional form that does not apply says why, and asks for nothing.
    const lead = row(list, "lead_disclosure");
    expect(lead.applicability).toBe("Does not apply to this lease");
    expect(lead.applicabilityReason).toMatch(/\S/);
    expect(lead.missing).toEqual([]);
    // A form of another packet says which packet it is not part of.
    expect(row(list, "standard_lease").applicabilityReason).toBe(
      "This form is not part of a renewal extension packet.",
    );
    // A form the approved configuration does not use says so.
    expect(row(list, "kcrar_additional_disclosures")).toMatchObject({
      applicability: "Not used",
      applicabilityReason: FAMILY_NOT_USED_REASON,
      missing: [],
    });
  });

  it("never shows a map reviewed for a different original as approved, and holds only that family", () => {
    const input = reviewedCase();
    const clean = rows(input, manifestWith(approved(input, "renewal_extension")));
    const stale = rows(
      input,
      manifestWith(
        approved(input, "renewal_extension", {
          templateVersion: "publication:fixture-renewal-extension-v0",
        }),
      ),
    );
    const extension = row(stale, "renewal_extension");
    expect(extension.map).toBe(
      "Map fixture-renewal-extension-v1-map was reviewed for publication:fixture-renewal-extension-v0, not this original",
    );
    expect(extension.map).not.toMatch(/^Reviewed map/);
    expect(extension.missing).toEqual([
      "A field and signer map reviewed for the current original (engineering prepares; document approver reviews meaning)",
    ]);
    expect(unrelated(stale)).toEqual(unrelated(clean));
  });

  it("holds only the family whose original changed after review or whose map hash no longer matches", () => {
    const input = reviewedCase();
    const clean = rows(input, manifestWith(approved(input, "renewal_extension")));
    const changed = rows(
      input,
      manifestWith(
        approved(input, "renewal_extension", { reviewedHash: "c".repeat(64) }),
      ),
    );
    const extension = row(changed, "renewal_extension");
    expect(extension.original).toBe(
      `Original publication:${id("renewal_extension")} changed after it was reviewed; it is not approved as it is now`,
    );
    expect(extension.missing).toContain(
      "The approved original, reviewed again for its current file (client document approver)",
    );
    expect(unrelated(changed)).toEqual(unrelated(clean));

    const remapped = row(
      rows(
        input,
        manifestWith(approved(input, "renewal_extension", { mapHash: "d".repeat(64) })),
      ),
      "renewal_extension",
    );
    expect(remapped.map).toBe(
      "Map fixture-renewal-extension-v1-map changed after it was reviewed",
    );
    expect(remapped.missing).toContain(
      "The field and signer map, reviewed again after it changed (engineering prepares; document approver reviews meaning)",
    );
  });

  it("holds only the family whose packet catalog names a competing version", () => {
    const input = reviewedCase();
    const clean = rows(input, manifestWith(approved(input, "renewal_extension")));
    const competing = rows(
      input,
      manifestWith(
        approved(input, "renewal_extension", { publicationHash: "e".repeat(64) }),
      ),
    );
    const extension = row(competing, "renewal_extension");
    expect(extension.missing).toContain(
      "One approved version of this form: the packet catalog and the approved original name different versions (Admin)",
    );
    expect(extension.applicability).toBe("Applies to this lease");
    expect(unrelated(competing)).toEqual(unrelated(clean));
  });

  it("asks for the absent original and map (preservation) and clears a version issue on the next read", () => {
    const input = reviewedCase();
    expect(
      row(rows(input, emptyArtifactIntakeManifest()), "renewal_extension").missing,
    ).toEqual([
      "The approved original (client document approver)",
      "A field and signer map (engineering prepares; document approver reviews meaning)",
    ]);
    // A source refresh recomputes from the read it is given; nothing is cached between reads.
    const before = rows(
      input,
      manifestWith(
        approved(input, "renewal_extension", { reviewedHash: "c".repeat(64) }),
      ),
    );
    const after = rows(input, manifestWith(approved(input, "renewal_extension")));
    expect(row(before, "renewal_extension").missing).not.toEqual([]);
    expect(row(after, "renewal_extension").missing).toEqual([]);
  });
});

describe("AC-S268-2: an accepted charge that differs from the packet holds only the affected family", () => {
  const discrepancy: OfferPacketChargeComparison = {
    family: "renewal_extension",
    state: "discrepancy",
    charge: "Pet rent",
    offer: "$50.00 monthly",
    packet: "$35.00 monthly",
  };

  it("names the exact discrepancy on that family alone", () => {
    const input = reviewedCase();
    const manifest = manifestWith(approved(input, "renewal_extension"));
    const clean = rows(input, manifest);
    const held = rows(input, manifest, [discrepancy]);
    expect(row(held, "renewal_extension").missing).toEqual([
      "Pet rent: the accepted offer has $50.00 monthly and this form's packet has $35.00 monthly. This form waits until they match (renewal staff, in Review offer charges)",
    ]);
    expect(row(held, "renewal_extension").pending).toEqual([
      expect.objectContaining({ kind: "hold" }),
    ]);
    expect(unrelated(held)).toEqual(unrelated(clean));
    expect(projectPacketLead({ rows: held, context: null })).toEqual({
      kind: "hold",
      form: row(held, "renewal_extension").label,
      reason:
        "Pet rent: the accepted offer has $50.00 monthly and this form's packet has $35.00 monthly. This form waits until they match.",
    });
  });

  it("holds nothing for a matching comparison or a family the packet does not use", () => {
    const input = reviewedCase();
    const manifest = manifestWith(approved(input, "renewal_extension"));
    const clean = rows(input, manifest);
    expect(rows(input, manifest, [{ ...discrepancy, state: "match" }])).toEqual(clean);
    expect(
      rows(input, manifest, [{ ...discrepancy, family: "lead_disclosure" }]),
    ).toEqual(clean);
  });
});

describe("AC-S268-1: Documents and signatures leads with the first input or the exact handoff", () => {
  it("leads with the exact Source pending handoff, with no disclosure to open and versions still visible", () => {
    const input = reviewedCase();
    const list = rows(
      input,
      manifestWith(
        approved(input, "renewal_extension", {
          templateVersion: "publication:fixture-renewal-extension-v0",
        }),
      ),
    );
    const lead = projectPacketLead({ rows: list, context: null });
    expect(lead).toEqual({
      kind: "source_pending",
      form: row(list, "renewal_extension").label,
      evidence: "A field and signer map reviewed for the current original",
      role: "engineering prepares; document approver reviews meaning",
      others: 0,
    });
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(
      <>
        <PacketNextStep canEditInputs lead={lead} leaseId="701" />
        <LeasePacketReadiness rows={list} />
      </>,
    );
    const next = screen.getByRole("region", { name: "Next for this packet" });
    expect(next).toHaveTextContent(
      `Source pending: ${row(list, "renewal_extension").label}. Missing: A field and signer map reviewed for the current original. Responsible: engineering prepares; document approver reviews meaning.`,
    );
    expect(next.closest("details")).toBeNull();
    // The source version stays reachable in the family table, and the family is not ready.
    const family = document.querySelector('tr[data-family="renewal_extension"]')!;
    expect(family).toHaveTextContent(`publication:${id("renewal_extension")}`);
    expect(family).not.toHaveTextContent("Nothing missing");
    expect(request).not.toHaveBeenCalled();
  });

  it("leads with the first applicable packet input, which an Editor opens directly", async () => {
    const input = reviewedCase();
    input.facts = input.facts.filter((fact) => fact.fieldKey !== "property.year_built");
    const list = rows(input, manifestWith(approved(input, "renewal_extension")));
    const lead = projectPacketLead({ rows: list, context: null });
    expect(lead).toEqual({
      kind: "packet_input",
      form: row(list, "lead_disclosure").label,
      need: "Year built",
      fieldKey: "property.year_built",
    });
    const heard = vi.fn();
    document.addEventListener(PACKET_INPUTS_REQUEST_EVENT, heard);
    render(<PacketNextStep canEditInputs lead={lead} leaseId="701" />);
    expect(
      screen.getByRole("region", { name: "Next for this packet" }),
    ).toHaveTextContent(
      `Packet input needed: Year built for ${row(list, "lead_disclosure").label}.`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enter it in Packet inputs" }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({
      leaseId: "701",
      fieldKey: "property.year_built",
    });
    document.removeEventListener(PACKET_INPUTS_REQUEST_EVENT, heard);
    cleanup();
    render(<PacketNextStep canEditInputs={false} lead={lead} leaseId="701" />);
    expect(
      screen.queryByRole("button", { name: "Enter it in Packet inputs" }),
    ).toBeNull();
    expect(screen.getByText("An Editor enters it in Packet inputs.")).toBeVisible();
  });

  it("leads with a packet context fact before any form", () => {
    const input = reviewedCase();
    input.facts = input.facts.filter((fact) => fact.fieldKey !== "transaction.type");
    const evaluation = evaluateRenewalPacket(input);
    const context = projectPacketContextReadiness({
      evaluation,
      observedAt: AT,
      savedSnapshot: null,
    });
    const lead = projectPacketLead({
      rows: projectLeasePacketReadiness({
        manifest: manifestWith(approved(input, "renewal_extension")),
        evaluation,
        familyUse,
      }),
      context,
    });
    expect(lead).toEqual({
      kind: "packet_input",
      form: "This packet",
      need: "Transaction",
      fieldKey: "transaction.type",
    });
  });

  it("reads ready only when every applicable form has its source and inputs", () => {
    const input = reviewedCase();
    expect(
      projectPacketLead({
        rows: rows(input, manifestWith(approved(input, "renewal_extension"))),
        context: null,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("opens the existing Packet inputs and focuses the named fact when an Editor asks for it", async () => {
    const view = buildPacketInputsView({
      record: null,
      policy: { readable: true, record: null },
      resolved: null,
    });
    const request = vi.fn(async () => Response.json(view));
    vi.stubGlobal("fetch", request);
    render(<PacketInputsEditor canEdit leaseId="701" />);
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(PACKET_INPUTS_REQUEST_EVENT, {
          detail: { leaseId: "other-lease", fieldKey: "property.year_built" },
        }),
      );
    });
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(PACKET_INPUTS_REQUEST_EVENT, {
          detail: { leaseId: "701", fieldKey: "property.year_built" },
        }),
      );
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const fact = await waitFor(
      () =>
        document.querySelector<HTMLElement>('[data-packet-fact="property.year_built"]')!,
    );
    await waitFor(() => expect(within(fact).getByLabelText("Year built")).toHaveFocus());
    // Opening reads the inputs only; nothing is saved.
    expect(
      request.mock.calls.every(
        (call) => ((call as unknown[])[1] as RequestInit | undefined)?.method !== "POST",
      ),
    ).toBe(true);
  });
});

describe("AC-S268-3: a signing wait shows what is awaited with the returned-document action", () => {
  it("names who still must sign, apart from any prepared file", () => {
    const lead = projectPacketLead({
      rows: [],
      context: null,
      returned: {
        overall: "Partially signed",
        documents: [
          {
            title: "Renewal extension",
            stillMustSign: [
              { name: "Riley Example", capacity: "tenant" },
              { name: "Avery Owner", capacity: "owner" },
            ],
          },
        ],
      },
    });
    expect(lead).toEqual({
      kind: "signing_wait",
      awaiting: ["Riley Example, tenant", "Avery Owner, owner"],
    });
    render(<PacketNextStep canEditInputs lead={lead} leaseId="701" />);
    const next = screen.getByRole("region", { name: "Next for this packet" });
    expect(next).toHaveTextContent(
      "Waiting on signatures: Riley Example, tenant; Avery Owner, owner.",
    );
    expect(
      within(next).getByRole("link", { name: "Record a returned document" }),
    ).toHaveAttribute("href", "#renewal-returned-documents");
    // A prepared or uploaded file is not a signature: it leads with no wait.
    for (const overall of ["Prepared", "Uploaded", "Fully executed"])
      expect(
        projectPacketLead({
          rows: [],
          context: null,
          returned: { overall, documents: [] },
        }).kind,
      ).not.toBe("signing_wait");
  });
});
