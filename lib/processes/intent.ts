// Deterministic process intent-detection (R4 action console). The free, instant, prod-safe first pass:
// score each process by how many of its name tokens + domain aliases appear in the question, return the
// best match or null. No model, no network, no cost — runs client-side as the user types. The model
// fallback (lib/processes/classify.ts, via the ModelProvider seam) only runs when this finds nothing and
// the user asks for it, so the common case never costs a model call.

export interface ProcessLike {
  id: string;
  name: string;
}

export interface IntentMatch {
  processId: string;
  name: string;
  /** Count of distinct matched terms — higher is a stronger match. */
  score: number;
  matchedTerms: string[];
}

// Domain synonyms per known process id. Single words match question tokens; multi-word phrases (with a
// space) match as a substring. Falls back to the process's own name tokens for unlisted processes.
export const DEFAULT_PROCESS_ALIASES: Record<string, string[]> = {
  "lease-renewal": [
    "renewal",
    "renewals",
    "renew",
    "renewing",
    "renewed",
    "lease",
    "leases",
    "resign",
    "extension",
    "extend",
  ],
  "maintenance-work-order-intake": [
    "maintenance",
    "repair",
    "repairs",
    "work order",
    "work-order",
    "workorder",
    "broken",
    "fix",
    "leak",
    "leaking",
    "plumbing",
    "hvac",
    "appliance",
  ],
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "for", "to", "of", "and", "or", "what", "how", "do", "does",
  "i", "we", "my", "our", "this", "that", "with", "on", "in", "it", "need", "want", "can",
  "should", "when", "where", "who", "be", "has", "have", "up",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]+/g) ?? []).filter(
    (token) => !STOPWORDS.has(token),
  );
}

/**
 * Best-matching process for a free-text question, or null when nothing clearly matches. Pure +
 * deterministic. `aliases` defaults to DEFAULT_PROCESS_ALIASES (keyed by process id), with each
 * process's own name tokens always considered.
 */
export function detectProcess(
  question: string,
  processes: readonly ProcessLike[],
  aliases: Record<string, string[]> = DEFAULT_PROCESS_ALIASES,
): IntentMatch | null {
  const questionTokens = new Set(tokenize(question));
  const questionText = question.toLowerCase();

  let best: IntentMatch | null = null;
  for (const process of processes) {
    const terms = new Set<string>([
      ...tokenize(process.name),
      ...(aliases[process.id] ?? []),
    ]);

    const matched: string[] = [];
    for (const term of terms) {
      const isPhrase = term.includes(" ");
      if (isPhrase ? questionText.includes(term) : questionTokens.has(term)) {
        matched.push(term);
      }
    }

    if (matched.length > 0 && (best === null || matched.length > best.score)) {
      best = {
        processId: process.id,
        name: process.name,
        score: matched.length,
        matchedTerms: matched,
      };
    }
  }

  return best;
}
