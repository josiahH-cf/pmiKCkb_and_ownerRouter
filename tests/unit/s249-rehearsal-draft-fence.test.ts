// S249 rehearsal wiring: "Create Gmail draft instead" reaches the isolated rehearsal's mail
// stand-in. Only when this process is the rehearsal (a resolved stand-in beside the Demo descriptor
// with Demo data) is the Demo-owned mail client built and the synthetic recipient accepted. With
// the fence closed every refusal is the same text as before, byte for byte. Synthetic values only.
vi.mock("@/lib/firestore/renewal-message-claim", () => ({
  assertCurrentRenewalMessageClaim: vi.fn(async () => undefined),
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => ({ status: "clear" })),
}));

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  rehearsalStandInFor,
  type RehearsalStandIn,
} from "@/lib/environment/rehearsal-stand-in";
import {
  prepareGovernedDraft,
  type GovernedDraftSeams,
} from "@/lib/external-execution/governed-draft-execution";
import { createGmailMailboxClient } from "@/lib/gmail-hub/dependencies";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import {
  assertAuthoritativeRenewalRecipient,
  buildRenewalNoticeDraftAction,
  RENEWAL_NOTICE_DRAFT_ACTION_KEY,
} from "@/lib/lease-renewal/execution/renewal-draft-request";

const STAND_IN: RehearsalStandIn = Object.freeze({ origin: "http://127.0.0.1:41234" });
const MAILBOX = { email: "workflow@pmikcmetro.com", sourceRef: "app:session:u1" };
const actor: AuthenticatedUser = {
  uid: "u1",
  email: MAILBOX.email,
  hd: "pmikcmetro.com",
  role: "Editor",
};

// The refusal text the guard and the fence gave before S249, copied from the committed code.
const NON_ROUTABLE =
  "Refusing to create a real draft for a non-routable (sample/test) recipient address.";
const NON_ROUTABLE_CC =
  "Refusing to create a real draft for a non-routable (sample/test) Cc recipient address.";
const NO_SOURCE =
  "Refusing to create a real draft without an authoritative recipient source.";

function syntheticAction(
  overrides: {
    to?: string;
    sourceRef?: string;
    cc?: { emails: readonly string[]; sourceRefs: readonly string[] };
  } = {},
) {
  return buildRenewalNoticeDraftAction({
    workflowId: "renewal-live:lease-9101",
    actionId: "renewal-notice-draft:tenant:lease-9101",
    channel: "tenant",
    templateRef: "tenant-renewal:v1.0",
    copy: { templateContentHash: "a".repeat(64), envelopeFingerprint: "b".repeat(64) },
    recipient: {
      channel: "tenant",
      to: overrides.to ?? "tenant-9101@example.invalid",
      sourceRef: overrides.sourceRef ?? "rentvine:lease:9101:tenants[0].email",
    },
    ...(overrides.cc ? { cc: overrides.cc } : {}),
    mailbox: MAILBOX,
    subject: "Lease renewal for 101 Sample Place",
    body: "Our reviewed rental analysis suggests $1,420.00 per month.",
    workflowContext: "renewal:lease-9101",
    sourceRefs: ["rentvine:lease:9101"],
  });
}

const asGuarded = (action: ReturnType<typeof syntheticAction>) =>
  ({ ...action, authority: undefined }) as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("S249 the recipient guard with the rehearsal fence", () => {
  it("closed (no stand-in): a synthetic recipient is refused with the same text as before", () => {
    expect(() =>
      assertAuthoritativeRenewalRecipient(asGuarded(syntheticAction())),
    ).toThrow(NON_ROUTABLE);
    expect(() =>
      assertAuthoritativeRenewalRecipient(asGuarded(syntheticAction()), {
        rehearsalStandIn: null,
      }),
    ).toThrow(NON_ROUTABLE);
  });

  it("open (the rehearsal's stand-in): the synthetic recipient is accepted", () => {
    expect(() =>
      assertAuthoritativeRenewalRecipient(asGuarded(syntheticAction()), {
        rehearsalStandIn: STAND_IN,
      }),
    ).not.toThrow();
  });

  it("open: the authoritative-source check still applies", () => {
    expect(() =>
      assertAuthoritativeRenewalRecipient(
        asGuarded(syntheticAction({ sourceRef: "fixture:owner" })),
        { rehearsalStandIn: STAND_IN },
      ),
    ).toThrow(NO_SOURCE);
  });

  it("the stand-in counts only beside the Demo descriptor with Demo data", () => {
    expect(
      rehearsalStandInFor({ environmentKind: "demo", dataContext: "demo" }, STAND_IN),
    ).toBe(STAND_IN);
    for (const descriptor of [
      { environmentKind: "production", dataContext: "live" },
      { environmentKind: "local", dataContext: "live" },
      { environmentKind: "demo", dataContext: "live" },
    ])
      expect(rehearsalStandInFor(descriptor, STAND_IN)).toBeNull();
    expect(
      rehearsalStandInFor({ environmentKind: "demo", dataContext: "demo" }, null),
    ).toBeNull();
  });

  it("closed: a synthetic Cc is refused with the same text as before", () => {
    const action = syntheticAction({
      to: "resident@northend-apts.com",
      cc: {
        emails: ["co-tenant@example.invalid"],
        sourceRefs: ["rentvine:lease:9101:tenants[1].email"],
      },
    });
    expect(String(action.values.cc)).toBe("co-tenant@example.invalid");
    expect(() => assertAuthoritativeRenewalRecipient(asGuarded(action))).toThrow(
      NON_ROUTABLE_CC,
    );
    expect(() =>
      assertAuthoritativeRenewalRecipient(asGuarded(action), {
        rehearsalStandIn: STAND_IN,
      }),
    ).not.toThrow();
  });
});

describe("S249 the governed draft preparation with the rehearsal fence", () => {
  function run(seams: GovernedDraftSeams) {
    const prepare = vi.fn(
      async () => ({ executionId: "e1", previewHash: "p1" }) as never,
    );
    const request = {
      action: syntheticAction() as never,
      definition: LEASE_EXECUTION_DEFINITION_MAP.get(RENEWAL_NOTICE_DRAFT_ACTION_KEY)!,
      createClient: () => {
        throw new Error("preparation never builds a client");
      },
    };
    return {
      prepare,
      promise: prepareGovernedDraft(actor, request, { ...seams, prepare }),
    };
  }

  it("closed: refused before the ledger is written, with the same text as before", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "demo");
    const { prepare, promise } = run({ standIn: null });
    await expect(promise).rejects.toThrow(NON_ROUTABLE);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("closed under Production: a stand-in beside the Production descriptor changes nothing", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    const { prepare, promise } = run({ standIn: STAND_IN });
    await expect(promise).rejects.toThrow(NON_ROUTABLE);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("open: the rehearsal reaches preparation, and the Demo descriptor passes the effect fence", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "demo");
    const { prepare, promise } = run({ standIn: STAND_IN });
    await expect(promise).resolves.toEqual({ executionId: "e1", previewHash: "p1" });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("closed under Demo with a routable recipient: the Live-provider fence still refuses", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "demo");
    const prepare = vi.fn();
    await expect(
      prepareGovernedDraft(
        actor,
        {
          action: syntheticAction({ to: "resident@northend-apts.com" }) as never,
          definition: LEASE_EXECUTION_DEFINITION_MAP.get(
            RENEWAL_NOTICE_DRAFT_ACTION_KEY,
          )!,
          createClient: () => {
            throw new Error("never");
          },
        },
        { standIn: null, prepare: prepare as never },
      ),
    ).rejects.toThrow();
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("S249 the draft mail client", () => {
  it("is the Demo-owned stand-in client only inside the rehearsal; else the descriptor-bound client", () => {
    const demo = { environmentKind: "demo", dataContext: "demo" } as never;
    const production = { environmentKind: "production", dataContext: "live" } as never;
    const standInClient = createGmailMailboxClient(MAILBOX.email, demo, STAND_IN, () => {
      throw new Error("the real client is never constructed in the rehearsal");
    });
    expect(standInClient.subject).toBe(MAILBOX.email);
    // Outside the rehearsal the real client is refused before construction under Demo.
    expect(() =>
      createGmailMailboxClient(MAILBOX.email, demo, null, () => {
        throw new Error("constructed");
      }),
    ).toThrow();
    const construct = vi.fn(() => ({ subject: MAILBOX.email }) as never);
    createGmailMailboxClient(MAILBOX.email, production, STAND_IN, construct);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it("the message route reaches that factory only with a resolved stand-in, and otherwise makes the same descriptor-bound call as before", () => {
    const route = readFileSync(
      "app/api/lease-renewal/message-preparation/route.ts",
      "utf8",
    );
    expect(route).toMatch(
      /const standIn = resolveRehearsalStandIn\(\);\s*return standIn\s*\?\s*createGmailMailboxClient\(\s*subject,\s*requireEnvironmentDescriptor\(\),\s*standIn,?\s*\)\s*:\s*createDescriptorBoundGmailRuntimeClient\(\s*subject,\s*requireEnvironmentDescriptor\(\),?\s*\)/,
    );
  });
});
