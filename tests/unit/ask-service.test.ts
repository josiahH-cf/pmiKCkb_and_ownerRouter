import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/ask/service";
import type { AuthenticatedUser } from "@/lib/auth/session";

const user: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin",
};

describe("Ask service", () => {
  it("returns a cited demo answer for Lease Renewals", async () => {
    await expect(
      answerQuestion(user, {
        audience: "Owner",
        channel: "Gmail",
        draft_enabled: true,
        question: "What is the lease renewal workflow?",
        urgency: "Normal",
      }),
    ).resolves.toMatchObject({
      source_state: "Verified Source",
      citations: [expect.objectContaining({ source_id: "demo-lease-renewals-sop" })],
    });
  });

  it("keeps unsupported demo questions in no-source state", async () => {
    await expect(
      answerQuestion(user, {
        audience: "Owner",
        channel: "Gmail",
        draft_enabled: true,
        question: "What exact fee do we charge for an unusual lease break?",
        urgency: "Normal",
      }),
    ).resolves.toMatchObject({
      source_state: "No Reliable Source Found",
      citations: [],
    });
  });
});
