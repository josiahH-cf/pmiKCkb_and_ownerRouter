import { fingerprintTab } from "@/lib/lease-renewal/fingerprint";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";
import { SYNTHETIC_TAB_FIXTURES } from "../fixtures/lease-renewal/synthetic-renewal-sheet";

/**
 * Test-only mocked read connector for the lease-renewal Phase-1 path. Simulates a read-only
 * Rentvine lease-list read and a Google Sheets renewal-checklist STRUCTURE read entirely in
 * memory — no network, no SDK, no live transport. Each read validates its payload against the
 * matching Action Registry entry's preview schema (so the new renewal_checklist.read entry is
 * load-bearing) and the structure read hard-excludes the credential tabs 4 & 7 and returns no
 * cell values.
 */

function schemaFor(key: string) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
  if (!entry?.preview_payload_schema) {
    throw new Error(`Seed entry ${key} is missing a preview_payload_schema.`);
  }
  return entry.preview_payload_schema.map((field) => ({ required: false, ...field }));
}

function assertValidPayload(key: string, payload: Record<string, unknown>) {
  const result = validatePreviewPayload(schemaFor(key), payload);
  if (!result.ok) {
    throw new Error(`Invalid ${key} payload: ${result.errors.join(" ")}`);
  }
}

export interface MockRenewalReadEvent {
  action: string;
  payload: unknown;
}

export interface MockRenewalCandidate {
  lease_id: string;
}

export interface MockChecklistTabStructure {
  tabNumber: number;
  label: string;
  recognizedAs: string;
}

export interface MockLeaseRenewalReadConnector {
  events: MockRenewalReadEvent[];
  listRenewalCandidates(filter: {
    lease_id?: string;
    lease_end_before?: string;
  }): MockRenewalCandidate[];
  readChecklistStructure(payload: {
    target_sheet: string;
    tab_scope: string;
  }): MockChecklistTabStructure[];
}

export function createMockLeaseRenewalReadConnector(): MockLeaseRenewalReadConnector {
  const events: MockRenewalReadEvent[] = [];

  return {
    events,
    listRenewalCandidates(filter) {
      assertValidPayload("rentvine.lease.read", filter as Record<string, unknown>);
      events.push({ action: "rentvine.lease.read", payload: filter });
      // Synthetic, PII-free candidate identifiers only.
      return [{ lease_id: "unit-1041" }, { lease_id: "unit-1042" }];
    },
    readChecklistStructure(payload) {
      assertValidPayload(
        "google_sheets.renewal_checklist.read",
        payload as unknown as Record<string, unknown>,
      );
      events.push({ action: "google_sheets.renewal_checklist.read", payload });
      // Hard-exclude credential tabs 4 & 7; return structure only, never cell values.
      return SYNTHETIC_TAB_FIXTURES.filter((fixture) => !fixture.credentialBearing).map(
        (fixture) => ({
          tabNumber: fixture.tabNumber,
          label: fixture.label,
          recognizedAs: fingerprintTab(fixture.grid).tab,
        }),
      );
    },
  };
}
