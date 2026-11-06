import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../../next.config";

import { helpContentDigest, helpContentFiles } from "@/lib/help/content-digest.mjs";
import { HELP_CHANGELOG } from "@/lib/help/content/changelog";
import { HELP_VERSION, HELP_VERSION_PATTERN } from "@/lib/help/version";
import { HELP_SCENE_MANIFEST } from "@/lib/help/scenes";

// S242 R-S242-4 / ARCH-S242-6 / AC-S242-5: help content cannot change without a new help version and
// a changelog entry. The newest entry records the digest of the content it describes; editing any
// guide, reference, glossary term or scene without a new entry fails here, naming the new digest.

const scratch = mkdtempSync(join(tmpdir(), "s242-help-version-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function versionProblems(
  root: string,
  changelog = HELP_CHANGELOG,
  version = HELP_VERSION,
) {
  const problems: string[] = [];
  const newest = changelog[0];
  if (!newest) return ["The changelog has no entry."];
  if (newest.version !== version)
    problems.push(
      `HELP_VERSION ${version} is not the newest changelog version ${newest.version}.`,
    );
  const digest = helpContentDigest(root);
  if (newest.contentDigest !== digest)
    problems.push(
      `Help content changed without a new HELP_VERSION and changelog entry; add an entry with contentDigest ${digest}.`,
    );
  return problems;
}

describe("S242 help version and changelog", () => {
  it("keeps every previous V2.0 picture link on its current same-named picture", async () => {
    const rules = await nextConfig.redirects!();
    for (const scene of HELP_SCENE_MANIFEST.scenes) {
      const oldPath = `/help/V2.0/${scene.id}.png`;
      const matches = rules.flatMap((rule) => {
        const params = getPathMatch(rule.source)(oldPath);
        return params ? [{ rule, params }] : [];
      });
      expect(matches, oldPath).toHaveLength(1);
      const { rule, params } = matches[0];
      expect(rule.destination.replace(":image", String(params.image))).toBe(
        `/help/${HELP_VERSION}/${scene.id}.png`,
      );
      expect(rule.permanent).toBe(false);
    }
    for (const path of ["/help/renewals/work-a-renewal", "/__/auth/handler"])
      expect(rules.some((rule) => getPathMatch(rule.source)(path))).toBe(false);
  });

  it("HELP_VERSION is V<major>.<minor> and matches the newest What changed entry", () => {
    expect(HELP_VERSION).toMatch(HELP_VERSION_PATTERN);
    expect(HELP_CHANGELOG[0].version).toBe(HELP_VERSION);
    expect(HELP_CHANGELOG[HELP_CHANGELOG.length - 1]).toMatchObject({
      version: "V1.0",
      summary: "V1.0, first release of the staff help hub",
    });
  });

  it("the newest entry records the digest of the shipped content", () => {
    expect(helpContentFiles().length).toBeGreaterThan(10);
    expect(versionProblems(process.cwd())).toEqual([]);
  });

  it("AC-S242-5: editing a guide without a version or changelog change fails; a new entry passes", () => {
    cpSync(join(process.cwd(), "lib/help/content"), join(scratch, "lib/help/content"), {
      recursive: true,
    });
    const file = join(scratch, "lib/help/content/guides/search.ts");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n// edited guide text\n`);
    const problems = versionProblems(scratch);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Help content changed without a new HELP_VERSION/);

    const digest = helpContentDigest(scratch);
    const bumped = [
      {
        version: "V1.1",
        date: "2026-11-05",
        summary: "V1.1, search guide wording",
        affectedGuides: ["search"],
        contentDigest: digest,
      },
      ...HELP_CHANGELOG,
    ];
    expect(versionProblems(scratch, bumped, "V1.1")).toEqual([]);
  });
});
