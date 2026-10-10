import { it, expect } from "vitest";
import {
  BusinessProfileSchema,
  profileSignature,
  profileFromRetainedSignature,
  DisplayNameSchema,
  applicationDisplayName,
} from "@/lib/staff/business-profile";
import { PRODUCT_NAME } from "@/lib/constants";
it("omits blank optional contact data and preserves useful retained values without granting a role", () => {
  const p = {
    name: "Fixture staff",
    businessTitle: "Property Manager",
    phone: "",
    hours: "",
    website: "",
    source: "Fixture approved business contact",
  };
  expect(profileSignature(p)).toMatchObject({
    name: "Fixture staff",
    role: "Property Manager",
    phone: null,
    hours: null,
    website: null,
  });
  expect(profileFromRetainedSignature(profileSignature(p))).toEqual(p);
  expect(BusinessProfileSchema.safeParse({ ...p, role: "Admin" }).success).toBe(false);
});
it("preserves the default until chosen and rejects markup, controls and unsafe websites", () => {
  expect(applicationDisplayName(null)).toBe(PRODUCT_NAME);
  expect(applicationDisplayName("")).toBe(PRODUCT_NAME);
  expect(applicationDisplayName("Fixture Application")).toBe("Fixture Application");
  for (const name of ["<img src=x onerror=alert(1)>", "Name\nInjected", "x".repeat(101)])
    expect(DisplayNameSchema.safeParse(name).success).toBe(false);
  expect(
    BusinessProfileSchema.safeParse({
      name: "Fixture",
      businessTitle: "",
      phone: "",
      hours: "",
      website: "javascript:alert(1)",
      source: "Fixture",
    }).success,
  ).toBe(false);
});
