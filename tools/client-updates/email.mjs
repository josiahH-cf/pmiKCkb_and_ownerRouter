import { existsSync } from "node:fs";
import {
  assert,
  hash,
  id,
  localDate,
  privateConfig,
  readJson,
  safePath,
  saveJson,
  setBaseline,
} from "./store.mjs";
import { validateContent } from "./content.mjs";

function address(value) {
  assert(
    typeof value === "string" && /^[^\s<>,;@]+@[^\s<>,;@]+\.[a-z]{2,}$/i.test(value),
    "Exact email address required",
  );
  return value.toLowerCase();
}
export function validateMailConfig(config) {
  const sender = address(config.sender);
  assert(sender.endsWith("@pmikcmetro.com"), "Use the approved managed sender");
  assert(
    Array.isArray(config.to) && config.to.length >= 1 && config.to.length <= 2,
    "Configure exact To recipients",
  );
  assert(
    Array.isArray(config.cc) && config.cc.length <= 1,
    "Configure CC explicitly, including an empty list",
  );
  const recipients = [...config.to, ...config.cc];
  assert(
    recipients.length === 2 &&
      new Set(recipients.map((r) => address(r.email))).size === 2,
    "Configure Dan and the business partner exactly once",
  );
  assert(
    recipients.every(
      (r) => typeof r.name === "string" && /^[\p{L} .'-]{1,60}$/u.test(r.name),
    ),
    "Recipient names required",
  );
  assert(
    recipients.some((r) => r.role === "dan") &&
      recipients.some((r) => r.role === "partner"),
    "Recipient roles must be dan and partner",
  );
  return {
    sender,
    to: config.to.map((r) => ({ ...r, email: address(r.email) })),
    cc: config.cc.map((r) => ({ ...r, email: address(r.email) })),
  };
}
function bullet(item) {
  const status = item.state === "released" ? "" : ` (${item.state})`;
  return `- ${item.title}${status}: ${item.detail}${item.owner ? ` Owner: ${item.owner}.` : ""}${item.next_action ? ` Next: ${item.next_action}` : ""}`;
}
export function composeEmail(config, content, snapshot) {
  validateContent(content, snapshot);
  const names = [...config.to, ...config.cc].map((r) => r.name).join(" and ");
  const section = (title, items, empty) =>
    `${title}\n\n${items.length ? items.map(bullet).join("\n") : empty}`;
  const body = [
    `Hi ${names},`,
    `Quick update on the PMI KC build. 😊\n\nThis update covers ${snapshot.since} through ${localDate(new Date(snapshot.cutoff))}.`,
    section(
      "✅ Done this week",
      content.changes,
      "No new completed work is listed in this update.",
    ),
    section("🔜 Next Up", content.next, "Next priorities need confirmation."),
    section(
      "🚧 Blockers",
      content.blockers,
      "No blockers were identified in the reviewed repository sources.",
    ),
    "Thanks,\nJosiah",
  ].join("\n\n");
  assert(!body.includes("```"), "Email copy cannot contain code fences");
  return {
    from: config.sender,
    to: config.to.map((r) => r.email),
    cc: config.cc.map((r) => r.email),
    subject: `PMI KC weekly update | ${content.date}`,
    body,
  };
}
export function prepareEmail(base, content, snapshot) {
  const config = validateMailConfig(privateConfig(base).email ?? {});
  const message = composeEmail(config, content, snapshot);
  const preview = {
    version: 1,
    mode: "copy_only",
    snapshot_id: snapshot.id,
    cutoff: snapshot.cutoff,
    message,
  };
  preview.id = hash(preview);
  const path = safePath(base, "emails", `${preview.id}.json`);
  if (!existsSync(path)) saveJson(path, preview, true);
  return {
    preview_id: preview.id,
    path,
    message,
    mode: "copy_only",
    instruction:
      "Show To/CC and subject, then the exact body in one plain-text code block. The owner copies and sends.",
  };
}
export function loadPreview(base, previewId) {
  const preview = readJson(safePath(base, "emails", `${id(previewId)}.json`));
  const { id: stored, ...data } = preview;
  assert(
    stored === previewId && hash(data) === stored && preview.mode === "copy_only",
    "Preview integrity mismatch",
  );
  return preview;
}
export function recordManualSend(base, previewId, confirmation) {
  assert(
    previewId === confirmation,
    "Record only the exact preview the owner reports sending",
  );
  const preview = loadPreview(base, previewId);
  const record = {
    preview_id: previewId,
    cutoff: preview.cutoff,
    verification: "owner_reported",
    recorded_at: new Date().toISOString(),
  };
  saveJson(safePath(base, "manual-send-reports", `${id(previewId)}.json`), record);
  setBaseline(base, "email", record);
  return record;
}
