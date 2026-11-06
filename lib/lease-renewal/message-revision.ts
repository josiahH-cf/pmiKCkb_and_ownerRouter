// S249 ARCH-S249-2: the revision of the one message record, as a short stable code. The same
// subject and body always give the same code, in the browser and on the server, so Send, Schedule,
// the Gmail draft, Copy and the Communications composer can each show which revision they carry,
// and a Gmail draft made from an earlier revision reads older. Not a security hash: it identifies
// wording, it authorizes nothing (the exact review hashes of the send contract are unchanged).

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Line endings and trailing spaces do not change a revision; every visible character does. */
function normalized(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

export function messageRevisionOf(message: {
  readonly subject: string;
  readonly body: string;
}): string {
  const text = `${normalized(message.subject)}\u0000${normalized(message.body)}`;
  return [fnv1a(text, 0x811c9dc5), fnv1a(text, 0x01000193)]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("")
    .slice(0, 12);
}

/** The code staff read: the first six characters, upper case. */
export function messageRevisionLabel(revision: string): string {
  return revision.slice(0, 6).toUpperCase();
}
