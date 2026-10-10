"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import {
  RENEWAL_DASHBOARD_SECTIONS,
  renewalDashboardTarget,
} from "@/lib/lease-renewal/dashboard-sections";

import {
  MANUAL_ACTIVITIES,
  type ManualActivity,
} from "@/lib/lease-renewal/workspace-state";

type GlossaryItem = {
  title: string;
  explanation: string;
  target?: string;
  children?: readonly GlossaryItem[];
};

function activityItem(activity: ManualActivity, explanation: string): GlossaryItem {
  const definition = MANUAL_ACTIVITIES[activity];
  return {
    title: definition.label,
    explanation: `${explanation} ${
      definition.conditional
        ? "When this does not apply, record Not applicable; a comment is optional."
        : activity === "non_renewal_handoff"
          ? "Required only for a declined renewal."
          : "Record it when it happens; nothing else waits on it."
    } The source or channel is optional. Saving documents staff work; it does not perform or verify an external action.`,
    target:
      activity === "non_renewal_handoff"
        ? "renewal-section-documents"
        : `renewal-manual-${activity}`,
    children: [
      {
        title: "Evidence and saved destination",
        explanation:
          "The outcome and source are saved to this lease's current cycle and guide the next step. Actual occurrence time is optional. Any offered Sheet update requires its own exact preview, confirmation and readback in Lease details.",
      },
    ],
  };
}

const PROCESS_GLOSSARY: readonly GlossaryItem[] = [
  {
    title: "1. Verify the lease and renewal cycle",
    explanation:
      "Start with the exact lease, unit, owners and tenants. Review source differences, contractual base rent and dates before preparing an offer. Recurring charges stay separate from base rent.",
    target: "renewal-section-lease-details",
    children: [
      {
        title: "Current source facts",
        explanation:
          "Refresh stale or incomplete data here and review any difference between sources. Your working values are kept. A RentVine or Sheet change has its own exact confirmation and readback.",
        target: "renewal-step-verify-renewal",
      },
      {
        title: "Recorded renewal work",
        explanation:
          "Everything staff record for this lease. Each entry saves on its own, and the first one starts the work record.",
        target: "renewal-card-manual-records",
      },
    ],
  },
  {
    title: "2. Lease owner approval",
    explanation:
      "Prepare the recommendation, contact the owner, then record the actual response. The working renewal terms supply the tenant offer; a market estimate does not approve rent.",
    target: "renewal-section-owner",
    children: [
      {
        title: "RentCast automation",
        explanation:
          "Optional provider lookup, started with Look up market comps (reference only). Review its evidence or enter your own sourced market numbers; the preparation saves by itself. Opening the section does not run a lookup. Saved preparation supplies the owner message.",
        target: "renewal-section-comps",
        children: [
          {
            title: "Subject attributes and contractual base rent",
            explanation:
              "The lookup uses source-resolved address, beds, baths and size where available. The displayed query explains what was sent or omitted. Base rent remains the lease's contractual amount, separate from recurring charges.",
          },
          {
            title: "Market range and PMI recommendation",
            explanation:
              "Enter the reviewed low, high and PMI number as available; these are optional preparation fields. The source is optional. Saved numbers enter the owner draft; they do not become owner-approved terms.",
          },
          {
            title: "Trend and analysis reference",
            explanation:
              "Available trend evidence and an optional analysis reference support the saved recommendation. Review the displayed source and omissions; the preparation saves by itself.",
          },
        ],
      },
      {
        title: "Owner draft preparation",
        explanation:
          "Review the approved wording, saved market evidence and message inputs; entries save by themselves and the preview marks missing values. Copy the reviewed content or open Communications, review the exact message, then choose Send or Schedule.",
        target: "renewal-section-owner",
        children: [
          {
            title: "Message inputs and signature",
            explanation:
              "Message inputs are saved for this lease, cycle and audience. Signature details and factual sources feed the displayed subject and body. The response-request wording and verified website are optional.",
          },
        ],
      },
      activityItem(
        "owner_outreach",
        "Record contact with the owner after the person sends or completes the outreach.",
      ),
      {
        title: "Owner response and exact terms",
        explanation:
          "Record the response; it saves when chosen and its source is optional. The rent and dates live in Working renewal terms.",
        target: "renewal-manual-owner_response",
        children: [
          {
            title: "Approved rent and dates",
            explanation:
              "Use the owner's actual approved values. Market preparation remains separate. A declined renewal leads to the non-renewal handoff; a revision request is guidance for the next owner conversation.",
          },
        ],
      },
    ],
  },
  {
    title: "3. Tenant offer and response",
    explanation:
      "Use the working renewal terms to prepare the tenant offer, then record delivery and the tenant's actual response, in any order.",
    target: "renewal-section-tenant",
    children: [
      {
        title: "Tenant message inputs",
        explanation:
          "Entries save by themselves. Rent and dates come from the working renewal terms. Missing values stay visible as markers. Copying and saving prepared wording do not record delivery.",
        children: [
          {
            title: "Separate charges and policy sources",
            explanation:
              "Record applicability, amounts, cadence, effective dates and comparison sources where called for. Lease origin, insurance applicability and remaining-charge comparison feed the tenant wording without being folded into base rent.",
          },
          {
            title: "Verified resource links",
            explanation:
              "The insurance flyer and renewal information form come from the saved resource locations. Blank pending-team locations remain blank and hold only the output that needs them; they never become customer links.",
            target: "renewal-section-documents",
          },
        ],
      },
      activityItem(
        "tenant_offer",
        "Record delivery of the offer built from the working renewal terms.",
      ),
      {
        title: "Tenant response",
        explanation:
          "Record the tenant's actual response; it saves when chosen and its source is optional. Waiting or Needs verification remains incomplete.",
        target: "renewal-manual-tenant_response",
      },
      activityItem(
        "information_form",
        "Record sending the applicable renewal information form so its return can be tracked.",
      ),
      activityItem(
        "form_returned",
        "Record return of the applicable information form to support document preparation.",
      ),
    ],
  },
  {
    title: "4. Documents and signatures",
    explanation:
      "Use the working renewal terms and verified resource locations to prepare the required documents. The document handoff shows the available facts and missing resources. Staff-recorded progress stays distinct from provider-verified execution.",
    target: "renewal-section-documents",
    children: [
      {
        title: "Document facts and resource locations",
        explanation:
          "Review exact parties, property and approved rent and dates in the handoff. Supply actual approved form locations where required. Source updates and any available document execution retain their separate review and confirmation controls.",
        target: "renewal-step-document-packet",
        children: [
          {
            title: "Approved terms into documentation",
            explanation:
              "The handoff uses the current saved owner-approved terms. Review changed terms before preparing, delivering or signing documents again. A prepared packet is not evidence of a signature.",
          },
        ],
      },
      activityItem("documents", "Record preparation of the actual required documents."),
      activityItem(
        "document_delivery",
        "Record delivery of the prepared documents to the required people.",
      ),
      activityItem(
        "signatures",
        "Record that the required people have signed; document presence alone does not establish this.",
      ),
      activityItem(
        "non_renewal_handoff",
        "When either party declines, record the documented handoff instead of completing renewal documents.",
      ),
    ],
  },
  {
    title: "5. Follow-up and completion",
    explanation:
      "Complete each applicable follow-up or record Not applicable. Record staff completion when the renewal is actually complete. Pending source updates remain visible separately.",
    target: "renewal-section-documents",
    children: [
      activityItem(
        "insurance",
        "Record the applicable insurance and additional-insured follow-up.",
      ),
      activityItem("rhino", "Record applicable Rhino renewal follow-up."),
      activityItem("pet", "Record applicable pet registration follow-up."),
      activityItem(
        "charges",
        "Record follow-up for the applicable recurring charges, separately from base rent.",
      ),
      activityItem("inspection", "Record applicable inspection follow-up."),
      activityItem("filter", "Record applicable air-filter delivery follow-up."),
      activityItem("utilities", "Record applicable utility proof follow-up."),
      activityItem(
        "assisted_housing",
        "Record the applicable assisted-housing form, owner signature and submission follow-up.",
      ),
      {
        title: "Record staff completion",
        explanation:
          "Record it when the renewal is actually complete; the checklist is guidance. This records a staff attestation, not verified completion in RentVine, Gmail or Dotloop.",
        target: "renewal-manual-complete",
      },
    ],
  },
];

function GuideEntry({ item, level }: { item: GlossaryItem; level: number }) {
  return (
    <li className="renewal-guide-entry" data-level={level}>
      {item.target ? (
        <Link
          prefetch={false}
          scroll={false}
          className="text-link renewal-workspace-link renewal-guide-link"
          href={`#${item.target}`}
        >
          {item.title}
        </Link>
      ) : (
        <span className="renewal-guide-title">{item.title}</span>
      )}
      <details className="renewal-glossary-entry">
        <summary>What this step needs</summary>
        <p>{item.explanation}</p>
      </details>
      {item.children?.length ? (
        <ol className="renewal-guide-list">
          {item.children.map((child) => (
            <GuideEntry key={child.title} item={child} level={level + 1} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/**
 * S114: the process guide is the clickable table of contents for every current dashboard section
 * and its real subsections and controls. Selecting an entry opens the enclosing disclosure and
 * focuses the actual target through the existing fragment handler; it never records progress.
 */
export function RenewalProcessGuide() {
  return (
    <nav aria-label="Process guide contents" className="renewal-process-guide">
      <ol className="renewal-guide-list">
        {PROCESS_GLOSSARY.map((item) => (
          <GuideEntry key={item.title} item={item} level={1} />
        ))}
      </ol>
    </nav>
  );
}

/** The five-section dashboard navigation. Exactly one instance is mounted per workspace. */
export function RenewalSectionNavigation() {
  return (
    <nav aria-label="Renewal dashboard sections" className="ui-row renewal-section-nav">
      {RENEWAL_DASHBOARD_SECTIONS.map((section) => (
        <Link
          prefetch={false}
          scroll={false}
          className="text-link renewal-workspace-link"
          key={section.id}
          href={`#renewal-section-${section.id}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

/** Fragment navigation only. Historical step URLs remain useful without mutating progress. */
export function RenewalDashboardNavigation({
  selectedStepId,
  children,
}: {
  selectedStepId?: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    const focusTarget = () => {
      const id =
        window.location.hash.slice(1) ||
        (selectedStepId ? renewalDashboardTarget(selectedStepId) : "");
      if (!id.startsWith("renewal-")) return;
      focusRenewalDashboardControl(id);
    };
    focusTarget();
    const onClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        !url.hash.startsWith("#renewal-")
      )
        return;
      queueMicrotask(() => focusRenewalDashboardControl(url.hash.slice(1)));
    };
    window.addEventListener("hashchange", focusTarget);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", focusTarget);
      document.removeEventListener("click", onClick);
    };
  }, [selectedStepId]);

  return <div className="ui-stack renewal-guided-content">{children}</div>;
}

/**
 * S144: a request to focus a dashboard control is first offered to the Focus view as a cancelable
 * `renewal:focus-request` event, so a link to a control outside the revealed task can choose the
 * task that owns it. Without a listener, or in Full view, nothing cancels it and focus proceeds
 * exactly as before.
 */
export const RENEWAL_FOCUS_REQUEST_EVENT = "renewal:focus-request";

let programmaticFocusMove = false;
/**
 * True while this module is moving focus itself (a refresh, a chosen task). An autosave that
 * runs when a field is left must not treat that move as the person leaving the field.
 */
export function isProgrammaticFocusMove(): boolean {
  return programmaticFocusMove;
}
/** Move focus as the page itself, never as the person leaving a field. */
export function focusProgrammatically(target: HTMLElement) {
  programmaticFocusMove = true;
  try {
    target.focus({ preventScroll: true });
  } finally {
    queueMicrotask(() => {
      programmaticFocusMove = false;
    });
  }
}

/** Focus the unresolved control, opening enclosing disclosures without recording any progress. */
export function focusRenewalDashboardControl(
  id: string,
  {
    allowButtons = true,
    focusContainer = false,
    viewRequest = true,
  }: { allowButtons?: boolean; focusContainer?: boolean; viewRequest?: boolean } = {},
) {
  if (!id.startsWith("renewal-")) return false;
  if (
    viewRequest &&
    !document.dispatchEvent(
      new CustomEvent(RENEWAL_FOCUS_REQUEST_EVENT, { cancelable: true, detail: { id } }),
    )
  )
    return true;
  const root = document.getElementById(id);
  if (
    !root ||
    root.matches(":disabled, [aria-disabled='true']") ||
    root.closest("[hidden], [aria-hidden='true']")
  )
    return false;
  const candidates = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-renewal-next-control], [aria-invalid='true'], input, select, textarea, button:not(.info-tip-trigger), summary, a[href]",
    ),
  ].filter(
    (element) =>
      !element.matches(
        ":disabled, [aria-disabled='true'], [hidden], input[type='hidden']",
      ) &&
      !element.closest("[hidden], [aria-hidden='true']") &&
      (allowButtons ||
        !element.matches("button, input[type='submit'], input[type='button']")),
  );
  const target = focusContainer
    ? root
    : (candidates.find(
        (element) =>
          element.hasAttribute("data-renewal-next-control") &&
          !element.matches(":disabled"),
      ) ??
      (!allowButtons
        ? candidates.find((element) => element.matches("input, select, textarea"))
        : undefined) ??
      candidates.find(
        (element) =>
          !element.matches(":disabled") &&
          element.getAttribute("aria-disabled") !== "true",
      ) ??
      root);
  if (
    !allowButtons &&
    target.matches("button, input[type='submit'], input[type='button']")
  )
    return false;
  let ancestor: HTMLElement | null = target;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  if (!target.matches("input, select, textarea, button, summary, a[href], [tabindex]"))
    target.tabIndex = -1;
  focusProgrammatically(target);
  target.scrollIntoView?.({ block: "start" });
  return document.activeElement === target;
}
