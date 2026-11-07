/** An explicit numeric lease reference supplied by the person, still resolved in their read scope. */
export function explicitLeaseReference(
  text: string,
): { id: string; text: string } | null {
  const match = /\blease(?:\s+(?:id|number))?[\s:#]+(\d{1,20})\b/i.exec(text);
  return match ? { id: match[1], text: match[0] } : null;
}
