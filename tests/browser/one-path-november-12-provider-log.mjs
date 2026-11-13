// Source-read and write-attempt evidence from the server's guarded rehearsal log.
import { readFileSync } from "node:fs";

export function serverProviderCalls(rehearsal) {
  const file = rehearsal.files?.networkLog;
  if (!file) throw new Error("The rehearsal server network log was not bound.");
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.served || entry.refused);
}

export function sheetWriteAttempts(calls) {
  return calls.filter(
    (entry) =>
      entry.host === "sheets.googleapis.com" &&
      (entry.refused || !["GET", "HEAD", "OPTIONS"].includes(entry.method)),
  );
}
