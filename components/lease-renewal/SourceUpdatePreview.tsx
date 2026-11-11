// S117 (R117.3): the dense exact preview an Admin reads before confirming one source effect.
// Pure presentation; the facts come from `lib/lease-renewal/source-update-preview`.

import type { SourceUpdatePreviewFacts } from "@/lib/lease-renewal/source-update-preview";
import type { SourceUpdateTermsBasis } from "@/lib/lease-renewal/source-update-terms-basis";
import {
  TENANT_ACCEPTANCE_HOLD_WORDS,
  type TenantAcceptanceHold,
} from "@/lib/lease-renewal/tenant-acceptance-hold";

export function SourceUpdatePreview({
  facts,
  basis,
  hold,
}: Readonly<{
  facts: SourceUpdatePreviewFacts;
  /** S237 R-S237-1: informational only; it never changes the effect or its confirmation. */
  basis?: SourceUpdateTermsBasis | null;
  /**
   * S264 R-S264-6: the tenant's recorded acceptance answers an earlier offer, so this update
   * carrying the accepted renewal waits; the line names the exact difference.
   */
  hold?: TenantAcceptanceHold | null;
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
      {hold ? (
        <div data-renewal-field="acceptance-hold">
          <dt>{TENANT_ACCEPTANCE_HOLD_WORDS.label}</dt>
          <dd>
            {hold.line} {TENANT_ACCEPTANCE_HOLD_WORDS.update}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
