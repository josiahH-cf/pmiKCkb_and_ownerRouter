// S243 ARCH-S243-2 / AC-S243-3: the help capture script and its browser checks run only against the
// isolated synthetic rehearsal on this machine. Any origin that is not plain loopback HTTP (for
// example the production service, a candidate tag URL or another host) is refused.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requireLoopbackRehearsalOrigin(value) {
  let candidate;
  try {
    candidate = new URL(String(value));
  } catch {
    throw new Error(
      "The help rehearsal base URL must be an explicit loopback HTTP origin, for example http://localhost:3000.",
    );
  }
  if (
    candidate.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(candidate.hostname.toLowerCase()) ||
    candidate.username !== "" ||
    candidate.password !== "" ||
    (candidate.pathname !== "/" && candidate.pathname !== "") ||
    candidate.search !== "" ||
    candidate.hash !== ""
  ) {
    throw new Error(
      `Refused ${candidate.origin}: the help capture runs only against the isolated synthetic rehearsal on a loopback HTTP origin.`,
    );
  }
  return candidate.origin;
}
