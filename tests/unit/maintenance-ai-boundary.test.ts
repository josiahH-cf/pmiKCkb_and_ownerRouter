import { describe, expect, it } from "vitest";

import { assertMaintenanceCommunicationNoAuthority } from "@/lib/maintenance/execution/providers";

describe("Maintenance AI communication boundary", () => {
  it("permits proposal text with no side effect and refuses authority effects", () => {
    expect(() => assertMaintenanceCommunicationNoAuthority({})).not.toThrow();
    expect(() =>
      assertMaintenanceCommunicationNoAuthority({ proposedEffects: ["assign_vendor"] }),
    ).toThrow("cannot choose a Vendor");
    expect(() =>
      assertMaintenanceCommunicationNoAuthority({ proposedEffects: ["approve_cost"] }),
    ).toThrow();
    expect(() =>
      assertMaintenanceCommunicationNoAuthority({ proposedEffects: ["close_ticket"] }),
    ).toThrow();
  });
});
