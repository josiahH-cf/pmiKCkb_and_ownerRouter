import { expect, it, vi } from "vitest";
import { warmUp } from "../e2e/global-setup.mjs";
it("authenticates before warming every exercised Space detail route and consumes the render", async () => {
  const body = vi.fn(async () => "isolated render");
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: body,
    headers: { getSetCookie: () => ["__session=isolated; Path=/; HttpOnly"] },
  }));
  await warmUp({ origin: "http://localhost:4310", fetchImpl });
  expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:4310/api/auth/demo");
  expect(fetchImpl.mock.calls[0][1].body).toBe('{"role":"Admin"}');
  for (const route of ["/spaces/lease-renewals", "/spaces/owner-email"]) {
    const call = fetchImpl.mock.calls.find(
      ([url]) => url === `http://localhost:4310${route}`,
    );
    expect(call?.[1].headers.cookie).toBe("__session=isolated");
  }
  expect(body.mock.calls.length).toBe(fetchImpl.mock.calls.length);
});
