import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  mintGmailDwdToken: vi.fn(),
}));
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/gmail-runtime/dwd-token", () => ({
  mintGmailDwdToken: mocks.mintGmailDwdToken,
}));

import {
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { resolveRehearsalMail } from "@/lib/gmail-hub/rehearsal-mail";
import {
  REHEARSAL_STAND_IN_ORIGIN_VAR,
  loopbackStandInOrigin,
  resolveRehearsalStandIn,
} from "@/lib/environment/rehearsal-stand-in";
import {
  assertGmailEffectEnvironment,
  createGmailHubRuntimeDependencies,
  createGmailMailboxClient,
} from "@/lib/gmail-hub/dependencies";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import {
  REHEARSAL_STAND_IN_MAILBOX_HEADER,
  REHEARSAL_STAND_IN_TOKEN,
  createRehearsalStandInGmailClient,
  createRehearsalStandInGmailTransport,
} from "@/lib/gmail-runtime/rehearsal-stand-in-client";
import {
  COMPILED_MAIL_DRIVERS,
  S260_DRIVER,
  S271_DRIVER,
  compiledMailAdmits,
} from "@/scripts/lib/one-path-rehearsal/compiled-mail.mjs";
import { resolveRehearsalStandIn as resolveCompiledDraftStandIn } from "@/tests/browser/fixtures/s271-compiled-stand-in";

// S254 R-S254-4 / AC-S254-5: the rehearsal's mail stand-in is a Demo-owned adapter that can never
// produce a live effect. It exists only when the descriptor is explicitly Demo with Demo data AND
// REHEARSAL_STAND_IN_ORIGIN names a loopback origin; it is impossible under the Production
// descriptor; it holds and uses no credential; and with the variable unset every caller behaves
// exactly as before.

const ORIGIN = "http://127.0.0.1:41234";
const REHEARSAL = {
  ENVIRONMENT_KIND: "demo",
  DATA_CONTEXT: "demo",
  NODE_ENV: "development",
  LOCAL_DEMO_AUTH: "true",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8123",
  REHEARSAL_STAND_IN_ORIGIN: ORIGIN,
};
/** The rehearsal's environment without the named variables. */
const without = (...names: (keyof typeof REHEARSAL)[]): Record<string, string> =>
  Object.fromEntries(
    Object.entries(REHEARSAL).filter(
      ([name]) => !names.includes(name as keyof typeof REHEARSAL),
    ),
  );
const production: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};
const demo: EnvironmentDescriptor = {
  environmentKind: "demo",
  dataContext: "demo",
  source: "explicit",
};
const liveReadOnly: EnvironmentDescriptor = {
  environmentKind: "demo",
  dataContext: "live_readonly",
  source: "explicit",
};
const REFUSAL = /requires the Production environment with Live data/i;
const MAILBOX = "local-demo-editor@pmikcmetro.com";

let firestore: FakeTransactionalFirestore;
beforeEach(() => {
  vi.clearAllMocks();
  firestore = new FakeTransactionalFirestore();
  mocks.getAdminFirestore.mockReturnValue(firestore);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("S254 fence: the stand-in origin is loopback HTTP and nothing else", () => {
  it.each([
    ["http://127.0.0.1:41234", "http://127.0.0.1:41234"],
    ["http://localhost:41234", "http://localhost:41234"],
    ["http://[::1]:41234", "http://[::1]:41234"],
    ["http://127.0.0.1:41234/", "http://127.0.0.1:41234"],
    [" http://LOCALHOST:41234 ", "http://localhost:41234"],
  ])("accepts %s", (value, origin) => {
    expect(loopbackStandInOrigin(value)).toBe(origin);
    expect(
      resolveRehearsalStandIn({ ...REHEARSAL, REHEARSAL_STAND_IN_ORIGIN: value }),
    ).toEqual({ origin });
  });

  it.each([
    "https://127.0.0.1:41234",
    "http://127.0.0.1",
    "http://192.168.1.20:41234",
    "http://10.0.0.5:41234",
    "http://0.0.0.0:41234",
    "http://localhost.example.com:41234",
    "http://127.0.0.1.example.com:41234",
    "http://127.0.0.1:41234@gmail.googleapis.com",
    "http://user:secret@127.0.0.1:41234",
    "http://127.0.0.1:41234/gmail",
    "http://127.0.0.1:41234/?to=https://gmail.googleapis.com",
    "http://127.0.0.1:41234/#x",
    "https://gmail.googleapis.com",
    "https://pmi-kc-kb-123456789.us-central1.run.app",
    "ftp://127.0.0.1:41234",
    "127.0.0.1:41234",
    "not a url",
    "",
    "   ",
  ])("refuses %s", (value) => {
    expect(loopbackStandInOrigin(value)).toBeNull();
    expect(
      resolveRehearsalStandIn({ ...REHEARSAL, REHEARSAL_STAND_IN_ORIGIN: value }),
    ).toBeNull();
  });
});

describe("S254 fence: the stand-in exists only in the isolated rehearsal", () => {
  it("resolves when every condition holds", () => {
    expect(REHEARSAL_STAND_IN_ORIGIN_VAR).toBe("REHEARSAL_STAND_IN_ORIGIN");
    expect(resolveRehearsalStandIn(REHEARSAL)).toEqual({ origin: ORIGIN });
  });

  it("is absent when the variable is unset, whatever else is set", () => {
    const rest = without("REHEARSAL_STAND_IN_ORIGIN");
    expect(resolveRehearsalStandIn(rest)).toBeNull();
    // The process environment never stands in for the record a caller passes.
    vi.stubEnv("REHEARSAL_STAND_IN_ORIGIN", ORIGIN);
    expect(resolveRehearsalStandIn(rest)).toBeNull();
  });

  it.each([
    ["production", "live"],
    ["demo", "live_readonly"],
    ["production", "demo"],
    ["demo", "live"],
  ])("is impossible under %s with %s", (ENVIRONMENT_KIND, DATA_CONTEXT) => {
    expect(
      resolveRehearsalStandIn({ ...REHEARSAL, ENVIRONMENT_KIND, DATA_CONTEXT }),
    ).toBeNull();
  });

  it("needs the explicit descriptor: a derived or partial one never qualifies", () => {
    const derived = without("ENVIRONMENT_KIND", "DATA_CONTEXT");
    expect(resolveRehearsalStandIn(derived)).toBeNull();
    expect(resolveRehearsalStandIn({ ...derived, ENVIRONMENT_KIND: "demo" })).toBeNull();
    expect(resolveRehearsalStandIn({ ...derived, DATA_CONTEXT: "demo" })).toBeNull();
  });

  it("is absent in a production build, deployed Demo included", () => {
    expect(resolveRehearsalStandIn({ ...REHEARSAL, NODE_ENV: "production" })).toBeNull();
    const rest = without("NODE_ENV");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveRehearsalStandIn(rest)).toBeNull();
  });

  it.each(["false", "", "1", "yes"])("needs local demo sign-in (%s)", (value) => {
    expect(resolveRehearsalStandIn({ ...REHEARSAL, LOCAL_DEMO_AUTH: value })).toBeNull();
  });

  it.each([
    undefined,
    "",
    "firestore.googleapis.com:443",
    "10.0.0.5:8080",
    "example.invalid:8080",
    "127.0.0.1",
  ])("needs a loopback Firestore emulator (%s)", (value) => {
    expect(
      resolveRehearsalStandIn({ ...REHEARSAL, FIRESTORE_EMULATOR_HOST: value }),
    ).toBeNull();
  });

  it("the variable can never deploy: the release refuses it by name", () => {
    // The list a release refuses when present. The exported list itself is asserted in
    // tests/unit/s254-one-path-rehearsal-safety.test.mjs, which can import the release script.
    const release = readFileSync(
      join(process.cwd(), "scripts/release-candidate.mjs"),
      "utf8",
    );
    const presentIsFatal = release.slice(
      release.indexOf("presentIsFatal: Object.freeze(["),
      release.indexOf("trueIsFatal:"),
    );
    expect(presentIsFatal).toContain(`"${REHEARSAL_STAND_IN_ORIGIN_VAR}",`);
  });
});

describe("S254 fence: the Gmail effect boundary", () => {
  const factories = () => {
    const realClient = {} as GmailRuntimeClient;
    return {
      realClient,
      constructClient: vi.fn(() => realClient),
      createStore: vi.fn(() => new MemoryGmailStateStore()),
    };
  };

  it("with the variable unset, Demo is refused exactly as before", () => {
    const { constructClient, createStore } = factories();
    const dependencies = createGmailHubRuntimeDependencies(
      { ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "demo" },
      { constructClient, createStore },
    );
    let direct: unknown;
    try {
      assertLiveProviderActionAllowed(demo);
    } catch (error) {
      direct = error;
    }
    let fenced: unknown;
    try {
      dependencies.assertEffectEnvironment();
    } catch (error) {
      fenced = error;
    }
    expect(direct).toBeInstanceOf(Error);
    expect(fenced).toBeInstanceOf(Error);
    expect((fenced as Error).name).toBe((direct as Error).name);
    expect((fenced as Error).message).toBe((direct as Error).message);
    expect(() => dependencies.createClient("operator@pmikcmetro.com")).toThrow(REFUSAL);
    expect(constructClient).not.toHaveBeenCalled();
  });

  it("in the rehearsal, the fence passes and the client is the stand-in client", () => {
    const { constructClient, createStore } = factories();
    const dependencies = createGmailHubRuntimeDependencies(REHEARSAL, {
      constructClient,
      createStore,
    });
    expect(() => dependencies.assertEffectEnvironment()).not.toThrow();
    const client = dependencies.createClient(MAILBOX);
    expect(client.subject).toBe(MAILBOX);
    // The real provider constructor never runs, and no delegated token is minted.
    expect(constructClient).not.toHaveBeenCalled();
    expect(mocks.mintGmailDwdToken).not.toHaveBeenCalled();
  });

  it("under the Production descriptor the variable changes nothing", () => {
    const { realClient, constructClient, createStore } = factories();
    const dependencies = createGmailHubRuntimeDependencies(
      { ...REHEARSAL, ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live" },
      { constructClient, createStore },
    );
    expect(() => dependencies.assertEffectEnvironment()).not.toThrow();
    expect(dependencies.createClient("operator@pmikcmetro.com")).toBe(realClient);
    expect(constructClient).toHaveBeenCalledOnce();
  });

  it("Live read-only stays refused with the variable set", () => {
    const { constructClient, createStore } = factories();
    const dependencies = createGmailHubRuntimeDependencies(
      { ...REHEARSAL, DATA_CONTEXT: "live_readonly" },
      { constructClient, createStore },
    );
    expect(() => dependencies.assertEffectEnvironment()).toThrow(REFUSAL);
    expect(() => dependencies.createClient(MAILBOX)).toThrow(REFUSAL);
    expect(constructClient).not.toHaveBeenCalled();
  });

  it("a stand-in handed over beside any descriptor but Demo with Demo data is ignored", () => {
    const standIn = { origin: ORIGIN };
    const realClient = {} as GmailRuntimeClient;
    const construct = vi.fn(() => realClient);
    // Production: the real path, never the stand-in.
    expect(() => assertGmailEffectEnvironment(production, standIn)).not.toThrow();
    expect(createGmailMailboxClient(MAILBOX, production, standIn, construct)).toBe(
      realClient,
    );
    expect(construct).toHaveBeenCalledOnce();
    // Live read-only: refused before any client exists.
    expect(() => assertGmailEffectEnvironment(liveReadOnly, standIn)).toThrow(REFUSAL);
    expect(() =>
      createGmailMailboxClient(MAILBOX, liveReadOnly, standIn, construct),
    ).toThrow(REFUSAL);
    expect(construct).toHaveBeenCalledOnce();
    // Demo with Demo data and no stand-in: refused as before.
    expect(() => assertGmailEffectEnvironment(demo, null)).toThrow(REFUSAL);
    expect(() => createGmailMailboxClient(MAILBOX, demo, null, construct)).toThrow(
      REFUSAL,
    );
    expect(construct).toHaveBeenCalledOnce();
  });

  it("the communication service uses the same fence and the same client factory", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/gmail-hub/sequence-dependencies.ts"),
      "utf8",
    );
    expect(resolveRehearsalMail).toBe(resolveRehearsalStandIn);
    expect(source).toContain("const standIn = resolveRehearsalMail();");
    expect(source).toContain(
      "assertEffectEnvironment: () => assertGmailEffectEnvironment(descriptor, standIn),",
    );
    expect(source).toContain("createGmailMailboxClient(mailbox, descriptor, standIn)");
    // Nothing in that file reaches the Live fence or the real constructor around the shared one.
    expect(source).not.toContain("assertLiveProviderActionAllowed");
    expect(source).not.toContain("new GmailRuntimeClient");
  });
});

describe("S260/S271 fence: the compiled synthetic mail admits two exact drivers only", () => {
  const cwd = "/tmp/pmi-kc-one-path-rehearsal-Ab12Cd/worktree";
  const sha = "a".repeat(40);
  const clean = {
    cwd,
    driver: `${cwd}/${S260_DRIVER}`,
    compiled: true,
    mailAdapter: true,
    overlay: false,
    namedCommit: false,
    servedSha: sha,
    harnessSha: sha,
  };

  it("names exactly the S260 and S271 qualification drivers", () => {
    expect(S260_DRIVER).toBe(
      "tests/browser/one-path-november-9-qualification-driver.mjs",
    );
    expect(S271_DRIVER).toBe(
      "tests/browser/one-path-november-10-qualification-driver.mjs",
    );
    expect([...COMPILED_MAIL_DRIVERS]).toEqual([S260_DRIVER, S271_DRIVER]);
  });

  it.each([S260_DRIVER, S271_DRIVER])(
    "admits %s from a clean compiled commit in its disposable worktree",
    (driver) => {
      expect(compiledMailAdmits({ ...clean, driver: `${cwd}/${driver}` })).toBe(true);
    },
  );

  it.each([
    "tests/browser/one-path-november-10-baseline-driver.mjs",
    "tests/browser/one-path-smoke-driver.mjs",
    "tests/browser/one-path-stand-in-proof-driver.mjs",
    "tests/browser/one-path-november-10-qualification-driver.mjs.bak",
    "tests/browser/../browser/one-path-november-10-qualification-driver.mjs",
    "scripts/one-path-november-10-qualification-driver.mjs",
  ])("refuses any other driver (%s)", (driver) => {
    expect(compiledMailAdmits({ ...clean, driver: `${cwd}/${driver}` })).toBe(false);
  });

  it("refuses an exact driver from another checkout or with no driver", () => {
    expect(
      compiledMailAdmits({ ...clean, driver: `/tmp/elsewhere/worktree/${S271_DRIVER}` }),
    ).toBe(false);
    expect(compiledMailAdmits({ ...clean, driver: null })).toBe(false);
    expect(
      compiledMailAdmits({
        ...clean,
        cwd: "/home/user/checkout",
        driver: `/home/user/checkout/${S271_DRIVER}`,
      }),
    ).toBe(false);
  });

  it.each([
    [{ compiled: false }],
    [{ mailAdapter: false }],
    [{ overlay: true }],
    [{ namedCommit: true }],
    [{ harnessSha: "b".repeat(40) }],
    [{ servedSha: "not-a-sha", harnessSha: "not-a-sha" }],
  ])("refuses either exact driver when %o", (change) => {
    for (const driver of COMPILED_MAIL_DRIVERS)
      expect(
        compiledMailAdmits({ ...clean, driver: `${cwd}/${driver}`, ...change }),
      ).toBe(false);
  });

  it("aliases the draft stand-in only to a resolver that is null outside the compiled build", () => {
    const fence = readFileSync(
      join(process.cwd(), "scripts/lib/one-path-rehearsal/compiled-mail.mjs"),
      "utf8",
    );
    expect(fence).toContain(
      '"@/lib/environment/rehearsal-stand-in": "./\' + DRAFT_STAND_IN + \'",',
    );
    // Outside the isolated production compile (here: the Demo rehearsal environment in a
    // test process), the substituted resolver answers nothing, whatever record is passed.
    expect(resolveCompiledDraftStandIn(REHEARSAL)).toBeNull();
    vi.stubEnv("REHEARSAL_STAND_IN_ORIGIN", ORIGIN);
    expect(resolveCompiledDraftStandIn()).toBeNull();
    const fixture = readFileSync(
      join(process.cwd(), "tests/browser/fixtures/s271-compiled-stand-in.ts"),
      "utf8",
    );
    expect(fixture).toContain("return resolveRehearsalMail(env);");
    const gcloudignore = readFileSync(join(process.cwd(), ".gcloudignore"), "utf8");
    expect(gcloudignore).toContain("tests/browser/fixtures/s271-compiled-stand-in.ts");
  });
});

describe("S254 fence: the stand-in client holds and uses no credential", () => {
  const profile = () =>
    new Response(
      JSON.stringify({
        emailAddress: MAILBOX,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "1",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("sends each request to the loopback stand-in with a label in place of a token", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => profile(),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const client = createRehearsalStandInGmailClient(MAILBOX, { origin: ORIGIN });
    await expect(client.getProfile()).resolves.toMatchObject({ emailAddress: MAILBOX });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/gmail/v1/users/me/profile`);
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${REHEARSAL_STAND_IN_TOKEN}`);
    expect(REHEARSAL_STAND_IN_TOKEN).toBe("rehearsal-stand-in");
    expect(headers[REHEARSAL_STAND_IN_MAILBOX_HEADER]).toBe(MAILBOX);
    expect(mocks.mintGmailDwdToken).not.toHaveBeenCalled();
  });

  it("refuses to exist for an origin that is not loopback", () => {
    for (const origin of [
      "https://gmail.googleapis.com",
      "http://192.168.1.20:41234",
      "http://127.0.0.1:41234/gmail",
    ])
      expect(() => createRehearsalStandInGmailClient(MAILBOX, { origin })).toThrow(
        /loopback/,
      );
  });

  it("answers Gmail mailbox requests only, and never another host", async () => {
    const fetchSpy = vi.fn(async () => profile());
    vi.stubGlobal("fetch", fetchSpy);
    const transport = createRehearsalStandInGmailTransport({ origin: ORIGIN }, MAILBOX);
    for (const url of [
      "https://example.invalid/gmail/v1/users/me/profile",
      "https://gmail.googleapis.com.example.invalid/gmail/v1/users/me/profile",
      "https://gmail.googleapis.com/gmail/v1/users/someone@example.invalid/profile",
      "https://oauth2.googleapis.com/token",
    ])
      await expect(transport.send({ url, method: "GET", headers: {} })).rejects.toThrow(
        /Gmail mailbox requests only/,
      );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads no environment and imports no credential source", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/gmail-runtime/rehearsal-stand-in-client.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/process\.env/);
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual([
      "@/lib/environment/rehearsal-stand-in",
      "@/lib/gmail-runtime/client",
      "@/lib/gmail-runtime/subject",
      "@/lib/gmail-runtime/transport",
    ]);
  });
});
