// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AskForm } from "@/components/ask/AskForm";

afterEach(cleanup);
it("keeps the question and submit inert until React can prevent native URL submission", () => {
  const shell = document.createElement("div");
  shell.innerHTML = renderToStaticMarkup(<AskForm />);
  expect((shell.querySelector("#question") as HTMLTextAreaElement).disabled).toBe(true);
  expect(
    (shell.querySelector('button[type="submit"]') as HTMLButtonElement).disabled,
  ).toBe(true);
  render(<AskForm />);
  expect(
    (screen.getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement).disabled,
  ).toBe(false);
  expect(
    (screen.getByRole("button", { name: "Get answer" }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
