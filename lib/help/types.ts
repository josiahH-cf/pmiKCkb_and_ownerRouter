// S242 R-S242-3: the typed content model for the staff help hub. Help content is repository-managed
// source that ships with a release; there is no in-app editor and no Firestore collection. Every
// string a staff member reads here follows docs/voice-and-audience.md (present tense, "the app",
// no em dash) and describes only what exists and works today.

import type { SectionHelpId } from "@/lib/lease-renewal/section-help";

/** The manual's areas in table-of-contents order (R-S242-2). */
export type HelpSectionId =
  | "home-and-ask"
  | "lease-renewals"
  | "communications"
  | "documents-and-dotloop"
  | "connections"
  | "admin"
  | "spaces-and-processes"
  | "approval-queue-and-notifications"
  | "profile-and-my-work"
  | "search"
  | "workflow-runs"
  | "maintenance-history";

/**
 * Semantic roles a step or screen control may name. They match the roles the browser check and the
 * mounted check locate with `getByRole`, plus the three special forms the renewal guide checker
 * already understands: `label` (a form control found by its label), `summary` (a disclosure
 * summary found by its text) and `phase` (a renewal phase link).
 */
export type HelpControlRole =
  | "article"
  | "button"
  | "checkbox"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "dialog"
  | "group"
  | "heading"
  | "img"
  | "label"
  | "link"
  | "list"
  | "navigation"
  | "option"
  | "phase"
  | "radio"
  | "region"
  | "row"
  | "status"
  | "summary"
  | "switch"
  | "tab"
  | "table"
  | "textbox";

/**
 * Who a guide or control is for. Help is readable by every role; an Admin-only screen carries a
 * visible Admin label and nothing in help grants or implies authority.
 */
export type HelpAudience = "All staff" | "Renewal staff" | "Approver or Admin" | "Admin";

/** What a step does, rendered beside it so every step says whether it reads or changes something. */
export type HelpStepEffect =
  /** Opens, filters, reads or navigates. Nothing is saved. */
  | "reads"
  /** Saves an app-owned record (a working value, a note, a recorded answer). No source changes. */
  | "saves-in-app"
  /** Copies text to the clipboard or opens another tab. Nothing is saved or sent. */
  | "copies"
  /** Creates an unsent Gmail draft in the signed-in mailbox after its own confirmation. */
  | "unsent-draft"
  /** Changes RentVine, the operating Sheet or Dotloop only after the exact confirmation named in the step. */
  | "exact-confirmation"
  /** Sends or schedules a message only after the explicit Send or Schedule named in the step. */
  | "explicit-send";

/**
 * One control as the interface renders it. `label` is the exact accessible name or visible text;
 * `region` scopes it the same way `scripts/lib/renewal-guide-controls.mjs` does (`role:Name`, or a
 * bare name for a region). `source` lists repository files that contain the label literally, so a
 * renamed control fails the control-name gate with the guide, step and expected label named.
 */
export interface HelpControlRef {
  readonly label: string;
  readonly role: HelpControlRole;
  readonly region?: string;
  /** `conditional` controls appear only in some states; the browser check reports them separately. */
  readonly availability: "required" | "conditional";
  readonly source: readonly string[];
  /**
   * When the label is composed at runtime (for example `Copy all {audience} emails`), the literal
   * template as the source writes it, with `{...}` or `${...}` placeholders. The gate checks the
   * template in the source and that the label matches it.
   */
  readonly sourceText?: string;
  /** For an About trigger: the section help entry whose label forms `About <label>`. */
  readonly aboutId?: SectionHelpId;
  /**
   * Browser-check preparation on the page before the control is located, for example
   * `click-button:Full view` or `click-button:Lease information`.
   */
  readonly actions?: readonly string[];
}

export interface HelpStep {
  /** Stable anchor id within its guide; deep links use `#<id>`. */
  readonly id: string;
  /** One action sentence in the imperative. */
  readonly action: string;
  readonly control: HelpControlRef;
  /** The route pattern where the control lives, for example `/lease-renewal/live/desk/lease/[leaseId]`. */
  readonly route: string;
  /** Plain-language place on the page, for example "Lease details, Correct a lease fact". */
  readonly where: string;
  /** What the person sees after the action. Required for every step. */
  readonly result: string;
  readonly effect: HelpStepEffect;
  /** A scene id from the scene manifest (lib/help/scenes.ts). */
  readonly scene?: string;
  readonly note?: string;
}

export interface HelpGuide {
  readonly id: string;
  readonly section: HelpSectionId;
  readonly title: string;
  readonly audience: HelpAudience;
  /** Shows a visible Admin label; reading it is open to every role. */
  readonly adminOnly?: boolean;
  readonly purpose: string;
  readonly prerequisites: readonly string[];
  readonly steps: readonly HelpStep[];
  /** The recorded result at the end of the process. */
  readonly result: string;
  /** "What this does not do", written as present behavior. */
  readonly doesNotDo: readonly string[];
  readonly relatedGuides: readonly string[];
  readonly relatedScreens: readonly string[];
  /** ISO date of the last content change. */
  readonly lastUpdated: string;
  /** Primary navigation item ids this guide explains. */
  readonly navItems?: readonly string[];
  /** Directory Space ids this guide explains. */
  readonly spaces?: readonly string[];
}

export interface HelpScreenControl {
  readonly label: string;
  readonly role: HelpControlRole;
  readonly region?: string;
  readonly availability: "required" | "conditional";
  readonly source: readonly string[];
  readonly sourceText?: string;
  /** What the control reads, saves or does not do. */
  readonly does: string;
  /** Who can use it, as a role label. */
  readonly who: HelpAudience;
  readonly aboutId?: SectionHelpId;
  /** The route this control lives on when the screen documents more than one route. */
  readonly route?: string;
  readonly actions?: readonly string[];
}

export interface HelpScreenReference {
  readonly id: string;
  readonly title: string;
  /** Route patterns this screen reference documents. */
  readonly routes: readonly string[];
  /** Who can open the screen. */
  readonly who: HelpAudience;
  readonly adminOnly?: boolean;
  readonly summary: string;
  readonly controls: readonly HelpScreenControl[];
  /** Guides that use this screen. */
  readonly guides: readonly string[];
  readonly scenes?: readonly string[];
  readonly navItems?: readonly string[];
  readonly spaces?: readonly string[];
  readonly lastUpdated: string;
}

export interface HelpGlossaryTerm {
  readonly id: string;
  readonly term: string;
  readonly definition: string;
  readonly relatedGuides?: readonly string[];
}

export interface HelpChangelogEntry {
  /** `V<major>.<minor>`. */
  readonly version: string;
  readonly date: string;
  readonly summary: string;
  readonly affectedGuides: readonly string[];
  /** sha256 of the help content modules this version describes (lib/help/content-digest.mjs). */
  readonly contentDigest: string;
}

export interface HelpSection {
  readonly id: HelpSectionId;
  readonly title: string;
  readonly summary: string;
}
