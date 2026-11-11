// S143/S144: the Focus view shows one action's existing Full view controls in place. Every Full
// view control stays mounted, so unsaved input, pending requests, previews and retry identities
// survive switching views or tasks; Focus only hides everything in the workspace body except the
// Focus pane and the chosen action's regions. Hiding is attribute-only and fully reversible: an
// element this module did not hide is never shown, a disclosure it opened closes again, and
// React-owned attributes are left alone.

export const FOCUS_HIDDEN_ATTRIBUTE = "data-renewal-focus-hidden";
const HIDDEN_BY_FOCUS = "data-renewal-focus-hid";
/**
 * S270: marks a disclosure the reveal holds open for a revealed control, so a named group's own
 * close on another outcome leaves it open while the shown outcome needs it.
 */
export const FOCUS_OPENED_ATTRIBUTE = "data-renewal-focus-opened";
/** S270: a named group holding current work (a failed or pending save) is never closed here. */
const PROMOTED = "data-renewal-promoted";

export interface FocusRevealOptions {
  /**
   * S270: the outcome the Guided view shows. Its own named secondary Work group
   * (`details[data-renewal-secondary-work][data-renewal-group-step=<outcome>]`) keeps its summary
   * and its own open state: it starts closed and opens only for an exact link, a deliberate open or
   * current work. A group of another outcome that holds a revealed control still opens in place.
   */
  readonly outcome?: string;
}

export interface FocusReveal {
  /** Hide every element outside the kept regions and their ancestor paths. */
  readonly apply: (keep: readonly Element[], options?: FocusRevealOptions) => void;
  /** Show everything this reveal hid, close what it opened and stop watching the body. */
  readonly clear: () => void;
}

/** Create a reveal for one workspace body; it re-applies itself when React adds new elements. */
export function createFocusReveal(body: HTMLElement): FocusReveal {
  let kept: readonly Element[] = [];
  let outcome: string | undefined;
  const hidden = new Set<HTMLElement>();
  const opened = new Set<HTMLDetailsElement>();
  /** S270: the shown outcome's own named group, which this reveal never opens or flattens. */
  const ownGroup = (element: Element): element is HTMLDetailsElement =>
    outcome !== undefined &&
    element instanceof HTMLDetailsElement &&
    element.hasAttribute("data-renewal-secondary-work") &&
    element.getAttribute("data-renewal-group-step") === outcome;
  // A chosen disclosure opens so its controls are usable, as focusing it would.
  let openedNow = new Set<HTMLDetailsElement>();
  const open = (details: HTMLDetailsElement) => {
    openedNow.add(details);
    details.setAttribute(FOCUS_OPENED_ATTRIBUTE, "");
    if (details.open) return;
    details.open = true;
    opened.add(details);
  };
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
    openedNow = new Set();
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
          if (child instanceof HTMLDetailsElement && !ownGroup(child)) open(child);
          continue;
        }
        if (path.has(child)) {
          visible.add(child);
          if (child instanceof HTMLDetailsElement && !ownGroup(child)) open(child);
          visit(child);
          continue;
        }
        // S270: the shown outcome's own group keeps its named summary.
        if (ownGroup(parent) && child.tagName === "SUMMARY") {
          visible.add(child);
          continue;
        }
        hide(child);
      }
    };
    visit(body);
    for (const element of [...hidden])
      if (
        visible.has(element) ||
        [...keep].some((parent) => parent.contains(element)) ||
        !body.contains(element)
      ) {
        show(element);
        hidden.delete(element);
      }
    for (const details of body.querySelectorAll(`details[${FOCUS_OPENED_ATTRIBUTE}]`))
      if (!openedNow.has(details as HTMLDetailsElement))
        details.removeAttribute(FOCUS_OPENED_ATTRIBUTE);
    // S270: a disclosure this reveal opened for an earlier choice closes again once nothing it
    // revealed needs it, so a named group never stays open from another outcome's reveal.
    if (outcome !== undefined)
      for (const details of [...opened])
        if (!openedNow.has(details)) {
          if (!details.hasAttribute(PROMOTED)) details.open = false;
          opened.delete(details);
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
    apply(keep, options) {
      kept = keep;
      outcome = options?.outcome;
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
      // The Full view returns with each disclosure as the person left it; current work stays open.
      for (const details of opened)
        if (!details.hasAttribute(PROMOTED)) details.open = false;
      opened.clear();
      for (const details of body.querySelectorAll(`details[${FOCUS_OPENED_ATTRIBUTE}]`))
        details.removeAttribute(FOCUS_OPENED_ATTRIBUTE);
      kept = [];
    },
  };
}
