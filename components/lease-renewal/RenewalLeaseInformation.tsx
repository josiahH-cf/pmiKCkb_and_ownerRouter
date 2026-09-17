// S114: the consolidated lease information panel. It reads the same owning projections as the
// workspace and desk (identity, term, rent references, status, validated destinations); it is not a
// second source of facts. Values are separately selectable and copyable; party names are copy
// targets, and each party's click-back filter is a separate link over the opaque party token.
// Server component: the party-filter key never reaches the client.

import Link from "next/link";
import type { ReactNode } from "react";

import { OVERALL_STATUS_LABEL } from "@/components/lease-renewal/RenewalDeskTable";
import {
  RenewalCopyAudience,
  RenewalCopyValue,
} from "@/components/lease-renewal/RenewalCopyValue";
import { RenewalWorkStatusControl } from "@/components/lease-renewal/RenewalWorkStatusControl";
import type { RenewalWorkStatusPanelInput } from "@/lib/lease-renewal/work-status";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  type ExternalDeskDestination,
} from "@/lib/lease-renewal/desk-destinations";
import type {
  DeskPartyIdentity,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import { normalizeRenewalDeskText } from "@/lib/lease-renewal/desk-query";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import { buildDeskHref } from "@/lib/lease-renewal/desk-view-continuation";
import { LEASE_TERM_LABELS } from "@/lib/lease-renewal/lease-term";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
  type PartyFilterResolver,
} from "@/lib/lease-renewal/party-filter-key";

function formatCurrencyReference(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
}

function Row({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PartyGroup({
  audience,
  heading,
  parties,
  partyFilters,
}: Readonly<{
  audience: "owner" | "tenant";
  heading: string;
  parties: readonly DeskPartyIdentity[];
  partyFilters: PartyFilterResolver;
}>) {
  const filterHref = (token: string) =>
    buildDeskHref(
      audience === "owner"
        ? { ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all", ownerKey: token }
        : { ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all", tenantKey: token },
    );
  return (
    <section aria-label={heading} className="ui-stack-tight">
      <h3>{heading}</h3>
      {parties.length === 0 ? (
        <p className="muted">Needs Verification</p>
      ) : (
        <>
          <RenewalCopyAudience
            audience={audience}
            parties={parties.map((party) => ({
              label: party.label,
              email: party.email?.label,
            }))}
          />
          <ul className="renewal-party-list renewal-info-parties">
            {parties.map((party) => {
              const token = partyFilters.tokenFor(
                audience,
                normalizeRenewalDeskText(party.label),
              );
              return (
                <li key={party.sourceRef}>
                  <div className="renewal-info-party-name">
                    <RenewalCopyValue label={`${audience} name`} value={party.label} />
                  </div>
                  <div className="renewal-info-party-contact">
                    {party.email ? (
                      <RenewalCopyValue
                        label={`${audience} email`}
                        value={party.email.label}
                      />
                    ) : (
                      <span className="muted">No email on file</span>
                    )}
                    {party.phone ? (
                      <RenewalCopyValue
                        label={`${audience} phone`}
                        value={party.phone.label}
                      />
                    ) : null}
                    {party.contactId ? (
                      <span className="renewal-td-secondary">
                        Contact ID: {party.contactId.label}
                      </span>
                    ) : null}
                    {party.status ? (
                      <span className="renewal-td-secondary">
                        Contact status: {party.status.label}
                      </span>
                    ) : null}
                  </div>
                  {token ? (
                    <Link
                      className="text-link renewal-workspace-link"
                      href={filterHref(token)}
                      prefetch={false}
                      title={`Show all leases belonging to this ${audience} in the renewal table`}
                    >
                      Show leases for this {audience}
                    </Link>
                  ) : (
                    <span className="muted">Party filter unavailable</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function RenewalLeaseInformation({
  sheetDestination = null,
  workspace,
  workStatus = null,
  canEditWorkStatus = false,
}: Readonly<{
  sheetDestination?: ExternalDeskDestination | null;
  workspace: RenewalLeaseWorkspace;
  /** S119: the staff work status read; null when the page did not attempt it. */
  workStatus?: RenewalWorkStatusPanelInput | null;
  canEditWorkStatus?: boolean;
}>) {
  const { summary } = workspace;
  const identity = summary.identity;
  const term = summary.leaseTerm;
  const partyFilters = createPartyFilterResolver(readPartyFilterKeyConfig(), "renewals");
  const rentvine = summary.sourceDestinations?.rentvine ?? null;
  const status =
    workspace.guidance.overallStatus === "complete" && summary.manualProgress?.complete
      ? "Completed: recorded by staff"
      : OVERALL_STATUS_LABEL[workspace.guidance.overallStatus];
  const stage = summary.manualProgress?.step.label ?? summary.stageLabel;

  return (
    <div className="ui-stack renewal-lease-information">
      <section aria-label="Property and lease" className="ui-stack-tight">
        <h3>Property and lease</h3>
        <dl className="renewal-info-list">
          <Row label="Address">
            <RenewalCopyValue label="address" value={summary.addressLabel} />
          </Row>
          {summary.propertyNameLabel ? (
            <Row label="Property">
              <RenewalCopyValue label="property" value={summary.propertyNameLabel} />
            </Row>
          ) : null}
          {identity.unit?.label ? (
            <Row label="Unit">
              <RenewalCopyValue label="unit" value={identity.unit.label.label} />
            </Row>
          ) : null}
          {identity.unit?.recordId ? (
            <Row label="Unit record">
              <RenewalCopyValue
                label="unit record"
                value={identity.unit.recordId.label}
              />
            </Row>
          ) : null}
          {identity.unit?.address &&
          identity.unit.address.label !== summary.addressLabel ? (
            <Row label="Unit address">
              <RenewalCopyValue
                label="unit address"
                value={identity.unit.address.label}
              />
            </Row>
          ) : null}
          <Row label="Lease ID">
            <RenewalCopyValue label="lease ID" value={summary.id} />
          </Row>
          <Row label="Lease dates">
            {term.startDateIso ? (
              <RenewalCopyValue label="lease start date" value={term.startDateIso} />
            ) : (
              "Needs Verification"
            )}{" "}
            to{" "}
            {term.endDateIso ? (
              <RenewalCopyValue label="lease end date" value={term.endDateIso} />
            ) : (
              "Needs Verification"
            )}
          </Row>
          <Row label="Term">{LEASE_TERM_LABELS[term.term]}</Row>
          {term.term === "month_to_month" ? (
            <>
              <Row label="Month-to-month since">
                {term.anchorDateIso ?? "Needs Verification"}
              </Row>
              <Row label="Next review">{term.nextReviewIso ?? "Needs review"}</Row>
            </>
          ) : null}
          <Row label="Status">
            {status}
            {stage ? ` · ${stage}` : ""}
          </Row>
        </dl>
      </section>

      {/* S119: the staff work status is a separate app-owned note beside the derived status. */}
      {workStatus ? (
        <section aria-label="Staff work status" className="ui-stack-tight">
          <h3>Staff work status</h3>
          <RenewalWorkStatusControl
            canEdit={canEditWorkStatus}
            leaseId={summary.id}
            read={workStatus}
          />
          <p className="muted">
            This status is a staff note for finding and resuming work. It does not record
            owner approval, a sent message, a signature, completion or a source update.
          </p>
        </section>
      ) : null}

      <section aria-label="Rent and references" className="ui-stack-tight">
        <h3>Rent and references</h3>
        <dl className="renewal-info-list">
          <Row label="Current contractual base rent">
            {summary.currentRent == null ? (
              "Needs verification"
            ) : (
              <RenewalCopyValue
                label="current contractual base rent"
                value={formatCurrencyReference(summary.currentRent)}
              />
            )}
          </Row>
          <Row label="Lease total (RentVine)">
            {summary.leaseTotalRent == null ? (
              "Unavailable"
            ) : (
              <RenewalCopyValue
                label="lease total"
                value={formatCurrencyReference(summary.leaseTotalRent)}
              />
            )}
          </Row>
          <Row label="Unit listed rent (reference)">
            {summary.unitListedRent == null ? (
              "Unavailable"
            ) : (
              <RenewalCopyValue
                label="unit listed rent"
                value={formatCurrencyReference(summary.unitListedRent)}
              />
            )}
          </Row>
        </dl>
        <p className="muted">
          Review or change rent and charges in Lease details. This panel reads the same
          current values and never changes them.
        </p>
      </section>

      <PartyGroup
        audience="owner"
        heading="Owners / clients"
        parties={identity.owners}
        partyFilters={partyFilters}
      />
      <PartyGroup
        audience="tenant"
        heading="Tenants"
        parties={identity.tenants}
        partyFilters={partyFilters}
      />

      <section aria-label="Source records" className="ui-stack-tight">
        <h3>Source records</h3>
        <ul className="ui-rows">
          <li>
            {rentvine ? (
              <>
                <a
                  className="text-link renewal-workspace-link"
                  href={rentvine.href}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  RentVine lease record
                </a>{" "}
                <span className="muted">{rentvine.label}</span>
              </>
            ) : (
              <span className="muted">
                RentVine lease record: not available from the current source read.
              </span>
            )}
            {/* S116 (R116.1): no native RentVine scoped or filter destination is documented or
                observed, so the scoped action is named as unavailable rather than guessed. */}
            <div className="muted">
              RentVine lease list filtered to this owner or property: unavailable (no
              verified RentVine filter destination).
            </div>
          </li>
          <li>
            {sheetDestination ? (
              <>
                <a
                  className="text-link renewal-workspace-link"
                  href={sheetDestination.href}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  Matched operating Sheet row
                </a>{" "}
                <span className="muted">{sheetDestination.label}</span>
              </>
            ) : (
              <span className="muted">
                Matched operating Sheet row: not available until this lease resolves to
                one exact row.
              </span>
            )}
          </li>
        </ul>
        <p className="muted">
          Copying details here does not verify an address, approve a message or change a
          source.
        </p>
      </section>
    </div>
  );
}
