// S143/S144: the Focus view shows one action's existing Full view controls in place. Every Full
// view control stays mounted, so unsaved input, pending requests, previews and retry identities
// survive switching views or tasks; Focus only hides everything in the workspace body except the
// Focus pane and the chosen action's regions. Hiding is attribute-only and fully reversible: an
// element this module did not hide is never shown, and React-owned attributes are left alone.

export const FOCUS_HIDDEN_ATTRIBUTE = "data-renewal-focus-hidden";
const HIDDEN_BY_FOCUS = "data-renewal-focus-hid";

export interface FocusReveal {
  /** Hide every element outside the kept regions and their ancestor paths. */
  readonly apply: (keep: readonly Element[]) => void;
  /** Show everything this reveal hid and stop watching the body. */
  readonly clear: () => void;
}

/** Create a reveal for one workspace body; it re-applies itself when React adds new elements. */
export function createFocusReveal(body: HTMLElement): FocusReveal {
  let kept: readonly Element[] = [];
  const hidden = new Set<HTMLElement>();
  const show = (element: HTMLElement) => {
    element.removeAttribute(FOCUS_HIDDEN_ATTRIBUTE);
    if (element.hasAttribute(HIDDEN_BY_FOCUS)) {
      element.removeAttribute(HIDDEN_BY_FOCUS);
      element.hidden = false;
    }
  };
  const hide = (element: HTMLElement) => {
    if (hidden.has(element) && element.hasAttribute(FOCUS_HIDDEN_ATTRIBUTE)) return;
    hidden.add(element);
    element.setAttribute(FOCUS_HIDDEN_ATTRIBUTE, "");
    if (!element.hidden) {
      element.setAttribute(HIDDEN_BY_FOCUS, "");
      element.hidden = true;
    }
  };
  const run = () => {
    const keep = new Set(kept.filter((element) => body.contains(element)));
    const path = new Set<Element>();
    for (const element of keep) {
      let node: Element | null = element;
      while (node && node !== body) {
        path.add(node);
        node = node.parentElement;
      }
    }
    const visible = new Set<Element>();
    const visit = (parent: Element) => {
      for (const child of Array.from(parent.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (keep.has(child)) {
          visible.add(child);
          // A chosen disclosure opens so its controls are usable, as focusing it would.
          if (child instanceof HTMLDetailsElement) child.open = true;
          continue;
        }
        if (path.has(child)) {
          visible.add(child);
          if (child instanceof HTMLDetailsElement) child.open = true;
          visit(child);
          continue;
        }
        hide(child);
      }
    };
    visit(body);
    for (const element of [...hidden])
      if (visible.has(element) || !body.contains(element)) {
        show(element);
        hidden.delete(element);
      }
  };
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver((records) => {
          if (records.some((record) => record.addedNodes.length > 0)) run();
        });
  let observing = false;
  return {
    apply(keep) {
      kept = keep;
      run();
      if (!observing && observer) {
        observer.observe(body, { childList: true, subtree: true });
        observing = true;
      }
    },
    clear() {
      observer?.disconnect();
      observing = false;
      for (const element of hidden) show(element);
      hidden.clear();
      kept = [];
    },
  };
}
