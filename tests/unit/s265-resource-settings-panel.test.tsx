// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewalResourceLinksSummary } from "@/components/lease-renewal/RenewalResourceLinksSummary";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
import { TENANT_RESOURCE_PURPOSES } from "@/lib/lease-renewal/tenant-resource-evidence";

// S265 AC-S265-1 (R-S265-1, BEH-S265-1) on the existing Connections entries: an Admin records the
// tenant audience check through the existing save and readback; other roles see each state and the
// Admin handoff and never an edit. Blank and legacy tenant entries read Source pending, legal-form
// locations keep their own states, and a replaced link never keeps an earlier check. Synthetic.

const URL_A = "https://fixture-rental.net/insurance-flyer.pdf";
const LEGAL_URL = "https://fixture-rental.net/standard-lease.pdf";
const recorded = {
  recordedAt: "2026-11-10T15:00:00.000Z",
  recordedByUid: "fixture-admin",
};

function legacySettings() {
  return {
    version: 5,
    entries: {
      insurance_flyer: { id: "insurance_flyer", url: URL_A, verified: true, ...recorded },
      standard_lease: {
        id: "standard_lease",
        url: LEGAL_URL,
        verified: true,
        ...recorded,
      },
    },
  };
}
function storedCheck(overrides: Record<string, unknown> = {}) {
  return {
    purpose: TENANT_RESOURCE_PURPOSES.insurance_flyer,
    destination: URL_A,
    documentVersion: "Insurance flyer 2026-11",
    audience: { kind: "tenant_wide" },
    method: "signed_out_open",
    result: "current_document",
    checkedBy: "Fixture Resource Owner",
    checkedOn: "2026-11-10",
    validUntil: "2026-12-31",
    proof: { id: "c".repeat(32), version: 6 },
    ...overrides,
  };
}
function verifiedSettings() {
  const settings = legacySettings();
  return {
    version: 6,
    entries: {
      ...settings.entries,
      insurance_flyer: {
        ...settings.entries.insurance_flyer,
        tenantAccess: storedCheck(),
      },
    },
  };
}
const entryForm = (id: string) =>
  document.getElementById(`renewal-resource-entry-${id}`) as HTMLElement;
/** The save request the panel sends, as the stubbed fetch records it. */
type SaveFetch = (
  url: string,
  init: { body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T17:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S265 AC-S265-1: the Connections entries carry the tenant audience check", () => {
  it("reads a legacy tenant entry as Source pending while the legal location keeps its own state", () => {
    render(<RenewalResourceLocations role="Admin" initialSettings={legacySettings()} />);
    const insurance = entryForm("insurance_flyer");
    expect(insurance).toHaveTextContent(
      "Source pending. No tenant audience check is recorded for this link.",
    );
    expect(entryForm("rbp_flyer")).toHaveTextContent(
      "Source pending. No link is saved yet.",
    );
    expect(entryForm("standard_lease")).toHaveTextContent("Destination checked by staff");
    for (const id of ["insurance_flyer", "rbp_flyer", "renewal_information_form"])
      expect(
        within(entryForm(id)).getByRole("group", { name: /Tenant audience check/ }),
        id,
      ).toBeInTheDocument();
    expect(
      within(entryForm("standard_lease")).queryByRole("group", {
        name: /Tenant audience check/,
      }),
    ).toBeNull();
  });

  it("an Admin records a tenant-wide check through the existing save and reads it back as verified", async () => {
    const fetch = vi.fn<SaveFetch>(async () => ({
      ok: true,
      json: async () => ({ settings: verifiedSettings(), duplicate: false }),
    }));
    vi.stubGlobal("fetch", fetch);
    render(<RenewalResourceLocations role="Admin" initialSettings={legacySettings()} />);
    const form = within(entryForm("insurance_flyer"));
    fireEvent.change(form.getByLabelText("Document version"), {
      target: { value: "Insurance flyer 2026-11" },
    });
    fireEvent.change(form.getByLabelText("Audience"), {
      target: { value: "tenant_wide" },
    });
    fireEvent.change(form.getByLabelText("How it was checked"), {
      target: { value: "signed_out_open" },
    });
    fireEvent.change(form.getByLabelText("What opened"), {
      target: { value: "current_document" },
    });
    fireEvent.change(form.getByLabelText("Checked by"), {
      target: { value: "Fixture Resource Owner" },
    });
    fireEvent.change(form.getByLabelText("Checked on"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(form.getByLabelText("Check valid until"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(form.getByRole("button", { name: "Save insurance flyer" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Link saved and read back."),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      expectedVersion: 5,
      resource: {
        id: "insurance_flyer",
        url: URL_A,
        verified: true,
        tenantAccess: {
          documentVersion: "Insurance flyer 2026-11",
          audience: { kind: "tenant_wide" },
          method: "signed_out_open",
          result: "current_document",
          checkedBy: "Fixture Resource Owner",
          checkedOn: "2026-11-10",
          validUntil: "2026-12-31",
        },
      },
    });
    expect(entryForm("insurance_flyer")).toHaveTextContent(
      "Verified for tenants. Audience: Any tenant with the link, no sign-in. Checked by Fixture Resource Owner on 11/10/2026, valid until 12/31/2026.",
    );
  });

  it("a restricted check names its covered recipients; a partial check is refused before any save", async () => {
    const fetch = vi.fn<SaveFetch>(async () => ({
      ok: true,
      json: async () => ({ settings: verifiedSettings(), duplicate: false }),
    }));
    vi.stubGlobal("fetch", fetch);
    render(<RenewalResourceLocations role="Admin" initialSettings={legacySettings()} />);
    const form = within(entryForm("insurance_flyer"));
    fireEvent.change(form.getByLabelText("Document version"), {
      target: { value: "Insurance flyer 2026-11" },
    });
    fireEvent.click(form.getByRole("button", { name: "Save insurance flyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Complete every tenant audience check field, or clear them to leave this link Source pending.",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(form.queryByLabelText("Covered recipients")).toBeNull();
    fireEvent.change(form.getByLabelText("Audience"), {
      target: { value: "restricted" },
    });
    fireEvent.change(form.getByLabelText("Covered recipients"), {
      target: { value: "tenant-one@fixture-rental.net\ntenant-two@fixture-rental.net" },
    });
    fireEvent.change(form.getByLabelText("How it was checked"), {
      target: { value: "sharing_list" },
    });
    fireEvent.change(form.getByLabelText("What opened"), {
      target: { value: "current_document" },
    });
    fireEvent.change(form.getByLabelText("Checked by"), {
      target: { value: "Fixture Owner" },
    });
    fireEvent.change(form.getByLabelText("Checked on"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.change(form.getByLabelText("Check valid until"), {
      target: { value: "2026-11-30" },
    });
    fireEvent.click(form.getByRole("button", { name: "Save insurance flyer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(fetch.mock.calls[0][1].body).resource.tenantAccess.audience,
    ).toEqual({
      kind: "restricted",
      recipients: ["tenant-one@fixture-rental.net", "tenant-two@fixture-rental.net"],
    });
  });

  it("a stale save is refused and the saved state stays as read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "Another operator changed the links. Reload before saving.",
        }),
      })),
    );
    render(<RenewalResourceLocations role="Admin" initialSettings={legacySettings()} />);
    const form = within(entryForm("insurance_flyer"));
    fireEvent.click(form.getByRole("button", { name: "Save insurance flyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another operator changed the links. Reload before saving.",
    );
    expect(entryForm("insurance_flyer")).toHaveTextContent(
      "Source pending. No tenant audience check is recorded for this link.",
    );
  });

  it("replacing the link clears the earlier check fields so it never carries over", () => {
    render(
      <RenewalResourceLocations role="Admin" initialSettings={verifiedSettings()} />,
    );
    const form = within(entryForm("insurance_flyer"));
    expect(form.getByLabelText("Document version")).toHaveValue(
      "Insurance flyer 2026-11",
    );
    fireEvent.change(form.getByLabelText("Insurance flyer"), {
      target: { value: "https://fixture-rental.net/replaced.pdf" },
    });
    expect(form.getByLabelText("Document version")).toHaveValue("");
    expect(form.getByLabelText("Checked by")).toHaveValue("");
    expect(
      form.getByRole("checkbox", { name: /I checked this destination/ }),
    ).not.toBeChecked();
    // Clear audience check empties the fields without saving anything.
    fireEvent.change(form.getByLabelText("Insurance flyer"), {
      target: { value: URL_A },
    });
    fireEvent.change(form.getByLabelText("Checked by"), { target: { value: "Someone" } });
    fireEvent.click(form.getByRole("button", { name: "Clear audience check" }));
    expect(form.getByLabelText("Checked by")).toHaveValue("");
  });

  it("other roles see each state and the Admin handoff, never an edit", () => {
    render(
      <RenewalResourceLocations role="Editor" initialSettings={verifiedSettings()} />,
    );
    expect(screen.queryByRole("button", { name: /^Save / })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText("Document version")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear audience check" })).toBeNull();
    expect(screen.getByLabelText("Insurance flyer")).toBeDisabled();
    expect(entryForm("insurance_flyer")).toHaveTextContent("Verified for tenants.");
    expect(entryForm("rbp_flyer")).toHaveTextContent(
      "Source pending. No link is saved yet.",
    );
    expect(screen.getByText(/An Admin maintains these shared links/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Request access/ })).toBeInTheDocument();
  });
});

describe("S265 AC-S265-1: the lease summary reads tenant use the same way", () => {
  it("shows a verified tenant link with its check, a legacy one as Source pending and a legal location unchanged", () => {
    const { unmount } = render(
      <RenewalResourceLinksSummary
        canManage
        settings={verifiedSettings()}
        todayIso="2026-11-12"
      />,
    );
    const insurance = document.getElementById("renewal-resource-insurance_flyer")!;
    expect(insurance).toHaveTextContent("Verified for tenants.");
    expect(
      within(insurance).getByRole("link", { name: "Open checked destination" }),
    ).toHaveAttribute("href", URL_A);
    expect(document.getElementById("renewal-resource-standard_lease")).toHaveTextContent(
      /checked by staff/i,
    );
    unmount();
    render(
      <RenewalResourceLinksSummary
        canManage={false}
        settings={legacySettings()}
        todayIso="2026-11-12"
      />,
    );
    const legacy = document.getElementById("renewal-resource-insurance_flyer")!;
    expect(legacy).toHaveTextContent(
      "Source pending. No tenant audience check is recorded for this link.",
    );
    expect(
      within(legacy).queryByRole("link", { name: "Open checked destination" }),
    ).toBeNull();
    expect(within(legacy).getByRole("link", { name: "View setting" })).toHaveAttribute(
      "href",
      "/connections#renewal-resource-entry-insurance_flyer",
    );
  });
});
