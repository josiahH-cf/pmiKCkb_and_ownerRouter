/**
 * Runtime configuration required by named Action Registry keys.
 *
 * `mirroredExecutable` is a deliberately small Node-compatible projection of the committed
 * TypeScript Action Registry. It is not an authority source: the parity sentinel in
 * tests/unit/action-runtime-requirements.test.mjs compares every value with `isActionExecutable`.
 * A protected Action Registry flip therefore fails verification until this deployment-facing
 * projection moves with it.
 */
export const ACTION_RUNTIME_REQUIREMENTS = Object.freeze({
  "internal.transactional_notice.send": Object.freeze({
    mirroredExecutable: true,
    requirements: Object.freeze([
      Object.freeze({
        name: "KB_APPROVAL_SENDER",
        kind: "managed_pmikcmetro_mailbox",
        cardinality: "exactly_one",
      }),
      Object.freeze({
        name: "GMAIL_DWD_SA",
        kind: "project_service_account",
        cardinality: "exactly_one",
      }),
    ]),
  }),
  "vendor.account.invite": Object.freeze({
    mirroredExecutable: false,
    requirements: Object.freeze([
      Object.freeze({
        name: "KB_APPROVAL_SENDER",
        kind: "managed_pmikcmetro_mailbox",
        cardinality: "exactly_one",
      }),
      Object.freeze({
        name: "GMAIL_DWD_SA",
        kind: "project_service_account",
        cardinality: "exactly_one",
      }),
    ]),
  }),
});

const PLACEHOLDER_VALUE_PATTERN = /<[^>]+>|\b(change-me|changeme|replace-me|todo)\b/i;
const MANAGED_MAILBOX_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@pmikcmetro\.com$/i;
const SERVICE_ACCOUNT_PATTERN =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/i;

function requirementIsSatisfied(runtimeValues, requirement) {
  const rawValue = runtimeValues?.[requirement.name];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  if (
    requirement.cardinality !== "exactly_one" ||
    value === "" ||
    PLACEHOLDER_VALUE_PATTERN.test(value)
  ) {
    return false;
  }

  if (requirement.kind === "managed_pmikcmetro_mailbox") {
    const localPart = value.slice(0, value.lastIndexOf("@"));
    return (
      localPart.length <= 64 && value.length <= 254 && MANAGED_MAILBOX_PATTERN.test(value)
    );
  }

  if (requirement.kind === "project_service_account") {
    const project = runtimeValues?.GCP_PROJECT_ID?.trim();
    const match = SERVICE_ACCOUNT_PATTERN.exec(value);
    return Boolean(project && match?.[1]?.toLowerCase() === project.toLowerCase());
  }

  return false;
}

function requirementDescription(requirement) {
  return requirement.kind === "project_service_account"
    ? "exactly one service account in GCP_PROJECT_ID"
    : "exactly one managed pmikcmetro.com mailbox";
}

function missingRuntimeVariables(runtimeValues, action) {
  return [
    ...new Set(
      action.requirements
        .filter((requirement) => !requirementIsSatisfied(runtimeValues, requirement))
        .map((requirement) => requirement.name),
    ),
  ];
}

/**
 * Project the mapped, executable actions into runtime-active and runtime-inert truth.
 *
 * When `executableByKey` is omitted, the committed mirror is used. A caller that has read the
 * actual Action Registry should pass a complete key-to-boolean projection; in that mode an absent
 * or non-true key is closed rather than falling back to the mirror.
 */
export function projectActionRuntimeRequirements(
  runtimeValues,
  executableByKey,
  registry = ACTION_RUNTIME_REQUIREMENTS,
) {
  const runtimeActiveKeys = [];
  const runtimeInert = [];

  for (const [actionKey, action] of Object.entries(registry)) {
    const executable =
      executableByKey === undefined
        ? action.mirroredExecutable
        : executableByKey[actionKey] === true;

    if (!executable) continue;

    const missing = missingRuntimeVariables(runtimeValues, action);
    if (missing.length > 0) {
      runtimeInert.push({
        key: actionKey,
        missing_runtime_variables: missing,
      });
    } else {
      runtimeActiveKeys.push(actionKey);
    }
  }

  return {
    runtime_active_keys: runtimeActiveKeys,
    runtime_inert: runtimeInert,
  };
}

/**
 * Validate only requirements whose named action is executable in the mirrored committed projection.
 * Callers should pass the resolved deployment output (not the raw host environment) so a value that
 * was provisioned locally but omitted from a replacing deploy wrapper still fails closed.
 */
export function validateExecutableActionRuntimeRequirements(
  runtimeValues,
  registry = ACTION_RUNTIME_REQUIREMENTS,
) {
  const errors = [];

  for (const [actionKey, action] of Object.entries(registry)) {
    if (!action.mirroredExecutable) continue;

    for (const requirement of action.requirements) {
      const rawValue = runtimeValues?.[requirement.name];
      const value = typeof rawValue === "string" ? rawValue.trim() : "";

      if (!value) {
        errors.push(
          `${requirement.name} must be set to ${requirementDescription(requirement)} because executable action ${actionKey} requires it.`,
        );
        continue;
      }

      if (!requirementIsSatisfied(runtimeValues, requirement)) {
        errors.push(
          `${requirement.name} must be ${requirementDescription(requirement)} because executable action ${actionKey} requires it.`,
        );
      }
    }
  }

  return {
    errors,
    ok: errors.length === 0,
  };
}
