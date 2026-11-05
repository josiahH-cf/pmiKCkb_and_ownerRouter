// @vitest-environment jsdom

import { within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { installIndexedLabelControl } from "@/tests/helpers/jsdom-label-control";

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  document.body.replaceChildren();
});

/** Every label's control and every element's labels, as positions in tree order. */
function associations(root: Document | ShadowRoot = document) {
  const nodes = Array.from(root.querySelectorAll("*"));
  const position = (node: Element | null) => (node ? nodes.indexOf(node) : null);
  return {
    controls: Array.from(root.querySelectorAll("label")).map((label) =>
      position(label.control),
    ),
    labels: nodes.map((node) =>
      "labels" in node && node.labels
        ? Array.from(node.labels as NodeListOf<HTMLLabelElement>).map(position)
        : null,
    ),
  };
}

/** The same reading with jsdom's own getter and with the indexed one. */
function bothWays<T>(read: () => T) {
  const native = read();
  restore = installIndexedLabelControl();
  const indexed = read();
  restore();
  restore = null;
  return { native, indexed };
}

describe("installIndexedLabelControl", () => {
  it("answers exactly what jsdom answers for every label association", () => {
    document.body.innerHTML = `
      <label for="a">A</label><input id="a">
      <label for="hidden">Hidden</label><input id="hidden" type="hidden">
      <label for="plain">Not labelable</label><div id="plain"></div>
      <label for="first-wins">First is a span</label><span id="first-wins"></span><input id="first-wins">
      <label for="twice">First is an input</label><input id="twice"><textarea id="twice"></textarea>
      <label for="">Empty</label><input id="empty">
      <label for="missing">Missing</label>
      <label>Nested <select id="nested"></select></label>
      <label for="a">For wins over nesting <button id="inner"></button></label>
      <label>No control</label>
      <label for="m">M</label><meter id="m"></meter>
      <label for="o">O</label><output id="o"></output>
      <label for="p">P</label><progress id="p"></progress>
      <label for="host-only">Points into a shadow tree</label><div id="host"></div>`;
    const shadow = document.getElementById("host")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<input id="host-only"><label for="inside">Inside</label><input id="inside">`;
    const detached = document.createElement("div");
    detached.innerHTML = `<label for="loose">Loose</label><input id="loose">`;

    const read = () => ({
      document: associations(),
      shadow: associations(shadow),
      detached: (detached.querySelector("label") as HTMLLabelElement).control?.id ?? null,
    });
    const first = bothWays(read);
    expect(first.indexed).toEqual(first.native);
    // The cases above cover each branch: found, hidden, not labelable, duplicate ids, empty, missing,
    // nested, nested with for, no control, other labelables, shadow and detached trees.
    expect(first.native.document.controls.filter((value) => value !== null)).toHaveLength(
      7,
    );
    expect(first.native.detached).toBe("loose");

    // The index follows later changes the same way the walk does.
    document.getElementById("a")!.id = "renamed";
    document.getElementById("twice")!.remove();
    const earlier = document.createElement("select");
    earlier.id = "first-wins";
    document.body.prepend(earlier);
    const changed = bothWays(read);
    expect(changed.indexed).toEqual(changed.native);
    expect(changed.native).not.toEqual(first.native);
  });

  it("makes a scoped label query cost one walk per control, not one per label", () => {
    // A page shaped like the mounted lease page, scaled down: many `for` labels, a region of
    // controls and filler nodes. The ratio is machine independent; the absolute times are not.
    const region = document.createElement("section");
    for (let index = 0; index < 60; index++)
      region.insertAdjacentHTML(
        "beforeend",
        `<label for="r${index}">Region field ${index}</label><input id="r${index}">`,
      );
    const outside = document.createElement("div");
    for (let index = 0; index < 150; index++)
      outside.insertAdjacentHTML(
        "beforeend",
        `<p><span>Filler ${index}</span><span>text</span></p><label for="o${index}">Other ${index}</label><input id="o${index}">`,
      );
    document.body.append(outside, region);
    const query = () => {
      // Any DOM change makes jsdom recompute every cached labels list, as a render does.
      document.body.dataset.render = String(
        Number(document.body.dataset.render ?? 0) + 1,
      );
      const started = performance.now();
      const found = within(region).getByLabelText("Region field 30");
      return { ms: performance.now() - started, id: found.id };
    };
    // The cheaper reading takes its best of three so one garbage-collection pause cannot decide.
    const timed = () => {
      const runs = [query(), query(), query()];
      return {
        ms: Math.min(...runs.map((run) => run.ms)),
        ids: runs.map((run) => run.id),
      };
    };
    const native = query();
    restore = installIndexedLabelControl();
    const indexed = timed();
    expect(native.id).toBe("r30");
    expect(indexed.ids).toEqual(["r30", "r30", "r30"]);
    expect(
      indexed.ms * 10,
      `indexed ${indexed.ms.toFixed(1)} ms against jsdom's ${native.ms.toFixed(1)} ms`,
    ).toBeLessThan(native.ms);
  });
});
