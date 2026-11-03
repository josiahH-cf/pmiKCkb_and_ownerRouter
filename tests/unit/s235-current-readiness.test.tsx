// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  projectLeasePacketReadiness,
  projectPacketContextReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";
import { projectSelectionFreshness } from "@/lib/lease-documents/packet-selection-freshness";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

afterEach(cleanup);
const AT = "2026-11-03T12:00:00.000Z";
const familyUse = { readable: true, families: resolveFamilyUse(null, AT) };

describe("S235 A03 current output requirements", () => {
  it("asks for no original or map for an excluded city, HOA or other-context family", () => {
    const evaluation = evaluateRenewalPacket(readyS66Input());
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation,
      familyUse,
    });
    for (const kind of ["city_addendum", "hoa_artifact", "standard_lease"]) {
      const row = rows.find((value) => value.kind === kind)!;
      expect(row.applicability, kind).toBe("Does not apply to this lease");
      expect(row.missing.join(" "), kind).not.toMatch(/original|field and signer map/i);
    }
    expect(rows.find((value) => value.kind === "renewal_extension")?.missing).toContain(
      "The approved original (client document approver)",
    );
  });

  it("names the exact undecided property fact before asking for conditional material", () => {
    const input = readyS66Input();
    input.facts = input.facts.filter((fact) => fact.fieldKey !== "property.year_built");
    const row = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: evaluateRenewalPacket(input),
      familyUse,
    }).find((value) => value.kind === "lead_disclosure")!;
    expect(row.missing.join(" ")).toContain("property.year_built");
    expect(row.missing.join(" ")).not.toMatch(/approved original|field and signer map/i);
  });

  it("renders current context/basis without a saved snapshot or a save control", () => {
    const context = {
      state: "current" as const,
      label: "Renewal extension",
      observedAt: AT,
      basis: ["management.origin: pmi_managed · executed_lease:fixture · v2"],
      missing: [],
      saved: "No saved packet snapshot; this current view writes nothing.",
    };
    const props = { rows: [], context };
    render(<LeasePacketReadiness {...props} />);
    expect(screen.getByText("Renewal extension")).toBeVisible();
    expect(screen.getByText(/management.origin: pmi_managed/)).toBeVisible();
    expect(screen.getByText(/No saved packet snapshot/)).toBeVisible();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps a saved extension separate when current facts now require a full lease", () => {
    const saved = {
      ...evaluateRenewalPacket(readyS66Input()),
      snapshotId: "fixture-old",
      createdAt: AT,
    };
    const current = readyS66Input();
    current.facts = current.facts.map((fact) =>
      fact.fieldKey === "management.origin"
        ? { ...fact, normalizedValue: "inherited" }
        : fact,
    );
    const result = projectPacketContextReadiness({
      evaluation: evaluateRenewalPacket(current),
      observedAt: AT,
      savedSnapshot: saved as never,
    });
    expect(result.label).toBe("Full lease packet");
    expect(result.basis.join(" ")).toContain("management.origin: inherited");
    expect(result.saved).toMatch(/fixture-old.*retained separately/);
    const failed = projectPacketContextReadiness({
      evaluation: null,
      observedAt: null,
      savedSnapshot: saved as never,
    });
    expect(failed.state).toBe("unavailable");
    expect(failed.label).not.toBe("Renewal extension");
    expect(failed.saved).toMatch(/has not been reverified/);
  });

  it("does not call approved intake current when its active publication is unavailable", () => {
    const input = readyS66Input();
    input.catalog.artifacts = input.catalog.artifacts.map((artifact) =>
      artifact.kind === "renewal_extension"
        ? { ...artifact, status: "inactive" }
        : artifact,
    );
    const manifest = emptyArtifactIntakeManifest();
    const approved = {
      ...manifest,
      entries: {
        ...manifest.entries,
        renewal_extension: {
          state: "approved",
          publication: {
            reference: "publication:fixture-original",
            contentHash: "a".repeat(64),
          },
          fieldMap: { mapVersion: "fixture-map", audience: "tenant", fields: [] },
        },
      },
    };
    const row = projectLeasePacketReadiness({
      manifest: approved as never,
      evaluation: evaluateRenewalPacket(input),
      familyUse,
    }).find((entry) => entry.kind === "renewal_extension")!;
    expect(row.missing.join(" ")).toMatch(/publication|artifact unavailable/i);
  });
});

const settings = {
  version: 1,
  profileId: "fixture-profile",
  profileLabel: "Fixture office profile",
  templateId: "fixture-template",
  templateLabel: "Fixture renewal",
  transactionType: "LEASE_OFFER" as const,
  initialStatus: "PRE_OFFER",
  recordedAtIso: AT,
  recordedByUid: "fixture-admin",
};
const observed = {
  generationId: "fixture-generation",
  observedAt: AT,
  accountOk: true,
  accountEmail: "integrations@pmikcmetro.com",
  profilesOk: true,
  profiles: [{ id: settings.profileId, name: settings.profileLabel, type: "INDIVIDUAL" }],
  templates: [
    {
      profileId: settings.profileId,
      ok: true,
      templates: [
        {
          id: settings.templateId,
          name: settings.templateLabel,
          transactionType: "LEASE_OFFER",
        },
      ],
    },
  ],
  subscriptionsReadable: null,
  failures: [],
};
function freshness(overrides: Record<string, unknown> = {}) {
  return projectSelectionFreshness({
    settings,
    settingsReadable: true,
    observation: observed,
    observationReadable: true,
    connection: {
      readable: true,
      status: "connected",
      generationId: observed.generationId,
    },
    nowIso: AT,
    ...overrides,
  });
}

describe("S235 A03 selection evidence qualification", () => {
  it("rejects future and invalid observation time even when resource ids match", () => {
    expect(
      freshness({
        observation: { ...observed, observedAt: "2026-11-04T12:00:00.000Z" },
      }).problems.join(" "),
    ).toMatch(/future/i);
    expect(
      freshness({ observation: { ...observed, observedAt: "not-a-date" } }).problems.join(
        " ",
      ),
    ).toMatch(/unreadable|invalid/i);
  });

  it.each([
    [
      { readable: true, status: "connected", generationId: "other-generation" },
      /generation/i,
    ],
    [
      { readable: true, status: "revoked", generationId: observed.generationId },
      /connected|revoked/i,
    ],
    [{ readable: false, status: null, generationId: null }, /connection.*read/i],
  ])("does not rely on a different/unavailable connection: %j", (connection, reason) => {
    expect(freshness({ connection }).problems.join(" ")).toMatch(reason);
  });

  it("requires the approved provider account and a successful account read", () => {
    expect(
      freshness({
        observation: { ...observed, accountEmail: "other@pmikcmetro.com" },
      }).problems.join(" "),
    ).toMatch(/integrations@pmikcmetro.com/);
    expect(
      freshness({ observation: { ...observed, accountOk: false } }).problems.join(" "),
    ).toMatch(/read.*account|account.*read/i);
    expect(freshness().problems).toEqual([]);
  });
});
