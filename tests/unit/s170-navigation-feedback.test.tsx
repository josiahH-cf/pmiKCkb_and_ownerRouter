// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  RenewalDeskGetForm,
  RenewalDeskSubmitButton,
} from "@/components/lease-renewal/RenewalDeskGetForm";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("S170 the owning native view form releases a failed navigation into explicit read recovery", async () => {
  vi.useFakeTimers();
  const view = render(
    <RenewalDeskGetForm className="fixture" pendingLabel="Applying view" stateKey="v=2">
      <RenewalDeskSubmitButton className="fixture" pendingText="Applying">
        Apply
      </RenewalDeskSubmitButton>
    </RenewalDeskGetForm>,
  );
  fireEvent.submit(view.container.querySelector("form")!);
  expect(screen.getByRole("button", { name: "Applying" })).toBeDisabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/not finished/i);
  expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
});
