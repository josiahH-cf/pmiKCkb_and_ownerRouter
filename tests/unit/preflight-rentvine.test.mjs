import { describe, expect, it } from "vitest";
import {
  RENTVINE_DOC_UNKNOWNS,
  RENTVINE_ENV_VARS,
  readRentVineConfig,
  summarizeRentVineReadiness,
} from "../../scripts/preflight-rentvine.mjs";

// Pass an explicit empty localEnv so the host's .env.local never leaks into the result.
const config = (env) => readRentVineConfig(env, {});

const FULL_ENV = {
  [RENTVINE_ENV_VARS.baseUrl]: "https://example.rentvine.test/api",
  [RENTVINE_ENV_VARS.apiKey]: "fixture-key",
  [RENTVINE_ENV_VARS.apiSecret]: "fixture-secret",
};

describe("readRentVineConfig", () => {
  it("reports env_configured when all three vars are set", () => {
    const result = config(FULL_ENV);

    expect(result.env_configured).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("lists every missing var when nothing is set", () => {
    const result = config({});

    expect(result.env_configured).toBe(false);
    expect(result.missing).toEqual([
      RENTVINE_ENV_VARS.baseUrl,
      RENTVINE_ENV_VARS.apiKey,
      RENTVINE_ENV_VARS.apiSecret,
    ]);
  });

  it("reports the base URL and secret as still missing when only the key is set", () => {
    const result = config({ [RENTVINE_ENV_VARS.apiKey]: "fixture-key" });

    expect(result.api_key_set).toBe(true);
    expect(result.missing).toEqual([
      RENTVINE_ENV_VARS.baseUrl,
      RENTVINE_ENV_VARS.apiSecret,
    ]);
  });

  it("never exposes the secret values themselves, only presence booleans", () => {
    const result = config(FULL_ENV);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("fixture-key");
    expect(serialized).not.toContain("fixture-secret");
  });
});

describe("summarizeRentVineReadiness", () => {
  it("stays not-ready until the API-doc unknowns are resolved, even with all env vars set", () => {
    const readiness = summarizeRentVineReadiness(config(FULL_ENV));

    expect(readiness.env_configured).toBe(true);
    expect(readiness.connection_ready).toBe(false);
    expect(readiness.doc_unknowns).toEqual(RENTVINE_DOC_UNKNOWNS);
  });
});
