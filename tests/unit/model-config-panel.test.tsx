// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ModelConfigPanel } from "@/components/admin/ModelConfigPanel";

afterEach(() => cleanup());

describe("ModelConfigPanel (AC-S32-6)", () => {
  it("renders the supported model via its friendly label with its location and provider", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-3.1-flash-lite"
        classifyModel="gemini-3.1-flash-lite"
        location="global"
        provider="gemini"
      />,
    );
    expect(screen.getAllByText("Gemini 3.1 Flash-Lite")).toHaveLength(2);
    expect(screen.getByText("global")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
    // No "not in the known-good list" note for the supported selection.
    expect(screen.queryByText(/not in the known-good list/)).toBeNull();
  });

  it("flags a retiring 2.5 model and a title-cased unknown model as not known-good", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-3.0-ultra"
        classifyModel="gemini-2.5-flash"
        location="global"
        provider="gemini"
      />,
    );
    expect(screen.getByText("Gemini 3.0 Ultra")).toBeInTheDocument();
    expect(screen.getByText("Gemini 2.5 Flash")).toBeInTheDocument();
    expect(screen.getAllByText(/not in the known-good list/)).toHaveLength(2);
  });

  it("is read-only: exposes no control that mutates a model at runtime", () => {
    render(
      <ModelConfigPanel
        answerModel="gemini-3.1-flash-lite"
        classifyModel="gemini-3.1-flash-lite"
        location="global"
        provider="gemini"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    // The copy states the change is a reviewed release configuration plus an owner-run deploy.
    expect(
      screen.getByText(
        /GEMINI_MODEL_ANSWER, GEMINI_MODEL_CLASSIFY and GEMINI_MODEL_LOCATION/,
      ),
    ).toBeInTheDocument();
  });
});
