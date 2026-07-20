import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { AuthError, type AuthenticatedUser } from "@/lib/auth/session";
import type { TemplateRecord } from "@/lib/firestore/types";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";
import {
  resolveReplyTemplate,
  toReplyTemplate,
} from "@/lib/gmail-inbox-zero/template-store";
import { FakeFirestore } from "../helpers/fake-firestore";

const admin: AuthenticatedUser = {
  uid: "admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const maintenanceScoped: AuthenticatedUser = {
  ...admin,
  uid: "scoped",
  scopes: ["maintenance"],
};

function tpl(overrides: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    id: "tpl-x",
    space_id: "lease-renewals",
    name: "Owner Renewal Follow-Up",
    owner_uid: "owner",
    audience: "Owner",
    channel: "Gmail",
    body: "stored body",
    status: "Approved",
    created_at: "2026-05-27T00:00:00.000Z",
    updated_at: "2026-05-27T00:00:00.000Z",
    ...overrides,
  };
}

function seed(record: TemplateRecord): Firestore {
  const db = new FakeFirestore();
  db.seed(`templates/${record.id}`, record as unknown as Record<string, unknown>);
  return db as unknown as Firestore;
}

describe("gmail reply template store (TMPL-3)", () => {
  it("maps stored TemplateStatus to the Gmail spine's GmailRuleStatus", () => {
    expect(toReplyTemplate(tpl({ status: "Approved" })).status).toBe("Approved");
    expect(toReplyTemplate(tpl({ status: "Draft" })).status).toBe("Proposed");
    expect(toReplyTemplate(tpl({ status: "In Review" })).status).toBe("Proposed");
    expect(toReplyTemplate(tpl({ status: "Deprecated" })).status).toBe("Retired");
  });

  it("resolves an Approved stored template by id with the SERVER-stored body", async () => {
    const db = seed(tpl({ status: "Approved", body: "server body" }));
    const resolved = await resolveReplyTemplate(admin, "tpl-x", db);
    expect(resolved).toMatchObject({
      id: "tpl-x",
      body: "server body",
      status: "Approved",
    });
  });

  it("resolves a non-Approved stored template as non-Approved so the spine will refuse it", async () => {
    const db = seed(tpl({ status: "Draft" }));
    const resolved = await resolveReplyTemplate(admin, "tpl-x", db);
    expect(resolved?.status).toBe("Proposed");
  });

  it("falls back to a server-defined sample pattern when the id is not in the store", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const sample = SAMPLE_REPLY_TEMPLATES[0];
    const resolved = await resolveReplyTemplate(admin, sample.id, db);
    expect(resolved).toMatchObject({ id: sample.id, body: sample.body });
  });

  it("returns null for an id that matches neither the store nor a sample", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    await expect(resolveReplyTemplate(admin, "no-such-id", db)).resolves.toBeNull();
  });

  it("propagates a space-scope denial instead of silently falling back to samples", async () => {
    const db = seed(tpl({ space_id: "lease-renewals", status: "Approved" }));
    await expect(
      resolveReplyTemplate(maintenanceScoped, "tpl-x", db),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("resolves the seeded daily-inbox-triage reply pattern to a body identical to its sample (F-TMPL-2)", async () => {
    const sample = SAMPLE_REPLY_TEMPLATES.find((s) => s.id === "tpl-vendor-ack");
    expect(sample).toBeDefined();
    if (!sample) return;

    // The store seed reuses the sample id + body; once seeded, the route resolves the STORE record
    // (not the fallback), so the resolved body must match the sample byte-for-byte.
    const db = seed(
      tpl({
        id: "tpl-vendor-ack",
        space_id: "daily-inbox-triage",
        name: sample.name,
        status: "Approved",
        body: sample.body,
      }),
    );
    const resolved = await resolveReplyTemplate(admin, "tpl-vendor-ack", db);
    expect(resolved?.status).toBe("Approved");
    expect(resolved?.body).toBe(sample.body);
  });
});
