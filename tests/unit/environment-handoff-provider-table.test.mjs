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
      "| Serving revision          | `pmi-kc-app-rmv3tf7u6-16d1e4a13e04`",
    );
    expect(handoff).toContain(
      "| Serving commit            | `623152fb1718007d085dbfeb99fc22627ef5b3bf`",
    );
    expect(handoff).toContain(
      "Captured predecessor: `pmi-kc-app-rmv2ixuq7-b0c62b52cd5d` from commit",
    );
    expect(handoff).toContain("780f48db1d7d6a7cc855035d934621f77a28a257");
    expect(handoff).toContain("pmi-kc-app-recovery-e4ea4d39d9f74a0d");
    expect(handoff).toContain("24c94459-0064-4ad6-9b27-35c8b599864f");
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
      "RentVine | Complete lease reads; work-order reads; authoritative lease/unit/portfolio data | Exact S97 renewal, S99 work-order, and S100 chat-sync keys are open",
    );
    expect(normalizedIntegrations).toContain(
      "Google Sheets | Operating renewal read source and exact append/update target | Both exact keys remain open; the reviewed S159 switch value true serves normal append and recognized-field updates behind exact confirmation; false pauses all operating-Sheet mutations; reads and app-owned work remain available",
    );
    expect(normalizedIntegrations).toContain(
      "RentCast | Reference rental listings/market data with cache, usage counter, cap 50 | Exact read key open; never sets offered rent",
    );
    expect(normalizedIntegrations).toContain(
      "Gmail | Workflow reads/replies/labels, rich linked drafts and human Send/Schedule | Two scoped human notice sequence keys open; generic send closed",
    );
    expect(integrations).not.toContain("Q-RENTCAST-ACCOUNT-403");
    expect(integrations).not.toContain("RentCast action stays gated");
  });

  it("routes only genuine provider/client inputs to the current checklist", () => {
    expect(checklist).toContain("RentCast keeps provider order");
    expect(checklist).toContain("S98's bounded operating-Sheet proof is complete");
    expect(checklist).toContain("designated proof lease must not be reused");
    expect(checklist).toContain("never create a fake person, lease, work");
    expect(checklist).toContain("remains closed until one synchronized resident message");
    expect(checklist).not.toContain("active API plan");
    expect(checklist).not.toContain("Q-RENTCAST-ACCOUNT-403");
  });
});
