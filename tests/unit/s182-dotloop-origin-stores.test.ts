// S182 ARCH-S182-2: DOTLOOP_API_ORIGIN_STORES names exactly the stores that hold Dotloop
// API-derived data, pinned to the stores' own collection names, and the assistant's context,
// history and model paths name none of them. The two stores those paths do read are read only
// through the source-side views that remove the provider-derived part.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DOTLOOP_API_ORIGIN_STORES } from "@/lib/ai-boundary/dotloop-origin";
import {
  CONNECTOR_CONNECTIONS_COLLECTION,
  CONNECTOR_REVOCATION_RECEIPTS_COLLECTION,
} from "@/lib/firestore/connector-connections";
import { DOTLOOP_CONNECTION_OBSERVATIONS_COLLECTION } from "@/lib/firestore/dotloop-connection-observations";
import { DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS } from "@/lib/firestore/dotloop-renewal-settings";
import { LOOP_ASSOCIATION_COLLECTIONS } from "@/lib/firestore/lease-document-loop-association";
import { LEASE_DOCUMENT_PACKET_COLLECTIONS } from "@/lib/firestore/lease-document-packet-snapshots";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sources(path: string): string[] {
  return readdirSync(join(ROOT, path)).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(ROOT, child)).isDirectory()) return sources(child);
    return /\.tsx?$/.test(name) ? [child] : [];
  });
}

// Every module on the assistant's context, history and model paths.
const AI_FACING = [
  ...sources("lib/operational-context"),
  ...sources("lib/assistant"),
  ...sources("lib/assistant-history"),
  ...sources("lib/llm"),
  ...sources("lib/ask"),
  ...sources("app/api/assistant"),
  ...sources("app/api/ask"),
  "lib/firestore/assistant-history.ts",
  "lib/firestore/assistant-history-read.ts",
  "lib/firestore/assistant-saved-questions.ts",
  "lib/lease-renewal/assistant-source.ts",
];

// Modules that read only Dotloop API-derived data or call Dotloop.
const DOTLOOP_ONLY_MODULES = [
  "@/lib/firestore/dotloop-connection-observations",
  "@/lib/firestore/dotloop-renewal-settings",
  "@/lib/firestore/lease-document-loop-association",
  "@/lib/lease-renewal/execution/normal-packet-action",
  "@/lib/lease-renewal/execution/dotloop-runtime",
  "@/lib/connections/dotloop-runtime",
  "@/lib/connections/dotloop-readiness",
  "@/lib/integrations/dotloop/client",
];

describe("S182 the Dotloop API-origin store list", () => {
  it("names exactly the stores that hold Dotloop API-derived data", () => {
    // The packet action companion's collection name, as declared next to its writer.
    expect(read("lib/lease-renewal/execution/normal-packet-action.ts")).toContain(
      'export const PACKET_ACTION_SNAPSHOTS = "lease_document_action_snapshots";',
    );
    expect([...DOTLOOP_API_ORIGIN_STORES].sort()).toEqual(
      [
        DOTLOOP_CONNECTION_OBSERVATIONS_COLLECTION,
        DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS.settings,
        DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS.activity,
        CONNECTOR_CONNECTIONS_COLLECTION,
        CONNECTOR_REVOCATION_RECEIPTS_COLLECTION,
        "lease_document_action_snapshots",
        LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections,
        LEASE_DOCUMENT_PACKET_COLLECTIONS.activity,
        LOOP_ASSOCIATION_COLLECTIONS.associations,
        LOOP_ASSOCIATION_COLLECTIONS.owners,
        LOOP_ASSOCIATION_COLLECTIONS.activity,
      ].sort(),
    );
  });

  it("is never named by the assistant's context, history or model paths", () => {
    expect(AI_FACING.length).toBeGreaterThan(20);
    for (const path of AI_FACING) {
      const source = read(path);
      for (const store of DOTLOOP_API_ORIGIN_STORES)
        expect(source, `${path} names ${store}`).not.toContain(store);
      for (const dotloopModule of DOTLOOP_ONLY_MODULES)
        expect(source, `${path} imports ${dotloopModule}`).not.toContain(
          `"${dotloopModule}"`,
        );
    }
  });

  it("is read on those paths only through the source-side views", () => {
    const renewal = read("lib/lease-renewal/assistant-source.ts");
    expect(renewal).toContain("packetSnapshotsForAiContext(snapshots)");
    const context = read("lib/operational-context/server-context.ts");
    expect(context).toMatch(
      /loadRenewalAssistantSource\(user, now, null, \{\s*aiContext: true,\s*\}\)/,
    );
    expect(context).toContain("connectionViewForAiContext(record)");
    expect(context).not.toContain("projectConnectorConnection");
  });
});
