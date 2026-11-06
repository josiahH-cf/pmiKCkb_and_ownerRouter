// S252 R-S252-1 / L24 / L61, harness only: print the served commit's in-app help guides as data,
// one JSON line, for scripts/lib/one-path-rehearsal/read-guides.mjs. The rehearsal serves a
// commit's tree, so `@/lib/help/index` here is that commit's own manual: the starting commit's
// guides on a `--commit` run, the rewritten guides on the candidate. Nothing is rendered or sent.
//
// The rehearsal's network boundary (tests/browser/renewal-novdec-journey-network.mjs) must be
// loaded in THIS process before the manual is read; it refuses to run otherwise.
import net from "node:net";

function assertNetworkBoundary() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  const socketGuarded = net.Socket.prototype.connect.name === "guardedConnect";
  if (!fetchGuarded || !socketGuarded)
    throw new Error(
      "The rehearsal network boundary is not loaded in the guide reader; nothing was read.",
    );
}

async function main() {
  assertNetworkBoundary();
  const { HELP_GUIDES } = await import("@/lib/help/index");
  const { HELP_VERSION } = await import("@/lib/help/version");
  const guides = HELP_GUIDES.map((guide) => ({
    id: guide.id,
    section: guide.section,
    title: guide.title,
    steps: guide.steps.map((step) => ({
      id: step.id,
      action: step.action,
      control: {
        label: step.control.label,
        role: step.control.role,
        region: step.control.region ?? "",
        availability: step.control.availability,
        actions: step.control.actions ?? [],
      },
      route: step.route,
      effect: step.effect,
      scene: step.scene ?? null,
    })),
  }));
  process.stdout.write(`${JSON.stringify({ version: HELP_VERSION, guides })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String((error as Error)?.message ?? error)}\n`);
  process.exit(1);
});
