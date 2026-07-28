import { NextResponse } from "next/server";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { runIntegratedFakeV1Acceptance } from "@/lib/release/fake-acceptance";

export async function POST() {
  try {
    await requireCapability("manageAdmin");
    const result = await runIntegratedFakeV1Acceptance();
    // `mode`, `dataMode`, `liveEvidenceEligible`, and `liveProviderCallCount` are `as const`
    // structural invariants of the harness, so re-checking them here compared literals with
    // themselves and could never fail. They are kept because they document the boundary, but the
    // two conditions that actually decide the outcome are the MEASURED ones: no Live provider was
    // contacted, and the harness genuinely exercised its executors rather than silently doing
    // nothing and reporting a clean boundary.
    if (
      result.mode !== "production-test-workspace" ||
      result.dataMode !== "test" ||
      result.liveEvidenceEligible !== false ||
      result.liveProviderCallCount !== 0 ||
      result.vendorBoundary.liveProviderCalls !== 0 ||
      result.syntheticProviderCallCount <= 0
    ) {
      return NextResponse.json(
        { error: "Production Test workspace safety boundary failed." },
        { status: 500 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
