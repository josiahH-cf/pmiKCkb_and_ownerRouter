"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S66 (BEH-S66-1, AC-S66-4, AC-S66-5, AC-S66-7): staff enter or correct the lease facts, the
// people with their signer roles, and the animals once; the packet, the filled files and the
// Dotloop handoff all read this record. Current RentVine values are offered for adoption and never
// adopted for the person. Charges are calculated by the server from the published policy; an
// override needs a reason. Saving writes only the app's own record. Opening the lease makes no
// request: the inputs are read when a person opens them.

import { useCallback, useId, useRef, useState } from "react";

import { Button, Field, Notice } from "@/components/ui";
import {
  SIGNER_ROLES,
  type SignerRole,
} from "@/lib/lease-documents/artifact-intake-contract";
import type {
  AnimalChargeResult,
  ChargeCadence,
} from "@/lib/lease-documents/charge-policy";
import {
  DEFAULT_DOTLOOP_ROLE,
  DOTLOOP_PARTICIPANT_ROLES,
  SIGNER_ROLE_LABELS,
  type PacketAnimalInput,
  type PacketFactValue,
  type PacketPersonInput,
  type StoredChargeOverride,
} from "@/lib/lease-documents/packet-inputs";
import type {
  PacketInputsView,
  PacketQuestion,
} from "@/lib/lease-documents/packet-inputs-view";
import { formatBusinessTimestamp } from "@/lib/date-display";

const CADENCES: ReadonlyArray<[ChargeCadence, string]> = [
  ["monthly", "Monthly"],
  ["one_time", "One-time"],
  ["refundable_deposit", "Refundable deposit"],
];

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Waiting on inputs";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shownValue(value: PacketFactValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

interface SaveResult {
  ok: boolean;
  message?: string;
  conflict?: boolean;
}

/** One request per entered change; a retry of the same entry reuses its operation id. */
function useSaver(leaseId: string, onSaved: () => Promise<void>) {
  const pending = useRef(new Map<string, { key: string; operationId: string }>());
  return useCallback(
    async (slot: string, body: Record<string, unknown>): Promise<SaveResult> => {
      const key = JSON.stringify(body);
      const prior = pending.current.get(slot);
      const operationId = prior?.key === key ? prior.operationId : crypto.randomUUID();
      pending.current.set(slot, { key, operationId });
      try {
        const response = await fetch("/api/lease-renewal/packet-inputs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leaseId, operationId, ...body }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          // A refused request was never stored, so the same entry can be saved again.
          pending.current.delete(slot);
          if (response.status === 409) await onSaved();
          return {
            ok: false,
            message: result.error ?? "The save was refused.",
            conflict: response.status === 409,
          };
        }
        pending.current.delete(slot);
        await onSaved();
        return { ok: true };
      } catch {
        // The response was lost: the same request is kept so a retry cannot save twice.
        return { ok: false, message: "The save did not finish. Save again to retry it." };
      }
    },
    [leaseId, onSaved],
  );
}

export function PacketInputsEditor({
  leaseId,
  canEdit,
}: Readonly<{ leaseId: string; canEdit: boolean }>) {
  const [view, setView] = useState<PacketInputsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);

  const readView = useCallback(async (): Promise<
    { view: PacketInputsView } | { error: string }
  > => {
    try {
      const response = await fetch(
        `/api/lease-renewal/packet-inputs?leaseId=${encodeURIComponent(leaseId)}`,
      );
      const value = (await response.json().catch(() => ({}))) as PacketInputsView & {
        error?: string;
      };
      if (
        !response.ok ||
        !Array.isArray(value.questions) ||
        !Array.isArray(value.notices)
      )
        return { error: value.error ?? "Packet inputs could not be read." };
      return { view: value };
    } catch {
      return { error: "Packet inputs could not be read. Reload to try again." };
    }
  }, [leaseId]);

  const apply = useCallback((outcome: { view: PacketInputsView } | { error: string }) => {
    if ("view" in outcome) {
      setView(outcome.view);
      setLoadError(null);
    } else setLoadError(outcome.error);
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await readView()), [apply, readView]);

  const save = useSaver(leaseId, load);

  if (!opened)
    return (
      <div className="ui-stack-tight">
        <h4 id={`packet-inputs-${leaseId}`}>Packet inputs</h4>
        <p className="muted">
          Each fact, person and animal the packet, filled files and Dotloop handoff use.
        </p>
        <Button
          onClick={() => {
            setOpened(true);
            setLoading(true);
            void load();
          }}
        >
          Open packet inputs
        </Button>
      </div>
    );
  if (loading && !view) return <p role="status">Reading packet inputs…</p>;
  if (!view)
    return (
      <Notice tone="error" actionLabel="Reload" onAction={() => void load()}>
        {loadError ?? "Packet inputs could not be read."}
      </Notice>
    );
  return (
    <section aria-labelledby={`packet-inputs-${leaseId}`} className="ui-stack">
      <div className="ui-stack-tight">
        <h4 id={`packet-inputs-${leaseId}`}>Packet inputs</h4>
        <p className="muted">
          Enter each fact, person and animal once. The packet, filled files and Dotloop
          handoff use these saved values.
          {view.record
            ? ` Last saved ${formatBusinessTimestamp(view.record.updatedAt)}.`
            : " Nothing is saved for this lease yet."}
        </p>
        {loadError ? <p role="alert">{loadError}</p> : null}
      </div>
      <OwnerApprovalStatus view={view} />
      {view.notices.length > 0 ? (
        <ul className="ui-rows" data-packet-input-notices>
          {view.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
      <FactsSection view={view} canEdit={canEdit} save={save} />
      <PeopleSection view={view} canEdit={canEdit} save={save} />
      <AnimalsSection view={view} canEdit={canEdit} save={save} />
      <ChargesSection view={view} canEdit={canEdit} save={save} />
    </section>
  );
}

function OwnerApprovalStatus({ view }: Readonly<{ view: PacketInputsView }>) {
  if (view.ownerApproval.state === "current")
    return (
      <p data-owner-approval="current">
        The owner&apos;s recorded approval covers the current Working terms and charges.
      </p>
    );
  return (
    <p data-owner-approval={view.ownerApproval.state}>
      <strong>Owner approval:</strong>{" "}
      {view.ownerApproval.notice ?? "Current sources are unavailable."}
    </p>
  );
}

type Save = (slot: string, body: Record<string, unknown>) => Promise<SaveResult>;

function FactsSection({
  view,
  canEdit,
  save,
}: Readonly<{ view: PacketInputsView; canEdit: boolean; save: Save }>) {
  const needed = view.questions.filter((question) => question.reason !== "standard");
  const standard = view.questions.filter((question) => question.reason === "standard");
  return (
    <div className="ui-stack-tight">
      <strong>Lease facts</strong>
      {needed.length > 0 ? (
        <p className="muted">
          {needed.length} {needed.length === 1 ? "fact is" : "facts are"} needed for the
          current packet.
        </p>
      ) : null}
      <ul className="ui-rows">
        {[...needed, ...standard].map((question) => (
          <FactRow
            key={question.fieldKey}
            question={question}
            view={view}
            canEdit={canEdit}
            save={save}
          />
        ))}
      </ul>
    </div>
  );
}

function parseEntry(question: PacketQuestion, raw: string): PacketFactValue | null {
  if (raw.trim() === "") return null;
  if (question.type === "boolean") return raw === "true";
  if (question.type === "number" || question.type === "money") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return raw.trim();
}

function FactRow({
  question,
  view,
  canEdit,
  save,
}: Readonly<{
  question: PacketQuestion;
  view: PacketInputsView;
  canEdit: boolean;
  save: Save;
}>) {
  const id = useId();
  const saved = view.record?.facts[question.fieldKey] ?? null;
  const source =
    view.source.facts.find((fact) => fact.fieldKey === question.fieldKey) ?? null;
  const [entry, setEntry] = useState(saved ? String(saved.value) : "");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const choices =
    question.fieldKey === "active_lease.form_family" && view.formFamilies.length > 0
      ? view.formFamilies.map((family) => ({ value: family, label: family }))
      : question.type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : question.choices;
  const value = parseEntry(question, entry);
  const differsFromSource =
    source !== null &&
    value !== null &&
    JSON.stringify(value) !== JSON.stringify(source.value);
  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setResult(
      await save(`fact:${question.fieldKey}`, {
        facts: [
          {
            fieldKey: question.fieldKey,
            expectedRevision:
              saved?.revision ??
              view.record?.clearedFacts?.[question.fieldKey]?.revision ??
              0,
            ...body,
          },
        ],
      }),
    );
    setBusy(false);
  };
  return (
    <li data-packet-fact={question.fieldKey} data-packet-fact-reason={question.reason}>
      <Field
        label={question.label}
        htmlFor={id}
        hint={
          saved
            ? `Saved ${shownValue(saved.value)} on ${formatBusinessTimestamp(saved.recordedAt)}${saved.origin === "adopted_source" ? ` from ${saved.sourceLabel}` : ""}${saved.overridesSource ? ` (corrects the source: ${saved.reason})` : ""}.`
            : question.reason === "missing"
              ? "Needed for the current packet."
              : question.reason === "conflict"
                ? "Sources disagree. Choose the value the packet uses."
                : question.reason === "invalid"
                  ? "The saved value needs review."
                  : undefined
        }
      >
        {choices ? (
          <select
            id={id}
            disabled={!canEdit || busy}
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
          >
            <option value="">Not recorded</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            disabled={!canEdit || busy}
            type={
              question.type === "date"
                ? "date"
                : question.type === "number"
                  ? "number"
                  : "text"
            }
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
          />
        )}
      </Field>
      {source ? (
        <p className="muted" data-packet-fact-source>
          RentVine: {shownValue(source.value)}{" "}
          {canEdit &&
          JSON.stringify(saved?.value ?? null) !== JSON.stringify(source.value) ? (
            <Button
              variant="tertiary"
              size="compact"
              disabled={busy}
              onClick={() => {
                setEntry(String(source.value));
                void submit({
                  value: source.value,
                  origin: "adopted_source",
                  sourceLabel: `RentVine lease ${view.record?.leaseId ?? ""}`.trim(),
                });
              }}
            >
              Use the RentVine value
            </Button>
          ) : null}
        </p>
      ) : null}
      {canEdit && differsFromSource ? (
        <Field label="Why this corrects the RentVine value" htmlFor={`${id}-reason`}>
          <input
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      ) : null}
      {canEdit ? (
        <div className="ui-row">
          <Button
            variant="secondary"
            size="compact"
            busy={busy}
            busyLabel="Saving…"
            disabled={value === null || (differsFromSource && reason.trim().length < 3)}
            onClick={() =>
              void submit({
                value,
                ...(differsFromSource
                  ? { overridesSource: true, reason: reason.trim() }
                  : {}),
              })
            }
          >
            Save
          </Button>
          {saved ? (
            <Button
              variant="tertiary"
              size="compact"
              disabled={busy}
              onClick={() => {
                setEntry("");
                void submit({ value: null });
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
      {result && !result.ok ? <p role="alert">{result.message}</p> : null}
      {result?.ok ? <p role="status">Saved.</p> : null}
    </li>
  );
}

const NO_ENTRIES: readonly never[] = [];

/**
 * One section's unsaved list. A reload that brings a different saved list replaces the list only
 * while it has no unsaved edits, or when it already equals them (as after this person's own save).
 * Otherwise the edits stay and the newer saved list is offered for review. Every save names the
 * revision the edits started from, so a newer list is never replaced without being seen.
 */
function useSectionDraft<Entry, Draft>(
  saved: { revision: number; entries: readonly Entry[] } | undefined,
  toDraft: (entries: readonly Entry[]) => Draft[],
  normalize: (draft: readonly Draft[]) => unknown,
) {
  const revision = saved?.revision ?? 0;
  const entries = saved?.entries ?? NO_ENTRIES;
  const savedKey = JSON.stringify(normalize(toDraft(entries)));
  const [draft, setDraft] = useState<Draft[]>(() => toDraft(entries));
  const [base, setBase] = useState({ revision, key: savedKey });
  const [seen, setSeen] = useState({ revision, key: savedKey });
  const draftKey = JSON.stringify(normalize(draft));
  if (seen.revision !== revision || seen.key !== savedKey) {
    setSeen({ revision, key: savedKey });
    if (draftKey === base.key || draftKey === savedKey) {
      setDraft(toDraft(entries));
      setBase({ revision, key: savedKey });
    }
  }
  return {
    draft,
    setDraft,
    baseRevision: base.revision,
    newer: base.revision !== revision && draftKey !== savedKey,
    adoptSaved: () => {
      setDraft(toDraft(entries));
      setBase({ revision, key: savedKey });
    },
    keepEdits: () => setBase({ revision, key: savedKey }),
  };
}

function NewerSavedList({
  lines,
  onAdopt,
  onKeep,
}: Readonly<{ lines: string[]; onAdopt: () => void; onKeep: () => void }>) {
  return (
    <div className="ui-stack-tight" role="status" data-packet-newer-list>
      <p>
        Another operator saved a newer list. Your unsaved entries are kept here. The saved
        list reads:
      </p>
      <ul className="ui-rows">
        {lines.length > 0 ? (
          lines.map((line, index) => <li key={index}>{line}</li>)
        ) : (
          <li>No entries.</li>
        )}
      </ul>
      <div className="ui-row">
        <Button variant="tertiary" size="compact" onClick={onAdopt}>
          Use the saved list
        </Button>
        <Button variant="tertiary" size="compact" onClick={onKeep}>
          Keep my entries
        </Button>
      </div>
    </div>
  );
}

function peopleDraft(entries: readonly PacketPersonInput[]): PacketPersonInput[] {
  return entries.map((person) => ({ ...person, roles: [...person.roles] }));
}

/** Compared as the server stores them: trimmed names, lower-case emails. */
function normalizedPeople(people: readonly PacketPersonInput[]) {
  return people.map((person) => ({
    ...person,
    fullName: person.fullName.trim(),
    email: person.email === null ? null : person.email.trim().toLowerCase(),
  }));
}

function animalsDraft(entries: readonly PacketAnimalInput[]): PacketAnimalInput[] {
  return entries.map((animal) => ({ ...animal }));
}

function normalizedAnimals(animals: readonly PacketAnimalInput[]) {
  const trimmed = (value: string | null) => (value === null ? null : value.trim());
  return animals.map((animal) => ({
    ...animal,
    name: trimmed(animal.name),
    species: trimmed(animal.species),
    breed: trimmed(animal.breed),
  }));
}

interface OverrideDraft {
  chargeId: string;
  amount: string;
  reason: string;
}

function overridesDraft(entries: readonly StoredChargeOverride[]): OverrideDraft[] {
  return entries.map((entry) => ({
    chargeId: entry.chargeId,
    amount: String(entry.amountCents / 100),
    reason: entry.reason,
  }));
}

function normalizedOverrides(overrides: readonly OverrideDraft[]) {
  return overrides.map((entry) => ({
    chargeId: entry.chargeId,
    amountCents: Math.round(Number(entry.amount) * 100),
    reason: entry.reason.trim(),
  }));
}

function blankPerson(
  side: SignerRole,
  people: readonly PacketPersonInput[],
): PacketPersonInput {
  return {
    personId: crypto.randomUUID(),
    kind: "person",
    fullName: "",
    email: null,
    emailBasis: null,
    contactRef: null,
    roles: [
      {
        signerRole: side,
        order: nextOrder(people, side),
        dotloopRole: DEFAULT_DOTLOOP_ROLE[side],
      },
    ],
  };
}

/**
 * Each signer role's positions close up to 1, 2, 3 in the order the people already held them.
 * List order never decides signing order.
 */
function closeRolePositions(people: readonly PacketPersonInput[]): PacketPersonInput[] {
  const next = people.map((person) => ({
    ...person,
    roles: person.roles.map((role) => ({ ...role })),
  }));
  for (const role of SIGNER_ROLES) {
    next
      .flatMap((person) => person.roles.filter((entry) => entry.signerRole === role))
      .sort((left, right) => left.order - right.order)
      .forEach((entry, index) => {
        entry.order = index + 1;
      });
  }
  return next;
}

function personLine(person: PacketPersonInput): string {
  const roles = person.roles
    .map((role) => `${SIGNER_ROLE_LABELS[role.signerRole]} ${role.order}`)
    .join(", ");
  return `${person.fullName} (${roles || "no signer role"})`;
}

function nextOrder(people: readonly PacketPersonInput[], role: SignerRole): number {
  return (
    people.flatMap((person) => person.roles).filter((entry) => entry.signerRole === role)
      .length + 1
  );
}

function PeopleSection({
  view,
  canEdit,
  save,
}: Readonly<{ view: PacketInputsView; canEdit: boolean; save: Save }>) {
  const section = useSectionDraft(view.record?.people, peopleDraft, normalizedPeople);
  const { draft: people, setDraft: setPeople } = section;
  const [result, setResult] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const adoptedRefs = new Set(people.map((person) => person.contactRef).filter(Boolean));
  const update = (index: number, change: Partial<PacketPersonInput>) =>
    setPeople((current) =>
      current.map((person, at) => (at === index ? { ...person, ...change } : person)),
    );
  const toggleRole = (index: number, role: SignerRole, on: boolean) =>
    setPeople((current) =>
      current.map((person, at) =>
        at !== index
          ? person
          : {
              ...person,
              roles: on
                ? [
                    ...person.roles,
                    {
                      signerRole: role,
                      order: nextOrder(current, role),
                      dotloopRole: DEFAULT_DOTLOOP_ROLE[role],
                    },
                  ]
                : person.roles.filter((entry) => entry.signerRole !== role),
            },
      ),
    );
  const untoggleRole = (index: number, role: SignerRole) =>
    setPeople((current) =>
      closeRolePositions(
        current.map((person, at) =>
          at !== index
            ? person
            : {
                ...person,
                roles: person.roles.filter((entry) => entry.signerRole !== role),
              },
        ),
      ),
    );
  return (
    <div className="ui-stack-tight" data-packet-people>
      <strong>People and signer roles</strong>
      <p className="muted">
        One person may hold several roles. A PMI manager or broker signs for PMI, never as
        the property owner. Use a reviewed email for anyone who signs in Dotloop.
      </p>
      {view.source.parties
        .filter((party) => !adoptedRefs.has(party.sourceRef))
        .map((party) => (
          <p key={party.sourceRef} className="muted">
            RentVine {party.side}: {party.name}
            {party.email ? ` (${party.email})` : ""}{" "}
            {canEdit ? (
              <Button
                variant="tertiary"
                size="compact"
                onClick={() =>
                  setPeople((current) => [
                    ...current,
                    {
                      ...blankPerson(party.side, current),
                      fullName: party.name,
                      email: party.email,
                      emailBasis: party.email ? "verified_contact" : null,
                      contactRef: party.sourceRef,
                      roles: [
                        {
                          signerRole: party.side,
                          order: nextOrder(current, party.side),
                          dotloopRole: DEFAULT_DOTLOOP_ROLE[party.side],
                        },
                      ],
                    },
                  ])
                }
              >
                Add this {party.side}
              </Button>
            ) : null}
          </p>
        ))}
      <ul className="ui-rows">
        {people.map((person, index) => (
          <li key={person.personId} data-packet-person>
            <Field label="Name" htmlFor={`${person.personId}-name`}>
              <input
                id={`${person.personId}-name`}
                disabled={!canEdit}
                value={person.fullName}
                onChange={(event) => update(index, { fullName: event.target.value })}
              />
            </Field>
            <Field label="Email" htmlFor={`${person.personId}-email`}>
              <input
                id={`${person.personId}-email`}
                disabled={!canEdit}
                type="email"
                value={person.email ?? ""}
                onChange={(event) => {
                  const email =
                    event.target.value.trim() === "" ? null : event.target.value;
                  // An email typed or changed here is a staff review, not the source contact.
                  update(index, { email, emailBasis: email ? "staff_reviewed" : null });
                }}
              />
            </Field>
            <p className="muted">
              {person.emailBasis === "verified_contact"
                ? "Email from the RentVine contact."
                : person.emailBasis === "staff_reviewed"
                  ? "Email reviewed by staff."
                  : "No email recorded."}
            </p>
            <fieldset disabled={!canEdit}>
              <legend>Signer roles</legend>
              {SIGNER_ROLES.map((role) => {
                const held = person.roles.find((entry) => entry.signerRole === role);
                return (
                  <div key={role} className="ui-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(held)}
                        onChange={(event) =>
                          event.target.checked
                            ? toggleRole(index, role, true)
                            : untoggleRole(index, role)
                        }
                      />{" "}
                      {SIGNER_ROLE_LABELS[role]}
                      {held ? ` (position ${held.order})` : ""}
                    </label>
                    {held ? (
                      <select
                        aria-label={`${SIGNER_ROLE_LABELS[role]} Dotloop role for ${person.fullName || "this person"}`}
                        value={held.dotloopRole}
                        onChange={(event) =>
                          update(index, {
                            roles: person.roles.map((entry) =>
                              entry.signerRole === role
                                ? {
                                    ...entry,
                                    dotloopRole: event.target
                                      .value as (typeof DOTLOOP_PARTICIPANT_ROLES)[number],
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        {DOTLOOP_PARTICIPANT_ROLES.map((dotloopRole) => (
                          <option key={dotloopRole} value={dotloopRole}>
                            {dotloopRole}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
            {canEdit ? (
              <Button
                variant="tertiary"
                size="compact"
                onClick={() =>
                  // Positions close up so each role still runs 1, 2, 3 in the same order.
                  setPeople((current) =>
                    closeRolePositions(current.filter((_, at) => at !== index)),
                  )
                }
              >
                Remove {person.fullName || "this person"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div className="ui-row">
          <Button
            variant="tertiary"
            size="compact"
            onClick={() =>
              setPeople((current) => [...current, blankPerson("tenant", current)])
            }
          >
            Add a person
          </Button>
          <Button
            variant="secondary"
            size="compact"
            busy={busy}
            busyLabel="Saving…"
            disabled={people.some((person) => person.fullName.trim() === "")}
            onClick={async () => {
              setBusy(true);
              setResult(
                await save("people", {
                  people: {
                    expectedRevision: section.baseRevision,
                    entries: people.map((person) => ({
                      ...person,
                      fullName: person.fullName.trim(),
                    })),
                  },
                }),
              );
              setBusy(false);
            }}
          >
            Save people
          </Button>
        </div>
      ) : null}
      {section.newer ? (
        <NewerSavedList
          lines={(view.record?.people.entries ?? []).map(personLine)}
          onAdopt={section.adoptSaved}
          onKeep={section.keepEdits}
        />
      ) : null}
      {result && !result.ok ? <p role="alert">{result.message}</p> : null}
    </div>
  );
}

function blankAnimal(): PacketAnimalInput {
  return {
    animalId: crypto.randomUUID(),
    name: null,
    species: null,
    breed: null,
    weight: null,
    weightUnit: null,
    weightBasis: null,
    maturity: null,
    fidoScore: null,
    treatment: null,
  };
}

function text(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function AnimalsSection({
  view,
  canEdit,
  save,
}: Readonly<{ view: PacketInputsView; canEdit: boolean; save: Save }>) {
  const section = useSectionDraft(view.record?.animals, animalsDraft, normalizedAnimals);
  const { draft: animals, setDraft: setAnimals } = section;
  const [result, setResult] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (index: number, change: Partial<PacketAnimalInput>) =>
    setAnimals((current) =>
      current.map((animal, at) => (at === index ? { ...animal, ...change } : animal)),
    );
  return (
    <div className="ui-stack-tight" data-packet-animals>
      <strong>Animals</strong>
      {animals.length === 0 ? (
        <p className="muted">No animal is recorded for this lease.</p>
      ) : null}
      <ul className="ui-rows">
        {animals.map((animal, index) => {
          const key = animal.animalId;
          return (
            <li key={key} data-packet-animal>
              {(
                [
                  ["name", "Name"],
                  ["species", "Species or type"],
                  ["breed", "Breed"],
                ] as const
              ).map(([field, label]) => (
                <Field key={field} label={label} htmlFor={`${key}-${field}`}>
                  <input
                    id={`${key}-${field}`}
                    disabled={!canEdit}
                    value={animal[field] ?? ""}
                    onChange={(event) =>
                      update(index, { [field]: text(event.target.value) })
                    }
                  />
                </Field>
              ))}
              <Field label="Weight" htmlFor={`${key}-weight`}>
                <input
                  id={`${key}-weight`}
                  disabled={!canEdit}
                  type="number"
                  min="0"
                  value={animal.weight ?? ""}
                  onChange={(event) =>
                    update(index, {
                      weight:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Weight unit" htmlFor={`${key}-unit`}>
                <select
                  id={`${key}-unit`}
                  disabled={!canEdit}
                  value={animal.weightUnit ?? ""}
                  onChange={(event) =>
                    update(index, {
                      weightUnit:
                        (text(event.target.value) as "lb" | "kg" | null) ?? null,
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="lb">Pounds</option>
                  <option value="kg">Kilograms</option>
                </select>
              </Field>
              <Field label="The weight is" htmlFor={`${key}-basis`}>
                <select
                  id={`${key}-basis`}
                  disabled={!canEdit}
                  value={animal.weightBasis ?? ""}
                  onChange={(event) =>
                    update(index, {
                      weightBasis:
                        (text(event.target.value) as
                          | "current"
                          | "expected_adult"
                          | null) ?? null,
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="current">The current weight</option>
                  <option value="expected_adult">The expected adult weight</option>
                </select>
              </Field>
              <Field label="Maturity" htmlFor={`${key}-maturity`}>
                <select
                  id={`${key}-maturity`}
                  disabled={!canEdit}
                  value={animal.maturity ?? ""}
                  onChange={(event) =>
                    update(index, {
                      maturity:
                        (text(event.target.value) as "adult" | "juvenile" | null) ?? null,
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="adult">Adult</option>
                  <option value="juvenile">Juvenile</option>
                </select>
              </Field>
              <Field label="FIDO score" htmlFor={`${key}-fido`}>
                <select
                  id={`${key}-fido`}
                  disabled={!canEdit}
                  value={animal.fidoScore === null ? "" : String(animal.fidoScore)}
                  onChange={(event) =>
                    update(index, {
                      fidoScore:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Treatment" htmlFor={`${key}-treatment`}>
                <select
                  id={`${key}-treatment`}
                  disabled={!canEdit}
                  value={animal.treatment ?? ""}
                  onChange={(event) =>
                    update(index, {
                      treatment:
                        (text(event.target.value) as
                          | "pet"
                          | "assistance_animal"
                          | null) ?? null,
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="pet">Pet</option>
                  <option value="assistance_animal">Assistance animal</option>
                </select>
              </Field>
              {canEdit ? (
                <Button
                  variant="tertiary"
                  size="compact"
                  onClick={() =>
                    setAnimals((current) => current.filter((_, at) => at !== index))
                  }
                >
                  Remove {animal.name ?? "this animal"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="ui-row">
          <Button
            variant="tertiary"
            size="compact"
            onClick={() => setAnimals((current) => [...current, blankAnimal()])}
          >
            Add an animal
          </Button>
          <Button
            variant="secondary"
            size="compact"
            busy={busy}
            busyLabel="Saving…"
            onClick={async () => {
              setBusy(true);
              setResult(
                await save("animals", {
                  animals: {
                    expectedRevision: section.baseRevision,
                    entries: animals,
                  },
                }),
              );
              setBusy(false);
            }}
          >
            Save animals
          </Button>
        </div>
      ) : null}
      {section.newer ? (
        <NewerSavedList
          lines={(view.record?.animals.entries ?? []).map(
            (animal, index) =>
              `${animal.name ?? `Animal ${index + 1}`}${animal.species ? `, ${animal.species}` : ""}`,
          )}
          onAdopt={section.adoptSaved}
          onKeep={section.keepEdits}
        />
      ) : null}
      {result && !result.ok ? <p role="alert">{result.message}</p> : null}
    </div>
  );
}

function ChargesSection({
  view,
  canEdit,
  save,
}: Readonly<{ view: PacketInputsView; canEdit: boolean; save: Save }>) {
  const section = useSectionDraft(
    view.record?.chargeOverrides,
    overridesDraft,
    normalizedOverrides,
  );
  const { draft: overrides, setDraft: setOverrides } = section;
  const [result, setResult] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (view.chargePolicy.version === null)
    return (
      <div className="ui-stack-tight" data-packet-charges="no-policy">
        <strong>Charges</strong>
        <p>
          An Admin has not published the renewal charge policy, so charges wait. Facts,
          people and animals can still be saved.
        </p>
      </div>
    );
  const charges = view.charges;
  const overrideFor = (chargeId: string) =>
    overrides.find((entry) => entry.chargeId === chargeId) ?? null;
  const setOverride = (
    chargeId: string,
    change: { amount?: string; reason?: string } | null,
  ) =>
    setOverrides((current) =>
      change === null
        ? current.filter((entry) => entry.chargeId !== chargeId)
        : current.some((entry) => entry.chargeId === chargeId)
          ? current.map((entry) =>
              entry.chargeId === chargeId ? { ...entry, ...change } : entry,
            )
          : [...current, { chargeId, amount: "", reason: "", ...change }],
    );
  const valid = overrides.every(
    (entry) =>
      entry.reason.trim().length >= 3 &&
      entry.amount.trim() !== "" &&
      Number.isFinite(Number(entry.amount)) &&
      Number(entry.amount) >= 0,
  );
  return (
    <div className="ui-stack-tight" data-packet-charges>
      <strong>Charges</strong>
      <p className="muted">
        Calculated from charge policy version {view.chargePolicy.version}
        {view.chargePolicy.effectiveFrom
          ? `, effective ${view.chargePolicy.effectiveFrom}`
          : ""}
        . Calculating writes no RentVine charge.
      </p>
      {charges ? (
        <>
          <ul className="ui-rows">
            {charges.packageMonthlyCents !== null ? (
              <li>
                Resident Benefit Package: {money(charges.packageMonthlyCents)} monthly
              </li>
            ) : null}
            {charges.insuranceMonthlyCents !== null ? (
              <li>Insurance program: {money(charges.insuranceMonthlyCents)} monthly</li>
            ) : null}
            {charges.animals.map((animal: AnimalChargeResult) => (
              <li key={animal.animalId} data-packet-animal-charge={animal.status}>
                <strong>{animal.label}</strong>
                {animal.tierLabel ? ` · ${animal.tierLabel}` : ""}
                {animal.status === "needs_input" ? (
                  <span>: {animal.reason}</span>
                ) : (
                  <ul className="ui-rows">
                    {CADENCES.map(([cadence, label]) => {
                      const chargeId = `animal:${animal.animalId}:${cadence}`;
                      const override = overrideFor(chargeId);
                      return (
                        <li key={cadence}>
                          {label}: {money(animal.amounts[cadence])}
                          {animal.overridden.includes(cadence) ? " (override)" : ""}
                          {canEdit && animal.status === "calculated" ? (
                            override ? (
                              <span className="ui-row">
                                <Field
                                  label={`${label} override amount`}
                                  htmlFor={`${chargeId}-amount`}
                                >
                                  <input
                                    id={`${chargeId}-amount`}
                                    inputMode="decimal"
                                    value={override.amount}
                                    onChange={(event) =>
                                      setOverride(chargeId, {
                                        amount: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Reason" htmlFor={`${chargeId}-reason`}>
                                  <input
                                    id={`${chargeId}-reason`}
                                    value={override.reason}
                                    onChange={(event) =>
                                      setOverride(chargeId, {
                                        reason: event.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Button
                                  variant="tertiary"
                                  size="compact"
                                  onClick={() => setOverride(chargeId, null)}
                                >
                                  Use the calculated amount
                                </Button>
                              </span>
                            ) : (
                              <Button
                                variant="tertiary"
                                size="compact"
                                onClick={() => setOverride(chargeId, {})}
                              >
                                Override
                              </Button>
                            )
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p data-packet-charge-totals>
            Totals:{" "}
            {CADENCES.map(
              ([cadence, label]) => `${label} ${money(charges.totals[cadence])}`,
            ).join(" · ")}
          </p>
          {charges.issues.length > 0 ? (
            <ul className="ui-rows">
              {charges.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="muted">
          Charges appear once the current lease sources are readable.
        </p>
      )}
      {canEdit ? (
        <Button
          variant="secondary"
          size="compact"
          busy={busy}
          busyLabel="Saving…"
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            setResult(
              await save("chargeOverrides", {
                chargeOverrides: {
                  expectedRevision: section.baseRevision,
                  entries: overrides.map((entry) => ({
                    chargeId: entry.chargeId,
                    amountCents: Math.round(Number(entry.amount) * 100),
                    reason: entry.reason.trim(),
                  })),
                },
              }),
            );
            setBusy(false);
          }}
        >
          Save overrides
        </Button>
      ) : null}
      {section.newer ? (
        <NewerSavedList
          lines={(view.record?.chargeOverrides.entries ?? []).map(
            (entry) => `${entry.chargeId}: ${money(entry.amountCents)} (${entry.reason})`,
          )}
          onAdopt={section.adoptSaved}
          onKeep={section.keepEdits}
        />
      ) : null}
      {result && !result.ok ? <p role="alert">{result.message}</p> : null}
    </div>
  );
}
