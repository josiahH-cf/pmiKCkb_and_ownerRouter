import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "SETUP.md",
  "docs/README.md",
  "docs/spec.md",
  "docs/autonomous-agent-runner.md",
  "docs/facts.md",
  "docs/status.md",
  "docs/loop-state.md",
  "docs/plan.md",
  "docs/temp/README.md",
  "docs/north-star.md",
  "docs/engineering.md",
  "docs/environment-handoff.md",
  "docs/integration-architecture.md",
  "docs/feature-suites/README.md",
  "docs/products/README.md",
  "docs/products/pmi-kc-kb.md",
  "docs/products/lease-renewal-agent.md",
  "docs/products/gmail-inbox-zero.md",
  "docs/client-production-cutover.md",
  "docs/away-mode.md",
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

assertIncludes("docs/products/gmail-inbox-zero.md", [
  "Workflow Communications product lane",
  "workflow communication adapter",
  "No autonomous client-facing send",
  "unsent draft",
  "A human sends from Gmail",
]);

const productReadme = assertIncludes("docs/products/README.md", [
  "Workflow-linked Gmail adapter",
  "not separate Demo products",
]);

if (productReadme.includes("Dan-email-first Gmail workflow")) {
  throw new Error(
    "docs/products/README.md still describes Workflow Communications as a Dan-mailbox product.",
  );
}

const agentsDoc = assertIncludes("AGENTS.md", [
  "Truth precedence",
  "Present production truth",
  "Permanent safety boundaries",
  "Action authority",
  "Protected paths",
  "Documentation hygiene",
  "docs/environment-handoff.md",
  "docs/facts.md",
  "docs/README.md",
  "docs/temp/",
  "CLAUDE.md",
]);

for (const stalePath of [
  "docs/ai-execution-workflow.md",
  "docs/agent-runner/",
  "docs/legacy/",
  "docs/specs/",
]) {
  if (agentsDoc.includes(stalePath)) {
    throw new Error(`AGENTS.md still routes to removed context: ${stalePath}`);
  }
}

assertIncludes(
  "CLAUDE.md",
  ["AGENTS.md", "docs/facts.md", "docs/loop-state.md", "no independent authority"],
  "CLAUDE.md compatibility pointer",
);

// Runner-neutral routing: AGENTS.md is the single source. Claude keeps a compatibility
// pointer, and Codex reads the shared router directly with no tracked harness configuration.
// Adding a new runner means documenting its pointer here, not moving rules into a
// runner-specific file.
assertIncludes(
  "AGENTS.md",
  [
    "Per-runner pointers",
    "runner-neutral",
    "CLAUDE.md",
    "no repo-tracked harness configuration",
  ],
  "AGENTS.md per-runner routing",
);

assertIncludes("README.md", [
  "docs/README.md",
  "docs/facts.md",
  "docs/loop-state.md",
  "docs/environment-handoff.md",
  "Git at `1356918`",
  "Production is explicit Live-only",
]);

assertIncludes("SETUP.md", [
  "Demo + Live-read-only",
  "refuse every durable write and provider effect",
  "Do not run a live RentVine or Sheet write",
]);

assertIncludes("docs/README.md", [
  "Read order",
  "Tool-linked compatibility contracts",
  "Git commit `1356918`",
  "as current context",
]);

assertIncludes("docs/environment-handoff.md", [
  "Production + Live",
  "pmi-kc-app-rmtbh280n-61b78ef991cc",
  "6aea639728efcad70e3e601e7a031c2b35722e08",
  "pmi-kc-app-rmtafuqbg-4e2e4ffe0f48",
  "Sheet write-back",
  "Current rollback",
  "The 2026-08-27 rehearsal switched the predecessor to 100%",
  "Forward restoration",
]);

assertIncludes("docs/autonomous-agent-runner.md", [
  "## Intake",
  "## Plan",
  "## Build",
  "## Verify",
  "## Ship",
  "## Record",
  "## Stop",
  "docs/temp/",
  "zero-traffic candidate",
  "Documentation-only changes",
]);

assertIncludes("docs/integration-architecture.md", [
  "Every provider capability is one exact Action Registry key",
  "All other keys are closed",
  "RentVine write boundary",
  "Sheet boundary",
  "A human sends them from Gmail",
]);

assertIncludes("docs/temp/README.md", [
  "Do not store secrets",
  "not part of the active documentation set",
  "loaded as default context",
  "potentially stale",
]);

assertIncludes("docs/feature-suites/README.md", [
  "only current operating contracts",
  "S64",
  "NOT authorized",
  "authoritative for planning",
]);

assertIncludes("docs/client-production-cutover.md", [
  "Production cutover compatibility contract",
  "docs/environment-handoff.md",
  "Production smoke checklist:",
  "not authorize a deployment",
]);

assertIncludes("docs/away-mode.md", [
  "AWAY_MODE_STATUS: INACTIVE",
  "grants no authority",
  "Current authority and safety live",
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
