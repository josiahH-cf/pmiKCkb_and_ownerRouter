// Move-In welcome DRAFT composer (S13 Wave 2 / space-teeth E2e).
//
// Composes a source-tagged welcome for a new tenant across two channels — email + RentVine Portal
// Chat — in the same draft-only shape as the renewal/maintenance composers (reuses DraftFact).
//
// GOVERNANCE: draft ONLY — `production_allowed` and `send_allowed` are literal `false`; a human
// reviews and sends (SMS stays off unless confirmed). Fees are NEVER a hard-coded figure: they render
// as a literal "see RentVine" pointer (variable by property — move-in-move-out-process.md §3.3). The
// Missouri security-deposit policy (up to 2× monthly rent — lease-renewal-discovery-reference.md §2)
// is cited as TEXT for context, never a computed dollar amount for this tenant. Pure + deterministic:
// no I/O, no Date.now().

import type { DraftFact } from "@/lib/lease-renewal/owner-draft";

const NEEDS_VERIFICATION = "Needs Verification";

// F-TMPL-6: the welcome email copy as a frozen, tokenized base. buildWelcomeDraft renders from this by
// default, but an Admin-approved "Move-In Welcome Email" template in the editable store can be injected
// (options.emailBodyTemplate) so the process copy is editable in-app without a code change. The tokens
// are filled from the same source-tagged facts, so governance (fees pointer, deposit posture as text,
// Needs-Verification markers) is preserved regardless of who edited the wording. The default body here
// MUST render byte-identical to the previously inlined copy (a seed-consistency test guards this).
export const WELCOME_V1_BASE_COPY = Object.freeze({
  subject: "Welcome to {{property}}",
  emailBody: [
    "Hello {{tenant}},",
    "",
    "Welcome to your new home at {{property}}! We're glad to have you with PMI KC Metro.",
    "",
    "A few move-in notes:",
    "- Move-in date: {{move_in_date}}",
    "- {{deposit_posture_note}}",
    "- Any move-in fees and deposit amounts: {{fees_pointer}} (these vary by property).",
    "",
    "You'll also receive this note in your RentVine Portal Chat. Contact us any time with questions.",
    "",
    "Thanks,",
    "PMI KC Metro",
  ].join("\n"),
});

/** How the deposit is covered — a cash security deposit vs. a deposit-replacement policy. */
export type DepositPosture = "cash" | "replacement";

export interface WelcomeDraftInput {
  /** Tenant name for the greeting; absent → a Needs-Verification marker (never invented). */
  tenantName?: string;
  /** Property label; absent → a Needs-Verification marker. */
  propertyLabel?: string;
  /** Move-in date (ISO or a human label); absent → a Needs-Verification marker. */
  moveInDate?: string;
  /** Deposit posture; absent → a Needs-Verification marker (do NOT default to either). */
  depositPosture?: DepositPosture;
}

export interface WelcomeDraft {
  kind: "move_in_welcome";
  emailSubject: string;
  emailBody: string;
  portalChatMessage: string;
  /** Deposit posture as prose; cites the 2× policy as text, never a computed figure. */
  depositPostureNote: string;
  /** Always the literal "see RentVine" pointer — fees are variable by property, never hard-coded. */
  feesNote: string;
  facts: DraftFact[];
  /** Inputs that were absent and rendered as `Needs Verification:` markers. */
  missingInputs: string[];
  production_allowed: false;
  send_allowed: false;
}

const FEES_POINTER = "see RentVine";

function isUnverified(value: string | undefined | null): boolean {
  return !value || value.startsWith(NEEDS_VERIFICATION);
}

function depositPostureNote(posture: DepositPosture | undefined): string {
  switch (posture) {
    case "cash":
      // Policy cited as text (up to 2× monthly rent); the exact amount lives in the lease/RentVine.
      return "A cash security deposit is in place (Missouri policy allows up to 2× monthly rent — see the lease/RentVine for the exact amount).";
    case "replacement":
      return "A deposit-replacement policy (The Guarantors / Rhino) covers this tenant's deposit.";
    default:
      return `[${NEEDS_VERIFICATION}: deposit posture (cash security deposit vs. deposit-replacement policy)]`;
  }
}

export interface WelcomeDraftOptions {
  /** An Admin-approved email body (tokenized like WELCOME_V1_BASE_COPY.emailBody) from the editable
   *  store. Absent → the frozen base copy. The subject and Portal Chat message always use the base
   *  wording; only the email body is overridable. */
  emailBodyTemplate?: string;
}

/** Compose a source-tagged move-in welcome draft (email + Portal Chat). No send; gaps stay visible. */
export function buildWelcomeDraft(
  input: WelcomeDraftInput,
  options: WelcomeDraftOptions = {},
): WelcomeDraft {
  const facts: DraftFact[] = [];
  const missingInputs: string[] = [];

  const tenantResolved = !isUnverified(input.tenantName);
  const tenantName = tenantResolved
    ? (input.tenantName as string)
    : `[${NEEDS_VERIFICATION}: tenant name]`;
  if (!tenantResolved) missingInputs.push("tenant name");
  facts.push({
    key: "tenant",
    label: "Tenant",
    value: tenantName,
    source: "Move-in Google Form",
    confidence: tenantResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const propertyResolved = !isUnverified(input.propertyLabel);
  const property = propertyResolved
    ? (input.propertyLabel as string)
    : `[${NEEDS_VERIFICATION}: property/unit]`;
  if (!propertyResolved) missingInputs.push("property/unit");
  facts.push({
    key: "property",
    label: "Property",
    value: property,
    source: "RentVine (read-authoritative)",
    confidence: propertyResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const dateResolved = !isUnverified(input.moveInDate);
  const moveInDate = dateResolved
    ? (input.moveInDate as string)
    : `[${NEEDS_VERIFICATION}: move-in date]`;
  if (!dateResolved) missingInputs.push("move-in date");
  facts.push({
    key: "move_in_date",
    label: "Move-in date",
    value: moveInDate,
    source: "Move-in Google Form",
    confidence: dateResolved ? "Likely" : NEEDS_VERIFICATION,
  });

  const postureNote = depositPostureNote(input.depositPosture);
  if (input.depositPosture === undefined) missingInputs.push("deposit posture");
  facts.push({
    key: "deposit_posture",
    label: "Deposit posture",
    value: input.depositPosture ?? `[${NEEDS_VERIFICATION}: deposit posture]`,
    source: "Tab 1 `Guarantors Policy locking them in?` / lease",
    confidence: input.depositPosture ? "Likely" : NEEDS_VERIFICATION,
  });

  // Fees are ALWAYS a pointer, never a hard-coded amount (variable by property).
  facts.push({
    key: "fees",
    label: "Move-in fees / deposit amount",
    value: FEES_POINTER,
    source: "RentVine (variable by property)",
    confidence: NEEDS_VERIFICATION,
  });

  // Render the email from the base copy (or an injected Admin-approved body) with the same facts. The
  // subject always uses the base wording; only the body is overridable.
  const replacements = {
    tenant: tenantName,
    property,
    move_in_date: moveInDate,
    deposit_posture_note: postureNote,
    fees_pointer: FEES_POINTER,
  };
  const emailSubject = renderBaseCopy(WELCOME_V1_BASE_COPY.subject, replacements);
  const emailBody = renderBaseCopy(
    options.emailBodyTemplate ?? WELCOME_V1_BASE_COPY.emailBody,
    replacements,
  );

  const portalChatMessage = [
    `Welcome to ${property}, ${tenantName}! We're glad to have you.`,
    `Move-in date: ${moveInDate}. ${postureNote}`,
    `Move-in fees / deposit amount: ${FEES_POINTER}. Message us any time.`,
  ].join("\n");

  return {
    kind: "move_in_welcome",
    emailSubject,
    emailBody,
    portalChatMessage,
    depositPostureNote: postureNote,
    feesNote: `Move-in fees and deposit amounts: ${FEES_POINTER} (variable by property; never a hard-coded figure).`,
    facts,
    missingInputs,
    production_allowed: false,
    send_allowed: false,
  };
}

function renderBaseCopy(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}
