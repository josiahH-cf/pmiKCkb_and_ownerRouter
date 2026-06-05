import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/spec.md",
  "docs/specs/spec-1-technical-spec.md",
  "docs/specs/spec-2-technical-spec.md",
  "docs/specs/spec-3-operating-north-star-spec.md",
  "docs/specs/spec-4-implementation-meta-implementation-spec.md",
  "docs/autonomous-agent-runner.md",
  "docs/autonomous-feature-cycle-packet-template.md",
  "docs/temp/README.md",
  "docs/legacy/owner-router-artifact-source.md",
  "docs/north-star.md",
  "docs/products/pmi-kc-kb.md",
  "docs/products/lease-renewal-agent.md",
  "docs/products/gmail-inbox-zero.md",
  "docs/router-repo.md",
  "docs/legacy/owner-router-separate-repo.md",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

function assertIncludes(file, expected, label = file) {
  const text = readFileSync(join(root, file), "utf8");
  for (const item of expected) {
    if (!text.includes(item)) {
      throw new Error(`${label} is missing: ${item}`);
    }
  }
  return text;
}

const constants = readFileSync(join(root, "lib/constants.ts"), "utf8");
for (const expected of [
  "PMI KC KB",
  "Lease Renewal Agent",
  "Gmail Inbox 0",
  "Owner Router",
  "Owner Router - PMI KC Metro",
  "Draft — Review before sending",
  "Needs Verification: <fact>",
]) {
  if (!constants.includes(expected)) {
    throw new Error(`Missing shared vocabulary constant: ${expected}`);
  }
}

assertIncludes("docs/router-repo.md", [
  "Superseded",
  "Gmail Inbox 0",
  "docs/products/gmail-inbox-zero.md",
  "docs/legacy/owner-router-separate-repo.md",
]);

assertIncludes("docs/products/gmail-inbox-zero.md", [
  "Dan's Gmail",
  "Human send",
  "No autonomous send",
  "No Gmail draft creation",
  "docs/legacy/owner-router-artifact-source.md",
]);

const productReadme = assertIncludes("docs/products/README.md", [
  "Dan-email-first Gmail workflow",
]);

if (productReadme.includes("Owner-email-first Gmail workflow")) {
  throw new Error(
    "docs/products/README.md still describes Gmail Inbox 0 as owner-email-first.",
  );
}

const agentsDoc = assertIncludes("AGENTS.md", [
  "docs/autonomous-agent-runner.md",
  "docs/environment-handoff.md",
  "docs/legacy/owner-router-artifact-source.md",
  "docs/temp/",
  "CLAUDE.md",
]);

if (
  agentsDoc.includes(
    "Autonomous feature-cycle runner  | `docs/ai-execution-workflow.md`, `docs/agent-runner/`",
  )
) {
  throw new Error("AGENTS.md still routes autonomous cycles to the prompt pack.");
}

assertIncludes(
  "CLAUDE.md",
  ["AGENTS.md", "docs/autonomous-agent-runner.md"],
  "CLAUDE.md compatibility pointer",
);

assertIncludes("README.md", [
  "docs/autonomous-agent-runner.md",
  "docs/environment-handoff.md",
  "docs/autonomous-feature-cycle-packet-template.md",
  "docs/legacy/owner-router-artifact-source.md",
  "docs/temp/",
]);

assertIncludes("docs/ai-execution-workflow.md", [
  "docs/autonomous-agent-runner.md",
  "docs/temp/",
  "docs/autonomous-feature-cycle-packet-template.md",
]);

assertIncludes("docs/implement.md", ["docs/autonomous-agent-runner.md", "docs/temp/"]);

assertIncludes("docs/environment-handoff.md", [
  "Do not put secrets",
  "Non-Secret Source Artifact Registry",
  "C:\\Users\\josia\\Documents\\github-windows\\pmi-kc-owner-router",
  "Environment Registry",
  "Key And Secret Ownership",
  "Manual Setup And Web-App Testing",
  "Handoff Checklist",
]);

assertIncludes("docs/autonomous-agent-runner.md", [
  "let's plan the next feature run cycle",
  "docs/temp/",
  "docs/environment-handoff.md",
  "docs/legacy/owner-router-artifact-source.md",
  "End-State First Planning",
  "Approval Gates",
  "Secrets And Environments",
  "Unattended Implementation Loop",
  "Commit Queue",
  "Stale Context Retirement",
  "Final Handoff",
]);

assertIncludes("docs/legacy/owner-router-artifact-source.md", [
  "C:\\Users\\josia\\Documents\\github-windows\\pmi-kc-owner-router",
  "source material, not active governance",
  "The active product lane is Gmail Inbox 0",
  "Do not revive the separate Owner Router product direction",
]);

assertIncludes("docs/temp/README.md", [
  "Do not store secrets",
  "Promote durable decisions",
  "docs/autonomous-agent-runner.md",
]);

const runtimeRoots = ["app", "components", "lib"];
const forbiddenRuntimePatterns = [
  /Owner Router \/ [A-Za-z]/,
  /gmail\.modify/,
  /gmail\.readonly/,
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!/\.(ts|tsx|css)$/.test(fullPath)) {
      continue;
    }

    const text = readFileSync(fullPath, "utf8");
    for (const pattern of forbiddenRuntimePatterns) {
      if (pattern.test(text)) {
        throw new Error(`Forbidden Router runtime pattern in ${fullPath}: ${pattern}`);
      }
    }
  }
}

for (const runtimeRoot of runtimeRoots) {
  walk(join(root, runtimeRoot));
}

console.log("Router boundary check passed.");
