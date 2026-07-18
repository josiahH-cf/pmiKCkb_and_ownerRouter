import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";

// Report-issue intake (TIX-6). Assembles an AI-ready bug report from the auto-captured page context
// plus an optional description and returns a receipt. The actual transactional email SEND is
// owner-configured: the destination is REPORT_ISSUE_EMAIL (default josiah@pmikcmetro.com) and the
// send transport is wired by the owner (generic Gmail send is disabled in production, so this must
// NOT use it). Until delivery is wired, the report returns delivered:false.
//
// Privacy (TIX-8): only allowlisted, non-sensitive context is accepted — route (pathname only),
// viewport, user-agent, and the IDENTITY (not the value/label content) of the last-interacted
// element. No app data, input values, aria-label, or textContent. Cloud Logging receives metadata
// only (never the description text). Auth: signed-in staff only for Phase 1 (the button is mounted in
// the authenticated AppShell); pre-auth / vendor / error-boundary coverage is a documented follow-up.

const ElementHintSchema = z.object({
  tag: z.string().max(40),
  role: z.string().max(40).optional(),
  type: z.string().max(40).optional(),
  id: z.string().max(120).optional(),
  testId: z.string().max(80).optional(),
});

const ReportIssueSchema = z.object({
  description: z.string().max(2000).optional(),
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

    // Owner wires the transactional send (TIX-6) to REPORT_ISSUE_EMAIL. Until then, log ONLY
    // non-sensitive metadata (no description text, no aria/textContent) so Cloud Logging never
    // receives customer/staff PII, and report delivered:false so the UI stays honest.
    console.info(
      "[report-issue]",
      JSON.stringify({
        route: safeRoute,
        reportedByUid: user.uid,
        role: user.role,
        hasDescription: Boolean(input.description),
        element: input.context.element,
      }),
    );

    return NextResponse.json(
      { received: true, delivered: false, subject },
      { status: 202 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
