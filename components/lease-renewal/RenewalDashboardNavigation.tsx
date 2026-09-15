"use client";

import { useEffect, useState, type ReactNode } from "react";
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
        ? "When this does not apply, record Not applicable with the reason and existing approved policy or artifact."
        : activity === "non_renewal_handoff"
          ? "Required only for a declined renewal."
          : "Required for the renewal branch."
    } Record the actual source or channel. Saving documents staff work; it does not perform or verify an external action.`,
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
          "Required for the affected action. Refresh stale or incomplete data and resolve the displayed conflicts. A correction is prepared here; a RentVine or Sheet change requires its own exact confirmation and readback.",
        target: "renewal-step-verify-renewal",
      },
      {
        title: "Reviewed cycle date and source",
        explanation:
          "Required before saving preparation or staff activity. Choose the reviewed lease-end or review date and its source. Saved values and activity belong to this lease and cycle.",
        target: "renewal-manual-cycle",
      },
    ],
  },
  {
    title: "2. Lease owner approval",
    explanation:
      "Prepare the recommendation, contact the owner, then record the actual response. Only explicit approval of exact terms supplies the tenant offer; a market estimate does not approve rent.",
    target: "renewal-section-owner",
    children: [
      {
        title: "RentCast automation",
        explanation:
          "Optional provider lookup, started with Look up market comps (reference only). Review its evidence or enter your own sourced market numbers, then Save comp preparation. Opening the section does not run a lookup. Saved preparation supplies the owner message.",
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
              "Enter the reviewed low, high and PMI number as available; these are optional preparation fields. The preparation source is required. Saved numbers enter the owner draft; they do not become owner-approved terms.",
          },
          {
            title: "Trend and analysis reference",
            explanation:
              "Available trend evidence and an optional analysis reference support the saved recommendation. Review the displayed source and omissions before saving.",
          },
        ],
      },
      {
        title: "Owner draft preparation",
        explanation:
          "Review the approved wording, saved market evidence and required message inputs. Save message inputs before leaving the lease; the preview identifies missing values. Copy the reviewed content or exact-confirm an unsent Gmail draft. A person sends it.",
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
          "Record the response and its source. Approval requires monthly base rent, effective date and term end date. These saved terms supply the tenant message and document handoff. Changed terms require downstream work to be reviewed again; no response keeps the cycle waiting.",
        target: "renewal-manual-owner_response",
        children: [
          {
            title: "Approved rent and dates",
            explanation:
              "Use the owner's actual approved values. Market preparation remains separate. A declined renewal leads to the non-renewal handoff; a revision request returns work to the owner stage.",
          },
        ],
      },
    ],
  },
  {
    title: "3. Tenant offer and response",
    explanation:
      "Use current owner-approved terms to prepare the tenant offer, record delivery, then record the actual tenant response. Acceptance advances to documents; a counter returns to owner review and a decline goes to the non-renewal handoff.",
    target: "renewal-section-tenant",
    children: [
      {
        title: "Tenant message inputs",
        explanation:
          "Save factual inputs and review the resulting draft. Rent and dates come from the approved terms. Required missing inputs stay visible; copying or creating an unsent draft does not record delivery.",
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
        "Record delivery of the offer with the current approved terms.",
      ),
      {
        title: "Tenant response",
        explanation:
          "Required to advance the chosen branch. Record the actual response and source against the current approved terms. Waiting or Needs verification remains incomplete.",
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
      "After tenant acceptance, use the current approved terms and verified resource locations to prepare the required documents. The document handoff shows the available facts and missing resources. Staff-recorded progress stays distinct from provider-verified execution.",
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
      "Complete each applicable follow-up or document why it does not apply. Once the current branch is ready, explicitly record staff completion. Pending source updates remain visible separately.",
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
          "Required to finish the staff checklist after the applicable branch and current terms are complete. This records a staff attestation, not verified completion in RentVine, Gmail or Dotloop.",
        target: "renewal-manual-complete",
      },
    ],
  },
];

function GlossaryEntry({ item }: { item: GlossaryItem }) {
  return (
    <details className="renewal-glossary-entry">
      <summary>{item.title}</summary>
      <p>{item.explanation}</p>
      {item.target ? (
        <Link
          prefetch={false}
          scroll={false}
          className="text-link renewal-workspace-link"
          href={`#${item.target}`}
        >
          Open this step
        </Link>
      ) : null}
      {item.children?.map((child) => (
        <GlossaryEntry key={child.title} item={child} />
      ))}
    </details>
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
  const [glossaryOpened, setGlossaryOpened] = useState(false);
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

  return (
    <div className="renewal-guided-workspace">
      <aside className="renewal-process-sidebar" aria-label="Renewal process help">
        <details
          className="renewal-process-glossary"
          onToggle={(event) => {
            if (event.currentTarget.open) setGlossaryOpened(true);
          }}
        >
          <summary>Process glossary</summary>
          <p>
            Start with Lease details and the reviewed cycle. Follow the next action above,
            then use this guide to see what each step needs and where saved values go.
            Expand any item independently.
          </p>
          {glossaryOpened
            ? PROCESS_GLOSSARY.map((item) => (
                <GlossaryEntry key={item.title} item={item} />
              ))
            : null}
        </details>
      </aside>
      <div className="ui-stack renewal-guided-content">
        <nav aria-label="Renewal dashboard sections" className="ui-row">
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
        {children}
      </div>
    </div>
  );
}

/** Focus the unresolved control, opening enclosing disclosures without recording any progress. */
export function focusRenewalDashboardControl(id: string) {
  if (!id.startsWith("renewal-")) return;
  const root = document.getElementById(id);
  if (!root) return;
  const candidates = root.querySelectorAll<HTMLElement>(
    "[data-renewal-next-control], [aria-invalid='true'], input, select, textarea, button, summary, a[href]",
  );
  const target =
    [...candidates].find(
      (element) =>
        element.hasAttribute("data-renewal-next-control") &&
        !element.matches(":disabled"),
    ) ??
    [...candidates].find(
      (element) =>
        !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true",
    ) ??
    root;
  let ancestor: HTMLElement | null = target;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: "start" });
}
