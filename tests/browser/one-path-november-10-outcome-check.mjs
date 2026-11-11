// S271 ARCH-S271-4 / AC-S271-4: the N09-10 rendered verifier extended for S269 and S270. It is
// serialized into the guarded browser and reads actual layout and operable controls: one work area
// and one closed verification per outcome, the named supporting groups closed unless promoted or
// held by an exact reveal, the live priority first, no hidden fix, no effect inside evidence, one
// rent editor and no Send beside an unresolved attempt. A label or anchor alone never passes.
export function inspectNovemberTenOutcome(node) {
  const PROMOTED = [
    "save-failed",
    "save-saving",
    "invalid",
    "governing",
    "lead",
    "date-fix-return",
  ];
  const visible = (element) =>
    Boolean(
      element?.getClientRects().length &&
      !element.closest("[hidden], [inert], [data-renewal-focus-hidden]") &&
      (!element.parentElement?.closest("details:not([open])") ||
        element.matches("summary")) &&
      getComputedStyle(element).visibility === "visible",
    );
  const follows = (first, second) =>
    Boolean(
      first &&
      second &&
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  const guided = node.matches("[role=region][aria-label=Now]");
  const nowWork = guided
    ? node.querySelector("[data-renewal-work][data-renewal-priority-state]")
    : null;
  const work = Array.from(node.querySelectorAll("[data-renewal-work]")).filter(visible);
  const verification = Array.from(
    node.querySelectorAll("details[data-renewal-verification]"),
  ).filter(visible);
  const headings = Array.from(node.querySelectorAll("h2, h3")).filter(visible);
  const heading = headings[0];
  const controls = Array.from(
    node.querySelectorAll("button, input, select, textarea, a[href]"),
  ).filter(visible);
  const primary = controls.find(
    (control) =>
      control.hasAttribute("data-renewal-work-primary") &&
      !control.matches(":disabled, [aria-disabled=true]"),
  );
  const state =
    node.getAttribute("data-renewal-work-state") ??
    node
      .querySelector("[data-renewal-work-state]")
      ?.getAttribute("data-renewal-work-state");
  const hold = Array.from(
    node.querySelectorAll(
      "[role=alert], [data-renewal-field=waiting], [data-renewal-field=not-part], [data-renewal-priority-cue]",
    ),
  ).find(visible);
  const cue = primary ?? hold;
  const top = heading?.getBoundingClientRect().top;
  const bottom = cue?.getBoundingClientRect().bottom;
  const effectsInEvidence = verification.some((detail) =>
    detail.querySelector(
      "button:not(.info-tip-trigger), input, select, textarea, form, [role=button]:not(.info-tip-trigger), [contenteditable=true], a[data-renewal-effect]",
    ),
  );
  const rentEditors = Array.from(
    document.querySelectorAll(
      "input#renewal-now-rent-to-recommend, [data-working-field=terms_rent] input, input[data-renewal-field=terms_rent]",
    ),
  ).filter(visible);
  const sends = controls.filter((control) =>
    /^(send|review and send|review owner message|review tenant offer|schedule)/i.test(
      control.textContent.trim(),
    ),
  );
  const looseControls = controls.filter(
    (control) =>
      !control.closest(
        "[data-renewal-work], [data-renewal-secondary-work], details[data-renewal-verification]",
      ) && !control.matches(".info-tip-trigger"),
  );
  const fullSection = node.closest("section[id^=renewal-section-]");
  const unownedSectionControls = fullSection
    ? Array.from(fullSection.querySelectorAll("input, select, textarea, button, a[href]"))
        .filter(visible)
        .filter(
          (control) =>
            !control.matches(".info-tip-trigger") &&
            !control.closest("[data-renewal-outcome]"),
        )
    : [];
  // S270: the named supporting groups in this outcome's scope (the Now region in Guided, the Full
  // section in Full). A group whose summary the exact reveal hides is held open in place.
  const groupScope = guided ? node : (fullSection ?? node);
  const groups = Array.from(
    groupScope.querySelectorAll("details[data-renewal-secondary-work]"),
  )
    .filter((details) => {
      const summary = details.querySelector(":scope > summary");
      return summary && visible(summary);
    })
    .map((details) => ({
      details,
      label: details.querySelector(":scope > summary").textContent.trim(),
      named: details.getAttribute("data-renewal-group"),
      step: details.getAttribute("data-renewal-group-step"),
      open: details.open,
      promoted: details.getAttribute("data-renewal-promoted"),
      held: details.hasAttribute("data-renewal-focus-opened"),
    }));
  const openStacks = groups.filter(
    (group) => group.open && !group.held && !PROMOTED.includes(group.promoted ?? ""),
  ).length;
  const steps = groups.map((group) => group.step ?? "");
  const stacked = guided
    ? groups.length > 1
    : steps.some((step, index) => steps.indexOf(step) !== index);
  const unnamedGroups = groups.filter((group) => group.named !== group.label).length;
  // S269: the live priority leads. The cue opens the Now card's work, the primary sits in the
  // active group, and every supporting group follows that group.
  const nowCue = nowWork?.querySelector(":scope > [data-renewal-priority-cue]") ?? null;
  const activeGroup =
    nowWork?.querySelector(":scope > [data-renewal-active-group]") ?? null;
  const nowPrimary = nowWork?.querySelector("[data-renewal-now-primary]") ?? null;
  const leadFirst =
    !nowWork ||
    ((!nowCue || nowWork.firstElementChild === nowCue) &&
      (!nowPrimary || !activeGroup || activeGroup.contains(nowPrimary)) &&
      groups.every((group) => !activeGroup || follows(activeGroup, group.details)));
  return {
    view: guided ? "guided" : "full",
    workAreas: work.length,
    evidenceAreas: verification.length,
    evidenceOpen: verification.some((detail) => detail.open),
    verificationLabel:
      verification[0]?.querySelector(":scope > summary")?.textContent.trim() ?? null,
    effectsInEvidence,
    duplicateEditors: rentEditors.length > 1,
    visibleCue:
      typeof top === "number" &&
      typeof bottom === "number" &&
      bottom >= top &&
      bottom - top <= innerHeight,
    competingSend: state === "reconcile" && sends.length > 0,
    looseControls: looseControls.length + unownedSectionControls.length,
    inactive: state === "not_part" || state === "done" || state === "covered",
    groups: groups.map(({ label, named, step, open, promoted, held }) => ({
      label,
      named,
      step,
      open,
      promoted,
      held,
    })),
    openStacks,
    stackedGroups: stacked,
    unnamedGroups,
    leadFirst,
    priority: nowWork
      ? {
          state: nowWork.getAttribute("data-renewal-priority-state"),
          lead: nowWork.getAttribute("data-renewal-priority-lead"),
          owner: nowWork.getAttribute("data-renewal-priority-owner"),
          primary: nowPrimary?.textContent.trim() ?? null,
        }
      : null,
  };
}

/** The N09-10 faults plus the S269/S270 ones. Each name is a deliberate negative control. */
export function novemberTenOutcomeFaults(report) {
  return [
    report.workAreas !== 1 || report.evidenceAreas !== 1 || report.looseControls > 0
      ? "unconsolidated"
      : null,
    report.evidenceOpen ? "evidence initially open" : null,
    report.effectsInEvidence ? "effectful evidence" : null,
    report.duplicateEditors ? "duplicate working rent editor" : null,
    !report.inactive && !report.visibleCue ? "next action or fix is hidden" : null,
    report.competingSend ? "send competes with reconciliation" : null,
    report.openStacks > 0 || report.stackedGroups || report.unnamedGroups > 0
      ? "old open stacks"
      : null,
    report.leadFirst === false ? "active work not first" : null,
  ].filter(Boolean);
}

/** The S271 negative control names and the rendered fault each one must produce. */
export const NOVEMBER_TEN_NEGATIVE_CONTROLS = Object.freeze({
  oldOpenStacks: "old open stacks",
  duplicateEditor: "duplicate working rent editor",
  hiddenFix: "next action or fix is hidden",
  effectfulEvidence: "effectful evidence",
  sendCompetingWithReconciliation: "send competes with reconciliation",
});

/**
 * Serialized into the browser: inject one deliberate defect into an outcome scope and tag every
 * change so `restoreNovemberTenDefect` removes it. `oldOpenStacks` opens the existing groups and
 * adds an unnamed open stack with a retired label.
 */
export function injectNovemberTenDefect(scope, defect) {
  const work =
    scope.querySelector("[data-renewal-work][data-renewal-priority-state]") ??
    scope.querySelector("[data-renewal-work]");
  const evidence = scope.querySelector("details[data-renewal-verification]");
  const primary = work?.querySelector("[data-renewal-work-primary]");
  const holder = scope.matches("[data-renewal-work-state]")
    ? scope
    : (work?.closest("[data-renewal-work-state]") ?? work);
  const tagged = (node) => {
    node.dataset.s271Injected = "true";
    return node;
  };
  if (defect === "oldOpenStacks") {
    for (const details of scope.querySelectorAll("details[data-renewal-secondary-work]"))
      if (!details.open) {
        details.dataset.s271Opened = "true";
        details.open = true;
      }
    const stack = tagged(document.createElement("details"));
    stack.setAttribute("data-renewal-secondary-work", "");
    stack.open = true;
    stack.innerHTML = "<summary>Correct lease facts and review source updates</summary>";
    work.append(stack);
  }
  if (defect === "duplicateEditor") {
    const input = tagged(document.createElement("input"));
    input.dataset.renewalField = "terms_rent";
    work.append(input);
  }
  if (defect === "effectfulEvidence") {
    const button = tagged(document.createElement("button"));
    button.textContent = "Old action";
    evidence.append(button);
  }
  if (defect === "hiddenFix" && primary) {
    holder.dataset.s271RestoreState = holder.dataset.renewalWorkState ?? "";
    holder.dataset.renewalWorkState = "current";
    primary.dataset.s271Restore = primary.hasAttribute("style")
      ? "style:" + primary.getAttribute("style")
      : "none";
    primary.style.marginTop = "1500px";
  }
  if (defect === "sendCompetingWithReconciliation") {
    holder.dataset.s271RestoreState = holder.dataset.renewalWorkState ?? "";
    holder.dataset.renewalWorkState = "reconcile";
    const button = tagged(document.createElement("button"));
    button.textContent = "Review tenant offer";
    button.disabled = true;
    work.append(button);
  }
}

export function restoreNovemberTenDefect(scope) {
  for (const node of scope.querySelectorAll("[data-s271-injected]")) node.remove();
  for (const details of scope.querySelectorAll("[data-s271-opened]")) {
    details.open = false;
    delete details.dataset.s271Opened;
  }
  for (const node of scope.querySelectorAll("[data-s271-restore]")) {
    const saved = node.dataset.s271Restore;
    if (saved === "none") node.removeAttribute("style");
    else node.setAttribute("style", saved.slice("style:".length));
    delete node.dataset.s271Restore;
  }
  for (const node of [scope, ...scope.querySelectorAll("[data-s271-restore-state]")]) {
    if (node.dataset.s271RestoreState === undefined) continue;
    if (node.dataset.s271RestoreState)
      node.dataset.renewalWorkState = node.dataset.s271RestoreState;
    else delete node.dataset.renewalWorkState;
    delete node.dataset.s271RestoreState;
  }
}
