import { describe, expect, it } from "vitest";
import { interpretDeterministically } from "@/lib/assistant/interpret";
import { TEST_NOW } from "@/tests/helpers/operational-context-fake";
import { AskRequestSchema } from "@/lib/schemas";

describe("S178 conservative identity questions", () => {
  it.each(["Li", "王"])(
    "the existing question schema admits the short identity %s",
    (question) => {
      expect(AskRequestSchema.safeParse({ question, space: "all" }).success).toBe(true);
      expect(interpretDeterministically(question, null, TEST_NOW)).toMatchObject({
        kind: "operational",
        subjects: ["leases"],
        filters: { includeClosed: true },
      });
      expect(AskRequestSchema.safeParse({ question: " ", space: "all" }).success).toBe(
        false,
      );
    },
  );
  it.each(["Jane Doe", "jane doe", "Acme Properties", "123 Sample Street"])(
    "recognizes the bare lookup %s without the default renewal window",
    (question) => {
      const plan = interpretDeterministically(question, null, TEST_NOW);
      expect(plan).toMatchObject({
        kind: "operational",
        subjects: ["leases"],
        filters: { includeClosed: true },
        followUp: { usePrevious: false },
      });
      expect(plan.filters.people.length > 0 || plan.filters.text !== null).toBe(true);
    },
  );
  it("a related-party lookup also includes history unless an explicit constraint limits it", () => {
    const plan = interpretDeterministically("leases for owner Jane Doe", null, TEST_NOW);
    expect(plan.filters).toMatchObject({
      people: ["Jane Doe"],
      peopleMatch: "related",
      includeClosed: true,
    });
    expect(
      interpretDeterministically("leases for owner Jane Doe next month", null, TEST_NOW)
        .filters.range?.preset,
    ).toBe("next_month");
  });
  it.each([
    "How do I collect late fees?",
    "send a message",
    "delete records",
    "What is the weather?",
    "Why?",
    "now next month",
  ])("keeps non-identity intent conservative: %s", (question) => {
    const plan = interpretDeterministically(question, null, TEST_NOW);
    expect(plan.filters.people).toEqual([]);
  });
});
