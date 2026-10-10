// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk",
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(cleanup);
it("offers a reviewed shared monthly collection from the actual renewal result set", () => {
  render(<RenewalDesk view={getRenewalDeskView()} role="Editor" />);
  const link = screen.getByRole("link", {
    name: "Save reviewed leases as a shared collection",
  });
  expect(link).toHaveAttribute(
    "href",
    expect.stringContaining("/lease-renewal/collections?"),
  );
  expect(link.getAttribute("href")).toContain("members=");
});
