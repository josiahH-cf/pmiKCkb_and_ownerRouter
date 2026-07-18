import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";

// Report-issue intake (TIX-6). Assembles an AI-ready bug report from the auto-captured page context
// plus an optional description and returns a receipt. The actual transactional email SEND is
// owner-configured: the destination is REPORT_ISSUE_EMAIL (default josiah@pmikcmetro.com) and the
// send transport is wired by the owner (generic Gmail send is disabled in production, so this must
// NOT use it). Until delivery is wired, the report is logged server-side and returns delivered:false.
//
// Privacy (TIX-8): only allowlisted, non-sensitive context is accepted — route, viewport, user-agent,
// and the identity (not the value) of the last-interacted element. No app data or input values.
// Auth: signed-in staff only for Phase 1 (the button is mounted in the authenticated AppShell);
// pre-auth / vendor coverage with the public-intake abuse pattern is a follow-up.

const ElementHintSchema = z.object({
  tag: z.string().max(40),
  role: z.string().max(40).optional(),
  name: z.string().max(120).optional(),
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

// Cheap per-process rate backstop against a stuck/looping client. Not a distributed limiter — a
// bug-report firehose is low-risk — but it caps accidental floods.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let windowStart = 0;
let windowCount = 0;

function isRateLimited(now: number): boolean {
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");

    if (isRateLimited(Date.now())) {
      return NextResponse.json(
        { error: "Too many reports right now. Please try again in a minute." },
        { status: 429 },
      );
    }

    const input = await parseJsonBody(request, ReportIssueSchema);

    const destination = process.env.REPORT_ISSUE_EMAIL ?? "josiah@pmikcmetro.com";
    const subject = `Report: Issue on ${input.context.route}`;
    const ticket = {
      subject,
      route: input.context.route,
      reportedByUid: user.uid,
      role: user.role,
      viewport: input.context.viewport,
      element: input.context.element,
      userAgent: input.context.userAgent,
      description: input.description ?? "(no description provided)",
    };

    // Owner wires the transactional send (TIX-6). Until then, log the assembled report and report
    // delivered:false so the UI is honest. Never routes through the disabled generic Gmail send.
    console.info("[report-issue]", JSON.stringify({ destination, ...ticket }));

    return NextResponse.json(
      { received: true, delivered: false, subject },
      { status: 202 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
