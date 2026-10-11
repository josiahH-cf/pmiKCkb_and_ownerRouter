// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Model the client-reference export seen by Next's server renderer. A client component can be
// rendered from a server component; its exported value cannot be interpolated into a server URL.
vi.mock("@/components/lease-renewal/RenewalCurrentRent", () => ({
  RenewalCurrentRent: () => null,
  RentChargeUpdateStatus: () => null,
  WORKING_CURRENT_RENT_TARGET: function clientReference() {
    throw new Error("A server component cannot call a client export");
  },
}));

import { RentAndCharges } from "@/components/lease-renewal/RentAndCharges";

afterEach(cleanup);

it("renders the current-rent correction link as the field anchor across the server/client boundary", () => {
  render(<RentAndCharges summary={{ currentRent: null }} />);
  expect(screen.getByRole("link", { name: "Correct the current rent" })).toHaveAttribute(
    "href",
    "#renewal-working-current-rent",
  );
});
