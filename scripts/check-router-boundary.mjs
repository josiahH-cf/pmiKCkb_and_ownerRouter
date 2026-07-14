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
  "docs/facts.md",
  "docs/loop-state.md",
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
  "Workflow Communications",
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
  "Workflow Communications",
  "docs/products/gmail-inbox-zero.md",
  "docs/legacy/owner-router-separate-repo.md",
]);

assertIncludes("docs/products/gmail-inbox-zero.md", [
  "Workflow Communications Product Lane",
  "workflow communication adapter",
  "No autonomous send",
  "docs/feature-suites/gmail-live-per-user.md",
  "gmail.readonly",
  "exact-confirmed",
  "docs/legacy/owner-router-artifact-source.md",
]);

const productReadme = assertIncludes("docs/products/README.md", [
  "Workflow-linked Gmail adapter",
]);

if (productReadme.includes("Dan-email-first Gmail workflow")) {
  throw new Error(
    "docs/products/README.md still describes Workflow Communications as a Dan-mailbox product.",
  );
}

const agentsDoc = assertIncludes("AGENTS.md", [
  "docs/autonomous-agent-runner.md",
  "docs/environment-handoff.md",
  "docs/facts.md",
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

// Runner-neutral routing: AGENTS.md is the single source. Claude keeps a compatibility
// pointer, and Codex reads the shared router directly with no tracked harness config.
// Adding a new runner means documenting its pointer here, not moving rules into a
// runner-specific file.
assertIncludes(
  "AGENTS.md",
  [
    "Per-Runner Pointers",
    "runner-neutral",
    "CLAUDE.md",
    "no repo-tracked harness config",
  ],
  "AGENTS.md per-runner routing",
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
  /https:\/\/mail\.google\.com\//,
];

const GMAIL_API_RUNTIME_ALLOWLIST = new Set([
  join(root, "lib", "gmail-runtime", "client.ts"),
  join(root, "lib", "notifications", "approval.ts"),
]);
const GMAIL_PER_USER_SCOPE_MODULE_ALLOWLIST = new Set([
  join(root, "lib", "gmail-runtime", "client.ts"),
  join(root, "lib", "gmail-runtime", "dwd-token.ts"),
  join(root, "lib", "gmail-runtime", "scopes.ts"),
]);
const GMAIL_READ_SCOPE_METADATA_ALLOWLIST = new Set([
  join(root, "lib", "integrations", "action-registry-seed.ts"),
]);
const GMAIL_MODIFY_METADATA_ALLOWLIST = GMAIL_READ_SCOPE_METADATA_ALLOWLIST;

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

    if (
      /gmail\.googleapis\.com\/gmail\/v1/.test(text) &&
      !GMAIL_API_RUNTIME_ALLOWLIST.has(fullPath)
    ) {
      throw new Error(`Gmail API path escaped the approved runtime client: ${fullPath}`);
    }

    if (
      /GMAIL_(?:READONLY|COMPOSE)_SCOPE/.test(text) &&
      !GMAIL_PER_USER_SCOPE_MODULE_ALLOWLIST.has(fullPath)
    ) {
      throw new Error(
        `Per-user Gmail scope escaped the approved runtime modules: ${fullPath}`,
      );
    }

    if (
      text.includes("https://www.googleapis.com/auth/gmail.readonly") &&
      !GMAIL_READ_SCOPE_METADATA_ALLOWLIST.has(fullPath)
    ) {
      throw new Error(
        `Gmail readonly scope literal escaped registry metadata: ${fullPath}`,
      );
    }

    if (/gmail\.modify/.test(text) && !GMAIL_MODIFY_METADATA_ALLOWLIST.has(fullPath)) {
      throw new Error(
        `Gmail modify scope escaped disabled registry metadata: ${fullPath}`,
      );
    }
  }
}

for (const runtimeRoot of runtimeRoots) {
  walk(join(root, runtimeRoot));
}

console.log("Router boundary check passed.");
