import type { HelpGuide } from "@/lib/help/types";

export const SEARCH_GUIDES: readonly HelpGuide[] = [
  {
    id: "search",
    section: "search",
    title: "Search",
    audience: "All staff",
    purpose:
      "Find a lease, owner, resident, property or unit from the search box at the top of every page, then open it or read the records related to it.",
    prerequisites: [
      "You are signed in. Search lists only the records your access allows.",
    ],
    steps: [
      {
        id: "type-a-search",
        action: "Type part of a name, address or reference into Search records.",
        control: {
          label: "Search records",
          role: "combobox",
          availability: "required",
          source: ["components/search/GlobalEntitySearch.tsx"],
        },
        route: "/",
        where: "Top bar, on every page",
        result:
          "Up to eight suggestions list under the box, each with its type and reference. Use the arrow keys to move through them.",
        effect: "reads",
      },
      {
        id: "choose-a-record-type",
        action: "To narrow the suggestions, choose a type in Search entity type.",
        control: {
          label: "Search entity type",
          role: "combobox",
          availability: "required",
          source: ["components/search/GlobalEntitySearch.tsx"],
        },
        route: "/",
        where: "Top bar, beside Search records",
        result:
          "The suggestions narrow to Lease, Owner, Resident, Property or Unit. All records searches every kind.",
        effect: "reads",
      },
      {
        id: "view-all-results",
        action: "Choose View all matching results, or press Enter, to see every match.",
        control: {
          label: "View all matching results",
          role: "link",
          availability: "conditional",
          source: ["components/search/GlobalEntitySearch.tsx"],
        },
        route: "/",
        where: "Top bar, under the suggestions",
        result:
          "Entity search opens in a new tab with the matches. Choosing a suggestion, or pressing Enter on a highlighted one, opens that record in a new tab instead.",
        effect: "copies",
        note: "If the browser keeps the new tab closed, choose open search results in the line that appears under the box.",
      },
      {
        id: "refine-the-query",
        action: "On Entity search, change the words in Query.",
        control: {
          label: "Query",
          role: "textbox",
          availability: "required",
          source: ["components/search/EntitySearchResults.tsx"],
        },
        route: "/search",
        where: "Entity search",
        result:
          "Query keeps the words you type, and the list reads again only when you choose Search.",
        effect: "reads",
      },
      {
        id: "filter-by-type",
        action: "Choose a type in Entity type to narrow the list.",
        control: {
          label: "Entity type",
          role: "combobox",
          availability: "required",
          source: ["components/search/EntitySearchResults.tsx"],
        },
        route: "/search",
        where: "Entity search, beside Query",
        result: "The list reads again for that type right away.",
        effect: "reads",
      },
      {
        id: "run-the-search",
        scene: "search-results",
        action: "Choose Search.",
        control: {
          label: "Search",
          role: "button",
          availability: "required",
          source: ["components/search/EntitySearchResults.tsx"],
        },
        route: "/search",
        where: "Entity search, beside Entity type",
        result:
          "The list shows how many matches it found and when they were read. Each match names its type, its reference and the field that matched; a source that could not be read is named above the list.",
        effect: "reads",
        note: "Choose a match's name to open it in a new tab. A lease opens its renewal workspace. An owner or resident opens the renewal desk filtered to that person when the app can match them, and their related records otherwise. A property or unit opens its related records.",
      },
      {
        id: "load-more-results",
        action: "If more matches remain, choose Load more results.",
        control: {
          label: "Load more results",
          role: "button",
          availability: "conditional",
          source: ["components/search/EntitySearchResults.tsx"],
        },
        route: "/search",
        where: "Entity search, under the list",
        result: "The next matches add to the list.",
        effect: "reads",
        note: "If the list cannot be read, Restart current search reads it again with the same words and type.",
      },
      {
        id: "return-to-search",
        action: "If a record you open shows Record unavailable, choose Return to search.",
        control: {
          label: "Return to search",
          role: "link",
          availability: "conditional",
          source: ["app/search/open/page.tsx"],
        },
        route: "/search/open",
        where: "Record unavailable page",
        result:
          "Entity search opens so you can search again for current records. Record unavailable means the exact record is not in a source you can read right now.",
        effect: "reads",
      },
      {
        id: "read-related-records",
        action: "Read Current related records for a property, unit, owner or resident.",
        control: {
          label: "Current related records",
          role: "heading",
          availability: "conditional",
          source: ["app/search/entity/page.tsx"],
        },
        route: "/search/entity",
        where: "Related records page",
        result:
          "The page names the record, its reference and when its details were read, then lists the records linked to it by recorded source IDs. Each opens in a new tab, and an association that was never recorded stays unknown.",
        effect: "reads",
      },
      {
        id: "back-to-entity-search",
        action: "Choose ← Entity search to go back to the search page.",
        control: {
          label: "← Entity search",
          role: "link",
          availability: "required",
          source: ["app/search/entity/page.tsx"],
        },
        route: "/search/entity",
        where: "Related records page, top",
        result: "Entity search opens.",
        effect: "reads",
      },
    ],
    result: "The record you need is open in its own tab, and nothing was changed.",
    doesNotDo: [
      "Search only reads; it never changes, merges or removes a record.",
      "Search lists only records your access allows, from the sources that answered; a source that could not be read is named, not hidden.",
      "Records are linked only by recorded source IDs, never by a similar name or address.",
      "Retired maintenance and vendor records are not part of search.",
    ],
    relatedGuides: ["find-your-way", "work-a-renewal"],
    relatedScreens: ["search", "top-bar"],
    lastUpdated: "2026-11-04",
  },
];
