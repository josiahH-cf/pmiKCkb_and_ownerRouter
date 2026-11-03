// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  timeline: vi.fn(),
  definition: vi.fn(),
  checks: vi.fn(),
  processDefinition: vi.fn(),
  processRuns: vi.fn(),
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/workflows/WorkflowRunClient", () => ({
  WorkflowRunClient: () => <div>History body must not render</div>,
}));
vi.mock("@/components/workflows/ProcessDefinitionDetailClient", () => ({
  ProcessDefinitionDetailClient: () => <div>Retained process history body</div>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: async () => ({
    uid: "staff",
    email: "staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  }),
  primarySpaceHref: () => "/",
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("Unexpected redirect");
  },
}));
vi.mock("@/lib/firestore/workflows", () => ({
  getWorkflowRun: mocks.run,
  getWorkflowRunDefinition: mocks.definition,
  listWorkflowRunTimeline: mocks.timeline,
  getProcessDefinition: mocks.processDefinition,
  listWorkflowRuns: mocks.processRuns,
}));
vi.mock("@/lib/firestore/workflow-run-step-checks", () => ({
  listStepChecksForRun: mocks.checks,
}));
import WorkflowRunPage from "@/app/workflow-runs/[runId]/page";
import ProcessDefinitionPage from "@/app/processes/[definitionId]/page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders only a retirement notice for process detail before reading retained runs", async () => {
  mocks.processDefinition.mockResolvedValue({
    id: "maintenance-work-order-intake",
    space_id: "maintenance",
    status: "Draft",
  });
  mocks.processRuns.mockResolvedValue([]);
  render(
    await ProcessDefinitionPage({
      params: Promise.resolve({ definitionId: "maintenance-work-order-intake" }),
    }),
  );
  expect(
    screen.getByText(
      "Custom maintenance is retired. Manage maintenance in standalone Vendoroo.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("Retained process history body")).not.toBeInTheDocument();
  expect(mocks.processRuns).not.toHaveBeenCalled();
});

it("preserves ordinary staff process detail whose name mentions maintenance", async () => {
  mocks.processDefinition.mockResolvedValue({
    id: "ordinary",
    space_id: "owner-renewal-outreach",
    name: "Maintenance knowledge",
    status: "Draft",
  });
  mocks.processRuns.mockResolvedValue([]);
  render(
    await ProcessDefinitionPage({
      params: Promise.resolve({ definitionId: "ordinary" }),
    }),
  );
  expect(screen.getByText("Retained process history body")).toBeInTheDocument();
  expect(mocks.processRuns).toHaveBeenCalledTimes(1);
});

it("renders only the retirement notice after run metadata and never requests retained bodies", async () => {
  mocks.run.mockResolvedValue({
    id: "old-run",
    definition_id: "maintenance-work-order-intake",
    space_id: "maintenance",
  });
  mocks.definition.mockResolvedValue({ steps: [] });
  mocks.timeline.mockResolvedValue([]);
  mocks.checks.mockResolvedValue([]);
  render(await WorkflowRunPage({ params: Promise.resolve({ runId: "old-run" }) }));
  expect(
    screen.getByText(
      "Custom maintenance is retired. Manage maintenance in standalone Vendoroo.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("History body must not render")).not.toBeInTheDocument();
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.definition).not.toHaveBeenCalled();
  expect(mocks.timeline).not.toHaveBeenCalled();
  expect(mocks.checks).not.toHaveBeenCalled();
});

it("keeps an ordinary staff workflow page available", async () => {
  mocks.run.mockResolvedValue({
    id: "staff-run",
    definition_id: "ordinary-knowledge",
    space_id: "owner-renewal-outreach",
  });
  mocks.definition.mockResolvedValue({ steps: [] });
  mocks.timeline.mockResolvedValue([]);
  mocks.checks.mockResolvedValue([]);
  render(await WorkflowRunPage({ params: Promise.resolve({ runId: "staff-run" }) }));
  expect(screen.getByText("History body must not render")).toBeInTheDocument();
  expect(mocks.definition).toHaveBeenCalledTimes(1);
  expect(mocks.timeline).toHaveBeenCalledTimes(1);
  expect(mocks.checks).toHaveBeenCalledTimes(1);
});
