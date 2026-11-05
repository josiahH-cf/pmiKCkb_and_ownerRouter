// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const rest = { ...props };
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} alt={props.alt ?? ""} />;
  },
}));

// The moved-step notice on a guide page uses the App Router to open the section page.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { HelpFrame } from "@/components/help/HelpFrame";
import { HelpGuidePage, HelpLanding, HelpWholeManual } from "@/components/help/HelpViews";
import { helpGuideById, helpScreen } from "@/lib/help";
import type { HelpScreenControl } from "@/lib/help/types";

// S242 AC-S242-3 (mounted half): every control the Help screen reference names renders on the
// mounted hub by its role and exact accessible name inside its stated region, and a renamed label
// is reported naming the screen and control. The rehearsal browser check
// (`bash scripts/run-help-rehearsal.sh --controls`) is the same check on the real pages.

afterEach(cleanup);

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function mount(route: string): ReactElement {
  if (route === "/help/print")
    return (
      <HelpFrame currentHref={route}>
        <HelpWholeManual servingCommit={COMMIT} />
      </HelpFrame>
    );
  const [, , section, guideId] = route.split("/");
  if (section && guideId) {
    const guide = helpGuideById(guideId)!;
    return (
      <HelpFrame currentHref={route} currentGroup={guide.section}>
        <HelpGuidePage guide={guide} servingCommit={COMMIT} />
      </HelpFrame>
    );
  }
  return (
    <HelpFrame currentHref="/help">
      <HelpLanding moved={false} servingCommit={COMMIT} />
    </HelpFrame>
  );
}

/** Finds a control the way the browser check does; returns a problem or null. */
function missing(screenId: string, control: HelpScreenControl): string | null {
  const [scopeRole, ...scopeName] = (control.region ?? "").split(":");
  const scope = control.region
    ? within(
        screen.getByRole(scopeName.length ? (scopeRole as never) : "region", {
          name: scopeName.length ? scopeName.join(":") : control.region,
        }),
      )
    : screen;
  const found = scope.queryAllByRole(control.role as never, { name: control.label });
  return found.length
    ? null
    : `screen ${screenId}: "${control.label}" (${control.role}) is not rendered on ${control.route ?? "/help"}.`;
}

// Controls reached only through the shell (the primary navigation) or a narrow viewport are checked
// by the rehearsal browser check, not here.
const help = helpScreen("help")!;
const mounted = help.controls.filter(
  (control) => control.availability === "required" && !control.actions?.length,
);

describe("S242 AC-S242-3: the Help screen reference names controls the mounted hub renders", () => {
  it("covers the hub's own controls", () => {
    expect(mounted.length).toBeGreaterThanOrEqual(10);
  });

  it.each(mounted.map((control) => [control.label, control.role, control] as const))(
    "%s (%s) renders",
    (_label, _role, control) => {
      render(mount(control.route ?? "/help"));
      expect(missing("help", control)).toBeNull();
    },
  );

  it("a renamed control is reported naming the screen and the label", () => {
    const control = mounted.find((entry) => entry.label === "What changed")!;
    render(mount(control.route ?? "/help"));
    expect(missing("help", { ...control, label: "What changed recently" })).toBe(
      'screen help: "What changed recently" (link) is not rendered on /help.',
    );
  });
});
