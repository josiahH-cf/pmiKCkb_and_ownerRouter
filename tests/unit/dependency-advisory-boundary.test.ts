import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import fastUri from "fast-uri";
import { Hono } from "hono";
import { Address4, Address6 } from "ip-address";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("I11 patched transitive dependency boundaries", () => {
  it("loads the exact patched releases selected through Next and GenAI/MCP", () => {
    // October 8 audit: Next.js 16.0.0 through 16.3.7 carry six advisories the audit rates high
    // (cache poisoning, draft-mode leakage, image-optimization SSRF, metadata-route and dev-server
    // disclosure); 16.3.8 is the first patched 16.3 release. October 23: GHSA-2464-fhr4-w9xw,
    // GHSA-p3m5-59mp-jv5r and GHSA-673q-mjm6-r5xr affect 16.0.0 through 16.4.0 and have no 16.3
    // patch, so the boundary moves to 16.4.2.
    expect(installedVersion("next")).toBe("16.4.2");
    expect(installedVersion("sharp")).toBe("0.35.5");
    // October 27: GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr and
    // GHSA-333x-w4r6-6crp affect fast-uri 3.0.0 through 3.1.8.
    expect(installedVersion("fast-uri")).toBe("3.1.9");
    // October 27: GHSA-mrhx-c7xc-m3w5 affects zod below 4.6.6 with no 4.2 patch, so the exact pin
    // moves to the 4.6 line. GHSA-27r3-jxmh-p828 affects body-parser below 1.20.9 and 2.x below
    // 2.4.0; express and the MCP SDK's express take the in-range patches.
    expect(installedVersion("zod")).toBe("4.6.7");
    expect(installedVersion("body-parser")).toBe("1.20.9");
    expect(
      versionAbove(
        dirname(
          createRequire(
            require.resolve("@modelcontextprotocol/sdk/package.json"),
          ).resolve("body-parser"),
        ),
        "body-parser",
      ),
    ).toBe("2.4.0");
    // October 20: GHSA-5r4p-p66f-jhc7 is patched in 4.13.11.
    expect(installedVersion("hono")).toBe("4.13.11");
    // October 23: GHSA-rxp7-6hxx-x8q5 affects ip-address through 10.7.3.
    expect(installedVersion("ip-address")).toBe("10.7.4");
    expect(installedVersion("nanoid")).toBe("3.3.18");
    // October 28: GHSA-6pq8-jhm2-2vcw affects qs 6.7.0 through 6.16.0 (express and the MCP SDK's
    // express/body-parser); the override selects the first patched release.
    expect(installedVersion("qs")).toBe("6.16.1");
    // October 6 audit: the MCP SDK (an optional GenAI peer), its express proxy-addr and postcss's
    // source-map-js are pinned to their first patched releases or later.
    expect(installedVersion("proxy-addr")).toBe("2.0.8");
    expect(installedVersion("source-map-js")).toBe("1.2.2");
    expect(manifestVersion("@modelcontextprotocol/sdk")).toBe("1.32.1");
    expect(typeof GoogleGenAI).toBe("function");
    expect(nanoid(12)).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("round-trips a bounded synthetic AVIF through the patched native image stack", async () => {
    const encoded = await sharp(Buffer.alloc(4 * 4 * 3, 127), {
      raw: { width: 4, height: 4, channels: 3 },
    })
      .avif()
      .toBuffer();
    const decoded = await sharp(encoded).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 4, height: 4, channels: 3 });
    expect(decoded.data).toHaveLength(4 * 4 * 3);
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

/** For a package whose exports expose no root entry, walk up from an exported file instead. */
function manifestVersion(packageName: string): string {
  return versionAbove(
    dirname(require.resolve(`${packageName}/package.json`)),
    packageName,
  );
}

function installedVersion(packageName: string): string {
  return versionAbove(dirname(require.resolve(packageName)), packageName);
}

function versionAbove(start: string, packageName: string): string {
  let directory = start;
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
