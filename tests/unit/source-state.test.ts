import { describe, expect, it } from "vitest";
import { classifyGrounding, noReliableSourceResponse } from "@/lib/source-state";

describe("source-state classification", () => {
  it("stops when no grounding documents are present", () => {
    expect(classifyGrounding({ supportingDocumentCount: 0 })).toBe(
      "No Reliable Source Found",
    );
  });

  it("detects placeholders before treating a source as partial", () => {
    expect(
      classifyGrounding({ supportingDocumentCount: 2, hasOpenPlaceholder: true }),
    ).toBe("Open Placeholder");
  });

  it("detects conflicts before verified source responses", () => {
    expect(classifyGrounding({ supportingDocumentCount: 3, hasConflict: true })).toBe(
      "Conflict Found",
    );
  });

  it("requires multiple supporting documents for verified source", () => {
    expect(classifyGrounding({ supportingDocumentCount: 1 })).toBe("Partial Source");
    expect(classifyGrounding({ supportingDocumentCount: 2 })).toBe("Verified Source");
  });

  it("uses a no-source response in the empty scaffold state", () => {
    expect(noReliableSourceResponse("Who approves renewals?").source_state).toBe(
      "No Reliable Source Found",
    );
  });
});
