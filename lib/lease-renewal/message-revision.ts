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

/**
 * S249 R-S249-9: what the card says about the unsent Gmail draft. It reads the last CREATED
 * draft: one confirmed here, else the last one whose creation the server recorded. The draft
 * head (the newest attempt) moves as soon as a replacement is previewed, so it is read only for
 * a draft recorded before the created-draft list existed. `earlierRemain` stays true once a
 * created draft was replaced: the app never deletes a Gmail draft, so the earlier one is still
 * in Gmail.
 */
export function gmailDraftSignal(input: {
  readonly createdHere: string | null;
  readonly replacedHere: boolean;
  readonly created: {
    readonly latest: {
      readonly executionId: string;
      readonly subject: string;
      readonly body: string;
    };
    readonly earlier: number;
  } | null;
  readonly head: {
    readonly executionId: string;
    readonly outcome: { readonly status: string; readonly resolution?: string } | null;
    readonly preview?: { readonly subject: string; readonly body: string } | null;
  } | null;
}): {
  readonly createdRevision: string | null;
  readonly createdExecutionId: string | null;
  readonly earlierRemain: boolean;
} {
  const headCreated =
    input.head?.outcome?.status === "created" ||
    (input.head?.outcome?.status === "reconciliation" &&
      input.head.outcome.resolution === "created");
  const recorded = input.created?.latest
    ? {
        revision: messageRevisionOf(input.created.latest),
        executionId: input.created.latest.executionId,
      }
    : headCreated && input.head?.preview
      ? {
          revision: messageRevisionOf(input.head.preview),
          executionId: input.head.executionId,
        }
      : null;
  return {
    createdRevision: input.createdHere ?? recorded?.revision ?? null,
    createdExecutionId: recorded?.executionId ?? null,
    earlierRemain: input.replacedHere || (input.created?.earlier ?? 0) > 0,
  };
}
