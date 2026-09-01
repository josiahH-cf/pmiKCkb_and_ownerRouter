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
    expect(handoff).toContain("pmi-kc-app-rmtimspsj-ee9bbf50108f");
    expect(handoff).toContain("72f926d96aead0b5b6826494713203672a18a40a");
    expect(handoff).toContain("pmi-kc-app-rmtiii4il-dcf1708c88b8");
    expect(handoff).toContain("353a0a9de81459d5271dcff0e6c2bae3d11cc188");
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
      "RentVine | Complete lease reads; current work-order list reads; authoritative lease/unit/portfolio data | Current renewal/work-order writes closed; exact S97/S99/S100 operations specified",
    );
    expect(normalizedIntegrations).toContain(
      "Google Sheets | Operating renewal read source | Current write switch off; exact S98 append/update specified",
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
    expect(checklist).toContain("RentCast keeps provider order");
    expect(checklist).toContain("S98 may append one temporary source-backed proof row");
    expect(checklist).toContain("sole S97 RentVine property/lease target");
    expect(checklist).toContain("bounded protected proof window");
    expect(checklist).toContain("final activation");
    expect(checklist).not.toContain("active API plan");
    expect(checklist).not.toContain("Q-RENTCAST-ACCOUNT-403");
  });
});
