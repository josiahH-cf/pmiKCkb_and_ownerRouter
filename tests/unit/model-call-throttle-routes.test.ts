import { afterEach, describe, expect, it } from "vitest";
import { POST as askPost } from "@/app/api/ask/route";
import { POST as classifyPost } from "@/app/api/processes/classify/route";
import {
  askModelRateLimiter,
  classifyModelRateLimiter,
} from "@/lib/api/model-call-throttle";
import { setAuthResolverForTest } from "@/lib/auth/session";

// LR-05: the two cost-bearing MODEL routes (Ask + classify) enforce a per-user throttle so one caller
// cannot drive unbounded paid model invocation. Each test drains the caller's bucket directly (no HTTP /
// model work) and asserts the route short-circuits to 429 BEFORE any cost-bearing call.
afterEach(() => {
  setAuthResolverForTest(null);
  askModelRateLimiter.reset();
  classifyModelRateLimiter.reset();
});

function asEditor(uid = "throttle-editor") {
  setAuthResolverForTest(() => ({
    uid,
    email: `${uid}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role: "Editor",
  }));
  return uid;
}

function askRequest() {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question: "What is the renewal process?",
      draft_enabled: false,
    }),
  });
}

function classifyRequest() {
  return new Request("http://localhost/api/processes/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "start a lease renewal" }),
  });
}

describe("per-user model-call throttle (LR-05)", () => {
  it("returns 429 from /api/ask once the caller's model-call budget is exhausted", async () => {
    const uid = asEditor();
    const now = Date.now();
    // Drain the caller's bucket (capacity 15) without any HTTP or model work.
    for (let i = 0; i < 25; i += 1) askModelRateLimiter.check(uid, now);

    const response = await askPost(askRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error_type: "AskRateLimited",
    });
  });

  it("returns 429 from /api/processes/classify once the caller's model-call budget is exhausted", async () => {
    const uid = asEditor();
    const now = Date.now();
    for (let i = 0; i < 25; i += 1) classifyModelRateLimiter.check(uid, now);

    const response = await classifyPost(classifyRequest());

    expect(response.status).toBe(429);
  });
});
