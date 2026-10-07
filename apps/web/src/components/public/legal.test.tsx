// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AiPolicyPage, { metadata as aiMeta } from "../../app/(public)/ai-policy/page";
import PrivacyPage, { metadata as privacyMeta } from "../../app/(public)/privacy/page";
import TermsPage, { metadata as termsMeta } from "../../app/(public)/terms/page";

afterEach(cleanup);

function text(): string {
  return document.body.textContent ?? "";
}

describe("legal drafts", () => {
  it("privacy covers data use, sensitive facts, minors, no selling, and retention windows", () => {
    expect(privacyMeta.title).toBe("Privacy policy · ScholarCrew");
    render(<PrivacyPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy policy");
    const body = text();
    for (const phrase of [
      "We never sell",
      "13 or older",
      "AES-256-GCM",
      "never sent to an AI model",
      "Temporary chats",
      "24 hours",
      "within 7 days",
      "Sign-in links",
      "30 days",
      "90 days",
      "Twilio (text messages)",
      "If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it.",
      "If you're under 13, we delete the account and everything in it within 7 days.",
    ]) {
      expect(body).toContain(phrase);
    }
    expect(screen.getAllByRole("link", { name: /How long we keep it/ })[0]?.getAttribute("href")).toBe("#retention");
  });

  it("terms cover integrity, guidance, plans, and acceptable use", () => {
    expect(termsMeta.title).toBe("Terms of use · ScholarCrew");
    render(<TermsPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    const body = text();
    for (const phrase of [
      "You write every essay",
      "Nothing is submitted for you",
      "test prices",
      "no guaranteed money",
      "13",
    ]) {
      expect(body).toContain(phrase);
    }
  });

  it("the AI policy says coach not ghostwriter, names the model and fallbacks, and describes human review", () => {
    expect(aiMeta.title).toBe("AI use policy · ScholarCrew");
    render(<AiPolicyPage />);
    expect(screen.getByRole("note").textContent).toContain("Draft — needs legal review");
    const body = text();
    for (const phrase of [
      "coach, not a ghostwriter",
      "claude-opus-5-5",
      "fallback",
      "Money math is code",
      "A person reviews",
      "Only an admin can publish",
      "never sent to an AI model",
    ]) {
      expect(body).toContain(phrase);
    }
  });
});
