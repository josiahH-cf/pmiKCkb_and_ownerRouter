import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const FILE = "pmi-browser-enrollment.json";
// Only the attended enrollment command writes this marker after verified sign-in. No cookies,
// identities or credentials are copied; the opaque revision merely wakes a paused local watcher.
export function recordBrowserEnrollment(profile) {
  const path = join(profile, FILE);
  const pending = `${path}.${process.pid}.tmp`;
  writeFileSync(pending, JSON.stringify({ version: randomUUID() }) + "\n", {
    mode: 0o600,
  });
  renameSync(pending, path);
}
export function browserEnrollmentVersion(profiles) {
  return JSON.stringify(
    profiles.map((profile) => {
      try {
        const marker = JSON.parse(readFileSync(join(profile, FILE), "utf8"));
        return typeof marker.version === "string" ? marker.version : null;
      } catch {
        return null;
      }
    }),
  );
}
