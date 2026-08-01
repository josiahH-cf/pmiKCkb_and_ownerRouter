import type { EnvironmentDescriptorResult } from "@/lib/environment/descriptor";

/**
 * S40 AC-S40-7 — the unambiguous environment/context label.
 *
 * Production shows NOTHING. That is deliberate: the operator's daily surface is Production, so a
 * permanent "Production" chip is noise that trains people to ignore the banner, and the banner then
 * fails to register on the one screen where it matters. The label appears only when the context is
 * NOT ordinary live production, which is exactly when mistaking one for the other is costly.
 *
 * It is a plain status element rather than a role="alert": it describes a standing context, so it
 * must not interrupt a screen reader on every navigation.
 */
export function environmentBadgeLabel(
  result: EnvironmentDescriptorResult,
): { text: string; detail: string } | null {
  // An unresolvable descriptor must NOT read as ordinary Production. Silence is this badge's
  // "everything is normal" signal, so an unknown environment gets the loudest label, not the
  // quietest one.
  if (!result.ok) {
    return {
      text: "Environment not confirmed",
      detail:
        "This deployment did not report which environment it is. Treat what you see as unverified.",
    };
  }
  const descriptor = result.descriptor;
  if (descriptor.environmentKind === "production" && descriptor.dataContext === "live") {
    return null;
  }
  if (descriptor.dataContext === "live_readonly") {
    return {
      text: "Live data, read only",
      detail: "You are seeing real records. Nothing you do here changes them.",
    };
  }
  return {
    text: "Practice environment",
    detail: "Records here are made up. Real client data is not shown.",
  };
}

export function EnvironmentBadge({
  descriptor,
}: Readonly<{ descriptor: EnvironmentDescriptorResult }>) {
  const label = environmentBadgeLabel(descriptor);
  if (!label) return null;
  return (
    <span
      className="environment-badge"
      data-context={descriptor.ok ? descriptor.descriptor.dataContext : "unconfirmed"}
      title={label.detail}
    >
      <span className="environment-badge-text">{label.text}</span>
    </span>
  );
}
