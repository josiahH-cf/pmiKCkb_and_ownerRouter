import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateTransientLayer,
  dismissTransientLayerDescendants,
  registerTransientLayer,
  resetTransientLayersForTests,
} from "@/lib/ui/transient-layer";

afterEach(resetTransientLayersForTests);

describe("S86 transient-layer coordinator", () => {
  it("keeps root families mutually exclusive and closes a root's descendant help", () => {
    const closeAppearance = vi.fn();
    const closeHelp = vi.fn();
    const closeNotifications = vi.fn();
    registerTransientLayer({
      id: "appearance-1",
      family: "appearance",
      close: closeAppearance,
    });
    registerTransientLayer({
      id: "help-1",
      family: "infotip",
      parentId: "appearance-1",
      close: closeHelp,
    });
    registerTransientLayer({
      id: "notifications-1",
      family: "notifications",
      close: closeNotifications,
    });

    activateTransientLayer({ id: "notifications-1", family: "notifications" });

    expect(closeAppearance).toHaveBeenCalledTimes(1);
    expect(closeHelp).toHaveBeenCalledTimes(1);
    expect(closeNotifications).not.toHaveBeenCalled();
  });

  it("lets a help layer stay inside its root while closing peer help", () => {
    const closeRoot = vi.fn();
    const closeFirstHelp = vi.fn();
    const closeSecondHelp = vi.fn();
    registerTransientLayer({
      id: "navigation-1",
      family: "navigation",
      close: closeRoot,
    });
    registerTransientLayer({
      id: "help-1",
      family: "infotip",
      parentId: "navigation-1",
      close: closeFirstHelp,
    });
    registerTransientLayer({
      id: "help-2",
      family: "infotip",
      parentId: "navigation-1",
      close: closeSecondHelp,
    });

    activateTransientLayer({
      id: "help-2",
      family: "infotip",
      parentId: "navigation-1",
    });

    expect(closeRoot).not.toHaveBeenCalled();
    expect(closeFirstHelp).toHaveBeenCalledTimes(1);
    expect(closeSecondHelp).not.toHaveBeenCalled();
  });

  it("closes descendants when their owning root is dismissed directly", () => {
    const closeHelp = vi.fn();
    registerTransientLayer({
      id: "help-1",
      family: "infotip",
      parentId: "appearance-1",
      close: closeHelp,
    });

    dismissTransientLayerDescendants("appearance-1");

    expect(closeHelp).toHaveBeenCalledTimes(1);
  });
});
