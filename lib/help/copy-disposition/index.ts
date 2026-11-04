// S244 R-S244-1: the disposition table for every in-app help text: each renewal About panel, the
// InfoTips outside them, every in-scope inline helper sentence and every Process guide entry. Each
// row records the current text, what it describes, any delivered rule it contradicted (suite id),
// its disposition (keep, correct, remove) and, for a correction, the text it replaced. The
// enumeration test (tests/unit/s244-help-copy-disposition.test.ts) fails when a help text in
// source has no row, when a row names text the source no longer has, or when a removed or
// replaced text comes back.
import aboutPanels from "@/lib/help/copy-disposition/about-panels.json";
import infotipsAndGuide from "@/lib/help/copy-disposition/infotips-and-process-guide.json";
import inlineAdmin from "@/lib/help/copy-disposition/inline-admin-communications.json";
import inlineRenewalA from "@/lib/help/copy-disposition/inline-lease-renewal-a.json";
import inlineRenewalB from "@/lib/help/copy-disposition/inline-lease-renewal-b.json";
import inlineOther from "@/lib/help/copy-disposition/inline-other.json";

export type HelpCopyKind = "about" | "infotip" | "inline" | "process-guide";
export type HelpCopyDispositionValue = "keep" | "correct" | "remove";

export interface HelpCopyCorrection {
  /** For About panels: purpose, steps, saves, notDone or next. */
  readonly field?: string;
  readonly before: string;
  readonly after: string;
}

export interface HelpCopyDisposition {
  readonly kind: HelpCopyKind;
  /** The file that renders (or, for About panels, defines) the text. */
  readonly location: string;
  /** For About panels: the SECTION_HELP id. */
  readonly aboutId?: string;
  /** The current text exactly as the inventory normalizes it (About panels: the purpose). */
  readonly text: string;
  /** The current behavior or process the text describes. */
  readonly describes: string;
  readonly disposition: HelpCopyDispositionValue;
  /** Delivered rules the earlier text contradicted, as suite ids. */
  readonly contradicts?: readonly string[];
  readonly corrections?: readonly HelpCopyCorrection[];
}

export const HELP_COPY_DISPOSITIONS: readonly HelpCopyDisposition[] = [
  ...(aboutPanels as HelpCopyDisposition[]),
  ...(infotipsAndGuide as HelpCopyDisposition[]),
  ...(inlineRenewalA as HelpCopyDisposition[]),
  ...(inlineRenewalB as HelpCopyDisposition[]),
  ...(inlineAdmin as HelpCopyDisposition[]),
  ...(inlineOther as HelpCopyDisposition[]),
];
