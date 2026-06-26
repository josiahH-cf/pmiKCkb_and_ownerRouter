// Free, opt-in proof that the model-provider seam (lib/llm/model-provider.ts) runs the Ask answer
// path through a LOCAL model at ZERO cloud spend: generation is local and retrieval is an injected
// grounding fixture (never Vertex AI Search, which bills). DRY by default; --live makes the single
// local call. Skips cleanly (exit 0) when no local endpoint is configured — CI has no local model.
//
//   npm run smoke:ask-local                                   # dry: prints what it would do
//   npm run smoke:ask-local -- --live                         # one real call to the local endpoint
//   npm run smoke:ask-local -- --live --fixture=path/to/grounding.json
//
// LOCAL_MODEL_BASE_URL must be a localhost / in-boundary OpenAI-compatible endpoint (Ollama, LM
// Studio, llama.cpp, vLLM): real grounding data flows to the model, so it stays inside the
// pmikcmetro.com boundary. Output is shape-only (no answer text, which could echo real fixture data).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerQuestion } from "../lib/ask/service";
import { readServerConfig } from "../lib/config/server";
import type { AuthenticatedUser } from "../lib/auth/session";
import type { AskRequest } from "../lib/schemas";
import type {
  GroundedSearchResult,
  RetrievalClient,
} from "../lib/retrieval/vertex-search";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      out[trimmed.slice(0, sep).trim()] = trimmed
        .slice(sep + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

function readArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

// Built-in synthetic grounding (one Approved source → classifies to Verified Source). Pass
// --fixture=<gitignored path> to ground on real in-boundary data instead.
const DEFAULT_GROUNDING: GroundedSearchResult = {
  confidence: 0.9,
  sourceIds: ["smoke-source-1"],
  citations: [
    {
      source_id: "smoke-source-1",
      title: "Renewal SOP (smoke fixture)",
      url: "https://kb.pmikcmetro.com/smoke-source-1",
      excerpt:
        "Lease renewals send a 60-day notice; rent changes follow the approved schedule.",
    },
  ],
  sources: [
    {
      approvalStatus: "Approved",
      citation: {
        source_id: "smoke-source-1",
        title: "Renewal SOP (smoke fixture)",
        url: "https://kb.pmikcmetro.com/smoke-source-1",
        excerpt:
          "Lease renewals send a 60-day notice; rent changes follow the approved schedule.",
      },
      confidence: 0.9,
      driveFileId: "smoke-source-1",
      sourceId: "smoke-source-1",
      spaceId: "lease-renewals",
    },
  ],
};

function loadGrounding(fixturePath: string | undefined): GroundedSearchResult {
  if (!fixturePath) return DEFAULT_GROUNDING;
  return JSON.parse(readFileSync(resolve(fixturePath), "utf8")) as GroundedSearchResult;
}

async function main(): Promise<void> {
  const localEnv = loadEnvLocal();
  const readEnv = (name: string): string | undefined =>
    process.env[name] ?? localEnv[name];

  const baseUrl = readArg("--base-url") ?? readEnv("LOCAL_MODEL_BASE_URL");
  const modelName = readArg("--model") ?? readEnv("LOCAL_MODEL_NAME") ?? "local-model";
  const question = readArg("--question") ?? "What is the lease renewal notice window?";
  const fixturePath = readArg("--fixture");
  const live = hasArg("--live");
  const artifactDir = resolve(readArg("--artifacts") ?? "temp/local-ask-smoke");

  const grounding = loadGrounding(fixturePath);

  if (!live) {
    console.log(
      `Local Ask smoke (DRY). Would POST ${baseUrl ?? "<LOCAL_MODEL_BASE_URL unset>"}/v1/chat/completions as model "${modelName}" for: "${question}".`,
    );
    console.log(
      `Retrieval is an injected ${fixturePath ? "fixture" : "built-in"} grounding (${grounding.sources.length} source(s)); Vertex AI Search is never called (zero cloud spend).`,
    );
    console.log(
      "Pass --live to make the single local call. Set LOCAL_MODEL_BASE_URL to a localhost OpenAI-compatible endpoint.",
    );
    return;
  }

  if (!baseUrl) {
    console.log(
      "Local Ask smoke (LIVE) skipped: LOCAL_MODEL_BASE_URL is not set. Point it at a localhost OpenAI-compatible endpoint (e.g. http://localhost:11434) and re-run.",
    );
    return; // clean skip (exit 0) — CI and fresh checkouts have no local model
  }

  const config = readServerConfig({
    ASK_DEMO_MODE: "false",
    MODEL_PROVIDER: "local",
    LOCAL_MODEL_BASE_URL: baseUrl,
    LOCAL_MODEL_NAME: modelName,
  });

  const retrievalClient: RetrievalClient = {
    async search() {
      return grounding;
    },
  };
  const user: AuthenticatedUser = {
    uid: "smoke-local-ask",
    email: "smoke@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
  };
  const request: AskRequest = {
    audience: "Owner",
    channel: "Gmail",
    draft_enabled: true,
    question,
    space: "lease-renewals",
    urgency: "Normal",
  };

  let response;
  try {
    response = await answerQuestion(user, request, {
      config,
      retrievalClient,
      askLogWriter: { async write() {} },
    });
  } catch (error) {
    console.error(
      `Local Ask smoke failed: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`,
    );
    process.exitCode = 1;
    return;
  }

  const grounded = response.source_state !== "No Reliable Source Found";
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const proof = {
    mode: "live" as const,
    endpoint,
    model: modelName,
    question,
    groundingSources: grounding.sources.length,
    grounded,
    source_state: response.source_state,
    citationCount: response.citations.length,
    handlingStepCount: response.handling_steps.length,
    draftPresent: Boolean(response.draft),
    answerLength: response.answer.length,
  };

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "proof.json"), JSON.stringify(proof, null, 2), "utf8");

  console.log(`Local Ask smoke (LIVE) — model "${modelName}" at ${endpoint}`);
  console.log(
    `Source state: ${response.source_state}; citations: ${response.citations.length}; handling steps: ${response.handling_steps.length}; draft: ${proof.draftPresent ? "present" : "none"}.`,
  );
  console.log(
    `Grounded answer produced: ${grounded ? "yes" : "no"} (answer length ${response.answer.length}).`,
  );
  console.log(
    `Shape-only proof written to ${join(artifactDir, "proof.json")} (gitignored).`,
  );

  if (!grounded) {
    console.warn(
      "The local model did not produce a usable grounded answer (No Reliable Source Found). Check the model and its JSON-mode support.",
    );
    process.exitCode = 1;
  }
}

// Not a top-level await: tsx compiles this .ts as CommonJS, where TLA is unsupported. The pending
// promise keeps the event loop alive until main() settles, so process.exitCode is honored.
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
