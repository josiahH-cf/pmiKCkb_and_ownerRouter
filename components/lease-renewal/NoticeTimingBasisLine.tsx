"use client";

// S283 R-S283-5 (ARCH-S283-5): the shared notice timing basis on a lease, as one read-only line for
// every role. It reads the saved basis once through the existing GET (a read; it writes nothing and
// has no selector), and renders nothing until that read answers, so it never appears above the
// step while the lease loads. An Admin also sees "Change in Admin", which opens the existing Admin
// entry where the basis is selected with its version check, audit, receipt and readback.

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { NOTICE_TIMING_BASIS_TARGET_ID } from "@/lib/lease-renewal/notice-timing-decision";
import {
  NOTICE_TIMING_BASIS_ADMIN_HREF,
  NOTICE_TIMING_BASIS_CHANGE_LABEL,
  noticeTimingBasisLine,
  type NoticeTimingBasisLineRead,
} from "@/lib/lease-renewal/notice-timing-basis-line";

const endpoint = "/api/lease-renewal/notice-timing-basis";

interface LineState {
  readonly read: NoticeTimingBasisLineRead;
  readonly canChange: boolean;
}

export function NoticeTimingBasisLine() {
  const [state, setState] = useState<LineState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unreadable");
        const payload = (await response.json()) as {
          timingBasis?: NoticeTimingBasisLineRead;
          canSelect?: boolean;
        };
        const read = payload.timingBasis;
        if (!read || !["saved", "missing", "invalid", "unreadable"].includes(read.state))
          throw new Error("unreadable");
        if (!controller.signal.aborted)
          setState({ read, canChange: payload.canSelect === true });
      } catch {
        if (!controller.signal.aborted)
          setState({ read: { state: "unreadable", record: null }, canChange: false });
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <section
      aria-label="Notice timing basis"
      className="renewal-notice-timing-basis"
      data-notice-basis-line={state ? state.read.state : "loading"}
      id={NOTICE_TIMING_BASIS_TARGET_ID}
      tabIndex={-1}
    >
      {state ? (
        <p className="muted">
          {noticeTimingBasisLine(state.read)}
          {state.canChange ? (
            <>
              {" "}
              <Link className="text-link" href={NOTICE_TIMING_BASIS_ADMIN_HREF}>
                {NOTICE_TIMING_BASIS_CHANGE_LABEL}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
