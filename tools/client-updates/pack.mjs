import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agenda, validateContent } from "./content.mjs";
import {
  assert,
  hash,
  id,
  rendererConfig,
  readJson,
  ROOT,
  safePath,
  saveJson,
  setBaseline,
  withLock,
} from "./store.mjs";

export function buildPack(base, content, snapshot) {
  validateContent(content, snapshot);
  const config = rendererConfig(base);
  assert(
    config.python && config.font_dir,
    "Configure python and font_dir in private config; run doctor",
  );
  const run = hash({
    content,
    renderer: hash(readFileSync(join(ROOT, "tools/client-updates/render.py"))),
    template: 1,
  });
  return withLock(base, "pack", () => {
    const input = safePath(base, "inputs", `${run}.json`);
    if (!existsSync(input)) saveJson(input, content, true);
    const directory = safePath(base, "packs", run);
    assert(
      !existsSync(directory),
      "Pack already exists or a render failed; inspect it before using a revised content run",
    );
    execFileSync(
      config.python,
      [
        join(ROOT, "tools/client-updates/render.py"),
        "--content",
        input,
        "--output",
        directory,
        "--font-dir",
        config.font_dir,
        "--timings",
        agenda(content.minutes).join(","),
      ],
      { timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const manifest = readJson(join(directory, "manifest.json"));
    manifest.run = run;
    manifest.snapshot_id = snapshot.id;
    manifest.cutoff = snapshot.cutoff;
    manifest.manifest_hash = hash(manifest);
    saveJson(join(directory, "manifest.json"), manifest);
    return { run, directory, ...manifest };
  });
}
export function verifyPack(base, run) {
  const directory = safePath(base, "packs", id(run));
  const manifest = readJson(join(directory, "manifest.json"));
  const { manifest_hash: expected, ...data } = manifest;
  assert(
    hash(data) === expected && manifest.run === run,
    "Pack manifest integrity mismatch",
  );
  for (const [name, expectedHash] of Object.entries(manifest.files)) {
    assert(
      hash(readFileSync(safePath(directory, name))) === expectedHash,
      `Pack file changed: ${name}`,
    );
  }
  return manifest;
}
export function reviewPack(base, run, reviewedPages, factsChecked, privacyChecked) {
  const manifest = verifyPack(base, run);
  assert(
    factsChecked && privacyChecked,
    "Complete factual and privacy review before accepting",
  );
  assert(
    Array.isArray(reviewedPages) &&
      JSON.stringify([...reviewedPages].sort()) ===
        JSON.stringify([...manifest.pages].sort()),
    "Inspect and list every rendered page exactly once",
  );
  const result = {
    run,
    manifest_hash: manifest.manifest_hash,
    reviewed_pages: reviewedPages,
    facts_checked: true,
    privacy_checked: true,
    visual_review: "agent_reviewed",
    human_observation: "not_run",
    reviewed_at: new Date().toISOString(),
  };
  saveJson(safePath(base, "reviews", `${id(run)}.json`), result);
  return result;
}
export function acceptPack(base, run) {
  const manifest = verifyPack(base, run);
  const review = readJson(safePath(base, "reviews", `${id(run)}.json`));
  assert(
    review.manifest_hash === manifest.manifest_hash &&
      review.visual_review === "agent_reviewed",
    "Current all-page review required",
  );
  setBaseline(base, "pack", {
    run,
    snapshot_id: manifest.snapshot_id,
    cutoff: manifest.cutoff,
    accepted_at: new Date().toISOString(),
  });
  return { run, state: "accepted", directory: safePath(base, "packs", run) };
}
