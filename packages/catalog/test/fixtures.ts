import type { ListingDraft } from "@scholarcrew/domain";

export const SOURCE_URL = "https://rotary-eastside.example.org/scholarship";

/** A fictional scholarship page after htmlToText. */
export const PAGE_TEXT = [
  "Rotary Club of Eastside Scholarship",
  "",
  "The Rotary Club of Eastside awards one $2,500 scholarship to a graduating senior who lives in Maple County, Texas.",
  "",
  "Applications are due October 30, 2026.",
  "",
  "Write 500 words about a time you served your community. Students don't need to be Rotary members.",
].join("\n");

/** A correct extraction of PAGE_TEXT. Every quote appears on the page. */
export const VALID_DRAFT: ListingDraft = {
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: SOURCE_URL,
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  deadline: "2026-10-30",
  applicationFeeUsd: null,
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "county_in", state: "TX", counties: ["Maple"] }],
  requirements: {
    essays: [{ prompt: "Write 500 words about a time you served your community.", wordLimit: 500 }],
    recommendations: 0,
    transcript: false,
    serviceHours: null,
    other: [],
  },
  fieldQuotes: [
    {
      field: "amountMaxUsd",
      quote:
        "The Rotary Club of Eastside awards one $2,500 scholarship to a graduating senior who lives in Maple County, Texas.",
    },
    { field: "deadline", quote: "Applications are due October 30, 2026." },
  ],
};
