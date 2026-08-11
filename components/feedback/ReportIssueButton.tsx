"use client";

// Global signed-in feedback affordance (TIX-1/2/5/9, S67). The one existing dialog accepts optional
// typed text and optional short-clip dictation. Dictation only appends editable words; the explicit
// Send feedback action remains the sole report-creation boundary.
//
// PRIVACY (TIX-8, AC-S67-7/9): context is stable element identity only. Never capture a label,
// rendered/input text, query string, screenshot, clipboard, transcript, or audio as context. Raw
// audio exists only in the current browser request lifecycle and is aborted/discarded on every exit.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECORDER_MESSAGES, useAudioRecorder } from "@/components/hooks/useAudioRecorder";
import { Button, Field } from "@/components/ui";

const MAX_DESCRIPTION_CHARACTERS = 2_000;
const MAX_RECORDING_SECONDS = 55;

type ElementHint = {
  tag: string;
  role?: string;
  type?: string;
  id?: string;
  testId?: string;
};

type SubmitStatus = "idle" | "sending" | "sent" | "notice" | "error";

// Identity only. `aria-label`, values, and textContent can carry customer or staff data.
function describeElement(node: EventTarget | null): ElementHint | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  return {
    tag: node.tagName.toLowerCase(),
    role: node.getAttribute("role") ?? undefined,
    type: node.getAttribute("type") ?? undefined,
    id: node.id || undefined,
    testId: node.getAttribute("data-testid") ?? undefined,
  };
}

/** AC-S67-2/5: preserve all existing text and append every nonblank clip without truncation. */
export function appendFeedbackTranscript(existing: string, transcript: string): string {
  const words = transcript.trim();
  if (words === "") return existing;
  return `${existing}${existing.trim() === "" ? "" : "\n\n"}${words}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
}

function formatRecordingTime(seconds: number): string {
  return `0:${String(seconds).padStart(2, "0")}`;
}

export function ReportIssueButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const [dictationStatus, setDictationStatus] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const lastElementRef = useRef<ElementHint | undefined>(undefined);
  const openRef = useRef(false);
  const mountedRef = useRef(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const transcriptionGenerationRef = useRef(0);
  const autoStoppedRef = useRef(false);
  const priorPathnameRef = useRef(pathname);

  async function transcribeAudio(blob: Blob | null) {
    const generation = ++transcriptionGenerationRef.current;
    const controller = new AbortController();
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = controller;
    let audioBase64: string | null = null;
    const mimeType = blob?.type ?? "";

    setDictationStatus(
      autoStoppedRef.current
        ? "Recording reached the 55 second limit. Transcribing it now."
        : "Transcribing the recording.",
    );
    try {
      if (!blob) return;
      audioBase64 = await blobToBase64(blob);
      blob = null;
      if (
        controller.signal.aborted ||
        generation !== transcriptionGenerationRef.current
      ) {
        return;
      }

      const response = await fetch("/api/report-issue/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType }),
        signal: controller.signal,
      });
      audioBase64 = null;
      if (
        controller.signal.aborted ||
        generation !== transcriptionGenerationRef.current
      ) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        transcript?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        setDictationStatus(
          payload?.error ??
            "Could not transcribe the recording. Record again or type instead.",
        );
        return;
      }

      const transcript = payload?.transcript?.trim() ?? "";
      if (transcript === "") {
        setDictationStatus("No speech was detected. Type instead or record again.");
        return;
      }

      setDescription((current) => {
        const next = appendFeedbackTranscript(current, transcript);
        requestAnimationFrame(() => {
          if (!mountedRef.current || generation !== transcriptionGenerationRef.current)
            return;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(next.length, next.length);
        });
        return next;
      });
      setDictationStatus("Transcript added. Review and edit it before sending feedback.");
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== transcriptionGenerationRef.current ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setDictationStatus(
        "Could not reach the transcription service. Record again or type instead.",
      );
    } finally {
      blob = null;
      audioBase64 = null;
      if (transcriptionAbortRef.current === controller) {
        transcriptionAbortRef.current = null;
      }
    }
  }

  const handleRecorderError = useCallback((notice: string) => {
    setDictationStatus(notice);
  }, []);

  const handleRecorderStatus = useCallback((notice: string) => {
    if (notice === RECORDER_MESSAGES.autoStop) autoStoppedRef.current = true;
    setDictationStatus(notice);
  }, []);

  const handleRecorderLifecycle = useCallback((phase: string) => {
    if (phase === "requesting-permission") {
      autoStoppedRef.current = false;
      setDictationStatus("Requesting microphone permission.");
    } else if (phase === "recording") {
      setRecordingSeconds(0);
      setDictationStatus("Recording. Choose Stop and transcribe when you are finished.");
    } else if (phase === "stopping") {
      setDictationStatus("Stopping the recording.");
    } else if (phase === "processing") {
      setDictationStatus(
        autoStoppedRef.current
          ? "Recording reached the 55 second limit. Transcribing it now."
          : "Transcribing the recording.",
      );
    }
  }, []);

  const {
    cancelPermissionRequest,
    cancelRecording,
    isRecording,
    phase: recorderPhase,
    toggleRecording,
  } = useAudioRecorder({
    onRecording: transcribeAudio,
    onError: handleRecorderError,
    onStatus: handleRecorderStatus,
    onLifecycle: handleRecorderLifecycle,
  });

  const cancelDictation = useCallback(
    (notice = "Dictation cancelled. Existing feedback was preserved.") => {
      transcriptionGenerationRef.current += 1;
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;
      cancelRecording();
      setDictationStatus(notice);
    },
    [cancelRecording],
  );

  const close = useCallback(() => {
    transcriptionGenerationRef.current += 1;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    cancelRecording();
    setOpen(false);
    setDescription("");
    setDictationStatus("");
    setRecordingSeconds(0);
    triggerRef.current?.focus();
  }, [cancelRecording]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcriptionGenerationRef.current += 1;
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;
    };
  }, []);

  // A Next navigation may keep AppShell mounted. Treat the pathname change as a dialog exit and
  // discard the current clip/request before any late transcription can append.
  useEffect(() => {
    if (priorPathnameRef.current === pathname) return;
    priorPathnameRef.current = pathname;
    if (openRef.current) close();
  }, [close, pathname]);

  useEffect(() => {
    if (recorderPhase !== "recording") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setRecordingSeconds(
        Math.min(Math.floor((Date.now() - startedAt) / 1_000), MAX_RECORDING_SECONDS),
      );
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [recorderPhase]);

  // Remember the last meaningful control interaction outside this dialog. Never capture its label,
  // text, or value, and ignore the Feedback trigger itself.
  useEffect(() => {
    function remember(event: Event) {
      if (openRef.current) return;
      const target = event.target;
      if (target instanceof Node && triggerRef.current?.contains(target)) return;
      const hint = describeElement(target);
      if (hint) lastElementRef.current = hint;
    }
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("focusin", remember, true);
    return () => {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("focusin", remember, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (status === "sent") {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [status]);

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const dictationActive =
    recorderPhase === "requesting-permission" ||
    recorderPhase === "recording" ||
    recorderPhase === "stopping" ||
    recorderPhase === "processing";
  const excessCharacters = Math.max(0, description.length - MAX_DESCRIPTION_CHARACTERS);
  const overLimit = excessCharacters > 0;

  async function submit() {
    if (dictationActive || overLimit || status === "sending") return;
    setStatus("sending");
    setMessage("");
    const context = {
      route: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 400),
      element: lastElementRef.current,
    };
    try {
      const response = await fetch("/api/report-issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || undefined,
          context,
        }),
      });
      if (response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          delivered?: boolean;
        };
        if (payload.delivered) {
          setStatus("sent");
          setMessage("Thanks. Your feedback was filed to the support queue for review.");
        } else {
          setStatus("notice");
          setMessage(
            "We received your feedback but could not file it to the support queue yet. Please try again in a moment.",
          );
        }
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setMessage(payload.error ?? "Could not send your feedback. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  const recorderLabel =
    recorderPhase === "requesting-permission"
      ? "Cancel microphone request"
      : recorderPhase === "recording"
        ? "Stop and transcribe"
        : recorderPhase === "stopping" || recorderPhase === "processing"
          ? "Transcribing"
          : "Record feedback";

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="dialog"
        className="report-issue-trigger"
        onClick={() => {
          setStatus("idle");
          setMessage("");
          setDictationStatus("");
          setOpen(true);
        }}
        type="button"
      >
        Feedback
      </button>

      {open ? (
        <div
          className="ui-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            aria-labelledby="report-issue-title"
            aria-modal="true"
            className="panel report-issue-dialog"
            onKeyDown={trapFocus}
            role="dialog"
          >
            <h2 id="report-issue-title">Feedback</h2>

            {status === "sent" ? (
              <>
                <p className="muted">{message}</p>
                <Button onClick={close} type="button">
                  Close
                </Button>
              </>
            ) : (
              <>
                <p className="muted">
                  Be as descriptive as possible so we can help the best way. We include
                  the page you are on automatically, so you do not have to.
                </p>
                <Field
                  hint="Optional. Type, dictate, or combine both. Review every word before sending."
                  htmlFor="report-issue-description"
                  label="Your feedback"
                >
                  <textarea
                    ref={textareaRef}
                    aria-describedby="report-issue-count report-issue-dictation-status"
                    aria-invalid={overLimit}
                    id="report-issue-description"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Share an idea, a question, or what happened."
                    rows={6}
                    value={description}
                  />
                </Field>
                <p
                  className={overLimit ? "field-error" : "field-hint"}
                  id="report-issue-count"
                  role={overLimit ? "alert" : undefined}
                >
                  {overLimit
                    ? `${description.length.toLocaleString("en-US")} characters. Remove ${excessCharacters.toLocaleString("en-US")} to send feedback.`
                    : `${description.length.toLocaleString("en-US")} of 2,000 characters.`}
                </p>

                <div className="report-issue-dictation-controls">
                  <Button
                    aria-describedby="report-issue-dictation-status"
                    aria-pressed={isRecording}
                    disabled={
                      status === "sending" ||
                      recorderPhase === "stopping" ||
                      recorderPhase === "processing"
                    }
                    onClick={() => {
                      if (recorderPhase === "requesting-permission") {
                        cancelPermissionRequest();
                      } else {
                        void toggleRecording();
                      }
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {recorderLabel}
                  </Button>
                  {recorderPhase === "recording" ||
                  recorderPhase === "stopping" ||
                  recorderPhase === "processing" ? (
                    <Button
                      onClick={() => cancelDictation()}
                      type="button"
                      variant="secondary"
                    >
                      Cancel dictation
                    </Button>
                  ) : null}
                </div>

                {recorderPhase === "recording" ? (
                  <p
                    aria-hidden="true"
                    className="field-hint report-issue-recording-time"
                  >
                    Recording {formatRecordingTime(recordingSeconds)}.{" "}
                    {MAX_RECORDING_SECONDS - recordingSeconds} seconds remaining.
                  </p>
                ) : null}
                <p
                  aria-live="polite"
                  className="auth-message report-issue-dictation-status"
                  id="report-issue-dictation-status"
                  role="status"
                >
                  {dictationStatus}
                </p>

                {status === "error" || status === "notice" ? (
                  <p className="auth-message">{message}</p>
                ) : null}
                <div className="report-issue-actions">
                  <Button
                    disabled={status === "sending" || dictationActive || overLimit}
                    onClick={() => void submit()}
                    type="button"
                  >
                    {status === "sending" ? "Sending" : "Send feedback"}
                  </Button>
                  <Button onClick={close} type="button" variant="secondary">
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
