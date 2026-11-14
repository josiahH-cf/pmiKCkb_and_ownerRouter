// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { nextFamilyUseRecord, resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  FORM_USE_NEEDS_VERIFICATION_LABEL,
  projectLeasePacketReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

// S235 R-S235-1/2: the read-only per-family readiness for one lease. Synthetic configuration only:
// no approved original, map, policy or lease fact is used or invented.
// S283 R-S283-7: a default's label moves on purpose to "Needs Verification: PMI KC has not
// confirmed this form use." in place of "Engineering default, not yet approved by the client".

afterEach(cleanup);
const AT = "2026-10-28T15:00:00.000Z";
const ENGINEERING_DEFAULT_LABEL = FORM_USE_NEEDS_VERIFICATION_LABEL;

describe("S235 lease packet readiness", () => {
  it("lists every family with a default labeled Needs Verification, never as client policy", () => {
    expect(ENGINEERING_DEFAULT_LABEL).toBe(
      "Needs Verification: PMI KC has not confirmed this form use.",
    );
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: null,
      familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
    });
    expect(rows).toHaveLength(LEASE_ARTIFACT_FAMILIES.length);
    for (const row of rows) {
      expect(row.useSource, row.kind).toBe(ENGINEERING_DEFAULT_LABEL);
      expect(row.catalogSetup, row.kind).toContain(
        "The client's use decision, recorded by an Admin",
      );
      if (row.use !== "Not used") {
        expect(row.applicability, row.kind).toBe("Current applicability unavailable");
        expect(row.original, row.kind).toBe("No approved original received");
        expect(row.missing.join(" "), row.kind).not.toMatch(
          /approved original|field and signer map/,
        );
      }
    }
  });

  it("names a recorded client decision and asks nothing more of a family marked not used", () => {
    const first = LEASE_ARTIFACT_FAMILIES[0].kind;
    const record = nextFamilyUseRecord(
      null,
      {
        kind: first,
        use: "not_used",
        expectedVersion: 0,
        operationId: crypto.randomUUID(),
      },
      "fixture-admin",
      AT,
    );
    const row = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: null,
      familyUse: { readable: true, families: resolveFamilyUse(record, AT) },
    }).find((entry) => entry.kind === first)!;
    expect(row).toMatchObject({
      use: "Not used",
      useSource: "Recorded client decision",
      applicability: "Not used",
      missing: [],
    });
  });

  it("says so when family use cannot be read instead of guessing a use", () => {
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest("unreadable"),
      evaluation: null,
      familyUse: { readable: false, families: [] },
    });
    for (const row of rows) {
      expect(row.use).toBe("Unknown");
      expect(row.useSource).toBe("Configuration could not be read");
      expect(row.missing[0]).toBe("Family use could not be read (Admin)");
    }
  });

  it("follows the execution evaluation for applicability instead of the separately recorded use", () => {
    // A legacy approved catalog without family use still evaluates its required families by rule;
    // the display must agree with that execution path even when the family-use record differs.
    const record = nextFamilyUseRecord(
      null,
      {
        kind: "renewal_extension",
        use: "not_used",
        expectedVersion: 0,
        operationId: crypto.randomUUID(),
      },
      "fixture-admin",
      AT,
    );
    const evaluation = evaluateRenewalPacket(readyS66Input());
    expect(
      evaluation.manifest?.includedArtifacts.map((artifact) => artifact.kind),
    ).toContain("renewal_extension");
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation,
      familyUse: { readable: true, families: resolveFamilyUse(record, AT) },
    });
    const extension = rows.find((row) => row.kind === "renewal_extension")!;
    expect(extension.use).toBe("Not used");
    expect(extension.applicability).toBe("Applies to this lease");
    expect(extension.catalogSetup.join(" ")).toMatch(
      /does not yet apply the recorded use/,
    );
    const reference = rows.find((row) => row.kind === "kcrar_additional_disclosures")!;
    expect(reference.applicability).toBe("Not part of the current packet policy");
    expect(reference.missing).toEqual([]);
  });

  it("agrees with the execution evaluation family by family, with and without approved family use", () => {
    const legacy = readyS66Input();
    const configured = readyS66Input();
    configured.catalog = {
      ...configured.catalog,
      requirements: [...LEASE_ARTIFACT_FAMILIES],
      familyUse: resolveFamilyUse(null, AT),
    };
    for (const input of [legacy, configured]) {
      const evaluation = evaluateRenewalPacket(input);
      const included = new Set(
        evaluation.manifest!.includedArtifacts.map((artifact) => artifact.kind),
      );
      const excluded = new Set(
        evaluation
          .manifest!.excludedArtifacts.filter(
            (artifact) => artifact.ruleResult === "Not applicable",
          )
          .map((artifact) => artifact.kind),
      );
      const rows = projectLeasePacketReadiness({
        manifest: emptyArtifactIntakeManifest(),
        evaluation,
        familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
      });
      expect(included.size).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.applicability === "Applies to this lease", row.kind).toBe(
          included.has(row.kind as never),
        );
        if (excluded.has(row.kind as never))
          expect(["Not used", "Does not apply to this lease"], row.kind).toContain(
            row.applicability,
          );
      }
    }
  });

  it("renders a read-only table with one row per family and no controls", () => {
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: null,
      familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
    });
    render(<LeasePacketReadiness rows={rows} />);
    const region = screen.getByRole("region", { name: "Form families for this lease" });
    expect(within(region).getAllByRole("row")).toHaveLength(rows.length + 1);
    expect(within(region).queryAllByRole("button")).toHaveLength(0);
    expect(region).toHaveTextContent(/nothing here writes one or sends anything/);
    expect(region).toHaveTextContent(ENGINEERING_DEFAULT_LABEL);
  });
});
