// S40 release safety: the blue/green candidate delivery path.
//
// The legacy wrapper (scripts/deploy-demo-cloud-run.mjs) deploys and PROMOTES in one step, so a bad
// revision is serving before anything has checked it. That is why it is not D05-eligible. This module
// splits delivery into three explicitly ordered, individually reviewable steps:
//
//   1. deploy a named candidate revision at ZERO traffic, reachable only through its own tag URL
//   2. run a bounded read-only smoke against that exact candidate URL
//   3. promote that EXACT revision by name, having first captured the prior serving revision
//
// Every function here is pure: it builds argument vectors and refusals. Nothing in this file spawns
// gcloud — the executable wrapper does that, and `--plan-only` is a branch that cannot reach it.

export const ENVIRONMENT_KIND_VAR = "ENVIRONMENT_KIND";
export const DATA_CONTEXT_VAR = "DATA_CONTEXT";

/**
 * The exact descriptor pair each target environment must ship. A deployed revision resolves its
 * descriptor from these, so the running service reports `source:"explicit"` and never falls back to
 * `legacy-node-env` (which the Production cutover preflight refuses).
 */
export const ENVIRONMENT_DESCRIPTORS = Object.freeze({
  production: Object.freeze({ ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live" }),
  demo: Object.freeze({ ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "demo" }),
});

export const RELEASE_ENVIRONMENTS = Object.freeze(Object.keys(ENVIRONMENT_DESCRIPTORS));

/**
 * Configuration that is meaningful ONLY on a developer machine. Any of these reaching a deployed
 * revision would silently point production at an emulator, a local model, or a key file — so the
 * preflight refuses by NAME rather than quietly dropping them.
 *
 * `presentIsFatal` variables are fatal whenever they appear at all. `trueIsFatal` variables are
 * legitimate configuration whose local-only value is the truthy one.
 */
export const LOCAL_ONLY_DEPLOY_VARIABLES = Object.freeze({
  presentIsFatal: Object.freeze([
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "PUBSUB_EMULATOR_HOST",
    "STORAGE_EMULATOR_HOST",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "LOCAL_MODEL_BASE_URL",
    "LOCAL_MODEL_NAME",
    "OLLAMA_HOST",
  ]),
  trueIsFatal: Object.freeze(["LOCAL_DEMO_AUTH", "ASK_DEMO_MODE"]),
});

function isTruthy(value) {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

/**
 * Refuse local-only configuration by name, from BOTH the resolved deploy map and the ambient
 * process. Checking only the resolved map would miss the common failure: an operator whose shell
 * exports `FIRESTORE_EMULATOR_HOST` from a previous emulator session, which the deploy would
 * otherwise inherit through a non-file-backed path.
 */
export function findLocalOnlyDeployConfig({ resolved = {}, ambient = {} } = {}) {
  const errors = [];
  const warnings = [];

  // `presentIsFatal` variables have NO override anywhere in the deploy path, so an ambient value can
  // ride into the revision. Both sources are therefore fatal.
  for (const [sourceLabel, source] of [
    ["the resolved deploy environment", resolved],
    ["the ambient shell", ambient],
  ]) {
    for (const name of LOCAL_ONLY_DEPLOY_VARIABLES.presentIsFatal) {
      const value = source[name];
      if (typeof value === "string" && value.trim() !== "") {
        errors.push(
          `${name} is set in ${sourceLabel}; it is local-only and must not deploy.`,
        );
      }
    }
  }

  // `trueIsFatal` variables are pinned to "false" by the deploy env map, so a dirty shell cannot
  // reach the service through them. Refusing on the ambient value would block a genuinely safe
  // deploy and teach operators to bypass the check — so the RESOLVED map is the fatal test, and a
  // dirty shell is surfaced as a warning instead of a lie in either direction.
  for (const name of LOCAL_ONLY_DEPLOY_VARIABLES.trueIsFatal) {
    if (isTruthy(resolved[name])) {
      errors.push(
        `${name} is enabled in the resolved deploy environment; it is local-only and must not deploy.`,
      );
    } else if (isTruthy(ambient[name])) {
      warnings.push(
        `${name} is enabled in the ambient shell. The deploy map pins it to "false", so it will not reach the revision.`,
      );
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function parseReleaseArgs(argv = []) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };
  const errors = [];
  const environment = readArg("--environment");
  const planOnly = argv.includes("--plan-only");
  const promote = argv.includes("--promote");
  const execute = argv.includes("--execute");

  if (!environment) {
    errors.push(
      `--environment is required and must be one of: ${RELEASE_ENVIRONMENTS.join(", ")}.`,
    );
  } else if (!RELEASE_ENVIRONMENTS.includes(environment)) {
    errors.push(
      `--environment="${environment}" is not one of: ${RELEASE_ENVIRONMENTS.join(", ")}.`,
    );
  }
  // A plan is a guarantee that nothing runs. Combining it with an execute or promote flag would
  // make that guarantee ambiguous, so it is a hard refusal rather than a precedence rule.
  if (planOnly && (execute || promote)) {
    errors.push("--plan-only cannot be combined with --execute or --promote.");
  }
  // Checked here, with the other argument errors, so an operator who forgot the mode is told so
  // rather than being handed an unrelated deploy-config failure first.
  if (!planOnly && !execute && !promote) {
    errors.push("Specify exactly one of --plan-only, --execute, or --promote.");
  }
  if (execute && promote) {
    errors.push("--execute deploys a candidate; promote it in a separate invocation.");
  }

  const candidateRevision = readArg("--candidate-revision");
  const priorRevision = readArg("--prior-revision");
  if (promote && !candidateRevision) {
    errors.push("--promote requires --candidate-revision=<exact revision name>.");
  }

  return {
    candidateRevision,
    environment,
    errors,
    execute,
    planOnly,
    priorRevision,
    promote,
    project: readArg("--project"),
    region: readArg("--region"),
    service: readArg("--service"),
    tag: readArg("--tag"),
  };
}

/** Cloud Run tags are DNS labels; the candidate URL is built from this. */
export function candidateTagFor(revisionSuffix) {
  const normalized = String(revisionSuffix ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  if (!normalized) throw new Error("A candidate tag needs a non-empty revision suffix.");
  return `cand-${normalized}`.slice(0, 34).replace(/-+$/g, "");
}

/**
 * Deploy args for a ZERO-TRAFFIC candidate. `--no-traffic` is what makes this reviewable: the
 * revision exists and is reachable through `--tag`, but no user request reaches it until a separate,
 * deliberate promotion step names it.
 */
export function buildCandidateDeployPlan({
  baseArgs = [],
  environment,
  revisionSuffix,
  tag,
} = {}) {
  const descriptor = ENVIRONMENT_DESCRIPTORS[environment];
  if (!descriptor) {
    throw new Error(`Unknown release environment "${environment}".`);
  }
  const candidateTag = tag ?? candidateTagFor(revisionSuffix);
  return {
    candidateTag,
    descriptor,
    args: [...baseArgs, "--no-traffic", `--tag=${candidateTag}`],
  };
}

/**
 * Promote one EXACT revision. `--to-revisions=<name>=100` is deliberate: `--to-latest` would follow
 * whatever revision happens to be newest, which is exactly the behaviour that makes the legacy
 * wrapper unsafe.
 */
export function buildPromotionPlan({ project, region, service, revision } = {}) {
  const missing = ["project", "region", "service", "revision"].filter(
    (key) => !{ project, region, service, revision }[key],
  );
  if (missing.length > 0) {
    throw new Error(`Promotion requires ${missing.join(", ")}.`);
  }
  return {
    args: [
      "run",
      "services",
      "update-traffic",
      service,
      `--project=${project}`,
      `--region=${region}`,
      `--to-revisions=${revision}=100`,
      "--quiet",
    ],
  };
}

/** Restore the exact prior serving revision captured before promotion. */
export function buildRollbackPlan({ project, region, service, priorRevision } = {}) {
  if (!priorRevision) {
    throw new Error(
      "A rollback command requires the prior serving revision captured before promotion.",
    );
  }
  return buildPromotionPlan({ project, region, service, revision: priorRevision });
}

/** Read-only query for the revision currently serving traffic, captured BEFORE any promotion. */
export function buildPriorRevisionQueryPlan({ project, region, service } = {}) {
  return {
    args: [
      "run",
      "services",
      "describe",
      service,
      `--project=${project}`,
      `--region=${region}`,
      "--format=json(status.traffic)",
    ],
  };
}

/**
 * Select the one revision carrying all serving traffic. Tagged zero-traffic candidates remain in
 * status.traffic, so reading every revisionName as a flat value can produce a multi-line string
 * that is not a revision and makes the printed rollback command unsafe.
 */
export function parseServingRevision(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error(
      "Could not parse the current serving revision from Cloud Run traffic.",
    );
  }
  const traffic = parsed?.status?.traffic;
  if (!Array.isArray(traffic)) {
    throw new Error("Cloud Run did not return a serving revision traffic list.");
  }
  const servingNames = [
    ...new Set(
      traffic
        .filter((entry) => Number(entry?.percent) === 100)
        .map((entry) => entry?.revisionName)
        .filter((value) => typeof value === "string" && value.trim().length > 0),
    ),
  ];
  if (servingNames.length !== 1) {
    throw new Error(
      `Expected exactly one 100-percent serving revision; found ${servingNames.length}.`,
    );
  }
  return servingNames[0];
}

export function formatCommand(command, args) {
  return [command, ...args]
    .map((part) => (/[\s"']/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

/**
 * The full ordered release plan. Returned as data so `--plan-only` can print it without any branch
 * that could reach a process spawn.
 */
export function buildReleasePlan({
  args,
  command = "gcloud",
  deployArgs = [],
  resolvedEnv = {},
  ambientEnv = {},
  revisionSuffix,
  revisionName,
} = {}) {
  const errors = [...(args.errors ?? [])];
  const localOnly = findLocalOnlyDeployConfig({
    resolved: resolvedEnv,
    ambient: ambientEnv,
  });
  errors.push(...localOnly.errors);
  const warnings = [...localOnly.warnings];

  const descriptor = ENVIRONMENT_DESCRIPTORS[args.environment];
  if (descriptor) {
    for (const [name, expected] of Object.entries(descriptor)) {
      const actual = resolvedEnv[name];
      if (actual !== undefined && actual !== expected) {
        errors.push(
          `${name}="${actual}" contradicts the ${args.environment} descriptor ("${expected}").`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { errors, steps: [], warnings };
  }

  const candidate = buildCandidateDeployPlan({
    baseArgs: deployArgs,
    environment: args.environment,
    revisionSuffix,
    tag: args.tag,
  });
  const target = {
    project: args.project,
    region: args.region,
    service: args.service,
  };
  const steps = [
    {
      name: "capture-prior-revision",
      description:
        "Record the revision currently serving traffic; it is the rollback target.",
      command: formatCommand(command, buildPriorRevisionQueryPlan(target).args),
    },
    {
      name: "deploy-candidate",
      description: `Deploy revision ${revisionName} at zero traffic, reachable only via tag ${candidate.candidateTag}.`,
      command: formatCommand(command, candidate.args),
    },
    {
      name: "smoke-candidate",
      description:
        "Run the bounded read-only smoke against the candidate tag URL and prove its exact commit/revision before any traffic moves.",
      command: `npm run smoke:release-candidate -- --base-url=<candidate tag url for ${candidate.candidateTag}> --expected-tag=${candidate.candidateTag} --expected-service=${target.service} --expected-revision=${revisionName} --expected-commit=<git rev-parse HEAD>`,
    },
    {
      name: "promote-exact-revision",
      description: `Send 100% of traffic to the exact revision ${revisionName}.`,
      command: formatCommand(
        command,
        buildPromotionPlan({ ...target, revision: revisionName }).args,
      ),
    },
    {
      name: "rollback",
      description:
        "Restore the captured prior serving revision. Run only if the promotion must be undone.",
      command: formatCommand(
        command,
        buildPromotionPlan({
          ...target,
          revision: args.priorRevision ?? "<prior revision from step 1>",
        }).args,
      ),
    },
  ];

  return {
    candidateTag: candidate.candidateTag,
    descriptor,
    errors: [],
    steps,
    warnings,
  };
}
