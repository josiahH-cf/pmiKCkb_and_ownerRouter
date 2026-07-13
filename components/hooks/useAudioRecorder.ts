"use client";

// Shared audio-recorder hook (S13 Wave 3 G2/G3). One place for the MediaRecorder lifecycle that the
// maintenance capture desk and the Console both used to duplicate: mime-type negotiation
// (MediaRecorder.isTypeSupported), ~55s auto-stop (the v1 sync recognize limit), permission/unsupported
// handling, and an HONEST Safari/iPhone message when the only format available is one we can't
// transcribe yet (audio/mp4). Transcription itself stays with each caller (different endpoints), which
// is where the network-error catch and empty-transcript hint live.

import { useCallback, useEffect, useRef, useState } from "react";

/** Recording mime types we can transcribe, most-preferred first (Google STT v1 sync accepts opus). */
export const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export interface MimeSupport {
  /** The first transcribable type the browser supports, or null when none is. */
  supportedType: string | null;
  /** True when the browser only offers a format STT can't accept yet (Safari/iPhone audio/mp4). */
  mp4Only: boolean;
}

/** Pure mime negotiation (isSupported injectable for tests). Prefers opus; detects the mp4-only case. */
export function negotiateMimeType(
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(type),
): MimeSupport {
  for (const type of PREFERRED_MIME_TYPES) {
    if (isSupported(type)) return { supportedType: type, mp4Only: false };
  }
  const mp4Only = isSupported("audio/mp4") || isSupported("audio/aac");
  return { supportedType: null, mp4Only };
}

export const RECORDER_MESSAGES = {
  unsupported: "Voice input isn't available in this browser. Type instead.",
  mp4Only:
    "This browser (Safari/iPhone) records audio in a format we can't transcribe yet. Use Chrome on this device, or type instead.",
  permission: "Microphone unavailable or permission denied. Type instead.",
  autoStop: "Recording reached the ~55 second limit and stopped.",
  handleError: "Something went wrong handling the recording. Type instead.",
} as const;

export interface UseAudioRecorderOptions {
  /** Called with the recorded blob once recording stops. Do the transcription here. */
  onRecording: (blob: Blob) => void | Promise<void>;
  /** User-facing error/blocking messages (unsupported, mp4-only, permission). */
  onError?: (message: string) => void;
  /** Non-blocking status (e.g. the auto-stop notice). */
  onStatus?: (message: string) => void;
  /** Lifecycle signal for visible/assistive status owned by the caller. */
  onLifecycle?: (phase: AudioRecorderPhase) => void;
  /** Auto-stop after this many ms (default 55s, under the v1 sync recognize limit). */
  maxDurationMs?: number;
}

export interface AudioRecorderControls {
  isRecording: boolean;
  phase: AudioRecorderPhase;
  toggleRecording: () => Promise<void>;
}

export type AudioRecorderPhase =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "processing"
  | "error";

export function useAudioRecorder({
  onRecording,
  onError,
  onStatus,
  onLifecycle,
  maxDurationMs = 55_000,
}: UseAudioRecorderOptions): AudioRecorderControls {
  const [isRecording, setIsRecording] = useState(false);
  const [phase, setPhase] = useState<AudioRecorderPhase>("idle");
  const phaseRef = useRef<AudioRecorderPhase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const transition = useCallback(
    (next: AudioRecorderPhase) => {
      phaseRef.current = next;
      if (mountedRef.current) setPhase(next);
      onLifecycle?.(next);
    },
    [onLifecycle],
  );

  const clearAutoStop = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearAutoStop();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
    },
    [clearAutoStop],
  );

  const toggleRecording = useCallback(async () => {
    const active = recorderRef.current;
    if (active && active.state !== "inactive") {
      if (phaseRef.current !== "recording") return;
      transition("stopping");
      active.stop();
      return;
    }

    // Ignore rapid duplicate starts and actions while stop/transcription is settling.
    if (
      phaseRef.current === "requesting-permission" ||
      phaseRef.current === "stopping" ||
      phaseRef.current === "processing"
    ) {
      return;
    }

    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia || typeof MediaRecorder === "undefined") {
      transition("error");
      onError?.(RECORDER_MESSAGES.unsupported);
      return;
    }

    const support = negotiateMimeType();
    if (!support.supportedType) {
      transition("error");
      onError?.(
        support.mp4Only ? RECORDER_MESSAGES.mp4Only : RECORDER_MESSAGES.unsupported,
      );
      return;
    }

    try {
      transition("requesting-permission");
      const stream = await media.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: support.supportedType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        clearAutoStop();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mountedRef.current) setIsRecording(false);
        recorderRef.current = null;
        transition("processing");
        const blob = new Blob(chunks, {
          type: recorder.mimeType || support.supportedType!,
        });
        try {
          await onRecording(blob);
        } catch {
          transition("error");
          onError?.(RECORDER_MESSAGES.handleError);
          return;
        }
        transition("idle");
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      transition("recording");
      autoStopRef.current = setTimeout(() => {
        const active = recorderRef.current;
        if (active && active.state !== "inactive") {
          onStatus?.(RECORDER_MESSAGES.autoStop);
          active.stop();
        }
      }, maxDurationMs);
    } catch {
      transition("error");
      onError?.(RECORDER_MESSAGES.permission);
    }
  }, [onRecording, onError, onStatus, maxDurationMs, clearAutoStop, transition]);

  return { isRecording, phase, toggleRecording };
}
