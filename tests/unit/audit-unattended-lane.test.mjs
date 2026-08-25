import { describe, expect, it } from "vitest";

import {
  ALLOWED_EVIDENCE_FIELDS,
  ESCALATED_IDS,
  HV_IDS,
  HV_TRIAGE,
  OWNER_DECISION_IDS,
  TRIAGE_CLASSES,
  buildBatchPacket,
  evaluateCleanExit,
  evaluateReversal,
  evaluateTriageTable,
  hasSafeBoundary,
  mergeHumanResults,
  planItem,
  recordEvidence,
  reconcileAfterInterruption,
  verifyTarget,
} from "../../scripts/audit-unattended-lane.mjs";

// Gate for the FB-HVSESSION-012 unattended audit lane (S69 AC-S69-24 .. AC-S69-31).
// Every check here is fail-first: it feeds a fabricated fixture that WOULD have produced one of the
// failures this lane exists to prevent, and asserts the lane refuses it.

const PROD_TARGET = Object.freeze({
  origin: "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
  pathname: "/lease-renewal/live",
});

function goodReadback(overrides = {}) {
  return {
    ...PROD_TARGET,
    managedDomain: true,
    adminRoleVisible: true,
    demoAuthDisabled: true,
    ...overrides,
  };
}

describe("AC-S69-24 — HV triage table", () => {
  it("covers all twelve ids with exactly one known class each", () => {
    const result = evaluateTriageTable();
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(Object.keys(HV_TRIAGE).sort()).toEqual([...HV_IDS].sort());
    for (const entry of Object.values(HV_TRIAGE)) {
      expect(TRIAGE_CLASSES).toContain(entry.class);
    }
  });

  it("fails by name when an id is missing", () => {
    const { "HV-007": _dropped, ...missing } = HV_TRIAGE;
    const result = evaluateTriageTable(missing);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("HV-007");
  });

  it("fails when one id carries two classes", () => {
    const doubled = {
      ...HV_TRIAGE,
      "HV-005": { class: ["owner_decision", "effect_gated"] },
    };
    const result = evaluateTriageTable(doubled);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("exactly one class to HV-005");
  });

  it("fails on an unknown id and an unknown class", () => {
    expect(
      evaluateTriageTable({ ...HV_TRIAGE, "HV-099": { class: "terminal" } }).ok,
    ).toBe(false);
    expect(
      evaluateTriageTable({ ...HV_TRIAGE, "HV-004": { class: "probably_fine" } }).ok,
    ).toBe(false);
  });
});

describe("AC-S69-25 — exact target readback before any per-item work", () => {
  it("accepts a fully matching authenticated Production target", () => {
    expect(verifyTarget({ readback: goodReadback(), expected: PROD_TARGET }).ok).toBe(
      true,
    );
  });

  // This is the exact failure that burned four prior sessions: a candidate Pass accepted while the
  // browser was really on "/" or "/sign-in".
  it.each(["/", "/sign-in"])(
    "treats a readback on %s as a blocker, never a Pass",
    (pathname) => {
      const result = verifyTarget({
        readback: goodReadback({ pathname }),
        expected: PROD_TARGET,
      });
      expect(result.ok).toBe(false);
      expect(result.blocker).toBe("TARGET_NOT_ACQUIRED");
      expect(result.problems.join("\n")).toContain("not a candidate Pass");
    },
  );

  it.each([
    ["managedDomain", { managedDomain: false }],
    ["adminRoleVisible", { adminRoleVisible: false }],
    ["demoAuthDisabled", { demoAuthDisabled: false }],
    ["origin", { origin: "https://example.invalid" }],
  ])("refuses when %s does not match", (_label, override) => {
    const result = verifyTarget({
      readback: goodReadback(override),
      expected: PROD_TARGET,
    });
    expect(result.ok).toBe(false);
    expect(result.blocker).toBe("TARGET_MISMATCH");
  });

  it("refuses a missing readback rather than assuming the target", () => {
    expect(verifyTarget({ readback: null, expected: PROD_TARGET }).blocker).toBe(
      "TARGET_READBACK_MISSING",
    );
  });
});

describe("AC-S69-26 — bodyless evidence recorder", () => {
  it("accepts the allowlisted bodyless field set once the target is verified", () => {
    const result = recordEvidence(
      {
        origin: PROD_TARGET.origin,
        pathname: PROD_TARGET.pathname,
        headingText: "Renewals",
        controlText: "Resolve",
        statusCode: 200,
        redirected: false,
        managedDomain: true,
        adminRoleVisible: true,
        demoAuthDisabled: true,
        count: 20,
        observedAt: "2026-08-24T00:00:00Z",
        revision: "pmi-kc-app-rmsol14wb-9fe02e7af754",
        environment: "Production + Live",
        targetChanged: false,
        errorClass: "none",
      },
      { targetVerified: true },
    );
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // EV-02, found by adversarial verification of this very module: the recorder and verifyTarget
  // originally shared no state, so evidence could be written while the browser sat on /sign-in --
  // the exact mechanism that produced four sessions of false candidate Passes.
  it("refuses to record evidence without a verified target", () => {
    const result = recordEvidence({ pathname: "/lease-renewal/live" });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("without a verified target");
    expect(result.record).toBeNull();
  });

  it("refuses to record evidence whose pathname is a setup surface", () => {
    for (const pathname of ["/", "/sign-in"]) {
      const result = recordEvidence({ pathname }, { targetVerified: true });
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toContain("setup surface");
    }
  });

  it("rejects any field that is not on the allowlist", () => {
    const result = recordEvidence(
      { pathname: "/lease-renewal/live", residentName: "REDACTED-FIXTURE" },
      { targetVerified: true },
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain('"residentName"');
    expect(result.record).toBeNull();
  });

  // Each fixture below is a leak arriving under an ALLOWED key. The rejection must name the key and
  // must NOT echo the value — echoing it would write down exactly what may not be written down.
  const leaks = [
    ["email address", { headingText: "owner: someone@example.com" }],
    ["cookie/token material", { controlText: "Authorization: Bearer abcdef" }],
    ["OAuth query material", { pathname: "/auth/callback?code=abc&state=xyz" }],
    ["street address", { headingText: "1234 NE Lindsay Ave" }],
    ["currency value", { controlText: "Current rent $1,000.00" }],
    ["screenshot path", { errorClass: "golden-data/captured/shot.png" }],
    ["page body", { headingText: "<div class='card'>rendered page body</div>" }],
  ];

  it.each(leaks)("rejects a seeded %s without echoing the fixture", (_label, fields) => {
    const seededValue = Object.values(fields)[0];
    const result = recordEvidence(fields, { targetVerified: true });
    expect(result.ok).toBe(false);
    expect(result.record).toBeNull();
    const message = result.problems.join("\n");
    expect(message).not.toContain(seededValue);
  });

  it("keeps the allowlist itself free of body-bearing fields", () => {
    for (const forbidden of [
      "screenshot",
      "body",
      "html",
      "payload",
      "cookie",
      "token",
    ]) {
      expect(
        ALLOWED_EVIDENCE_FIELDS.some((f) => f.toLowerCase().includes(forbidden)),
      ).toBe(false);
    }
  });
});

describe("AC-S69-27 — terminal results are never downgraded", () => {
  const existing = [
    { verification_id: "HV-001", status: "pass" },
    { verification_id: "HV-002", status: "not_run" },
    { verification_id: "HV-012", status: "pass" },
  ];

  it("blocks a fabricated downgrade of a terminal pass instead of overwriting it", () => {
    const result = mergeHumanResults({
      existing,
      incoming: [{ verification_id: "HV-001", status: "not_run" }],
    });
    expect(result.ok).toBe(false);
    expect(result.merged).toBeNull();
    expect(result.problems.join("\n")).toContain("HV-001");
    expect(result.problems.join("\n")).toContain("Blocking rather than downgrading");
  });

  it("advances a non-terminal id normally", () => {
    const result = mergeHumanResults({
      existing,
      incoming: [{ verification_id: "HV-002", status: "blocked" }],
    });
    expect(result.ok).toBe(true);
    expect(result.merged.find((r) => r.verification_id === "HV-002").status).toBe(
      "blocked",
    );
    expect(result.merged.find((r) => r.verification_id === "HV-001").status).toBe("pass");
  });

  it("rejects an incoming result for an unknown id", () => {
    expect(
      mergeHumanResults({
        existing,
        incoming: [{ verification_id: "HV-404", status: "pass" }],
      }).ok,
    ).toBe(false);
  });
});

describe("AC-S69-28 — effect boundary, severity-awareness, and refusals", () => {
  // The single most dangerous assumption the lane originally made. On the renewal review surface the
  // confirmation dialog is severity-dependent: `requiresAdmin` is true only for High and Blocked.
  // On a Low or Medium flag "Resolve" IS the commit control, so "advance to the boundary and stop"
  // would have written a durable decision about a real client lease with nothing to stop at.
  it("only recognises a safe boundary on High and Blocked severities", () => {
    expect(hasSafeBoundary({ severity: "High" })).toBe(true);
    expect(hasSafeBoundary({ severity: "Blocked" })).toBe(true);
    expect(hasSafeBoundary({ severity: "Low" })).toBe(false);
    expect(hasSafeBoundary({ severity: "Medium" })).toBe(false);
  });

  it("refuses to approach an effect-gated item on a severity with no dialog", () => {
    for (const severity of ["Low", "Medium"]) {
      const plan = planItem({ id: "HV-002", severity, confirmControlReachable: true });
      expect(plan.outcome).toBe("no_safe_boundary");
      expect(plan.outcome).not.toBe("stopped_at_boundary");
      expect(plan.reason).toContain("commits directly");
    }
  });

  it("assumes the worst when severity is unknown rather than the convenient case", () => {
    const plan = planItem({ id: "HV-002", confirmControlReachable: true });
    expect(plan.outcome).toBe("no_safe_boundary");
    expect(plan.reason).toContain("Severity is unknown");
  });

  it("stops at the boundary on High or Blocked, never confirming", () => {
    for (const severity of ["High", "Blocked"]) {
      const plan = planItem({ id: "HV-002", severity, confirmControlReachable: true });
      expect(plan.outcome).toBe("stopped_at_boundary");
      expect(plan.outcome).not.toBe("confirmed");
    }
  });

  // Q2=C authorized committing HV-007 and HV-009. Adversarial verification falsified the premises:
  // neither has a producible reversal, so AC-S69-29 can never be satisfied for them.
  it.each(["HV-007", "HV-009"])(
    "refuses %s because its reversal is unproducible, under every fixture",
    (id) => {
      for (const severity of ["High", "Blocked", "Low", null]) {
        const plan = planItem({ id, severity, confirmControlReachable: true });
        expect(plan.outcome).toBe("refused");
        expect(plan.reason).toContain("reversal unproducible");
      }
    },
  );

  it("refuses HV-008 on grounds that are actually true of it", () => {
    for (const confirmControlReachable of [true, false]) {
      const plan = planItem({ id: "HV-008", confirmControlReachable });
      expect(plan.outcome).toBe("refused");
      expect(plan.reason).toContain("no-autonomous-client-facing-send");
      expect(plan.reason).toContain("irreversible durable Production association");
    }
  });

  it("routes the remaining classes to their own outcomes", () => {
    expect(planItem({ id: "HV-001" }).outcome).toBe("already_terminal");
    expect(planItem({ id: "HV-003" }).outcome).toBe("second_party_required");
    expect(planItem({ id: "HV-006" }).outcome).toBe("hardware_required");
    for (const id of OWNER_DECISION_IDS) {
      expect(planItem({ id }).outcome).toBe("batch_packet");
    }
  });
});

describe("AC-S69-29 — a committed effect carries a proven reversal", () => {
  it("passes when the reversal readback shows the effect gone", () => {
    expect(
      evaluateReversal({
        id: "HV-007",
        effectCommitted: true,
        reversalReadback: "absent",
      }).ok,
    ).toBe(true);
    expect(
      evaluateReversal({
        id: "HV-009",
        effectCommitted: true,
        reversalReadback: "stopped",
      }).ok,
    ).toBe(true);
  });

  it("fails an unreversed Gmail push-watch rather than passing it", () => {
    const result = evaluateReversal({
      id: "HV-009",
      effectCommitted: true,
      reversalReadback: "active",
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("An unreversed effect is a failure");
  });
});

describe("AC-S69-30 — one batch packet for all four owner decisions", () => {
  const full = OWNER_DECISION_IDS.map((id) => ({
    id,
    question: "q",
    findings: "f",
    recommendation: "r",
    effectOfEachChoice: "e",
  }));

  it("accepts a complete packet emitted once", () => {
    const result = buildBatchPacket(full);
    expect(result.problems).toEqual([]);
    expect(result.emissions).toBe(1);
  });

  it("fails when any of the four is missing", () => {
    const result = buildBatchPacket(full.filter((e) => e.id !== "HV-010"));
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("HV-010");
  });

  it("fails when an entry omits its recommendation or effect-of-choice", () => {
    const thin = full.map((e) => (e.id === "HV-005" ? { ...e, recommendation: "" } : e));
    expect(buildBatchPacket(thin).ok).toBe(false);
  });

  it("fails when a non-owner-decision id is smuggled into the packet", () => {
    expect(
      buildBatchPacket([
        ...full,
        {
          id: "HV-008",
          question: "q",
          findings: "f",
          recommendation: "r",
          effectOfEachChoice: "e",
        },
      ]).ok,
    ).toBe(false);
  });

  // TRI-02: a refused effect-gated item had no route to terminal at all -- its governing decision
  // routed it "through the batch packet" while the packet builder rejected it.
  it("admits an escalated refused id only when escalation is requested", () => {
    const escalated = {
      id: "HV-002",
      question: "q",
      findings: "f",
      recommendation: "r",
      effectOfEachChoice: "e",
    };
    expect(buildBatchPacket([...full, escalated]).ok).toBe(false);
    expect(buildBatchPacket([...full, escalated], { includeEscalated: true }).ok).toBe(
      true,
    );
  });

  it("holds an escalated entry to the same four-field bar", () => {
    const thin = { id: "HV-009", question: "q", findings: "f", recommendation: "" };
    const result = buildBatchPacket([...full, thin], { includeEscalated: true });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("HV-009");
  });

  it("escalates exactly the three ids the lane refuses to commit", () => {
    expect([...ESCALATED_IDS].sort()).toEqual(["HV-002", "HV-007", "HV-009"]);
  });
});

describe("AC-S69-31 — interruption recovery and clean exit", () => {
  it("keeps an interrupted item at not_run and rejects an invented completion", () => {
    const results = [
      { verification_id: "HV-001", status: "pass" },
      { verification_id: "HV-002", status: "not_run" },
    ];
    expect(reconcileAfterInterruption({ results, interruptedId: "HV-002" }).ok).toBe(
      true,
    );

    const invented = [{ verification_id: "HV-002", status: "pass" }];
    const bad = reconcileAfterInterruption({
      results: invented,
      interruptedId: "HV-002",
    });
    expect(bad.ok).toBe(false);
    expect(bad.problems.join("\n")).toContain("must remain not_run");
  });

  it("requires exactly one named blocker and no held resources on a control-unavailable exit", () => {
    expect(
      evaluateCleanExit({
        blockers: ["IN_APP_BROWSER_CONTROL_UNAVAILABLE"],
        heldResources: [],
      }).ok,
    ).toBe(true);
    expect(evaluateCleanExit({ blockers: [], heldResources: [] }).ok).toBe(false);
    expect(evaluateCleanExit({ blockers: ["A", "B"], heldResources: [] }).ok).toBe(false);

    const held = evaluateCleanExit({
      blockers: ["IN_APP_BROWSER_CONTROL_UNAVAILABLE"],
      heldResources: ["browser process", "local server"],
    });
    expect(held.ok).toBe(false);
    expect(held.problems).toHaveLength(2);
  });
});

describe("S69 spec and resume state carry the superseding authority", () => {
  it("names FB-HVSESSION-012 and the new acceptance ids in the spec", async () => {
    const { readFileSync } = await import("node:fs");
    const spec = readFileSync(
      "docs/feature-suites/human-verification-session-and-evidence-reliability.md",
      "utf8",
    );
    expect(spec).toContain("FB-HVSESSION-012");
    for (let n = 24; n <= 31; n += 1) {
      expect(spec).toContain(`**AC-S69-${n}**`);
    }
    // The superseded sentence must be GONE, not merely annotated.
    expect(spec).not.toContain("controller as a fallback unless a later explicit user");
  });

  it("records the controller authorization in the resume state", async () => {
    const { readFileSync } = await import("node:fs");
    const state = readFileSync("docs/pmi-kc-human-verification-resume-state.md", "utf8");
    expect(state).toContain("custom_browser_controller_allowed: true");
    expect(state).toContain("unattended_run_mode:");
    expect(state).not.toContain("custom_browser_controller_allowed: false");
  });
});
