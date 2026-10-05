import { describe, expect, it } from "vitest";
import {
  BATCH005_HANDOFF,
  readBatch005Requirements,
  validateBatch005Evidence,
} from "../../scripts/lib/batch005-evidence.mjs";

const rows = readBatch005Requirements(process.cwd());
const initial = () => ({
  handoff: BATCH005_HANDOFF,
  requirements: rows.map((row) => ({ ...row, status: "not_run", checks: [] })),
  release: { status: "not_run" },
});
const check = { environment: "local fixture", test: "fixture owner", outcome: "passed" };
function completeFixture() {
  return {
    ...initial(),
    requirements: rows.map((row) => ({
      ...row,
      status: "passed",
      baseline: { outcome: "already_satisfied", test: "fixture baseline" },
      checks: [check],
      humanVerdict: "NOT RUN — no human observer",
    })),
    inventory: {
      routes: [{ owner: "app/page.tsx", inspected: true, checks: [check] }],
      consumers: [
        { owner: "components/ask/AskForm.tsx", inspected: true, checks: [check] },
      ],
      cohorts: [
        "public_vendor",
        "dashboard_work",
        "knowledge_processes",
        "operations_communications",
        "admin_connections",
        "renewals",
      ].map((cohort) => ({ cohort, inspected: true, checks: [check] })),
      content: [
        {
          owner: "app/page.tsx",
          purpose: "actual current task",
          action: "preserve",
          state: "populated",
          checks: [check],
        },
      ],
    },
    gates: Object.fromEntries(
      ["focused", "native_full", "core_e2e", "compiled_browser"].map((gate) => [
        gate,
        { status: "passed", checks: [check] },
      ]),
    ),
    feedback: {
      start: { status: "passed", checks: [check] },
      end: { status: "passed", checks: [check] },
    },
    preservation: { status: "passed", checks: [check] },
    release: { status: "verified", readback: "fixture readback", observationMs: 300_000 },
  };
}

describe("S181 native batch evidence admission", () => {
  it("tracks all 116 requirements and all fifteen actual native contracts", () => {
    expect(rows).toHaveLength(116);
    expect(new Set(rows.map((row) => row.suite)).size).toBe(15);
    expect(validateBatch005Evidence(rows, initial())).toBe(true);
  });
  it("refuses missing, duplicate and altered independent trace rows", () => {
    const evidence = initial();
    evidence.requirements.pop();
    expect(() => validateBatch005Evidence(rows, evidence)).toThrow(/coverage/);
    const duplicate = initial();
    duplicate.requirements[1] = duplicate.requirements[0];
    expect(() => validateBatch005Evidence(rows, duplicate)).toThrow(/duplicate/);
    const altered = initial();
    altered.requirements[0].behavior = "BEH-S168-2";
    expect(() => validateBatch005Evidence(rows, altered)).toThrow(/mapping/);
  });
  it("never admits NOT RUN or a status without actual baseline and owner checks as completion", () => {
    expect(() =>
      validateBatch005Evidence(rows, initial(), { requireComplete: true }),
    ).toThrow(/Unverified/);
    const fabricated = initial();
    fabricated.requirements[0].status = "passed";
    expect(() => validateBatch005Evidence(rows, fabricated)).toThrow(/actual owner/);
    fabricated.requirements[0].checks = [
      { environment: "unit", test: "actual owning component", outcome: "passed" },
    ];
    expect(() => validateBatch005Evidence(rows, fabricated)).toThrow(/baseline/);
  });
  it("refuses omitted cohorts and an uninspected route or actual consumer despite green requirement labels", () => {
    for (const mutation of [
      (evidence) => evidence.inventory.cohorts.pop(),
      (evidence) => {
        evidence.inventory.routes[0].inspected = false;
      },
      (evidence) => {
        evidence.inventory.consumers[0].checks = [];
      },
      (evidence) => {
        evidence.inventory.content[0].checks = [];
      },
    ]) {
      const evidence = completeFixture();
      mutation(evidence);
      expect(() =>
        validateBatch005Evidence(rows, evidence, { requireComplete: true }),
      ).toThrow(/inventory|content|cohort/i);
    }
  });
  it("requires separate native, compiled, core, feedback and preservation gates before completion", () => {
    for (const mutation of [
      (evidence) => {
        evidence.gates.native_full.status = "not_run";
      },
      (evidence) => {
        delete evidence.gates.core_e2e;
      },
      (evidence) => {
        evidence.gates.compiled_browser.checks = [];
      },
      (evidence) => {
        evidence.feedback.end.status = "not_run";
      },
      (evidence) => {
        evidence.preservation.status = "failed";
      },
    ]) {
      const evidence = completeFixture();
      mutation(evidence);
      expect(() =>
        validateBatch005Evidence(rows, evidence, { requireComplete: true }),
      ).toThrow(/gate|feedback|preservation/i);
    }
    expect(
      validateBatch005Evidence(rows, completeFixture(), { requireComplete: true }),
    ).toBe(true);
  });

  it("refuses an omitted or duplicated actual source owner even when every reported owner is green", () => {
    const expectedInventory = {
      routes: ["app/page.tsx", "app/work/page.tsx"],
      consumers: ["components/ask/AskForm.tsx", "components/ui/Button.tsx"],
    };
    const evidence = completeFixture();
    expect(() =>
      validateBatch005Evidence(rows, evidence, {
        requireComplete: true,
        expectedInventory,
      }),
    ).toThrow(/coverage/);
    evidence.inventory.routes.push({
      owner: "app/work/page.tsx",
      inspected: true,
      checks: [check],
    });
    expect(() =>
      validateBatch005Evidence(rows, evidence, {
        requireComplete: true,
        expectedInventory,
      }),
    ).toThrow(/coverage/);
    evidence.inventory.consumers.push({
      owner: "components/ui/Button.tsx",
      inspected: true,
      checks: [check],
    });
    expect(
      validateBatch005Evidence(rows, evidence, {
        requireComplete: true,
        expectedInventory,
      }),
    ).toBe(true);
    evidence.inventory.routes.push(evidence.inventory.routes[0]);
    expect(() =>
      validateBatch005Evidence(rows, evidence, {
        requireComplete: true,
        expectedInventory,
      }),
    ).toThrow(/duplicate|coverage/i);
  });
});
