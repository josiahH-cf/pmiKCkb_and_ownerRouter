// S271: resolved for "@/lib/environment/rehearsal-stand-in" only inside the isolated compile
// (scripts/lib/one-path-rehearsal/compiled-mail.mjs). Every export is the shared module's own,
// except resolveRehearsalStandIn: the governed Gmail draft asks it for the rehearsal's mail
// stand-in, and here it answers only under the same compiled synthetic-mail fence as the S260
// adapter (production build of the disposable worktree, Demo with Demo data, loopback emulators,
// the installed network guard and the per-run worker token and clock). Anywhere else it is null.
import type { RehearsalStandIn } from "../../../lib/environment/rehearsal-stand-in";
import { resolveRehearsalMail } from "./s260-compiled-mail";

export {
  REHEARSAL_STAND_IN_ORIGIN_VAR,
  loopbackStandInOrigin,
  rehearsalStandInFor,
} from "../../../lib/environment/rehearsal-stand-in";
export type { RehearsalStandIn } from "../../../lib/environment/rehearsal-stand-in";

export function resolveRehearsalStandIn(
  env: NodeJS.ProcessEnv = process.env,
): RehearsalStandIn | null {
  return resolveRehearsalMail(env);
}
