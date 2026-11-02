import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLocalRentVine } from "../../scripts/auth/local-rentvine-health.mjs";

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function config(
  base = "https://pmikcmetro.rentvine.com/api/manager/",
  key = "synthetic-test-key",
) {
  const root = await mkdtemp(join(tmpdir(), "pmi-local-auth-"));
  roots.push(root);
  await writeFile(
    join(root, ".env.local"),
    `RENTVINE_API_BASE_URL='${base}'\nRENTVINE_API_KEY='${key}'\nRENTVINE_API_SECRET='synthetic-test-secret'\n`,
  );
  return root;
}
describe("actual local RentVine credential health", () => {
  it("parses the ignored file and performs only a bounded metadata read without returning secrets", async () => {
    const createClient = vi.fn(() => ({ listLeaseStatuses: async () => [{}, {}] }));
    const result = await checkLocalRentVine({ configRoot: await config(), createClient });
    expect(result.state).toBe("ok");
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "synthetic-test-key",
        apiSecret: "synthetic-test-secret",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("synthetic-test");
  });
  it("refuses another account before making a provider call", async () => {
    const createClient = vi.fn();
    await expect(
      checkLocalRentVine({
        configRoot: await config("https://other.rentvine.com/api/manager/"),
        createClient,
      }),
    ).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("refuses missing keys instead of treating configuration presence as authentication", async () => {
    const createClient = vi.fn();
    await expect(
      checkLocalRentVine({ configRoot: await config(undefined, ""), createClient }),
    ).rejects.toThrow("local_rentvine_credentials_missing");
    expect(createClient).not.toHaveBeenCalled();
  });
});
