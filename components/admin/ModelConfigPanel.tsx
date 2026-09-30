import { friendlyModelLabel, isKnownGoodModel } from "@/lib/config/server";

// S32 read-only model-config surface. It shows which answer/classify model, endpoint location and
// provider are live, via the friendly label map. It exposes NO runtime mutation control: the
// production selection is set by the reviewed release configuration and an owner-run deploy.

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
  location,
  provider,
}: Readonly<{
  answerModel: string;
  classifyModel: string;
  location: string;
  provider: string;
}>) {
  return (
    <article className="admin-panel">
      <h2>Answer model</h2>
      <ul className="ui-rows">
        <ModelRow label="Answer model" modelId={answerModel} />
        <ModelRow label="Classify model" modelId={classifyModel} />
        <li className="ui-spread">
          <span>Model endpoint location</span>
          <strong>{location}</strong>
        </li>
        <li className="ui-spread">
          <span>Provider</span>
          <strong>{provider}</strong>
        </li>
      </ul>
      <p className="muted">
        This panel is read only. The production model is set by GEMINI_MODEL_ANSWER,
        GEMINI_MODEL_CLASSIFY and GEMINI_MODEL_LOCATION in the reviewed release
        configuration plus an owner-run deploy.
      </p>
    </article>
  );
}
