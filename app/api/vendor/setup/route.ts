import {
  VendorSetupPublicError,
  completeVendorSetup,
  type VendorSetupAuth,
  type VendorSetupChallengeStore,
} from "@/lib/vendor/live-setup";
import { createLiveVendorSetupRuntimeDependencies } from "@/lib/vendor/live-setup-runtime";
import {
  requireEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { assertExplicitProductionLive } from "@/lib/vendor/live-lifecycle-service";

const SECURITY_HEADERS = {
  "cache-control": "no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
} as const;

const MAXIMUM_FORM_BYTES = 128;

async function readBoundedFormBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
    }
    if (parsed > MAXIMUM_FORM_BYTES) {
      throw new VendorSetupPublicError(413, "This Vendor setup link is invalid.");
    }
  }
  if (!request.body) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMUM_FORM_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new VendorSetupPublicError(413, "This Vendor setup link is invalid.");
    }
    chunks.push(value);
  }
  if (total === 0) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
}

async function readExactTokenForm(request: Request) {
  if (request.method !== "POST") {
    throw new VendorSetupPublicError(405, "Vendor setup requires a form submission.");
  }
  const contentType = request.headers.get("content-type")?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new VendorSetupPublicError(415, "This Vendor setup link is invalid.");
  }
  const requestUrl = new URL(request.url);
  if (requestUrl.search || requestUrl.hash) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  const origin = request.headers.get("origin");
  if (origin !== requestUrl.origin) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== "same-origin") {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }

  const fields = new URLSearchParams(await readBoundedFormBody(request));
  const entries = [...fields.entries()];
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== "token" ||
    typeof entries[0]?.[1] !== "string"
  ) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  return entries[0][1];
}

type VendorSetupRouteDependencies = {
  store: VendorSetupChallengeStore;
  auth: VendorSetupAuth;
  now?: () => Date;
  claimId?: () => string;
  claimLeaseMs?: number;
  expectedFirebaseAuthDomain: string;
  expectedPasswordResetPath: string;
};

export function createVendorSetupPostHandler(
  dependencies: VendorSetupRouteDependencies | (() => VendorSetupRouteDependencies),
  options: {
    resolveDescriptor?: () => EnvironmentDescriptor;
  } = {},
) {
  return async function vendorSetupPost(request: Request) {
    try {
      // The raw bearer challenge is meaningful only inside the explicitly configured Production
      // Live deployment. Refuse every Demo, read-only, legacy, or malformed environment before
      // reading the token or constructing Firestore/Firebase clients.
      assertExplicitProductionLive(
        (options.resolveDescriptor ?? requireEnvironmentDescriptor)(),
      );
      const token = await readExactTokenForm(request);
      // Runtime clients are constructed only after the public request has passed its bounded,
      // body-only, same-origin checks, and initialization failures stay inside the generic
      // no-store error boundary.
      const resolvedDependencies =
        typeof dependencies === "function" ? dependencies() : dependencies;
      const result = await completeVendorSetup(token, resolvedDependencies);
      return new Response(null, {
        status: 303,
        headers: { ...SECURITY_HEADERS, location: result.redirectUrl },
      });
    } catch (error) {
      if (error instanceof VendorSetupPublicError) {
        return Response.json(
          { error: error.message },
          {
            status: error.status,
            headers:
              error.status === 405
                ? { ...SECURITY_HEADERS, allow: "POST" }
                : SECURITY_HEADERS,
          },
        );
      }
      return Response.json(
        { error: "Vendor setup is unavailable." },
        { status: 503, headers: SECURITY_HEADERS },
      );
    }
  };
}

export const POST = createVendorSetupPostHandler(
  createLiveVendorSetupRuntimeDependencies,
);
