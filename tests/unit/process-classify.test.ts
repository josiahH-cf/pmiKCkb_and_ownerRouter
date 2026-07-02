import { describe, expect, it } from "vitest";

import type { ModelProvider } from "@/lib/llm/model-provider";
import { classifyProcessWithModel } from "@/lib/processes/classify";

// Model-backed process classification (R4 hybrid fallback). Goes through the ModelProvider seam; here
// the provider is stubbed so the test is offline + free. Guards that only a REAL listed id is returned.

const PROCS = [
  { id: "lease-renewal", name: "Lease Renewal" },
  { id: "maintenance-work-order-intake", name: "Maintenance" },
];

function provider(text: string): ModelProvider {
  return {
    async generateText() {
      return { text };
    },
  };
}

describe("classifyProcessWithModel", () => {
  it("returns the model-picked id when it exists in the list", async () => {
    const id = await classifyProcessWithModel({
      question: "renew a lease",
      processes: PROCS,
      provider: provider('{"process_id":"lease-renewal"}'),
      model: "m",
    });
    expect(id).toBe("lease-renewal");
  });

  it("strips code fences around the JSON", async () => {
    const id = await classifyProcessWithModel({
      question: "fix a leak",
      processes: PROCS,
      provider: provider('```json\n{"process_id":"maintenance-work-order-intake"}\n```'),
      model: "m",
    });
    expect(id).toBe("maintenance-work-order-intake");
  });

  it("returns null when the model picks null", async () => {
    const id = await classifyProcessWithModel({
      question: "weather",
      processes: PROCS,
      provider: provider('{"process_id":null}'),
      model: "m",
    });
    expect(id).toBeNull();
  });

  it("rejects an invented id that is not in the list", async () => {
    const id = await classifyProcessWithModel({
      question: "x",
      processes: PROCS,
      provider: provider('{"process_id":"made-up"}'),
      model: "m",
    });
    expect(id).toBeNull();
  });

  it("returns null on unparseable model output", async () => {
    const id = await classifyProcessWithModel({
      question: "x",
      processes: PROCS,
      provider: provider("not json at all"),
      model: "m",
    });
    expect(id).toBeNull();
  });

  it("returns null (and never calls the model) when there are no processes", async () => {
    let called = false;
    const id = await classifyProcessWithModel({
      question: "x",
      processes: [],
      provider: {
        async generateText() {
          called = true;
          return { text: '{"process_id":"lease-renewal"}' };
        },
      },
      model: "m",
    });
    expect(id).toBeNull();
    expect(called).toBe(false);
  });
});
