import type { ScamFlag } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { detectScamSignals } from "./scams";

const listing = { amountMaxUsd: 2500 };

describe("detectScamSignals", () => {
  it("flags the Golden Future processing fee", () => {
    const text =
      'Golden Future Scholars Award. Win up to $10,000 for college! A $25 "processing fee" is required to apply.';
    expect(detectScamSignals(text, { amountMaxUsd: 10000 })).toEqual(["application_fee"]);
  });

  it("leaves the Rotary listing clean", () => {
    const text =
      "The Rotary Club of Eastside awards $2,500 to a Maple County senior who has served the community. " +
      "Submit a 500-word essay describing a time you used your skills to serve your community. " +
      "No application fee. No recommendation letters.";
    expect(detectScamSignals(text, listing)).toEqual([]);
  });

  it("flags a listing marked as requiring a fee even when the text is clean", () => {
    expect(detectScamSignals("Write 300 words about your hometown.", { amountMaxUsd: 500, requiresFee: true })).toEqual(
      ["application_fee"],
    );
  });

  it("flags dollar-amount fees", () => {
    expect(detectScamSignals("Applicants pay a $15 fee.", listing)).toEqual(["application_fee"]);
    expect(detectScamSignals("A one-time $1,000.00 fee secures your spot.", listing)).toEqual(["application_fee"]);
  });

  it.each<[string, ScamFlag]>([
    ["GUARANTEED scholarship for every applicant", "guaranteed_award"],
    ["We guarantee you'll get money", "guaranteed_award"],
    ["Enter your bank account to receive funds", "bank_or_card_request"],
    ["Provide your ROUTING NUMBER", "bank_or_card_request"],
    ["Pay with a credit card", "bank_or_card_request"],
    ["Your debit card number is required", "bank_or_card_request"],
    ["We need your Social Security number", "ssn_request"],
    ["Send your ssn today", "ssn_request"],
    ["Official SWEEPSTAKES rules apply", "sweepstakes"],
    ["Enter to win $1,000", "sweepstakes"],
    ["Winners chosen in a monthly drawing", "sweepstakes"],
    ["You have been selected for an award", "unsolicited_winner"],
    ["you've won a scholarship", "unsolicited_winner"],
    ["You’ve won!", "unsolicited_winner"],
    ["Congratulations, you qualify", "unsolicited_winner"],
    ["For a fee we'll find every scholarship you qualify for", "pay_for_info"],
    ["Pay for a list of 500 scholarships", "pay_for_info"],
  ])("flags %j as %s", (text, flag) => {
    expect(detectScamSignals(text, listing)).toEqual([flag]);
  });

  it("returns each flag once, in a fixed order", () => {
    const text = "Congratulations, you are guaranteed $5,000! Send your SSN and a $20 fee. Application fee due now.";
    expect(detectScamSignals(text, listing)).toEqual([
      "application_fee",
      "guaranteed_award",
      "ssn_request",
      "unsolicited_winner",
    ]);
  });

  it("ignores negated fees and fee waivers", () => {
    expect(detectScamSignals("Application fee waivers are available.", listing)).toEqual([]);
    expect(detectScamSignals("Apply without a processing fee.", listing)).toEqual([]);
    expect(detectScamSignals("There is zero application fee and no $25 fee.", listing)).toEqual([]);
    expect(detectScamSignals("No application fee, but a $30 fee applies later.", listing)).toEqual(["application_fee"]);
  });

  it("returns nothing for empty text", () => {
    expect(detectScamSignals("", listing)).toEqual([]);
  });
});
