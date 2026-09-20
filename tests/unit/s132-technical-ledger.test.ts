import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRESERVATION_CHECKS,
  TECHNICAL_RESULT_LEDGER,
} from "@/lib/lease-renewal/meeting-walkthrough";
import {
  gatherLocalEvidence,
  mergeObservedEvidence,
  renderPreflight,
} from "@/scripts/meeting-walkthrough-preflight";
import { projectMeetingPreflight } from "@/lib/lease-renewal/meeting-walkthrough";

const PACKAGE_SCRIPTS = (
  JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;
const NOW = "2026-09-20T15:00:00.000Z";

describe("S132 AC-S132-4: technical result ledger", () => {
  it("records each engineering scenario against real tests with provider, persistence and recovery columns", () => {
    const scenarios = TECHNICAL_RESULT_LEDGER.map((row) => row.scenario.toLowerCase());
    for (const required of [
      "fresh",
      "underway",
      "date advancement",
      "non-renewal",
      "missing templates",
      "policy materials absent",
      "read failures",
      "stale snapshots",
      "duplicate confirmation",
      "interrupted work",
    ])
      expect(
        scenarios.some((scenario) => scenario.includes(required)),
        required,
      ).toBe(true);
    for (const row of TECHNICAL_RESULT_LEDGER) {
      expect(row.tests.length).toBeGreaterThan(0);
      for (const path of row.tests)
        expect(existsSync(resolve(process.cwd(), path)), `${row.scenario}: ${path}`).toBe(
          true,
        );
      expect(row.providerCalls).toMatch(/^0/);
      expect(row.persistence.length).toBeGreaterThan(0);
      expect(row.failureRecovery.length).toBeGreaterThan(0);
    }
  });

  it("keeps the selected-lease and human verdict columns at Not run for every row", () => {
    for (const row of TECHNICAL_RESULT_LEDGER) {
      expect(row.selectedLease).toBe("Not run");
      expect(row.humanVerdict).toBe("Not run");
    }
  });
});

describe("S132 AC-S132-9: preservation checks exist unchanged", () => {
  it("every named preservation check is a real repository command", () => {
    for (const check of PRESERVATION_CHECKS) {
      if (check.startsWith("npm run ")) {
        expect(PACKAGE_SCRIPTS[check.slice("npm run ".length)], check).toBeDefined();
      } else {
        expect(
          existsSync(resolve(process.cwd(), check.replace(/^bash /, ""))),
          check,
        ).toBe(true);
      }
    }
    expect(PACKAGE_SCRIPTS["meeting:preflight"]).toBe(
      "tsx scripts/meeting-walkthrough-preflight.ts",
    );
  });
});

describe("S132 AC-S132-2: the local preflight script is effect-free", () => {
  it("gathers only identity, the F08 flag and Dotloop configuration presence; the rest stays Not run", () => {
    const local = gatherLocalEvidence({
      readGitHead: () => "abcdef0123456789",
      env: { LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED: "false" },
      nowIso: () => NOW,
    });
    expect(Object.keys(local).sort()).toEqual([
      "code_identity",
      "dotloop_selection_keys",
      "sheet_writeback_pause",
    ]);
    expect(local.code_identity?.state).toBe("verified");
    expect(local.code_identity?.evidence).toContain("abcdef012345");
    expect(local.sheet_writeback_pause?.state).toBe("verified");
    expect(local.dotloop_selection_keys?.state).toBe("pending_external_input");
    const preflight = projectMeetingPreflight(local, NOW);
    expect(preflight.counts.not_run).toBe(5);
    expect(preflight.heldLiveSteps.map((entry) => entry.step)).toEqual([
      "record_owner_terms",
      "record_tenant_response",
      "unsent_owner_draft",
      "unsent_tenant_draft",
      "dotloop_packet_preview",
      "exact_source_update",
    ]);
    const rendered = renderPreflight(preflight);
    expect(rendered).toMatch(/effect-free; nothing written, sent or scheduled/);
    expect(rendered).toMatch(
      /Managed mailbox connected for the signed-in sender: Not run/,
    );
    expect(rendered).toMatch(/how to gather:/);
  });

  it("fails the F08 check when the flag reads true and never reports Dotloop as verified from env alone", () => {
    const local = gatherLocalEvidence({
      readGitHead: () => null,
      env: {
        LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED: "true",
        DOTLOOP_OAUTH_CLIENT_ID: "x",
        DOTLOOP_OAUTH_CLIENT_SECRET: "secret-value-zq9",
        DOTLOOP_OAUTH_REDIRECT_URI: "https://example.test/cb",
      },
      nowIso: () => NOW,
    });
    expect(local.code_identity?.state).toBe("failed");
    expect(local.sheet_writeback_pause?.state).toBe("failed");
    expect(local.sheet_writeback_pause?.evidence).toMatch(/F08 requires false/);
    expect(local.dotloop_selection_keys?.state).toBe("pending_external_input");
    expect(JSON.stringify(local)).not.toContain("secret-value-zq9");
    expect(local.dotloop_selection_keys?.evidence).toMatch(/OAuth configured/);
  });

  it("merges a person's observed evidence and refuses unknown checks or shapes", () => {
    const local = gatherLocalEvidence({
      readGitHead: () => "abc",
      env: {},
      nowIso: () => NOW,
    });
    const merged = mergeObservedEvidence(local, {
      managed_mailbox: {
        state: "verified",
        evidence: "Connections page",
        observedAtIso: NOW,
      },
      code_identity: null,
    });
    expect(merged.managed_mailbox?.state).toBe("verified");
    expect(merged.code_identity).toBeNull();
    expect(() => mergeObservedEvidence(local, { mailbox: {} })).toThrow(
      /Unknown preflight check/,
    );
    expect(() =>
      mergeObservedEvidence(local, { managed_mailbox: { state: "verified" } }),
    ).toThrow(/needs state, evidence and observedAtIso/);
    expect(() => mergeObservedEvidence(local, [])).toThrow(
      /JSON object keyed by check id/,
    );
    expect(() =>
      projectMeetingPreflight(
        mergeObservedEvidence(local, {
          managed_mailbox: { state: "done", evidence: "x", observedAtIso: NOW },
        }),
        NOW,
      ),
    ).toThrow(/unknown state/);
  });
});
