import { describe, expect, it } from "vitest";

import {
  PREFERRED_MIME_TYPES,
  RECORDER_MESSAGES,
  negotiateMimeType,
} from "@/components/hooks/useAudioRecorder";

describe("negotiateMimeType (G3)", () => {
  it("prefers webm/opus when the browser supports it (Chrome/Android)", () => {
    const result = negotiateMimeType((type) => type === "audio/webm;codecs=opus");
    expect(result.supportedType).toBe("audio/webm;codecs=opus");
    expect(result.mp4Only).toBe(false);
  });

  it("falls back through the preference list in order", () => {
    const result = negotiateMimeType((type) => type === "audio/ogg;codecs=opus");
    expect(result.supportedType).toBe("audio/ogg;codecs=opus");
    // The preference order puts webm before ogg.
    expect(PREFERRED_MIME_TYPES.indexOf("audio/webm")).toBeLessThan(
      PREFERRED_MIME_TYPES.indexOf("audio/ogg;codecs=opus"),
    );
  });

  it("reports mp4Only when only audio/mp4 is available (Safari/iPhone)", () => {
    const result = negotiateMimeType((type) => type === "audio/mp4");
    expect(result.supportedType).toBeNull();
    expect(result.mp4Only).toBe(true);
  });

  it("reports no support (not mp4Only) when nothing is supported", () => {
    const result = negotiateMimeType(() => false);
    expect(result.supportedType).toBeNull();
    expect(result.mp4Only).toBe(false);
  });

  it("has an honest, distinct message for the Safari/mp4 case", () => {
    expect(RECORDER_MESSAGES.mp4Only).toContain("Safari");
    expect(RECORDER_MESSAGES.mp4Only).not.toBe(RECORDER_MESSAGES.unsupported);
  });
});
