import { describe, expect, it } from "vitest";

import {
  resolveActionGraph,
  type ActionGraphNode,
  type ActionGraphRequirement,
} from "@/lib/lease-renewal/action-graph";

// S142 (ARCH-S142-2, AC-S142-1, AC-S142-2): synthetic graphs for the generic resolver. The
// numbers only describe graph shape; they are not renewal stages.

const node = (
  id: string,
  priority: number,
  requires?: ActionGraphRequirement,
  extra: Partial<ActionGraphNode> = {},
): ActionGraphNode => ({
  id,
  priority: [priority],
  applicability: "applicable",
  completion: "incomplete",
  actor: "actor",
  ...(requires ? { requires } : {}),
  ...extra,
});
const on = (id: string): ActionGraphRequirement => ({ kind: "node", id });
const all = (...of: ActionGraphRequirement[]): ActionGraphRequirement => ({
  kind: "all",
  of,
});
const any = (...of: ActionGraphRequirement[]): ActionGraphRequirement => ({
  kind: "any",
  of,
});
const when = (
  label: string,
  holds: boolean | "unknown" | "contradiction",
): ActionGraphRequirement => ({ kind: "condition", id: label, label, holds });
const done = { completion: "complete" as const };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("S142 action graph resolver", () => {
  it("keeps two joins blocked after the first shared prerequisite and readies both after the second", () => {
    const graph = (aDone: boolean, bDone: boolean) =>
      resolveActionGraph([
        node("a", 1, undefined, aDone ? done : {}),
        node("b", 2, undefined, bDone ? done : {}),
        node("c", 3, all(on("a"), on("b"))),
        node("d", 4, all(on("a"), on("b"))),
      ]);
    const first = graph(true, false);
    expect(first.results.c).toMatchObject({
      status: "dependency_blocked",
      reason: "prerequisite_unmet",
      blockedBy: ["b"],
      resolvableVia: ["b"],
    });
    expect(first.results.d?.status).toBe("dependency_blocked");
    expect(first.results.b?.status).toBe("ready_for_actor");
    const second = graph(true, true);
    expect(second.results.c?.status).toBe("ready_for_actor");
    expect(second.results.d?.status).toBe("ready_for_actor");
    expect(second.results.a?.unlocks).toEqual(["c", "d"]);
  });

  it("orders prerequisites first even when their display numbering is reversed", () => {
    const result = resolveActionGraph([
      node("final", 1, on("middle")),
      node("middle", 2, on("first")),
      node("first", 3),
      node("independent", 0),
    ]);
    expect(result.order).toEqual(["independent", "first", "middle", "final"]);
    expect(result.results.first?.status).toBe("ready_for_actor");
    expect(result.results.final).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["middle"],
      resolvableVia: ["first"],
    });
  });

  it("lets a prerequisite inherit the urgency of the work waiting on it", () => {
    const result = resolveActionGraph([
      node("routine", 2),
      node("urgent", 0, on("groundwork")),
      node("groundwork", 3),
    ]);
    expect(result.order).toEqual(["groundwork", "urgent", "routine"]);
    expect(result.results.urgent?.resolvableVia).toEqual(["groundwork"]);
  });

  it("uses supported alternatives without phantom work", () => {
    const neither = resolveActionGraph([
      node("email", 1),
      node("letter", 2),
      node("record", 3, any(on("email"), on("letter"))),
    ]);
    expect(neither.results.record).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["email", "letter"],
    });
    const either = resolveActionGraph([
      node("email", 1),
      node("letter", 2, undefined, done),
      node("record", 3, any(on("email"), on("letter"))),
    ]);
    expect(either.results.record?.status).toBe("ready_for_actor");
    // The untaken alternative is still ordinary independent work; it never blocks the join.
    expect(either.results.email?.status).toBe("ready_for_actor");
  });

  it("treats a pending branch as blocked and an excluded branch as not applicable", () => {
    const pending = resolveActionGraph([
      node("offer", 1, undefined, done),
      node("documents", 2, all(on("offer"), when("tenant accepted", false))),
    ]);
    expect(pending.results.documents).toMatchObject({
      status: "dependency_blocked",
      reason: "condition_unmet",
      unmetConditions: ["tenant accepted"],
      blockedBy: [],
    });
    const excluded = resolveActionGraph([
      node("handoff", 1, undefined, { applicability: "not_applicable" }),
      node("close", 2, on("handoff")),
    ]);
    expect(excluded.results.handoff?.status).toBe("not_applicable");
    // A not-applicable prerequisite never holds its dependents back.
    expect(excluded.results.close?.status).toBe("ready_for_actor");
  });

  it("resolves convergent edges once", () => {
    const result = resolveActionGraph([
      node("root", 1, undefined, done),
      node("left", 2, on("root")),
      node("right", 3, on("root"), done),
      node("join", 4, all(on("left"), on("right"))),
    ]);
    expect(result.results.left?.status).toBe("ready_for_actor");
    expect(result.results.join).toMatchObject({
      status: "dependency_blocked",
      blockedBy: ["left"],
    });
    expect(result.results.root?.unlocks).toEqual(["left", "right"]);
  });

  it("diagnoses a true cycle and a self-loop while independent work stays ready", () => {
    const result = resolveActionGraph([
      node("x", 1, on("y")),
      node("y", 2, on("x")),
      node("loop", 3, on("loop")),
      node("after", 4, on("x")),
      node("free", 5),
    ]);
    expect(result.results.x).toMatchObject({
      status: "unresolved",
      reason: "dependency_cycle",
    });
    expect(result.results.y?.status).toBe("unresolved");
    expect(result.results.loop?.reason).toBe("dependency_cycle");
    expect(result.results.after).toMatchObject({
      status: "dependency_blocked",
      reason: "prerequisite_unresolved",
      blockedBy: ["x"],
    });
    expect(result.results.free?.status).toBe("ready_for_actor");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { kind: "dependency_cycle", members: ["x", "y"] },
        { kind: "dependency_cycle", members: ["loop"] },
      ]),
    );
  });

  it("reports a missing reference and an impossible condition without false completion", () => {
    const result = resolveActionGraph([
      node("dangling", 1, on("nowhere")),
      node("impossible", 2, when("declined and accepted", "contradiction")),
      node("free", 3),
    ]);
    expect(result.results.dangling).toMatchObject({
      status: "unresolved",
      reason: "missing_reference",
    });
    expect(result.results.impossible).toMatchObject({
      status: "unresolved",
      reason: "impossible_condition",
    });
    expect(result.results.free?.status).toBe("ready_for_actor");
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { kind: "missing_reference", from: "dangling", to: "nowhere" },
        {
          kind: "impossible_condition",
          node: "impossible",
          conditions: ["declined and accepted"],
        },
      ]),
    );
  });

  it("keeps unknown applicability and an unavailable source local to their dependents", () => {
    const result = resolveActionGraph([
      node("maybe", 1, undefined, { applicability: "unknown" }),
      node("afterMaybe", 2, on("maybe")),
      node("packet", 3, undefined, { sourceUnavailable: true }),
      node("afterPacket", 4, on("packet")),
      node("unrelated", 5),
      node("unknownCondition", 6, when("policy readable", "unknown")),
    ]);
    expect(result.results.maybe).toMatchObject({
      status: "unknown",
      reason: "applicability_unknown",
    });
    expect(result.results.afterMaybe).toMatchObject({
      status: "unknown",
      reason: "prerequisite_unknown",
    });
    expect(result.results.packet).toMatchObject({
      status: "unknown",
      reason: "source_unavailable",
    });
    expect(result.results.afterPacket?.status).toBe("unknown");
    expect(result.results.unrelated?.status).toBe("ready_for_actor");
    expect(result.results.unknownCondition?.status).toBe("unknown");
  });

  it("separates waiting, another actor and a missing control", () => {
    const result = resolveActionGraph([
      node("owner", 1, undefined, { waitingOn: "the owner" }),
      node("afterOwner", 2, on("owner")),
      node("approve", 3, undefined, { actor: "other_actor" }),
      node("legacy", 4, undefined, { actor: "none" }),
    ]);
    expect(result.results.owner?.status).toBe("waiting");
    expect(result.results.afterOwner).toMatchObject({
      status: "dependency_blocked",
      resolvableVia: ["owner"],
    });
    expect(result.results.approve?.status).toBe("ready_for_other_actor");
    expect(result.results.legacy).toMatchObject({
      status: "unresolved",
      reason: "no_control",
    });
  });

  it("lets recorded completion stand even when an earlier prerequisite is still open", () => {
    const result = resolveActionGraph([
      node("outreach", 1),
      node("response", 2, on("outreach"), done),
    ]);
    expect(result.results.response?.status).toBe("complete");
    expect(result.results.outreach?.status).toBe("ready_for_actor");
  });

  it("is deterministic under shuffled input and never mutates it", () => {
    const nodes = [
      node("a", 2),
      node("b", 1, on("a")),
      node("c", 1),
      node("d", 3, all(on("b"), on("c"))),
      node("e", 1, any(on("a"), on("d"))),
    ];
    const frozen = deepFreeze(nodes.map((entry) => ({ ...entry })));
    const expected = resolveActionGraph(frozen);
    const shuffles = [
      [4, 3, 2, 1, 0],
      [2, 0, 4, 1, 3],
      [1, 4, 0, 3, 2],
    ];
    for (const shuffle of shuffles) {
      const permuted = shuffle.map((position) => frozen[position]!);
      expect(resolveActionGraph(permuted)).toEqual(expected);
    }
    // "a" inherits the urgency of "b" (priority 1, id b), which sorts before "c".
    expect(expected.order).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("reports a duplicate id and keeps the first definition", () => {
    const result = resolveActionGraph([node("a", 1), node("a", 2, undefined, done)]);
    expect(result.results.a?.status).toBe("ready_for_actor");
    expect(result.diagnostics).toEqual([{ kind: "duplicate_node", id: "a" }]);
  });

  it("returns nothing for an empty graph and never invents completion", () => {
    expect(resolveActionGraph([])).toEqual({ order: [], results: {}, diagnostics: [] });
  });

  it("terminates on a long chain with one ready frontier", () => {
    const chain = Array.from({ length: 500 }, (_, position) =>
      node(
        `n${String(position).padStart(3, "0")}`,
        500 - position,
        position === 0 ? undefined : on(`n${String(position - 1).padStart(3, "0")}`),
      ),
    );
    const started = Date.now();
    const result = resolveActionGraph(chain);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.order[0]).toBe("n000");
    expect(result.order[499]).toBe("n499");
    expect(result.results.n499?.resolvableVia).toEqual(["n000"]);
    expect(
      Object.values(result.results).filter((entry) => entry.status === "ready_for_actor"),
    ).toHaveLength(1);
  });
});
