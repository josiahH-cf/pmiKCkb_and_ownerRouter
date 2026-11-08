import { createHash } from "node:crypto";
const OUTPUT = new Set([
  "client",
  "clientVersion",
  "conditions",
  "containerStatuses",
  "createTime",
  "creator",
  "deleteTime",
  "etag",
  "expireTime",
  "generation",
  "logUri",
  "name",
  "observedGeneration",
  "reconciling",
  "satisfiesPzs",
  "scalingStatus",
  "uid",
  "updateTime",
]);
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object")
    throw new Error("revision_configuration_invalid");
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}
// Cloud Run reports buildInfo as output-only. The image and all runtime configuration stay.
export function revisionContainerConfiguration(container) {
  if (!container || typeof container !== "object" || Array.isArray(container))
    throw new Error("revision_configuration_invalid");
  const configuration = { ...container };
  delete configuration.buildInfo;
  return configuration;
}

export function fingerprintRevisionRuntimeConfiguration(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.containers) ||
    !value.containers.length
  )
    throw new Error("revision_configuration_invalid");
  const configuration = Object.fromEntries(
    Object.entries(value).filter(([key]) => !OUTPUT.has(key)),
  );
  configuration.containers = value.containers.map(revisionContainerConfiguration);
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(configuration)))
    .digest("hex")}`;
}
