import { expect } from "@playwright/test";
import type { CrewJob, Essay, HelperLink, HelperLinkCreated, Message, OfferWithLines } from "@scholarcrew/domain";
import { adminSession, awardYearOn, isoDaysFromNow, publishScholarship, uniqueListingName } from "../support/admin";
import { api, apiOk, uploadDocument } from "../support/api";
import { crewMessages, ensureMyCrew, planItemCount, replyWithCard, waitForJob } from "../support/crew";
import { sensitiveAudit } from "../support/db";
import { DRAFT_ONE, createEssay } from "../support/essays";
import { test } from "../support/fixtures";
import { PDF_LETTER } from "../support/offers";
import { STATE_U, signUpStudent } from "../support/onboarding";
import { type Probe, probeAll } from "../support/probe";

test("SE-01: user B gets 404 for user A's essay, document, offer, jobs, conversation, action card, and helper link", async ({
  browser,
  adminState,
}) => {
  const admin = await adminSession(browser, adminState);
  const listing = await publishScholarship(admin.page, {
    name: uniqueListingName("Isolation Probe Award"),
    amountUsd: 1_000,
    deadline: isoDaysFromNow(21),
  });
  await admin.context.close();

  const a = await signUpStudent(browser, "owner-a", { collegeIds: [STATE_U.id] });
  const essay = await createEssay(a.page, { title: "A's essay", prompt: "Who are you?", wordLimit: 650 });
  await apiOk(a.page, "POST", `/essays/${essay.id}/versions`, { body: DRAFT_ONE, baseVersion: 0 });
  const doc = await uploadDocument(a.page, {
    kind: "award_letter",
    filename: "a-letter.pdf",
    mime: "application/pdf",
    content: PDF_LETTER,
  });
  const offer = await apiOk<OfferWithLines>(a.page, "POST", "/offers", {
    collegeId: STATE_U.id,
    documentId: doc.id,
    awardYear: awardYearOn(new Date()),
  });
  const parseJobId = offer.parseJobId;
  if (!parseJobId) throw new Error("POST /offers returned no parseJobId");
  // An upcoming saved deadline, so the demo Compass reply carries the next-deadline card.
  await apiOk(a.page, "POST", "/scholarship-applications", { scholarshipId: listing.id });
  const conversationId = await ensureMyCrew(a.page);
  const sent = await apiOk<{ message: Message; job: CrewJob }>(
    a.page,
    "POST",
    `/conversations/${conversationId}/messages`,
    {
      body: "What's due next?",
    },
  );
  expect((await waitForJob(a.page, sent.job.id)).status).not.toBe("failed");
  const reply = replyWithCard(await crewMessages(a.page, conversationId), "next-deadline");
  expect(reply.appliedCardIds).toEqual([]);
  const helper = await apiOk<HelperLinkCreated>(a.page, "POST", "/helper-links", {
    label: "Coach Lee",
    helperRole: "mentor",
    scope: ["deadlines"],
    expiresInDays: 7,
  });

  // Sensitive aliases cannot enter generic memory; audit payloads carry no kind or value.
  expect(
    (
      await api(a.page, "POST", "/facts", {
        key: "first_generation",
        value: true,
        visibility: "crew",
        source: "user_stated",
        sourceRef: null,
      })
    ).status,
  ).toBe(400);
  await apiOk(a.page, "PUT", "/sensitive-facts", { kind: "heritage", enabled: true, value: ["AUDIT_PRIVATE_CANARY"] });
  const audit = await sensitiveAudit(a.me.user.id);
  expect(audit).toContain("sensitive_facts_changed");
  expect(audit).not.toContain("AUDIT_PRIVATE_CANARY");
  expect(audit).not.toContain("heritage");
  const b = await signUpStudent(browser, "intruder-b");
  const probes: Probe[] = [
    ["GET", `/essays/${essay.id}`],
    ["GET", `/essays/${essay.id}/versions`],
    ["POST", `/essays/${essay.id}/versions`, { body: "Not mine.", baseVersion: 1 }],
    ["POST", `/essays/${essay.id}/review`],
    ["GET", `/essays/${essay.id}/comments`],
    ["GET", `/documents/${doc.id}`],
    ["GET", `/documents/${doc.id}/download`],
    ["DELETE", `/documents/${doc.id}`],
    ["GET", `/offers/${offer.id}`],
    ["POST", `/offers/${offer.id}/confirm`],
    ["GET", `/offers/${offer.id}/loans`],
    ["GET", `/jobs/${sent.job.id}`],
    ["GET", `/jobs/${parseJobId}`],
    ["GET", `/conversations/${conversationId}/messages`],
    ["POST", `/conversations/${conversationId}/messages`, { body: "Hello?" }],
    ["POST", "/actions/apply", { messageId: reply.id, cardId: "next-deadline" }],
    ["DELETE", `/helper-links/${helper.link.id}`],
    ["GET", `/college-list?studentId=${a.me.user.id}`],
    ["GET", `/essays?studentId=${a.me.user.id}`],
  ];
  expect(await probeAll(b.page, probes)).toEqual([]);

  // B's own lists never include A's records.
  expect((await apiOk<Essay[]>(b.page, "GET", "/essays")).map((e) => e.id)).not.toContain(essay.id);
  expect((await apiOk<OfferWithLines[]>(b.page, "GET", "/offers")).map((o) => o.id)).not.toContain(offer.id);

  // Nothing B tried changed A's data.
  expect((await api(a.page, "GET", `/documents/${doc.id}`)).status).toBe(200);
  expect((await apiOk<{ currentVersion: number }>(a.page, "GET", `/essays/${essay.id}`)).currentVersion).toBe(1);
  expect((await api(a.page, "GET", `/offers/${offer.id}`)).status).toBe(200);
  const links = await apiOk<HelperLink[]>(a.page, "GET", "/helper-links");
  expect(links.find((l) => l.id === helper.link.id)?.revokedAt).toBeNull();
  const afterProbes = replyWithCard(await crewMessages(a.page, conversationId), "next-deadline");
  expect(afterProbes.id).toBe(reply.id);
  expect(afterProbes.appliedCardIds).toEqual([]);

  // The card id B probed was live. A applies it twice at once (R2C-3, claim-first receipts): it never adds two plan
  // items, and each call gets the receipt (200) or 409 conflict "This action is still being applied".
  const card = reply.reply?.actionCards.find((c) => c.id === "next-deadline");
  const title = card?.kind === "add_plan_item" ? card.item.title : "";
  expect(title).toMatch(/^Work on /);
  const before = await planItemCount(a.page, title);
  const apply = { messageId: reply.id, cardId: "next-deadline" };
  const both = await Promise.all([
    api<{ error?: { code?: string } }>(a.page, "POST", "/actions/apply", apply),
    api<{ error?: { code?: string } }>(a.page, "POST", "/actions/apply", apply),
  ]);
  expect(both.map((r) => r.status)).toContain(200);
  for (const r of both) {
    if (r.status !== 200) expect([r.status, r.body.error?.code]).toEqual([409, "conflict"]);
  }
  // One item for the card's scholarship this week: a new one, or the weekly plan's item it matches (no duplicate).
  expect(await planItemCount(a.page, title)).toBe(Math.max(before, 1));
  expect(replyWithCard(await crewMessages(a.page, conversationId), "next-deadline").appliedCardIds).toEqual([
    "next-deadline",
  ]);

  await a.context.close();
  await b.context.close();
});
