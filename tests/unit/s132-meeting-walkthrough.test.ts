import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bindPrivateReference,
  caseReferenceLabel,
  emptyCaseMatrix,
  emptyObservationLedger,
  FORBIDDEN_MEETING_SHORTCUTS,
  findCustomerIdentifiers,
  genericGuideClaim,
  importObservations,
  interruptSession,
  LIVE_WALKTHROUGH_STEPS,
  MEETING_PREFLIGHT_CHECKS,
  MEETING_SESSION_PLANNING,
  ObservationLedgerSchema,
  parseWalkthroughScript,
  PENDING_SELECTION,
  projectMeetingPreflight,
  recordObservation,
  resumeSession,
  SAFE_MEETING_BRANCHES,
  summarizeLedger,
  WalkthroughCaseSchema,
  type MeetingPreflightEvidence,
  type ObservationEntry,
} from "@/lib/lease-renewal/meeting-walkthrough";
import { parseGuideSteps } from "@/scripts/lib/renewal-guide-controls.mjs";

const RUNBOOK = readFileSync(
  resolve(process.cwd(), "docs/products/renewal-meeting-walkthrough-runbook.md"),
  "utf8",
);
const GUIDE_STEPS = new Set(
  parseGuideSteps(
    readFileSync(
      resolve(process.cwd(), "docs/products/renewal-operator-guide.md"),
      "utf8",
    ),
  ).map((step: { step: string }) => step.step),
);
const NOW = "2026-09-20T15:00:00Z";

function evidence(
  state: "verified" | "failed" | "pending_external_input",
  note = "private:evidence-location",
) {
  return { state, evidence: note, observedAtIso: NOW };
}

function script() {
  return parseWalkthroughScript(RUNBOOK);
}

function recorded(
  step: string,
  outcome: "pass" | "fail",
  overrides: Partial<ObservationEntry> = {},
): ObservationEntry {
  const row = script().rows.find((candidate) => candidate.step === step)!;
  return {
    step,
    caseSlot: "ordinary_renewal",
    privateReference: "private:case-a",
    actualStep: row.control,
    expected: row.expectedOutput,
    observed:
      outcome === "pass" ? "Matched the expected output." : "Control did not appear.",
    actor: "facilitator",
    timeIso: NOW,
    evidenceLocation: "private:screens/step",
    outcome,
    issueOwner: outcome === "fail" ? "engineering" : null,
    nextAction: outcome === "fail" ? "Track as ordinary work after approval." : null,
    dependency: null,
    ...overrides,
  };
}

describe("S132 AC-S132-1: case matrix without real identifiers", () => {
  it("starts with both cases Pending selection and invents nothing about a customer", () => {
    const matrix = emptyCaseMatrix();
    expect(matrix.map((entry) => entry.slot)).toEqual([
      "ordinary_renewal",
      "policy_related",
    ]);
    for (const entry of matrix) {
      expect(caseReferenceLabel(entry)).toBe(PENDING_SELECTION);
      expect(entry.currentCycle).toBe("unknown");
      expect(entry.participantRole).toBe("unknown");
      expect(entry.missingInputs).toContain("Team-selected lease");
      expect(WalkthroughCaseSchema.parse(entry)).toEqual(entry);
    }
  });

  it("binds only a private storage pointer and refuses customer values", () => {
    const [ordinary] = emptyCaseMatrix();
    const bound = bindPrivateReference(ordinary, "private:case-a");
    expect(caseReferenceLabel(bound)).toBe("private:case-a");
    expect(() => bindPrivateReference(ordinary, "tenant@example.com")).toThrow(
      /email address/,
    );
    expect(() => bindPrivateReference(ordinary, "Lease #123456")).toThrow(
      /lease or unit number/,
    );
    expect(() => bindPrivateReference(ordinary, "1234 Elm Street")).toThrow(
      /street address/,
    );
    expect(() => bindPrivateReference(ordinary, "case-a")).toThrow(/private:<label>/);
  });

  it("refuses case text that carries an identifier or an expected source value", () => {
    const [ordinary] = emptyCaseMatrix();
    const result = WalkthroughCaseSchema.safeParse({
      ...ordinary,
      intendedOutcome: "Renew at $1,450 for the tenant at 555-123-4567.",
    });
    expect(result.success).toBe(false);
    expect(findCustomerIdentifiers("Owner said yes on the phone.")).toEqual([]);
  });
});

describe("S132 AC-S132-2: effect-free preflight with exact dependencies", () => {
  it("marks unsupplied checks Not run and still supports the preparation walkthrough", () => {
    const preflight = projectMeetingPreflight({}, NOW);
    expect(preflight.items).toHaveLength(MEETING_PREFLIGHT_CHECKS.length);
    expect(preflight.counts.not_run).toBe(MEETING_PREFLIGHT_CHECKS.length);
    expect(preflight.preparationWalkthroughSupported).toBe(true);
    expect(preflight.heldLiveSteps.map((entry) => entry.step)).toEqual(
      LIVE_WALKTHROUGH_STEPS.filter((step) =>
        MEETING_PREFLIGHT_CHECKS.some((check) => check.holds.includes(step)),
      ),
    );
    for (const item of preflight.items) {
      expect(item.evidence).toBeNull();
      expect(item.observedAtIso).toBeNull();
      expect(item.effectFreeSource.length).toBeGreaterThan(20);
    }
  });

  it("names precisely which live steps cannot run with missing templates, no mailbox and closed keys", () => {
    const supplied: MeetingPreflightEvidence = {
      code_identity: evidence("verified"),
      operator_access: evidence("verified"),
      source_availability: evidence("verified"),
      all_lease_discoverability: evidence("verified"),
      sheet_writeback_pause: evidence("verified"),
      approved_templates_resources: evidence(
        "pending_external_input",
        "Five families read Pending materials",
      ),
      managed_mailbox: evidence("failed", "No connected mailbox for the sender"),
      dotloop_selection_keys: evidence(
        "pending_external_input",
        "Keys closed; no selection",
      ),
    };
    const preflight = projectMeetingPreflight(supplied, NOW);
    expect(preflight.counts).toEqual({
      verified: 5,
      failed: 1,
      pending_external_input: 2,
      not_run: 0,
    });
    expect(preflight.heldLiveSteps).toEqual([
      { step: "unsent_owner_draft", heldBy: ["managed_mailbox"] },
      { step: "unsent_tenant_draft", heldBy: ["managed_mailbox"] },
      {
        step: "dotloop_packet_preview",
        heldBy: ["approved_templates_resources", "dotloop_selection_keys"],
      },
    ]);
    expect(preflight.heldLiveSteps.map((entry) => entry.step)).not.toContain(
      "record_owner_terms",
    );
    expect(preflight.summary).toMatch(/3 live steps cannot run yet/);
    expect(preflight.preparationWalkthroughSupported).toBe(true);
  });

  it("refuses evidence without a time or location and never invents a verified state", () => {
    expect(() =>
      projectMeetingPreflight(
        { code_identity: { state: "verified", evidence: "", observedAtIso: NOW } },
        NOW,
      ),
    ).toThrow(/evidence location/);
    expect(() =>
      projectMeetingPreflight(
        { code_identity: { state: "verified", evidence: "x", observedAtIso: "today" } },
        NOW,
      ),
    ).toThrow(/time its evidence was observed/);
    expect(() => projectMeetingPreflight({}, "2026-09-20")).toThrow(
      /exact UTC timestamp/,
    );
    const all = projectMeetingPreflight(
      Object.fromEntries(
        MEETING_PREFLIGHT_CHECKS.map((check) => [check.id, evidence("verified")]),
      ),
      NOW,
    );
    expect(all.heldLiveSteps).toEqual([]);
    expect(all.summary).toMatch(/exact confirmation at the meeting/);
  });
});

describe("S132 AC-S132-5: safe meeting branches", () => {
  it("routes every branch to inspection, preparation or a manual handoff on existing guide controls", () => {
    expect(SAFE_MEETING_BRANCHES.map((branch) => branch.id)).toEqual([
      "no_template",
      "no_mailbox",
      "no_policy",
      "source_read_failed",
      "provider_unavailable",
    ]);
    for (const branch of SAFE_MEETING_BRANCHES) {
      for (const step of branch.guideSteps)
        expect(GUIDE_STEPS.has(step), `${branch.id} step ${step}`).toBe(true);
      for (const shortcut of FORBIDDEN_MEETING_SHORTCUTS)
        expect(branch.branch.toLowerCase()).not.toContain(shortcut);
      expect(branch.branch).toMatch(/Show|Prepare|Reload|hand off|hand the packet/);
    }
    const runbookText = RUNBOOK.toLowerCase();
    for (const shortcut of FORBIDDEN_MEETING_SHORTCUTS)
      expect(runbookText.includes(`required: ${shortcut}`)).toBe(false);
  });
});

describe("S132 AC-S132-6 and AC-S132-8: observation ledger", () => {
  it("an unrun session has no pass verdict, no observation and no recording link", () => {
    const ledger = emptyObservationLedger(script(), "ordinary_renewal");
    expect(ledger.recordingLocation).toBeNull();
    expect(ledger.entries.length).toBe(script().rows.length);
    expect(ledger.entries.every((entry) => entry.outcome === "not_run")).toBe(true);
    expect(
      ledger.entries.every((entry) => entry.observed === null && entry.actor === null),
    ).toBe(true);
    const summary = summarizeLedger(ledger);
    expect(summary.sessionVerdict).toBe("not_run");
    expect(summary.humanVerdictLabel).toBe("NOT RUN, no human observer");
    expect(summary.counts.pass).toBe(0);
  });

  it("records a failed step with owner and action while later safe steps stay separately observable", () => {
    let ledger = emptyObservationLedger(script(), "ordinary_renewal");
    ledger = recordObservation(ledger, recorded("1", "pass"));
    ledger = recordObservation(ledger, recorded("2", "fail"));
    ledger = recordObservation(ledger, recorded("3", "pass"));
    const byStep = Object.fromEntries(ledger.entries.map((entry) => [entry.step, entry]));
    expect(byStep["2"].outcome).toBe("fail");
    expect(byStep["2"].issueOwner).toBe("engineering");
    expect(byStep["3"].outcome).toBe("pass");
    expect(byStep["4"].outcome).toBe("not_run");
    expect(summarizeLedger(ledger).sessionVerdict).toBe("fail");
    expect(() =>
      recordObservation(ledger, recorded("2", "fail", { issueOwner: null })),
    ).toThrow(/issue owner and next action/);
    expect(() =>
      recordObservation(
        ledger,
        recorded("3", "pass", { observed: null, actor: null, timeIso: null }),
      ),
    ).toThrow(/what was observed, by whom and when/);
    expect(() =>
      recordObservation(ledger, { ...recorded("1", "pass"), step: "99" }),
    ).toThrow(/not on the script/);
    expect(() =>
      ObservationLedgerSchema.parse({
        ...ledger,
        entries: [{ ...byStep["4"], observed: "seen", outcome: "not_run" }],
      }),
    ).toThrow(/unrun step carries no observation/);
  });

  it("keeps identifiers out of the ledger text and points to private evidence instead", () => {
    const ledger = emptyObservationLedger(script(), "ordinary_renewal");
    expect(() =>
      recordObservation(
        ledger,
        recorded("1", "pass", { observed: "Row for owner@example.com appeared." }),
      ),
    ).toThrow(/Put the detail in private evidence/);
  });

  it("resumes a partially completed session with prior results untouched", () => {
    let ledger = emptyObservationLedger(script(), "policy_related");
    const first = { ...recorded("1", "pass"), caseSlot: "policy_related" as const };
    const second = { ...recorded("2", "fail"), caseSlot: "policy_related" as const };
    ledger = recordObservation(ledger, first);
    ledger = recordObservation(ledger, second);
    ledger = interruptSession(ledger, "2");
    expect(ledger.interruptedAfterStep).toBe("2");
    expect(summarizeLedger(ledger).sessionVerdict).toBe("fail");

    const resumed = resumeSession(ledger, script(), "policy_related");
    expect(resumed.nextStep).toBe("3");
    expect(resumed.ledger.interruptedAfterStep).toBeNull();
    expect(resumed.ledger.entries.find((entry) => entry.step === "1")).toEqual(first);
    expect(resumed.ledger.entries.find((entry) => entry.step === "2")).toEqual(second);
    expect(
      resumed.ledger.entries.filter((entry) => entry.outcome === "not_run").length,
    ).toBe(script().rows.length - 2);
    expect(() => interruptSession(ledger, "99")).toThrow(/not on this ledger/);
  });

  it("session planning is context only: nothing is enforced or scheduled by the app", () => {
    expect(MEETING_SESSION_PLANNING).toEqual({
      approximateMinutes: 90,
      enforcedByApp: false,
      scheduledByApp: false,
      proposedDateIsPlanningContextOnly: true,
    });
  });
});

describe("S132 AC-S132-7: documentation only after observation", () => {
  it("separates confirmed procedure from open questions and never claims a full pass early", () => {
    let ledger = emptyObservationLedger(script(), "ordinary_renewal");
    const untouched = importObservations(ledger);
    expect(untouched.confirmedProcedure).toEqual([]);
    expect(untouched.fullWorkflowPassed).toBe(false);
    expect(genericGuideClaim(untouched)).toMatch(/stays Draft for validation/);

    ledger = recordObservation(ledger, recorded("1", "pass"));
    ledger = recordObservation(ledger, recorded("2", "fail"));
    const partial = importObservations(ledger);
    expect(partial.confirmedProcedure.map((entry) => entry.step)).toEqual(["1"]);
    expect(partial.openQuestions.length).toBe(script().rows.length - 1);
    expect(partial.openQuestions.find((entry) => entry.step === "2")?.reason).toMatch(
      /^Failed:/,
    );
    expect(partial.fullWorkflowPassed).toBe(false);
    expect(genericGuideClaim(partial)).toBe(
      `Staff validated 1 scripted steps; ${script().rows.length - 1} remain open questions.`,
    );

    for (const row of script().rows)
      ledger = recordObservation(ledger, recorded(row.step, "pass"));
    const full = importObservations(ledger);
    expect(full.fullWorkflowPassed).toBe(true);
    expect(genericGuideClaim(full)).toBe(
      `Staff validated all ${script().rows.length} scripted steps.`,
    );
  });

  it("refuses to write a customer identifier into the generic guide", () => {
    const ledger = recordObservation(
      emptyObservationLedger(script(), "ordinary_renewal"),
      recorded("1", "pass", { evidenceLocation: "shared drive, call 555-123-4567" }),
    );
    const imported = importObservations(ledger);
    expect(imported.customerIdentifiersFound).toEqual(["phone number"]);
    expect(() => genericGuideClaim(imported)).toThrow(/cannot carry a phone number/);
  });
});
