// S165: the two server pieces of the mobile sign-in repair.
//
// 1. GET /api/auth/session answers only whether this browser holds a usable staff session, so the
//    sign-in page can tell a person when their browser did not keep it.
// 2. The same-origin sign-in helper relay is inert until the explicit same-origin key is set, and
//    when active relays only the fixed helper pages without any credential in either direction.

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as helperGet } from "@/app/api/auth/helper/[...path]/route";
import { GET as sessionGet } from "@/app/api/auth/session/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

afterEach(() => {
  setAuthResolverForTest(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("S165 session check (BEH-S165-9)", () => {
  it("answers 204 with no body or identity for a usable staff session", async () => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      uid: "editor-1",
    }));

    const response = await sessionGet();

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("answers 401 when the browser holds no session", async () => {
    setAuthResolverForTest(() => null);

    const response = await sessionGet();

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("BEH-S165-2: a Vendor identity or a disallowed domain is not a staff session", async () => {
    setAuthResolverForTest(() => ({
      email: "vendor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      uid: "vendor-1",
      vendor: true,
    }));
    expect((await sessionGet()).status).toBe(401);

    setAuthResolverForTest(() => ({
      email: "person@elsewhere.example",
      hd: "elsewhere.example",
      role: "Editor",
      uid: "outside-1",
    }));
    expect((await sessionGet()).status).toBe(401);
  });
});

describe("S165 same-origin sign-in helper relay (ARCH-S165-1, AC-S165-1)", () => {
  function helperRequest(path: string, headers: Record<string, string> = {}) {
    const url = new URL(`https://app.example.test/api/auth/helper/${path}`);
    const segments = url.pathname.replace("/api/auth/helper/", "").split("/");
    return helperGet(new Request(url, { headers }), {
      params: Promise.resolve({ path: segments }),
    });
  }

  function activate() {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST", "app.example.test");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "example-project.firebaseapp.com");
  }

  it("answers 404 and contacts nothing until the same-origin key is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "example-project.firebaseapp.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await helperRequest("auth/handler?apiKey=k");

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays a helper page from the project's Firebase helper domain without any credential", async () => {
    activate();
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>helper</html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "max-age=3600",
            "set-cookie": "upstream=1",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await helperRequest(
      "auth/handler?apiKey=k&authType=signInViaRedirect",
      {
        accept: "text/html",
        authorization: "Bearer staff-token",
        cookie: "__session=staff-session",
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>helper</html>");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("set-cookie")).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://example-project.firebaseapp.com/__/auth/handler?apiKey=k&authType=signInViaRedirect",
    );
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual({ accept: "text/html" });
  });

  it("refuses a path outside the helper locations even when active", async () => {
    activate();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await helperRequest("firestore/data")).status).toBe(404);
    expect((await helperRequest("auth/../secret")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow an upstream redirect off this origin, and reports an unreachable helper", async () => {
    activate();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.example/" },
          }),
      ),
    );
    const redirected = await helperRequest("auth/handler");
    expect(redirected.status).toBe(502);
    expect(redirected.headers.get("location")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect((await helperRequest("auth/handler")).status).toBe(502);
  });
});
