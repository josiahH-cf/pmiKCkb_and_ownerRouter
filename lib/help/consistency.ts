// S244 R-S244-4 / ARCH-S244-3: the help consistency gate. Each renewal About panel's "Saves" and
// "Does not" statements are compared with the linked guide step's expected result and the guide's
// "What this does not do" lines. A contradiction is one side saying the app performs an effect on
// its own (sends, signs, approves, pays, or writes to RentVine, the operating Sheet or Dotloop)
// while the other side says the app does not. Statements qualified by the person's own exact
// confirmation, explicit Send or Schedule, or a person's action are not app-performed claims.
import type { HelpGuide } from "@/lib/help/types";

export type HelpEffect = "send" | "sign" | "approve" | "pay" | "source-write";

const EFFECT_PATTERNS: Readonly<Record<HelpEffect, RegExp>> = {
  send: /\b(sends?|sent|sending|delivers?|delivered|emails?)\b/i,
  sign: /\b(signs?|signed|signing|signatures?)\b/i,
  approve: /\b(approves?|approved|approval)\b/i,
  pay: /\b(pays?|paid|payment|charges? (?:the|a) card)\b/i,
  "source-write":
    /\b(writes?|written|changes?|changed|updates?|updated)\b[^.]*\b(RentVine|Sheet|Dotloop)\b|\b(RentVine|Sheet|Dotloop)\b[^.]*\b(writes?|written|changes?|changed|updated)\b/i,
};

const NEGATION =
  /\b(not|never|nothing|no|none|without|cannot|can't|doesn't|don't|isn't|won't|unless|only)\b/i;
const PERSON_QUALIFIER =
  /\b(your (?:exact |own )?confirmation|you confirm|you choose|staff|a person|the person|by hand|explicit|exact confirmation|confirmed|after you)\b/i;
const APP_SUBJECT = /\b(the app|this app|it)\b/i;

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** The effects a sentence claims the app performs on its own. */
export function appEffectClaims(sentence: string): HelpEffect[] {
  if (
    !APP_SUBJECT.test(sentence) ||
    NEGATION.test(sentence) ||
    PERSON_QUALIFIER.test(sentence)
  )
    return [];
  return (Object.keys(EFFECT_PATTERNS) as HelpEffect[]).filter((effect) =>
    EFFECT_PATTERNS[effect].test(sentence),
  );
}

/** The effects a sentence says the app does not perform. */
export function appEffectDenials(sentence: string): HelpEffect[] {
  if (!NEGATION.test(sentence)) return [];
  return (Object.keys(EFFECT_PATTERNS) as HelpEffect[]).filter((effect) =>
    EFFECT_PATTERNS[effect].test(sentence),
  );
}

export interface HelpPanelStatements {
  readonly id: string;
  readonly saves: string;
  readonly notDone: string;
}

export interface HelpConsistencyProblem {
  readonly panel: string;
  readonly guide: string;
  readonly step: string;
  readonly effect: HelpEffect;
  readonly claim: string;
  readonly denial: string;
}

/** Compares one panel with its linked guide step; returns every contradiction found. */
export function panelContradictions(
  panel: HelpPanelStatements,
  guide: HelpGuide,
  stepId: string,
): HelpConsistencyProblem[] {
  const step = guide.steps.find((candidate) => candidate.id === stepId);
  const panelSentences = sentences(`${panel.saves} ${panel.notDone}`);
  const guideSentences = [
    ...guide.doesNotDo.flatMap(sentences),
    ...(step ? sentences(step.result) : []),
  ];
  const problems: HelpConsistencyProblem[] = [];
  const pairs: Array<[string[], string[]]> = [
    [panelSentences, guideSentences],
    [guideSentences, panelSentences],
  ];
  for (const [claimSide, denialSide] of pairs) {
    for (const claim of claimSide) {
      for (const effect of appEffectClaims(claim)) {
        const denial = denialSide.find((sentence) =>
          appEffectDenials(sentence).includes(effect),
        );
        if (denial)
          problems.push({
            panel: panel.id,
            guide: guide.id,
            step: stepId,
            effect,
            claim,
            denial,
          });
      }
    }
  }
  return problems;
}
