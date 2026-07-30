import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { apiErrorResponse } from "@/lib/api/editable";
import {
  createLiveEffectAttentionEvent,
  emitLiveEffectRequiresAttention,
} from "@/lib/operations/live-effect-attention-log";
// @ts-expect-error The print-only JavaScript planner intentionally has no TypeScript declaration.
// prettier-ignore
import { buildMonitoringPlan, renderMonitoringPlan, resolveMonitoringConfig } from "../../scripts/setup-monitoring.mjs";
// @ts-expect-error The git-only JavaScript verifier intentionally has no TypeScript declaration.
import { REDACTED_TREES, evaluateRedaction } from "../../scripts/check-redaction.mjs";

const OPERATOR_EMAIL = ["log-hygiene-fixture", "pmikcmetro.com"].join("@");
const OWNER_PACKET = readFileSync(
  join(process.cwd(), "docs", "s51-production-operations-owner-packet-2026-07-30.md"),
  "utf8",
);
const NORMALIZED_OWNER_PACKET = OWNER_PACKET.replace(/\s+/g, " ");
const REDACTION_SOURCE = readFileSync(
  join(process.cwd(), "scripts", "check-redaction.mjs"),
  "utf8",
);
const SENSITIVE_FIXTURE = Object.freeze({
  address: "resident-fixture@example.invalid",
  body: "Fixture message body for a resident at Unit 204.",
  token: "fixture-secret-token-value",
});

interface PlanCommand {
  args?: string[];
  capture?: string;
  command?: string;
  kind?: string;
  mutationMarker?: string;
  rollbackMarker?: string;
  whenCaptureEmpty?: string;
}

function monitoringCommands(): PlanCommand[] {
  const config = resolveMonitoringConfig([`--operator-email=${OPERATOR_EMAIL}`], {});
  return buildMonitoringPlan(config).flatMap(
    (step: { commands: PlanCommand[] }) => step.commands,
  );
}

function commandMatches(command: PlanCommand, ...prefix: string[]) {
  return (
    command.command === prefix[0] &&
    Array.isArray(command.args) &&
    prefix.slice(1).every((value, index) => command.args?.[index] === value)
  );
}

describe("S51 production log hygiene", () => {
  it("prints an explicit reversible 30-day bucket setting and one direct viewer grant", () => {
    const commands = monitoringCommands();
    const bucketUpdates = commands.filter((command) =>
      commandMatches(command, "gcloud", "logging", "buckets", "update", "_Default"),
    );
    const viewerGrant = commands.filter((command) =>
      commandMatches(command, "gcloud", "projects", "add-iam-policy-binding"),
    );
    const viewerRemoval = commands.filter((command) =>
      commandMatches(command, "gcloud", "projects", "remove-iam-policy-binding"),
    );
    const viewerReads = commands.filter((command) =>
      commandMatches(command, "gcloud", "projects", "get-iam-policy"),
    );

    expect(bucketUpdates).toHaveLength(2);
    expect(bucketUpdates[0].args).toContain("--retention-days=30");
    expect(bucketUpdates[0]).toMatchObject({
      mutationMarker: "LOG_RETENTION_CHANGED_BY_THIS_RUN",
    });
    expect(bucketUpdates[1].args).toContain("$LOG_BUCKET_RETENTION_DAYS_BEFORE");
    expect(bucketUpdates[1]).toMatchObject({
      rollbackMarker: "LOG_RETENTION_CHANGED_BY_THIS_RUN",
    });
    expect(viewerGrant).toHaveLength(1);
    expect(viewerGrant[0].args).toEqual(
      expect.arrayContaining([
        `--member=user:${OPERATOR_EMAIL}`,
        "--role=roles/logging.viewer",
        "--condition=None",
      ]),
    );
    expect(viewerGrant[0]).toMatchObject({
      mutationMarker: "LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN",
      whenCaptureEmpty: "LOG_VIEWER_BINDING_BEFORE",
    });
    expect(viewerRemoval).toHaveLength(1);
    expect(viewerRemoval[0]).toMatchObject({
      rollbackMarker: "LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN",
    });
    expect(viewerReads).toHaveLength(2);
    for (const read of viewerReads) {
      expect(read.args).toContain(
        `--filter=bindings.role="roles/logging.viewer" AND bindings.members="user:${OPERATOR_EMAIL}" AND -bindings.condition:*`,
      );
    }

    const serialized = JSON.stringify(commands);
    expect(serialized).not.toContain("roles/logging.privateLogViewer");
    for (const primitiveRole of ["roles/owner", "roles/editor", "roles/viewer"]) {
      expect(serialized).not.toContain(`--role=${primitiveRole}`);
    }
  });

  it("keeps the owner packet unapplied, value-free, and honest about inherited access", () => {
    expect(OWNER_PACKET).toContain("Status: NOT RUN");
    expect(OWNER_PACKET).toContain("S52 has a reviewed, non-null");
    expect(OWNER_PACKET).toContain("S40 has settled the exact Production");
    expect(OWNER_PACKET).toContain("npm run preflight:adc");
    expect(OWNER_PACKET).toContain("npm run monitoring:plan");
    expect(OWNER_PACKET).toContain("npm run monitoring:verify");
    expect(OWNER_PACKET).toContain("LOG_BUCKET_RETENTION_DAYS_BEFORE");
    expect(OWNER_PACKET).toContain("LOG_VIEWER_BINDING_BEFORE");
    expect(OWNER_PACKET).toContain("-bindings.condition:*");
    expect(NORMALIZED_OWNER_PACKET).toContain(
      "A conditional viewer binding does not count as a pre-existing unconditional grant",
    );
    expect(NORMALIZED_OWNER_PACKET).toContain(
      "Adding the direct viewer binding does not remove an inherited",
    );
    expect(NORMALIZED_OWNER_PACKET).toContain(
      "Fresh setup refuses when any S51 managed channel or policy, or the fixed A2 metric, already exists.",
    );
    expect(OWNER_PACKET).toContain("LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN");
    expect(OWNER_PACKET).toContain("MONITORING_METRIC_CREATED_BY_THIS_RUN");
    expect(NORMALIZED_OWNER_PACKET).toContain("do not guess ownership");
    expect(OWNER_PACKET).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  });

  it("renders checked failure state and run-owned rollback without an empty-value delete shortcut", () => {
    const resolved = resolveMonitoringConfig([`--operator-email=${OPERATOR_EMAIL}`], {});
    const output = renderMonitoringPlan(resolved, buildMonitoringPlan(resolved));

    expect(output).toContain(
      'if LOG_VIEWER_BINDING_BEFORE="$(gcloud projects get-iam-policy',
    );
    expect(output).toContain("log_viewer_before_state_unreadable");
    expect(output).toContain("managed_metric_already_exists");
    expect(output).toContain(
      'if test "${LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN:-0}" = 1; then',
    );
    expect(output).toContain(
      'if test "${MONITORING_METRIC_CREATED_BY_THIS_RUN:-0}" = 1; then',
    );
    expect(output).not.toContain(
      'if test -z "$LOG_VIEWER_BINDING_BEFORE"; then gcloud projects remove-iam-policy-binding',
    );
  });

  it("keeps representative API-error and A2 payloads free of shared sensitive fixtures", async () => {
    const fixtureText = JSON.stringify(SENSITIVE_FIXTURE);
    const response = apiErrorResponse(new SyntaxError(fixtureText));
    const responsePayload = JSON.stringify(await response.json());

    const event = createLiveEffectAttentionEvent({
      actionKey: "vendor.gmail.health",
      executionId: "external_log_hygiene_fixture",
      state: "ambiguous",
      dataMode: "live",
      ...SENSITIVE_FIXTURE,
    });
    const sink = { error: vi.fn() };
    emitLiveEffectRequiresAttention(event!, sink);
    const logPayload = String(sink.error.mock.calls[0]?.[0]);

    expect(response.status).toBe(400);
    expect(JSON.parse(responsePayload)).toEqual({
      error: "Invalid JSON request body.",
    });
    expect(JSON.parse(logPayload)).toEqual(event);
    for (const sensitive of Object.values(SENSITIVE_FIXTURE)) {
      expect(responsePayload).not.toContain(sensitive);
      expect(logPayload).not.toContain(sensitive);
    }
  });

  it("pins verify:redaction to its existing git-only scope", () => {
    expect(REDACTED_TREES).toEqual(["golden-data/", "docs/client_docs/"]);
    expect(
      evaluateRedaction({
        gitignoreLines: ["/golden-data/", "docs/client_docs/"],
        trackedFiles: [],
      }),
    ).toEqual({ ok: true, problems: [] });
    expect(REDACTION_SOURCE).toContain("git ls-files");
    expect(REDACTION_SOURCE).toContain(".gitignore");
    expect(REDACTION_SOURCE).not.toMatch(
      /\bgcloud\b|logging\.googleapis\.com|monitoring\.googleapis\.com|\bGoogleAuth\b|\bfetch\s*\(/,
    );
  });
});
