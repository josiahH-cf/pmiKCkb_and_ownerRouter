import { createRequire } from "node:module";

/**
 * Test-only repair of jsdom's label lookup cost (Q-ENG-ADV-CI). It changes no result.
 *
 * jsdom 29 resolves `HTMLLabelElement.control` for a `for` attribute by walking the label's whole
 * tree, and a labelable element's `labels` runs that lookup for every label in the document.
 * testing-library reads `labels` for every labelable element in a query's scope: `*ByLabelText`
 * directly, and `*ByRole` with a name through accessible-name computation. One query therefore
 * costs about (controls in scope) × (labels) × (document nodes) node visits after any DOM change.
 * On the mounted S113 lease page (3,068 nodes, 144 `for` labels) that measured 1.1–2.5 s for one
 * region-scoped query and 5.6 s for a document-wide one, and 61% of the journey's thread time.
 * Mounted journeys run their routes and Firestore client on that same thread, so a polling wait
 * built on such a query starved the very reads it was waiting for.
 *
 * jsdom keeps a tree-ordered id index for `getElementById`. For a label in a document tree this
 * answers the same question: the first element in that tree with the `for` id, kept only when it
 * is labelable. An element the index finds in another tree, an unknown id, a label outside a
 * document, and a label without `for` all use jsdom's own walk, so the answer is always identical.
 *
 * Returns a function that restores jsdom's own getter.
 */
export function installIndexedLabelControl(): () => void {
  const require = createRequire(import.meta.url);
  const labelModule =
    require("jsdom/lib/jsdom/living/nodes/HTMLLabelElement-impl.js") as {
      implementation?: { prototype: object };
    };
  const formControls = require("jsdom/lib/jsdom/living/helpers/form-controls.js") as {
    isLabelable?: (node: unknown) => boolean;
  };
  const prototype = labelModule.implementation?.prototype;
  const native = prototype && Object.getOwnPropertyDescriptor(prototype, "control");
  const isLabelable = formControls.isLabelable;
  if (!prototype || !native?.get || typeof isLabelable !== "function")
    throw new Error(
      "jsdom's label control lookup changed shape; review tests/helpers/jsdom-label-control.ts.",
    );
  const nativeControl = native.get;
  Object.defineProperty(prototype, "control", {
    configurable: true,
    enumerable: native.enumerable,
    get(this: LabelImpl) {
      const id = this.getAttributeNS(null, "for");
      if (id) {
        const root = this.getRootNode({});
        if (
          root.nodeType === DOCUMENT_NODE &&
          typeof root.getElementById === "function"
        ) {
          const target = root.getElementById(id);
          if (target && target.getRootNode({}) === root)
            return isLabelable(target) ? target : null;
        }
      }
      return nativeControl.call(this);
    },
  });
  return () => Object.defineProperty(prototype, "control", native);
}

const DOCUMENT_NODE = 9;

interface IndexedNode {
  getRootNode(options: object): unknown;
}

interface LabelImpl {
  getAttributeNS(namespace: null, name: string): string | null;
  getRootNode(options: object): {
    nodeType: number;
    getElementById?: (id: string) => IndexedNode | null;
  };
}
