// S242 R-S242-9 / ARCH-S242-5 and S243 ARCH-S243-1 / ARCH-S243-3: the help screenshot gate. Every
// scene a step or screen references resolves to a committed image under public/help/<version>/,
// every committed image is referenced and listed in the scene manifest with its capture source,
// every scene names an existing guide step, and a production-blurred scene carries its reason,
// date and attestation. A missing, orphan, unmanifested or malformed image fails.
//
//   npm run verify:help-screenshots
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { HELP_MANUAL } from "@/lib/help";
import { HELP_SCENE_MANIFEST } from "@/lib/help/scenes";
import { HELP_VERSION } from "@/lib/help/version";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ROLES = new Set(["Editor", "Approver", "Admin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Pure evaluation. `images` maps file name to PNG bytes for public/help/<version>/; `versions`
 * lists the folders under public/help/.
 */
export function evaluateHelpScreenshots({
  manual,
  manifest,
  helpVersion,
  images,
  versions,
}) {
  const problems = [];
  const guides = new Map(manual.guides.map((guide) => [guide.id, guide]));
  const scenes = new Map();
  if (manifest.version !== helpVersion)
    problems.push(`The scene manifest is for ${manifest.version}, not ${helpVersion}.`);
  for (const folder of versions)
    if (folder !== helpVersion)
      problems.push(
        `public/help/${folder}/ is not the current help version ${helpVersion}.`,
      );

  for (const scene of manifest.scenes) {
    const where = `scene ${scene.id}`;
    if (scenes.has(scene.id)) problems.push(`Duplicate ${where}.`);
    scenes.set(scene.id, scene);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.id ?? ""))
      problems.push(`${where} id is not kebab-case.`);
    const guide = guides.get(scene.guide);
    const step = guide?.steps.find((candidate) => candidate.id === scene.step);
    if (!guide || !step)
      problems.push(`${where} names unknown guide step ${scene.guide}#${scene.step}.`);
    else if (step.scene !== scene.id)
      problems.push(
        `${where} names ${scene.guide}#${scene.step}, which shows a different scene.`,
      );
    if (!scene.route?.startsWith("/")) problems.push(`${where} route is not a path.`);
    if (!ROLES.has(scene.role))
      problems.push(`${where} role ${scene.role} is not a demo role.`);
    if (!scene.fixture?.trim()) problems.push(`${where} names no fixture state.`);
    if (!scene.region?.trim()) problems.push(`${where} names no region to frame.`);
    if (!["viewport", "region"].includes(scene.frame))
      problems.push(`${where} frame must be viewport or region.`);
    if (
      !Number.isInteger(scene.viewport?.width) ||
      !Number.isInteger(scene.viewport?.height) ||
      scene.viewport.width < 320 ||
      scene.viewport.height < 320
    )
      problems.push(`${where} has no fixed viewport.`);
    if (!scene.alt?.trim() || !scene.caption?.trim())
      problems.push(`${where} needs alt text and a caption.`);
    if (scene.source === "production-blurred") {
      if (!scene.reason?.trim())
        problems.push(`${where} is production-blurred without a reason.`);
      if (!ISO_DATE.test(scene.date ?? ""))
        problems.push(`${where} is production-blurred without a capture date.`);
      if (!scene.attestation?.trim())
        problems.push(`${where} is production-blurred without an attestation.`);
    } else if (scene.source !== "rehearsal") {
      problems.push(`${where} capture source must be rehearsal or production-blurred.`);
    }
    const file = `${scene.id}.png`;
    const bytes = images.get(file);
    if (!bytes) {
      problems.push(`${where} has no image public/help/${helpVersion}/${file}.`);
      continue;
    }
    const size = pngSize(bytes);
    if (!size) {
      problems.push(`public/help/${helpVersion}/${file} is not a PNG.`);
      continue;
    }
    if (
      scene.frame === "viewport" &&
      (size.width !== scene.viewport.width || size.height !== scene.viewport.height)
    )
      problems.push(
        `public/help/${helpVersion}/${file} is ${size.width}x${size.height}, not the scene viewport ${scene.viewport.width}x${scene.viewport.height}.`,
      );
    if (
      scene.frame === "region" &&
      (size.width > scene.viewport.width || size.width < 120 || size.height < 40)
    )
      problems.push(
        `public/help/${helpVersion}/${file} does not fit the scene viewport.`,
      );
  }

  const referenced = new Set();
  for (const guide of manual.guides)
    for (const step of guide.steps)
      if (step.scene) {
        referenced.add(step.scene);
        if (!scenes.has(step.scene))
          problems.push(
            `guide ${guide.id} step ${step.id} references unknown scene ${step.scene}.`,
          );
      }
  for (const screen of manual.screens)
    for (const scene of screen.scenes ?? []) {
      referenced.add(scene);
      if (!scenes.has(scene))
        problems.push(`screen ${screen.id} references unknown scene ${scene}.`);
    }
  for (const id of scenes.keys())
    if (!referenced.has(id)) problems.push(`scene ${id} is referenced by no step.`);
  for (const file of images.keys()) {
    const id = file.replace(/\.png$/, "");
    if (!file.endsWith(".png"))
      problems.push(`public/help/${helpVersion}/${file} is not a PNG file.`);
    else if (!scenes.has(id))
      problems.push(
        `public/help/${helpVersion}/${file} is missing from the scene manifest.`,
      );
  }
  return problems;
}

export function runHelpScreenshots(root = process.cwd()) {
  const base = join(root, "public/help");
  const versions = existsSync(base)
    ? readdirSync(base).filter((entry) => statSync(join(base, entry)).isDirectory())
    : [];
  const folder = join(base, HELP_VERSION);
  const images = new Map(
    existsSync(folder)
      ? readdirSync(folder).map((file) => [file, readFileSync(join(folder, file))])
      : [],
  );
  return evaluateHelpScreenshots({
    manual: HELP_MANUAL,
    manifest: HELP_SCENE_MANIFEST,
    helpVersion: HELP_VERSION,
    images,
    versions,
  });
}

function main() {
  const problems = runHelpScreenshots();
  const scenes = HELP_SCENE_MANIFEST.scenes;
  const blurred = scenes.filter((scene) => scene.source === "production-blurred");
  console.log(
    `Help screenshots: ${scenes.length} scene(s), ${scenes.length - blurred.length} rehearsal, ${blurred.length} production-blurred.`,
  );
  for (const scene of blurred)
    console.log(
      `  production-blurred ${scene.id}: ${scene.reason} (${scene.date}; ${scene.attestation})`,
    );
  if (problems.length) {
    console.error(`Help screenshot gate FAILED with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    "Help screenshot gate passed: every referenced picture exists, is manifested and is referenced.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
