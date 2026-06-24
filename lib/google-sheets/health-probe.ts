// Real transport for the `health.google_sheets.api` contract, backed by the read-only Sheets reader.
//
// Fills the three contract steps (config_presence, auth_validation, endpoint_probe) through the
// existing `runHealthCheck` seam. One metadata read (tab-title list) is memoized across the auth and
// probe steps. `detail` strings carry counts/status only — never sheet cell values (PII).

import type {
  HealthCheckContract,
  HealthCheckProbeResult,
  HealthCheckStep,
  HealthCheckTransport,
} from "@/lib/integrations/health-checks";
import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";

export function createGoogleSheetsHealthCheckTransport(
  reader: SheetsValuesReader,
  spreadsheetId: string,
): HealthCheckTransport {
  let titles: Promise<string[]> | null = null;
  const getTitles = (): Promise<string[]> => {
    titles ??= reader.listTabTitles(spreadsheetId);
    return titles;
  };

  return {
    async probe(
      _contract: HealthCheckContract,
      step: HealthCheckStep,
    ): Promise<HealthCheckProbeResult> {
      switch (step.kind) {
        case "config_presence":
          return spreadsheetId
            ? { ok: true, detail: "Approved control-sheet id is configured." }
            : { ok: false, detail: "No spreadsheet id configured." };
        case "auth_validation":
        case "endpoint_probe": {
          try {
            const tabTitles = await getTitles();
            return {
              ok: true,
              detail: `Read ${tabTitles.length} tab title(s) on the approved sheet.`,
            };
          } catch (error) {
            return {
              ok: false,
              detail: error instanceof Error ? error.message : String(error),
            };
          }
        }
        default:
          return { ok: false, detail: `Unhandled health step kind: ${step.kind}.` };
      }
    },
  };
}
