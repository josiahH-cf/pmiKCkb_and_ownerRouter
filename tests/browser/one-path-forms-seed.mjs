// S253 rehearsal seed: the synthetic forms a local rehearsal prepares in a browser.
//
// Everything here is invented. The three forms have the same SHAPE as the forms the business uses
// and none of their wording, names, amounts or coordinates: a pet agreement whose printed text
// states one processing fee while a visible overlay shows another, with two amount blanks and four
// animal rows; an owner acknowledgment with a "Lease executed on" line, two owner name slots and a
// large box; and a two-page brokerage brochure on turned pages with four footer boxes and no
// blanks. The owner acknowledgment and the brochure print two DIFFERENT invented organization
// names. A plain renewal extension is included so a packet has a form to sign.
//
// The seed writes into the Firestore emulator only what an Admin and staff need before they act:
// the approved synthetic originals (publications and their bytes), their reviewed maps as approved
// intake entries, and each lease's packet facts, people and animals. It publishes NO charge policy
// and NO fee, records NO deposit, writes NO owner explanation and saves NO starting text: those are
// done by the rehearsal's Admin and staff through the real controls.
// `tests/firestore/s253-one-path-seed.test.ts` runs this seed against the emulator and takes the
// same steps through the stores those controls call.
//
// Two Admin steps finish the setup, both through the real controls (no document is written for
// them here):
//   1. Admin > Renewal packet configuration > Form families: set "Approved brokerage disclosure
//      brochure" to Required (select #family-use-brokerage_disclosure). Recording a family use
//      rewrites the approved catalog from the seeded approved forms.
//   2. Admin > Renewal packet configuration > Renewal charge policy: enter the pet processing fee
//      (#policy-pet-fee), where it comes from (#policy-pet-fee-source) and the effective date
//      (#policy-effective), leave the package, insurance and tiers empty, and publish.
//
// How each litmus check is reached on a seeded lease (Lease > Document preparation):
//   L63  "Open packet inputs". Animals: enter the pet's deposit (#<animalId>-deposit) and where it
//        comes from (#<animalId>-deposit-source), "Save animals". Charges then shows
//        [data-renewal-field="pet-agreement-amounts"] with [data-pet-agreement="fee"], "deposit"
//        and "total". "Evaluate packet", then on the animal agreement "Check filled document",
//        "Prepare filled PDF", "Download filled PDF for inspection". "Filled values and
//        provenance" lists Deposit (the first amount blank) and Total (the second).
//   L64  The downloaded pet agreement reads the published fee in its fee sentence and "$150"
//        nowhere (ONE_PATH_OLD_FEE_TEXT). For the file made to differ, call
//        seedOnePathForms(db, { differingPetAgreement: true }), repeat Admin step 1 (any family
//        use change rewrites the catalog), "Evaluate current truth" and prepare again: it is
//        refused and the message names the fee the form's text states.
//   L65  A lease seeded with animals "one_pet" and no deposit, or "two_pets":
//        [data-pet-agreement="total"] reads "left blank", [data-pet-agreement-needs] names what is
//        needed, and after "Evaluate packet" the animal agreement shows
//        [data-form-hold="animal_agreement"] while the lease's other forms are prepared. A lease
//        seeded with "assistance_animal": the animal's row
//        ([data-packet-animal-charge="needs_rule"]) says only that the rule is needed, no pet
//        agreement amounts are shown at all, and the animal agreement is left undecided. The
//        Animals section offers no registration field for any animal.
//   L66  Packet inputs > Owner acknowledgment: type two paragraphs under "Explanation for the
//        owner", "Save explanation"; [data-renewal-field="owner-explanation-preview"] shows them
//        as two paragraphs. "Check the owner acknowledgment", "Check filled document", "Prepare
//        filled PDF". A text too long shows [data-renewal-field="owner-explanation-overflow"] and
//        preparing is refused with how much it is over. With none saved the section reads
//        [data-renewal-field="owner-explanation-need"] and the owner acknowledgment shows
//        [data-form-hold="owner_acknowledgment"], while the tenant forms prepare as usual.
//   L67  The prepared owner acknowledgment leaves the "Lease executed on" line blank
//        (ONE_PATH_EXECUTION_DATE_AREA is untouched). Its notes ([data-form-notes] in the Owner
//        acknowledgment section, its filled-document status and its row in "Form families for
//        this lease") say why.
//   L68  "Form families for this lease", row tr[data-family="brokerage_disclosure"]:
//        [data-form-notes] reads "Tenant initials: four boxes"; a lease seeded with five tenants
//        also shows [data-form-questions]. "Check filled document" on the brochure offers
//        "Download the approved file for inspection": its bytes are the seeded original
//        (forms.brokerage_disclosure.contentHash), so the four boxes are untouched.
//   L69  The prepared owner acknowledgment still prints ONE_PATH_ORGANIZATIONS.owner_acknowledgment
//        and the brochure still prints ONE_PATH_ORGANIZATIONS.brokerage_disclosure. The lease
//        shows [data-renewal-field="form-organization-difference"] as information.

import { createHash } from "node:crypto";
import { PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";

export const ONE_PATH_FORM_FAMILY = "synthetic-one-path";
export const ONE_PATH_SEED_ACTOR = "one-path-seed";
/** The fee the synthetic pet agreement's own text states, which a prepared file must not keep. */
export const ONE_PATH_OLD_FEE_TEXT = "$150";
/** Invented organization names. The two forms print different ones on purpose. */
export const ONE_PATH_ORGANIZATIONS = Object.freeze({
  animal_agreement: "Example Sample Rentals",
  owner_acknowledgment: "Sample Example Property Group",
  brokerage_disclosure: "Example Sample Brokerage Services",
});
/** Where the synthetic owner acknowledgment's "Lease executed on" blank is. Nothing draws here. */
export const ONE_PATH_EXECUTION_DATE_AREA = Object.freeze({
  pageIndex: 0,
  rect: Object.freeze({ x: 180, y: 662, width: 160, height: 16 }),
});
/** The Admin step that finishes the setup: recording it rewrites the approved catalog. */
export const ONE_PATH_FAMILY_USE_STEPS = Object.freeze([
  Object.freeze({ kind: "brokerage_disclosure", use: "mandatory" }),
]);

const PAGE = Object.freeze({ width: 612, height: 792 });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** The same canonical form the application hashes a reviewed map with: keys in order. */
function canonicalJson(value) {
  const canonical = (entry) =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, canonical(entry[key])]),
          )
        : entry;
  return JSON.stringify(canonical(value));
}

/** A stable identifier in UUID form, so a reseed writes the same documents. */
function stableId(label) {
  const hex = sha256(label);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const text = (x, y, size, value) =>
  `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${value}) Tj ET`;
const rule = (x1, y, x2) => `0 0 0 RG ${x1} ${y} m ${x2} ${y} l S`;
const outline = ({ x, y, width, height }) => `0 0 0 RG ${x} ${y} ${width} ${height} re S`;
const pageOf = (pageIndex, rotation = 0) => ({
  pageIndex,
  ...PAGE,
  rotation,
  cropBox: null,
});
const region = (regionId, fieldId, slot, pageIndex, rect, extra = {}) => ({
  regionId,
  fieldId,
  slot,
  pageIndex,
  rect,
  format: "text",
  fontSize: 10,
  align: "left",
  existing: "blank",
  ...extra,
});
const field = (fieldId, factKey, meaning, allowedSourceSystems, extra = {}) => ({
  fieldId,
  factKey,
  meaning,
  required: true,
  multiplicity: "single",
  allowedSourceSystems,
  ...extra,
});
const STAFF = ["renewal_staff_entry", "verified_contact", "rentvine"];

async function document(pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const { streams, rotation } of pages) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    page.node.set(
      PDFName.of("Resources"),
      pdf.context.obj({ Font: pdf.context.obj({ F1: font.ref }) }),
    );
    page.node.set(
      PDFName.of("Contents"),
      pdf.context.register(pdf.context.flateStream(streams.join("\n"))),
    );
    if (rotation) page.setRotation(degrees(rotation));
  }
  return { bytes: await pdf.save({ useObjectStreams: false }), font };
}

async function measure() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  return (value, size) => font.widthOfTextAtSize(value, size);
}

/** The synthetic pet agreement: two pages, four animal rows, a fee sentence and two amount blanks. */
async function petAgreement(differing) {
  const width = await measure();
  const feeLead = "The tenant pays a non-refundable pet processing fee of";
  const feeX = Math.ceil(72 + width(`${feeLead} `, 11)) + 4;
  const feeRect = { x: feeX - 4, y: 475, width: 52, height: 17 };
  const depositLead = "plus a refundable deposit of";
  const depositRect = {
    x: Math.ceil(72 + width(`${depositLead} `, 11)) + 4,
    y: 451,
    width: 96,
    height: 17,
  };
  const totalLead = "for a total of";
  const totalLeadX = depositRect.x + depositRect.width + 10;
  const totalRect = {
    x: Math.ceil(totalLeadX + width(`${totalLead} `, 11)) + 4,
    y: 451,
    width: 96,
    height: 17,
  };
  const rowY = (slot) => 578 - slot * 18;
  const columns = [
    ["AnimalType", "animal.species", "SYNTHETIC animal type", 72, 90],
    ["AnimalName", "animal.name", "SYNTHETIC animal name", 170, 110],
    ["AnimalWeight", "animal.weight", "SYNTHETIC animal weight", 290, 60],
    ["AnimalScore", "animal.fido_score", "SYNTHETIC screening score", 360, 60],
    [
      "AnimalDeposit",
      "animal.refundable_deposit",
      "SYNTHETIC deposit for this animal",
      430,
      100,
    ],
  ];
  const tenantRect = (slot) => ({
    x: 140 + (slot % 2) * 200,
    y: 668 - Math.floor(slot / 2) * 18,
    width: 190,
    height: 16,
  });
  // Two initial lines at the foot of each page that every signer shares. They name no signer
  // role, so they are protected and are not counted as one tenant's box.
  const initials = (pageIndex) => [
    { pageIndex, rect: { x: 72, y: 40, width: 60, height: 20 }, kind: "initial" },
    { pageIndex, rect: { x: 480, y: 40, width: 60, height: 20 }, kind: "initial" },
  ];
  const signatures = [0, 1, 2, 3].flatMap((slot) => [
    {
      pageIndex: 1,
      rect: { x: 72, y: 420 - slot * 44, width: 220, height: 26 },
      kind: "signature",
      signerRole: "tenant",
    },
    {
      pageIndex: 1,
      rect: { x: 320, y: 420 - slot * 44, width: 120, height: 26 },
      kind: "signing_date",
      signerRole: "tenant",
    },
  ]);
  const manager = [
    {
      pageIndex: 1,
      rect: { x: 72, y: 220, width: 220, height: 26 },
      kind: "signature",
      signerRole: "property_manager",
    },
    {
      pageIndex: 1,
      rect: { x: 320, y: 220, width: 120, height: 26 },
      kind: "signing_date",
      signerRole: "property_manager",
    },
  ];
  const first = [
    text(72, 740, 18, "SYNTHETIC PET AGREEMENT"),
    text(72, 716, 10, `Managed by ${ONE_PATH_ORGANIZATIONS.animal_agreement}`),
    text(72, 698, 11, "Property:"),
    rule(140, 692, 540),
    text(72, 672, 11, "Tenants:"),
    text(72, 632, 11, "Existing lease dated:"),
    rule(190, 630, 340),
    text(72, 600, 9, "Type"),
    text(170, 600, 9, "Name"),
    text(290, 600, 9, "Weight"),
    text(360, 600, 9, "Screening score"),
    text(430, 600, 9, "Deposit"),
    ...[0, 1, 2, 3].map((slot) => rule(72, rowY(slot) - 2, 540)),
    // The fee sentence. Its own text states one amount and a visible overlay shows another: the
    // conflict a prepared form must resolve to the published fee in both readings.
    text(72, 480, 11, feeLead),
    text(feeX, 480, 11, ONE_PATH_OLD_FEE_TEXT),
    `1 1 1 rg ${feeX - 2} 476 34 15 re f 0 0 0 rg`,
    text(feeX + 2, 480, 11, "$50"),
    text(feeRect.x + feeRect.width + 4, 480, 11, "at signing,"),
    text(72, 456, 11, depositLead),
    rule(depositRect.x, 452, depositRect.x + depositRect.width),
    text(totalLeadX, 456, 11, totalLead),
    rule(totalRect.x, 452, totalRect.x + totalRect.width),
    // An invented printed schedule. Nothing reads it: a printed amount is never a published policy.
    text(72, 410, 9, "SYNTHETIC printed schedule, shown on the form only:"),
    ...[5, 4, 3, 2, 1].map((score, index) =>
      text(
        72,
        396 - index * 12,
        9,
        `Screening score ${score}: deposit $${(6 - score) * 111}.00`,
      ),
    ),
    ...initials(0).map((area) => outline(area.rect)),
  ];
  const second = [
    text(72, 740, 14, "SYNTHETIC PET AGREEMENT, page 2"),
    text(72, 712, 10, "SYNTHETIC rule one: the tenant keeps the animal under control."),
    text(72, 698, 10, "SYNTHETIC rule two: the tenant repairs damage the animal causes."),
    ...(differing
      ? [
          text(
            72,
            660,
            10,
            `The pet processing fee of ${ONE_PATH_OLD_FEE_TEXT} applies to this agreement.`,
          ),
        ]
      : []),
    ...signatures
      .concat(manager)
      .map((area) => rule(area.rect.x, area.rect.y, area.rect.x + area.rect.width)),
    ...initials(1).map((area) => outline(area.rect)),
  ];
  const { bytes } = await document([{ streams: first }, { streams: second }]);
  const map = (templateVersion) => ({
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "animal_agreement",
    mapVersion: differing ? "one-path-pet-differing-v1" : "one-path-pet-v1",
    templateVersion,
    formFamily: ONE_PATH_FORM_FAMILY,
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension", "full_lease_packet"],
    fields: [
      field("Property", "property.address", "SYNTHETIC property address", STAFF),
      field("TenantName", "party.name", "SYNTHETIC tenant printed name", STAFF, {
        multiplicity: "per_party",
      }),
      ...columns.map(([fieldId, factKey, meaning]) =>
        field(
          fieldId,
          factKey,
          meaning,
          [
            "renewal_staff_entry",
            "renewal_staff_deposit",
            "renewal_staff_override",
            "renewal_charge_policy",
          ],
          {
            multiplicity: "per_animal",
            required: fieldId === "AnimalType" || fieldId === "AnimalName",
          },
        ),
      ),
      field(
        "ProcessingFee",
        "charges.pet_processing_fee",
        "SYNTHETIC processing fee stated in the fee sentence",
        ["renewal_charge_policy"],
      ),
      field(
        "Deposit",
        "charges.pet_agreement_deposit",
        "SYNTHETIC first amount blank: the refundable deposit",
        ["renewal_staff_deposit", "renewal_staff_override", "renewal_charge_policy"],
      ),
      field(
        "Total",
        "charges.pet_agreement_total",
        "SYNTHETIC second amount blank: the fee plus the deposit",
        ["renewal_charge_policy"],
      ),
    ],
    signers: [
      ...[1, 2, 3, 4].map((slot) => ({
        signerRole: "tenant",
        participantKind: "tenant",
        required: slot === 1,
        location: `Tenant signature ${slot}`,
      })),
      {
        signerRole: "property_manager",
        participantKind: "agent",
        required: true,
        location: "Manager signature",
      },
    ],
    reviewNote: "SYNTHETIC rehearsal review",
    static: {
      pages: [pageOf(0), pageOf(1)],
      regions: [
        region("Property", "Property", 0, 0, { x: 140, y: 692, width: 400, height: 16 }),
        ...[0, 1, 2, 3].map((slot) =>
          region(`TenantName-${slot + 1}`, "TenantName", slot, 0, tenantRect(slot)),
        ),
        ...[0, 1, 2, 3].flatMap((slot) =>
          columns.map(([fieldId, , , x, columnWidth]) =>
            region(
              `${fieldId}-${slot + 1}`,
              fieldId,
              slot,
              0,
              { x, y: rowY(slot), width: columnWidth - 4, height: 16 },
              fieldId === "AnimalDeposit" ? { format: "money" } : {},
            ),
          ),
        ),
        region("ProcessingFee", "ProcessingFee", 0, 0, feeRect, {
          format: "money",
          fontSize: 11,
          existing: "replace",
        }),
        region("Deposit", "Deposit", 0, 0, depositRect, {
          format: "money",
          fontSize: 11,
        }),
        region("Total", "Total", 0, 0, totalRect, { format: "money", fontSize: 11 }),
      ],
      protectedRegions: [...initials(0), ...signatures, ...manager, ...initials(1)],
    },
    printedParties: [
      {
        pageIndex: 0,
        kind: "organization",
        text: ONE_PATH_ORGANIZATIONS.animal_agreement,
      },
    ],
  });
  return {
    kind: "animal_agreement",
    fileName: differing
      ? "synthetic-pet-agreement-differing.pdf"
      : "synthetic-pet-agreement.pdf",
    publicationId: differing
      ? "onepath-pet-differing-0001"
      : "onepath-pet-agreement-0001",
    bytes,
    pages: 2,
    map,
  };
}

/** The synthetic owner acknowledgment: one page with an execution-date line and a large box. */
async function ownerAcknowledgment() {
  const box = { x: 72, y: 300, width: 468, height: 220 };
  const streams = [
    text(72, 740, 18, "SYNTHETIC OWNER ACKNOWLEDGMENT"),
    text(72, 706, 11, `Of ${ONE_PATH_ORGANIZATIONS.owner_acknowledgment}`),
    text(72, 666, 11, "Lease executed on:"),
    rule(180, 664, 340),
    text(72, 638, 11, "Property:"),
    rule(140, 632, 540),
    text(72, 610, 11, "Owner:"),
    rule(140, 604, 340),
    rule(140, 584, 340),
    outline(box),
    rule(72, 200, 272),
    text(72, 188, 9, "Owner signature"),
    rule(320, 200, 520),
    text(320, 188, 9, "Owner signature"),
  ];
  const { bytes } = await document([{ streams }]);
  const map = (templateVersion) => ({
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "owner_acknowledgment",
    mapVersion: "one-path-owner-v1",
    templateVersion,
    formFamily: ONE_PATH_FORM_FAMILY,
    formFamilyExtensionCompatible: true,
    audience: "owner",
    allowedPacketContexts: ["owner_acknowledgment"],
    fields: [
      field("Property", "property.address", "SYNTHETIC property address", STAFF),
      field("OwnerName", "party.name", "SYNTHETIC owner printed name", STAFF, {
        multiplicity: "per_party",
      }),
      field(
        "Explanation",
        "owner_acknowledgment.explanation",
        "SYNTHETIC large box: the explanation written for this lease",
        ["renewal_staff_entry"],
      ),
    ],
    signers: [1, 2].map((slot) => ({
      signerRole: "owner",
      participantKind: "owner",
      required: slot === 1,
      location: `Owner signature ${slot}`,
    })),
    reviewNote: "SYNTHETIC rehearsal review",
    static: {
      pages: [pageOf(0)],
      regions: [
        region("Property", "Property", 0, 0, { x: 140, y: 632, width: 400, height: 16 }),
        region("OwnerName-1", "OwnerName", 0, 0, {
          x: 140,
          y: 604,
          width: 200,
          height: 16,
        }),
        region("OwnerName-2", "OwnerName", 1, 0, {
          x: 140,
          y: 584,
          width: 200,
          height: 16,
        }),
        region(
          "Explanation",
          "Explanation",
          0,
          0,
          { x: box.x + 6, y: box.y + 6, width: box.width - 12, height: box.height - 12 },
          { format: "paragraphs" },
        ),
      ],
      protectedRegions: [
        {
          ...ONE_PATH_EXECUTION_DATE_AREA,
          rect: { ...ONE_PATH_EXECUTION_DATE_AREA.rect },
          kind: "execution_date",
        },
        {
          pageIndex: 0,
          rect: { x: 72, y: 200, width: 200, height: 30 },
          kind: "signature",
          signerRole: "owner",
        },
        {
          pageIndex: 0,
          rect: { x: 320, y: 200, width: 200, height: 30 },
          kind: "signature",
          signerRole: "owner",
        },
      ],
    },
    printedParties: [
      {
        pageIndex: 0,
        kind: "organization",
        text: ONE_PATH_ORGANIZATIONS.owner_acknowledgment,
      },
    ],
  });
  return {
    kind: "owner_acknowledgment",
    fileName: "synthetic-owner-acknowledgment.pdf",
    publicationId: "onepath-owner-ack-0001",
    bytes,
    pages: 1,
    map,
  };
}

/** The synthetic brokerage brochure: two turned pages, four footer boxes and nothing to fill. */
async function brochure() {
  const boxes = [0, 1, 2, 3].map((index) => ({
    x: 72 + index * 70,
    y: 40,
    width: 44,
    height: 24,
  }));
  const first = [
    text(72, 740, 16, "SYNTHETIC BROKERAGE BROCHURE"),
    text(72, 716, 10, ONE_PATH_ORGANIZATIONS.brokerage_disclosure),
    text(72, 690, 10, "SYNTHETIC relationship one"),
    outline({ x: 250, y: 688, width: 10, height: 10 }),
    text(72, 672, 10, "SYNTHETIC relationship two"),
    outline({ x: 250, y: 670, width: 10, height: 10 }),
    ...boxes.map(outline),
  ];
  const second = [
    text(72, 740, 12, "SYNTHETIC BROKERAGE BROCHURE, page 2"),
    text(72, 716, 10, "SYNTHETIC general information for the reader."),
  ];
  const { bytes } = await document([
    { streams: first, rotation: 90 },
    { streams: second, rotation: 90 },
  ]);
  const map = (templateVersion) => ({
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "brokerage_disclosure",
    mapVersion: "one-path-brochure-v1",
    templateVersion,
    formFamily: ONE_PATH_FORM_FAMILY,
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension", "full_lease_packet"],
    fields: [],
    signers: [],
    reviewNote: "SYNTHETIC rehearsal review",
    unchangedAttachment: true,
    static: {
      pages: [pageOf(0, 90), pageOf(1, 90)],
      regions: [],
      protectedRegions: boxes.map((rect) => ({
        pageIndex: 0,
        rect,
        kind: "initial",
        signerRole: "tenant",
      })),
    },
    printedParties: [
      {
        pageIndex: 0,
        kind: "organization",
        text: ONE_PATH_ORGANIZATIONS.brokerage_disclosure,
      },
    ],
  });
  return {
    kind: "brokerage_disclosure",
    fileName: "synthetic-brokerage-brochure.pdf",
    publicationId: "onepath-brochure-0001",
    bytes,
    pages: 2,
    map,
  };
}

/** A plain synthetic renewal extension, so a packet has a form with signers. */
async function renewalExtension() {
  const streams = [
    text(72, 740, 18, "SYNTHETIC RENEWAL EXTENSION"),
    text(72, 700, 11, "Property:"),
    rule(140, 694, 540),
    text(72, 672, 11, "Tenants:"),
    ...[0, 1, 2, 3, 4, 5].map((slot) => rule(72, 300 - slot * 40, 272)),
    rule(320, 300, 520),
    text(320, 288, 9, "Manager signature"),
  ];
  const { bytes } = await document([{ streams }]);
  const tenantRect = (slot) => ({
    x: 140 + (slot % 2) * 200,
    y: 668 - Math.floor(slot / 2) * 18,
    width: 190,
    height: 16,
  });
  const map = (templateVersion) => ({
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "renewal_extension",
    mapVersion: "one-path-extension-v1",
    templateVersion,
    formFamily: ONE_PATH_FORM_FAMILY,
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      field("Property", "property.address", "SYNTHETIC property address", STAFF),
      field("TenantName", "party.name", "SYNTHETIC tenant printed name", STAFF, {
        multiplicity: "per_party",
      }),
    ],
    signers: [
      ...[1, 2, 3, 4, 5, 6].map((slot) => ({
        signerRole: "tenant",
        participantKind: "tenant",
        required: slot === 1,
        location: `Tenant signature ${slot}`,
      })),
      {
        signerRole: "property_manager",
        participantKind: "agent",
        required: true,
        location: "Manager signature",
      },
    ],
    reviewNote: "SYNTHETIC rehearsal review",
    static: {
      pages: [pageOf(0)],
      regions: [
        region("Property", "Property", 0, 0, { x: 140, y: 694, width: 400, height: 16 }),
        ...[0, 1, 2, 3, 4, 5].map((slot) =>
          region(`TenantName-${slot + 1}`, "TenantName", slot, 0, tenantRect(slot)),
        ),
      ],
      protectedRegions: [
        ...[0, 1, 2, 3, 4, 5].map((slot) => ({
          pageIndex: 0,
          rect: { x: 72, y: 300 - slot * 40, width: 200, height: 26 },
          kind: "signature",
          signerRole: "tenant",
        })),
        {
          pageIndex: 0,
          rect: { x: 320, y: 300, width: 200, height: 26 },
          kind: "signature",
          signerRole: "property_manager",
        },
      ],
    },
  });
  return {
    kind: "renewal_extension",
    fileName: "synthetic-renewal-extension.pdf",
    publicationId: "onepath-extension-0001",
    bytes,
    pages: 1,
    map,
  };
}

/**
 * Build the synthetic forms: their bytes, hashes and reviewed maps. Nothing is written.
 * `differingPetAgreement` builds the pet agreement whose text states its old fee a second time,
 * outside every reviewed region, so preparing it is refused.
 */
export async function buildOnePathForms(options = {}) {
  const built = [
    await petAgreement(Boolean(options.differingPetAgreement)),
    await ownerAcknowledgment(),
    await brochure(),
    ...(options.includeRenewalExtension === false ? [] : [await renewalExtension()]),
  ];
  return Object.fromEntries(
    built.map((form) => {
      const reference = `publication:${form.publicationId}`;
      const fieldMap = form.map(reference);
      return [
        form.kind,
        {
          kind: form.kind,
          fileName: form.fileName,
          publicationId: form.publicationId,
          reference,
          bytes: form.bytes,
          byteSize: form.bytes.byteLength,
          contentHash: sha256(form.bytes),
          pages: form.pages,
          fieldMap,
          mapHash: sha256(canonicalJson(fieldMap)),
          documentRef: `one-path-${form.kind}`,
        },
      ];
    }),
  );
}

/** The approved intake entry of one synthetic form, as the Admin review would leave it. */
export function onePathIntakeEntry(form, nowIso) {
  return {
    kind: form.kind,
    state: "approved",
    revision: 3,
    publication: {
      system: "s21_publication",
      reference: form.reference,
      contentHash: form.contentHash,
    },
    file: {
      fileName: form.fileName,
      detectedMimeType: "application/pdf",
      byteSize: form.byteSize,
    },
    classification: {
      format: "static_pdf",
      contentHash: form.contentHash,
      byteSize: form.byteSize,
      detectedMimeType: "application/pdf",
      hasAcroForm: false,
      hasXfa: false,
      hasEmbeddedScript: false,
      hasEmbeddedFiles: false,
      approximatePages: form.pages,
      reasons: [
        "No form fields are present; the document is completed by a person in Dotloop from the worksheet.",
      ],
    },
    providerBindings: { dotloopDocumentRef: form.documentRef },
    fieldMap: form.fieldMap,
    mapHash: form.mapHash,
    received_at: nowIso,
    received_by_uid: ONE_PATH_SEED_ACTOR,
    reviewed_at: nowIso,
    reviewed_by_uid: ONE_PATH_SEED_ACTOR,
    decided_at: nowIso,
    decided_by_uid: ONE_PATH_SEED_ACTOR,
    decision_reason: "SYNTHETIC rehearsal approval",
    updated_at: nowIso,
  };
}

/** The publication documents that hold one synthetic original's exact bytes. */
export function onePathPublication(form, nowIso) {
  const contentId = `onepath_${form.publicationId}`;
  const resourceId = `onepath-resource-${form.kind}`;
  return {
    version: {
      id: form.publicationId,
      data: {
        data_mode: "live",
        connectorId: "one-path-seed",
        contentByteSize: form.byteSize,
        contentHash: form.contentHash,
        contentRef: {
          byteSize: form.byteSize,
          chunkCount: 1,
          contentHash: form.contentHash,
          contentId,
          storage: "firestore-chunks-v1",
        },
        createdAt: nowIso,
        createdByUid: ONE_PATH_SEED_ACTOR,
        detectedMimeType: "application/pdf",
        fileName: form.fileName,
        path: `synthetic/${form.fileName}`,
        policyId: "one-path-seed-policy",
        resourceId,
        resourceType: "file",
        rootId: "one-path-seed-root",
        sensitivity: "Low",
        spaceId: "lease-renewals",
        validated: true,
        versionNumber: 1,
        renewalArtifactKind: form.kind,
      },
    },
    resource: {
      id: resourceId,
      data: {
        data_mode: "live",
        activeVersionId: form.publicationId,
        lastVersionNumber: 1,
        policyId: "one-path-seed-policy",
        resourceType: "file",
        spaceId: "lease-renewals",
        updatedAt: nowIso,
        updatedByUid: ONE_PATH_SEED_ACTOR,
      },
    },
    chunk: {
      id: `${contentId}_000`,
      data: {
        byteSize: form.byteSize,
        chunkBase64: Buffer.from(form.bytes).toString("base64"),
        chunkHash: form.contentHash,
        contentId,
        index: 0,
      },
    },
  };
}

const FACT_VALUES = Object.freeze([
  ["transaction.type", "existing_renewal", "Renewal of the existing lease"],
  ["management.origin", "pmi_managed", "Managed by PMI since the lease began"],
  ["active_lease.executed", true, "Yes"],
  ["active_lease.form_family", ONE_PATH_FORM_FAMILY, ONE_PATH_FORM_FAMILY],
  [
    "insurance.coverage_method",
    "verified_external_coverage",
    "Verified outside coverage",
  ],
  ["charges.resident_benefit_package.enrolled", false, "No"],
  ["property.year_built", 1995, "1995"],
  ["property.city_addendum_required", false, "No"],
  ["property.hoa_governed", false, "No"],
]);

const ANIMAL_PROFILES = Object.freeze({
  none: [],
  one_pet: [["Example Pet 1", "pet"]],
  two_pets: [
    ["Example Pet 1", "pet"],
    ["Example Pet 2", "pet"],
  ],
  assistance_animal: [["Example Helper", "assistance_animal"]],
  pet_and_assistance_animal: [
    ["Example Pet 1", "pet"],
    ["Example Helper", "assistance_animal"],
  ],
});
export const ONE_PATH_ANIMAL_PROFILES = Object.freeze(Object.keys(ANIMAL_PROFILES));

/**
 * One lease's packet facts, people and animals. It records no deposit and no explanation: staff
 * enter those in the rehearsal. `tenants` is how many tenants the lease has (five shows the
 * initials question); `animals` is one of ONE_PATH_ANIMAL_PROFILES.
 */
export function onePathPacketInputs(lease, nowIso) {
  const leaseId = String(lease.leaseId);
  const tenants = lease.tenants ?? 1;
  const profile = ANIMAL_PROFILES[lease.animals ?? "none"];
  if (!profile) throw new Error(`Unknown animal profile ${lease.animals}.`);
  const stamp = { recordedAt: nowIso, recordedByUid: ONE_PATH_SEED_ACTOR };
  const person = (label, fullName, signerRole, order, dotloopRole) => ({
    personId: stableId(`${leaseId}:person:${label}`),
    kind: "person",
    fullName,
    email: `${label}.lease${leaseId}@example.invalid`,
    emailBasis: "staff_reviewed",
    contactRef: null,
    roles: [{ signerRole, order, dotloopRole }],
  });
  return {
    schemaVersion: "renewal-packet-inputs/v1",
    leaseId,
    revision: 1,
    facts: Object.fromEntries(
      [
        ...FACT_VALUES,
        [
          "property.address",
          `${100 + (Number(leaseId) % 800)} Example Street, Sample City`,
          `${100 + (Number(leaseId) % 800)} Example Street, Sample City`,
        ],
      ].map(([fieldKey, value, displayValue]) => [
        fieldKey,
        {
          value,
          displayValue,
          revision: 1,
          eventId: stableId(`${leaseId}:fact:${fieldKey}`),
          ...stamp,
          origin: "staff_entry",
        },
      ]),
    ),
    people: {
      revision: 1,
      entries: [
        ...Array.from({ length: tenants }, (_, index) =>
          person(
            `tenant${index + 1}`,
            `Example Tenant ${index + 1}`,
            "tenant",
            index + 1,
            "TENANT",
          ),
        ),
        person("owner1", "Sample Owner 1", "owner", 1, "LANDLORD"),
        person("manager1", "Example Manager", "property_manager", 1, "PROPERTY_MANAGER"),
      ],
      updatedAt: nowIso,
      updatedByUid: ONE_PATH_SEED_ACTOR,
    },
    animals: {
      revision: 1,
      entries: profile.map(([name, treatment], index) => ({
        animalId: stableId(`${leaseId}:animal:${index + 1}`),
        name,
        species: "Dog",
        breed: "Mixed",
        weight: 30,
        weightUnit: "lb",
        weightBasis: "current",
        maturity: "adult",
        fidoScore: 4,
        treatment,
      })),
      updatedAt: nowIso,
      updatedByUid: ONE_PATH_SEED_ACTOR,
    },
    chargeOverrides: { revision: 0, entries: [] },
    updatedAt: nowIso,
    updatedByUid: ONE_PATH_SEED_ACTOR,
  };
}

/** The document id the application keeps one lease's packet inputs under. */
export const onePathPacketInputsDocId = (leaseId) => sha256(String(leaseId));

/**
 * Seed the synthetic forms and each named lease's packet inputs into the Firestore emulator.
 * Returns the built forms so a check can compare a downloaded file with its original.
 *
 * It writes: publication_versions, publication_resources, publication_content_chunks,
 * lease_artifact_intake, lease_document_packet_inputs and, only when none exists yet, a
 * lease_artifact_catalogs/current placeholder that the first Admin family-use change replaces
 * with the real approved catalog. It writes no charge policy, deposit, explanation or starting
 * text. It refuses to run without the emulator.
 */
export async function seedOnePathForms(db, options = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("The one-path forms seed writes to the Firestore emulator only.");
  const nowIso = options.nowIso ?? new Date().toISOString();
  const forms = await buildOnePathForms(options);
  for (const form of Object.values(forms)) {
    const publication = onePathPublication(form, nowIso);
    await db
      .collection("publication_content_chunks")
      .doc(publication.chunk.id)
      .set(publication.chunk.data);
    await db
      .collection("publication_versions")
      .doc(publication.version.id)
      .set(publication.version.data);
    await db
      .collection("publication_resources")
      .doc(publication.resource.id)
      .set(publication.resource.data);
    await db
      .collection("lease_artifact_intake")
      .doc(form.kind)
      .set(onePathIntakeEntry(form, nowIso));
  }
  const catalog = db.collection("lease_artifact_catalogs").doc("current");
  if (!(await catalog.get()).exists)
    await catalog.set({
      seededPlaceholder: true,
      note: "Replaced with the approved catalog when an Admin records a form family use.",
    });
  for (const lease of options.leases ?? [])
    await db
      .collection("lease_document_packet_inputs")
      .doc(onePathPacketInputsDocId(lease.leaseId))
      .set(onePathPacketInputs(lease, nowIso));
  return { forms, nowIso, familyUseSteps: ONE_PATH_FAMILY_USE_STEPS };
}
