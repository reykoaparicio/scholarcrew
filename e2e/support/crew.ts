import { type Page, expect } from "@playwright/test";
import type { Conversation, CrewJob, Message, ThisWeekView } from "@scholarcrew/domain";
import { apiOk } from "./api";

/** /crew redirects to /crew/<my crew id>, creating the room on the first visit. */
export async function openMyCrew(page: Page): Promise<string> {
  await page.goto("/crew");
  await page.waitForURL(/\/crew\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/")[2];
  if (!id) throw new Error(`No conversation id in ${page.url()}`);
  return id;
}

/** The My Crew room's id over the API, creating it like /crew does. */
export async function ensureMyCrew(page: Page): Promise<string> {
  const rooms = await apiOk<Conversation[]>(page, "GET", "/conversations");
  const mine = rooms.find((c) => c.room === "my_crew");
  if (mine) return mine.id;
  const created = await apiOk<Conversation>(page, "POST", "/conversations", { room: "my_crew" });
  return created.id;
}

export async function sendFromComposer(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message your crew" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

export async function crewMessages(page: Page, conversationId: string): Promise<Message[]> {
  return apiOk<Message[]>(page, "GET", `/conversations/${conversationId}/messages`);
}

export function replyWithCard(list: Message[], cardId: string): Message {
  const found = list.find((m) => m.authorKind === "crew" && m.reply?.actionCards.some((c) => c.id === cardId));
  if (!found) throw new Error(`No crew reply with card ${cardId} in ${list.length} messages`);
  return found;
}

/** Polls GET /jobs/:id until the job is ready, needs_input, or failed, and returns it. */
export async function waitForJob(page: Page, jobId: string, timeoutMs = 90_000): Promise<CrewJob> {
  const last: { job: CrewJob | null } = { job: null };
  await expect
    .poll(
      async () => {
        last.job = await apiOk<CrewJob>(page, "GET", `/jobs/${jobId}`);
        return last.job.status;
      },
      { message: `Job ${jobId} didn't finish`, timeout: timeoutMs, intervals: [1_000] },
    )
    .toMatch(/^(ready|needs_input|failed)$/);
  if (!last.job) throw new Error(`Job ${jobId} was never read`);
  return last.job;
}

/** How many of this week's plan items have exactly this title. */
export async function planItemCount(page: Page, title: string): Promise<number> {
  const view = await apiOk<ThisWeekView>(page, "GET", "/plan/this-week");
  return view.plan.items.filter((i) => i.title === title).length;
}

/**
 * Event names in a raw SSE body, in order. A block whose first line starts with ":" is a comment (plan 14's
 * `: ping` every 15 s while nothing changes, R3E-2) and is skipped, as EventSource does.
 */
export function sseEvents(text: string): string[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim() !== "" && !block.startsWith(":"))
    .map((block) => /^event: (.+)$/m.exec(block)?.[1] ?? "");
}

export interface RawJobStream {
  status: number;
  headers: Record<string, string>;
  events: string[];
}

/**
 * GET /jobs/:id/events read raw, asking for gzip like a browser does (R3E-1). For a finished job, plan 14
 * writes one `job` frame and `end`, then closes, so the whole body arrives at once.
 */
export async function readJobStream(page: Page, jobId: string): Promise<RawJobStream> {
  const res = await page.request.get(`/api/v1/jobs/${jobId}/events`, {
    headers: { accept: "text/event-stream", "accept-encoding": "gzip" },
  });
  return { status: res.status(), headers: res.headers(), events: sseEvents(await res.text()) };
}
