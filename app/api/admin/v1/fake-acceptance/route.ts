import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { runIntegratedFakeV1Acceptance } from "@/lib/release/fake-acceptance";

export async function POST() {
  await requireCapability("manageAdmin");
  if (process.env.NODE_ENV === "production" || !readServerConfig().localDemoAuth) {
    return NextResponse.json(
      { error: "Synthetic acceptance is local-test only." },
      { status: 404 },
    );
  }
  return NextResponse.json(await runIntegratedFakeV1Acceptance());
}
