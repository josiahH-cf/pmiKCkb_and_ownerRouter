import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CHEAP_LIVE_MODEL,
  CHEAP_LIVE_SPACE_ID,
  PRO_MODEL,
  readJsonMap,
  readLocalEnv,
} from "./check-live-cost.mjs";

// Single source of truth for the cloud budget ceiling. The communicated cap is $10 total
// (see docs/budget-and-cost-policy.md). Keep this constant in sync with that doc.
export const BUDGET_CAP_USD = 10;

// The reversible away-mode overlay lives in this doc. When its machine-readable marker is
// ACTIVE, the guard keeps expensive or externally visible overrides blocked while still
// allowing bounded migration/setup work under the $10 cap. See docs/away-mode.md.
export const AWAY_MODE_DOC = "docs/away-mode.md";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Read the cost-relevant posture from the environment and ignored `.env.local`. This is a
 * read-only check; it never mutates state and never performs a network call.
 */
export function readBudgetGuardConfig(env = process.env, localEnv = readLocalEnv()) {
  const readEnv = (name) => env[name] ?? localEnv[name];

  return {
    askDemoMode: readBoolean(readEnv("ASK_DEMO_MODE"), true),
    notificationsEnabled: readBoolean(
      readEnv("KB_APPROVAL_NOTIFICATIONS_ENABLED"),
      false,
    ),
    // Unset answer model defaults to the expensive Pro model, mirroring check-live-cost.mjs
    // so the guard is conservative when the model is not pinned.
    geminiAnswerModel: readString(readEnv("GEMINI_MODEL_ANSWER")) ?? PRO_MODEL,
    // "local" routes generation to a free local model (lib/llm/model-provider.ts); the Gemini
    // model-name check does not apply. Anything else (incl. unset) is treated as Gemini.
    modelProvider: readString(readEnv("MODEL_PROVIDER")) ?? "gemini",
    liveSpaceIds: configuredKeys(
      readJsonMap(
        readEnv("SPACE_VERTEX_DATA_STORE_IDS") ?? "{}",
        "SPACE_VERTEX_DATA_STORE_IDS",
      ),
    ),
    budgetCapUsd: readNumber(readEnv("AUTONOMOUS_BUDGET_CAP_USD"), BUDGET_CAP_USD),
  };
}

/**
 * Evaluate the cost posture. Pure: no filesystem or network access. The current safe
 * defaults (demo mode, or the sanctioned cheap-live path: Flash + single lease-renewals
 * Space + notifications off) pass with no flags. Higher-risk live configurations require
 * the matching --allow-* flag. While remote away mode is active, multi-Space migration
 * can proceed with an explicit flag, but Pro and live notification sends stay blocked.
 */
export function evaluateBudgetGuard(config, options = {}) {
  const errors = [];
  const warnings = [];
  const cap = config.budgetCapUsd ?? BUDGET_CAP_USD;
  const live = !config.askDemoMode;
  const localGenerative = config.modelProvider === "local";
  const awayModeActive = Boolean(options.awayModeActive);

  if (awayModeActive && options.allowPro) {
    errors.push(
      `Away mode is active: --allow-pro is refused. Use ${CHEAP_LIVE_MODEL}; ${PRO_MODEL} is not budget-bounded enough for unattended remote work under the $${cap} cap.`,
    );
  }

  if (awayModeActive && options.allowNotifications) {
    errors.push(
      `Away mode is active: --allow-notifications is refused. Live notification sends are externally visible and require a separate send approval path (see ${AWAY_MODE_DOC}).`,
    );
  }

  if (awayModeActive && options.allowMultipleSpaces) {
    warnings.push(
      `Away mode is active and --allow-multiple-spaces was provided. Continue only for bounded migration/setup work with approved sources, ${CHEAP_LIVE_MODEL}, notifications off, and spend tracking under the $${cap} cap.`,
    );
  }

  if (live) {
    if (localGenerative) {
      warnings.push(
        `Generation is routed to a free local model (MODEL_PROVIDER=local), so the Gemini model check is skipped. Vertex AI Search retrieval and Gmail sends still bill against the $${cap} cap — inject a grounding fixture for zero-spend live-data tests.`,
      );
    } else if (config.geminiAnswerModel !== CHEAP_LIVE_MODEL && !options.allowPro) {
      errors.push(
        `Live mode is on (ASK_DEMO_MODE=false) with GEMINI_MODEL_ANSWER=${config.geminiAnswerModel}. Use ${CHEAP_LIVE_MODEL}, or pass --allow-pro only after explicit budget approval; ${PRO_MODEL} bills more against the $${cap} cap.`,
      );
    }

    const liveSpaceCount = config.liveSpaceIds.length;
    const onlyCheapSpace =
      liveSpaceCount === 1 && config.liveSpaceIds[0] === CHEAP_LIVE_SPACE_ID;

    if (liveSpaceCount > 0 && !onlyCheapSpace && !options.allowMultipleSpaces) {
      errors.push(
        `Live mode has ${liveSpaceCount} configured Space(s) (${config.liveSpaceIds.join(", ")}). The cheap path is the single "${CHEAP_LIVE_SPACE_ID}" Space; pass --allow-multiple-spaces only after explicit budget approval.`,
      );
    }

    if (config.notificationsEnabled && !options.allowNotifications) {
      errors.push(
        "KB approval Gmail notifications are enabled (KB_APPROVAL_NOTIFICATIONS_ENABLED=true). Gmail send is approval-gated; pass --allow-notifications only after explicit approval.",
      );
    }

    if (awayModeActive) {
      warnings.push(
        `Away mode is active and live mode is on (ASK_DEMO_MODE=false). Live Gemini/Vertex calls bill against the $${cap} cap; continue only while the work is bounded, reversible, and tracked in docs/loop-state.md.`,
      );
    }
  } else if (config.notificationsEnabled && !options.allowNotifications) {
    warnings.push(
      "KB_APPROVAL_NOTIFICATIONS_ENABLED=true while ASK_DEMO_MODE=true. No live calls run in demo mode, but disable notifications unless a send was explicitly approved.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    budgetCapUsd: cap,
    posture: live ? "live" : "demo",
    awayModeActive,
  };
}

/**
 * Parse the away-mode status from a docs/away-mode.md body. The overlay carries a
 * machine-readable marker line `AWAY_MODE_STATUS: ACTIVE|INACTIVE`. Returns "ACTIVE",
 * "INACTIVE", or "UNKNOWN" when no marker is present.
 */
export function parseAwayModeStatus(text) {
  const match = /AWAY_MODE_STATUS:\s*(ACTIVE|INACTIVE)/i.exec(String(text));
  return match ? match[1].toUpperCase() : "UNKNOWN";
}

/**
 * Read the away-mode status from disk. A missing or markerless doc is treated as UNKNOWN,
 * which the guard maps to "not active" so deleting docs/away-mode.md safely disables the
 * overlay.
 */
export function readAwayModeStatus(docPath = join(root, AWAY_MODE_DOC)) {
  try {
    return parseAwayModeStatus(readFileSync(docPath, "utf8"));
  } catch {
    return "UNKNOWN";
  }
}

export function parseBudgetGuardArgs(argv = process.argv.slice(2)) {
  return {
    allowMultipleSpaces: argv.includes("--allow-multiple-spaces"),
    allowNotifications: argv.includes("--allow-notifications"),
    allowPro: argv.includes("--allow-pro"),
    json: argv.includes("--json"),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseBudgetGuardArgs(argv);
  const config = readBudgetGuardConfig(env);
  const awayModeActive = readAwayModeStatus() === "ACTIVE";
  const result = evaluateBudgetGuard(config, { ...options, awayModeActive });

  if (options.json) {
    console.log(JSON.stringify({ config, result }, null, 2));
  } else {
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }

    if (result.ok) {
      const activeOverrides = [
        [options.allowPro, "--allow-pro"],
        [options.allowMultipleSpaces, "--allow-multiple-spaces"],
        [options.allowNotifications, "--allow-notifications"],
      ]
        .filter(([active]) => active)
        .map(([, label]) => label);
      const overrideSummary = activeOverrides.length
        ? ` Active override(s): ${activeOverrides.join(", ")}.`
        : " No cost-bearing override is active.";

      console.log(
        `Budget guard passed. Posture: ${result.posture}; away mode: ${
          awayModeActive ? "active" : "inactive"
        }; cap: $${result.budgetCapUsd}.${overrideSummary}`,
      );
    } else {
      console.error("Budget guard failed:");
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
      console.error(
        `Budget cap is $${result.budgetCapUsd}. See docs/budget-and-cost-policy.md and ${AWAY_MODE_DOC}.`,
      );
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function configuredKeys(map) {
  return Object.entries(map)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key]) => key)
    .sort();
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value, defaultValue) {
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function readBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== "false" && normalized !== "0";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
