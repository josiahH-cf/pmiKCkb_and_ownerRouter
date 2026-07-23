// S33 renewal target matcher. PURE and deterministic: given a free-text question and the candidate leases
// derived from the AUTHORITATIVE live RentVine read the desk already uses, it returns the single lease whose
// address the question names, or null. STRICT by construction: a candidate matches only when the question
// contains BOTH the street number AND the street-name word; zero or more-than-one match yields null, so Ask
// never guesses a best-fit lease. No I/O, no wall-clock: the caller does the read and passes candidates in.

export interface RenewalTargetCandidate {
  leaseId: string;
  addressLabel: string;
}

export type RenewalTarget = RenewalTargetCandidate;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True only when the question names the candidate's street number AND its street-name word. */
function addressNamedInQuestion(
  questionTokens: ReadonlySet<string>,
  addressLabel: string,
): boolean {
  const tokens = normalize(addressLabel).split(" ").filter(Boolean);
  const numberIndex = tokens.findIndex((token) => /^\d+$/.test(token));
  if (numberIndex === -1) return false;
  const streetNumber = tokens[numberIndex];
  const streetWord = tokens[numberIndex + 1];
  if (!streetWord) return false;
  return questionTokens.has(streetNumber) && questionTokens.has(streetWord);
}

/**
 * Resolve the single lease the question names, or null. Returns a target ONLY on an unambiguous single
 * match (zero or multiple matches → null). Deterministic and pure.
 */
export function matchRenewalTarget(
  question: string,
  candidates: readonly RenewalTargetCandidate[],
): RenewalTarget | null {
  const questionTokens = new Set(normalize(question).split(" ").filter(Boolean));
  const matches = candidates.filter((candidate) =>
    addressNamedInQuestion(questionTokens, candidate.addressLabel),
  );
  if (matches.length !== 1) return null;
  return { leaseId: matches[0].leaseId, addressLabel: matches[0].addressLabel };
}
