// S142: a generic, pure dependency resolver for derived next actions. It knows nothing about
// renewals: the caller supplies each node's applicability, completion, prerequisites and actor from
// the owning business rules. Work is ordered by dependency first, then by the caller's existing
// priority, then by id, so display numbering never decides what can happen next. True cycles,
// missing references, duplicate ids and impossible conditions are reported as diagnostics while
// unrelated work keeps its own status. Nothing is stored or counted, inputs are never mutated,
// and a node is complete only when its caller says so.

export type ActionGraphRequirement =
  | { readonly kind: "all"; readonly of: readonly ActionGraphRequirement[] }
  | { readonly kind: "any"; readonly of: readonly ActionGraphRequirement[] }
  | { readonly kind: "node"; readonly id: string }
  | {
      readonly kind: "condition";
      readonly id: string;
      readonly label: string;
      /**
       * The owning rule's answer. Unknown when its source cannot be read; a contradiction when the
       * recorded facts satisfy two exclusive rules at once.
       */
      readonly holds: boolean | "unknown" | "contradiction";
    };

export interface ActionGraphNode {
  readonly id: string;
  /** The caller's existing business priority, compared element by element; ties break on id. */
  readonly priority: readonly number[];
  readonly applicability: "applicable" | "not_applicable" | "unknown";
  readonly completion: "complete" | "incomplete" | "unknown";
  readonly requires?: ActionGraphRequirement;
  /** A named person or event the action waits on once its prerequisites are met. */
  readonly waitingOn?: string | null;
  /** The node's own source could not be read, so its readiness cannot be established. */
  readonly sourceUnavailable?: boolean;
  /** Who can act once the node is ready: this actor, another authorized actor, or no mapped control. */
  readonly actor: "actor" | "other_actor" | "none";
}

export type ActionGraphStatus =
  | "ready_for_actor"
  | "ready_for_other_actor"
  | "dependency_blocked"
  | "waiting"
  | "unknown"
  | "complete"
  | "not_applicable"
  | "unresolved";

export type ActionGraphReason =
  | "ready"
  | "complete"
  | "not_applicable"
  | "prerequisite_unmet"
  | "condition_unmet"
  | "prerequisite_unknown"
  | "prerequisite_unresolved"
  | "applicability_unknown"
  | "completion_unknown"
  | "source_unavailable"
  | "waiting"
  | "dependency_cycle"
  | "missing_reference"
  | "impossible_condition"
  | "no_control";

export interface ActionGraphResult {
  readonly status: ActionGraphStatus;
  readonly reason: ActionGraphReason;
  /** Direct prerequisites that are not met yet, in resolved order. */
  readonly blockedBy: readonly string[];
  /** Labels of the conditions that are not met yet. */
  readonly unmetConditions: readonly string[];
  /** The nearest prerequisite work that is not itself blocked, in resolved order. */
  readonly resolvableVia: readonly string[];
  /** Nodes that name this node as a prerequisite, in resolved order. */
  readonly unlocks: readonly string[];
}

export type ActionGraphDiagnostic =
  | { readonly kind: "dependency_cycle"; readonly members: readonly string[] }
  | { readonly kind: "missing_reference"; readonly from: string; readonly to: string }
  | {
      readonly kind: "impossible_condition";
      readonly node: string;
      readonly conditions: readonly string[];
    }
  | { readonly kind: "duplicate_node"; readonly id: string };

export interface ActionGraphResolution {
  readonly order: readonly string[];
  readonly results: Readonly<Record<string, ActionGraphResult>>;
  readonly diagnostics: readonly ActionGraphDiagnostic[];
}

type Evaluation = {
  state: "met" | "unmet" | "unknown" | "unresolved" | "contradiction";
  blockedBy: Set<string>;
  unmetConditions: Set<string>;
  contradictions: Set<string>;
  missing: boolean;
};

// An all-of join takes its worst child; supported alternatives take their most promising child.
const RANK = { met: 0, unknown: 1, unmet: 2, unresolved: 3, contradiction: 4 } as const;

function compareKeys(
  left: { priority: readonly number[]; id: string },
  right: { priority: readonly number[]; id: string },
): number {
  const length = Math.max(left.priority.length, right.priority.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.priority[index];
    const b = right.priority[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a !== b) return a < b ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function nodeReferences(requirement: ActionGraphRequirement | undefined, out: string[]) {
  if (!requirement) return out;
  if (requirement.kind === "node") out.push(requirement.id);
  else if (requirement.kind === "all" || requirement.kind === "any")
    for (const child of requirement.of) nodeReferences(child, out);
  return out;
}

function emptyEvaluation(state: Evaluation["state"]): Evaluation {
  return {
    state,
    blockedBy: new Set(),
    unmetConditions: new Set(),
    contradictions: new Set(),
    missing: false,
  };
}

function merge(target: Evaluation, source: Evaluation) {
  for (const id of source.blockedBy) target.blockedBy.add(id);
  for (const label of source.unmetConditions) target.unmetConditions.add(label);
  for (const label of source.contradictions) target.contradictions.add(label);
  target.missing ||= source.missing;
}

/** Resolve every node's status, a deterministic dependency order and explicit diagnostics. */
export function resolveActionGraph(
  input: readonly ActionGraphNode[],
): ActionGraphResolution {
  const diagnostics: ActionGraphDiagnostic[] = [];
  const nodes = new Map<string, ActionGraphNode>();
  for (const node of input) {
    if (nodes.has(node.id)) diagnostics.push({ kind: "duplicate_node", id: node.id });
    else nodes.set(node.id, node);
  }
  const ids = [...nodes.keys()].sort();
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const id of ids) {
    const references = [...new Set(nodeReferences(nodes.get(id)!.requires, []))].sort();
    const present: string[] = [];
    for (const reference of references) {
      if (nodes.has(reference)) {
        present.push(reference);
        dependents.get(reference)!.push(id);
      } else diagnostics.push({ kind: "missing_reference", from: id, to: reference });
    }
    prerequisites.set(id, present);
  }

  // Strongly connected components (Tarjan); a component of two or more nodes, or a node that
  // requires itself, is a true dependency cycle.
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const connect = (id: string) => {
    index.set(id, counter);
    low.set(id, counter);
    counter += 1;
    stack.push(id);
    onStack.add(id);
    for (const next of prerequisites.get(id)!) {
      if (!index.has(next)) {
        connect(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(id, Math.min(low.get(id)!, index.get(next)!));
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component);
    }
  };
  for (const id of ids) if (!index.has(id)) connect(id);

  const componentOf = new Map<string, number>();
  const cyclic = new Set<string>();
  components.forEach((component, position) => {
    for (const member of component) componentOf.set(member, position);
    const selfLoop =
      component.length === 1 && prerequisites.get(component[0]!)!.includes(component[0]!);
    if (component.length > 1 || selfLoop) {
      for (const member of component) cyclic.add(member);
      diagnostics.push({ kind: "dependency_cycle", members: [...component].sort() });
    }
  });

  // Kahn's order over the component graph: a component becomes available once every
  // prerequisite component is placed; the available component whose most urgent dependent
  // work has the lowest business priority is placed next (then its own priority, then id). A
  // prerequisite inherits the urgency of the work waiting on it, so urgent work is never ordered
  // behind unrelated routine work because of a low-priority prerequisite.
  const key = (id: string) => ({ priority: nodes.get(id)!.priority, id });
  const sortedMembers = components.map((component) =>
    [...component].sort((a, b) => compareKeys(key(a), key(b))),
  );
  const indegree = components.map(() => 0);
  const successors = components.map(() => new Set<number>());
  for (const id of ids)
    for (const prerequisite of prerequisites.get(id)!) {
      const from = componentOf.get(prerequisite)!;
      const to = componentOf.get(id)!;
      if (from !== to && !successors[from]!.has(to)) {
        successors[from]!.add(to);
        indegree[to]! += 1;
      }
    }
  const own = (position: number) => key(sortedMembers[position]![0]!);
  // Tarjan emits a prerequisite's component before its dependents', so walking backwards visits
  // every dependent first.
  const urgency: { priority: readonly number[]; id: string }[] = [];
  for (let position = components.length - 1; position >= 0; position -= 1) {
    let best = own(position);
    for (const next of successors[position]!)
      if (compareKeys(urgency[next]!, best) < 0) best = urgency[next]!;
    urgency[position] = best;
  }
  const before = (left: number, right: number) =>
    (compareKeys(urgency[left]!, urgency[right]!) || compareKeys(own(left), own(right))) <
    0;
  const available = components
    .map((_, position) => position)
    .filter((position) => indegree[position] === 0);
  const order: string[] = [];
  while (available.length > 0) {
    let best = 0;
    for (let candidate = 1; candidate < available.length; candidate += 1)
      if (before(available[candidate]!, available[best]!)) best = candidate;
    const [position] = available.splice(best, 1);
    order.push(...sortedMembers[position!]!);
    for (const next of successors[position!]!) {
      indegree[next]! -= 1;
      if (indegree[next] === 0) available.push(next);
    }
  }
  const position = new Map(order.map((id, place) => [id, place]));
  const byOrder = (values: Iterable<string>) =>
    [...values].sort((a, b) => position.get(a)! - position.get(b)!);

  const statuses = new Map<string, ActionGraphStatus>();
  const evaluate = (requirement: ActionGraphRequirement): Evaluation => {
    if (requirement.kind === "node") {
      if (!nodes.has(requirement.id)) {
        const result = emptyEvaluation("unresolved");
        result.missing = true;
        return result;
      }
      const status = statuses.get(requirement.id);
      if (status === "complete" || status === "not_applicable")
        return emptyEvaluation("met");
      const result = emptyEvaluation(
        status === "unresolved"
          ? "unresolved"
          : status === "unknown"
            ? "unknown"
            : "unmet",
      );
      result.blockedBy.add(requirement.id);
      return result;
    }
    if (requirement.kind === "condition") {
      if (requirement.holds === true) return emptyEvaluation("met");
      if (requirement.holds === "unknown") return emptyEvaluation("unknown");
      if (requirement.holds === "contradiction") {
        const result = emptyEvaluation("contradiction");
        result.contradictions.add(requirement.label);
        return result;
      }
      const result = emptyEvaluation("unmet");
      result.unmetConditions.add(requirement.label);
      return result;
    }
    const children = requirement.of.map(evaluate);
    // An empty join has nothing left to satisfy; an empty set of alternatives offers no path.
    if (children.length === 0)
      return emptyEvaluation(requirement.kind === "all" ? "met" : "unmet");
    if (requirement.kind === "all") {
      const worst = children.reduce((current, child) =>
        RANK[child.state] > RANK[current.state] ? child : current,
      );
      const result = emptyEvaluation(worst.state);
      for (const child of children) if (child.state !== "met") merge(result, child);
      return result;
    }
    const best = children.reduce((current, child) =>
      RANK[child.state] < RANK[current.state] ? child : current,
    );
    const result = emptyEvaluation(best.state);
    if (best.state !== "met")
      for (const child of children) if (child.state === best.state) merge(result, child);
    return result;
  };

  const drafts = new Map<
    string,
    Omit<ActionGraphResult, "resolvableVia" | "unlocks"> & { blockedBy: string[] }
  >();
  const settle = (
    id: string,
    status: ActionGraphStatus,
    reason: ActionGraphReason,
    evaluation?: Evaluation,
  ) => {
    statuses.set(id, status);
    drafts.set(id, {
      status,
      reason,
      blockedBy: evaluation ? byOrder(evaluation.blockedBy) : [],
      unmetConditions: evaluation ? [...evaluation.unmetConditions].sort() : [],
    });
  };
  for (const id of order) {
    const node = nodes.get(id)!;
    if (cyclic.has(id)) {
      settle(id, "unresolved", "dependency_cycle");
      continue;
    }
    if (node.applicability === "not_applicable") {
      settle(id, "not_applicable", "not_applicable");
      continue;
    }
    if (node.completion === "complete") {
      settle(id, "complete", "complete");
      continue;
    }
    if (node.applicability === "unknown") {
      settle(id, "unknown", "applicability_unknown");
      continue;
    }
    if (node.completion === "unknown") {
      settle(id, "unknown", "completion_unknown");
      continue;
    }
    const evaluation = node.requires ? evaluate(node.requires) : emptyEvaluation("met");
    if (evaluation.state === "contradiction") {
      diagnostics.push({
        kind: "impossible_condition",
        node: id,
        conditions: [...evaluation.contradictions].sort(),
      });
      settle(id, "unresolved", "impossible_condition", evaluation);
    } else if (evaluation.state === "unresolved")
      // A reference to an unknown node is a definition error, not a prerequisite to wait for.
      settle(
        id,
        evaluation.missing ? "unresolved" : "dependency_blocked",
        evaluation.missing ? "missing_reference" : "prerequisite_unresolved",
        evaluation,
      );
    else if (evaluation.state === "unmet")
      settle(
        id,
        "dependency_blocked",
        evaluation.blockedBy.size === 0 ? "condition_unmet" : "prerequisite_unmet",
        evaluation,
      );
    else if (evaluation.state === "unknown")
      settle(id, "unknown", "prerequisite_unknown", evaluation);
    else if (node.sourceUnavailable) settle(id, "unknown", "source_unavailable");
    else if (node.waitingOn) settle(id, "waiting", "waiting");
    else if (node.actor === "actor") settle(id, "ready_for_actor", "ready");
    else if (node.actor === "other_actor") settle(id, "ready_for_other_actor", "ready");
    else settle(id, "unresolved", "no_control");
  }

  // The nearest prerequisite work: walk only through prerequisites that are themselves blocked.
  const frontier = new Map<string, readonly string[]>();
  const resolvable = (id: string): readonly string[] => {
    const known = frontier.get(id);
    if (known) return known;
    frontier.set(id, []);
    const found = new Set<string>();
    for (const blocker of drafts.get(id)!.blockedBy) {
      if (drafts.get(blocker)!.status === "dependency_blocked")
        for (const next of resolvable(blocker)) found.add(next);
      else found.add(blocker);
    }
    const value = byOrder(found);
    frontier.set(id, value);
    return value;
  };
  const results: Record<string, ActionGraphResult> = {};
  for (const id of order) {
    const draft = drafts.get(id)!;
    results[id] = {
      ...draft,
      resolvableVia: draft.status === "dependency_blocked" ? resolvable(id) : [],
      unlocks: byOrder(dependents.get(id)!),
    };
  }
  return { order, results, diagnostics };
}
