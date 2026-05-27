import type { SourceState } from "@/lib/source-state";

const labels: Record<SourceState, string> = {
  "Verified Source": "Verified Source",
  "Partial Source": "Partial Source",
  "Bailey Placeholder": "Bailey Placeholder",
  "Conflict Found": "Conflict Found",
  "No Reliable Source Found": "No Reliable Source Found",
};

export function SourceStateBanner({ state }: Readonly<{ state: SourceState }>) {
  return (
    <div className="source-banner" data-state={state}>
      <span>{labels[state]}</span>
    </div>
  );
}
