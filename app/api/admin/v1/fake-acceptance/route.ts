import { NextResponse } from "next/server";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { runIntegratedFakeV1Acceptance } from "@/lib/release/fake-acceptance";

export async function POST() {
  try {
    await requireCapability("manageAdmin");
    const result = await runIntegratedFakeV1Acceptance();
    if (
      result.mode !== "production-test-workspace" ||
      result.dataMode !== "test" ||
      result.liveEvidenceEligible !== false ||
      result.liveProviderCallCount !== 0 ||
      result.vendorBoundary.liveProviderCalls !== 0
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
