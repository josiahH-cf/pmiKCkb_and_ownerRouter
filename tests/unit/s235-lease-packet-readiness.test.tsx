// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import { nextFamilyUseRecord, resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  ENGINEERING_DEFAULT_LABEL,
  projectLeasePacketReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";

// S235 R-S235-1/2: the read-only per-family readiness for one lease. Synthetic configuration only:
// no approved original, map, policy or lease fact is used or invented.

afterEach(cleanup);
const AT = "2026-10-28T15:00:00.000Z";

describe("S235 lease packet readiness", () => {
  it("lists every family with an engineering default labeled as not client-approved", () => {
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: null,
      familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
    });
    expect(rows).toHaveLength(LEASE_ARTIFACT_FAMILIES.length);
    for (const row of rows) {
      expect(row.useSource, row.kind).toBe(ENGINEERING_DEFAULT_LABEL);
      expect(row.missing, row.kind).toContain(
        "The client's use decision, recorded by an Admin",
      );
      if (row.use !== "Not used") {
        expect(row.applicability, row.kind).toBe(
          "Not evaluated yet; Evaluate packet records it",
        );
        expect(row.original, row.kind).toBe("No approved original received");
        expect(row.missing, row.kind).toContain(
          "The approved original (client document approver)",
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
