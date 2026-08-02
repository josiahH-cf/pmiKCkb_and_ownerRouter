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
  { root, signIn, protectedRoute },
  candidateOrigin,
) {
  for (const [name, result] of Object.entries({ root, signIn, protectedRoute })) {
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
}

export async function smokeReleaseCandidate(
  baseUrl,
  {
    expectedService,
    expectedTag,
    fetchFn = fetch,
    timeoutMs = CANDIDATE_SMOKE_TIMEOUT_MS,
  } = {},
) {
  const origin = validateCandidateBaseUrl(baseUrl, expectedTag, expectedService);
  const probe = async (path) => {
    const response = await fetchFn(`${origin}${path}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, location: response.headers.get("location") };
  };
  const results = {
    root: await probe("/"),
    signIn: await probe("/sign-in"),
    protectedRoute: await probe("/ask"),
  };
  assertCandidateReadOnlyBoundary(results, origin);
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
  if (!baseUrl || !expectedTag || !expectedService) {
    console.error(
      "Candidate smoke requires --base-url=<exact candidate origin>, --expected-tag=<exact candidate tag>, and --expected-service=<exact Cloud Run service>.",
    );
    process.exitCode = 1;
  } else {
    smokeReleaseCandidate(baseUrl, { expectedService, expectedTag })
      .then((results) => {
        console.log(
          `Candidate read-only smoke passed: root=${results.root.status} sign-in=${results.signIn.status} protected=${results.protectedRoute.status}.`,
        );
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
