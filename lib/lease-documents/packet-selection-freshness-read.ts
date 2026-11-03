// S235 R-S235-6: the server read behind the readiness view's Dotloop selection line. It reads the
// saved selection and the stored resource observation only; it never refreshes Dotloop.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { toObservedResources } from "@/lib/connections/dotloop-runtime";
import {
  FirestoreDotloopObservationStore,
  type DotloopResourceObservation,
} from "@/lib/firestore/dotloop-connection-observations";
import { getDotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import { FirestoreConnectorConnectionStore } from "@/lib/firestore/connector-connections";
import {
  projectSelectionFreshness,
  type SelectionFreshness,
} from "@/lib/lease-documents/packet-selection-freshness";

function observationFailures(
  observation: DotloopResourceObservation,
  selectedProfileId?: string,
): string[] {
  const failures: string[] = [];
  if (observation.accountError || !observation.account)
    failures.push("The latest resource observation could not read the Dotloop account.");
  if (observation.profilesError)
    failures.push("The latest resource observation could not read the Dotloop profiles.");
  const selectedTemplatesFailed = observation.templates.some(
    (entry) => entry.profileId === selectedProfileId && entry.error !== null,
  );
  if (selectedTemplatesFailed)
    failures.push(
      "The latest resource observation could not read the templates of the saved profile.",
    );
  return failures;
}

export async function readSelectionFreshness(
  actor: AuthenticatedUser,
  nowIso: string,
): Promise<SelectionFreshness> {
  const [settings, observation, connection] = await Promise.all([
    getDotloopRenewalSettings(actor).then(
      (value) => ({ readable: true, value }),
      () => ({ readable: false, value: null }),
    ),
    new FirestoreDotloopObservationStore().read().then(
      (value) => ({ readable: true, value }),
      () => ({ readable: false, value: null }),
    ),
    new FirestoreConnectorConnectionStore().getConnection("dotloop").then(
      (value) => ({ readable: true, value }),
      () => ({ readable: false, value: null }),
    ),
  ]);
  const observed = observation.value ? toObservedResources(observation.value) : null;
  return projectSelectionFreshness({
    settings: settings.value,
    settingsReadable: settings.readable,
    observation:
      observed && observation.value
        ? {
            ...observed,
            failures: observationFailures(observation.value, settings.value?.profileId),
          }
        : null,
    observationReadable: observation.readable,
    connection: {
      readable: connection.readable,
      status: connection.value?.status ?? null,
      generationId: connection.value?.generationId ?? null,
      oauthState:
        connection.value && "oauthState" in connection.value
          ? (connection.value.oauthState ?? null)
          : null,
    },
    nowIso,
  });
}
