import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createSupportReport } from "@/lib/firestore/support-reports";

// Report-issue intake (TIX-6, F-SUPP-1). Assembles a report from the auto-captured page context plus
// an optional description and routes it to a MONITORED destination: a durable, Admin-reviewable
// Firestore support queue (lib/firestore/support-reports). No email is sent — generic Gmail send is
// disabled in production and unattended send is a hard governance boundary — so a successful queue
// write IS delivery. The response reports delivered:true only when the write succeeds; a write
// failure is a soft failure (delivered:false) the client surfaces honestly, never as success.
//
// Privacy (TIX-8): only allowlisted, non-sensitive context is accepted — route (pathname only),
// viewport, user-agent, and the IDENTITY (not the value/label content) of the last-interacted
// element — plus the reporter's own optional description (stored only in the Admin-gated queue).
// Cloud Logging receives metadata only, never the description text. The button is mounted in the
// authenticated AppShell; the error boundaries post here with origin:"error_boundary".

const ElementHintSchema = z.object({
  tag: z.string().max(40),
  role: z.string().max(40).optional(),
  type: z.string().max(40).optional(),
  id: z.string().max(120).optional(),
  testId: z.string().max(80).optional(),
});

const ReportIssueSchema = z.object({
  description: z.string().max(2000).optional(),
  origin: z.enum(["app", "error_boundary"]).default("app"),
  errorDigest: z.string().max(200).optional(),
  context: z.object({
    route: z.string().max(400),
    viewport: z.string().max(40).optional(),
    userAgent: z.string().max(400).optional(),
    element: ElementHintSchema.optional(),
  }),
});

// Cheap PER-USER rate backstop against a stuck/looping client, so a burst from one browser can't
// lock out every other reporter (a process-global counter would). Not a distributed limiter — a
// bug-report firehose is low-risk.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const windows = new Map<string, { start: number; count: number }>();

function isRateLimited(uid: string, now: number): boolean {
  const current = windows.get(uid);
  if (!current || now - current.start > WINDOW_MS) {
    windows.set(uid, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_PER_WINDOW;
}

// Pathname only, control chars stripped, length-capped — defense in depth against header injection
// (forward-compat for the TIX-6 email subject) and query-string PII, even though the client already
// sends the bare pathname. charCodeAt filtering avoids any control-char literal in source.
function sanitizeRoute(route: string): string {
  const noQuery = route.replace(/[?#].*$/, "");
  const printable = Array.from(noQuery)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  return printable.slice(0, 200);
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");

    if (isRateLimited(user.uid, Date.now())) {
      return NextResponse.json(
        { error: "Too many reports right now. Please try again in a minute." },
        { status: 429 },
      );
    }

    const input = await parseJsonBody(request, ReportIssueSchema);
    const safeRoute = sanitizeRoute(input.context.route);
    const subject = `Report: Issue on ${safeRoute}`;

    // Route the report to the monitored support queue. A successful write is delivery; a failure is a
    // soft failure the client shows honestly. The queue is the only place the description is stored.
    let delivered = false;
    try {
      await createSupportReport(user, {
        route: safeRoute,
        description: input.description,
        origin: input.origin,
        viewport: input.context.viewport,
        userAgent: input.context.userAgent,
        element: input.context.element,
        errorDigest: input.errorDigest,
      });
      delivered = true;
    } catch (error) {
      console.error(
        "[report-issue] could not persist support report:",
        error instanceof Error ? error.message : "unknown error",
      );
    }

    // Metadata only (no description text, no aria/textContent) so Cloud Logging never receives
    // customer/staff PII; the description lives only in the Admin-gated support queue.
    console.info(
      "[report-issue]",
      JSON.stringify({
        route: safeRoute,
        reportedByUid: user.uid,
        role: user.role,
        origin: input.origin,
        hasDescription: Boolean(input.description),
        element: input.context.element,
        delivered,
      }),
    );

    return NextResponse.json({ received: true, delivered, subject }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
