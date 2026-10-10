// S165 return navigation on the sign-in page: the remembered page is validated on the server,
// handed to the panel, and used for an already signed-in visitor, without letting a refused page
// and the sign-in page redirect to each other.

import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { uid: string },
  returnCookie: undefined as string | undefined,
}));

vi.mock("@/lib/firestore/presentation-settings", () => ({
  readApplicationDisplayName: vi.fn(async () => "PMI KC"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "app.example.test" }),
  cookies: async () => ({
    get: (name: string) =>
      name === "pmi_kc_return_to" && state.returnCookie !== undefined
        ? { name, value: state.returnCookie }
        : undefined,
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => state.user),
}));
vi.mock("@/lib/config/server", () => ({
  readServerConfig: () => ({ allowedHostedDomain: "example.test", localDemoAuth: false }),
}));

import SignInPage from "@/app/sign-in/page";

function findPanelProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPanelProps(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown>;
  if ("allowedHostedDomain" in props) return props;
  return findPanelProps(props.children as ReactNode);
}

async function renderPage(error?: string) {
  return SignInPage({ searchParams: Promise.resolve(error ? { error } : {}) });
}

describe("S165 sign-in page return navigation (BEH-S165-1)", () => {
  beforeEach(() => {
    state.user = null;
    state.returnCookie = undefined;
  });

  it("hands the remembered page to the sign-in panel", async () => {
    state.returnCookie = "/lease-renewal/live/desk/lease/1001?deskView=abc";

    const props = findPanelProps(await renderPage());

    expect(props?.returnTo).toBe("/lease-renewal/live/desk/lease/1001?deskView=abc");
    expect(props?.allowedHostedDomain).toBe("example.test");
  });

  it("drops a remembered value that is not a page inside the staff app", async () => {
    state.returnCookie = "https://elsewhere.example/steal";

    expect(findPanelProps(await renderPage())?.returnTo).toBeNull();
  });

  it("sends an already signed-in visitor to the remembered page, or the Dashboard", async () => {
    state.user = { uid: "editor-1" };

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/");

    state.returnCookie = "/work";
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/work");
  });

  it("BEH-S165-9: a signed-in account refused by a page goes to the Dashboard, never back to the refused page", async () => {
    state.user = { uid: "editor-1" };
    state.returnCookie = "/admin";

    await expect(renderPage("forbidden")).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
  });
});
