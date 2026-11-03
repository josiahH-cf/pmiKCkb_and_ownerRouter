// S235 R-S235-6: the saved Dotloop selection beside the packet readiness, with the time of the last
// successful resource observation and the exact reason when that observation failed, is stale or no
// longer matches the saved ids. Display only: nothing here re-selects, recreates a template or reads
// Dotloop; an Admin refreshes resources in Connections.

import {
  DOTLOOP_OBSERVATION_MAX_AGE_MS,
  projectDotloopSelection,
  type DotloopObservedResources,
  type DotloopSelectionStatus,
} from "@/lib/connections/dotloop-readiness";
import type { DotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import { isApprovedIntegrationAccount } from "@/lib/connections/provider-identity";
import { formatCentralTime } from "@/lib/lease-documents/returned-state-view";

export interface SelectionFreshness {
  readonly selection: string;
  readonly observation: string;
  /** Each reason the saved selection cannot be relied on now; empty when it is current. */
  readonly problems: readonly string[];
}

export interface SelectionConnectionRead {
  readonly readable: boolean;
  readonly status: string | null;
  readonly generationId: string | null;
  readonly oauthState?: string | null;
}

const STATUS_WORDS: Record<Exclude<DotloopSelectionStatus, "ok">, string> = {
  unselected: "is not selected",
  renamed: "has a different name in Dotloop now; the saved id still matches",
  unavailable: "is missing from the latest resource observation",
  unsupported: "is not a supported type in the latest resource observation",
  unknown: "could not be checked because the latest observation did not read it",
};

export function projectSelectionFreshness(input: {
  readonly settings: DotloopRenewalSettings | null;
  readonly settingsReadable: boolean;
  readonly observation:
    | (DotloopObservedResources & { readonly failures: readonly string[] })
    | null;
  readonly observationReadable: boolean;
  readonly connection: SelectionConnectionRead;
  readonly nowIso: string;
}): SelectionFreshness {
  const { settings } = input;
  if (!input.settingsReadable)
    return {
      selection: "The saved Dotloop selection could not be read.",
      observation: "Not checked.",
      problems: ["The saved Dotloop selection could not be read; reload to try again."],
    };
  if (!settings)
    return {
      selection: "No Dotloop profile and template are saved.",
      observation: "Not checked.",
      problems: ["An Admin saves the Dotloop profile and template in Connections."],
    };
  const selection = `Saved selection version ${settings.version}: profile ${settings.profileLabel}, template ${settings.templateLabel}, transaction type ${settings.transactionType ?? "not recorded"}, initial status ${settings.initialStatus ?? "not recorded"}, saved ${formatCentralTime(settings.recordedAtIso) ?? "at an unreadable time"}.`;
  const problems: string[] = [];
  if (!input.connection.readable)
    problems.push(
      "The current Dotloop connection could not be read; reload to try again.",
    );
  else if (input.connection.status !== "connected")
    problems.push(
      "The current Dotloop connection is not connected; review it in Connections.",
    );
  else if (input.connection.oauthState === "refresh_needed")
    problems.push("The current Dotloop credential needs recovery in Connections.");
  if (!input.observationReadable || !input.observation) {
    problems.push(
      input.observationReadable
        ? "No Dotloop resource observation is recorded; an Admin refreshes resources in Connections."
        : "The Dotloop resource observation could not be read; reload to try again.",
    );
    return {
      selection,
      observation: "No successful resource observation recorded.",
      problems,
    };
  }
  const observation = input.observation;
  const observedAt = formatCentralTime(observation.observedAt);
  if (
    input.connection.readable &&
    input.connection.status === "connected" &&
    (!input.connection.generationId ||
      observation.generationId !== input.connection.generationId)
  )
    problems.push(
      "The resource observation belongs to a different connection generation; an Admin refreshes resources in Connections.",
    );
  if (!observation.accountOk)
    problems.push(
      "The latest resource observation did not successfully read the Dotloop account.",
    );
  else if (!isApprovedIntegrationAccount(observation.accountEmail))
    problems.push(
      "The resource observation is not for integrations@pmikcmetro.com; review the connection in Connections.",
    );
  for (const failure of observation.failures) problems.push(failure);
  const observedMs = Date.parse(observation.observedAt);
  const nowMs = Date.parse(input.nowIso);
  if (!observedAt || !Number.isFinite(observedMs))
    problems.push(
      "The resource observation time is unreadable; an Admin refreshes resources in Connections.",
    );
  else if (!Number.isFinite(nowMs))
    problems.push(
      "The current check time is unreadable; reload before relying on this observation.",
    );
  else if (observedMs > nowMs)
    problems.push(
      "The resource observation time is in the future; an Admin refreshes resources in Connections.",
    );
  else if (nowMs - observedMs > DOTLOOP_OBSERVATION_MAX_AGE_MS)
    problems.push(
      "The latest resource observation is older than one day; an Admin refreshes resources in Connections.",
    );
  const detail = projectDotloopSelection(
    {
      profileId: settings.profileId,
      templateId: settings.templateId,
      profileLabel: settings.profileLabel,
      templateLabel: settings.templateLabel,
      transactionType: settings.transactionType ?? null,
      initialStatus: settings.initialStatus ?? null,
    },
    observation,
  );
  if (detail.profile !== "ok")
    problems.push(`The saved profile ${STATUS_WORDS[detail.profile]}.`);
  if (detail.template !== "ok")
    problems.push(`The saved template ${STATUS_WORDS[detail.template]}.`);
  return {
    selection,
    observation: observedAt
      ? `Last resource observation: ${observedAt}.`
      : "The latest resource observation has an unreadable time.",
    problems: [...new Set(problems)],
  };
}
