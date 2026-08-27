import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import fastUri from "fast-uri";
import { Hono } from "hono";
import { Address4, Address6 } from "ip-address";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("I11 patched transitive dependency boundaries", () => {
  it("loads the exact patched releases selected through Next and GenAI/MCP", () => {
    expect(installedVersion("fast-uri")).toBe("3.1.5");
    expect(installedVersion("hono")).toBe("4.12.34");
    expect(installedVersion("ip-address")).toBe("10.3.1");
    expect(installedVersion("nanoid")).toBe("3.3.18");
    expect(typeof GoogleGenAI).toBe("function");
    expect(nanoid(12)).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("retains strict URI validation and rejects the patched host-confusion shape", () => {
    const parsed = fastUri.parse("https:\\\\untrusted.example/path");
    expect(parsed.error).toMatch(/backslash|must have a host/i);
    const validate = new Ajv().compile({
      type: "object",
      additionalProperties: false,
      required: ["uri"],
      properties: { uri: { type: "string", minLength: 1 } },
    });
    expect(validate({ uri: "https://managed.example/path" })).toBe(true);
    expect(validate({ uri: "", endpoint: "caller-selected" })).toBe(false);
  });

  it("classifies CIDR-suffixed loopback targets and keeps Hono request isolation usable", async () => {
    expect(new Address4("127.0.0.1/0").isLoopback()).toBe(true);
    expect(new Address6("::ffff:127.0.0.1/0").isLoopback()).toBe(true);
    const app = new Hono();
    app.get("/identity", (context) =>
      context.json({ request: context.req.header("x-request") }),
    );
    await expect(
      (await app.request("/identity", { headers: { "x-request": "second" } })).json(),
    ).resolves.toEqual({ request: "second" });
  });
});

function installedVersion(packageName: string): string {
  let directory = dirname(require.resolve(packageName));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      ) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) return manifest.version;
    } catch {
      // Continue upward until the resolved package root is found.
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Could not resolve installed package metadata for ${packageName}.`);
}
