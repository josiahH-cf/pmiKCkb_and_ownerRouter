import type { Page } from "playwright-core";

export interface GuideStep {
  step: string;
  page?: string;
  control: string;
  role:
    | "button"
    | "link"
    | "heading"
    | "combobox"
    | "region"
    | "label"
    | "phase"
    | "summary";
  scope?: string;
  availability: "required" | "conditional";
  expectation?: string;
}

export function assertGuideControl(
  page: Pick<Page, "getByRole" | "getByLabel" | "getByText" | "locator">,
  step: GuideStep,
): Promise<"visible" | "unavailable">;
export function parseGuideSteps(markdown: string): GuideStep[];
