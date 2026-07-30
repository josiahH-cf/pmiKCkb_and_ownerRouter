import { describe, expect, it, vi } from "vitest";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  createDescriptorBoundGmailRuntimeClient,
  createGmailHubRuntimeDependencies,
  resolveGmailHubEffectEnvironment,
} from "@/lib/gmail-hub/dependencies";
import {
  GMAIL_HUB_ACTIONS,
  GMAIL_WATCH_GOVERNING_ACTION_KEY,
} from "@/lib/gmail-hub/action-keys";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { GmailRuntimeClient } from "@/lib/gmail-runtime/client";

const production: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

describe("Gmail Hub effect environment boundary", () => {
  it("uses Live A2 mode and permits client construction only in Production+Live", () => {
    const environment = resolveGmailHubEffectEnvironment({
      ENVIRONMENT_KIND: "production",
      DATA_CONTEXT: "live",
    });
    const client = {} as GmailRuntimeClient;
    const construct = vi.fn(() => client);

    expect(environment).toEqual({
      descriptor: production,
      dataMode: "live",
    });
    expect(
      createDescriptorBoundGmailRuntimeClient(
        "operator@pmikcmetro.com",
        environment.descriptor,
        construct,
      ),
    ).toBe(client);
    expect(construct).toHaveBeenCalledOnce();
  });

  it.each([
    ["demo", "demo"],
    ["demo", "live_readonly"],
  ] as const)(
    "uses Test A2 mode and refuses real client construction in %s+%s",
    (environmentKind, dataContext) => {
      const environment = resolveGmailHubEffectEnvironment({
        ENVIRONMENT_KIND: environmentKind,
        DATA_CONTEXT: dataContext,
      });
      const construct = vi.fn(() => ({}) as GmailRuntimeClient);

      expect(environment.dataMode).toBe("test");
      expect(() =>
        createDescriptorBoundGmailRuntimeClient(
          "operator@pmikcmetro.com",
          environment.descriptor,
          construct,
        ),
      ).toThrow(/requires the Production environment with Live data/i);
      expect(construct).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["demo", "demo"],
    ["demo", "live_readonly"],
  ] as const)(
    "binds the %s+%s composition guard and provider defense to the same descriptor",
    (environmentKind, dataContext) => {
      const store = new MemoryGmailStateStore();
      const constructClient = vi.fn(() => ({}) as GmailRuntimeClient);
      const createStore = vi.fn(() => store);
      const dependencies = createGmailHubRuntimeDependencies(
        {
          ENVIRONMENT_KIND: environmentKind,
          DATA_CONTEXT: dataContext,
        },
        { constructClient, createStore },
      );

      expect(createStore).toHaveBeenCalledWith("test");
      expect(() => dependencies.assertEffectEnvironment()).toThrow(
        /requires the Production environment with Live data/i,
      );
      expect(() => dependencies.createClient("operator@pmikcmetro.com")).toThrow(
        /requires the Production environment with Live data/i,
      );
      expect(constructClient).not.toHaveBeenCalled();
    },
  );

  it("fails closed before any runtime factory when the server descriptor is partial", () => {
    const constructClient = vi.fn(() => ({}) as GmailRuntimeClient);
    const createStore = vi.fn(() => new MemoryGmailStateStore());

    expect(() =>
      createGmailHubRuntimeDependencies(
        {
          ENVIRONMENT_KIND: "production",
        },
        { constructClient, createStore },
      ),
    ).toThrow(/Environment descriptor is invalid.*DATA_CONTEXT is not set/i);
    expect(createStore).not.toHaveBeenCalled();
    expect(constructClient).not.toHaveBeenCalled();
  });

  it("pins watch A2 to the exact D37 governing action key without inventing a gate", () => {
    expect(GMAIL_WATCH_GOVERNING_ACTION_KEY).toBe(GMAIL_HUB_ACTIONS.read);
    expect(GMAIL_WATCH_GOVERNING_ACTION_KEY).toBe("gmail.mailbox.read");
  });
});
