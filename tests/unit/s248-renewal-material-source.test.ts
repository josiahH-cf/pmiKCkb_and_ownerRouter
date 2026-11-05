import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renewalNoticeMaterialIdentity } from "@/lib/gmail-hub/renewal-material-source";
import { sequenceHash } from "@/lib/gmail-hub/sequence-store";
import { pendingNoticeHash } from "@/lib/lease-renewal/notice-safety";

// S248 L39: a renewal message's material source hash binds the notice's scope and semantic
// identity. The marker's admission version, raised by every provider read anywhere, is not part
// of it; any change of scope or semantic hash (a notice observed or withdrawn, a review, an
// admitted read in flight) still is.

const scope = "a".repeat(64);
const semantic = "b".repeat(64);

describe("S248 L39 renewal notice material identity", () => {
  it("ignores the admission version", () => {
    const at = { scopeHash: scope, semanticHash: semantic, version: 3 };
    const later = { ...at, version: 9 };
    expect(sequenceHash({ notice: renewalNoticeMaterialIdentity(at) })).toBe(
      sequenceHash({ notice: renewalNoticeMaterialIdentity(later) }),
    );
  });

  it("changes with the semantic hash, the scope, a pending admission and a missing basis", () => {
    const base = { scopeHash: scope, semanticHash: semantic, version: 3 };
    const hash = (basis: typeof base | null) =>
      sequenceHash({ notice: renewalNoticeMaterialIdentity(basis) });
    const values = new Set([
      hash(base),
      hash({ ...base, semanticHash: "c".repeat(64) }),
      hash({ ...base, scopeHash: "d".repeat(64) }),
      hash({ ...base, semanticHash: pendingNoticeHash(scope, { lease: 5, status: 5 }) }),
      hash(null),
    ]);
    expect(values.size).toBe(5);
  });

  it("is the identity the renewal target's material source hash reads", () => {
    const source = readFileSync("lib/gmail-hub/sequence-dependencies.ts", "utf8");
    expect(source).toContain(
      "notice: renewalNoticeMaterialIdentity(current.basis.noticeSafety)",
    );
    expect(source).not.toMatch(/notice: current\.basis\.noticeSafety\s*,/);
  });
});
