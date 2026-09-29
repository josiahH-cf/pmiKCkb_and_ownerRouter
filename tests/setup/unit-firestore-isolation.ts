import { afterEach, expect, vi } from "vitest";

const refusals = vi.hoisted(() => ({ count: 0 }));

// A warm-cache fallback may catch the refusal. Still fail its test so missing isolation cannot
// silently turn an intended successful store operation into an unasserted fallback.
afterEach(() => {
  const count = refusals.count;
  refusals.count = 0;
  expect(count, "unit test attempted Firestore access without an explicit double").toBe(
    0,
  );
});

// Only the guard's own regression tests deliberately trigger these refusals.
export function expectUnitFirestoreRefusals(expected: number) {
  expect(refusals.count).toBe(expected);
  refusals.count = 0;
}

// Unit fixtures must supply an explicit store double. A forgotten mock must never discover
// the developer's ADC or reach a real database. The separate Firestore suite uses its emulator.
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore() {
    refusals.count += 1;
    throw new Error("unit_requires_explicit_firestore_double");
  },
}));

// Keep pure SDK values (Timestamp, FieldValue, etc.) available to store doubles, while also
// refusing callers that bypass the application's adapter. Plain functions survive mock resets.
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  const refuse = () => {
    refusals.count += 1;
    throw new Error("unit_requires_explicit_firestore_double");
  };
  return {
    ...actual,
    getFirestore: refuse,
    initializeFirestore: refuse,
    Firestore: class {
      constructor() {
        refuse();
      }
    },
  };
});

vi.mock("@google-cloud/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google-cloud/firestore")>();
  return {
    ...actual,
    Firestore: class {
      constructor() {
        refusals.count += 1;
        throw new Error("unit_requires_explicit_firestore_double");
      }
    },
  };
});
