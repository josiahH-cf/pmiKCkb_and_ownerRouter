/**
 * Pure Secret Manager binding plans for runtime values that must never be inlined into Cloud Run.
 *
 * Public maintenance intake is activated only by an explicit pair of non-secret Secret Manager
 * references. Neither reference means intentionally inert. A partial pair, a version without its
 * matching id, or plaintext-only deploy configuration is a refusal.
 */
export const MAINTENANCE_INTAKE_RUNTIME_SECRET_NAMES = Object.freeze([
  "MAINTENANCE_INTAKE_TOKEN_SECRET",
  "MAINTENANCE_INTAKE_IP_HASH_SALT",
]);
export const MAINTENANCE_INTAKE_MIN_SECRET_BYTES = 32;

const SECRET_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const SECRET_VERSION_PATTERN = /^(?:latest|[1-9][0-9]*)$/;

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Validate the values as they appear inside the running revision after Cloud Run resolves the two
 * Secret Manager bindings. This is deliberately distinct from deploy-source validation below:
 * runtime receives the secret values, while the deploy source contains only non-secret *_SECRET_ID
 * references. Errors name variables and requirements only, never values.
 */
export function validateMaintenanceIntakeRuntimeValues(env = {}) {
  const token = readString(env.MAINTENANCE_INTAKE_TOKEN_SECRET);
  const salt = readString(env.MAINTENANCE_INTAKE_IP_HASH_SALT);

  if (!token && !salt) {
    return { configured: false, errors: [], ok: true };
  }

  const errors = [];
  if (!token || !salt) {
    errors.push(
      "Maintenance intake runtime requires both MAINTENANCE_INTAKE_TOKEN_SECRET and MAINTENANCE_INTAKE_IP_HASH_SALT.",
    );
  }
  if (token && Buffer.byteLength(token, "utf8") < MAINTENANCE_INTAKE_MIN_SECRET_BYTES) {
    errors.push(
      `MAINTENANCE_INTAKE_TOKEN_SECRET must contain at least ${MAINTENANCE_INTAKE_MIN_SECRET_BYTES} UTF-8 bytes.`,
    );
  }
  if (salt && Buffer.byteLength(salt, "utf8") < MAINTENANCE_INTAKE_MIN_SECRET_BYTES) {
    errors.push(
      `MAINTENANCE_INTAKE_IP_HASH_SALT must contain at least ${MAINTENANCE_INTAKE_MIN_SECRET_BYTES} UTF-8 bytes.`,
    );
  }
  if (token && salt && token === salt) {
    errors.push(
      "MAINTENANCE_INTAKE_TOKEN_SECRET and MAINTENANCE_INTAKE_IP_HASH_SALT must be distinct values.",
    );
  }

  return {
    configured: errors.length === 0,
    errors,
    ok: errors.length === 0,
  };
}

export function resolveMaintenanceIntakeSecretBindings(env = {}) {
  const refs = MAINTENANCE_INTAKE_RUNTIME_SECRET_NAMES.map((name) => ({
    name,
    plaintextPresent: Boolean(readString(env[name])),
    secretId: readString(env[`${name}_SECRET_ID`]),
    version: readString(env[`${name}_SECRET_VERSION`]),
  }));
  const configured = refs.some(
    ({ plaintextPresent, secretId, version }) => plaintextPresent || secretId || version,
  );

  if (!configured) {
    return { bindings: {}, configured: false, errors: [], ok: true };
  }

  const errors = [];
  const idsComplete = refs.every(({ secretId }) => Boolean(secretId));

  if (!idsComplete) {
    errors.push(
      "Maintenance intake Secret Manager activation requires both " +
        "MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID and " +
        "MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID; plaintext values never count as deploy bindings.",
    );
  }

  for (const { name, secretId, version } of refs) {
    if (version && !secretId) {
      errors.push(`${name}_SECRET_VERSION requires ${name}_SECRET_ID.`);
    }
    if (secretId && !SECRET_ID_PATTERN.test(secretId)) {
      errors.push(`${name}_SECRET_ID must be a safe Secret Manager secret id.`);
    }
    if (version && !SECRET_VERSION_PATTERN.test(version)) {
      errors.push(
        `${name}_SECRET_VERSION must be "latest" or a positive version number.`,
      );
    }
  }

  if (idsComplete && refs[0].secretId && refs[0].secretId === refs[1].secretId) {
    errors.push(
      "Maintenance intake activation requires distinct Secret Manager secret ids for the token secret and IP-hash salt.",
    );
  }

  if (errors.length > 0) {
    return { bindings: {}, configured: true, errors, ok: false };
  }

  const bindings = Object.fromEntries(
    refs.map(({ name, secretId, version }) => [
      name,
      `${secretId}:${version ?? "latest"}`,
    ]),
  );

  return { bindings, configured: true, errors: [], ok: true };
}
