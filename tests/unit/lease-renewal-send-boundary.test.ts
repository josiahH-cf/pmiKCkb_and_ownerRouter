import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// LR-05: the lease-renewal draft-only boundary is enforced by CONSTRUCTION, not by an absent scope.
// gmail.compose is itself send-capable (it can create AND send drafts), so the guarantee is that NO
// lease-renewal module ever imports the concrete send-capable GmailRuntimeClient or calls sendMessage —
// the live provider talks only to a structural createDraft-only interface. This test scans the
// lease-renewal source (comments stripped) and fails if that invariant is broken, so the boundary cannot
// silently regress into a convention that a future edit erodes.

const ROOT = join(process.cwd(), "lib", "lease-renewal");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(full) && !/\.(test|spec)\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

// Strip block comments and `//` line comments (skipping the `//` in a URL scheme) so a comment mention of
// sendMessage never trips the gate while a real call always does.
function stripComments(text: string): string {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length - 1; i += 1) {
        if (line[i] === "/" && line[i + 1] === "/" && line[i - 1] !== ":") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

describe("lease-renewal send boundary (LR-05)", () => {
  const files = sourceFiles(ROOT);

  it("scans the lease-renewal source tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never imports the concrete send-capable Gmail client or calls sendMessage", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (/from\s+["']@\/lib\/gmail-runtime\/client["']/.test(code)) {
        offenders.push(`${rel}: imports @/lib/gmail-runtime/client`);
      }
      if (/\bsendMessage\b/.test(code)) {
        offenders.push(`${rel}: references sendMessage`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
