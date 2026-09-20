// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PolicyMaterialAdminPanel } from "@/components/admin/PolicyMaterialAdminPanel";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { PolicyMaterialVersionRecord } from "@/lib/firestore/lease-renewal-policy-material";
import {
  MISSING_POLICY_MATERIAL,
  type PolicyMaterialConfig,
  type PolicyMaterialSnapshot,
} from "@/lib/lease-renewal/policy-content";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S131 (F11): the workspace shows applicability, its basis and the exact missing materials; the
// Admin surface submits and decides exact versions. No text ever claims verified coverage, no
// paragraph is invented, and no request leaves the page except the mocked Admin calls.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONFIG: PolicyMaterialConfig = {
  schemaVersion: "policy-material/v1",
  productKey: "rhino",
  version: "synthetic-v1",
  reference: "SYNTHETIC fixture",
  publicationSource: {
    system: "s21_publication",
    reference: "publication:synthetic-0000001",
    contentHash: "f".repeat(64),
  },
  review: {
    reviewer: "synthetic-reviewer",
    reviewedAt: "2026-09-20T12:00:00Z",
    note: "SYNTHETIC",
  },
  effectiveFrom: "2026-01-01",
  applicability: {
    ruleVersion: "rule-v1",
    condition: {
      kind: "fact_equals",
      factKey: "deposit.type",
      expectedValue: "replacement_policy",
    },
  },
  requiredInputs: [
    {
      factKey: "deposit.type",
      label: "Deposit type",
      allowedSourceSystems: ["rentvine"],
    },
  ],
  outputSlots: [
    {
      slotId: "tenant_paragraph",
      channel: "tenant_message",
      text: "SYNTHETIC {{deposit.type}}.",
    },
  ],
  conditions: {},
};

function manualState(outcome: "done" | "not_applicable" | null, leaseId: string) {
  if (!outcome) return null;
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace(leaseId, "cycle-1", {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    }),
    {
      kind: "activity",
      activity: "rhino",
      outcome,
      source: "SYNTHETIC staff note",
      ...(outcome === "not_applicable"
        ? {
            reason: "SYNTHETIC reason",
            applicabilityPolicy: "SYNTHETIC policy reference",
          }
        : {}),
    },
    { actorUid: "editor-1", recordedAt: "2026-09-20T12:00:00.000Z", eventId: "e1" },
  );
}

function renderWorkspace(
  material: PolicyMaterialSnapshot | null,
  options: { manual?: "done" | "not_applicable" | null; sheet?: string | null } = {},
) {
  const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
  if (!value) throw new Error("sample workspace missing");
  return render(
    <RenewalWorkspace
      role="Editor"
      workspace={value}
      manualState={manualState(options.manual ?? null, value.summary.id)}
      manualCycleBasis={{
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      }}
      policyMaterial={material}
      policySheetValue={options.sheet ?? null}
      policyTodayIso="2026-09-20"
      workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
    />,
  );
}

describe("S131 workspace policy panel (AC-S131-1, AC-S131-4, AC-S131-6)", () => {
  it("shows Pending approved policy material with the exact missing items and evidence notes, and never verified coverage", () => {
    renderWorkspace(MISSING_POLICY_MATERIAL, { manual: "done", sheet: "Yes" });
    const panel = document.getElementById("renewal-policy-content-rhino");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-renewal-policy-applicability", "unknown");
    expect(panel).toHaveAttribute(
      "data-renewal-policy-reason",
      "pending_approved_material",
    );
    expect(panel).toHaveAttribute("data-renewal-policy-identified", "true");
    expect(panel).toHaveTextContent(/Rhino policy: pending approved policy material/);
    const missing = panel!.querySelector(
      "[data-renewal-policy-missing-list]",
    ) as HTMLElement;
    expect(
      within(missing).getAllByRole("link", { name: /Submit or approve material/ })[0],
    ).toHaveAttribute("href", "/admin#admin-policy-material");
    expect(
      within(missing).getByRole("link", { name: "Open the follow-up record" }),
    ).toHaveAttribute("href", "#renewal-manual-rhino");
    expect(panel!.querySelector("[data-renewal-policy-evidence]")).toHaveTextContent(
      /evidence to review, not a confirmed policy/,
    );
    expect(panel!.querySelector("[data-renewal-policy-evidence]")).toHaveTextContent(
      /does not verify coverage/,
    );
    const outputs = Array.from(
      panel!.querySelectorAll("[data-renewal-policy-output]"),
    ).map((node) => node.getAttribute("data-renewal-policy-output"));
    expect(outputs).toEqual(["blocked", "blocked", "blocked"]);
    expect(panel).toHaveTextContent("Follow-up recorded by staff");
    expect(panel).toHaveTextContent(/Done \(recorded task, not coverage\)/);
    expect(panel!.textContent).not.toMatch(/coverage verified|premium|claim/i);
    expect(panel!.textContent).not.toMatch(/SYNTHETIC \{\{|deposit type/i);
  });

  it("omits every output for a reviewed not-applicable lease and blocks only the dependent wording for an applicable lease without facts", () => {
    renderWorkspace(
      { state: "approved", active: CONFIG, activeRevision: 2, pendingVersions: [] },
      { manual: "not_applicable" },
    );
    let panel = document.getElementById("renewal-policy-content-rhino")!;
    expect(panel).toHaveAttribute("data-renewal-policy-applicability", "not_applicable");
    expect(panel).toHaveTextContent(/Staff review: SYNTHETIC staff note/);
    expect(
      Array.from(panel.querySelectorAll("[data-renewal-policy-output]")).map((node) =>
        node.getAttribute("data-renewal-policy-output"),
      ),
    ).toEqual(["omitted", "omitted", "omitted"]);
    cleanup();
    renderWorkspace({
      state: "approved",
      active: CONFIG,
      activeRevision: 2,
      pendingVersions: [],
    });
    panel = document.getElementById("renewal-policy-content-rhino")!;
    expect(panel).toHaveAttribute("data-renewal-policy-reason", "rule_needs_facts");
    expect(panel).toHaveTextContent(
      /Approved material synthetic-v1 \(SYNTHETIC fixture\), rule rule-v1/,
    );
    expect(
      panel.querySelector('[data-renewal-policy-missing="verified_fact"]'),
    ).toHaveTextContent(/Verified fact deposit.type/);
    expect(panel.textContent).not.toMatch(/SYNTHETIC \{\{/);
  });

  it("renders no policy panel when the page did not read policy inputs (preservation)", () => {
    renderWorkspace(null);
    expect(document.getElementById("renewal-policy-content-rhino")).toBeNull();
  });
});

describe("S131 Admin intake and decision surface (AC-S131-2, AC-S131-3)", () => {
  const pending: PolicyMaterialVersionRecord = {
    id: "rhino:synthetic-v1",
    product_key: "rhino",
    version: "synthetic-v1",
    state: "pending",
    revision: 1,
    config: CONFIG,
    submitted_at: "2026-09-20T12:00:00Z",
    submitted_by_uid: "admin-1",
  };

  it("submits a version as pending and approves the exact version with a reason, through the Admin route only", async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : null;
        calls.push({ method, body });
        if (method === "GET")
          return new Response(
            JSON.stringify({ policyMaterial: { records: [pending] } }),
            { status: 200 },
          );
        if (method === "POST")
          return new Response(
            JSON.stringify({ policyMaterial: { record: pending, duplicate: false } }),
            { status: 200 },
          );
        return new Response(
          JSON.stringify({
            policyMaterial: {
              record: { ...pending, state: "approved", revision: 2 },
              duplicate: false,
            },
          }),
          { status: 200 },
        );
      }),
    );
    render(<PolicyMaterialAdminPanel initial={[]} />);
    expect(screen.getByText("No versions submitted.")).toBeInTheDocument();
    expect(screen.getByText(/In use:/)).toHaveTextContent(/none/);
    const submit = screen.getByRole("button", { name: "Submit as pending" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Configuration (JSON)"), {
      target: { value: JSON.stringify(CONFIG) },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/recorded as pending/),
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: { config: expect.objectContaining({ version: "synthetic-v1" }) },
    });
    expect(String(calls[0]?.body?.operationId)).toMatch(/^[0-9a-f-]{36}$/);
    const approve = await screen.findByRole("button", {
      name: "Approve version synthetic-v1",
    });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "SYNTHETIC decision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve version synthetic-v1" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/now approved/),
    );
    const decision = calls.find((call) => call.method === "PATCH");
    expect(decision?.body).toMatchObject({
      productKey: "rhino",
      version: "synthetic-v1",
      decision: "approve",
      reason: "SYNTHETIC decision",
      expectedRevision: 1,
    });
    expect(
      calls.every(
        (call) =>
          call.method === "GET" || call.method === "POST" || call.method === "PATCH",
      ),
    ).toBe(true);
  });

  it("shows a refused submission's reason without changing the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "Version synthetic-v1 already exists for rhino." }),
            { status: 409 },
          ),
      ),
    );
    render(<PolicyMaterialAdminPanel initial={[pending]} />);
    fireEvent.change(screen.getByLabelText("Configuration (JSON)"), {
      target: { value: "{not json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit as pending" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the configuration as valid JSON.",
    );
    fireEvent.change(screen.getByLabelText("Configuration (JSON)"), {
      target: { value: JSON.stringify(CONFIG) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit as pending" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/already exists/),
    );
    expect(document.querySelectorAll("[data-policy-material-state]")).toHaveLength(1);
    expect(document.querySelector("[data-policy-material-state]")).toHaveAttribute(
      "data-policy-material-state",
      "pending",
    );
  });
});
