import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("S67 feedback dictation structural boundary", () => {
  it("reuses the shared recorder and never implements or renders an audio sink", () => {
    const component = source("components/feedback/ReportIssueButton.tsx");

    expect(component).toContain("useAudioRecorder");
    expect(component).toContain('fetch("/api/report-issue/transcribe"');
    expect(component).not.toMatch(/MediaRecorder|getUserMedia|createObjectURL/);
    expect(component).not.toMatch(
      /<audio|localStorage|sessionStorage|indexedDB|console\./i,
    );
  });

  it("keeps the transcription route provider-only and excludes report/context/write dependencies", () => {
    const route = source("app/api/report-issue/transcribe/route.ts");
    const schema = route.slice(
      route.indexOf("const TranscribeRequestSchema"),
      route.indexOf("const SPEECH_ERROR_MESSAGES"),
    );

    expect(route).toContain('requireCapability("read")');
    expect(route).toContain("createSpeechToTextProvider(readServerConfig())");
    expect(route).toContain(".strict()");
    expect(schema).toContain("audioBase64");
    expect(schema).toContain("mimeType");
    expect(schema).not.toMatch(/description|context|report|identity|destination/i);
    expect(route).not.toMatch(
      /firestore|createSupportReport|sendInternal|action-registry|google-auth-library|console\./i,
    );
    expect(route).not.toMatch(/error\.message|error\.detail/);
  });

  it("keeps audio and modality fields out of every feedback persistence or notice sink", () => {
    const sinks = [
      "app/api/report-issue/route.ts",
      "lib/firestore/support-reports.ts",
      "lib/notifications/internal-transactional.ts",
      "lib/notifications/internal-transactional-sender.ts",
    ]
      .map(source)
      .join("\n");
    const types = source("lib/firestore/types.ts").slice(
      source("lib/firestore/types.ts").indexOf("export type SupportReportStatus"),
      source("lib/firestore/types.ts").indexOf(
        "export interface ApprovalQueueNotificationHealth",
      ),
    );

    expect(sinks).not.toMatch(/audio|voice|dictation|modality|mime/i);
    expect(types).not.toMatch(/audio|voice|dictation|modality|mime/i);
    expect(types).toContain('"new" | "acknowledged" | "resolved"');
  });

  it("pins a scroll-safe 390 by 844 dialog with reachable full-width controls", () => {
    const css = source("app/globals.css");
    const reportStyles = css.slice(
      css.indexOf(".report-issue-dialog"),
      css.indexOf("/* Idle session-timeout warning dialog"),
    );

    expect(reportStyles).toContain("max-height: calc(100dvh");
    expect(reportStyles).toContain("overflow-y: auto");
    expect(reportStyles).toContain("@media (max-width: 400px)");
    expect(reportStyles).toContain("flex: 1 1 100%");
  });
});
