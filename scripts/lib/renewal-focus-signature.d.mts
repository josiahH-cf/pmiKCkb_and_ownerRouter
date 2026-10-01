/** Runs inside the page; returns the serialized Full view signature. */
export function pageFullViewSignature(): string;
/** Which parts of two signatures differ, by key, count, index and section id only. */
export function describeSignatureDifference(before: string, after: string): string;
