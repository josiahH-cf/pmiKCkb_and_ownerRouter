// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VendorSetupBridge } from "@/components/vendor/VendorSetupBridge";

const TOKEN = "E".repeat(43);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Live Vendor setup fragment bridge", () => {
  it("clears the fragment but requires a user gesture before the body-only POST", async () => {
    window.history.replaceState(null, "", `/vendor/setup#token=${TOKEN}`);
    const events: string[] = [];
    const originalReplaceState = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
      events.push("clear-fragment");
      originalReplaceState(data, unused, url);
    });
    let submitted:
      | {
          method: string;
          action: string;
          enctype: string;
          token: string | undefined;
        }
      | undefined;
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
      this: HTMLFormElement,
    ) {
      events.push("submit");
      submitted = {
        method: this.method,
        action: this.action,
        enctype: this.enctype,
        token: this.querySelector<HTMLInputElement>('input[name="token"]')?.value,
      };
      expect(window.location.hash).toBe("");
      expect(window.location.href).not.toContain(TOKEN);
    });

    render(<VendorSetupBridge />);
    const continueButton = await screen.findByRole("button", {
      name: "Continue to secure setup",
    });
    expect(events).toEqual(["clear-fragment"]);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.querySelector('input[name="token"]')).toBeNull();
    expect(submitted).toBeUndefined();

    fireEvent.click(continueButton);
    await waitFor(() => expect(events).toEqual(["clear-fragment", "submit"]));

    expect(submitted).toBeDefined();
    expect(submitted!.method).toBe("post");
    expect(new URL(submitted!.action).pathname).toBe("/api/vendor/setup");
    expect(new URL(submitted!.action).search).toBe("");
    expect(submitted!.enctype).toBe("application/x-www-form-urlencoded");
    expect(submitted!.token).toBe(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.querySelector('input[name="token"]')).toBeNull();
  });

  it.each([
    "/vendor/setup",
    "/vendor/setup#token=short",
    `/vendor/setup#token=${TOKEN}&extra=value`,
    `/vendor/setup#token=${TOKEN}&token=${TOKEN}`,
  ])("clears and refuses an invalid fragment: %s", async (url) => {
    window.history.replaceState(null, "", url);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    render(<VendorSetupBridge />);
    expect(
      await screen.findByRole("heading", { name: "Setup link unavailable" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /still pending setup.*request a setup-link reissue.*active or disabled accounts.*separately governed account-reset lifecycle/i,
      ),
    ).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not submit when the fragment-bearing history entry cannot be cleared", async () => {
    window.history.replaceState(null, "", `/vendor/setup#token=${TOKEN}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("history unavailable");
    });
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    render(<VendorSetupBridge />);
    expect(
      await screen.findByRole("heading", { name: "Setup link unavailable" }),
    ).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });
});
