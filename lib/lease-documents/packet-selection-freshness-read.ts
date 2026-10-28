// S235 R-S235-6: the server read behind the readiness view's Dotloop selection line. It reads the
// saved selection and the stored resource observation only; it never refreshes Dotloop.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { toObservedResources } from "@/lib/connections/dotloop-runtime";
import {
  FirestoreDotloopObservationStore,
  type DotloopResourceObservation,
} from "@/lib/firestore/dotloop-connection-observations";
import { getDotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import {
  projectSelectionFreshness,
  type SelectionFreshness,
} from "@/lib/lease-documents/packet-selection-freshness";

function observationFailures(observation: DotloopResourceObservation): string[] {
  const failures: string[] = [];
  if (observation.accountError || !observation.account)
    failures.push("The latest resource observation could not read the Dotloop account.");
  if (observation.profilesError)
    failures.push("The latest resource observation could not read the Dotloop profiles.");
  const templates = observation.templates.filter((entry) => entry.error !== null).length;
  if (templates)
    failures.push(
      `The latest resource observation could not read the templates of ${templates} ${templates === 1 ? "profile" : "profiles"}.`,
    );
  return failures;
}

export async function readSelectionFreshness(
  actor: AuthenticatedUser,
  nowIso: string,
): Promise<SelectionFreshness> {
  const [settings, observation] = await Promise.all([
    getDotloopRenewalSettings(actor).then(
      (value) => ({ readable: true, value }),
      () => ({ readable: false, value: null }),
    ),
    new FirestoreDotloopObservationStore().read().then(
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
        ? { ...observed, failures: observationFailures(observation.value) }
        : null,
    observationReadable: observation.readable,
    nowIso,
  });
}
