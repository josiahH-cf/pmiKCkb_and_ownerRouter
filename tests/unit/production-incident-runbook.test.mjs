import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNBOOK = readFileSync(
  join(ROOT, "docs", "production-incident-runbook.md"),
  "utf8",
);
const ADMIN_PANEL = readFileSync(
  join(ROOT, "components", "admin", "RuntimeSuspensionAdminPanel.tsx"),
  "utf8",
);
const NORMALIZED_RUNBOOK = RUNBOOK.replace(/\s+/g, " ");
const NORMALIZED_ADMIN_PANEL = ADMIN_PANEL.replace(/\s+/g, " ");

describe("S51 production incident contract", () => {
  it("pins both severities, both acknowledgement windows, and the same-day Dan rule", () => {
    expect(RUNBOOK).toContain("Sev-1: client-visible or containment-required");
    expect(RUNBOOK).toContain("30 minutes during business hours");
    expect(RUNBOOK).toContain("Sev-2: degraded but contained");
    expect(RUNBOOK).toContain("one business day");
    expect(RUNBOOK).toContain(
      "Report any wrong client-facing output to Dan on the same day it is discovered.",
    );
  });

  it("makes runtime suspension the Sev-1 first action instead of a deploy", () => {
    expect(NORMALIZED_RUNBOOK).toContain(
      "stop the affected Production action in the Admin action-stop panel first",
    );
    expect(NORMALIZED_RUNBOOK).toContain("Do not wait for a deploy.");
    expect(NORMALIZED_RUNBOOK).toContain(
      "A deploy or revision rollback is a remedy after containment, not the first stop.",
    );
    expect(NORMALIZED_ADMIN_PANEL).toContain(
      "For a Sev-1 incident, stop the affected Production action here first.",
    );
    expect(NORMALIZED_ADMIN_PANEL).toContain("Do not wait for a deploy.");
  });

  it("defines a fail-closed fallback when the Admin stop panel is unavailable", () => {
    expect(NORMALIZED_RUNBOOK).toContain(
      "If the Admin panel itself is unavailable, declare a manual operational stop immediately",
    );
    expect(NORMALIZED_RUNBOOK).toContain("tell all staff to stop initiating app actions");
    expect(NORMALIZED_RUNBOOK).toContain(
      "the incident remains Sev-1 until containment is read back",
    );
    expect(NORMALIZED_RUNBOOK).toContain(
      "Do not improvise a Firestore write, IAM change, credential action, or guessed cloud command.",
    );
  });

  it("keeps the incident copy plain and value-free", () => {
    for (const text of [RUNBOOK, ADMIN_PANEL]) {
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/\b(?:control plane|source of truth|PMI handles)\b/i);
    }
    for (const forbidden of [
      "resident@example",
      "access_token",
      "Bearer ",
      "refresh_token",
    ]) {
      expect(RUNBOOK).not.toContain(forbidden);
    }
  });
});
