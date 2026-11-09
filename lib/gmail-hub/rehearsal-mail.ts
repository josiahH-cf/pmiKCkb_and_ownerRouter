// The normal build always uses the existing environment fence. The isolated S260
// compiler can substitute this Gmail-only boundary from its disposable checkout.
export { resolveRehearsalStandIn as resolveRehearsalMail } from "@/lib/environment/rehearsal-stand-in";
export function readRehearsalMailTime() {
  return Date.now();
}
