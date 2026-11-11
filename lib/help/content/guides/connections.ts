import type { HelpGuide } from "@/lib/help/types";

// S243 R-S243-1: the Manage Connections guide. Every role reads the page; the check, connect,
// refresh and save controls render only for an Admin, so they are marked conditional here.
export const CONNECTIONS_GUIDES: readonly HelpGuide[] = [
  {
    id: "manage-connections",
    section: "connections",
    title: "Manage Connections",
    audience: "All staff",
    purpose:
      "Read the status of every connected service, run a read-only check, connect and set up the company Dotloop account, and keep the shared renewal resource links every lease uses.",
    prerequisites: [
      "You are signed in. Every role reads Connections; the check, connect, refresh and save controls appear only for an Admin.",
      "Staff without Admin access use Request connection-management access at the top of the page to ask for it.",
    ],
    steps: [
      {
        id: "open-connections",
        action: "Open Connections from the Admin group of the primary navigation.",
        control: {
          label: "Connections",
          role: "heading",
          availability: "required",
          source: ["components/connections/ConnectionCenter.tsx"],
        },
        route: "/connections",
        where: "Connections, top of the page",
        result:
          "The page is marked Read-only checks and notes that connection status does not grant action authority. The page counts Connected, Need attention, Not connected and Closed by governance, and Needs setup links each connector that is missing setup.",
        effect: "reads",
      },
      {
        id: "read-connector-status",
        action:
          "Read each card under Renewal data: RentVine, Google Sheets, RentCast and LeadSimple.",
        control: {
          label: "Renewal data",
          role: "region",
          availability: "required",
          source: ["lib/navigation/admin-connections.ts"],
        },
        route: "/connections",
        where: "Connections, Renewal data",
        result:
          "Each card names the service, what it powers, its status, such as Connected, Ready to verify, Needs attention or Not connected, and a Next step. The RentCast card notes that a healthy connection does not authorize a lookup: paid lookups stay deliberate and allowance-controlled.",
        effect: "reads",
        note: "The same kind of card appears under Communications, Documents and storage, and Other operations. Staff without Admin access read the same status, and the Next step asks an Admin to finish, verify or connect the service.",
      },
      {
        id: "check-a-connection",
        action:
          "As an Admin, select Check RentVine connection to run its read-only live check.",
        control: {
          label: "Check RentVine connection",
          role: "button",
          region: "region:Renewal data",
          availability: "conditional",
          source: ["components/connections/VerifyConnectionButton.tsx"],
          sourceText: "Check {connectorName} connection",
        },
        route: "/connections#connector-rentvine",
        where: "Renewal data, RentVine card",
        result:
          "A line reads that RentVine answered the live check and the card then reads Connected, or that it did not pass, and the card keeps its status and next step. The check only reads.",
        effect: "reads",
        note: "Google Sheets, RentCast and Dotloop have the same check. Service keys are set up on the server and never typed here; Set up RentVine explains how the service connects.",
      },
      {
        id: "read-managed-mailbox",
        action:
          "Under Communications, read the Gmail (workflow communications) card for the managed mailbox connection.",
        control: {
          label: "Communications",
          role: "region",
          availability: "required",
          source: ["lib/navigation/admin-connections.ts"],
        },
        route: "/connections",
        where: "Connections, Communications",
        result:
          "The card shows whether the managed mailbox connection is set up. That connection links renewal threads, unsent drafts, confirmed replies, schedules and review attention to your work in Communications, and Gmail keeps the messages.",
        effect: "reads",
        note: "Staff send or schedule only from Communications, after the explicit Send or Schedule there. This page sends nothing.",
      },
      {
        id: "read-dotloop-readiness",
        action:
          "Open Dotloop under Documents and storage and read Dotloop renewal readiness.",
        control: {
          label: "Dotloop renewal readiness",
          role: "region",
          availability: "required",
          source: ["components/connections/DotloopConnectionPanel.tsx"],
        },
        route: "/connections#connector-dotloop",
        where: "Connections, Dotloop renewal readiness",
        result:
          "The first line states the readiness, for example Ready for renewal packets, Not connected or Unavailable. Below it are the company account, the access Dotloop reports, the saved profile, renewal template, transaction type and initial status, and each reason with its next step. Loop creation and document upload stay closed behind their own keys, so this connection starts nothing in Dotloop.",
        effect: "reads",
        note: "Signature setup and sending are completed by a person in Dotloop. Preparing and downloading filled forms does not need this connection, and staff use the company connection without a Dotloop sign-in of their own.",
      },
      {
        id: "connect-dotloop",
        action:
          "As an Admin, select Connect with Dotloop on the Dotloop card and authorize the company account in Dotloop.",
        control: {
          label: "Connect with Dotloop",
          role: "button",
          region: "region:Documents and storage",
          availability: "conditional",
          source: ["components/connections/ConnectorSetupActions.tsx"],
          sourceText: "Connect with {connectorName}",
        },
        route: "/connections#connector-dotloop",
        where: "Documents and storage, Dotloop card",
        result:
          "Dotloop opens to authorize the company account, then returns you to Connections, where a notice says whether the connection and its account check passed and the readiness shows the connection. Nothing is created in Dotloop.",
        effect: "saves-in-app",
        note: "An Admin connects the company account once for all staff. Once it is connected the card shows Disconnect instead, which removes the stored connection only after you type the exact phrase and select Confirm disconnect.",
      },
      {
        id: "refresh-dotloop-resources",
        action:
          "As an Admin, select Refresh Dotloop resources after connecting, or when the readiness says the check is out of date.",
        control: {
          label: "Refresh Dotloop resources",
          role: "button",
          region: "region:Dotloop renewal readiness",
          availability: "conditional",
          source: ["components/connections/DotloopConnectionPanel.tsx"],
        },
        route: "/connections#connector-dotloop",
        where: "Dotloop renewal readiness, below the readiness lines",
        result:
          "A status line confirms that Dotloop resources were checked, Resources last checked shows the new time, and the profile and template choices appear below.",
        effect: "reads",
        note: "The refresh reads the company account's profiles and templates. Observed template visibility by profile lists what each profile can see.",
      },
      {
        id: "choose-dotloop-profile",
        action: "Choose the supported individual profile in Dotloop profile.",
        control: {
          label: "Dotloop profile",
          role: "combobox",
          region: "region:Dotloop renewal readiness",
          availability: "conditional",
          source: ["components/connections/DotloopConnectionPanel.tsx"],
        },
        route: "/connections#connector-dotloop",
        where: "Dotloop renewal readiness, Dotloop profile",
        result:
          "Renewal template lists that profile's templates. A profile that cannot create lease loops shows in the list but cannot be chosen.",
        effect: "reads",
      },
      {
        id: "choose-renewal-template",
        action: "Choose the Renewal template, then choose its Initial loop status.",
        control: {
          label: "Renewal template",
          role: "combobox",
          region: "region:Dotloop renewal readiness",
          availability: "conditional",
          source: ["components/connections/DotloopConnectionPanel.tsx"],
        },
        route: "/connections#connector-dotloop",
        where: "Dotloop renewal readiness, Renewal template and Initial loop status",
        result:
          "Each template option names its transaction type, Listing for lease or Lease offer, and Initial loop status lists the statuses that template allows.",
        effect: "reads",
        note: "The transaction type comes from the template you choose. A template that is not a lease template cannot be chosen.",
      },
      {
        id: "save-dotloop-selection",
        action: "Select Save renewal resources.",
        control: {
          label: "Save renewal resources",
          role: "button",
          region: "region:Dotloop renewal readiness",
          availability: "conditional",
          source: ["components/connections/DotloopConnectionPanel.tsx"],
        },
        route: "/connections#connector-dotloop",
        where: "Dotloop renewal readiness, below Initial loop status",
        result:
          "A status line confirms the Dotloop renewal resources were saved, and the readiness lists the profile, renewal template, transaction type and initial status that renewal packets use.",
        effect: "saves-in-app",
        note: "Saving the selection creates no loop and uploads nothing.",
      },
      {
        id: "enter-resource-link",
        scene: "connections-resource-links",
        action:
          "In Renewal resource links, expand the panel, type the location in a box such as Insurance flyer, then tick I checked this destination and its intended use.",
        control: {
          label: "Insurance flyer",
          role: "label",
          region: "region:Renewal resource links",
          availability: "required",
          source: ["lib/lease-renewal/resource-locations.ts"],
        },
        route: "/connections#renewal-resource-locations",
        where: "Connections, Renewal resource links",
        result:
          "For an approved form location, the line under the box changes from Pending team input to Destination needs review, and to Destination checked by staff once the box is ticked. For the insurance flyer, the resident benefits package flyer and the renewal information form, the line reads Source pending with its reason until the tenant audience check is complete.",
        effect: "reads",
        note: "The boxes are shared by every lease: Insurance flyer, Resident benefits package flyer, Renewal information form and the approved legal-form locations, from Approved standard lease location to Approved insurance program addendum location. Every role reads them; only an Admin edits them.",
      },
      {
        id: "record-tenant-audience-check",
        action:
          "For the insurance flyer, the resident benefits package flyer or the renewal information form, fill its Tenant audience check: Document version, Audience, Covered recipients when only the named recipients can open it, How it was checked, What opened, Checked by, Checked on and Check valid until.",
        control: {
          label: "Document version",
          role: "label",
          region: "region:Renewal resource links",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalResourceLocations.tsx"],
        },
        route: "/connections#renewal-resource-locations",
        where: "Renewal resource links, under each tenant resource box",
        result:
          "After you save the box, its line reads Verified for tenants with the audience, who checked it and when, the date it stays valid until and the document version. Only a resource verified for tenants reaches a tenant offer, and creating a Gmail draft, Send and a scheduled send each check it again.",
        effect: "saves-in-app",
        note: "A link anyone may open needs a check made while signed out; a check made while signed in as staff does not show that tenants can open it. Only the named recipients covers the email addresses listed, one per line. Replacing the link clears its checks, and Clear audience check empties the fields. Complete every field or clear them: a partial check is not saved. A renewal information form link that is not verified is left out of the offer, and an offer that needs a flyer waits for it.",
      },
      {
        id: "save-resource-link",
        action: "Select the Save button under the box, for example Save insurance flyer.",
        control: {
          label: "Save insurance flyer",
          role: "button",
          region: "region:Renewal resource links",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalResourceLocations.tsx"],
          sourceText: "Save {field.label.toLowerCase()}",
        },
        route: "/connections#renewal-resource-locations",
        where: "Renewal resource links, below each box",
        result:
          "A status line confirms the link was saved and read back, and every lease reads the saved location; only a checked link reaches a packet, and only a tenant resource verified for tenants reaches a tenant message. A blank form location saves as pending team input and reads Pending team input, which is not an error.",
        effect: "saves-in-app",
        note: "A saved location is not approved legal content, a mapping or a signature.",
      },
    ],
    result:
      "You know each service's status, the company Dotloop profile, template, transaction type and initial status are saved, and every shared renewal resource link shows its saved location or Pending team input.",
    doesNotDo: [
      "Connection status grants no action authority; closed actions, runtime stops, exact confirmation and provider readiness stay separate checks.",
      "Checks and the Dotloop refresh only read; they change nothing in RentVine, Google, RentCast or Dotloop.",
      "The Dotloop connection and selection create no loop and upload no document; signing happens in Dotloop by hand.",
      "No service key or password is typed on this page; keys are set up on the server.",
      "A saved resource link is not approved legal content, and a blank box is pending team input, not an error.",
      "This page sends no message; staff send or schedule only from Communications.",
    ],
    relatedGuides: [
      "admin-tasks",
      "prepare-documents",
      "tenant-offer",
      "owner-message",
      "compare-rent",
    ],
    relatedScreens: ["connections", "admin-access"],
    lastUpdated: "2026-11-04",
    navItems: ["connections"],
  },
];
