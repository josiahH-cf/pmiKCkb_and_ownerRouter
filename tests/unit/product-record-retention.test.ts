import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATIONS_RETENTION_TARGETS,
  communicationsRetentionFields,
  planCommunicationsCleanup,
  type CommunicationsRetentionCandidate,
} from "@/lib/gmail-hub/retention-policy";
import {
  PRODUCT_RECORD_COLLECTIONS,
  PRODUCT_RECORD_RETENTION_CLASS,
  PRODUCT_RECORD_RETENTION_POLICY,
  productRecordRetentionFields,
  resolveProductRecordDeletionDisposition,
  stampProductRecordRetention,
  type ProductRecordCollection,
} from "@/lib/operations/product-record-retention";

const EXPECTED_PRODUCT_COLLECTIONS = [
  "approval_queue_items",
  "lease_renewal_progress",
  "lease_renewal_resolutions",
  "maintenance_tickets",
  "support_reports",
  "workflow_runs",
].sort();

const DIRECT_PRODUCT_RECORD_REFERENCE_INVENTORY = {
  approval_queue_items: [
    "lib/firestore/approval-queue-notifications.ts",
    "lib/firestore/approval-queue-scheduled-notifications.ts",
    "lib/firestore/approval-queue.ts",
    "lib/vendor/live-lifecycle-runtime.ts",
    "scripts/demo-firestore.mjs",
  ],
  lease_renewal_progress: [
    "lib/firestore/lease-renewal-progress-schema.ts",
    "lib/firestore/lease-renewal-progress.ts",
  ],
  lease_renewal_resolutions: ["lib/firestore/lease-renewal-resolutions.ts"],
  maintenance_tickets: [
    "lib/firestore/maintenance-tickets.ts",
    "lib/firestore/vendor-lifecycle-executions.ts",
    "lib/firestore/vendors.ts",
  ],
  support_reports: ["lib/firestore/support-reports.ts"],
  workflow_runs: [
    "lib/firestore/workflow-run-step-checks.ts",
    "lib/firestore/workflows.ts",
  ],
} satisfies Record<ProductRecordCollection, readonly string[]>;

/**
 * Reviewed app-owned writers. The literal-reference check below is deliberately a conservative
 * repository sentinel, not an AST/data-flow completeness claim. This explicit list also keeps
 * alias-based writers such as maintenance-intake-review.ts visible to reviewers.
 */
const PRODUCT_RECORD_WRITER_INVENTORY = {
  approval_queue_items: ["lib/firestore/approval-queue.ts", "scripts/demo-firestore.mjs"],
  lease_renewal_progress: ["lib/firestore/lease-renewal-progress.ts"],
  lease_renewal_resolutions: ["lib/firestore/lease-renewal-resolutions.ts"],
  maintenance_tickets: [
    "lib/firestore/maintenance-intake-review.ts",
    "lib/firestore/maintenance-tickets.ts",
    "lib/firestore/vendor-lifecycle-executions.ts",
  ],
  support_reports: ["lib/firestore/support-reports.ts"],
  workflow_runs: ["lib/firestore/workflows.ts"],
} satisfies Record<ProductRecordCollection, readonly string[]>;

describe("S51 product and communications retention separation", () => {
  it("pins the exact primary product collection set and zero communications overlap", () => {
    const communications = new Set(Object.keys(COMMUNICATIONS_RETENTION_TARGETS));
    const products = Object.keys(PRODUCT_RECORD_COLLECTIONS).sort();

    expect(products).toEqual(EXPECTED_PRODUCT_COLLECTIONS);
    expect(products.filter((collection) => communications.has(collection))).toEqual([]);
  });

  it("refuses to assign indefinite product retention to a communications collection", () => {
    for (const collection of Object.keys(COMMUNICATIONS_RETENTION_TARGETS)) {
      expect(() =>
        productRecordRetentionFields(collection as ProductRecordCollection),
      ).toThrow("Collection is not governed by product-record-retention:v1.0.");
    }
  });

  it("keeps communications fields class-expiring and free of product markers", () => {
    const anchorAtMs = Date.UTC(2026, 6, 1);
    const retention = communicationsRetentionFields("workflow_link", anchorAtMs);
    const candidate: CommunicationsRetentionCandidate = {
      collection: "gmail_workflow_communications",
      id: "fixture-communication",
      ...retention,
    };

    expect(retention).not.toHaveProperty("product_retention_policy");
    expect(retention).not.toHaveProperty("product_retention_class");
    expect(retention.expires_at).toEqual(new Date(retention.expires_at_ms!));
    expect(
      planCommunicationsCleanup([candidate], retention.expires_at_ms!).candidates,
    ).toEqual([candidate]);
  });

  it("stamps a new product record with distinct indefinite fields", () => {
    const record = stampProductRecordRetention("maintenance_tickets", {
      id: "fixture-ticket",
      product_retention_policy: "forged-policy",
      product_retention_class: "temporary",
    });

    expect(record).toMatchObject({
      id: "fixture-ticket",
      product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
      product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
      legal_hold: false,
    });
    expect(record).not.toHaveProperty("retention_class");
    expect(record).not.toHaveProperty("expires_at");
    expect(record).not.toHaveProperty("expires_at_ms");
    expect(resolveProductRecordDeletionDisposition(record)).toBe(
      "manual_review_required",
    );
  });

  it("preserves a legal hold across a full rewrite", () => {
    const current = stampProductRecordRetention("lease_renewal_progress", {
      id: "fixture-renewal",
    });
    const held = { ...current, legal_hold: true };
    const rewritten = stampProductRecordRetention(
      "lease_renewal_progress",
      { id: current.id, complete: true, legal_hold: false },
      held,
    );

    expect(rewritten.legal_hold).toBe(true);
    expect(resolveProductRecordDeletionDisposition(rewritten)).toBe("blocked_legal_hold");
  });

  it("fails malformed and unknown deletion state closed", () => {
    expect(resolveProductRecordDeletionDisposition({})).toBe("blocked_unknown_retention");
    expect(
      resolveProductRecordDeletionDisposition({
        product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
        product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
        legal_hold: "false",
      }),
    ).toBe("blocked_unknown_retention");
    expect(() =>
      stampProductRecordRetention(
        "lease_renewal_resolutions",
        { id: "fixture-resolution" },
        {
          product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
          legal_hold: true,
        },
      ),
    ).toThrow("Current product retention state is malformed");
  });

  it("never selects a product-shaped record for communications cleanup", () => {
    const product = stampProductRecordRetention("approval_queue_items", {
      id: "fixture-approval",
    });

    expect(
      planCommunicationsCleanup(
        [
          {
            collection: "approval_queue_items",
            ...product,
          } as unknown as CommunicationsRetentionCandidate,
        ],
        Date.UTC(2099, 0, 1),
      ).candidates,
    ).toEqual([]);
  });

  it("pins the reviewed writer inventory and catches new direct collection references", () => {
    expect(
      hasObviousDirectLiteralWrite(
        'await db.collection("support_reports").doc(id).set(record);',
        "support_reports",
      ),
    ).toBe(true);
    expect(
      hasObviousDirectLiteralWrite(
        'const ticketRef = db.collection("maintenance_tickets").doc(id); transaction.set(ticketRef, record);',
        "maintenance_tickets",
      ),
    ).toBe(true);
    expect(
      hasObviousDirectLiteralWrite(
        'await transaction.get(db.collection("workflow_runs").doc(id));',
        "workflow_runs",
      ),
    ).toBe(false);

    expect(discoverDirectProductRecordReferences()).toEqual(
      DIRECT_PRODUCT_RECORD_REFERENCE_INVENTORY,
    );

    for (const [collection, files] of Object.entries(PRODUCT_RECORD_WRITER_INVENTORY)) {
      expect(
        files.length,
        `${collection} must retain at least one reviewed writer`,
      ).toBeGreaterThan(0);
      for (const file of files) {
        const source = readFileSync(join(process.cwd(), file), "utf8");
        expect(
          /stampProductRecordRetention|productRecordRetentionFields|DEMO_PRODUCT_RECORD_RETENTION_POLICY/.test(
            source,
          ),
          `${file} must visibly apply the product-retention contract`,
        ).toBe(true);
      }
    }

    for (const [collection, files] of Object.entries(
      DIRECT_PRODUCT_RECORD_REFERENCE_INVENTORY,
    )) {
      const reviewedWriters = new Set(
        PRODUCT_RECORD_WRITER_INVENTORY[collection as ProductRecordCollection],
      );
      for (const file of files) {
        if (reviewedWriters.has(file)) continue;
        const source = readFileSync(join(process.cwd(), file), "utf8");
        expect(
          hasObviousDirectLiteralWrite(source, collection),
          `${file} gained an obvious direct ${collection} write without writer review`,
        ).toBe(false);
      }
    }
  });
});

function discoverDirectProductRecordReferences() {
  const sources = ["app", "lib/firestore", "lib/vendor", "scripts"]
    .flatMap((directory) => runtimeSourceFiles(join(process.cwd(), directory)))
    .sort()
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
  return Object.fromEntries(
    EXPECTED_PRODUCT_COLLECTIONS.map((collection) => [
      collection,
      sources
        .filter(({ source }) => {
          return (
            source.includes(`"${collection}"`) ||
            source.includes(`'${collection}'`) ||
            source.includes(`\`${collection}\``)
          );
        })
        .map(({ file }) => relative(process.cwd(), file).replaceAll("\\", "/"))
        .sort(),
    ]),
  );
}

function runtimeSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(path);
    return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function hasObviousDirectLiteralWrite(source: string, collection: string) {
  const literal = `(?:["'\`])${collection}(?:["'\`])`;
  const chain = new RegExp(
    `\\.collection\\(\\s*${literal}\\s*\\)(?:(?!\\.collection\\().){0,500}?\\.(?:set|create|update|delete)\\s*\\(`,
    "s",
  );
  if (chain.test(source)) return true;

  const aliases = [
    ...source.matchAll(
      new RegExp(
        `(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:(?!;).){0,500}?\\.collection\\(\\s*${literal}\\s*\\)(?:(?!;).){0,500}?;`,
        "gs",
      ),
    ),
  ].map((match) => match[1]);
  return aliases.some((alias) =>
    new RegExp(
      `(?:transaction\\.)?(?:set|create|update|delete)\\(\\s*${escapeRegex(alias!)}`,
    ).test(source),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
