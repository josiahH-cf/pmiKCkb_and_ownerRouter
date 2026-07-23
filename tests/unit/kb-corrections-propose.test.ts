import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  proposeEvalCaseFromCorrection,
  proposeKbEntryFromCorrection,
  proposeRerankSignalFromCorrection,
} from "@/lib/kb-corrections/propose";
import type { AskCorrectionRecord } from "@/lib/firestore/types";

const CORRECTION: AskCorrectionRecord = {
  id: "corr-1",
  ask_log_id: "log-1",
  space_id: "kb",
  question: "What is the late-fee grace period?",
  kind: "wrong_fact",
  note: "The grace period is 5 days, not 3.",
  source_state: "Verified",
  citations: [
    {
      source_id: "sop-late-fees",
      title: "Late fees",
      url: "https://kb.example/late-fees",
    },
  ],
  status: "Proposed",
  user_uid: "editor-1",
  created_at: "2026-07-23T00:00:00.000Z",
  updated_at: "2026-07-23T00:00:00.000Z",
};

describe("kb-corrections propose pipeline (AC-S32-2, AC-S32-7)", () => {
  it("is deterministic: each function returns deep-equal output on two calls", () => {
    expect(proposeKbEntryFromCorrection(CORRECTION)).toEqual(
      proposeKbEntryFromCorrection(CORRECTION),
    );
    expect(proposeEvalCaseFromCorrection(CORRECTION)).toEqual(
      proposeEvalCaseFromCorrection(CORRECTION),
    );
    expect(proposeRerankSignalFromCorrection(CORRECTION)).toEqual(
      proposeRerankSignalFromCorrection(CORRECTION),
    );
  });

  it("every artifact is Proposed-only (never Approved/active) and carries the correction id", () => {
    const kb = proposeKbEntryFromCorrection(CORRECTION);
    const evalCase = proposeEvalCaseFromCorrection(CORRECTION);
    const signals = proposeRerankSignalFromCorrection(CORRECTION);
    expect(kb.status).toBe("Proposed");
    expect(kb.source_correction_id).toBe("corr-1");
    expect(evalCase.status).toBe("Proposed");
    expect(signals.every((s) => s.status === "Proposed")).toBe(true);
    expect(signals.every((s) => s.source_correction_id === "corr-1")).toBe(true);
    // The KB proposal is a Draft placeholder shape (needs its own approval); never an active source.
    expect(kb.placeholder.status).toBe("Open");
  });

  it("the eval-case proposal is redaction-required (AC-S32-7, no raw PII emit)", () => {
    expect(proposeEvalCaseFromCorrection(CORRECTION).redaction_required).toBe(true);
  });

  it("down-weights the cited source for a wrong_source correction, up-weights otherwise", () => {
    const wrongSource = proposeRerankSignalFromCorrection({
      ...CORRECTION,
      kind: "wrong_source",
    });
    expect(wrongSource[0]).toMatchObject({
      source_id: "sop-late-fees",
      direction: "down",
    });
    const wrongFact = proposeRerankSignalFromCorrection(CORRECTION);
    expect(wrongFact[0]).toMatchObject({ source_id: "sop-late-fees", direction: "up" });
  });

  it("yields no re-rank signal when there are no citations", () => {
    expect(proposeRerankSignalFromCorrection({ ...CORRECTION, citations: [] })).toEqual(
      [],
    );
  });

  it("is a pure module: no wall-clock, random, network, or fs import", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../lib/kb-corrections/propose.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["']node:fs["']/);
    expect(source).not.toMatch(/uuid|generateContent|model-provider/);
    // No path writes an artifact into a tracked eval fixture or KB source file.
    expect(source).not.toMatch(/tests\/eval|writeFile|fs\.write/);
  });
});
