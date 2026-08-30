import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseRentVineProofConfirmation,
  type RentVineProofConfirmation,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import { isAllowedRentVineProofRuntimePath } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

export const S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV =
  "S30_RENTVINE_PROOF_CONFIRMATION_PATH";

export type RentVineProofConfirmationInputErrorCode =
  | "confirmation_path_missing"
  | "confirmation_tracked_path"
  | "confirmation_read_failed"
  | "confirmation_invalid_json";

export class RentVineProofConfirmationInputError extends Error {
  constructor(public readonly code: RentVineProofConfirmationInputErrorCode) {
    super(`S30 confirmation input refused (${code}).`);
    this.name = "RentVineProofConfirmationInputError";
  }
}

interface LoadOptions {
  rootDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
  readText?: (path: string) => string;
  realPath?: (path: string) => string;
}

function requiredPath(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 4_096 ? trimmed : null;
}

export function loadRentVineProofConfirmation(
  options: LoadOptions = {},
): RentVineProofConfirmation {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const env = options.env ?? process.env;
  const configuredPath = requiredPath(env[S30_RENTVINE_PROOF_CONFIRMATION_PATH_ENV]);
  if (!configuredPath) {
    throw new RentVineProofConfirmationInputError("confirmation_path_missing");
  }
  const absolutePath = resolve(rootDir, configuredPath);
  if (!isAllowedRentVineProofRuntimePath(rootDir, absolutePath)) {
    throw new RentVineProofConfirmationInputError("confirmation_tracked_path");
  }
  let canonicalPath: string;
  try {
    canonicalPath = resolve((options.realPath ?? realpathSync)(absolutePath));
  } catch {
    throw new RentVineProofConfirmationInputError("confirmation_read_failed");
  }
  if (!isAllowedRentVineProofRuntimePath(rootDir, canonicalPath)) {
    throw new RentVineProofConfirmationInputError("confirmation_tracked_path");
  }
  let raw: string;
  try {
    raw = (options.readText ?? ((path: string) => readFileSync(path, "utf8")))(
      canonicalPath,
    );
  } catch {
    throw new RentVineProofConfirmationInputError("confirmation_read_failed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RentVineProofConfirmationInputError("confirmation_invalid_json");
  }
  return parseRentVineProofConfirmation(parsed);
}
