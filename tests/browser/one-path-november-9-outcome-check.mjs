// Serialized into the guarded browser. Inspect actual layout and operable controls.
export function inspectOutcome(node) {
  const visible = (element) =>
    Boolean(
      element?.getClientRects().length &&
      !element.closest("[hidden], [inert], [data-renewal-focus-hidden]") &&
      (!element.parentElement?.closest("details:not([open])") ||
        element.matches("summary")) &&
      getComputedStyle(element).visibility === "visible",
    );
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
      "[role=alert], [data-renewal-field=waiting], [data-renewal-field=not-part]",
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
  // S269 names the Guided send entries "Review owner message" and "Review tenant offer".
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
  return {
    workAreas: work.length,
    evidenceAreas: verification.length,
    evidenceOpen: verification.some((detail) => detail.open),
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
  };
}

export function outcomeFaults(report) {
  return [
    report.workAreas !== 1 || report.evidenceAreas !== 1 || report.looseControls > 0
      ? "unconsolidated"
      : null,
    report.evidenceOpen ? "evidence initially open" : null,
    report.effectsInEvidence ? "effectful evidence" : null,
    report.duplicateEditors ? "duplicate working rent editor" : null,
    !report.inactive && !report.visibleCue ? "next action or fix is hidden" : null,
    report.competingSend ? "send competes with reconciliation" : null,
  ].filter(Boolean);
}
