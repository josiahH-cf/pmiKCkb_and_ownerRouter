import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { canonicalJson } from "@/lib/execution/preview-hash";
import type { RentVineProofReviewPacket } from "@/lib/lease-renewal/rentvine-proof-contract";

export type RentVineProofReviewErrorCode =
  | "review_path_refused"
  | "review_conflict"
  | "review_write_failed";

export class RentVineProofReviewError extends Error {
  constructor(public readonly code: RentVineProofReviewErrorCode) {
    super(`S30 review packet refused (${code}).`);
    this.name = "RentVineProofReviewError";
  }
}

export function writeRentVineProofReviewPacket(input: {
  rootDir?: string;
  packet: RentVineProofReviewPacket;
}): { reused: boolean } {
  if (!/^s30-(?:forward|rollback)-[a-f0-9]{48}$/.test(input.packet.executionId)) {
    throw new RentVineProofReviewError("review_path_refused");
  }
  const rootDir = resolve(input.rootDir ?? process.cwd());
  const expectedDir = resolve(rootDir, "temp", "rentvine-proof");
  try {
    mkdirSync(expectedDir, { recursive: true, mode: 0o700 });
  } catch {
    throw new RentVineProofReviewError("review_write_failed");
  }
  let canonicalRoot: string;
  let canonicalDir: string;
  try {
    canonicalRoot = resolve(realpathSync(rootDir));
    canonicalDir = resolve(realpathSync(expectedDir));
  } catch {
    throw new RentVineProofReviewError("review_path_refused");
  }
  if (
    relative(canonicalRoot, canonicalDir).replace(/\\/g, "/") !== "temp/rentvine-proof"
  ) {
    throw new RentVineProofReviewError("review_path_refused");
  }
  const outputPath = resolve(canonicalDir, `${input.packet.executionId}.review.json`);
  const serialized = `${JSON.stringify(input.packet, null, 2)}\n`;
  try {
    const existing = readFileSync(outputPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      throw new RentVineProofReviewError("review_conflict");
    }
    if (canonicalJson(parsed) !== canonicalJson(input.packet)) {
      throw new RentVineProofReviewError("review_conflict");
    }
    return { reused: true };
  } catch (error) {
    if (error instanceof RentVineProofReviewError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new RentVineProofReviewError("review_write_failed");
    }
  }
  try {
    writeFileSync(outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    throw new RentVineProofReviewError("review_write_failed");
  }
  return { reused: false };
}
