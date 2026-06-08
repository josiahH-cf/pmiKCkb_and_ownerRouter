import { describe, expect, it } from "vitest";
import {
  extractInternalDocLinks,
  findMissingDocLinks,
  findSecretMatches,
  isOversized,
  parseJsonContent,
  resolveDocLinkCandidates,
} from "../../scripts/check-falsification-preflight.mjs";

// Secret-shaped literals are assembled by concatenation so this test file never contains
// a contiguous token that the preflight would itself flag.
const fakeAwsKey = "AKIA" + "ABCDEFGHIJKLMNOP";
const fakeCredentialLine = "API Key" + "0123456789abcdef0123456789abcdef";
const fakePrivateKey = "-----BEGIN " + "RSA PRIVATE KEY-----";

describe("findSecretMatches", () => {
  it("detects an AWS access key id", () => {
    const findings = findSecretMatches(`token = ${fakeAwsKey}`);
    expect(findings.map((finding) => finding.label)).toContain("AWS access key id");
  });

  it("detects a credential whose token is concatenated directly to the label", () => {
    const findings = findSecretMatches(`RentVine ${fakeCredentialLine} end`);
    expect(findings.map((finding) => finding.label)).toContain("credential assignment");
  });

  it("detects a private key block", () => {
    const findings = findSecretMatches(`${fakePrivateKey}\nMIIB...`);
    expect(findings.map((finding) => finding.label)).toContain("private key block");
  });

  it("does not flag bare hex document or data-store ids", () => {
    const text = [
      "Imported document id 9de7f0d4bd8630e7a73f3cddbe752289 for retrieval.",
      "Data store kb-lease-renewals_1780046781160 is active.",
      "Use the API key from docs/google-setup.md before live smoke.",
    ].join("\n");
    expect(findSecretMatches(text)).toHaveLength(0);
  });
});

describe("isOversized", () => {
  it("flags files above the limit", () => {
    expect(isOversized(400 * 1024, "docs/example.md")).toBe(true);
  });

  it("keeps files at or below the limit", () => {
    expect(isOversized(100, "docs/example.md")).toBe(false);
  });

  it("allowlists the npm lockfile by basename", () => {
    expect(isOversized(700 * 1024, "package-lock.json")).toBe(false);
  });
});

describe("parseJsonContent", () => {
  it("accepts valid JSON", () => {
    expect(parseJsonContent('{ "a": 1 }').ok).toBe(true);
  });

  it("rejects invalid JSON and reports an error", () => {
    const result = parseJsonContent("{ not valid json }");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("doc link checks", () => {
  it("extracts only repo-internal markdown links", () => {
    const markdown =
      "[a](docs/status.md) [b](https://example.com) [c](#section) [d](other.md)";
    expect(extractInternalDocLinks(markdown)).toEqual(["docs/status.md", "other.md"]);
  });

  it("accepts a root-relative target written inside a docs file", () => {
    const exists = (path) => path === "docs/status.md";
    const missing = findMissingDocLinks(
      "docs/loop-state.md",
      "[s](docs/status.md)",
      exists,
    );
    expect(missing).toHaveLength(0);
  });

  it("accepts a sibling-relative target", () => {
    const exists = (path) => path === "docs/autonomous-agent-runner.md";
    const missing = findMissingDocLinks(
      "docs/loop-state.md",
      "[r](autonomous-agent-runner.md)",
      exists,
    );
    expect(missing).toHaveLength(0);
  });

  it("flags a link whose target does not exist under any resolution", () => {
    const missing = findMissingDocLinks(
      "docs/loop-state.md",
      "[x](nope.md)",
      () => false,
    );
    expect(missing.map((entry) => entry.target)).toEqual(["nope.md"]);
  });

  it("resolves both markdown-relative and root-relative candidates", () => {
    expect(resolveDocLinkCandidates("docs/loop-state.md", "docs/status.md")).toEqual([
      "docs/docs/status.md",
      "docs/status.md",
    ]);
  });
});
