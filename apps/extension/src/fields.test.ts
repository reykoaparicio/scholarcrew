import { beforeEach, describe, expect, it } from "vitest";
import { type DetectedField, detectFields, formatActivity, matchField, profileValue } from "./fields";
import { VISIBLE_FIELDS, fieldKey, mountForm } from "./test/form";
import { PROFILE } from "./test/profile";

function only(html: string): DetectedField {
  document.body.innerHTML = html;
  const fields = detectFields(document);
  expect(fields).toHaveLength(1);
  const [field] = fields;
  if (!field) throw new Error("no field");
  return field;
}

describe("detectFields on the fixture form", () => {
  beforeEach(() => {
    mountForm();
  });

  it("returns visible, enabled text-like fields in DOM order", () => {
    expect(detectFields(document).map((f) => fieldKey(f.element))).toEqual(VISIBLE_FIELDS);
  });

  it("ignores hidden, password, file, checkbox, submit, display:none, and disabled fields", () => {
    const keys = detectFields(document).map((f) => fieldKey(f.element));
    for (const ignored of ["email", "pw", "resume", "agree", "ghost-email", "old-city"]) {
      expect(keys).not.toContain(ignored);
    }
  });

  it("maps each field to a profile key and leaves unknown fields unmatched", () => {
    const matched = Object.fromEntries(detectFields(document).map((f) => [fieldKey(f.element), matchField(f)]));
    expect(matched).toEqual({
      "full-name": "displayName",
      contact: "email",
      hs: "highSchool",
      q4: "classYear",
      gpa_unweighted: "gpa",
      city: "city",
      state: "state",
      intendedMajor: "intendedMajors",
      acts: "activities",
      "parent-email": null,
      essay: null,
    });
  });

  it("uses readable labels for display", () => {
    const labels = detectFields(document).map((f) => f.label);
    expect(labels.slice(0, 5)).toEqual([
      "Full name",
      "Email address",
      "High school name",
      "High school graduation year",
      "Unweighted GPA (4.0 scale)",
    ]);
    expect(labels[7]).toBe("intended major");
  });
});

describe("descriptor sources", () => {
  it("reads label[for]", () => {
    expect(only(`<label for="a">Student name</label><input id="a">`).texts[0]).toBe("student name");
  });

  it("reads a wrapping label without the option text of the control inside it", () => {
    const field = only("<label>Home state <select><option>Texas</option></select></label>");
    expect(field.texts[0]).toBe("home state");
    expect(field.label).toBe("Home state");
  });

  it("reads aria-label and every aria-labelledby id", () => {
    expect(only(`<input aria-label="Cumulative GPA">`).texts).toEqual(["cumulative gpa"]);
    const field = only(`<span id="x">Field</span><span id="y">of study</span><input aria-labelledby="x y">`);
    expect(field.texts).toEqual(["field of study"]);
  });

  it("splits camelCase and snake_case names and ids, then reads the placeholder", () => {
    const field = only(`<input name="grad_year" id="studentGradYear" placeholder="YYYY">`);
    expect(field.texts).toEqual(["grad year", "student grad year", "yyyy"]);
    expect(field.label).toBe("YYYY");
  });

  it("skips readonly fields and fields under a hidden ancestor", () => {
    document.body.innerHTML = `<input aria-label="City" readonly><div hidden><input aria-label="State"></div>`;
    expect(detectFields(document)).toEqual([]);
  });
});

describe("matchField keywords", () => {
  it.each([
    ["E-mail", "email"],
    ["Your name", "displayName"],
    ["Student name", "displayName"],
    ["Class of", "classYear"],
    ["Grad year", "classYear"],
    ["School name", "highSchool"],
    ["Cumulative GPA", "gpa"],
    ["City of residence", "city"],
    ["Intended majors", "intendedMajors"],
    ["Field of study", "intendedMajors"],
    ["Extracurriculars", "activities"],
    ["First name", null],
    ["Name", null],
    ["Parent email", null],
    ["Counselor name", null],
    ["Are you a United States citizen?", null],
    ["Personal statement", null],
  ])("%j → %j", (text, key) => {
    expect(matchField(only(`<input aria-label="${text}">`))).toBe(key);
  });
});

describe("profileValue", () => {
  it("formats numbers and lists", () => {
    expect(profileValue(PROFILE, "gpa", false)).toBe("3.80");
    expect(profileValue(PROFILE, "classYear", false)).toBe("2027");
    expect(profileValue(PROFILE, "intendedMajors", false)).toBe("Biology, Public Health");
    expect(profileValue(PROFILE, "email", false)).toBe("maya@example.com");
  });

  it("puts one activity per line, in position order", () => {
    expect(profileValue(PROFILE, "activities", true)).toBe(
      "Robotics club — Captain: Lead a 12-person build team\nFood bank — Shift lead: Run the Saturday sorting crew",
    );
    expect(profileValue(PROFILE, "activities", false)).toBe(
      "Robotics club — Captain: Lead a 12-person build team; Food bank — Shift lead: Run the Saturday sorting crew",
    );
  });

  it("returns null when the profile has nothing to offer", () => {
    const empty = { ...PROFILE, highSchool: " ", gpa: null, classYear: null, intendedMajors: [], activities: [] };
    for (const key of ["highSchool", "gpa", "classYear", "intendedMajors", "activities"] as const) {
      expect(profileValue(empty, key, true)).toBeNull();
    }
  });

  it("drops an empty role or description from an activity line", () => {
    const [first] = PROFILE.activities;
    if (!first) throw new Error("fixture");
    expect(formatActivity({ ...first, role: "", description: "" })).toBe("Food bank");
    expect(formatActivity({ ...first, role: "" })).toBe("Food bank: Run the Saturday sorting crew");
  });
});

describe("conservative form context", () => {
  it("rejects another person's marker even after an ordinary email label", () => {
    expect(matchField(only(`<label for="email">Email</label><input id="email" name="parent_email">`))).toBeNull();
  });

  it("respects nested fieldset legends for another person's fields", () => {
    expect(
      matchField(
        only(
          `<fieldset><legend>Parent information</legend><fieldset><legend>Contact</legend><input aria-label="Email"></fieldset></fieldset>`,
        ),
      ),
    ).toBeNull();
  });

  it("skips disabled fieldset descendants but permits the first legend exception", () => {
    document.body.innerHTML = `<fieldset disabled><legend><input aria-label="Email"></legend><input aria-label="City"></fieldset><div inert><input aria-label="State"></div>`;
    expect(detectFields(document).map((field) => field.label)).toEqual(["Email"]);
  });
});

describe("unweighted GPA scale compatibility", () => {
  it.each([
    "Weighted GPA",
    "GPA on a 5.0 scale",
    "GPA (100 point scale)",
    "GPA out of 10",
    "GPA (4.3 scale)",
    "GPA percentage",
  ])("skips %s without inventing a conversion", (label) => {
    expect(matchField(only(`<input aria-label="${label}">`))).toBeNull();
  });

  it("checks weighted context from a lower-priority descriptor", () => {
    expect(matchField(only(`<label for="gpa">GPA</label><input id="gpa" name="weighted_gpa">`))).toBeNull();
  });

  it("respects an incompatible numeric maximum", () => {
    expect(matchField(only(`<input type="number" aria-label="GPA" max="5">`))).toBeNull();
  });

  it.each(["Unweighted GPA (4.0 scale)", "GPA out of 4", "Cumulative GPA"])("retains %s", (label) => {
    expect(matchField(only(`<input type="number" aria-label="${label}" max="4.0">`))).toBe("gpa");
  });
});

describe("supported text-like input types", () => {
  it.each(["date", "datetime-local", "month", "week", "time", "range", "color"])(
    "skips %s rather than sanitizing profile values into a different native value",
    (type) => {
      document.body.innerHTML = `<input type="${type}" aria-label="Graduation year">`;
      expect(detectFields(document)).toEqual([]);
    },
  );

  it.each(["text", "email", "search", "tel", "url", "number"])("retains %s controls", (type) => {
    document.body.innerHTML = `<input type="${type}" aria-label="Email">`;
    expect(detectFields(document)).toHaveLength(1);
  });
});
