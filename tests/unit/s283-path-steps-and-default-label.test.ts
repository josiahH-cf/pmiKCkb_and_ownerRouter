import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  FORM_USE_NEEDS_VERIFICATION_LABEL,
  projectLeasePacketReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";
import {
  STEP_NOT_USED_LABEL,
  UNUSED_STEP_LINK_LINE,
  renewalPathLine,
} from "@/lib/lease-renewal/renewal-path";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import { projectTemplateProcessReadiness } from "@/lib/lease-renewal/template-process-readiness";

// S283 R-S283-7, BEH-S283-8 and AC-S283-8: the step list shows only the steps on this lease's
// path, the path line names why a standard step is absent, the chip "Not part of this lease's path"
// is retired everywhere, and a form family or rule still on its default reads "Needs Verification:
// PMI KC has not confirmed this form use." A default still holds nothing by itself. Synthetic
// leases only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const AT = "2026-11-13T15:00:00.000Z";
const RETIRED_CHIP = "Not part of this lease's path";
const RETIRED_DEFAULT = "Engineering default, not yet approved by the client";

const BASE: RenewalStageContext = {
  leaseId: "4801",
  staffRecordUnavailable: false,
  standingAgreement: null,
  housingAssistance: null,
  numbers: { verified: true, openDifferences: 0 },
  term: { monthToMonth: false, reviewNeeded: false },
  moveOutInitiated: false,
  sourceRenewal: null,
  verification: null,
  handStatus: null,
  lastContactAtIso: null,
  threadCheck: null,
  outreach: null,
};

/** The step list as the Guided strip shows it: the steps on this lease's path. */
function listed(stage: ReturnType<typeof projectRenewalStage>) {
  return stage.steps
    .filter((step) => step.state !== "not_part" && step.state !== "covered")
    .map((step) => step.id);
}

describe("BEH-S283-8 each path variant shows only its steps and a path line that says why", () => {
  it("BEH-S283-8 a standing agreement lease shows no owner step and says why", () => {
    const stage = projectRenewalStage(
      null,
      {
        ...BASE,
        standingAgreement: {
          label: "Example Standing Agreement",
          reason: "Covered by Example Standing Agreement: no owner message needed",
        },
      },
      { standingCovered: true },
    );
    expect(listed(stage)).not.toContain("ask-owner");
    expect(renewalPathLine(stage.steps)).toBe(
      "Standing agreement: the owner step is skipped.",
    );
  });

  it("AC-S283-8 a housing assistance lease names the steps it skips until a change is proposed", () => {
    const stage = projectRenewalStage(null, {
      ...BASE,
      housingAssistance: { program: "Example Housing Office" },
    });
    expect(listed(stage)).not.toContain("compare-market");
    expect(listed(stage)).not.toContain("ask-owner");
    expect(renewalPathLine(stage.steps)).toMatch(/^Housing assistance: /);
  });

  it("AC-S283-8 a RentVine move-out notice names the handoff that replaces the later steps", () => {
    const stage = projectRenewalStage(null, { ...BASE, moveOutInitiated: true });
    expect(listed(stage)).toEqual(
      expect.arrayContaining(["check-numbers", "non-renewal-handoff", "complete"]),
    );
    for (const id of ["offer-tenant", "documents", "finish-up"])
      expect(listed(stage)).not.toContain(id);
    expect(renewalPathLine(stage.steps)).toMatch(/^Move-out notice in RentVine: /);
  });

  it("AC-S283-8 a month-to-month lease adds its review step and needs no path line", () => {
    const stage = projectRenewalStage(null, {
      ...BASE,
      term: { monthToMonth: true, reviewNeeded: true },
    });
    expect(listed(stage)[0]).toBe("month-to-month-review");
    expect(renewalPathLine(stage.steps)).toBeNull();
  });

  it("AC-S283-8 a standard lease lists all seven standard steps and needs no path line", () => {
    const stage = projectRenewalStage(null, BASE);
    expect(listed(stage)).toHaveLength(7);
    expect(renewalPathLine(stage.steps)).toBeNull();
  });

  it("R-S283-7 a not-used step and an unused link read in staff words", () => {
    expect(STEP_NOT_USED_LABEL).toBe("This lease does not use this step");
    expect(UNUSED_STEP_LINK_LINE).toBe(
      "This lease does not use that step. Showing the current step.",
    );
  });
});

describe("AC-S283-8 the retired chip text appears nowhere in the app's own source", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("AC-S283-8 no component or library renders the retired chip", () => {
    const offenders = [
      ...sources(join(process.cwd(), "components")),
      ...sources(join(process.cwd(), "lib/lease-renewal")),
    ].filter((path) => readFileSync(path, "utf8").includes(RETIRED_CHIP));
    expect(offenders).toEqual([]);
  });

  it("AC-S283-8 the Guided strip and the Focus pane leave unused steps out", () => {
    const guided = readFileSync(
      join(process.cwd(), "components/lease-renewal/RenewalGuidedView.tsx"),
      "utf8",
    );
    expect(guided).toMatch(/pathSteps\.map\(\(step\)/);
    expect(guided).toContain("renewalPathLine(stage.steps)");
    const focus = readFileSync(
      join(process.cwd(), "components/lease-renewal/RenewalFocusViewPane.tsx"),
      "utf8",
    );
    expect(focus).not.toMatch(/status: "not_applicable", label:/);
  });
});

describe("BEH-S283-8 a default reads Needs Verification in packet and process readiness", () => {
  const familyUse = { readable: true, families: resolveFamilyUse(null, AT) };

  it("BEH-S283-8 Documents shows the Needs Verification line where the engineering label was", () => {
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: null,
      familyUse,
    });
    expect(FORM_USE_NEEDS_VERIFICATION_LABEL).toBe(
      "Needs Verification: PMI KC has not confirmed this form use.",
    );
    for (const row of rows) {
      expect(row.useSource, row.kind).toBe(FORM_USE_NEEDS_VERIFICATION_LABEL);
      expect(JSON.stringify(row)).not.toContain(RETIRED_DEFAULT);
    }
  });

  it("AC-S283-8 the process readiness view uses the same line, and a default holds nothing by itself", () => {
    const rows = projectTemplateProcessReadiness({
      resources: null,
      manifest: emptyArtifactIntakeManifest(),
      familyUse,
    });
    for (const row of rows) {
      expect(row.applicabilitySource, row.kind).toBe(FORM_USE_NEEDS_VERIFICATION_LABEL);
      expect(row.approved, row.kind).toBe(false);
    }
  });

  it("AC-S283-8 the Admin form-family field keeps its own hint", () => {
    const admin = readFileSync(
      join(process.cwd(), "components/admin/RenewalPacketPolicyAdminPanel.tsx"),
      "utf8",
    );
    expect(admin).toContain(
      "Engineering default. Choosing a use here records it as a new configuration version.",
    );
  });
});
