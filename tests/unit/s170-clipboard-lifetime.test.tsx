// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  RenewalCopyAudience,
  RenewalCopyValue,
} from "@/components/lease-renewal/RenewalCopyValue";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("S170 acknowledges and bounds the real clipboard action while retaining its usable displayed fallback", async () => {
  vi.useFakeTimers();
  const writeText = vi.fn(() => new Promise<void>(() => {}));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<RenewalCopyValue label="tenant email" value="fixture@example.test" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Copy tenant email: fixture@example.test" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(/Copying/);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8_001);
  });
  expect(screen.getByRole("status")).toHaveTextContent(/Select.*copy/i);
  expect(screen.getByText("fixture@example.test")).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Copy tenant email: fixture@example.test" }),
  ).toBeEnabled();
});

it("retires the actual clipboard completion and reset timer when the owning value unmounts", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    },
  });
  const view = render(
    <RenewalCopyValue label="tenant email" value="fixture@example.test" />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Copy tenant email: fixture@example.test" }),
  );
  view.unmount();
  await act(async () => finish());
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps a late clipboard result from labeling newly selected audience values as copied", async () => {
  let finish!: () => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    },
  });
  const view = render(
    <RenewalCopyAudience
      audience="tenant"
      parties={[{ label: "First Fixture", email: "first@example.test" }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy all tenant emails" }));
  view.rerender(
    <RenewalCopyAudience
      audience="tenant"
      parties={[{ label: "Second Fixture", email: "second@example.test" }]}
    />,
  );
  await act(async () => finish());
  expect(screen.getByRole("status")).not.toHaveTextContent(/Copied/);
  expect(screen.getByRole("button", { name: "Copy all tenant emails" })).toBeEnabled();
});
