// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationFeedback } from "@/components/layout/NavigationFeedback";
import { RenewalRouteLoading } from "@/components/lease-renewal/RenewalRouteLoading";

const pathname = vi.hoisted(() => ({ current: "/lease-renewal/live/desk" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  pathname.current = "/lease-renewal/live/desk";
  window.history.replaceState(null, "", "/");
});

// S170: selecting a lease on the worklist is acknowledged at once, and the worklist stays on screen
// until the lease is ready. The table changes its own view in place, so only a link that leaves the
// table for another page is page navigation.

function Worklist() {
  return (
    <NavigationFeedback>
      <div data-admitted-view="v=2">
        <table>
          <tbody>
            <tr>
              <td>
                <Link
                  href="/lease-renewal/live/desk/lease/100"
                  onClick={(event) => event.preventDefault()}
                  prefetch={false}
                >
                  Fixture address
                </Link>
              </td>
              <td>
                <Link
                  href="/lease-renewal/live/desk?v=2&sort=end_date"
                  onClick={(event) => event.preventDefault()}
                  prefetch={false}
                >
                  Sort by end date
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </NavigationFeedback>
  );
}

describe("S170 opening a lease keeps the worklist and says what is opening", () => {
  it("acknowledges a lease link inside the worklist and leaves the worklist on screen", () => {
    window.history.replaceState(null, "", "/lease-renewal/live/desk?v=2");
    render(<Worklist />);
    fireEvent.click(screen.getByRole("link", { name: "Fixture address" }));
    expect(screen.getByRole("status", { name: "Page navigation" })).toHaveTextContent(
      "Opening Fixture address…",
    );
    // The current screen is still there and still usable while the lease is read.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sort by end date" })).toBeInTheDocument();
  });

  it("leaves a view change inside the worklist to the worklist's own status", () => {
    window.history.replaceState(null, "", "/lease-renewal/live/desk?v=2");
    render(<Worklist />);
    fireEvent.click(screen.getByRole("link", { name: "Sort by end date" }));
    expect(screen.queryByRole("status", { name: "Page navigation" })).toBeNull();
  });

  it("keeps one loading boundary mounted across the worklist and its leases", () => {
    const root = process.cwd();
    const desk = "app/lease-renewal/live/desk";
    // A loading file below the shared boundary would replace the worklist the moment a lease is
    // selected, so neither route has one.
    expect(existsSync(join(root, desk, "loading.tsx"))).toBe(false);
    expect(existsSync(join(root, desk, "lease/[leaseId]/loading.tsx"))).toBe(false);
    const layout = readFileSync(join(root, desk, "layout.tsx"), "utf8");
    expect(layout).toContain(
      "<Suspense fallback={<RenewalRouteLoading />}>{children}</Suspense>",
    );
  });

  it("names the work on a first load: the worklist, or one lease opened directly", () => {
    render(<RenewalRouteLoading />);
    expect(
      screen.getByRole("heading", { name: "Updating renewals" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    cleanup();
    pathname.current = "/lease-renewal/live/desk/lease/100";
    render(<RenewalRouteLoading />);
    expect(screen.getByRole("heading", { name: "Opening lease" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/Applying the selected scope/)).toBeNull();
  });
});
