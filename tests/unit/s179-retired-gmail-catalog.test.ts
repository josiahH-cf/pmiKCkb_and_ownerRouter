import { describe, expect, it } from "vitest";
import { buildConnectionView } from "@/lib/connections/connection-status";
describe("S179 current setup catalog", () => {
  it("keeps supported workflow Gmail and removes the obsolete sender setup entry", () => {
    const view = buildConnectionView({});
    expect(view.items.some((item) => item.def.id === "gmail_sender")).toBe(false);
    expect(view.items.some((item) => item.def.id === "gmail_inbox")).toBe(true);
    expect(view.summary.total).toBe(view.items.length);
  });
});
