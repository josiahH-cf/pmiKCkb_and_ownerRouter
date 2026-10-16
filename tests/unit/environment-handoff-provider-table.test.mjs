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
    expect(handoff).toContain(
      "| Serving revision          | `pmi-kc-app-rmv3yavsf-2cece39f7605`",
    );
    expect(handoff).toContain(
      "| Serving commit            | `eb5d35991c3ec128a102e4483d3779af16106821`",
    );
    expect(handoff).toContain(
      "Captured predecessor: `pmi-kc-app-rmv3vlx5t-b86fdd4c74ae` from commit",
    );
    expect(handoff).toContain("72a30e25537e8ea7ff79391146246c1f9b94375e");
    expect(handoff).toContain("pmi-kc-app-recovery-859ff7f8010648c1");
    expect(handoff).toContain("f10a32be-ff3d-4b3b-998f-ef2149914db0");
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

  it("separates preserved key metadata from current operation eligibility without resurrecting old blockers", () => {
    expect(normalizedIntegrations).toContain(
      "RentVine | Complete lease reads; retained work-order reads; authoritative lease/unit/portfolio data | Exact renewal contracts remain; maintenance creation/status/chat effects are retired at operation admission regardless of open metadata",
    );
    expect(normalizedIntegrations).toContain(
      "Google Sheets | Operating renewal read source and exact append/update target | Both exact keys remain open; the reviewed S159 switch value true serves normal append and recognized-field updates behind exact confirmation; false pauses all operating-Sheet mutations; reads and app-owned work remain available",
    );
    expect(normalizedIntegrations).toContain(
      "RentCast | Reference rental listings/market data with cache, usage counter, cap 50 | Exact read key open; never sets offered rent",
    );
    expect(normalizedIntegrations).toContain(
      "Gmail | Workflow-linked reads/labels, permitted rich unsent drafts and delivery history | Client sends, schedules and worker dispatch refused; protected activation metadata unchanged",
    );
    expect(integrations).toContain("Current application admission");
    expect(normalizedIntegrations).toContain(
      "these 18 are open and the other 30 are closed",
    );
    expect(normalizedIntegrations).toContain(
      "current application-admission refusal above overrides retired maintenance and all client-send keys",
    );
    expect(integrations).not.toContain("Q-RENTCAST-ACCOUNT-403");
    expect(integrations).not.toContain("RentCast action stays gated");
  });

  it("routes only genuine provider/client inputs to the current checklist", () => {
    expect(checklist).toContain("RentCast keeps provider order");
    expect(checklist).toContain("S98's bounded operating-Sheet proof is complete");
    expect(checklist).toContain("designated proof lease must not be reused");
    expect(checklist).toContain("never create a fake person, lease, work");
    expect(checklist).toContain("maintenance proof is retired");
    expect(checklist).toContain("asking anyone to repeat setup");
    expect(checklist).not.toContain("active API plan");
    expect(checklist).not.toContain("Q-RENTCAST-ACCOUNT-403");
  });
});
