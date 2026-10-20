import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { readArtifactIntakeManifest } from "@/lib/firestore/lease-artifact-intake";
import { readFamilyUseRecord } from "@/lib/firestore/lease-artifact-family-use";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import { getRenewalResourceLocations } from "@/lib/firestore/renewal-resource-locations";
import { readDotloopRuntimeReadiness } from "@/lib/connections/dotloop-runtime";
import { DOTLOOP_READINESS_REASON_TEXT } from "@/lib/connections/dotloop-readiness";
import { projectTemplateProcessReadiness } from "@/lib/lease-renewal/template-process-readiness";

/** Read app-owned setup only. Rendering never refreshes providers, creates a draft or changes a lease. */
export default async function RenewalReadinessPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability(renewalRoleCapability("read_workspace"));
  const [manifest, family, resources, dotloop] = await Promise.all([
    readArtifactIntakeManifest(),
    readFamilyUseRecord(),
    getRenewalResourceLocations(user).catch(() => null),
    readDotloopRuntimeReadiness(),
  ]);
  const rows = projectTemplateProcessReadiness({
    manifest,
    resources,
    familyUse: {
      readable: family.readable,
      families: resolveFamilyUse(family.record, new Date().toISOString()),
    },
  });
  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <h1>Renewal run readiness</h1>
        <p>
          Follow one real lease from current facts through reviewed messages, documents,
          human signing and confirmed RentVine updates. This page checks shared setup; it
          does not certify a lease or execute work.
        </p>
        <ol>
          <li>
            <Link href="/lease-renewal/live/desk">Choose the actual lease</Link>, refresh
            its facts and resolve source conflicts.
          </li>
          <li>
            <Link href="/gmail-hub">Review renewal communications</Link>. Confirm
            recipients, content, attachments and the exact schedule. Old authorizations
            remain on hold until fresh review; incoming replies or delivery failures pause
            follow-ups.
          </li>
          <li>
            Prepare the applicable forms below, review the saved filled PDFs and complete
            signature setup in Dotloop. Loop creation and document uploads from the app
            remain closed; a saved link or document presence does not prove signing.
          </li>
          <li>
            After actual confirmations, use the lease&apos;s exact-previewed Sheet and
            RentVine update controls. Staff-recorded progress and provider receipts keep
            their separate meanings.
          </li>
        </ol>
        <h2>Dotloop connection and template selection</h2>
        <p>
          Approved provider account: integrations@pmikcmetro.com. Current observed
          account: {dotloop.accountEmail ?? "not observed"}. Resource state:{" "}
          {dotloop.state.replaceAll("_", " ")}.
        </p>
        {dotloop.reasons.length ? (
          <ul>
            {dotloop.reasons.map((reason) => (
              <li key={reason}>{DOTLOOP_READINESS_REASON_TEXT[reason]}</li>
            ))}
          </ul>
        ) : null}
        <p>
          A company loop template and the PDF originals in Drive have different roles.
          Selection requires a successful current read for the approved account and a
          supported individual profile. A denied company read does not show that its
          template is missing.
        </p>
        <Link href="/connections#dotloop-readiness">
          Inspect connection, permissions and template visibility
        </Link>
        <h2>Forms by process</h2>
        <p>
          Process membership comes from the packet contract. A Drive source link is a
          location, not legal approval, a field map or a Dotloop template selection.
          Conditional forms are included only when the reviewed rule applies to that
          lease.
        </p>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Form family</th>
                <th>Process</th>
                <th>Use</th>
                <th>Source</th>
                <th>Preparation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.kind}>
                  <th scope="row">{row.label}</th>
                  <td>{row.processes.join("; ")}</td>
                  <td>
                    {row.applicability}
                    <br />
                    <span className="muted">{row.applicabilitySource}</span>
                  </td>
                  <td>
                    {row.sourceUrl ? (
                      <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                        Open recorded source
                      </a>
                    ) : (
                      row.sourceState
                    )}
                  </td>
                  <td>{row.preparation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <Link href="/connections#renewal-resource-locations">
            Maintain source locations
          </Link>{" "}
          ·{" "}
          <Link href="/admin#admin-lease-artifact-intake">
            Review originals, fields and signer mappings in Admin
          </Link>
        </p>
      </section>
    </AppShell>
  );
}
