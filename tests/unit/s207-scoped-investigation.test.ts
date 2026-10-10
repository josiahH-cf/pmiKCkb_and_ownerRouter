import { it, expect } from "vitest";
import * as assessment from "@/lib/maintenance/external-agent-handoff-assessment";
const publicRow: assessment.VendorooProgramEvidence = {
  id: "E-S207-PUBLIC",
  capability: "interface_auth",
  sourceKind: "official_documentation",
  sourceRef: assessment.VENDOROO_PRIMARY_REFERENCES[0],
  observedAt: "2026-10-09T22:00:00Z",
  accountScopeHash: null,
  conclusion: "supported",
  current: true,
  fields: [],
};
it("public documentation and a pending account reply cannot establish production account integration readiness", () => {
  expect(assessment.assessVendorooProgramContract([])).toMatchObject({
    state: "requires_material_input",
    supported: 0,
    accountVerified: 0,
  });
  expect(assessment.assessVendorooProgramContract([publicRow])).toMatchObject({
    state: "requires_material_input",
    supported: 1,
    accountVerified: 0,
  });
});
it("current account evidence cannot conceal missing open-work topology, stale entitlement or conflicting claims", () => {
  const account = {
    ...publicRow,
    id: "E-S207-ACCOUNT",
    sourceKind: "authorized_account_read" as const,
    sourceRef: `private-evidence:${"a".repeat(64)}`,
    accountScopeHash: "b".repeat(64),
  };
  expect(assessment.assessVendorooProgramContract([account])).toMatchObject({
    state: "requires_material_input",
    accountVerified: 1,
    currentAccountRead: true,
  });
  expect(
    assessment.assessVendorooProgramContract([{ ...account, current: false }])
      .accountVerified,
  ).toBe(0);
  expect(
    assessment.assessVendorooProgramContract([
      account,
      { ...account, id: "E-S207-CONFLICT", conclusion: "unsupported" },
    ]).state,
  ).toBe("inconclusive");
  expect(assessment.assessVendorooProgramContract([account, account]).state).toBe(
    "inconclusive",
  );
  expect(
    assessment.assessVendorooProgramContract([
      account,
      { ...account, id: "E-S207-OTHER", accountScopeHash: "c".repeat(64) },
    ]).state,
  ).toBe("inconclusive");
});
it("rejects secret URLs, invented primary references and unbound account evidence", () => {
  for (const row of [
    { ...publicRow, sourceRef: "https://secret.invalid/company/token" },
    { ...publicRow, sourceKind: "authorized_account_read" },
    { ...publicRow, accountScopeHash: "b".repeat(64) },
  ])
    expect(assessment.VendorooProgramEvidenceSchema.safeParse(row).success).toBe(false);
  const result = assessment.assessVendorooProgramContract([publicRow]);
  expect(JSON.stringify(result)).not.toMatch(/https:|private-evidence|b{64}/);
});
it("duplicate, out-of-order, absent identity, takeover, access loss, partial reads and stateful reads have bounded honest dispositions", () => {
  const current = {
    eventIdentity: "stable_verified",
    canonicalJoin: "verified",
    ownership: "provider",
    access: "current",
    coverage: "complete",
    readEffect: "none_documented",
    order: "new",
  } as const;
  expect(assessment.classifyVendorooObservation(current)).toBe(
    "eligible_readonly_observation",
  );
  for (const [patch, expected] of [
    [{ order: "duplicate" }, "retain_original"],
    [{ order: "older" }, "retain_history_without_regression"],
    [{ eventIdentity: "missing" }, "hold_identity"],
    [{ canonicalJoin: "ambiguous" }, "hold_identity"],
    [{ ownership: "pmi_takeover" }, "retain_pmi_ownership"],
    [{ access: "revoked" }, "hold_access"],
    [{ coverage: "partial" }, "hold_coverage"],
    [{ coverage: "close_only" }, "hold_coverage"],
    [{ readEffect: "stateful" }, "hold_consequential_read"],
  ] as const)
    expect(assessment.classifyVendorooObservation({ ...current, ...patch })).toBe(
      expected,
    );
});
