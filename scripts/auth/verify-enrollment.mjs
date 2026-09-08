#!/usr/bin/env node
// Called only by the owner's interactive enrollment, after gcloud's OAuth flow. This bootstrap
// reads identity from Google before binding anonymous ADC bytes; it performs no resource call.
import { GoogleAuth } from "google-auth-library";
import { pathToFileURL } from "node:url";
import { inspectCredentialStore, writeEnrollmentBinding } from "./credential-store.mjs";
import { probeGcloud, readPrincipal } from "./ensure.mjs";
import { LOCAL_PRINCIPAL } from "./identities.mjs";

export async function verifyEnrollment({
  env = process.env,
  inspect = inspectCredentialStore,
  probeCli = probeGcloud,
  bind = writeEnrollmentBinding,
  clientFor = (credentials) => new GoogleAuth({ credentials }).getClient(),
  principalFor = (token) => readPrincipal(token, fetch, 30_000),
} = {}) {
  const cli = probeCli(env, { statusOnly: true });
  const inspection = inspect({ env });
  if (
    cli.activeAccount !== LOCAL_PRINCIPAL ||
    cli.impersonation ||
    !inspection.credentials ||
    env.GOOGLE_APPLICATION_CREDENTIALS ||
    ![null, "principal_unknown"].includes(inspection.errorKind)
  ) {
    throw new Error("Enrollment identity or WSL credential store is invalid.");
  }
  const client = await clientFor(inspection.credentials);
  const token = await client.getAccessToken();
  const email = token?.token ? await principalFor(token.token) : null;
  if (email !== LOCAL_PRINCIPAL)
    throw new Error("Google did not verify the authorized local account.");
  bind(inspection, email);
  return { principal: email, state: "enrolled" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyEnrollment()
    .then(() => console.log("Local WSL identity enrollment verified."))
    .catch(() => {
      console.error(
        "NOT READY: enrollment identity could not be verified; run npm run auth:session.",
      );
      process.exitCode = 2;
    });
}
