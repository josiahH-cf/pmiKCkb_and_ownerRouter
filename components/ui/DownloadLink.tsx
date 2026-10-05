"use client";

import { useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { fetchWithDeadline, waitFailureMessage } from "@/lib/ui/fetch-lifetime";

type DownloadState =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing" }
  | { readonly kind: "started"; readonly name: string }
  | { readonly kind: "failed"; readonly message: string };

/** The server refused the file and said why. */
class DownloadRefused extends Error {}

function servedFileName(response: Response, fallback: string): string {
  const header = response.headers.get("content-disposition") ?? "";
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?"?([^";]+)"?/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // Fall through to the plain form.
    }
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim() || fallback;
}

/**
 * A file download that reports what actually happened. The file is read first, so a refusal or a
 * lost connection is said on the current screen instead of replacing it with an error page. The
 * link keeps its address, so it still works as an ordinary link without scripts.
 */
export function DownloadLink({
  href,
  fileName,
  children,
  className = "text-link",
}: Readonly<{
  href: string;
  /** Used when the server does not name the file. */
  fileName: string;
  children: ReactNode;
  className?: string;
}>) {
  const [state, setState] = useState<DownloadState>({ kind: "idle" });
  const generation = useRef(0);
  const statusId = useId();

  async function download() {
    const current = ++generation.current;
    setState({ kind: "preparing" });
    try {
      const response = await fetchWithDeadline(href, { cache: "no-store" });
      if (!response.ok) {
        let reason = "";
        try {
          const data = (await response.json()) as { error?: unknown };
          if (typeof data.error === "string") reason = data.error;
        } catch {
          // The refusal carried no readable reason.
        }
        throw new DownloadRefused(reason || "The file could not be downloaded.");
      }
      const blob = await response.blob();
      if (generation.current !== current) return;
      const name = servedFileName(response, fileName);
      const url = URL.createObjectURL(blob);
      const save = document.createElement("a");
      save.href = url;
      save.download = name;
      save.hidden = true;
      document.body.append(save);
      save.click();
      save.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState({ kind: "started", name });
    } catch (error) {
      if (generation.current !== current) return;
      setState({
        kind: "failed",
        message:
          error instanceof DownloadRefused
            ? error.message
            : waitFailureMessage(
                error,
                "The file could not be downloaded. The connection was interrupted.",
              ),
      });
    }
  }

  function select(event: MouseEvent<HTMLAnchorElement>) {
    // A modified click keeps its browser meaning, such as opening a new tab.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    if (state.kind !== "preparing") void download();
  }

  return (
    <span className="download-link">
      <a
        aria-busy={state.kind === "preparing" || undefined}
        aria-describedby={statusId}
        className={className}
        href={href}
        onClick={select}
      >
        {children}
      </a>
      <span
        className={state.kind === "idle" ? "sr-only" : "download-link-status"}
        data-download={state.kind}
        id={statusId}
        role="status"
      >
        {state.kind === "preparing"
          ? "Preparing the download…"
          : state.kind === "started"
            ? `Download started: ${state.name}`
            : state.kind === "failed"
              ? state.message
              : ""}
      </span>
      {state.kind === "failed" ? (
        <>
          <Button onClick={() => void download()} size="compact" variant="tertiary">
            Try again
          </Button>
          <a className="text-link" href={href} rel="noreferrer" target="_blank">
            Open the file in a new tab
          </a>
        </>
      ) : null}
    </span>
  );
}
