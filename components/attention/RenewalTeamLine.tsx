"use client";

// S280 R-S280-2: the one line that points to the team's renewal list, on the Dashboard below the
// viewer's own renewal items and in My Work's empty state: "12 renewals have a next action for the
// team. Open the Renewal Desk." The count is the working batch's membership the desk lists; the
// link opens the working batch. It reads nothing itself.

import Link from "next/link";
import { Suspense, use } from "react";

import {
  RENEWAL_TEAM_LINE_WORDS,
  renewalTeamLineSentence,
  type RenewalTeamLine,
} from "@/lib/attention/renewal-team-line";

export function RenewalTeamLineText({ line }: Readonly<{ line: RenewalTeamLine }>) {
  return (
    <p
      className="muted"
      data-count={line.count === null ? undefined : String(line.count)}
      data-testid="renewal-team-line"
    >
      {renewalTeamLineSentence(line.count)}{" "}
      <Link className="text-link" href={line.href}>
        {RENEWAL_TEAM_LINE_WORDS.link}
      </Link>
    </p>
  );
}

function StreamedTeamLine({ line }: Readonly<{ line: Promise<RenewalTeamLine | null> }>) {
  const value = use(line);
  return value ? <RenewalTeamLineText line={value} /> : null;
}

/** The line streamed from a server read; nothing while it loads or for a user without renewals. */
export function RenewalTeamLineSlot({
  line,
}: Readonly<{ line: Promise<RenewalTeamLine | null> | null | undefined }>) {
  if (!line) return null;
  return (
    <Suspense fallback={null}>
      <StreamedTeamLine line={line} />
    </Suspense>
  );
}
