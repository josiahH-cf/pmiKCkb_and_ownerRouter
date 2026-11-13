"use client";

// S280 R-S280-2: the one line that points to the team's renewal list, on the Dashboard below the
// viewer's own renewal items and in My Work's empty state: "12 renewals have a next action for the
// team. Open the Renewal Desk." The count is the working batch's membership the desk lists; the
// link opens the working batch.

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  RENEWAL_TEAM_LINE_WORDS,
  RENEWAL_TEAM_LINE_HREF,
  RENEWAL_TEAM_LINE_ROUTE,
  renewalTeamLineSentence,
  type RenewalTeamLine,
} from "@/lib/attention/renewal-team-line";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

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

/** Load the count only when this line is mounted, after the page is interactive. */
export function RenewalTeamLineSlot() {
  const [line, setLine] = useState<RenewalTeamLine | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchWithDeadline(RENEWAL_TEAM_LINE_ROUTE, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("renewal_team_line_unavailable");
        const result = (await response.json()) as RenewalTeamLine | null;
        if (!controller.signal.aborted) setLine(result);
      } catch {
        if (!controller.signal.aborted)
          setLine({ count: null, month: null, href: RENEWAL_TEAM_LINE_HREF });
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return line ? <RenewalTeamLineText line={line} /> : null;
}
