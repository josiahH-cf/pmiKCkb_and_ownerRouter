import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
  ExternalExecutionStore,
} from "@/lib/external-execution/types";

export class MemoryExternalExecutionStore implements ExternalExecutionStore {
  readonly records = new Map<string, ExternalExecutionRecord>();

  async get(id: string) {
    return this.records.get(id) ?? null;
  }

  async create(record: ExternalExecutionRecord) {
    if (this.records.has(record.id)) throw new Error("Execution already exists.");
    this.records.set(record.id, structuredClone(record));
  }

  async claim(id: string, previewHash: string) {
    const record = this.records.get(id);
    if (!record || record.previewHash !== previewHash || record.state === "blocked") {
      return "blocked" as const;
    }
    if (record.attemptCount === 1 || record.state !== "ready") {
      return record.state === "succeeded" ? ("duplicate" as const) : ("blocked" as const);
    }
    this.records.set(id, {
      ...record,
      state: "running",
      attemptCount: 1,
      updatedAt: new Date().toISOString(),
    });
    return "claimed" as const;
  }

  async finish(id: string, receipt: ExternalActionReceipt) {
    const record = this.records.get(id);
    if (!record) throw new Error("Execution missing.");
    this.records.set(id, {
      ...record,
      state: receipt.outcome === "not_applicable" ? "not_applicable" : "succeeded",
      receipt,
      updatedAt: new Date().toISOString(),
    });
  }

  async fail(id: string, ambiguous: boolean) {
    const record = this.records.get(id);
    if (!record) throw new Error("Execution missing.");
    this.records.set(id, {
      ...record,
      state: ambiguous ? "ambiguous" : "failed",
      updatedAt: new Date().toISOString(),
    });
  }
}
