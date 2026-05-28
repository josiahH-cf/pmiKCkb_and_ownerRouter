import { describe, expect, it } from "vitest";
import {
  CreatePlaceholderInputSchema,
  CreateSopInputSchema,
  CreateToolInputSchema,
  UpdateSopInputSchema,
} from "@/lib/firestore/schemas";

describe("Firestore editable schemas", () => {
  it("defaults SOPs to draft editable records", () => {
    const parsed = CreateSopInputSchema.parse({
      body_md: "# SOP: Lease Renewals",
      owner_uid: "owner-uid",
      title: "Lease Renewals",
    });

    expect(parsed).toMatchObject({
      sensitivity: "Low",
      source_state_hint: "Bailey Placeholder",
      status: "Draft",
    });
  });

  it("allows sparse SOP patches while rejecting empty strings for real fields", () => {
    expect(UpdateSopInputSchema.parse({ status: "In Review" })).toEqual({
      status: "In Review",
    });
    expect(() => UpdateSopInputSchema.parse({ title: "" })).toThrow();
  });

  it("validates real tool URLs instead of accepting invented link text", () => {
    expect(() =>
      CreateToolInputSchema.parse({
        name: "RentVine",
        primary_owner_uid: "owner-uid",
        purpose: "Property management",
        url: "RentVine",
      }),
    ).toThrow();
  });

  it("requires ISO dates for placeholder due dates", () => {
    expect(
      CreatePlaceholderInputSchema.parse({
        due_date: "2026-06-01",
        missing_detail: "Confirm renewal timing.",
        owner_uid: "owner-uid",
      }),
    ).toMatchObject({
      due_date: "2026-06-01",
      priority: "P1",
      status: "Open",
    });
    expect(() =>
      CreatePlaceholderInputSchema.parse({
        due_date: "next week",
        missing_detail: "Confirm renewal timing.",
        owner_uid: "owner-uid",
      }),
    ).toThrow();
  });
});
