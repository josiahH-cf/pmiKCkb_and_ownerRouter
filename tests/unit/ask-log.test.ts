import { describe, expect, it } from "vitest";
import { FirestoreAskLogWriter } from "@/lib/firestore/ask-logs";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

describe("Ask log writer", () => {
  it("persists final Ask responses without prompt payloads", async () => {
    const db = new FakeFirestore();
    const writer = new FirestoreAskLogWriter(db as never);

    await writer.write({
      groundingSourceIds: ["source-1"],
      request: {
        audience: "Owner",
        channel: "Gmail",
        draft_enabled: true,
        question: "What is the renewal process?",
        urgency: "Normal",
      },
      response: {
        answer: "Use the approved renewal SOP.",
        citations: [
          {
            source_id: "source-1",
            title: "SOP",
            url: "https://example.com/source-1",
          },
        ],
        draft: "",
        handling_steps: ["Open the SOP."],
        question: "What is the renewal process?",
        source_state: "Verified Source",
      },
      user: {
        email: "admin@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Admin",
        uid: "admin",
      },
    });

    const records = Array.from(db.store.entries()).filter(([path]) =>
      path.startsWith("ask_logs/"),
    );

    expect(records).toHaveLength(1);
    expect(records[0][1]).toMatchObject({
      answer: "Use the approved renewal SOP.",
      grounding_source_ids: ["source-1"],
      question: "What is the renewal process?",
      source_state: "Verified Source",
      user_uid: "admin",
    });
    expect(records[0][1]).not.toHaveProperty("prompt");
  });
});
