import { expect, it } from "vitest";
import { projectTemplateProcessReadiness } from "@/lib/lease-renewal/template-process-readiness";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import { RenewalResourceInputSchema } from "@/lib/lease-renewal/resource-locations";
const familyUse = {
  readable: true,
  families: resolveFamilyUse(null, "2026-10-20T12:00:00Z"),
};
it("maps each existing form to its contract processes without turning a verified source location into legal approval", () => {
  const rows = projectTemplateProcessReadiness({
    resources: {
      version: 1,
      entries: {
        renewal_extension: {
          id: "renewal_extension",
          url: "https://drive.google.com/file/d/synthetic-source/view",
          verified: true,
          recordedByUid: "fixture-staff",
          recordedAt: "2026-10-20T12:00:00Z",
        },
      },
    },
    manifest: emptyArtifactIntakeManifest(),
    familyUse,
  });
  const extension = rows.find((row) => row.kind === "renewal_extension")!;
  expect(extension.processes).toEqual(["Lease renewal extension"]);
  expect(extension.sourceState).toBe("Staff-verified source link");
  expect(extension.approved).toBe(false);
  expect(extension.preparation).toContain("not received");
  expect(rows.find((row) => row.kind === "standard_lease")!.processes).toEqual([
    "Full lease packet",
  ]);
  expect(rows.find((row) => row.kind === "owner_acknowledgment")!.processes).toEqual([
    "Owner acknowledgment",
  ]);
  for (const kind of [
    "kcrar_additional_disclosures",
    "brokerage_disclosure",
    "insurance_program_addendum",
  ])
    expect(
      RenewalResourceInputSchema.safeParse({ id: kind, url: "", verified: false })
        .success,
    ).toBe(true);
});
it("keeps unreadable source, applicability and form observations unknown rather than treating them as missing or ready", () => {
  const rows = projectTemplateProcessReadiness({
    resources: null,
    manifest: emptyArtifactIntakeManifest("unreadable"),
    familyUse: { ...familyUse, readable: false },
  });
  for (const row of rows) {
    expect(row.approved).toBe(false);
    expect(row.sourceState).toContain("Unknown");
    expect(row.preparation).toContain("Unknown");
    expect(row.applicability).toContain("Unknown");
  }
});
