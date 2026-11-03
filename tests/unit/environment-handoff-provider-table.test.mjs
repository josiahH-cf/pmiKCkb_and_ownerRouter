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
const normalizedChecklist = checklist.replace(/\s+/g, " ");

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
      "| Serving revision          | `pmi-kc-app-rmvzwt7ms-00754475effd`",
    );
    expect(handoff).toContain(
      "| Serving commit            | `bc97535379dd08deab578455b00a80fc93b8d209`",
    );
    expect(handoff).toContain(
      "Captured predecessor: `pmi-kc-app-rmvqk1okt-ecd4a985b1de` from commit",
    );
    expect(handoff).toContain("6fbd62250ccd9df1b9861a59b5de21c2143a68c0");
    expect(handoff).toContain("pmi-kc-app-recovery-d4c109a06dce4c4d");
    expect(handoff).toContain("89d909b7-73bf-4ff8-b71c-98456c7b4c0f");
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
      "RentVine | Complete lease reads; authoritative lease/unit/portfolio data; maintenance reads retired | Exact renewal contracts remain; all work-order operations are retired at operation admission regardless of open metadata",
    );
    expect(normalizedIntegrations).toContain(
      "Google Sheets | Operating renewal read source and exact append/update target | Both exact keys remain open; the reviewed S159 switch value true serves normal append and recognized-field updates behind exact confirmation; false pauses all operating-Sheet mutations; reads and app-owned work remain available",
    );
    expect(normalizedIntegrations).toContain(
      "RentCast | Reference rental listings/market data with cache, usage counter, cap 50 | Exact read key open; never sets offered rent",
    );
    expect(normalizedIntegrations).toContain(
      "Gmail | Workflow-linked reads/labels, reviewed unsent drafts and exact confirmed renewal delivery | Fresh staff-confirmed renewal Send/Schedule/Resume and linked replies; old authorizations and maintenance refused; protected activation metadata unchanged",
    );
    expect(integrations).toContain("Current application admission");
    expect(normalizedIntegrations).toContain(
      "these 18 are open and the other 30 are closed",
    );
    expect(normalizedIntegrations).toContain(
      "current application-admission policy above overrides retired maintenance keys and legacy delivery authorizations",
    );
    expect(integrations).not.toContain("Q-RENTCAST-ACCOUNT-403");
    expect(integrations).not.toContain("RentCast action stays gated");
  });

  it("routes only genuine provider/client inputs to the current checklist", () => {
    expect(checklist).toContain("RentCast keeps provider order");
    expect(checklist).toContain("S98's bounded operating-Sheet proof is complete");
    expect(checklist).toContain("designated proof lease must not be reused");
    expect(checklist).toContain("never create a fake person, lease, work");
    expect(normalizedChecklist).toContain(
      "Custom maintenance, resident intake, operational Vendor work and remaining maintenance proofs are retired",
    );
    expect(normalizedChecklist).toContain(
      "No repeat membership, credential, template recreation or status-choice ask is needed",
    );
    expect(checklist).not.toContain("active API plan");
    expect(checklist).not.toContain("Q-RENTCAST-ACCOUNT-403");
  });
});
