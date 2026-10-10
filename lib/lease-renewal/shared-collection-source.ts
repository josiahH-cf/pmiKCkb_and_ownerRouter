// Real renewal projection and cycle owner; no provider writes or private-history reads.
import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { loadRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";
import { listRenewalWorkspaces } from "@/lib/firestore/renewal-workspace";
import {
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";
import { normalizeRenewalDeskText } from "@/lib/lease-renewal/desk-query";
import { workStatusDisplayLabel } from "./work-status";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { CollectionSource } from "./shared-collections";
export async function readSharedCollectionSource(
  actor: AuthenticatedUser,
): Promise<CollectionSource> {
  const now = new Date();
  const [source, manual] = await Promise.all([
    loadRenewalAssistantSource(actor, now),
    listRenewalWorkspaces(actor).then(
      (records) => ({ ok: true as const, records }),
      () => ({ ok: false as const, records: new Map() }),
    ),
  ]);
  if (source.outcome.status !== "ok")
    return {
      complete: false,
      readAt: null,
      issues: ["Current renewal sources could not be read."],
      records: [],
      matches: () => [],
    };
  const view = source.outcome.view,
    issues = [
      ...(!view.readComplete
        ? ["Lease inventory is incomplete; membership changes are held."]
        : []),
      ...(!manual.ok ? ["Recorded cycle identities could not be read."] : []),
      ...(view.dataCurrency.state !== "fresh" || view.dataCurrency.lastError
        ? ["The source snapshot is not current enough for membership changes."]
        : []),
      ...source.auxiliaryFailures
        .filter((f) =>
          [
            "progress",
            "manual_workspace",
            "work_status",
            "resolutions",
            "term_reviews",
            "working_record",
            "notice_policy",
            "dismissed_attention",
            "dispositions",
          ].includes(f.key),
        )
        .map((f) => `Selection or status source unavailable: ${f.key}`),
    ];
  const resolver = createPartyFilterResolver(
    readPartyFilterKeyConfig(),
    "renewals",
    view.items.flatMap((row) =>
      (["owner", "tenant"] as const).flatMap((partyKind) =>
        (partyKind === "owner" ? row.identity.owners : row.identity.tenants).map((p) => ({
          partyKind,
          normalizedLabel: normalizeRenewalDeskText(p.label),
          sourceId: p.contactId?.label ?? "",
        })),
      ),
    ),
  );
  const records = view.items.flatMap((row) => {
    const cycle = manual.records.get(row.id);
    const date =
      cycle && cycle.basis.kind !== "lease_bound"
        ? cycle.basis.dateIso
        : row.leaseTerm.term === "month_to_month"
          ? row.queryKeys.nextReviewIso
          : row.endDateIso;
    const cycleKey = cycle
      ? `recorded:${cycle.cycleId}:${createHash("sha256").update(canonicalJson(cycle.basis)).digest("hex").slice(0, 24)}`
      : date
        ? `source:${row.leaseTerm.term === "month_to_month" ? "annual_review" : "lease_end"}:${date}`
        : null;
    if (!cycleKey) return [];
    return [
      {
        member: { leaseId: row.id, cycleKey, cycleDate: date ?? null },
        label: row.addressLabel,
        href: `/lease-renewal/live/desk/lease/${encodeURIComponent(row.id)}`,
        lifecycle: row.lifecycle?.label ?? "Lifecycle unavailable",
        workStatus: workStatusDisplayLabel(row.workStatus),
      },
    ];
  });
  return {
    complete: issues.length === 0,
    readAt: view.dataCurrency.readAtIso,
    issues,
    records,
    matches: (basis) => {
      const parsed = parseRenewalDeskQueryV2(new URLSearchParams(basis.criteria));
      if (serializeRenewalDeskQueryV2(parsed) !== basis.criteria)
        throw new EditableLayerError(
          "The stored selection filters need explicit review.",
          409,
        );
      if ((parsed.ownerKey || parsed.tenantKey) && !resolver.available)
        throw new EditableLayerError(
          "The party filter cannot currently be resolved.",
          409,
        );
      // A manually assembled monthly set has no hidden current-window constraint. An incoming
      // worklist keeps its explicit scope and every recorded filter.
      const selection =
        basis.origin !== "worklist" && !basis.criteria
          ? { ...parsed, scope: "all" as const }
          : parsed;
      const filtered = applyRenewalDeskQueryV2(
        view.items,
        selection,
        resolver.matches,
      ).items;
      return filtered
        .filter((row) => {
          const date =
            basis.dateField === "lease_end"
              ? row.endDateIso
              : row.queryKeys.nextReviewIso;
          return date !== null && date >= basis.from && date <= basis.through;
        })
        .map((row) => row.id);
    },
  };
}
