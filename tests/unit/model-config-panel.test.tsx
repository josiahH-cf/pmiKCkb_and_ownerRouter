// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ModelConfigPanel } from "@/components/admin/ModelConfigPanel";

afterEach(() => cleanup());

describe("ModelConfigPanel (AC-S32-6)", () => {
  it("renders known models via their friendly label and shows the provider", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-2.5-pro"
        classifyModel="gemini-2.5-flash"
        provider="gemini"
      />,
    );
    expect(screen.getByText("Gemini 2.5 Pro")).toBeInTheDocument();
    expect(screen.getByText("Gemini 2.5 Flash")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
    // No "not in the known-good list" note for known ids.
    expect(screen.queryByText(/not in the known-good list/)).toBeNull();
  });

  it("title-cases an unknown model and flags it as not known-good", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-3.0-ultra"
        classifyModel="gemini-2.5-flash"
        provider="gemini"
      />,
    );
    expect(screen.getByText("Gemini 3.0 Ultra")).toBeInTheDocument();
    expect(screen.getByText(/not in the known-good list/)).toBeInTheDocument();
  });

  it("is read-only: exposes no control that mutates a model at runtime", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-2.5-pro"
        classifyModel="gemini-2.5-flash"
        provider="gemini"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    // The copy states the change is an env edit plus an owner-run deploy.
    expect(screen.getByText(/env edit to GEMINI_MODEL_ANSWER/)).toBeInTheDocument();
  });
});
