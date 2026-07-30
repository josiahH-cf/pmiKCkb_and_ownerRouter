/**
 * Minimal optimistic Firestore fake for server-side transaction tests.
 *
 * Each callback reads one stable snapshot, then only its commit is serialized. Document and query
 * versions are checked at commit and a conflicting callback is retried against a fresh snapshot.
 * This matters for concurrency tests: serializing the entire callback makes Promise.all exercise
 * only two ordinary sequential transactions and can hide a broken compare-and-set.
 */
export class FakeTransactionalFirestore {
  readonly store = new Map<string, Record<string, unknown>>();
  private readonly documentVersions = new Map<string, number>();
  private readonly collectionVersions = new Map<string, number>();
  private nextVersion = 0;
  private commitTail: Promise<void> = Promise.resolve();
  private nextCommitBarrier?: CommitBarrier;

  collection(name: string) {
    return new FakeCollection(this, name);
  }

  seed(path: string, data: Record<string, unknown>) {
    this.applyWrite(path, data);
  }

  read(path: string) {
    const value = this.store.get(path);
    return value ? structuredClone(value) : undefined;
  }

  collectionEntries(name: string) {
    const prefix = `${name}/`;
    return Array.from(this.store.entries())
      .filter(
        ([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
      )
      .map(([path, data]) => ({
        id: path.slice(prefix.length),
        data: structuredClone(data),
      }));
  }

  /**
   * Forces the next `participants` first-attempt transaction callbacks to finish before any one of
   * them may commit. Tests use this to deterministically produce overlapping optimistic snapshots.
   * The barrier is one-shot; retries never wait on it.
   */
  armNextCommitBarrier(participants = 2, timeoutMs = 5_000) {
    if (
      !Number.isSafeInteger(participants) ||
      participants < 2 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      throw new Error(
        "The fake transaction barrier requires valid participants and timeout.",
      );
    }
    if (this.nextCommitBarrier) {
      throw new Error("A fake transaction commit barrier is already armed.");
    }
    let release!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolve, rejectPromise) => {
      release = resolve;
      reject = rejectPromise;
    });
    const timer = setTimeout(() => {
      if (this.nextCommitBarrier?.promise !== promise) return;
      this.nextCommitBarrier = undefined;
      reject(
        new Error(
          `Fake transaction barrier timed out before ${participants} callbacks arrived.`,
        ),
      );
    }, timeoutMs);
    timer.unref?.();
    this.nextCommitBarrier = {
      arrived: 0,
      participants,
      promise,
      release,
      timer,
    };
  }

  async runTransaction<T>(
    callback: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const transaction = new FakeTransaction(
        this,
        cloneStore(this.store),
        new Map(this.documentVersions),
        new Map(this.collectionVersions),
      );
      const result = await callback(transaction);
      if (attempt === 0) await this.waitAtNextCommitBarrier();
      const committed = await this.withCommitLock(() => this.tryCommit(transaction));
      if (committed) return result;
    }
    throw new Error("Fake Firestore transaction exceeded its retry limit.");
  }

  async createDocument(path: string, data: Record<string, unknown>) {
    await this.withCommitLock(() => {
      if (this.store.has(path)) throw new Error("already-exists");
      this.applyWrite(path, data);
    });
  }

  async setDocument(path: string, data: Record<string, unknown>) {
    await this.withCommitLock(() => {
      this.applyWrite(path, data);
    });
  }

  private tryCommit(transaction: FakeTransaction) {
    for (const [path, expectedVersion] of transaction.documentReads) {
      if (this.documentVersion(path) !== expectedVersion) return false;
    }
    for (const [path, expectedVersion] of transaction.collectionReads) {
      if (this.collectionVersion(path) !== expectedVersion) return false;
    }
    for (const [path, write] of transaction.writes) {
      if (this.documentVersion(path) !== write.baseVersion) return false;
      if (write.kind === "create" && this.store.has(path)) return false;
      if (write.kind === "update" && !this.store.has(path)) return false;
    }
    for (const [path, write] of transaction.writes) {
      if (write.kind === "delete") {
        this.applyDelete(path);
      } else {
        this.applyWrite(path, write.data);
      }
    }
    return true;
  }

  private documentVersion(path: string) {
    return this.documentVersions.get(path) ?? 0;
  }

  private collectionVersion(path: string) {
    return this.collectionVersions.get(path) ?? 0;
  }

  private applyWrite(path: string, data: Record<string, unknown>) {
    this.store.set(path, structuredClone(data));
    const version = ++this.nextVersion;
    this.documentVersions.set(path, version);
    this.collectionVersions.set(collectionPathForDocument(path), version);
  }

  private applyDelete(path: string) {
    this.store.delete(path);
    const version = ++this.nextVersion;
    this.documentVersions.set(path, version);
    this.collectionVersions.set(collectionPathForDocument(path), version);
  }

  private async waitAtNextCommitBarrier() {
    const barrier = this.nextCommitBarrier;
    if (!barrier) return;
    barrier.arrived += 1;
    if (barrier.arrived === barrier.participants) {
      clearTimeout(barrier.timer);
      this.nextCommitBarrier = undefined;
      barrier.release();
    }
    await barrier.promise;
  }

  private async withCommitLock<T>(callback: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.commitTail;
    this.commitTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  }
}

class FakeCollection {
  constructor(
    private readonly db: FakeTransactionalFirestore,
    readonly path: string,
    private readonly filters: readonly EqualityFilter[] = [],
  ) {}

  doc(id: string) {
    return new FakeDocument(this.db, `${this.path}/${id}`, id);
  }

  where(field: string, operator: "==", value: unknown) {
    if (operator !== "==") {
      throw new Error(`Unsupported fake Firestore operator: ${operator}`);
    }
    return new FakeQuery(this.db, this.path, [...this.filters, { field, value }]);
  }

  async get() {
    return querySnapshot(this.db, this.db.store, this.path, this.filters);
  }
}

interface EqualityFilter {
  field: string;
  value: unknown;
}

class FakeQuery {
  constructor(
    private readonly db: FakeTransactionalFirestore,
    readonly collectionPath: string,
    readonly filters: readonly EqualityFilter[],
    readonly limitCount?: number,
  ) {}

  where(field: string, operator: "==", value: unknown) {
    if (operator !== "==") {
      throw new Error(`Unsupported fake Firestore operator: ${operator}`);
    }
    return new FakeQuery(
      this.db,
      this.collectionPath,
      [...this.filters, { field, value }],
      this.limitCount,
    );
  }

  limit(count: number) {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error(`Unsupported fake Firestore limit: ${count}`);
    }
    return new FakeQuery(this.db, this.collectionPath, this.filters, count);
  }

  async get() {
    return querySnapshot(
      this.db,
      this.db.store,
      this.collectionPath,
      this.filters,
      this.limitCount,
    );
  }
}

class FakeDocument {
  constructor(
    private readonly db: FakeTransactionalFirestore,
    readonly path: string,
    readonly id: string,
  ) {}

  async get() {
    return documentSnapshot(this.db, this.db.store, this.path, this.id);
  }

  async create(data: Record<string, unknown>) {
    await this.db.createDocument(this.path, data);
  }

  async set(data: Record<string, unknown>) {
    await this.db.setDocument(this.path, data);
  }
}

class FakeTransaction {
  readonly documentReads = new Map<string, number>();
  readonly collectionReads = new Map<string, number>();
  readonly writes = new Map<string, PendingWrite>();

  constructor(
    private readonly db: FakeTransactionalFirestore,
    private readonly working: Map<string, Record<string, unknown>>,
    private readonly documentVersions: ReadonlyMap<string, number>,
    private readonly collectionVersions: ReadonlyMap<string, number>,
  ) {}

  async get(ref: FakeDocument | FakeQuery) {
    if (ref instanceof FakeDocument) {
      this.documentReads.set(ref.path, this.documentVersions.get(ref.path) ?? 0);
      return documentSnapshot(this.db, this.working, ref.path, ref.id);
    }
    this.collectionReads.set(
      ref.collectionPath,
      this.collectionVersions.get(ref.collectionPath) ?? 0,
    );
    return querySnapshot(
      this.db,
      this.working,
      ref.collectionPath,
      ref.filters,
      ref.limitCount,
    );
  }

  create(ref: FakeDocument, data: Record<string, unknown>) {
    if (this.working.has(ref.path)) throw new Error("already-exists");
    this.queueWrite(ref.path, "create", data);
  }

  set(ref: FakeDocument, data: Record<string, unknown>) {
    this.queueWrite(ref.path, "set", data);
  }

  update(ref: FakeDocument, data: Record<string, unknown>) {
    const current = this.working.get(ref.path);
    if (!current) throw new Error(`Document not found: ${ref.path}`);
    this.queueWrite(ref.path, "update", {
      ...structuredClone(current),
      ...structuredClone(data),
    });
  }

  delete(ref: FakeDocument) {
    const previous = this.writes.get(ref.path);
    this.working.delete(ref.path);
    this.writes.set(ref.path, {
      baseVersion: previous?.baseVersion ?? this.documentVersions.get(ref.path) ?? 0,
      kind: "delete",
    });
  }

  private queueWrite(
    path: string,
    kind: PendingDataWrite["kind"],
    data: Record<string, unknown>,
  ) {
    const previous = this.writes.get(path);
    const effectiveKind =
      previous?.kind === "create"
        ? "create"
        : previous?.kind === "delete"
          ? "set"
          : (previous?.kind ?? kind);
    const nextData = structuredClone(data);
    this.working.set(path, nextData);
    this.writes.set(path, {
      baseVersion: previous?.baseVersion ?? this.documentVersions.get(path) ?? 0,
      data: nextData,
      kind: effectiveKind,
    });
  }
}

type PendingWrite = PendingDeleteWrite | PendingDataWrite;

interface PendingDeleteWrite {
  baseVersion: number;
  kind: "delete";
}

interface PendingDataWrite {
  baseVersion: number;
  data: Record<string, unknown>;
  kind: "create" | "set" | "update";
}

interface CommitBarrier {
  arrived: number;
  participants: number;
  promise: Promise<void>;
  release: () => void;
  timer: ReturnType<typeof setTimeout>;
}

function documentSnapshot(
  db: FakeTransactionalFirestore,
  store: Map<string, Record<string, unknown>>,
  path: string,
  id: string,
) {
  const data = store.get(path);
  return {
    id,
    ref: new FakeDocument(db, path, id),
    exists: data !== undefined,
    data: () => (data ? structuredClone(data) : undefined),
  };
}

function querySnapshot(
  db: FakeTransactionalFirestore,
  store: Map<string, Record<string, unknown>>,
  collectionPath: string,
  filters: readonly EqualityFilter[],
  limitCount?: number,
) {
  const prefix = `${collectionPath}/`;
  const matchingDocs = Array.from(store.entries())
    .filter(
      ([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
    )
    .filter(([, data]) => filters.every(({ field, value }) => data[field] === value))
    .map(([path]) => documentSnapshot(db, store, path, path.slice(prefix.length)));
  const docs =
    limitCount === undefined ? matchingDocs : matchingDocs.slice(0, limitCount);
  return { docs, empty: docs.length === 0, size: docs.length };
}

function cloneStore(store: Map<string, Record<string, unknown>>) {
  return new Map(
    Array.from(store.entries()).map(([path, data]) => [path, structuredClone(data)]),
  );
}

function collectionPathForDocument(path: string) {
  const segments = path.split("/");
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(`Invalid fake Firestore document path: ${path}`);
  }
  return segments.slice(0, -1).join("/");
}
