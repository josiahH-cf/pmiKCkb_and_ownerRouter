// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RichMessageEditor } from "@/components/gmail-hub/RichMessageEditor";
import { RichCommunicationMessageSchema } from "@/lib/gmail-hub/sequence-model";
afterEach(cleanup);
it("keeps an empty follow-up editable while refusing it at the authorization boundary", () => {
  const value = { subject: "", paragraphs: [[{ text: "" }]], attachmentIds: [] };
  const change = vi.fn();
  expect(() =>
    render(
      <RichMessageEditor
        label="Follow-up message"
        value={value}
        disabled={false}
        onChange={change}
      />,
    ),
  ).not.toThrow();
  const editor = screen.getByRole("textbox", { name: "Follow-up message body" });
  editor.innerHTML = "<p>Separate reviewed wording</p>";
  fireEvent.input(editor);
  expect(change).toHaveBeenCalledWith({
    ...value,
    paragraphs: [[{ text: "Separate reviewed wording" }]],
  });
  expect(RichCommunicationMessageSchema.safeParse(value).success).toBe(false);
});
it("preserves edited body when its subject is temporarily invalid", () => {
  expect(() =>
    render(
      <RichMessageEditor
        label="Initial message"
        value={{
          subject: "x".repeat(999),
          paragraphs: [[{ text: "<literal> words", bold: true }]],
          attachmentIds: [],
        }}
        disabled={false}
        onChange={() => {}}
      />,
    ),
  ).not.toThrow();
  expect(screen.getByRole("textbox", { name: "Initial message body" })).toHaveTextContent(
    "<literal> words",
  );
  expect(document.querySelector("literal")).toBeNull();
});
