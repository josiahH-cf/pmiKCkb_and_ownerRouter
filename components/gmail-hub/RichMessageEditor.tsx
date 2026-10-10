"use client";
import { useEffect, useRef, useState } from "react";
import { type RichCommunicationMessage } from "@/lib/gmail-hub/sequence-model";
import { renderInlineMessageParagraph } from "@/lib/email/inline-runs";
type Paragraph = RichCommunicationMessage["paragraphs"][number];

/** Parse only the product's formatting vocabulary; clipboard HTML never becomes trusted HTML. */
export function readRichEditor(
  root: HTMLElement,
): RichCommunicationMessage["paragraphs"] {
  const paragraphs: Paragraph[] = [];
  let runs: Paragraph = [];
  const flush = () => {
    if (runs.length) {
      paragraphs.push(runs);
      runs = [];
    }
  };
  const walk = (node: Node, style: Omit<Paragraph[number], "text"> = {}) => {
    if (node.nodeType === 3) {
      if (node.textContent) runs.push({ text: node.textContent, ...style });
      return;
    }
    if (
      !(node instanceof Element) ||
      ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "IMG"].includes(node.tagName)
    )
      return;
    const block = ["P", "DIV", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4"].includes(
      node.tagName,
    );
    if (block) flush();
    const next = { ...style };
    if (["STRONG", "B"].includes(node.tagName)) next.bold = true;
    if (["EM", "I"].includes(node.tagName)) next.italic = true;
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      try {
        const u = new URL(href);
        if (u.protocol === "https:" && !u.username && !u.password) next.href = href;
      } catch {
        /* text remains */
      }
      if (/^mailto:[^\s<>"@]+@[^\s<>"@]+$/.test(href)) next.href = href;
    }
    if (node.tagName === "BR") runs.push({ text: "\n", ...next });
    else node.childNodes.forEach((child) => walk(child, next));
    if (block) flush();
  };
  root.childNodes.forEach((child) => walk(child));
  flush();
  return paragraphs.length ? paragraphs : [[{ text: "" }]];
}
function editorHtml(value: RichCommunicationMessage) {
  // Editing may be incomplete. Send/Schedule applies the complete-message schema separately.
  // The same escaped run renderer retains exact text, emphasis and safe links without parsing a
  // temporary blank body or subject as a sendable message.
  return value.paragraphs
    .map((p) => "<p>" + (renderInlineMessageParagraph(p).html || "<br>") + "</p>")
    .join("");
}
export function RichMessageEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: RichCommunicationMessage;
  disabled: boolean;
  onChange(value: RichCommunicationMessage): void;
}) {
  const editor = useRef<HTMLDivElement>(null),
    emitted = useRef("");
  const selected = useRef<Range | null>(null);
  const [link, setLink] = useState("");
  const bodyKey = JSON.stringify(value.paragraphs);
  useEffect(() => {
    if (editor.current && emitted.current !== bodyKey) {
      editor.current.innerHTML = editorHtml(value);
      emitted.current = bodyKey;
    }
  }, [bodyKey, value]);
  const update = () => {
    if (!editor.current) return;
    const paragraphs = readRichEditor(editor.current);
    emitted.current = JSON.stringify(paragraphs);
    onChange({ ...value, paragraphs });
  };
  const format = (command: string, argument?: string) => {
    editor.current?.focus();
    if (selected.current) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(selected.current);
      selected.current = null;
    }
    document.execCommand(command, false, argument);
    update();
  };
  return (
    <section className="ui-stack" aria-label={label}>
      <label>
        {label} subject
        <input
          value={value.subject}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
        />
      </label>
      <div className="ui-row" role="toolbar" aria-label={`${label} formatting`}>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => format("italic")}
        >
          Italic
        </button>
        <label>
          Link URL
          <input
            type="url"
            value={link}
            disabled={disabled}
            placeholder="https://…"
            onFocus={() => {
              const s = window.getSelection();
              if (s?.rangeCount && editor.current?.contains(s.anchorNode))
                selected.current = s.getRangeAt(0).cloneRange();
            }}
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !/^https:\/\//.test(link)}
          onClick={() => {
            try {
              const u = new URL(link);
              if (u.protocol === "https:" && !u.username && !u.password) {
                format("createLink", link);
                setLink("");
              }
            } catch {
              /* retain entry */
            }
          }}
        >
          Apply link
        </button>
      </div>
      <div
        ref={editor}
        role="textbox"
        aria-label={`${label} body`}
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="communication-rich-editor"
        onInput={update}
        onDrop={(e) => e.preventDefault()}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand(
            "insertText",
            false,
            e.clipboardData.getData("text/plain"),
          );
          update();
        }}
      />
    </section>
  );
}
