import { friendlyModelLabel, isKnownGoodModel } from "@/lib/config/server";

// S32 read-only model-config surface. It shows which answer/classify model and provider are live, via the
// friendly label map. It exposes NO runtime mutation control: swapping to a newer KB model is an env edit
// to GEMINI_MODEL_ANSWER plus an owner-run deploy, stated plainly. Read-only by design.

function ModelRow({ label, modelId }: Readonly<{ label: string; modelId: string }>) {
  const known = isKnownGoodModel(modelId);
  return (
    <li className="ui-spread">
      <span>{label}</span>
      <span>
        <strong>{friendlyModelLabel(modelId)}</strong>
        {known ? null : <span className="muted"> (not in the known-good list)</span>}
      </span>
    </li>
  );
}

export function ModelConfigPanel({
  answerModel,
  classifyModel,
  provider,
}: Readonly<{ answerModel: string; classifyModel: string; provider: string }>) {
  return (
    <article className="admin-panel">
      <h2>Answer model</h2>
      <ul className="ui-rows">
        <ModelRow label="Answer model" modelId={answerModel} />
        <ModelRow label="Classify model" modelId={classifyModel} />
        <li className="ui-spread">
          <span>Provider</span>
          <strong>{provider}</strong>
        </li>
      </ul>
      <p className="muted">
        This panel is read only. Changing the KB model is an env edit to
        GEMINI_MODEL_ANSWER plus an owner-run deploy.
      </p>
    </article>
  );
}
