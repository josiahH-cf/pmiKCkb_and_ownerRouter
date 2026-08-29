import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(root, path), "utf8");

const handoff = read("docs/environment-handoff.md");
const integrations = read("docs/integration-architecture.md");
const checklist = read("docs/client-checklist.md");
const normalizedIntegrations = integrations.replace(/\s+/g, " ");

const CURRENT_PROVIDERS = [
  "RentVine",
  "Google Sheets",
  "RentCast",
  "Gmail",
  "Firestore",
  "Drive/Storage",
  "Dotloop",
  "LeadSimple",
  "Resident/Vendor channels",
];

describe("current provider and environment documentation", () => {
  it("pins the exact serving environment instead of a historical cutover target", () => {
    expect(handoff).toContain("pmi-kc-app-rmtep3ke9-9d3ecafb0c2e");
    expect(handoff).toContain("2d7903d42dce9dbfad49338b959e467f6c333ccc");
    expect(handoff).toContain("pmi-kc-app-rmtbh280n-61b78ef991cc");
    expect(handoff).toContain("6aea639728efcad70e3e601e7a031c2b35722e08");
    expect(handoff).toContain("pmi-kc-app-rmtafuqbg-4e2e4ffe0f48");
    expect(handoff).toContain(
      "The 2026-08-27 rehearsal switched the predecessor to 100%",
    );
    expect(handoff).toContain("Forward restoration");
    expect(handoff).toContain("Production + Live");
    expect(handoff).toContain("Sheet write-back");
    expect(handoff).toContain("false");
    expect(handoff).not.toContain("pmi-kc-kb-demo");
  });

  it("keeps every current provider in the one active provider table", () => {
    for (const provider of CURRENT_PROVIDERS) {
      expect(integrations, `Missing current provider row: ${provider}`).toContain(
        `| ${provider}`,
      );
    }
  });

  it("records the live read/write boundaries without resurrecting old blockers", () => {
    expect(normalizedIntegrations).toContain(
      "RentVine | Complete lease reads; work-order reads; authoritative lease/unit/portfolio data | Renewal dry-preview only; write key closed",
    );
    expect(normalizedIntegrations).toContain(
      "Google Sheets | Operating renewal read source | Operating write off; distinct rehearsal-copy proof pending",
    );
    expect(normalizedIntegrations).toContain(
      "RentCast | Reference rental listings/market data with cache, usage counter, cap 50 | Exact read key open; never sets offered rent",
    );
    expect(normalizedIntegrations).toContain(
      "Gmail | Workflow reads, replies, labels, unsent renewal/maintenance drafts | Direct/generic notice sends closed",
    );
    expect(integrations).not.toContain("Q-RENTCAST-ACCOUNT-403");
    expect(integrations).not.toContain("RentCast action stays gated");
  });

  it("routes only genuine provider/client inputs to the current checklist", () => {
    expect(checklist).toContain(
      "RentCast radius, comp count, freshness/selection policy",
    );
    expect(checklist).toContain("Distinct verbatim Sheet copy");
    expect(checklist).toContain("One unmistakable RentVine test lease/owner");
    expect(checklist).toContain("protected gate separately");
    expect(checklist).not.toContain("active API plan");
    expect(checklist).not.toContain("Q-RENTCAST-ACCOUNT-403");
  });
});
