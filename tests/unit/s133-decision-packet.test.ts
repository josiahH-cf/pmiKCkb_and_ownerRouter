import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDecisionPacket,
  EXTERNAL_AGENT_TRANSCRIPT_LABEL,
  IDENTITY_EVIDENCE_IDS,
  parseEvidenceTable,
  parseOptionsTable,
  SUPPORTING_SOURCE_KINDS,
  WORKFLOW_BOUNDARY_LABELS,
  type HandoffOption,
} from "@/lib/maintenance/external-agent-handoff-assessment";
import { findCustomerIdentifiers } from "@/lib/lease-renewal/meeting-walkthrough";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const PACKET_PATH =
  "docs/evidence/s133-external-maintenance-agent-handoff-assessment-2026-09-20.md";
const PACKET = readFileSync(resolve(process.cwd(), PACKET_PATH), "utf8");
const evidence = parseEvidenceTable(PACKET);
const options = parseOptionsTable(PACKET);

function tableRows(header: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  for (const line of PACKET.split("\n")) {
    const normalized = line.replace(/\s+/g, " ");
    if (normalized.startsWith(header)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+/.test(line)) continue;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

describe("S133 decision packet: AC-S133-1 identity rows", () => {
  it("marks vendor, account and access Not established with an exact requested input and owner", () => {
    for (const id of IDENTITY_EVIDENCE_IDS) {
      const row = evidence.find((candidate) => candidate.id === id);
      expect(row, id).toBeDefined();
      expect(row!.conclusion).toBe("not_established");
      expect(row!.requestedInput!.length).toBeGreaterThan(20);
      expect(row!.requestedFrom).not.toBeNull();
    }
    expect(PACKET).toContain(`transcript label, ${EXTERNAL_AGENT_TRANSCRIPT_LABEL}`);
    expect(PACKET).toMatch(/two different phonetic spellings and is not used/);
  });

  it("records no unsupported identity as fact and cites no guessed address", () => {
    expect(PACKET).not.toMatch(/https?:\/\//);
    for (const row of evidence.filter(
      (candidate) => candidate.conclusion === "supported",
    ))
      expect(SUPPORTING_SOURCE_KINDS.includes(row.sourceKind), row.id).toBe(true);
    for (const row of evidence.filter(
      (candidate) => candidate.sourceKind === "transcript",
    ))
      expect(row.conclusion, row.id).not.toBe("supported");
  });
});

describe("S133 decision packet: AC-S133-2 capability matrix", () => {
  const matrix = tableRows("| System | Interface kind |");

  it("demonstrates only PMI KC capabilities on supported code evidence; every vendor row is undemonstrated with unknowns", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(10);
    const byId = new Map(evidence.map((row) => [row.id, row]));
    for (const [system, , capability, , demonstrated, evidenceId, , unknowns] of matrix) {
      const source = byId.get(evidenceId);
      expect(source, `${capability} cites ${evidenceId}`).toBeDefined();
      if (demonstrated === "yes") {
        expect(system).toBe("PMI KC");
        expect(source!.conclusion).toBe("supported");
      } else {
        expect(unknowns.length, capability).toBeGreaterThan(1);
      }
      if (system === "External agent") expect(demonstrated).toBe("no");
    }
  });

  it("every repository-code source path exists", () => {
    for (const row of evidence.filter(
      (candidate) => candidate.sourceKind === "repository_code",
    ))
      for (const path of row.sourceRef.split(";").map((part) => part.trim()))
        expect(existsSync(resolve(process.cwd(), path)), `${row.id}: ${path}`).toBe(true);
  });
});

describe("S133 decision packet: AC-S133-3 ownership map", () => {
  const map = tableRows("| Boundary | PMI KC or RentVine today |");

  it("traces every boundary with a PMI KC owner and code evidence; claims stay claims with a decision item", () => {
    const labels = Object.values(WORKFLOW_BOUNDARY_LABELS);
    expect(map.map((row) => row[0])).toEqual(labels);
    for (const [boundary, owner, evidencePath, claim, claimEvidence, decision] of map) {
      expect(owner.length, boundary).toBeGreaterThan(10);
      for (const path of evidencePath.split(";").map((part) => part.trim()))
        expect(existsSync(resolve(process.cwd(), path)), `${boundary}: ${path}`).toBe(
          true,
        );
      expect(claimEvidence).not.toBe("Supported");
      if (claim !== "Not claimed") expect(decision.length, boundary).toBeGreaterThan(10);
    }
  });

  it("names the registry keys as the committed seed reads them", () => {
    const seed = new Map(
      ACTION_REGISTRY_SEED.map((entry) => [entry.key, entry.production_allowed]),
    );
    const keys = tableRows("| Key | Registry state |");
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const [key, state] of keys) {
      expect(seed.has(key), key).toBe(true);
      expect(state, key).toBe(seed.get(key) ? "open" : "closed");
    }
    expect(PACKET).toMatch(/No external autonomy becomes PMI KC authority/);
  });
});

describe("S133 decision packet: AC-S133-4 and AC-S133-5", () => {
  it("names the minimal fields, the stable-id or human join, and the stateful read", () => {
    expect(PACKET).toMatch(/a name or address match alone never joins/);
    expect(PACKET).toMatch(
      /Two similar units or duplicate resident names read\nambiguous/,
    );
    expect(PACKET).toMatch(/chat sync marks messages read/);
    expect(PACKET).toMatch(/refused by name/);
  });

  it("covers the eight scenarios with an unresolved external limit and a reconciler; no blind retry", () => {
    const scenarios = tableRows("| Scenario | PMI KC today |");
    expect(scenarios.map((row) => row[0])).toEqual([
      "Ordinary ticket",
      "Escalation",
      "Duplicate delivery",
      "Two similar units",
      "Missing resident contact",
      "Vendor outage",
      "Revoked access",
      "Uncertain handoff",
    ]);
    for (const [scenario, pmi, external, receipt, reconciler] of scenarios) {
      expect(pmi.length, scenario).toBeGreaterThan(10);
      expect(external, scenario).toMatch(/^Unresolved:/);
      expect(receipt.length, scenario).toBeGreaterThan(5);
      expect(reconciler.length, scenario).toBeGreaterThan(3);
    }
    expect(PACKET).toMatch(/never retried blind/);
  });
});

describe("S133 decision packet: AC-S133-6 bounded decision", () => {
  it("keeps every option conditional on named evidence and feasibility not established", () => {
    const ids = new Set(evidence.map((row) => row.id));
    expect(options.map((option) => option.id)).toEqual([
      "manual_link_only",
      "read_only_import",
      "governed_write_or_event",
    ]);
    for (const option of options) {
      expect(option.status).toBe("Conditional");
      for (const id of option.conditionalOn)
        expect(ids.has(id), `${option.id}: ${id}`).toBe(true);
      for (const id of IDENTITY_EVIDENCE_IDS) expect(option.conditionalOn).toContain(id);
    }
    const packet = buildDecisionPacket(
      evidence,
      options.map(
        (option): HandoffOption => ({
          id: option.id,
          label: option.id,
          description: "from packet",
          conditionalOn: [...option.conditionalOn],
        }),
      ),
    );
    expect(packet.feasibility).toBe("not_established");
    expect(packet.options.every((option) => option.status === "conditional")).toBe(true);
    expect(packet.requestedInputs.length).toBeGreaterThanOrEqual(8);
  });

  it("is tabletop, creates nothing, carries no identifier or secret and no PASS", () => {
    expect(PACKET).toMatch(/Tabletop analysis/);
    expect(PACKET).toMatch(
      /None creates a connector, scheduler, webhook,\nreplacement troubleshooting agent, new identity, new role or new action key/,
    );
    expect(PACKET).toMatch(/Research more is not an output/);
    expect(PACKET).toMatch(/Human verdict: NOT RUN/);
    expect(PACKET).not.toMatch(/\bPASS\b/);
    expect(findCustomerIdentifiers(PACKET.replace(/`[^`]*`/g, ""))).toEqual([]);
    expect(PACKET).not.toMatch(/api[_-]?key\s*[:=]\s*\S|secret\s*[:=]\s*\S/i);
  });
});
