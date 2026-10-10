import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { verifyCommunicationWorkerAssurance } from "../../scripts/communication-worker-assurance.mjs";
const cp = {
  sha: "a".repeat(40),
  revision: "pmi-kc-app-fixture-1",
  candidateOrigin: "https://cand-fixture-1---pmi-kc-app-kq6wuvpiva-uc.a.run.app",
};
function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "pmi-worker-assurance-"));
  const original = {
    name: "projects/pmi-kc-kb-prod/locations/us-central1/jobs/pmi-kc-communication-worker-readiness",
    state: "PAUSED",
    schedule: "0 0 1 1 *",
    attemptDeadline: "120s",
    retryConfig: { retryCount: 0 },
    httpTarget: {
      httpMethod: "GET",
      uri: "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/gmail-hub/sequence-worker",
      oidcToken: {
        serviceAccountEmail: "pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com",
        audience:
          "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/gmail-hub/sequence-worker",
      },
    },
  };
  let job = structuredClone(original),
    clock = Date.parse("2026-10-10T12:00:00Z"),
    runs = 0;
  if (options.badIdentity)
    job.httpTarget.oidcToken.serviceAccountEmail =
      "unapproved@pmi-kc-kb-prod.iam.gserviceaccount.com";
  const calls = [];
  const file = join(root, `communication-worker-${cp.revision}.json`);
  const read = () => JSON.parse(readFileSync(file, "utf8"));
  const client = {
    request: async (request) => {
      calls.push(request);
      expect(request.retry).toBe(false);
      if (request.url.includes("logging.googleapis.com")) {
        const id = job.httpTarget.headers?.["X-PMI-Worker-Readiness"];
        return {
          data: {
            entries: options.noReadback
              ? []
              : [
                  {
                    jsonPayload: {
                      event: "communication_worker_readiness",
                      probeId: id,
                      ready: true,
                    },
                  },
                ],
          },
        };
      }
      if (request.method === "PATCH") {
        job.httpTarget = structuredClone(request.data.httpTarget);
        return { data: structuredClone(job) };
      }
      if (request.url.endsWith(":run")) {
        runs++;
        expect(read().phase).toBe("dispatch_pending");
        expect(job.httpTarget.httpMethod).toBe("GET");
        if (options.lostResponse) throw new Error("uncertain_run_response");
      }
      return { data: structuredClone(job) };
    },
  };
  return {
    root,
    original,
    client,
    calls,
    read,
    get runs() {
      return runs;
    },
    get job() {
      return job;
    },
    config: {
      stateRoot: root,
      client,
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
      deadlineMs: 6000,
    },
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
it("one durably claimed managed GET proves exact candidate readiness and restores the paused canonical job; exact receipt resume never reruns", async () => {
  const f = fixture();
  try {
    expect((await verifyCommunicationWorkerAssurance(cp, f.config)).verified).toBe(true);
    expect(f.runs).toBe(1);
    expect(f.job).toEqual(f.original);
    expect(f.read()).toMatchObject({
      sha: cp.sha,
      revision: cp.revision,
      outcome: "passed",
      restored: true,
    });
    expect((await verifyCommunicationWorkerAssurance(cp, f.config)).verified).toBe(true);
    expect(f.runs).toBe(1);
  } finally {
    f.close();
  }
});
it("a wrong managed identity fails before patch or invocation", async () => {
  const f = fixture({ badIdentity: true });
  try {
    await expect(verifyCommunicationWorkerAssurance(cp, f.config)).rejects.toThrow(
      "configuration_unverified",
    );
    expect(f.runs).toBe(0);
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  } finally {
    f.close();
  }
});
it.each([{ lostResponse: true }, { noReadback: true }])(
  "uncertain or absent readback remains failed, restores configuration and cannot consume a second invocation: %s",
  async (options) => {
    const f = fixture(options);
    try {
      await expect(verifyCommunicationWorkerAssurance(cp, f.config)).rejects.toThrow();
      expect(f.runs).toBe(1);
      expect(f.job).toEqual(f.original);
      expect(f.read()).toMatchObject({ outcome: "failed", restored: true });
      const before = readFileSync(
        join(f.root, `communication-worker-${cp.revision}.json`),
        "utf8",
      );
      await expect(verifyCommunicationWorkerAssurance(cp, f.config)).rejects.toThrow(
        "reconciliation_required",
      );
      expect(f.runs).toBe(1);
      expect(
        readFileSync(join(f.root, `communication-worker-${cp.revision}.json`), "utf8"),
      ).toBe(before);
    } finally {
      f.close();
    }
  },
);
it("an unrelated candidate origin cannot choose a target", async () => {
  const f = fixture();
  try {
    await expect(
      verifyCommunicationWorkerAssurance(
        { ...cp, candidateOrigin: "https://attacker.example" },
        f.config,
      ),
    ).rejects.toThrow("binding_invalid");
    expect(f.calls).toEqual([]);
  } finally {
    f.close();
  }
});
