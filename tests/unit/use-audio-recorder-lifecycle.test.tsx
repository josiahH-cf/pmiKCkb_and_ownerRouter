// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECORDER_MESSAGES,
  useAudioRecorder,
  type AudioRecorderPhase,
} from "@/components/hooks/useAudioRecorder";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function streamWith(trackStop = vi.fn()) {
  return {
    stream: { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream,
    trackStop,
  };
}

function installRecorder(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
  class FakeMediaRecorder {
    static isTypeSupported(type: string) {
      return type === "audio/webm;codecs=opus";
    }
    mimeType = "audio/webm;codecs=opus";
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: (() => void | Promise<void>) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) } as BlobEvent);
      void this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  return navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
}

describe("useAudioRecorder lifecycle", () => {
  it("publishes permission, recording, stopping, and processing phases in order", async () => {
    const phases: AudioRecorderPhase[] = [];
    const { stream } = streamWith();
    installRecorder(async () => stream);
    const onRecording = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecording, onLifecycle: (phase) => phases.push(phase) }),
    );

    await act(() => result.current.toggleRecording());
    expect(result.current.phase).toBe("recording");
    await act(() => result.current.toggleRecording());
    await waitFor(() => expect(onRecording).toHaveBeenCalledTimes(1));
    expect(phases).toEqual([
      "requesting-permission",
      "recording",
      "stopping",
      "processing",
      "idle",
    ]);
  });

  it("suppresses rapid duplicate permission requests", async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      resolvePermission = resolve;
    });
    const getUserMedia = installRecorder(() => permission);
    const { result } = renderHook(() => useAudioRecorder({ onRecording: vi.fn() }));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggleRecording();
      second = result.current.toggleRecording();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    resolvePermission(streamWith().stream);
    await act(async () => Promise.all([first, second]));
    expect(result.current.phase).toBe("recording");
  });

  it("reports permission denial and cleans up an active stream on unmount", async () => {
    const onError = vi.fn();
    installRecorder(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const denied = renderHook(() => useAudioRecorder({ onRecording: vi.fn(), onError }));
    await act(() => denied.result.current.toggleRecording());
    expect(denied.result.current.phase).toBe("error");
    expect(onError).toHaveBeenCalledWith(RECORDER_MESSAGES.permission);
    denied.unmount();

    const { stream, trackStop } = streamWith();
    installRecorder(async () => stream);
    const active = renderHook(() => useAudioRecorder({ onRecording: vi.fn() }));
    await act(() => active.result.current.toggleRecording());
    active.unmount();
    expect(trackStop).toHaveBeenCalled();
  });

  it("lets the user cancel an unresolved permission request and stops a late stream", async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      resolvePermission = resolve;
    });
    installRecorder(() => permission);
    const onStatus = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecording: vi.fn(), onStatus }),
    );

    let start!: Promise<void>;
    act(() => {
      start = result.current.toggleRecording();
    });
    expect(result.current.phase).toBe("requesting-permission");
    act(() => result.current.cancelPermissionRequest());
    expect(result.current.phase).toBe("idle");
    expect(onStatus).toHaveBeenCalledWith(RECORDER_MESSAGES.permissionCancelled);

    const { stream, trackStop } = streamWith();
    resolvePermission(stream);
    await act(() => start);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(false);
  });

  it("times out an unresolved permission request and ignores a late grant", async () => {
    vi.useFakeTimers();
    let resolvePermission!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      resolvePermission = resolve;
    });
    installRecorder(() => permission);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ onRecording: vi.fn(), onError, permissionTimeoutMs: 25 }),
    );

    let start!: Promise<void>;
    act(() => {
      start = result.current.toggleRecording();
    });
    act(() => vi.advanceTimersByTime(25));
    expect(result.current.phase).toBe("error");
    expect(onError).toHaveBeenCalledWith(RECORDER_MESSAGES.permissionTimeout);

    const { stream, trackStop } = streamWith();
    resolvePermission(stream);
    await act(() => start);
    expect(trackStop).toHaveBeenCalledTimes(1);
  });
});
