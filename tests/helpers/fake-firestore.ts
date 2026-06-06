export class FakeFirestore {
  readonly store = new Map<string, Record<string, unknown>>();

  collection(name: string) {
    return new FakeCollection(this, name);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
    return callback(new FakeTransaction(this));
  }

  seed(path: string, data: Record<string, unknown>) {
    this.store.set(path, structuredClone(data));
  }
}

class FakeCollection {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
  ) {}

  doc(id: string) {
    return new FakeDocument(this.db, `${this.path}/${id}`, id);
  }

  where(field: string, operator: "==", value: unknown) {
    if (operator !== "==") {
      throw new Error(`Unsupported fake Firestore operator: ${operator}`);
    }

    return new FakeQuery(this.db, this.path, field, value);
  }

  async get() {
    return collectionSnapshot(this.db, this.path);
  }
}

class FakeDocument {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
    readonly id: string,
  ) {}

  async get() {
    return documentSnapshot(this.db, this.path, this.id);
  }

  async set(data: Record<string, unknown>) {
    this.db.store.set(this.path, resolveSentinels(data));
  }
}

class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly collectionPath: string,
    private readonly field: string,
    private readonly value: unknown,
  ) {}

  async get() {
    const snapshot = await collectionSnapshot(this.db, this.collectionPath);

    return {
      docs: snapshot.docs.filter((doc) => {
        const data = doc.data();
        return data ? data[this.field] === this.value : false;
      }),
    };
  }
}

class FakeTransaction {
  constructor(private readonly db: FakeFirestore) {}

  async get(ref: { get: () => Promise<unknown> }) {
    return ref.get();
  }

  set(ref: FakeDocument, data: Record<string, unknown>) {
    this.db.store.set(ref.path, resolveSentinels(data));
  }

  update(ref: FakeDocument, data: Record<string, unknown>) {
    const current = this.db.store.get(ref.path);

    if (!current) {
      throw new Error(`Document not found: ${ref.path}`);
    }

    this.db.store.set(ref.path, applyUpdate(current, data));
  }
}

function collectionSnapshot(db: FakeFirestore, collectionPath: string) {
  const prefix = `${collectionPath}/`;
  const docs = Array.from(db.store.entries())
    .filter(
      ([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"),
    )
    .map(([path, data]) =>
      documentSnapshot(db, path, path.slice(prefix.length), structuredClone(data)),
    );

  return { docs };
}

function documentSnapshot(
  db: FakeFirestore,
  path: string,
  id: string,
  overrideData?: Record<string, unknown>,
) {
  const data = overrideData ?? db.store.get(path);

  return {
    id,
    exists: Boolean(data),
    data: () => (data ? structuredClone(data) : undefined),
  };
}

function resolveSentinels(value: unknown): Record<string, unknown> {
  return resolveValue(value) as Record<string, unknown>;
}

function applyUpdate(current: Record<string, unknown>, update: Record<string, unknown>) {
  const next = { ...current };

  for (const [key, value] of Object.entries(update)) {
    if (isDelete(value)) {
      delete next[key];
    } else {
      next[key] = resolveValue(value);
    }
  }

  return next;
}

function resolveValue(value: unknown): unknown {
  if (isServerTimestamp(value)) {
    return "2026-05-27T00:00:00.000Z";
  }

  if (Array.isArray(value)) {
    return value.map(resolveValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, resolveValue(childValue)]),
    );
  }

  return value;
}

function isServerTimestamp(value: unknown) {
  return (
    value &&
    typeof value === "object" &&
    value.constructor.name === "ServerTimestampTransform"
  );
}

function isDelete(value: unknown) {
  return (
    value && typeof value === "object" && value.constructor.name === "DeleteTransform"
  );
}
