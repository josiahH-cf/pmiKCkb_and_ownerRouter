/** Shared by the rehearsal smoke and its isolated semantic-locator guard. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// S243 R-S243-7: the renewal step-to-control map lives in the staff help hub content; the retired
// operator guide's table moved there with the same step ids, roles, scopes and availability.
export const GUIDE_CONTROL_MAP_PATH = "lib/help/content/renewal-control-map.json";
const GUIDE_ROLES = [
  "button",
  "link",
  "heading",
  "combobox",
  "region",
  "list",
  "label",
  "phase",
  "summary",
];

function guideStep(cells) {
  if (
    !GUIDE_ROLES.includes(cells.role) ||
    !["required", "conditional"].includes(cells.availability)
  )
    throw new Error("Each guide step needs an exact semantic role and availability.");
  return {
    step: cells.step,
    page: cells.page,
    control: cells.control,
    role: cells.role,
    scope: cells.scope === "-" ? "" : cells.scope,
    availability: cells.availability,
    expectation: cells.expectation,
  };
}

/** The hub's renewal control map rows as guide steps. */
export function guideStepsFromControlMap(rows) {
  if (!Array.isArray(rows))
    throw new Error("The renewal control map must be a list of rows.");
  return rows.map((row) => guideStep({ ...row, scope: row.scope ?? "" }));
}

/** Reads the renewal control map from the help hub content. */
export function loadGuideSteps(root = process.cwd()) {
  return guideStepsFromControlMap(
    JSON.parse(readFileSync(join(root, GUIDE_CONTROL_MAP_PATH), "utf8")),
  );
}
export async function assertGuideControl(page, step) {
  const [scopeRole, ...scopeName] = (step.scope ?? "").split(":");
  const scope = step.scope
    ? page.getByRole(scopeName.length ? scopeRole : "region", {
        name: scopeName.length ? scopeName.join(":") : step.scope,
        exact: true,
      })
    : page;
  const control =
    step.role === "summary"
      ? scope.locator("summary").filter({
          hasText: new RegExp(`^${step.control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        })
      : step.role === "label"
        ? scope.getByLabel(step.control, { exact: true })
        : step.role === "phase"
          ? scope
              .getByRole("navigation", { name: "Renewal phases", exact: true })
              .getByRole("link")
              .filter({ has: page.getByText(step.control, { exact: true }) })
          : scope.getByRole(step.role, { name: step.control, exact: true });
  const match = control.first();
  if (step.availability === "conditional" && !(await match.isVisible()))
    return "unavailable";
  await match.waitFor({ state: "visible" });
  return "visible";
}

export function parseGuideSteps(markdown) {
  const rows = [];
  let inTable = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("| Step ")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.length !== 7)
      throw new Error("Each guide step needs an exact semantic role and availability.");
    rows.push(
      guideStep({
        step: cells[0],
        page: cells[1],
        control: cells[2],
        role: cells[3],
        scope: cells[4],
        availability: cells[5],
        expectation: cells[6],
      }),
    );
  }
  return rows;
}
