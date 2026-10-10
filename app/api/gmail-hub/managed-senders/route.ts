import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { assertCommunicationStaff } from "@/lib/gmail-hub/sequence-service";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    assertCommunicationStaff(actor, "read");
    const q = readAllowedQuery(request, ["after"]);
    const after = q.has("after")
      ? z.string().min(1).max(2000).parse(q.get("after"))
      : undefined;
    const page = await getAuth(getFirebaseAdminApp()).listUsers(100, after);
    const staff = page.users
      .filter(
        (u) =>
          !u.disabled &&
          u.emailVerified &&
          u.email?.toLowerCase().endsWith("@pmikcmetro.com") &&
          !isVerificationAccount({ email: u.email }) &&
          [undefined, "Editor", "Approver", "Admin"].includes(u.customClaims?.role),
      )
      .map((u) => ({ uid: u.uid, name: u.displayName ?? u.email!, email: u.email! }));
    return NextResponse.json(
      { staff, cursor: page.pageToken ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
