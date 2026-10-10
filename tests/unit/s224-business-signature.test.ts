import { it, expect } from "vitest";
import { applyBusinessSignature } from "@/lib/gmail-hub/business-signature";
import { plainCommunicationMessage } from "@/lib/gmail-hub/sequence-model";
const profile = {
  uid: "fixture-one",
  email: "one@pmikcmetro.com",
  version: 2,
  profile: {
    name: "Fixture One",
    businessTitle: "Property Manager",
    phone: "",
    hours: "",
    website: "",
    source: "Fixture actual approved contacts",
  },
  updatedAt: "2026-10-09T12:00:00Z",
  updatedBy: "fixture-admin",
};
it("uses only the current sender, keeps authored wording and is an explicit idempotent draft edit", () => {
  const m = plainCommunicationMessage(
      "Fixture subject",
      "Fixture exact prior authored wording",
    ),
    before = JSON.stringify(m),
    next = applyBusinessSignature(m, profile, profile.email);
  expect(JSON.stringify(m)).toBe(before);
  expect(next.paragraphs[0]).toEqual(m.paragraphs[0]);
  expect(
    next.paragraphs
      .at(-1)
      ?.map((r) => r.text)
      .join(""),
  ).toContain(profile.email);
  expect(applyBusinessSignature(next, profile, profile.email)).toEqual(next);
  expect(() => applyBusinessSignature(m, profile, "other@pmikcmetro.com")).toThrow(
    "own managed sender",
  );
});
