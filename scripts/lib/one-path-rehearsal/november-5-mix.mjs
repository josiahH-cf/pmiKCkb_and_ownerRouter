// S254 R-S254-2 / R-S254-3 / ARCH-S254-3: the "November 5 mix" loader, shape check and RentVine
// stand-in answers. The data is one file, tests/fixtures/lease-renewal/november-5-mix.json: 38
// synthetic leases in the rehearsal's RentVine transport shape, with the seed data later suites
// need beside the source rows. This module is pure: it reads that one file and nothing else, and
// it reaches no network, store or clock unless a caller asks for today's business date.
//
// The same rows load on the starting commit and on the candidate, because the rehearsal's
// provider boundary (tests/browser/renewal-novdec-journey-network.mjs) answers RentVine reads
// from `rentvineStandInResponse` whichever application commit is being served.
import { readFileSync } from "node:fs";

export const NOVEMBER_5_MIX_PATH = "tests/fixtures/lease-renewal/november-5-mix.json";
export const NOVEMBER_5_MIX_TOTAL = 38;

/** R-S254-2: the group counts. Only these numbers come from the November 5 observation. */
export const NOVEMBER_5_MIX_COUNTS = Object.freeze({
  working_month: 5,
  carried_over: 4,
  later: 12,
  closed: 10,
  renewed_in_rentvine: 3,
  month_to_month: 3,
  move_out_notice: 1,
});

/** The five working-month leases of the litmus handoff. */
export const NOVEMBER_5_MIX_ROLES = Object.freeze([
  "prepared",
  "covered",
  "assisted",
  "missingRecipient",
  "replied",
]);

const GROUP_WORDING = Object.freeze({
  working_month: "leases ending in the working month",
  carried_over: "leases that ended the month before with no recorded completion",
  later: "leases ending later",
  closed: "leases closed in RentVine",
  renewed_in_rentvine:
    "leases whose RentVine end date is later than their recorded cycle",
  month_to_month: "month-to-month leases",
  move_out_notice: "leases with a move-out notice",
});

// The invented ranges every id, postal code and amount of the fixture stays inside.
const LEASE_ID_RANGE = [9101, 9138];
const SHEET_COLUMNS = 19;
const SHEET_LINK_PREFIX = "https://pmikcmetro.rentvine.com/leases/";
// The keys the app's classification reads for program wording, first present key first.
const PROGRAM_TEXT_KEYS = [
  "program",
  "programName",
  "leaseType",
  "leaseTypeName",
  "tags",
  "status",
];
const ASSISTANCE_WORDING = /voucher|section ?8|housing assistance|\bhap\b/i;

export function readNovember5Mix(path) {
  return JSON.parse(
    readFileSync(
      path ?? new URL(`../../../${NOVEMBER_5_MIX_PATH}`, import.meta.url),
      "utf8",
    ),
  );
}

/** Today's business date in America/Chicago, the calendar the Renewals desk works on. */
export function centralBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const pad2 = (value) => String(value).padStart(2, "0");
const lastDayOf = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

function requireIsoDate(value, what) {
  const match = typeof value === "string" ? value.match(ISO_DATE) : null;
  const valid =
    match &&
    Number(match[2]) >= 1 &&
    Number(match[2]) <= 12 &&
    Number(match[3]) >= 1 &&
    Number(match[3]) <= lastDayOf(Number(match[1]), Number(match[2]));
  if (!valid) throw new Error(`${what} must be a calendar date written YYYY-MM-DD.`);
  return value;
}

/** The working month is the next calendar month on the business date, written YYYY-MM. */
export function workingMonthFor(businessDate) {
  const next = monthIndex(requireIsoDate(businessDate, "The business date")) + 1;
  return `${Math.floor(next / 12)}-${pad2((next % 12) + 1)}`;
}

/**
 * Shift a date by whole months. A month end stays a month end (December 31 plus two months is
 * the last day of February); any other day keeps its number, held to the target month's length.
 */
export function shiftMixDate(date, months) {
  const match = requireIsoDate(date, "A fixture date").match(ISO_DATE);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(target / 12);
  const targetMonth = (target % 12) + 1;
  const last = lastDayOf(targetYear, targetMonth);
  const monthEnd = day === lastDayOf(year, month);
  return `${targetYear}-${pad2(targetMonth)}-${pad2(monthEnd ? last : Math.min(day, last))}`;
}

function shiftDates(value, months) {
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return shiftMixDate(value, months);
    const us = value.match(US_DATE);
    if (us) {
      const shifted = shiftMixDate(`${us[3]}-${pad2(us[1])}-${pad2(us[2])}`, months);
      return `${shifted.slice(5, 7)}/${shifted.slice(8, 10)}/${shifted.slice(0, 4)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => shiftDates(entry, months));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, shiftDates(entry, months)]),
    );
  return value;
}

/**
 * The fixture as the rehearsal serves it on a business date: every date moved by the whole
 * months between the anchor's month and the business date's month, so the working month is the
 * next calendar month whenever the rehearsal runs. The anchor business date itself is unchanged.
 */
export function loadNovember5Mix(fixture, businessDate) {
  const anchor = requireIsoDate(fixture.anchorBusinessDate, "The anchor business date");
  const monthsShifted =
    monthIndex(requireIsoDate(businessDate, "The business date")) - monthIndex(anchor);
  return {
    name: fixture.name,
    description: fixture.description,
    anchorBusinessDate: anchor,
    businessDate,
    workingMonth: workingMonthFor(businessDate),
    monthsShifted,
    statuses: structuredClone(fixture.statuses ?? []),
    leases: shiftDates(fixture.leases ?? [], monthsShifted),
    recordedCycles: shiftDates(fixture.recordedCycles ?? {}, monthsShifted),
    roles: structuredClone(fixture.roles ?? {}),
    sheet: shiftDates(fixture.sheet ?? { rows: [] }, monthsShifted),
  };
}

const statusOf = (mix, lease) =>
  mix.statuses.find(
    (entry) => String(entry?.leaseStatus?.leaseStatusID) === String(lease.leaseStatusID),
  )?.leaseStatus ?? null;

/** The RentVine text the classification reads for a lease, or null. */
function programText(lease) {
  for (const key of PROGRAM_TEXT_KEYS) {
    const value = lease[key];
    if (value !== undefined && value !== null && String(value).trim() !== "")
      return String(value);
  }
  return null;
}

/**
 * Each lease's group, read from the rows: the RentVine status, the term signal, the recorded
 * cycle and the end month. A lease that fits two of the special groups, or whose status is
 * neither active nor closed, is reported as a problem and counted in no group.
 */
export function summarizeNovember5Mix(mix) {
  const groups = Object.fromEntries(
    Object.keys(NOVEMBER_5_MIX_COUNTS).map((key) => [key, []]),
  );
  const problems = [];
  const assistanceWordingLeaseIds = [];
  for (const row of mix.leases) {
    const lease = row.lease;
    const status = statusOf(mix, lease);
    if (ASSISTANCE_WORDING.test(programText(lease) ?? ""))
      assistanceWordingLeaseIds.push(lease.leaseID);
    if (!status) {
      problems.push(
        `Lease ${lease.leaseID} has a status the status table does not hold.`,
      );
      continue;
    }
    const recorded = mix.recordedCycles[String(lease.leaseID)];
    const special = [
      String(status.primaryLeaseStatusID) === "3" ? "closed" : null,
      String(status.isPendingMoveOutStatus) === "1" ||
      String(status.isCompletedMoveOutStatus) === "1"
        ? "move_out_notice"
        : null,
      String(lease.isMonthToMonth ?? "0") === "1" ? "month_to_month" : null,
      recorded !== undefined && recorded < lease.endDate ? "renewed_in_rentvine" : null,
    ].filter(Boolean);
    if (special.length > 1) {
      problems.push(
        `Lease ${lease.leaseID} fits more than one group (${special.join(", ")}).`,
      );
      continue;
    }
    if (special.length === 1) {
      groups[special[0]].push(lease.leaseID);
      continue;
    }
    if (String(status.primaryLeaseStatusID) !== "2") {
      problems.push(`Lease ${lease.leaseID} is neither active nor closed in RentVine.`);
      continue;
    }
    const endMonth = String(lease.endDate).slice(0, 7);
    groups[
      endMonth === mix.workingMonth
        ? "working_month"
        : endMonth < mix.workingMonth
          ? "carried_over"
          : "later"
    ].push(lease.leaseID);
  }
  const counts = Object.fromEntries(
    Object.entries(groups).map(([key, ids]) => [key, ids.length]),
  );
  return { counts, groups, assistanceWordingLeaseIds, problems };
}

const SYNTHETIC_NAME = /\b(?:Example|Sample)\b/;
const EXAMPLE_ADDRESS = /^[a-z0-9._-]+@example\.invalid$/;
const PHONE = /\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/;
const PHONE_KEY = /phone|mobile|cell|fax/i;

/** Every string in a value with the path that holds it. */
function strings(value, path, out = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value))
    value.forEach((entry, index) => strings(entry, `${path}[${index}]`, out));
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value))
      strings(entry, `${path}.${key}`, out);
  return out;
}

/** AC-S254-4: values that are not plainly synthetic. */
function syntheticProblems(fixture) {
  const problems = [];
  const leaseIds = new Set();
  const postalCodes = new Set();
  for (const row of fixture.leases ?? []) {
    const id = row?.lease?.leaseID;
    const at = `Lease ${id}:`;
    if (!Number.isInteger(id) || id < LEASE_ID_RANGE[0] || id > LEASE_ID_RANGE[1])
      problems.push(
        `${at} lease id ${id} is outside the fixture's invented range (${LEASE_ID_RANGE[0]} to ${LEASE_ID_RANGE[1]}).`,
      );
    if (leaseIds.has(id)) problems.push(`${at} the lease id is used twice.`);
    leaseIds.add(id);
    for (const key of Object.keys(row ?? {}))
      if (!["lease", "property", "portfolio", "unit"].includes(key))
        problems.push(`${at} "${key}" is not part of the RentVine transport shape.`);
    const tenants = row?.lease?.tenants;
    if (!Array.isArray(tenants) || !tenants.length)
      problems.push(`${at} it names no tenant.`);
    for (const tenant of tenants ?? []) {
      if (!SYNTHETIC_NAME.test(String(tenant?.name ?? "")))
        problems.push(
          `${at} tenant name "${tenant?.name}" is not an Example or Sample name.`,
        );
      if (tenant?.email !== undefined && !EXAMPLE_ADDRESS.test(String(tenant.email)))
        problems.push(`${at} address "${tenant.email}" is not on example.invalid.`);
    }
    const owners = row?.portfolio?.owners;
    if (!Array.isArray(owners) || !owners.length)
      problems.push(`${at} it names no owner.`);
    for (const owner of owners ?? []) {
      if (!SYNTHETIC_NAME.test(String(owner?.name ?? "")))
        problems.push(
          `${at} owner name "${owner?.name}" is not an Example or Sample name.`,
        );
      if (owner?.email !== undefined && !EXAMPLE_ADDRESS.test(String(owner.email)))
        problems.push(`${at} address "${owner.email}" is not on example.invalid.`);
    }
    const property = row?.property ?? {};
    if (!SYNTHETIC_NAME.test(String(property.streetName ?? "")))
      problems.push(
        `${at} street "${property.streetName}" is not an Example or Sample street.`,
      );
    if (!SYNTHETIC_NAME.test(String(property.name ?? "")))
      problems.push(
        `${at} property name "${property.name}" is not an Example or Sample name.`,
      );
    if (property.city !== "Example City")
      problems.push(`${at} city "${property.city}" is not Example City.`);
    const unit = row?.unit ?? {};
    for (const [where, code] of [
      ["unit", unit.postalCode],
      ["property", property.postalCode],
    ]) {
      if (code === undefined && where === "property") continue;
      if (!/^001\d{2}$/.test(String(code)))
        problems.push(`${at} postal code "${code}" is not in the invented 001xx range.`);
    }
    if (postalCodes.has(unit.postalCode))
      problems.push(`${at} postal code "${unit.postalCode}" is used twice.`);
    postalCodes.add(unit.postalCode);
    const rent = String(unit.rent ?? "");
    if (!/^\d{3,4}\.00$/.test(rent) || Number(rent) % 50 !== 0)
      problems.push(`${at} rent "${unit.rent}" is not a plainly invented amount.`);
    for (const [path, text] of strings(row, "row")) {
      const key = path.slice(path.lastIndexOf(".") + 1);
      if (PHONE_KEY.test(key) || PHONE.test(text))
        problems.push(`${at} ${path.replace(/^row\./, "")} carries a phone number.`);
      if (ISO_DATE.test(text)) {
        const day = Number(text.slice(8, 10));
        const last = lastDayOf(Number(text.slice(0, 4)), Number(text.slice(5, 7)));
        if (day > 28 && day !== last)
          problems.push(
            `${at} the date ${text} is neither a month end nor a day every month has.`,
          );
      }
    }
  }
  // Seed data beside the rows: names, addresses and links are held to the same rule.
  for (const [path, text] of strings(
    { roles: fixture.roles, sheet: fixture.sheet, statuses: fixture.statuses },
    "fixture",
  )) {
    for (const address of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) ?? [])
      if (!EXAMPLE_ADDRESS.test(address))
        problems.push(`${path}: address "${address}" is not on example.invalid.`);
    if (
      /^https?:/i.test(text) &&
      !/^https:\/\/pmikcmetro\.rentvine\.com\/leases\/91\d{2}$/.test(text)
    )
      problems.push(
        `${path}: "${text}" is not a link to one of the fixture's own leases.`,
      );
    if (PHONE.test(text)) problems.push(`${path} carries a phone number.`);
  }
  for (const [role, seed] of Object.entries(fixture.roles ?? {})) {
    for (const name of [
      ...(seed?.animals ?? []).map((animal) => animal?.name),
      seed?.standingAgreement?.name,
      seed?.housingAssistance?.program,
    ])
      if (name !== undefined && !SYNTHETIC_NAME.test(String(name)))
        problems.push(`The ${role} role's "${name}" is not an Example or Sample name.`);
  }
  return problems;
}

/**
 * ARCH-S254-3 / AC-S254-4: problems with the fixture. A different group count, a lease in two
 * groups or in none, a role that does not name its lease, or any value that is not plainly
 * synthetic is a problem. The shape is checked as loaded on the business date given (the anchor
 * when none is).
 */
export function checkNovember5MixShape(fixture, businessDate) {
  const problems = [];
  if (fixture.name !== "November 5 mix")
    problems.push('The fixture is not named "November 5 mix".');
  const leases = fixture.leases ?? [];
  if (leases.length !== NOVEMBER_5_MIX_TOTAL)
    problems.push(
      `The fixture has ${leases.length} leases where ${NOVEMBER_5_MIX_TOTAL} belong.`,
    );
  problems.push(...syntheticProblems(fixture));

  const mix = loadNovember5Mix(fixture, businessDate ?? fixture.anchorBusinessDate);
  const summary = summarizeNovember5Mix(mix);
  problems.push(...summary.problems);
  for (const [group, expected] of Object.entries(NOVEMBER_5_MIX_COUNTS)) {
    const count = summary.counts[group];
    if (count !== expected)
      problems.push(
        `The fixture has ${count} ${GROUP_WORDING[group]} where ${expected} belong${expected === 1 ? "s" : ""}.`,
      );
  }
  const row = (leaseId) => mix.leases.find((entry) => entry.lease.leaseID === leaseId);

  // The carried-over leases ended in the month before the working month, on different days.
  const monthBefore = shiftMixDate(`${mix.workingMonth}-01`, -1).slice(0, 7);
  const carried = summary.groups.carried_over.map((id) => row(id).lease.endDate);
  if (carried.some((date) => date.slice(0, 7) !== monthBefore))
    problems.push("A carried-over lease ends before the month before the working month.");
  if (new Set(carried).size !== carried.length)
    problems.push(
      "Two carried-over leases share an end date, so their order cannot be seen.",
    );
  const anchorMix = loadNovember5Mix(fixture, fixture.anchorBusinessDate);
  for (const id of summarizeNovember5Mix(anchorMix).groups.carried_over) {
    const ended = anchorMix.leases.find((entry) => entry.lease.leaseID === id).lease
      .endDate;
    if (ended >= fixture.anchorBusinessDate)
      problems.push(`Lease ${id} has not ended on the anchor business date.`);
  }
  // Closed leases sit where each open group would hold them if the status were ignored.
  const closedMonths = new Set(
    summary.groups.closed.map((id) => row(id).lease.endDate.slice(0, 7)),
  );
  if (
    !closedMonths.has(monthBefore) ||
    !closedMonths.has(mix.workingMonth) ||
    ![...closedMonths].some((month) => month > mix.workingMonth)
  )
    problems.push(
      "The closed leases do not end in the month before the working month, in the working month and later.",
    );
  // Each month-to-month lease's annual review falls in the working month.
  for (const id of summary.groups.month_to_month) {
    const start = row(id).lease.monthToMonthStartDate;
    if (!start || shiftMixDate(start, 12).slice(0, 7) !== mix.workingMonth)
      problems.push(
        `Lease ${id}'s month-to-month review does not fall in the working month.`,
      );
  }
  // One lease ending later carries voucher wording in a field the classification reads.
  const wording = summary.assistanceWordingLeaseIds;
  if (wording.length !== 1)
    problems.push(
      `The fixture has ${wording.length} leases with voucher wording where 1 belongs, among the leases ending later.`,
    );
  else if (!summary.groups.later.includes(wording[0]))
    problems.push(
      "The lease with voucher wording is not one of the leases ending later.",
    );

  // The five roles are the five working-month leases.
  const roles = fixture.roles ?? {};
  for (const role of NOVEMBER_5_MIX_ROLES)
    if (!roles[role]) problems.push(`The fixture names no ${role} lease.`);
  for (const role of Object.keys(roles))
    if (!NOVEMBER_5_MIX_ROLES.includes(role))
      problems.push(`"${role}" is not a role of the handoff.`);
  const roleIds = Object.values(roles).map((seed) => seed?.leaseId);
  for (const [role, seed] of Object.entries(roles))
    if (!summary.groups.working_month.includes(seed?.leaseId))
      problems.push(
        `The ${role} role names lease ${seed?.leaseId}, which is not one of the leases ending in the working month.`,
      );
  if (new Set(roleIds).size !== roleIds.length)
    problems.push("Two roles name the same lease.");
  const owners = (role) => row(roles[role]?.leaseId)?.portfolio?.owners ?? [];
  const tenants = (role) => row(roles[role]?.leaseId)?.lease?.tenants ?? [];
  const kinds = (role) => (roles[role]?.animals ?? []).map((animal) => animal?.kind);
  for (const role of ["prepared", "covered", "assisted", "replied"])
    if (roles[role] && !owners(role).some((owner) => owner?.email))
      problems.push(`The ${role} lease has no verified owner recipient.`);
  if (roles.missingRecipient) {
    if (owners("missingRecipient").some((owner) => owner?.email))
      problems.push("The missing-recipient lease has an owner address.");
    if (tenants("missingRecipient").length !== 5)
      problems.push("The missing-recipient lease does not have five tenants.");
  }
  if (roles.prepared && kinds("prepared").join() !== "pet")
    problems.push("The prepared lease does not have one ordinary pet.");
  if (roles.covered) {
    if (kinds("covered").join() !== "pet,pet")
      problems.push("The covered lease does not have two ordinary pets.");
    if (!roles.covered.standingAgreement?.name)
      problems.push("The covered lease names no standing agreement.");
    const portfolioId = row(roles.covered.leaseId)?.portfolio?.portfolioID;
    if (
      mix.leases.filter((entry) => entry.portfolio?.portfolioID === portfolioId)
        .length !== 1
    )
      problems.push(
        "The covered lease shares its portfolio, so its agreement covers another lease.",
      );
  }
  if (roles.assisted) {
    if (kinds("assisted").join() !== "assistance_animal")
      problems.push("The assisted lease does not have one assistance animal.");
    if (!roles.assisted.housingAssistance?.program)
      problems.push("The assisted lease names no housing assistance program.");
  }
  if (roles.replied && !roles.replied.ownerReply?.text)
    problems.push("The replied lease carries no owner reply text.");

  // Recorded cycles and Sheet rows belong to leases of the fixture.
  for (const leaseId of Object.keys(fixture.recordedCycles ?? {}))
    if (!row(Number(leaseId)))
      problems.push(
        `A recorded cycle names lease ${leaseId}, which the fixture does not hold.`,
      );
  for (const sheetRow of fixture.sheet?.rows ?? []) {
    if (!row(sheetRow.leaseId))
      problems.push(
        `A Sheet row names lease ${sheetRow.leaseId}, which the fixture does not hold.`,
      );
    if (!Array.isArray(sheetRow.cells) || sheetRow.cells.length !== SHEET_COLUMNS)
      problems.push(
        `The Sheet row for lease ${sheetRow.leaseId} does not fill the ${SHEET_COLUMNS} columns.`,
      );
    if (sheetRow.link?.url !== `${SHEET_LINK_PREFIX}${sheetRow.leaseId}`)
      problems.push(
        `The Sheet row for lease ${sheetRow.leaseId} does not link its own lease.`,
      );
  }
  return problems;
}

/** The lease detail RentVine's `GET /leases/{id}` returns for one row. */
function leaseDetail(row) {
  const lease = row.lease;
  const base = Number(String(row.unit.rent).replace(/[$,\s]/g, ""));
  return {
    leaseID: lease.leaseID,
    ...(row.property?.propertyID === undefined
      ? {}
      : { propertyID: row.property.propertyID }),
    startDate: lease.startDate,
    endDate: lease.endDate,
    baseRentAmount: base,
    rentAmount: base,
    isMonthToMonth: lease.isMonthToMonth ?? "0",
    monthToMonthStartDate: lease.monthToMonthStartDate ?? null,
    hasPendingMonthToMonthConversion: false,
    ...(lease.leaseStatusID === undefined ? {} : { leaseStatusID: lease.leaseStatusID }),
    noticeDate: lease.noticeDate ?? null,
    expectedMoveOutDate: lease.expectedMoveOutDate ?? null,
    moveOutDate: null,
  };
}

/** One row as the stand-in serves it under the rehearsal's control flags. */
function servedRow(mix, row, flags) {
  const id = String(row.lease.leaseID);
  const recorded =
    flags.sourceCycleDate?.leaseId === id
      ? flags.sourceCycleDate.endDate
      : flags.recordingCycles
        ? mix.recordedCycles[id]
        : undefined;
  const unreadable = flags.statusUnreadable?.[id];
  // S284 W12-03 (test-only): the owner's synthetic address RentVine serves for this lease.
  const ownerEmail = flags.ownerEmails?.[id];
  const owners = row.portfolio?.owners;
  const changedOwner =
    typeof ownerEmail === "string" && Array.isArray(owners) && owners.length > 0;
  if (recorded === undefined && !unreadable && !changedOwner) return row;
  const lease = {
    ...row.lease,
    ...(recorded === undefined ? {} : { endDate: recorded }),
  };
  // L09: a status that cannot be read is either absent or an id the status table does not hold.
  if (unreadable === "unresolved") lease.leaseStatusID = 999;
  else if (unreadable) delete lease.leaseStatusID;
  return {
    ...row,
    lease,
    ...(changedOwner
      ? {
          portfolio: {
            ...row.portfolio,
            owners: owners.map((owner, index) =>
              index === 0 ? { ...owner, email: ownerEmail } : owner,
            ),
          },
        }
      : {}),
  };
}

/**
 * The stand-in's answer to one RentVine read, as `{ body }`; an undefined body is a 404. Flags:
 * `recordingCycles` serves each renewed lease's recorded end date in place of its current one
 * (so the app's own save records that cycle), `statusUnreadable` names leases whose status is
 * served as "missing" or "unresolved", and `ownerEmails` (S284 W12-03, test-only) serves another
 * synthetic address for one lease's first owner, as an owner whose contact changed in RentVine.
 */
export function rentvineStandInResponse(mix, url, flags = {}) {
  const path = url.pathname.replace(/^\/api\/manager\//, "").replace(/\/$/, "");
  const leases =
    flags.unavailableLeaseId == null
      ? mix.leases
      : mix.leases.filter(
          (row) => String(row.lease.leaseID) !== String(flags.unavailableLeaseId),
        );
  if (path === "leases/export") {
    const page = Number(url.searchParams.get("page") ?? 1);
    return {
      body: page === 1 ? leases.map((row) => servedRow(mix, row, flags)) : [],
    };
  }
  // The Connections health check reads one record from the same synthetic inventory.
  if (path === "leases" && url.searchParams.get("limit") === "1") {
    return {
      body: leases.slice(0, 1).map((row) => ({
        lease: leaseDetail(servedRow(mix, row, flags)),
      })),
    };
  }
  if (path === "leases/statuses") return { body: mix.statuses };
  // S271: a lease's recurring charges are none unless the `recurringCharges` flag gives that lease
  // synthetic `{recurringCharge, account}` envelopes, served for the list and for each detail read.
  const charges = path.match(/^leases\/(\d+)\/recurring-charges(?:\/(\d+))?$/);
  if (charges) {
    const served = flags.recurringCharges?.[charges[1]] ?? [];
    if (!charges[2]) return { body: served };
    return {
      body: served.find(
        (entry) => entry?.recurringCharge?.leaseRecurringChargeID === charges[2],
      ),
    };
  }
  const one = path.match(/^leases\/(\d+)$/);
  const row = one ? leases.find((entry) => String(entry.lease.leaseID) === one[1]) : null;
  if (!row) return { body: undefined };
  const detail = leaseDetail(servedRow(mix, row, flags));
  return {
    body:
      url.searchParams.get("includes") === "tenants"
        ? { lease: { ...detail, tenants: [] } }
        : { lease: detail },
  };
}

/**
 * The operating Sheet rows of the mix, in the shape the provider boundary's Sheet stand-in serves.
 * S284 (test-only): the `sheetCells` flag serves named cells of an existing row in place of the
 * fixture's, by lease id and zero-based column (`{"9102": {"4": "$1,650"}}`), so a rehearsal can
 * show a Sheet value that differs from RentVine. Rows are never added or removed. Reads only.
 */
export function mixSheetFixture(mix, flags = {}) {
  const overrides = flags?.sheetCells ?? {};
  return {
    rows: (mix.sheet?.rows ?? []).map((row) => {
      const cells = overrides[String(row.leaseId)];
      if (!cells || typeof cells !== "object") return row;
      return {
        ...row,
        cells: row.cells.map((cell, column) =>
          typeof cells[String(column)] === "string" ? cells[String(column)] : cell,
        ),
      };
    }),
    rentvinePropertyIds: Object.fromEntries(
      mix.leases
        .filter((row) => row.property?.propertyID !== undefined)
        .map((row) => [String(row.lease.leaseID), row.property.propertyID]),
    ),
  };
}
