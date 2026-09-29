import { Firestore as CloudFirestore } from "@google-cloud/firestore";
import {
  FieldValue,
  Firestore,
  getFirestore,
  initializeFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { expectUnitFirestoreRefusals } from "../setup/unit-firestore-isolation";

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminApp: vi.fn(() => {
    throw new Error("unexpected_unit_firebase_app_initialization");
  }),
}));

describe("unit Firestore isolation", () => {
  it("refuses a missing application store double before Firebase app initialization", () => {
    expect(getAdminFirestore).toThrow("unit_requires_explicit_firestore_double");
    expect(getFirebaseAdminApp).not.toHaveBeenCalled();
    expectUnitFirestoreRefusals(1);
  });

  it("refuses direct SDK clients even after resetting mocks", () => {
    vi.resetAllMocks();
    expect(getFirestore).toThrow("unit_requires_explicit_firestore_double");
    expect(() =>
      initializeFirestore({} as Parameters<typeof initializeFirestore>[0], {}),
    ).toThrow("unit_requires_explicit_firestore_double");
    expect(() => new Firestore()).toThrow("unit_requires_explicit_firestore_double");
    expect(() => new CloudFirestore()).toThrow("unit_requires_explicit_firestore_double");
    expectUnitFirestoreRefusals(4);
  });

  it("preserves pure SDK values needed by explicit in-memory store doubles", () => {
    expect(Timestamp.fromMillis(1_000).toMillis()).toBe(1_000);
    expect(FieldValue.delete().isEqual(FieldValue.delete())).toBe(true);
    expect(FieldValue.serverTimestamp().isEqual(FieldValue.serverTimestamp())).toBe(true);
  });
});
