// S110 assistant item: one owning record as the renewal and work adapters project it. S138 answers
// carry these same identities, titles, details, blockers and links inside the conversation groups.

export interface AssistantItem {
  /** The owning record's id, exactly as the owning view uses it. */
  readonly id: string;
  readonly title: string;
  /** The most useful status or date for this record, in the owning view's own words. */
  readonly detail: string;
  readonly blockers: readonly string[];
  /** An exact in-app link to the owning view. The assistant never builds a provider URL. */
  readonly href: string;
}
