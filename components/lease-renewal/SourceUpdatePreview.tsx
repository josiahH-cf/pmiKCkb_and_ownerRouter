// S117 (R117.3): the dense exact preview an Admin reads before confirming one source effect.
// Pure presentation; the facts come from `lib/lease-renewal/source-update-preview`.

import type { SourceUpdatePreviewFacts } from "@/lib/lease-renewal/source-update-preview";

export function SourceUpdatePreview({
  facts,
}: Readonly<{ facts: SourceUpdatePreviewFacts }>) {
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
    </dl>
  );
}
