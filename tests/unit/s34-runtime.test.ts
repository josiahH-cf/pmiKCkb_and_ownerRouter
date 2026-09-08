import { describe, expect, it } from "vitest";
import { SelectDotloopRenewalSettingsInputSchema } from "@/lib/firestore/dotloop-renewal-settings";

import { executeDotloopPacketWithS20 } from "@/lib/lease-renewal/execution/dotloop-runtime";

const selection = {
  profile_id: "1",
  profile_label: "Office",
  template_id: "2",
  template_label: "Renewal",
};

describe("S34 provider-documented selection", () => {
  it("records the exact selected transaction type and initial status", () => {
    const value = {
      ...selection,
      transaction_type: "LEASE_OFFER",
      initial_status: "PRE_OFFER",
    };
    expect(SelectDotloopRenewalSettingsInputSchema.parse(value)).toEqual(value);
  });
  it("refuses a status belonging to another transaction type", () => {
    expect(
      SelectDotloopRenewalSettingsInputSchema.safeParse({
        ...selection,
        transaction_type: "LEASE_OFFER",
        initial_status: "ACTIVE_LISTING",
      }).success,
    ).toBe(false);
  });
  it("does not invent missing transaction terms", () => {
    const parsed = SelectDotloopRenewalSettingsInputSchema.parse(selection);
    expect(parsed).not.toHaveProperty("transaction_type");
    expect(parsed).not.toHaveProperty("initial_status");
  });
});

it("refuses the exact closed Dotloop key before packet or provider construction", async () => {
  await expect(
    executeDotloopPacketWithS20(
      {} as never,
      {
        request: { action: { actionKey: "dotloop.loop.create_from_template" } },
      } as never,
    ),
  ).rejects.toThrow(
    'Action "dotloop.loop.create_from_template" is not enabled for execution (production_allowed:false).',
  );
});
