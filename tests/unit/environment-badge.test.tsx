// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EnvironmentBadge,
  environmentBadgeLabel,
} from "@/components/layout/EnvironmentBadge";
import type { EnvironmentDescriptorResult } from "@/lib/environment/descriptor";

/**
 * S40 AC-S40-7. The property that matters is not "a chip renders" — it is that silence unambiguously
 * means ordinary live Production, and that every other state, including an unresolvable one, says so.
 */

function ok(
  environmentKind: "production" | "demo",
  dataContext: "live" | "live_readonly" | "demo",
): EnvironmentDescriptorResult {
  return {
    ok: true,
    descriptor: { environmentKind, dataContext, source: "explicit" },
  };
}

afterEach(cleanup);

describe("environment badge label", () => {
  it("renders nothing in ordinary live Production", () => {
    expect(environmentBadgeLabel(ok("production", "live"))).toBeNull();
  });

  it("names Live read-only as real records that cannot be changed", () => {
    const label = environmentBadgeLabel(ok("demo", "live_readonly"));

    expect(label?.text).toBe("Live data, read only");
    expect(label?.detail).toMatch(/real records/i);
  });

  it("names Demo as a practice environment holding made-up records", () => {
    const label = environmentBadgeLabel(ok("demo", "demo"));

    expect(label?.text).toBe("Practice environment");
    expect(label?.detail).toMatch(/made up/i);
  });

  it("treats an unresolvable descriptor as the loudest state, never as Production", () => {
    // Silence is this badge's "ordinary Production" signal, so an unknown environment must not be
    // silent — that would be the one wrong answer.
    const label = environmentBadgeLabel({ ok: false, errors: ["missing"] } as never);

    expect(label).not.toBeNull();
    expect(label?.text).toBe("Environment not confirmed");
  });

  it("uses no operator jargon and no em dash in any label", () => {
    for (const result of [
      ok("demo", "demo"),
      ok("demo", "live_readonly"),
      { ok: false, errors: [] } as never,
    ]) {
      const label = environmentBadgeLabel(result);
      const copy = `${label?.text} ${label?.detail}`;
      expect(copy).not.toContain("—");
      for (const jargon of ["Sample", "Test", "Demo", "data_mode"]) {
        expect(copy).not.toContain(jargon);
      }
    }
  });
});

describe("environment badge rendering", () => {
  it("renders no element at all in Production", () => {
    const { container } = render(
      <EnvironmentBadge descriptor={ok("production", "live")} />,
    );

    expect(container.querySelector(".environment-badge")).toBeNull();
  });

  it("renders the label and tags the context for styling", () => {
    render(<EnvironmentBadge descriptor={ok("demo", "live_readonly")} />);

    const badge = screen.getByText("Live data, read only").closest(".environment-badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("data-context")).toBe("live_readonly");
    // A standing context must not interrupt a screen reader on every navigation.
    expect(badge?.getAttribute("role")).toBeNull();
  });

  it("tags an unconfirmed environment distinctly", () => {
    render(<EnvironmentBadge descriptor={{ ok: false, errors: [] } as never} />);

    expect(
      screen
        .getByText("Environment not confirmed")
        .closest(".environment-badge")
        ?.getAttribute("data-context"),
    ).toBe("unconfirmed");
  });
});
