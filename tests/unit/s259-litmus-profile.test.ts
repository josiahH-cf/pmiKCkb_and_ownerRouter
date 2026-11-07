import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  litmusCoverageProblems,
  litmusPreservationProblems,
  litmusRunRules,
  litmusRunTemplate,
  RENEWAL_ONE_PATH_LITMUS,
  RENEWAL_USABILITY_LITMUS,
  validateLitmusRun,
} from "@/lib/help/litmus";

const read = (path: string) => readFileSync(path, "utf8");
const original = read(RENEWAL_ONE_PATH_LITMUS.specPath);
const candidate = read(RENEWAL_USABILITY_LITMUS.specPath);
const profile = read("docs/renewal-usability-litmus-profile-2026-11-07.md");

describe("S259 engineering evidence", () => {
  it("maps every original check to its current journey exactly once", () => {
    expect(litmusCoverageProblems(candidate)).toEqual([]);
    expect(litmusPreservationProblems(profile, original, candidate)).toEqual([]);
    expect(
      litmusPreservationProblems(profile.replace(", L55", ""), original, candidate),
    ).toContain("The preservation profile needs each original check exactly once.");
    expect(
      litmusPreservationProblems(profile.replace(/^\| L09.*$/m, ""), original, candidate),
    ).toContain(
      "The preservation profile needs each current journey exactly once in order.",
    );
  });

  it("keeps unobserved engineering work from qualifying the candidate", () => {
    const rules = litmusRunRules(candidate, RENEWAL_USABILITY_LITMUS);
    const report = litmusRunTemplate(rules, { commit: "1".repeat(40), run: 1 })
      .replace(/^Accepted:.*$/m, "Accepted: Yes")
      .replaceAll("<Yes, No or UNVERIFIED>", "Yes")
      .replace(
        /^\| L14 \| Yes \|.*$/m,
        "| L14 | UNVERIFIED | The canonical gate has no readback. | none | Run the required gate. |",
      );
    expect(validateLitmusRun(report, rules)).toContain(
      "The engineering run cannot be accepted while L14 is UNVERIFIED.",
    );
  });
});
