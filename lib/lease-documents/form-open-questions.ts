// S253 (R-S253-1, R-S253-11, ARCH-S253-3): the one checked list of form questions the business has
// yet to answer, beside the answers it already gave.
//
// `form-open-questions.json` is the data: each open question names who is asked, the one output it
// holds, what works meanwhile and the rules that keep the application from supplying a value for
// it. This module is the check. It fails when a map, a policy or an input supplies a value for a
// listed item, when a listed item leaves the list without a recorded answer, and when a
// registration field or check for assistance animals appears. The same rules guard a charge
// policy at publication and a reviewed map at preparation, so a listed item is never filled by
// the application while it is open. Pure: no I/O. The list is kept copy-ready; nothing here sends
// it to anyone.

import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import raw from "@/lib/lease-documents/form-open-questions.json";
import { SHIPPED_OWNER_EXPLANATION_STARTING_TEXT } from "@/lib/lease-documents/owner-explanation";
import {
  PACKET_FACT_DEFINITIONS,
  PacketAnimalInputSchema,
  emptyPacketInputs,
} from "@/lib/lease-documents/packet-inputs";

/** The questions the client's November 5 answers left open. A question leaves only with an answer. */
export const FORM_QUESTION_IDS = [
  "deposit_schedule",
  "every_time_covers",
  "assistance_animal_rule",
  "owner_explanation_starting_text",
  "lease_executed_on",
  "tenant_initial_boxes",
  "agency_selections",
  "organization_names_and_signers",
] as const;
export type FormQuestionId = (typeof FORM_QUESTION_IDS)[number];

export interface FormOpenQuestion {
  id: string;
  /** The question as it is asked, ready to copy into a message a person sends. */
  question: string;
  askedOf: string;
  /** The one output that waits on the answer. */
  holdsOnly: string;
  /** What staff can do in the meantime. */
  worksMeanwhile: string;
  /** The rules of this check that keep the application from answering it. */
  rules: string[];
}

export interface FormSettledAnswer {
  id: string;
  item: string;
  answer: string;
  answeredBy: string;
  relayedBy: string;
  date: string;
  /** What the words settle and what they leave alone. */
  scope: string;
}

export interface FormOpenQuestionsFile {
  schemaVersion: string;
  asOf: string;
  open: FormOpenQuestion[];
  settled: FormSettledAnswer[];
}

export const FORM_OPEN_QUESTIONS = raw as FormOpenQuestionsFile;

/** The rules each question must name while it is open, so removing one cannot quietly lift a hold. */
const REQUIRED_RULES: Readonly<Record<FormQuestionId, readonly string[]>> = {
  deposit_schedule: ["no_shipped_deposit_schedule"],
  every_time_covers: ["charge_policy_fee_unit_unset"],
  assistance_animal_rule: ["no_assistance_animal_registration"],
  owner_explanation_starting_text: ["no_shipped_starting_text"],
  lease_executed_on: ["execution_date_stays_blank"],
  tenant_initial_boxes: ["tenant_initial_boxes_unassigned"],
  agency_selections: ["agency_selections_unfilled"],
  organization_names_and_signers: ["printed_organization_text_unchanged"],
};

export function isFormQuestionOpen(
  id: string,
  data: FormOpenQuestionsFile = FORM_OPEN_QUESTIONS,
): boolean {
  return data.open.some((entry) => entry.id === id);
}

/** A charge policy as this check reads it: only the parts a listed item could be answered through. */
export interface ChargePolicyLike {
  animals?: unknown;
  petProcessingFee?: { unit?: string | null } | null;
}

/** Everything the application ships that could supply a value for a listed item. */
export interface FormSurfaces {
  data: FormOpenQuestionsFile;
  /** Reviewed maps shipped with the application or seeded by it. Private maps live outside Git. */
  fieldMaps: readonly ArtifactFieldMap[];
  /** Charge policies shipped or seeded. An Admin publishes the real one; the application ships none. */
  chargePolicies: readonly ChargePolicyLike[];
  /** Every value staff can record for an animal. */
  animalInputKeys: readonly string[];
  /** Every fact the packet editor offers. */
  factDefinitions: Readonly<Record<string, { label: string }>>;
  /** Every starting text the application ships for the owner explanation. */
  startingTexts: readonly string[];
  /** Deposits and explanations present before staff record one. */
  shippedDeposits: number;
  shippedExplanations: number;
}

/** What the application ships today, with any part replaced for a check of something else. */
export function shippedFormSurfaces(extra: Partial<FormSurfaces> = {}): FormSurfaces {
  const empty = emptyPacketInputs("1", "2026-01-01T00:00:00.000Z", "form-question-check");
  const deposit = PacketAnimalInputSchema.shape.deposit.unwrap().shape;
  return {
    data: FORM_OPEN_QUESTIONS,
    fieldMaps: [],
    chargePolicies: [],
    animalInputKeys: [
      ...Object.keys(PacketAnimalInputSchema.shape),
      ...Object.keys(deposit).map((key) => `deposit.${key}`),
    ],
    factDefinitions: PACKET_FACT_DEFINITIONS,
    startingTexts: [SHIPPED_OWNER_EXPLANATION_STARTING_TEXT],
    shippedDeposits: empty.animals.entries.filter((animal) => animal.deposit).length,
    shippedExplanations: empty.ownerExplanation?.text ? 1 : 0,
    ...extra,
  };
}

// ---- what a map, an input or a fact may not say while its question is open ------------------------

const REGISTRATION_TERM = /regist|certif|licen[cs]/i;
const ANIMAL_PROOF_TERM =
  /regist|certif|licen[cs]|document|letter|proof|verif|doctor|medical|prescri|disab/i;
const ASSISTANCE_CONTEXT = /assistance|service|support|emotional|\besa\b/i;
const ANIMAL_CONTEXT = /animal|\bpets?\b|\besa\b/i;
const EXECUTION_DATE_KEY = /executed_on|execution_date|date_executed|date_of_execution/;
const EXECUTION_DATE_WORDS =
  /executed on|execution date|date of execution|date executed/i;
const AGENCY_TERM = /agenc(y|ies)/i;
const ORGANIZATION_KEY =
  /^(form|printed)\.|organi[sz]ation_name|brokerage_name|firm_name|company_name/;
const PROTECTED_REGION_KEYS = new Set(["pageIndex", "rect", "kind", "signerRole"]);

type MapField = ArtifactFieldMap["fields"][number];
const fieldWords = (field: MapField) =>
  `${field.fieldId} ${field.factKey.replaceAll(/[._]/g, " ")} ${field.meaning}`;

function executionDateIssues(map: ArtifactFieldMap): string[] {
  if (map.artifactKind !== "owner_acknowledgment") return [];
  const issues: string[] = [];
  if (
    map.fields.some(
      (field) =>
        EXECUTION_DATE_KEY.test(field.factKey) ||
        EXECUTION_DATE_WORDS.test(`${field.fieldId} ${field.meaning}`),
    )
  )
    issues.push(
      "Lease executed on is mapped to a value. It stays blank until the business confirms which date belongs there.",
    );
  if (
    map.static &&
    !map.static.protectedRegions.some((region) => region.kind === "execution_date")
  )
    issues.push(
      "Lease executed on has no protected area on this map. Mark where it is, so nothing is ever drawn there before the business confirms which date belongs.",
    );
  return issues;
}

function initialBoxIssues(map: ArtifactFieldMap): string[] {
  // The reviewed contract keeps an initial area to its page, its place, its kind and a signer
  // role. A record carrying anything else would give a box to one tenant or mark one unused.
  const assigned = (map.static?.protectedRegions ?? []).some(
    (region) =>
      region.kind === "initial" &&
      Object.keys(region).some((key) => !PROTECTED_REGION_KEYS.has(key)),
  );
  return assigned
    ? [
        "A tenant initial box is given to one tenant or marked unused. Every box is left for initials until the business confirms the order.",
      ]
    : [];
}

function agencyIssues(map: ArtifactFieldMap): string[] {
  if (map.artifactKind !== "brokerage_disclosure") return [];
  const selected =
    (map.static?.regions ?? []).some((region) => region.format === "checkmark") ||
    map.fields.some((field) => AGENCY_TERM.test(fieldWords(field)));
  return selected
    ? [
        "An agency selection is mapped to a value. Agency selections are left for the signer until they are confirmed for the case.",
      ]
    : [];
}

function registrationMapIssues(map: ArtifactFieldMap): string[] {
  return map.fields.some((field) => {
    const words = fieldWords(field);
    return REGISTRATION_TERM.test(words) && ASSISTANCE_CONTEXT.test(words);
  })
    ? [
        "A field asks for an assistance animal registration, certificate or license. Staff record only whether an animal is a pet or an assistance animal.",
      ]
    : [];
}

function organizationMapIssues(map: ArtifactFieldMap): string[] {
  return map.fields.some((field) => ORGANIZATION_KEY.test(field.factKey))
    ? [
        "A field would write an organization name onto this form. Each form keeps the organization text it prints.",
      ]
    : [];
}

const MAP_RULES: Readonly<Record<string, (map: ArtifactFieldMap) => string[]>> = {
  execution_date_stays_blank: executionDateIssues,
  tenant_initial_boxes_unassigned: initialBoxIssues,
  agency_selections_unfilled: agencyIssues,
  no_assistance_animal_registration: registrationMapIssues,
  printed_organization_text_unchanged: organizationMapIssues,
};

const SURFACE_RULES: Readonly<Record<string, (surfaces: FormSurfaces) => string[]>> = {
  no_shipped_deposit_schedule: (surfaces) => [
    ...(surfaces.chargePolicies.some(
      (policy) => policy.animals !== null && policy.animals !== undefined,
    )
      ? [
          "a shipped charge policy carries animal tiers, which would set a deposit without staff.",
        ]
      : []),
    ...(surfaces.shippedDeposits > 0
      ? ["a deposit is present before staff record one with its source."]
      : []),
  ],
  charge_policy_fee_unit_unset: (surfaces) =>
    surfaces.chargePolicies.some(
      (policy) =>
        policy.petProcessingFee?.unit !== null &&
        policy.petProcessingFee?.unit !== undefined,
    )
      ? ["a shipped charge policy says what one processing fee covers."]
      : [],
  no_assistance_animal_registration: (surfaces) => [
    ...surfaces.animalInputKeys
      .filter((key) => ANIMAL_PROOF_TERM.test(key))
      .map(
        (key) => `the animal input ${key} asks for a registration, check or document.`,
      ),
    ...Object.entries(surfaces.factDefinitions)
      .filter(([key, definition]) => {
        const words = `${key.replaceAll(/[._]/g, " ")} ${definition.label}`;
        return ANIMAL_PROOF_TERM.test(words) && ANIMAL_CONTEXT.test(words);
      })
      .map(
        ([key]) => `the fact ${key} asks for an animal registration, check or document.`,
      ),
  ],
  no_shipped_starting_text: (surfaces) => [
    ...(surfaces.startingTexts.some((text) => text.trim() !== "")
      ? ["the application ships a starting text for the owner explanation."]
      : []),
    ...(surfaces.shippedExplanations > 0
      ? ["an owner explanation is present before staff write one."]
      : []),
  ],
  execution_date_stays_blank: (surfaces) =>
    Object.keys(surfaces.factDefinitions)
      .filter((key) => EXECUTION_DATE_KEY.test(key))
      .map((key) => `the fact ${key} would supply the Lease executed on date.`),
  printed_organization_text_unchanged: (surfaces) =>
    Object.entries(surfaces.factDefinitions)
      .filter(
        ([key, definition]) =>
          ORGANIZATION_KEY.test(key) || /organi[sz]ation/i.test(definition.label),
      )
      .map(
        ([key]) =>
          `the fact ${key} would carry organization text from one form onto another.`,
      ),
};

const KNOWN_RULES = new Set([...Object.keys(MAP_RULES), ...Object.keys(SURFACE_RULES)]);

/**
 * What a reviewed map does that an open question forbids, in words an Admin can act on. An empty
 * list means the map leaves every listed item alone. A prepared file is refused while this is not
 * empty.
 */
export function fieldMapOpenQuestionIssues(
  map: ArtifactFieldMap,
  data: FormOpenQuestionsFile = FORM_OPEN_QUESTIONS,
): string[] {
  return [
    ...new Set(
      data.open.flatMap((entry) =>
        entry.rules.flatMap((rule) => MAP_RULES[rule]?.(map) ?? []),
      ),
    ),
  ];
}

/**
 * Why a charge policy cannot be published as written, or null. While "what one fee covers" is
 * open, the policy leaves that value unset: it has no default.
 */
export function chargePolicyOpenQuestionIssue(
  content: ChargePolicyLike,
  data: FormOpenQuestionsFile = FORM_OPEN_QUESTIONS,
): string | null {
  const unit = content.petProcessingFee?.unit;
  return isFormQuestionOpen("every_time_covers", data) &&
    unit !== null &&
    unit !== undefined
    ? "What one processing fee covers is still an open question for the business, so it stays unset. Publish the fee with its source note; an agreement for one ordinary pet totals without it."
    : null;
}

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

/**
 * Check the list itself and everything the application ships against it. Each message begins with
 * the question it concerns. An empty result is a pass.
 */
export function checkFormOpenQuestions(surfaces: FormSurfaces): string[] {
  const { data } = surfaces;
  const issues: string[] = [];
  const openIds = data.open.map((entry) => entry.id);
  for (const id of new Set(openIds)) {
    if (openIds.filter((entry) => entry === id).length > 1)
      issues.push(`${id}: listed more than once.`);
    if (!(FORM_QUESTION_IDS as readonly string[]).includes(id))
      issues.push(`${id}: is an open question this check does not know.`);
  }
  for (const id of FORM_QUESTION_IDS) {
    const open = data.open.find((entry) => entry.id === id);
    const settled = data.settled.find((entry) => entry.id === id);
    if (open && settled) issues.push(`${id}: listed as both open and settled.`);
    else if (!open && !settled)
      issues.push(`${id}: removed from the open questions without a recorded answer.`);
    if (open) {
      if (
        ![open.question, open.askedOf, open.holdsOnly, open.worksMeanwhile].every(filled)
      )
        issues.push(
          `${id}: an open question names its question, who is asked, what it holds and what works meanwhile.`,
        );
      for (const rule of REQUIRED_RULES[id])
        if (!open.rules.includes(rule))
          issues.push(`${id}: must name the rule ${rule} while it is open.`);
    }
  }
  for (const answer of data.settled)
    if (
      ![
        answer.id,
        answer.item,
        answer.answer,
        answer.answeredBy,
        answer.relayedBy,
        answer.scope,
      ].every(filled) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(answer.date ?? "")
    )
      issues.push(
        `${answer.id || "a settled item"}: a recorded answer names what was answered, who answered, who relayed it, the date and its scope.`,
      );
  for (const entry of data.open)
    for (const rule of entry.rules) {
      if (!KNOWN_RULES.has(rule)) {
        issues.push(
          `${entry.id}: names the rule ${rule}, which this check does not know.`,
        );
        continue;
      }
      for (const message of SURFACE_RULES[rule]?.(surfaces) ?? [])
        issues.push(`${entry.id}: ${message}`);
      const mapRule = MAP_RULES[rule];
      if (mapRule)
        for (const map of surfaces.fieldMaps)
          for (const message of mapRule(map))
            issues.push(
              `${entry.id}: ${map.artifactKind} map ${map.mapVersion}: ${message}`,
            );
    }
  return [...new Set(issues)];
}
