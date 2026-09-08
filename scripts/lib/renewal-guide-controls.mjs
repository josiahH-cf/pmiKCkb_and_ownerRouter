/** Shared by the rehearsal smoke and its isolated semantic-locator guard. */
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
    if (
      cells.length !== 7 ||
      ![
        "button",
        "link",
        "heading",
        "combobox",
        "region",
        "label",
        "phase",
        "summary",
      ].includes(cells[3]) ||
      !["required", "conditional"].includes(cells[5])
    )
      throw new Error("Each guide step needs an exact semantic role and availability.");
    rows.push({
      step: cells[0],
      page: cells[1],
      control: cells[2],
      role: cells[3],
      scope: cells[4] === "-" ? "" : cells[4],
      availability: cells[5],
      expectation: cells[6],
    });
  }
  return rows;
}
