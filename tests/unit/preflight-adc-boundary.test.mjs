import { beforeEach, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  ensure: vi.fn(),
  client: vi.fn(async () => ({ getAccessToken: async () => ({ token: "isolated" }) })),
}));
vi.mock("../../scripts/auth/ensure.mjs", () => ({ ensureAuthenticated: probes.ensure }));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getClient = probes.client;
  },
}));
import { main } from "../../scripts/preflight-adc.mjs";

beforeEach(() => vi.clearAllMocks());

it.each([0, 1])(
  "uses the approved identity/store assessment before ADC readiness: %s",
  async (exitCode) => {
    probes.ensure.mockResolvedValue({
      exitCode,
      lines: [exitCode ? "ADC identity unverified" : "ADC token refresh verified"],
    });
    const output = vi.fn();
    expect(await main({ output })).toBe(exitCode);
    expect(probes.ensure).toHaveBeenCalledExactlyOnceWith({
      need: ["adc"],
      unattended: true,
    });
    expect(probes.client).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(
      exitCode ? "ADC identity unverified" : "ADC token refresh verified",
    );
  },
);

it("reduces unexpected preflight errors to a bodyless refusal", async () => {
  probes.ensure.mockRejectedValue(new Error("isolated private provider body"));
  const output = vi.fn();
  expect(await main({ output })).toBe(1);
  expect(probes.client).not.toHaveBeenCalled();
  expect(output).toHaveBeenCalledWith(
    "ADC preflight could not verify the approved local credentials.",
  );
  expect(JSON.stringify(output.mock.calls)).not.toContain("private provider body");
});
