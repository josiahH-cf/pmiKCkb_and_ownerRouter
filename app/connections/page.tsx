import { readDotloopRuntimeReadiness } from "@/lib/connections/dotloop-runtime";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import type { DotloopSelectionSummary } from "@/components/connections/DotloopConnectionPanel";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import type { ConnectorConnectionView } from "@/lib/connections/connection-status";
import {
  buildConnectionView,
  projectConnectorConnection,
} from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import {
  DOTLOOP_CALLBACK_QUERY,
  readDotloopCallbackResult,
} from "@/lib/connections/dotloop-callback-result";
import {
  projectDotloopPicker,
  type DotloopPickerView,
} from "@/lib/connections/dotloop-resource-selection";
import {
  getVerifiedConnectorIds,
  LIVE_VERIFIABLE_CONNECTOR_IDS,
} from "@/lib/connections/verification";
import { getConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import { FirestoreDotloopObservationStore } from "@/lib/firestore/dotloop-connection-observations";
import { getDotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { resolveConnectionsState } from "@/lib/ask/app-state-context";
import type { AuthenticatedUser } from "@/lib/auth/session";

// The Connection Center. Status combines configuration PRESENCE (never values) with the cached
// read-only checks (S13 D1), so a working connector finally shows "Connected". Every role can
// SEE the truth; only Admins get the setup wizard and the fresh-verify button (decision 6 / D5).
// S106: Dotloop readiness comes from the cached labeled resource observation, so rendering this
// page never repeats provider discovery; only an Admin's explicit refresh does.
export default async function ConnectionsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const user = await requirePageCapability("read");
  const canManage = can(user.role, "manageAdmin");
  const verifiedIds = await getVerifiedConnectorIds();
  const connections = await loadConnectorConnections(canManage);
  const dotloopReadiness = await readDotloopRuntimeReadiness();
  const dotloopSelection = await loadDotloopSelection(user);
  const dotloopPicker = canManage ? await loadDotloopPicker() : null;
  const params = (await searchParams) ?? {};
  const rawResult = params[DOTLOOP_CALLBACK_QUERY];
  const dotloopCallbackResult = readDotloopCallbackResult(
    Array.isArray(rawResult) ? rawResult[0] : rawResult,
  );
  const view = buildConnectionView(readConnectorPresence(), verifiedIds, connections);
  // S120 (R120.3): the shared renewal resource entries live here with the other shared setup.
  // A failed read renders as unknown, never as an empty settings record.
  const resourceSettings = await getRenewalResourceLocations(user).catch(() => null);
  // S147: the setup summary that used to sit on the Dashboard, with the same Space scoping.
  const needsSetup = resolveConnectionsState(process.env).items;

  return (
    <AppShell user={user}>
      <section className="content">
        <ConnectionCenter
          dotloopCallbackResult={dotloopCallbackResult}
          dotloopPicker={dotloopPicker}
          dotloopReadiness={dotloopReadiness}
          dotloopSelection={dotloopSelection}
          canManage={canManage}
          needsSetup={needsSetup}
          verifiableIds={LIVE_VERIFIABLE_CONNECTOR_IDS}
          view={view}
          resourcePanel={
            <RenewalResourceLocations
              role={user.role}
              initialSettings={resourceSettings}
            />
          }
        />
      </section>
    </AppShell>
  );
}

// Load the app-held connection records (status only) keyed by connectorId. Any read failure degrades
// to an empty map so the page still renders configuration-only status.
async function loadConnectorConnections(
  canManage: boolean,
): Promise<Map<string, ConnectorConnectionView>> {
  try {
    const records = await getConnectorConnectionStore().listConnections();
    return new Map(
      records.map((record) => [
        record.connectorId,
        projectConnectorConnection(record, canManage),
      ]),
    );
  } catch {
    return new Map();
  }
}

async function loadDotloopSelection(
  user: AuthenticatedUser,
): Promise<DotloopSelectionSummary | null> {
  try {
    const settings = await getDotloopRenewalSettings(user);
    return settings
      ? {
          profileId: settings.profileId,
          profileLabel: settings.profileLabel,
          templateId: settings.templateId,
          templateLabel: settings.templateLabel,
          ...(settings.transactionType
            ? { transactionType: settings.transactionType }
            : {}),
          ...(settings.initialStatus ? { initialStatus: settings.initialStatus } : {}),
          recordedAtIso: settings.recordedAtIso,
        }
      : null;
  } catch {
    return null;
  }
}

/** Admin only: the cached observation projected for the picker. No provider call. */
async function loadDotloopPicker(): Promise<DotloopPickerView | null> {
  try {
    const [connection, observation] = await Promise.all([
      getConnectorConnectionStore().getConnection("dotloop"),
      new FirestoreDotloopObservationStore().read(),
    ]);
    if (!observation) return null;
    return projectDotloopPicker(
      observation,
      connection?.status === "connected" ? (connection.generationId ?? null) : null,
      new Date().toISOString(),
    );
  } catch {
    return null;
  }
}
