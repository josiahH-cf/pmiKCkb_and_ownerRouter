#!/usr/bin/env node

/**
 * Bounded, read-only Cloud Run candidate smoke. It sends GET requests only, never follows a
 * redirect into authentication, never submits a form, and never invokes a product API action.
 */

export const CANDIDATE_SMOKE_TIMEOUT_MS = 30_000;

export function validateCandidateBaseUrl(value, expectedTag, expectedService) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Candidate smoke requires https.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "Candidate smoke requires an origin-only base URL with no credentials.",
    );
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(expectedTag ?? "")) {
    throw new Error("Candidate smoke requires the exact expected candidate tag.");
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(expectedService ?? "")) {
    throw new Error("Candidate smoke requires the exact expected Cloud Run service.");
  }
  if (
    !url.hostname.startsWith(`${expectedTag}---${expectedService}-`) ||
    !url.hostname.endsWith(".a.run.app")
  ) {
    throw new Error(
      `Candidate smoke URL does not match tag ${expectedTag} on Cloud Run service ${expectedService}.`,
    );
  }
  return url.origin;
}

export function assertCandidateReadOnlyBoundary(
  { root, signIn, protectedRoute, version },
  candidateOrigin,
  expectedIdentity,
) {
  for (const [name, result] of Object.entries({
    root,
    signIn,
    protectedRoute,
    version,
  })) {
    if (!result || typeof result.status !== "number") {
      throw new Error(`Candidate ${name} probe did not return an HTTP status.`);
    }
  }
  for (const [name, result] of Object.entries({ root, protectedRoute })) {
    if (![307, 308].includes(result.status)) {
      throw new Error(
        `Candidate ${name} probe expected an auth redirect, got ${result.status}.`,
      );
    }
    const location = result.location ? new URL(result.location, candidateOrigin) : null;
    if (location?.origin !== candidateOrigin) {
      throw new Error(
        `Candidate ${name} probe did not stay on the same candidate origin.`,
      );
    }
    if (location?.pathname !== "/sign-in") {
      throw new Error(`Candidate ${name} probe did not redirect to /sign-in.`);
    }
  }
  if (signIn.status !== 200) {
    throw new Error(`Candidate sign-in probe expected 200, got ${signIn.status}.`);
  }
  if (version.status !== 200) {
    throw new Error(`Candidate version probe expected 200, got ${version.status}.`);
  }
  if (
    version.body?.commit !== expectedIdentity.expectedCommit ||
    version.body?.revision !== expectedIdentity.expectedRevision ||
    version.body?.service !== expectedIdentity.expectedService ||
    version.body?.environment !== "production"
  ) {
    throw new Error(
      "Candidate version identity does not match the exact expected commit/revision/service.",
    );
  }
}

export async function smokeReleaseCandidate(
  baseUrl,
  {
    expectedService,
    expectedTag,
    expectedCommit,
    expectedRevision,
    fetchFn = fetch,
    timeoutMs = CANDIDATE_SMOKE_TIMEOUT_MS,
  } = {},
) {
  const origin = validateCandidateBaseUrl(baseUrl, expectedTag, expectedService);
  if (!/^[a-f0-9]{40}$/i.test(expectedCommit ?? "")) {
    throw new Error("Candidate smoke requires the exact 40-character expected commit.");
  }
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(expectedRevision ?? "")) {
    throw new Error("Candidate smoke requires the exact expected revision.");
  }
  const probe = async (path, readBody = false) => {
    const response = await fetchFn(`${origin}${path}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
      ...(readBody ? { body: await response.json() } : {}),
    };
  };
  const results = {
    root: await probe("/"),
    signIn: await probe("/sign-in"),
    protectedRoute: await probe("/ask"),
    version: await probe("/api/version", true),
  };
  assertCandidateReadOnlyBoundary(results, origin, {
    expectedCommit: expectedCommit.toLowerCase(),
    expectedRevision,
    expectedService,
  });
  return results;
}

function readArg(name, argv = process.argv.slice(2)) {
  const prefix = `${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

const invokedDirectly = process.argv[1]?.endsWith("smoke-release-candidate.mjs");
if (invokedDirectly) {
  const baseUrl = readArg("--base-url");
  const expectedTag = readArg("--expected-tag");
  const expectedService = readArg("--expected-service");
  const expectedCommit = readArg("--expected-commit");
  const expectedRevision = readArg("--expected-revision");
  if (
    !baseUrl ||
    !expectedTag ||
    !expectedService ||
    !expectedCommit ||
    !expectedRevision
  ) {
    console.error(
      "Candidate smoke requires --base-url, --expected-tag, --expected-service, --expected-commit, and --expected-revision with exact values.",
    );
    process.exitCode = 1;
  } else {
    smokeReleaseCandidate(baseUrl, {
      expectedService,
      expectedTag,
      expectedCommit,
      expectedRevision,
    })
      .then((results) => {
        console.log(
          `Candidate read-only smoke passed: root=${results.root.status} sign-in=${results.signIn.status} protected=${results.protectedRoute.status} version=${results.version.status}.`,
        );
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
