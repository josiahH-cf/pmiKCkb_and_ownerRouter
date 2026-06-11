import { inject } from "vitest";

export function e2eBaseUrl() {
  try {
    const provided = inject("e2eBaseUrl");

    if (provided) {
      return provided;
    }
  } catch {
    // inject is only available inside a vitest run with globalSetup.
  }

  return `http://localhost:${process.env.E2E_PORT ?? 4310}`;
}

// Minimal cookie-jar HTTP client. All requests use redirect: "manual" so guard
// redirects stay assertable.
export function createClient(baseUrl = e2eBaseUrl()) {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  function storeCookies(response) {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(";");
      const separator = pair.indexOf("=");

      if (separator > 0) {
        jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  async function request(path, { headers = {}, ...init } = {}) {
    const requestHeaders = { ...headers };
    const cookies = cookieHeader();

    if (cookies) {
      requestHeaders.cookie = cookies;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      ...init,
      headers: requestHeaders,
    });

    storeCookies(response);
    return response;
  }

  return {
    request,
    get: (path) => request(path),
    getHtml: async (path) => {
      const response = await request(path);
      return { response, html: await response.text() };
    },
    sendJson: (method, path, body) =>
      request(path, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method,
      }),
    postJson(path, body) {
      return this.sendJson("POST", path, body);
    },
    putJson(path, body) {
      return this.sendJson("PUT", path, body);
    },
    async signInDemo(role = "Admin") {
      const response = await request("/api/auth/demo", {
        body: JSON.stringify({ role }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (response.status !== 200) {
        throw new Error(`Demo sign-in failed with status ${response.status}.`);
      }

      if (!jar.has("__session")) {
        throw new Error("Demo sign-in did not set a session cookie.");
      }

      return response.json();
    },
    cookies: jar,
  };
}

export function locationPath(response) {
  const location = response.headers.get("location");

  if (!location) {
    return null;
  }

  const url = new URL(location, "http://localhost");
  return `${url.pathname}${url.search}`;
}
