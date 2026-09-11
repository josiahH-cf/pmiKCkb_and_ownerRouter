import type { Page } from "playwright-core";

export interface AssuranceDomPlan {
  readonly [selector: string]: AssuranceDomPlan;
}

interface CapturedNode {
  readonly text: string | null;
  readonly attributes: Readonly<Record<string, string | null>>;
  readonly queries: Readonly<Record<string, readonly CapturedNode[]>>;
}

/** One coherent browser read. Private rendered values stay in process memory and never form a
 * report, receipt or cache. Unplanned selectors/attributes and non-unique reads fail closed. */
export async function captureAssuranceDom(
  page: Page,
  plan: AssuranceDomPlan,
  attributes: readonly string[],
): Promise<Pick<Page, "locator">> {
  const queries = await page.evaluate(
    ({ plan, attributes }) => {
      const result: Record<string, CapturedNode[]> = {};
      const pending: Array<{
        root: ParentNode;
        plan: AssuranceDomPlan;
        output: Record<string, CapturedNode[]>;
      }> = [{ root: document, plan, output: result }];
      while (pending.length > 0) {
        const current = pending.pop()!;
        for (const [selector, descendants] of Object.entries(current.plan)) {
          const nodes: CapturedNode[] = [];
          current.output[selector] = nodes;
          for (const element of current.root.querySelectorAll(selector)) {
            const values: Record<string, string | null> = {};
            for (const attribute of attributes)
              values[attribute] = element.getAttribute(attribute);
            const queries: Record<string, CapturedNode[]> = {};
            nodes.push({ text: element.textContent, attributes: values, queries });
            pending.push({ root: element, plan: descendants, output: queries });
          }
        }
      }
      return result;
    },
    { plan, attributes: [...attributes] },
  );
  return {
    locator: (selector: string) => capturedLocator(requireQuery(queries, selector)),
  } as Pick<Page, "locator">;
}

function requireQuery(
  queries: CapturedNode["queries"],
  selector: string,
): readonly CapturedNode[] {
  if (!Object.hasOwn(queries, selector))
    throw new Error("assurance_snapshot_selector_unplanned");
  return queries[selector];
}

function capturedLocator(nodes: readonly CapturedNode[]): ReturnType<Page["locator"]> {
  const single = (): CapturedNode => {
    if (nodes.length !== 1) throw new Error("assurance_snapshot_locator_not_unique");
    return nodes[0];
  };
  return {
    locator: (selector: string) =>
      capturedLocator(nodes.flatMap((node) => requireQuery(node.queries, selector))),
    count: async () => nodes.length,
    first: () => capturedLocator(nodes.slice(0, 1)),
    nth: (index: number) => capturedLocator(nodes.slice(index, index + 1)),
    textContent: async () => single().text,
    allTextContents: async () => nodes.map((node) => node.text ?? ""),
    getAttribute: async (attribute: string) => {
      const node = single();
      if (!Object.hasOwn(node.attributes, attribute))
        throw new Error("assurance_snapshot_attribute_unplanned");
      return node.attributes[attribute];
    },
  } as unknown as ReturnType<Page["locator"]>;
}
