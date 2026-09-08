// Local enrollment evidence, beside ADC and outside the repository. Never contains credential
// material. An empty ADC `account` field cannot establish identity before a refresh; enrollment
// binds the exact bytes to Google's observed email once, during the owner's interactive login.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { LOCAL_PRINCIPAL } from "./identities.mjs";

export function credentialPaths(home = homedir()) {
  const store = join(home, ".config", "gcloud");
  return {
    store,
    adc: join(store, "application_default_credentials.json"),
    binding: join(store, "pmi-local-enrollment.json"),
  };
}

export function inspectCredentialStore({
  env = process.env,
  home = homedir(),
  read = readFileSync,
} = {}) {
  const paths = credentialPaths(home);
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
    return { errorKind: "credential_type_forbidden" };
  if (
    Object.entries(env).some(
      ([key, value]) => key.startsWith("CLOUDSDK_AUTH_") && value?.trim(),
    )
  ) {
    return { errorKind: "credential_type_forbidden" };
  }
  if (
    env.CLOUDSDK_CONFIG?.trim() &&
    resolve(env.CLOUDSDK_CONFIG) !== resolve(paths.store)
  ) {
    return { errorKind: "wrong_store" };
  }
  let raw, credentials;
  try {
    raw = read(paths.adc, "utf8");
    credentials = JSON.parse(raw);
  } catch {
    return { present: false, errorKind: "missing" };
  }
  if (
    credentials.type !== "authorized_user" ||
    credentials.private_key ||
    credentials.service_account_impersonation_url
  ) {
    return { present: true, errorKind: "credential_type_forbidden" };
  }
  const digest = createHash("sha256").update(raw).digest("hex");
  let binding;
  try {
    binding = JSON.parse(read(paths.binding, "utf8"));
  } catch {
    /* enrollment required */
  }
  const verified =
    binding?.version === 1 &&
    binding?.principal === LOCAL_PRINCIPAL &&
    binding?.adcDigest === digest &&
    binding?.store === paths.store;
  return {
    present: true,
    principal: verified ? LOCAL_PRINCIPAL : null,
    errorKind: verified ? null : "principal_unknown",
    credentials,
    digest,
    paths,
  };
}

export function writeEnrollmentBinding(inspection, observedEmail) {
  if (observedEmail !== LOCAL_PRINCIPAL || !inspection.credentials || !inspection.paths) {
    throw new Error(
      "Enrollment refused: Google did not verify the authorized local account.",
    );
  }
  const { paths, digest } = inspection;
  if (
    createHash("sha256").update(readFileSync(paths.adc, "utf8")).digest("hex") !== digest
  ) {
    throw new Error("Enrollment refused: ADC changed during identity verification.");
  }
  const temporary = `${paths.binding}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({
      version: 1,
      principal: LOCAL_PRINCIPAL,
      adcDigest: digest,
      store: paths.store,
      enrolledAt: new Date().toISOString(),
    }) + "\n",
    { mode: 0o600 },
  );
  renameSync(temporary, paths.binding);
}
