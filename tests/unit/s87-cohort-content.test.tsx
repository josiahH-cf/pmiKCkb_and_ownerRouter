// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: async () => ({ uid: "fixture-admin", role: "Admin" }),
}));
vi.mock("@/lib/config/server", () => ({
  readServerConfig: () => ({ askDemoMode: false }),
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/gmail-hub/TemplateWorkspace", () => ({
  TemplateWorkspace: () => <div>Local rule examples</div>,
}));
import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { buildConnectionView } from "@/lib/connections/connection-status";
import GmailGovernancePage from "@/app/admin/gmail-inbox-zero/page";
import { OwnerPolicyRulesAdminPanel } from "@/components/admin/OwnerPolicyRulesAdminPanel";
afterEach(cleanup);
it("S87 removes duplicate Connections introduction while preserving action consequences", () => {
  render(<ConnectionCenter view={buildConnectionView({})} canManage={false} />);
  expect(
    document.body.textContent?.match(
      /Connection status does not grant action authority\./g,
    ) ?? [],
  ).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  expect(screen.getByText("Closed by governance")).toBeVisible();
});
it("S87 Admin governance directs mailbox verification without declaring an unobserved connection activated", async () => {
  render(await GmailGovernancePage());
  expect(screen.queryByText("Activated")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Verify my Gmail connection" }),
  ).toHaveAttribute("href", "/gmail-hub");
  expect(screen.getByText(/authoritative recipient/i)).toBeVisible();
});
it("S87 keeps the populated effective-date control labelled with its actual format hint", () => {
  render(<OwnerPolicyRulesAdminPanel initialRules={[]} />);
  const date = screen.getByLabelText("Effective from");
  expect(date).toHaveAttribute("aria-describedby");
  fireEvent.change(date, { target: { value: "2026-12-31" } });
  const hint = document.getElementById(date.getAttribute("aria-describedby")!);
  expect(hint).toHaveTextContent("12/31/2026");
  expect(screen.getByLabelText("Effective from")).toBe(date);
});
