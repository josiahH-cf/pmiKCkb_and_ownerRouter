// S117 (R117.3): the dense exact preview an Admin reads before confirming one source effect.
// Pure presentation; the facts come from `lib/lease-renewal/source-update-preview`.

import type { SourceUpdatePreviewFacts } from "@/lib/lease-renewal/source-update-preview";
import type { SourceUpdateTermsBasis } from "@/lib/lease-renewal/source-update-terms-basis";

export function SourceUpdatePreview({
  facts,
  basis,
}: Readonly<{
  facts: SourceUpdatePreviewFacts;
  /** S237 R-S237-1: informational only; it never changes the effect or its confirmation. */
  basis?: SourceUpdateTermsBasis | null;
}>) {
  return (
    <dl aria-label="Exact update preview" className="renewal-update-preview">
      <div>
        <dt>Lease</dt>
        <dd>{facts.lease}</dd>
      </div>
      <div>
        <dt>Source system</dt>
        <dd>{facts.source}</dd>
      </div>
      <div>
        <dt>Field or charge</dt>
        <dd>{facts.target}</dd>
      </div>
      <div>
        <dt>Current</dt>
        <dd>{facts.current}</dd>
      </div>
      <div>
        <dt>Proposed</dt>
        <dd>{facts.proposed}</dd>
      </div>
      <div>
        <dt>Effective timing</dt>
        <dd>{facts.timing}</dd>
      </div>
      <div>
        <dt>What this changes</dt>
        <dd>{facts.consequence}</dd>
      </div>
      {basis ? (
        <div data-renewal-field="terms-basis">
          <dt>Terms basis</dt>
          <dd>
            {basis.terms}. {basis.approval}. {basis.documents}. Shown for review only; it
            does not change this update.
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
