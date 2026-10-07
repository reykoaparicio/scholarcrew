import { describe, expect, it } from "vitest";
import { FamilyBudgetInput, InviteInput, ShareSettingsInput } from "./family";

describe("family inputs", () => {
  it("accepts a partial category map", () => {
    const v = ShareSettingsInput.parse({ categories: { essays: true } });
    expect(v.categories.essays).toBe(true);
    expect(v.categories.chats).toBeUndefined();
  });

  it("rejects unknown categories", () => {
    expect(ShareSettingsInput.safeParse({ categories: { diary: true } }).success).toBe(false);
  });

  it("validates invite email and budget bounds", () => {
    expect(InviteInput.safeParse({ email: "dana@example.com" }).success).toBe(true);
    expect(InviteInput.safeParse({ email: "nope" }).success).toBe(false);
    expect(FamilyBudgetInput.safeParse({ annualUsd: 4600 }).success).toBe(true);
    expect(FamilyBudgetInput.safeParse({ annualUsd: -5 }).success).toBe(false);
  });
});
