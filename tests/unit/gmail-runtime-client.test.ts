import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type { GmailHttpRequest } from "@/lib/gmail-runtime/transport";

function fakeTransport(response: { status: number; body?: unknown }) {
  const calls: GmailHttpRequest[] = [];
  return {
    calls,
    transport: {
      async send(request: GmailHttpRequest) {
        calls.push(request);
        return { status: response.status, json: async () => response.body ?? {} };
      },
    },
  };
}

function decodeRaw(body: string | undefined): string {
  const raw = (JSON.parse(body ?? "{}") as { message: { raw: string } }).message.raw;
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

describe("GmailRuntimeClient.createDraft", () => {
  it("creates an UNSENT draft (drafts endpoint, never /messages/send), preserving DRAFT_BANNER", async () => {
    const { calls, transport } = fakeTransport({ status: 200, body: { id: "draft_1" } });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "test-token",
    });

    const result = await client.createDraft({
      to: "owner@example.com",
      subject: "Renewal notice",
      body: `${DRAFT_BANNER}\n\nHello there`,
    });

    expect(result.draftId).toBe("draft_1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/josiah%40pmikcmetro.com/drafts",
    );
    expect(calls[0].url).not.toContain("/messages/send");
    const decoded = decodeRaw(calls[0].body);
    expect(decoded).toContain(DRAFT_BANNER);
    expect(decoded).toContain("To: owner@example.com");
    expect(decoded).toContain("Subject: Renewal notice");
    expect(decoded).toContain("From: josiah@pmikcmetro.com");
  });

  it("exposes no send capability (createDraft is the only action)", () => {
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport: fakeTransport({ status: 200, body: { id: "d" } }).transport,
      getToken: async () => "t",
    });
    expect((client as unknown as Record<string, unknown>).send).toBeUndefined();
  });

  it("throws with only the HTTP status on a Gmail error, never leaking the token", async () => {
    const { transport } = fakeTransport({ status: 403 });
    const client = new GmailRuntimeClient({
      subject: "josiah@pmikcmetro.com",
      transport,
      getToken: async () => "SECRET-BEARER-TOKEN",
    });

    await expect(
      client.createDraft({ to: "o@example.com", subject: "s", body: "b" }),
    ).rejects.toBeInstanceOf(GmailRuntimeError);

    try {
      await client.createDraft({ to: "o@example.com", subject: "s", body: "b" });
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as GmailRuntimeError).status).toBe(403);
      expect(String(error)).not.toContain("SECRET-BEARER-TOKEN");
    }
  });
});
