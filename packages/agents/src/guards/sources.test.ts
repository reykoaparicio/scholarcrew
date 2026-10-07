import type { ActionCard, CrewReply, ReceiptItem } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  type KnownSources,
  checkPrivacy,
  checkSources,
  emptyKnownSources,
  guardProblems,
  sanitizeReply,
} from "./index";

const S1 = "55555555-5555-4555-8555-555555555501";
const S2 = "55555555-5555-4555-8555-555555555502";
const VERIFIED = "2026-10-02T15:00:00.000Z";

function known(): KnownSources {
  const k = emptyKnownSources();
  k.factIds.add("fact:f1");
  k.recordIds.add("record:d1");
  k.recordIds.add("essay:e1");
  k.recordIds.add("story:st1");
  k.recordIds.add("college:228778");
  k.catalog.set(`scholarship:${S1}`, { url: "https://example.org/hc", verifiedAt: VERIFIED });
  k.calcs.add("calc:1");
  return k;
}

const item = (kind: ReceiptItem["kind"], refId: string | null, extra: Partial<ReceiptItem> = {}): ReceiptItem => ({
  kind,
  label: `${kind} ${refId ?? "none"}`,
  refId,
  sourceUrl: null,
  verifiedAt: null,
  ...extra,
});

const planCard = (refType: string | null, refId: string | null): ActionCard => ({
  kind: "add_plan_item",
  id: "plan",
  label: "Add to my week",
  item: {
    title: "Outline essay",
    kind: "scholarship",
    refType,
    refId,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    contributors: ["scout"],
    weekStart: null,
  },
});

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: "Start with the Hill Country STEM Award.",
  contributors: ["compass"],
  question: null,
  actionCards: [],
  receipt: [],
  safety: null,
  needsInput: false,
  ...o,
});

const catalogItem = item("catalog", `scholarship:${S1}`, { sourceUrl: "https://example.org/hc", verifiedAt: VERIFIED });

describe("checkSources", () => {
  it("accepts receipts and cards that point at known sources", () => {
    const r = reply({
      receipt: [
        item("fact", "fact:f1"),
        item("record", "record:d1"),
        catalogItem,
        item("calculation", "calc:1"),
        item("record", `scholarship:${S1}`),
      ],
      actionCards: [
        { kind: "save_scholarship", id: "save", label: "Save it", scholarshipId: S1 },
        { kind: "add_college", id: "ut", label: "Add UT", collegeId: "228778", fit: "target", plan: "EA" },
        planCard("scholarship", S1),
        planCard(null, null),
      ],
    });
    expect(checkSources(r, known())).toEqual({ ok: true, problems: [] });
  });

  it("flags unknown refs, missing refIds, and catalog items without the listing's url and date", () => {
    const r = reply({
      receipt: [
        item("fact", "fact:other"),
        item("record", null),
        item("catalog", `scholarship:${S1}`, { sourceUrl: "https://elsewhere.example", verifiedAt: VERIFIED }),
        item("calculation", "calc:9"),
      ],
    });
    const { ok, problems } = checkSources(r, known());
    expect(ok).toBe(false);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain("unknown fact fact:other");
    expect(problems[1]).toContain("has no refId");
    expect(problems[2]).toContain(`must use sourceUrl https://example.org/hc and verifiedAt ${VERIFIED}`);
    expect(problems[3]).toContain("unknown calculation calc:9");
  });

  it("requires null sourceUrl and verifiedAt on fact, record, and calculation items (R3E-4)", () => {
    const linked = item("fact", "fact:f1", { sourceUrl: "https://elsewhere.example" });
    expect(checkSources(reply({ receipt: [linked] }), known()).problems).toEqual([
      'Receipt "fact fact:f1" must use sourceUrl null and verifiedAt null.',
    ]);
    expect(checkSources(reply({ receipt: [item("fact", "fact:f1")] }), known()).ok).toBe(true);
    const dated = item("calculation", "calc:1", { verifiedAt: VERIFIED });
    const linkedRecord = item("record", "record:d1", { sourceUrl: "https://elsewhere.example" });
    expect(checkSources(reply({ receipt: [dated, linkedRecord] }), known()).problems).toHaveLength(2);
  });

  it("lets a record that cites a catalog listing use the listing's url and date, or none (R3E-4)", () => {
    const wrongDate = item("record", `scholarship:${S1}`, {
      sourceUrl: "https://example.org/hc",
      verifiedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(checkSources(reply({ receipt: [wrongDate] }), known()).problems).toEqual([
      `Receipt "record scholarship:${S1}" must use sourceUrl https://example.org/hc and verifiedAt ${VERIFIED}.`,
    ]);
    const exact = item("record", `scholarship:${S1}`, { sourceUrl: "https://example.org/hc", verifiedAt: VERIFIED });
    expect(checkSources(reply({ receipt: [exact, item("record", `scholarship:${S1}`)] }), known()).ok).toBe(true);
  });

  it("flags cards that point at unknown scholarships, colleges, or records", () => {
    const r = reply({
      actionCards: [
        { kind: "save_scholarship", id: "save", label: "Save it", scholarshipId: S2 },
        { kind: "add_college", id: "rice", label: "Add Rice", collegeId: "227757", fit: "reach", plan: "RD" },
        planCard("scholarship", S2),
      ],
    });
    const { problems } = checkSources(r, known());
    expect(problems).toEqual([
      `Card "save" saves unknown scholarship:${S2}.`,
      'Card "rice" adds unknown college:227757.',
      `Card "plan": plan item points at unknown scholarship:${S2}.`,
    ]);
  });
});

describe("checkPrivacy", () => {
  const sensitive = reply({
    receipt: [item("fact", "fact:f1"), item("record", "essay:e1"), item("record", "story:st1"), catalogItem],
    actionCards: [
      {
        kind: "confirm_fact",
        id: "fact",
        label: "Save this",
        fact: { key: "home_county", value: "Travis", visibility: "crew", source: "user_stated", sourceRef: null },
      },
    ],
  });

  it("lets the student's own crew see everything", () => {
    expect(checkPrivacy(sensitive, "crew")).toEqual({ ok: true, problems: [] });
  });

  it("keeps facts, essays, and stories out of family replies by default", () => {
    const { ok, problems } = checkPrivacy(sensitive, "family");
    expect(ok).toBe(false);
    expect(problems).toHaveLength(4);
    expect(problems.join(" ")).toContain("essay:e1 isn't shared with family");
    expect(problems.join(" ")).toContain("story:st1 isn't shared with family");
    expect(problems.join(" ")).toContain('Card "fact"');
  });

  it("allows shared categories but never memory facts", () => {
    const { problems } = checkPrivacy(sensitive, "family", ["essays", "stories", "scholarships"]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("memory fact");
    expect(problems[1]).toContain('Card "fact"');
  });
});

describe("sanitizeReply", () => {
  it("drops only the receipt items and cards that fail, and guardProblems combines both guards", () => {
    const r = reply({
      receipt: [item("fact", "fact:f1"), item("fact", "fact:other"), item("record", "essay:e1"), catalogItem],
      actionCards: [planCard("scholarship", S1), planCard("scholarship", S2)],
    });
    expect(guardProblems(r, known(), "family", ["scholarships"])).toHaveLength(5);
    const { reply: clean, dropped } = sanitizeReply(r, known(), "family", ["scholarships"]);
    expect(dropped).toBe(4);
    expect(clean.receipt).toEqual([catalogItem]);
    expect(clean.actionCards).toHaveLength(1);
    expect(clean.text).toBe(r.text);
  });
});
