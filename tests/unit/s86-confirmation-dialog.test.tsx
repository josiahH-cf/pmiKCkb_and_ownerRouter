// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "@/components/ui";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S86 ConfirmationDialog", () => {
  it("keeps initial loading focus inside, then focuses Cancel and supports Escape after loading", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const view = render(<DialogHarness busy onConfirm={confirm} />);
    const trigger = screen.getByRole("button", { name: "Open exact confirmation" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
    view.rerender(<DialogHarness onConfirm={confirm} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Confirm change" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("finishes a failed field's recovery after the dialog closes and ordinary trigger focus returns", async () => {
    const returned: string[] = [];
    function FailedFieldHarness() {
      const [open, setOpen] = useState(false);
      const field = useRef<HTMLInputElement>(null);
      const trigger = useRef<HTMLButtonElement>(null);
      const recover = useCallback(() => {
        returned.push(document.activeElement?.textContent ?? "");
        field.current?.focus();
      }, []);
      return (
        <>
          <input aria-label="Unconfirmed rent" defaultValue="1499" ref={field} />
          <button onClick={() => setOpen(true)} ref={trigger}>
            Open failed preview
          </button>
          <ConfirmationDialog
            open={open}
            title="Failed preview"
            confirmLabel="Create"
            confirmDisabled
            triggerRef={trigger}
            onAfterClose={recover}
            onCancel={() => setOpen(false)}
            onConfirm={() => undefined}
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<FailedFieldHarness />);
    await user.click(screen.getByRole("button", { name: "Open failed preview" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(returned).toEqual(["Open failed preview"]);
    expect(screen.getByLabelText("Unconfirmed rent")).toHaveFocus();
  });
  for (const removed of [false, true]) {
    it(`returns to the fallback when the original trigger is ${removed ? "removed" : "disabled"}`, async () => {
      const user = userEvent.setup();
      function OutcomeHarness() {
        const [open, setOpen] = useState(false);
        const [finished, setFinished] = useState(false);
        const trigger = useRef<HTMLButtonElement>(null);
        const fallback = useRef<HTMLButtonElement>(null);
        return (
          <>
            {!(removed && finished) ? (
              <button ref={trigger} disabled={finished} onClick={() => setOpen(true)}>
                Open review
              </button>
            ) : null}
            {finished ? <button ref={fallback}>Recover exact attempt</button> : null}
            <ConfirmationDialog
              open={open}
              title="Exact review"
              confirmLabel="Confirm"
              triggerRef={trigger}
              fallbackFocusRef={fallback}
              onCancel={() => setOpen(false)}
              onConfirm={() => {
                setFinished(true);
                setOpen(false);
              }}
            />
          </>
        );
      }
      render(<OutcomeHarness />);
      await user.click(screen.getByRole("button", { name: "Open review" }));
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("button", { name: "Recover exact attempt" })).toHaveFocus();
    });
  }
  it("opens effect-free, focuses Cancel first, traps focus, and restores the trigger", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<DialogHarness onConfirm={confirm} />);

    const trigger = screen.getByRole("button", { name: "Open exact confirmation" });
    await user.click(trigger);
    expect(confirm).not.toHaveBeenCalled();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Confirm change" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("never treats backdrop activation as confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<DialogHarness onConfirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Open exact confirmation" }));

    fireEvent.click(document.querySelector(".ui-dialog-backdrop")!);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts a long exact review at its content with Cancel next in keyboard order", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(766);
    const user = userEvent.setup();
    const confirm = vi.fn();
    const view = render(<DialogHarness busy onConfirm={confirm} startWithReview />);
    const trigger = screen.getByRole("button", { name: "Open exact confirmation" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    view.rerender(<DialogHarness onConfirm={confirm} startWithReview />);
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps a dispatched confirmation open and prevents false cancellation while busy", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<DialogHarness busy onConfirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "Open exact confirmation" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirming change" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".ui-dialog-backdrop")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

function DialogHarness({
  busy = false,
  onConfirm,
  startWithReview = false,
}: Readonly<{ busy?: boolean; onConfirm: () => void; startWithReview?: boolean }>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)} type="button">
        Open exact confirmation
      </button>
      <ConfirmationDialog
        busy={busy}
        cancelLabel="Cancel"
        confirmLabel="Confirm change"
        description="This changes one exact record."
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        startWithReview={startWithReview}
        title="Confirm exact change"
        triggerRef={triggerRef}
      >
        <p>Target: Record 1</p>
      </ConfirmationDialog>
    </>
  );
}
