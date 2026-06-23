import { pathToFileURL } from "node:url";
import {
  REQUIRED_GCP_APIS,
  evaluateEnabledApis,
  evaluateFirestoreDatabase,
  fetchLiveState,
} from "./preflight-gcp-setup.mjs";
import { readProductionPreflightEnv } from "./preflight-production-cutover.mjs";

// "Are we still in sync with reality?" — a FREE, read-only reconcile between what the repo/docs
// assume and what the live Google project actually shows. Every live call here is a metadata
// describe/list/get (enabled APIs, the Firestore database, the Firebase project); none run
// inference, search, import, or any billed operation, so this never spends against the $10 cap. It
// needs the owner's Application Default Credentials to read live state; without them it reports
// "unverified" and exits 0 — a stale map is not a failure, just unconfirmed. It never writes.

// Dimensions we do NOT yet check automatically. Listed explicitly so the report never implies more
// coverage than it has. Each is a free metadata read a later pass can add (or the owner can
// eyeball) — no silent gaps.
export const NOT_COVERED = [
  "Cloud Run service status — is the demo still deployed at the recorded URL?",
  "Billing spend vs the $10 cap, and whether the budget kill switch is still wired.",
  "Agent Search datastore — how many documents are actually indexed.",
  "Firebase Auth — the user roster and the allowed-domain (pmikcmetro.com) enforcement.",
  "Drive — the source-folder contents and sharing.",
  "Gmail — labels, filters, and send authority.",
];

function dimension(name, expected, observed, state, extra = {}) {
  return { name, expected, observed, state, ...extra };
}

// Pure: given the resolved project id and a fetchLiveState() result, decide whether the live
// territory matches the recorded map. No I/O — the live read is done by the caller and injected,
// which is also how the unit tests exercise every verdict without touching the network.
export function summarizeReality({ projectId, requiredApis = REQUIRED_GCP_APIS, live }) {
  if (!live || !live.credentials_available) {
    return {
      verdict: "unverified",
      reason:
        "No Application Default Credentials, so live state could not be read. Sign in as a " +
        "pmikcmetro.com identity (`gcloud auth application-default login`) and rerun with --live. " +
        "This is free.",
      dimensions: [],
      not_covered: NOT_COVERED,
      errors: live?.errors ?? [],
    };
  }

  const dimensions = [];

  const observedProject = live.firebase_project?.projectId ?? null;
  dimensions.push(
    dimension(
      "Project identity",
      projectId ?? "(unset)",
      observedProject ?? "(not found)",
      observedProject && projectId && observedProject === projectId
        ? "in-sync"
        : observedProject
          ? "drift"
          : "unknown",
    ),
  );

  const apiCheck = evaluateEnabledApis(live.enabled_services ?? [], requiredApis);
  dimensions.push(
    dimension(
      "Required APIs enabled",
      `${requiredApis.length} required`,
      `${apiCheck.enabled.length} enabled, ${apiCheck.missing.length} missing`,
      live.enabled_services == null
        ? "unknown"
        : apiCheck.missing.length === 0
          ? "in-sync"
          : "drift",
      { missing: apiCheck.missing },
    ),
  );

  const firestore = evaluateFirestoreDatabase(live.firestore_database);
  const firestoreOk =
    firestore.exists && firestore.native_mode && firestore.location === "us-central1";
  dimensions.push(
    dimension(
      "Firestore database",
      "us-central1 / FIRESTORE_NATIVE",
      firestore.exists ? `${firestore.location} / ${firestore.type}` : "(not found)",
      live.firestore_database == null ? "unknown" : firestoreOk ? "in-sync" : "drift",
    ),
  );

  const drift = dimensions.filter((entry) => entry.state === "drift");
  const unknown = dimensions.filter((entry) => entry.state === "unknown");

  return {
    verdict: drift.length > 0 ? "drift" : unknown.length > 0 ? "partial" : "in-sync",
    dimensions,
    not_covered: NOT_COVERED,
    errors: live.errors ?? [],
  };
}

export function parseRealityCheckArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.slice(name.length + 3) : undefined;
  };

  return {
    live: argv.includes("--live"),
    json: argv.includes("--json"),
    project: readArg("project"),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseRealityCheckArgs(argv);
  const mergedEnv = readProductionPreflightEnv({ env });
  const projectId =
    args.project || mergedEnv.GCP_PROJECT_ID || mergedEnv.FIREBASE_PROJECT_ID;

  let report;

  if (args.live) {
    const live = projectId
      ? await fetchLiveState(projectId)
      : { credentials_available: false, errors: ["No project id set (GCP_PROJECT_ID)."] };
    report = summarizeReality({ projectId, live });
  } else {
    report = {
      verdict: "not-checked",
      reason:
        "Plan mode: this only confirms a recorded project id was found. Add --live (free, needs " +
        "your Google login) to compare against the actual cloud project.",
      project_id: projectId ?? null,
      not_covered: NOT_COVERED,
    };
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, projectId);
  }

  return report;
}

function printReport(report, projectId) {
  console.log("Reality check — recorded map vs live territory (free, read-only)");
  console.log(`Project: ${projectId ?? "(unset)"}`);
  console.log(`Verdict: ${report.verdict}`);

  if (report.reason) {
    console.log(report.reason);
  }

  for (const entry of report.dimensions ?? []) {
    const mark =
      entry.state === "in-sync"
        ? "in-sync"
        : entry.state === "drift"
          ? "DRIFT  "
          : "unknown";
    console.log(
      `  [${mark}] ${entry.name}: expected ${entry.expected}; live ${entry.observed}`,
    );

    if (entry.missing?.length) {
      console.log(`           missing: ${entry.missing.join(", ")}`);
    }
  }

  for (const note of report.errors ?? []) {
    console.warn(`  read note: ${note}`);
  }

  console.log(
    "Not auto-checked yet (free reads a later pass can add, or eyeball these):",
  );
  for (const item of report.not_covered ?? []) {
    console.log(`  - ${item}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
