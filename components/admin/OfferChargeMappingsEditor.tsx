"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S264 (R-S264-1, AC-S264-1): Admin → Renewal packet policy → Offer charge mappings. An Admin
// records, for each exact RentVine account, the verified display label, the offer family, the
// cadence it supports, when it applies and the approval evidence; reviews exactly what the save
// changes; and saves it against the version reviewed. The saved version is read back. A mapping
// supplies meaning only: each lease's amounts, applicability and case policy keep their own
// evidence, and nothing here sets a fee, a rate or a default. The packet policy, its calculator
// and the approved forms stay separate.

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import {
  OFFER_MAPPING_APPLICABILITY,
  OFFER_MAPPING_APPLICABILITY_LABELS,
  OFFER_MAPPING_FAMILIES,
  OFFER_MAPPING_FAMILY_LABELS,
  OfferChargeMappingEntrySchema,
  describeOfferChargeMapping,
  diffOfferChargeMappings,
  frequencyLabel,
  type OfferChargeMappingDiff,
  type OfferChargeMappingEntry,
  type OfferChargeMappingRecord,
  type OfferChargeMappingsRead,
  type OfferMappingApplicability,
  type OfferMappingFamily,
} from "@/lib/lease-renewal/offer-charge-mapping";

const MAPPINGS_URL = "/api/admin/offer-charge-mappings";

interface EntryDraft {
  entryId: string;
  accountId: string;
  accountName: string;
  displayLabel: string;
  family: OfferMappingFamily | "";
  frequencyMonths: string;
  applicability: OfferMappingApplicability;
  requirement: string;
  approvalReference: string;
  approvedOn: string;
}

function draftOf(entry: OfferChargeMappingEntry): EntryDraft {
  return {
    entryId: entry.entryId,
    accountId: entry.accountId,
    accountName: entry.accountName,
    displayLabel: entry.displayLabel,
    family: entry.family,
    frequencyMonths: String(entry.frequencyMonths),
    applicability: entry.applicability,
    requirement: entry.requirement ?? "",
    approvalReference: entry.approval.reference,
    approvedOn: entry.approval.approvedOn,
  };
}

function blankDraft(): EntryDraft {
  return {
    entryId: crypto.randomUUID(),
    accountId: "",
    accountName: "",
    displayLabel: "",
    family: "",
    frequencyMonths: "1",
    applicability: "active_on_renewal_date",
    requirement: "",
    approvalReference: "",
    approvedOn: "",
  };
}

/** The draft as a mapping, or the first thing it still needs, in plain words. */
function entryOf(draft: EntryDraft, index: number): OfferChargeMappingEntry | string {
  const parsed = OfferChargeMappingEntrySchema.safeParse({
    entryId: draft.entryId,
    accountId: draft.accountId.trim(),
    accountName: draft.accountName,
    displayLabel: draft.displayLabel,
    family: draft.family || undefined,
    frequencyMonths: Number(draft.frequencyMonths),
    applicability: draft.applicability,
    requirement: draft.family === "separate_requirement" ? draft.requirement : null,
    approval: { reference: draft.approvalReference, approvedOn: draft.approvedOn },
  });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "");
  const names: Record<string, string> = {
    accountId: "RentVine account ID",
    accountName: "RentVine account name",
    displayLabel: "Verified display label",
    family: "Offer family",
    frequencyMonths: "Supported cadence",
    requirement: "Separate requirement",
    approval: "Approval evidence",
  };
  return `Mapping ${index + 1}, ${names[field] ?? "an entry"}: ${issue?.message ?? "check this entry."}`;
}

export function OfferChargeMappingsEditor() {
  const [read, setRead] = useState<OfferChargeMappingsRead | null>(null);
  const [drafts, setDrafts] = useState<EntryDraft[]>([]);
  const [note, setNote] = useState("");
  const [review, setReview] = useState<{
    entries: OfferChargeMappingEntry[];
    diff: OfferChargeMappingDiff;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const record: OfferChargeMappingRecord | null = read?.record ?? null;

  const adopt = (next: OfferChargeMappingsRead) => {
    setRead(next);
    setDrafts((next.record?.entries ?? []).map(draftOf));
    setReview(null);
  };
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(MAPPINGS_URL, { cache: "no-store" });
      const value = (await response.json().catch(() => ({}))) as {
        mappings?: OfferChargeMappingsRead;
        error?: string;
      };
      if (!response.ok || !value.mappings)
        setError(value.error ?? "The offer charge mappings could not be read.");
      else adopt(value.mappings);
    } catch {
      setError("The offer charge mappings could not be read. Reload to try again.");
    }
    setBusy(false);
  };
  const update = (index: number, change: Partial<EntryDraft>) => {
    setDrafts((current) =>
      current.map((draft, at) => (at === index ? { ...draft, ...change } : draft)),
    );
    setReview(null);
    setMessage(null);
  };
  const prepareReview = () => {
    setError(null);
    setMessage(null);
    const entries: OfferChargeMappingEntry[] = [];
    for (const [index, draft] of drafts.entries()) {
      const entry = entryOf(draft, index);
      if (typeof entry === "string") {
        setError(entry);
        return;
      }
      entries.push(entry);
    }
    const accounts = entries.map((entry) => entry.accountId);
    const repeated = accounts.find(
      (account, index) => accounts.indexOf(account) !== index,
    );
    if (repeated) {
      setError(
        `RentVine account ${repeated} is mapped twice. Keep one mapping per account.`,
      );
      return;
    }
    const diff = diffOfferChargeMappings(record?.entries ?? [], entries);
    if (!diff.added.length && !diff.changed.length && !diff.removed.length) {
      setError("Nothing changed. The current version stays as it is.");
      return;
    }
    setReview({ entries, diff });
  };
  const save = async () => {
    if (!review) return;
    setBusy(true);
    setError(null);
    const response = await fetch(MAPPINGS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: review.entries,
        ...(note.trim() ? { note: note.trim() } : {}),
        expectedVersion: record?.version ?? 0,
        operationId: crypto.randomUUID(),
      }),
    }).catch(() => null);
    const value = response
      ? ((await response.json().catch(() => ({}))) as {
          mappings?: OfferChargeMappingsRead;
          error?: string;
        })
      : { error: "The save did not answer. Reload to see whether it was saved." };
    setBusy(false);
    if (!response?.ok || !value.mappings?.record) {
      setError(value.error ?? "The offer charge mappings were not saved.");
      return;
    }
    adopt(value.mappings);
    setNote("");
    setMessage(
      `Saved version ${value.mappings.record.version}. Read back: ${value.mappings.record.entries.length} ${value.mappings.record.entries.length === 1 ? "mapping" : "mappings"}.`,
    );
  };

  return (
    <section
      aria-labelledby="offer-charge-mappings-heading"
      className="ui-stack-tight"
      data-offer-charge-mappings
      id="admin-offer-charge-mappings"
    >
      <h3 id="offer-charge-mappings-heading">Offer charge mappings</h3>
      <p className="muted">
        What each RentVine account means in a tenant offer: its verified label, offer
        family, cadence and when it applies, with who approved it. A mapping gives meaning
        only. Each lease&apos;s amounts and whether a charge applies still need their own
        evidence, and nothing here sets a fee or a default.
      </p>
      {read === null ? (
        <Button busy={busy} onClick={() => void open()} variant="secondary">
          Open offer charge mappings
        </Button>
      ) : !read.readable ? (
        <p role="alert">
          The offer charge mappings are unreadable. Reload before changing them.
        </p>
      ) : (
        <>
          <p data-offer-charge-mappings-version={record?.version ?? 0}>
            {record
              ? `Current version ${record.version}, saved ${record.updatedAt.slice(0, 10)}.`
              : "No offer charge mappings are saved. Every RentVine charge line waits for staff review."}
          </p>
          <ul className="ui-rows" aria-label="Offer charge mappings">
            {drafts.map((draft, index) => (
              <li data-offer-charge-mapping={draft.entryId} key={draft.entryId}>
                <fieldset className="ui-stack-tight">
                  <legend>Mapping {index + 1}</legend>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-account`}
                    label="RentVine account ID"
                    hint="The exact, stable account. When the account does not tell the charge type apart, leave it unmapped."
                  >
                    <input
                      id={`mapping-${draft.entryId}-account`}
                      inputMode="numeric"
                      value={draft.accountId}
                      onChange={(event) =>
                        update(index, { accountId: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-name`}
                    label="RentVine account name"
                  >
                    <input
                      id={`mapping-${draft.entryId}-name`}
                      value={draft.accountName}
                      onChange={(event) =>
                        update(index, { accountName: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-label`}
                    label="Verified display label"
                    hint="What staff and the tenant offer show. No amounts or dates."
                  >
                    <input
                      id={`mapping-${draft.entryId}-label`}
                      value={draft.displayLabel}
                      onChange={(event) =>
                        update(index, { displayLabel: event.target.value })
                      }
                    />
                  </Field>
                  <Field htmlFor={`mapping-${draft.entryId}-family`} label="Offer family">
                    <select
                      id={`mapping-${draft.entryId}-family`}
                      value={draft.family}
                      onChange={(event) =>
                        update(index, {
                          family: event.target.value as OfferMappingFamily | "",
                        })
                      }
                    >
                      <option value="">Choose a family</option>
                      {OFFER_MAPPING_FAMILIES.map((family) => (
                        <option key={family} value={family}>
                          {OFFER_MAPPING_FAMILY_LABELS[family]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-cadence`}
                    label="Supported cadence"
                  >
                    <select
                      id={`mapping-${draft.entryId}-cadence`}
                      value={draft.frequencyMonths}
                      onChange={(event) =>
                        update(index, { frequencyMonths: event.target.value })
                      }
                    >
                      {Array.from({ length: 12 }, (_, at) => at + 1).map((months) => (
                        <option key={months} value={String(months)}>
                          {frequencyLabel(months)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-applicability`}
                    label="Applicability scope"
                  >
                    <select
                      id={`mapping-${draft.entryId}-applicability`}
                      value={draft.applicability}
                      onChange={(event) =>
                        update(index, {
                          applicability: event.target.value as OfferMappingApplicability,
                        })
                      }
                    >
                      {OFFER_MAPPING_APPLICABILITY.map((value) => (
                        <option key={value} value={value}>
                          {OFFER_MAPPING_APPLICABILITY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.family === "separate_requirement" ? (
                    <Field
                      htmlFor={`mapping-${draft.entryId}-requirement`}
                      label="Separate requirement"
                      hint="For example, a guarantor's coverage kept apart from the offer."
                    >
                      <input
                        id={`mapping-${draft.entryId}-requirement`}
                        value={draft.requirement}
                        onChange={(event) =>
                          update(index, { requirement: event.target.value })
                        }
                      />
                    </Field>
                  ) : null}
                  <Field
                    htmlFor={`mapping-${draft.entryId}-approval`}
                    label="Approval evidence"
                    hint="Who approved this meaning, and where it is recorded."
                  >
                    <input
                      id={`mapping-${draft.entryId}-approval`}
                      value={draft.approvalReference}
                      onChange={(event) =>
                        update(index, { approvalReference: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    htmlFor={`mapping-${draft.entryId}-approved-on`}
                    label="Approved on"
                  >
                    <input
                      id={`mapping-${draft.entryId}-approved-on`}
                      type="date"
                      value={draft.approvedOn}
                      onChange={(event) =>
                        update(index, { approvedOn: event.target.value })
                      }
                    />
                  </Field>
                  <Button
                    onClick={() => {
                      setDrafts((current) => current.filter((_, at) => at !== index));
                      setReview(null);
                    }}
                    size="compact"
                    variant="tertiary"
                  >
                    Remove this mapping
                  </Button>
                </fieldset>
              </li>
            ))}
          </ul>
          <div className="ui-row">
            <Button
              onClick={() => {
                setDrafts((current) => [...current, blankDraft()]);
                setReview(null);
              }}
              size="compact"
              variant="secondary"
            >
              Add a mapping
            </Button>
          </div>
          <Field
            htmlFor="offer-charge-mappings-note"
            label="Note for this version (optional)"
          >
            <input
              id="offer-charge-mappings-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button busy={busy} onClick={prepareReview} variant="secondary">
            Review the mapping changes
          </Button>
          {review ? (
            <div
              className="ui-stack-tight"
              data-offer-charge-mappings-review
              role="region"
              aria-label="Mapping changes to save"
            >
              <p>
                <strong>Review before saving version {(record?.version ?? 0) + 1}</strong>
              </p>
              <ul>
                {review.diff.added.map((entry) => (
                  <li
                    data-offer-charge-mapping-change="added"
                    key={`added-${entry.entryId}`}
                  >
                    Added: {describeOfferChargeMapping(entry)}
                  </li>
                ))}
                {review.diff.changed.map(({ before, after }) => (
                  <li
                    data-offer-charge-mapping-change="changed"
                    key={`changed-${after.entryId}`}
                  >
                    Changed: {describeOfferChargeMapping(before)} Now:{" "}
                    {describeOfferChargeMapping(after)}
                  </li>
                ))}
                {review.diff.removed.map((entry) => (
                  <li
                    data-offer-charge-mapping-change="removed"
                    key={`removed-${entry.entryId}`}
                  >
                    Removed: {describeOfferChargeMapping(entry)}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Tenant offers that use a changed mapping ask staff to review those lines
                again.
              </p>
              <Button busy={busy} busyLabel="Saving…" onClick={() => void save()}>
                Save offer charge mappings
              </Button>
            </div>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
