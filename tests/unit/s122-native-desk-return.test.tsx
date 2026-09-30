import { describe, expect, it } from "vitest";

import { RenewalDeskReturnLink } from "@/components/lease-renewal/RenewalDeskReturnLink";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";

describe("S122 document navigation back to the renewal desk", () => {
  it("keeps the exact filtered/sorted continuation on an unintercepted GET link", () => {
    const deskView = serializeRenewalDeskQueryV2({
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      scope: "all",
      lifecycle: "in_progress",
      sort: "lifecycle",
      direction: "asc",
    });
    const link = RenewalDeskReturnLink({ deskView });

    // A Next Link intercepts this transition with an RSC fetch. The deployed regression
    // aborted that stream despite a rendered destination; keep a document GET here.
    expect(link.type).toBe("a");
    expect(link.props.href).toBe(`/lease-renewal/live/desk?${deskView}`);
    expect(link.props.onClick).toBeUndefined();
    expect(link.props.children).toBe("← Back to renewals");
  });
});
