# Plan 17: Web pipeline screens (Agent Q)

This plan builds the signed-in pipeline screens: the scholarship board and detail page, Essay Studio with the new-essay form and the Story Bank, the college list and college detail, costs, award letters and offer comparison, FAFSA and CSS checklists with special-circumstances and verification help, test prep, and service hours and activities. They're ported from mockups 03, 04, 05, 06, 10, 11, and 12. Pages are server components that read through `@scholarcrew/core` services with the page actor (parents read their student's shared categories); client components change data through `api()` and then `router.refresh()`. Feature IDs: SC-01..SC-09 and SC-11 (screen side: the detail page serves renewal links), ES-01..ES-09 (ES-08 as the Quill story interview entry; ES-09 integrity banner), CO-01..CO-08, MO-01..MO-10, AID-01..AID-05 (AID-04/05 as guidance cards; see Deviations), PR-01..PR-05, IM-01..IM-05, IM-06 (ask link only), CR-08 (scholarship, college, and essay context rooms), SE-05 (asset scan for these folders).

Rules this plan follows on top of `00-overview.md` and plan 16:

- Pages call `loadViewer()` (Q1), which wraps plan 16's `requireAppActor(["student", "parent"])`. Students read their own records. Parents read their family's student (found with `family.getFamily`) and every read goes through `readShared()`, which turns the service's `not_found` (category not shared) into the `NotShared` card. Parent views pass `readOnly` to client components, so no mutation buttons render. D23: parents' reads pass the student id to the services (`studentId` from `loadViewer`), the same rule as the API's `?studentId=`. No client component in a parent view reads over HTTP, so none needs to add `?studentId=` itself.
- Client components start with `"use client"`, use `api`, `errorMessage` (plan 16 `src/lib/api.ts`), `useJobStream` (`src/lib/sse.ts`; every caller reads both `job` and `error`, so a dropped or timed-out stream never leaves a spinner up), and `usd`, `dateShort`, `dateWithWeekday`, `daysLabel`, `instantShort`, `minutesLabel`, `plural`, `addDaysIso` (`src/lib/format.ts`), and `cx` (`src/lib/cx.ts`). Crew replies render with plan 16's `ReplyCard` (`src/components/crew/ReplyCard.tsx`), and context rooms render plan 16's `Thread` (`src/components/crew/Thread.tsx`) with its P12 props only.
- Counting and limits come from `@scholarcrew/engines` (`countWords`, `countChars`, `limitState`, `daysUntil`, `meritTierFor`, `retakeAnalysis`), which `apps/web` already depends on (plan 13 M1). Nothing is counted twice in different ways.
- Only the 24 `ICON_NAMES` from `@scholarcrew/ui` are used. Mockup sample data is never hardcoded; copy and layout follow the mockups. List keys are ids or text offsets, never array indexes (Biome `noArrayIndexKey`).
- Tests follow plan 16: `// @vitest-environment jsdom` first line, `next/navigation` mocked, `fetch` stubbed with `vi.stubGlobal` (plan 13's `test/setup.ts` unstubs after each test), `cleanup` in `afterEach`, `fireEvent` and `waitFor` (no `user-event`). Fake `EventSource`s set `readyState` to `CLOSED` before a fatal `error`, so they work with plan 16's hook whether or not it lets the browser reconnect on `CONNECTING`. Plan 13's setup truncates the test database before each test, so the test database must be up even for these tests.

Deviations and contract gaps (also in the final report):

- **Context rooms reuse `Thread` (D35).** `ContextCrew` (Q2) draws the room header and renders plan 16's `Thread` for the conversation, so crisis replies hide chips, lost streams show 16's message, and replies refresh the page the same way as `/crew`. `Thread` needs a `Conversation`, so a room that doesn't exist yet shows an "Ask your crew here" button that calls `POST /conversations` (it reopens the room for the same object) and then mounts `Thread`. A lazy-room option on `Thread` would remove that button; see the follow-ups for 16.
- **Offer parse job id (D31).** `Offer.parseJobId` is set by 08/13/14. The upload (Q23) follows `GET /jobs/:id/events` when it's present and polls `GET /offers/:id` when it's null or the stream drops.
- **Retake result table.** `prep.computeRetake` is system-only and the job stores only the explanation reply. The prep page passes the same inputs `computeRetake` uses (current-season list with merit tiers, profile GPA, best official composites) to the client, which runs `engines.retakeAnalysis` once the job finishes (D32, accepted). Suggested addition: an actor-facing `prep.getRetakeResult(deps, actor, jobId)`.
- **Recommendation requests (D33).** The college page lists this entry's past requests from `colleges.listRecRequests` (the service behind `GET /recommendations`) and matches each `helperLinkId` to `helpers.listHelperLinks` (behind `GET /helper-links`) to show whether the link is open, expired, or turned off. The link URL is never shown again: it's only emailed at creation, and the token isn't stored in the clear.
- **Essay list word counts (D34).** `/essays` uses `Essay.latestWordCount` from the list and reads no bodies. `Essay` has no `targetLabel`, so the "For" column names targets from the student's college list and board (one read each) and falls back to "A college", "A scholarship", or "General". Essays with only a character limit show their word count without a badge.
- **New essay (D47).** `/essays` has a "Start a new essay" form (title, prompt, optional word limit, optional college or saved scholarship) that posts `POST /essays` and opens Essay Studio.
- **Story interview (ES-08).** There's no interview API; the Story Bank's card opens My Crew with `?prefill=@Quill interview me for a new Story Bank story` plus an optional pasted essay (4,000 characters at most), and the student saves the story on this page.
- **AID-04 and AID-05.** Both are guidance cards on `/money` with Ask Aid links. AID-05's "tracks them" goes through chat: Aid can offer each document as an `add_plan_item` card, and applied cards land in the student's plan. There's no stored verification checklist (08's `getAidChecklists` has only FAFSA and CSS programs). Suggested addition for 08/14: a `verification` program in the aid checklists.
- **IM-06.** "Ask Impact for ideas" opens My Crew with a prefilled `@Impact` request. The ideas come from chat; no external listings are shown or claimed as verified.
- **Test prep for parents.** Test scores have no share category (07), so `/prep` shows parents a "Test scores stay private to your student" card instead of `NotShared`.
- **Report links.** `POST /scholarships/:idOrSlug/report` accepts an id or a slug (D-14-3). The report dialog sends the listing id, which the detail page always has.
- **Shared pieces location.** Shared helpers (`viewer.ts`, `NotShared`, `JobReply`, `ContextCrew`) and the pipeline asset scan live under `src/components/scholarships/` because this plan owns no shared folder.
- **Retake job reply.** `JobReply` reads the finished job (`GET /jobs/:id`) for its `conversationId` and `resultMessageId`, then loads that conversation's messages (plan 08 gives replies without a room a new `my_crew` conversation).
- **Plan limits (CR-10/BI-02).** On 402 the pipeline surfaces that start crew jobs (`CommentsPanel` Ask Quill, `AppealButton`, `RetakeForm`) show the server's `limit_reached` message and, when plan 16's `isLimit(e)` is true, `<Button variant="soft" size="sm" href="/settings">See plans</Button>` next to it (E-16-6, round 3 carry-over). `JobReply` only follows a job that already started, so it never sees the 402.
- **Award letters are PDF only (R2P-8).** The parser reads PDFs only, so `UploadLetter` accepts and checks only `application/pdf`. There's no re-parse route, so "retry" is "Remove and try again": `DELETE /offers/:id` (08 `deleteOffer`), then the same form takes a clearer PDF. The offers page also has Remove on failed and `needs_review` letters; confirmed letters stay (the core answers 409).
- **Private matches (R4Z-4).** Listings matched through any sensitive reason are visible to the student alone. Core filters names, per-award amounts, reasons, flagged entries, and direct detail reads for parents, regardless of the sensitive share toggle. The student board shows `privateCount`; aggregate money totals still include private awards.
- **Recommendation status (R2P-11).** The past-request status is a native `<select>` so "Asked" can be shown but disabled; the UI kit's `Select` has no disabled options. The summary line no longer repeats the status.
- **Supervisor link expiry (R2P-10).** `ServiceLogs` takes `now` (the server clock, ISO) so "Link expired" renders the same on the server and in the browser.
- **Retired and under-review cards (R2P-4).** 07 moves open cards on retired or under-review listings into `board.flagged` with `RETIRED_TEXT` or `UNDER_REVIEW_TEXT`. Those constants live in core, which client components can't import, so `FlaggedCard` treats any reason that isn't a `SCAM_FLAG_TEXT` value as "Not available" and drops the "Why flagged?" link (the detail page 404s for them).

## Files

Create (all under `apps/web/src/`):

- `components/scholarships/viewer.ts`, `NotShared.tsx`, `JobReply.tsx`, `ContextCrew.tsx`, `shared.module.css`
- `components/scholarships/board.ts`, `fixtures.ts`, `scholarships.module.css`, `ScholarshipCard.tsx`, `WonModal.tsx`, `AddLocalModal.tsx`, `BoardView.tsx`, `SearchResults.tsx`, `detail.ts`, `ReportModal.tsx`, `DetailActions.tsx`
- `app/(app)/scholarships/page.tsx`, `app/(app)/scholarships/[slug]/page.tsx`
- `components/essays/text.ts`, `essays.module.css`, `EssayEditor.tsx`, `ReviewView.tsx`, `CommentsPanel.tsx`, `HistoryModal.tsx`, `StoryMatch.tsx`, `EssayWorkspace.tsx`, `NewEssayForm.tsx`, `StoryBank.tsx`
- `app/(app)/essays/page.tsx`, `app/(app)/essays/[id]/page.tsx`, `app/(app)/essays/stories/page.tsx`
- `components/colleges/colleges.ts`, `colleges.module.css`, `AddCollegeModal.tsx`, `CollegeTable.tsx`, `ChecklistItems.tsx`, `Recommenders.tsx`
- `app/(app)/colleges/page.tsx`, `app/(app)/colleges/[entryId]/page.tsx`
- `components/money/offers.ts`, `fixtures.ts`, `money.module.css`, `CostCards.tsx`, `CalculatorForm.tsx`, `AidChecklists.tsx`, `OfferComparisonView.tsx`, `UploadLetter.tsx`, `AppealButton.tsx`, `LineReview.tsx`
- `app/(app)/money/page.tsx`, `app/(app)/money/offers/page.tsx`, `app/(app)/money/offers/[id]/page.tsx`
- `components/prep/prep.ts`, `prep.module.css`, `ScoresCard.tsx`, `AddScoreModal.tsx`, `RetakeForm.tsx`, `StudyPlan.tsx`
- `app/(app)/prep/page.tsx`
- `components/impact/impact.ts`, `impact.module.css`, `ServiceLogs.tsx`, `RequirementCard.tsx`, `ActivitiesEditor.tsx`
- `app/(app)/impact/page.tsx`

Modify: none (plan 13 owns the package files and `test/**`; plan 16 owns `src/lib/**` and the crew components).

Test (all under `apps/web/src/components/`):

- `scholarships/shared.test.tsx`, `scholarships/ContextCrew.test.tsx`, `scholarships/board.test.ts`, `scholarships/BoardView.test.tsx`, `scholarships/SearchResults.test.tsx`, `scholarships/detail.test.tsx`, `scholarships/DetailPage.test.tsx`, `scholarships/assets.test.ts`
- `essays/text.test.ts`, `essays/EssayEditor.test.tsx`, `essays/Review.test.tsx`, `essays/StoryMatch.test.tsx`, `essays/EssayWorkspace.test.tsx`, `essays/EssayPages.test.tsx`, `essays/StoryBank.test.tsx`
- `colleges/colleges.test.ts`, `colleges/AddCollegeModal.test.tsx`, `colleges/CollegeTable.test.tsx`, `colleges/CollegeDetail.test.tsx`
- `money/offers.test.ts`, `money/CostsAid.test.tsx`, `money/OfferComparisonView.test.tsx`, `money/UploadLetter.test.tsx`, `money/LineReview.test.tsx`
- `prep/prep.test.ts`, `prep/ScoresCard.test.tsx`, `prep/RetakeForm.test.tsx`
- `impact/impact.test.ts`, `impact/ServiceLogs.test.tsx`, `impact/ActivitiesEditor.test.tsx`

## Tasks

### Q1: Viewer, not-shared card, and job replies

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/shared.test.tsx`:

```tsx
// @vitest-environment jsdom
import { AppError, type CrewJob, type Message } from "@scholarcrew/domain";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobReply } from "./JobReply";
import { loadViewer, readShared, todayIn } from "./viewer";

const m = vi.hoisted(() => ({ requireAppActor: vi.fn(), getFamily: vi.fn() }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/money/offers",
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  close() {
    this.closed = true;
  }
}

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const CONV_ID = "22222222-2222-4222-8222-222222222222";
const MSG_ID = "33333333-3333-4333-8333-333333333333";
const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: JOB_ID,
  kind: "appeal_outline",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
  ...o,
});
const reply: Message = {
  id: MSG_ID,
  conversationId: CONV_ID,
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text: "Here's an outline for your appeal.",
    contributors: ["aid"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
  },
  createdAt: "2026-10-06T15:01:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("viewer helpers", () => {
  it("turns not_found into null and rethrows other errors", async () => {
    await expect(readShared(async () => 5)).resolves.toBe(5);
    await expect(readShared(async () => Promise.reject(new AppError("not_found", "Not found")))).resolves.toBeNull();
    await expect(readShared(async () => Promise.reject(new AppError("internal", "boom")))).rejects.toThrow("boom");
  });

  it("finds today's date in the student's zone", () => {
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "America/Chicago")).toBe("2026-10-06");
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "Mars/Olympus")).toBe("2026-10-07");
  });

  it("points parents at their family's student", async () => {
    const parent = { kind: "user", userId: "p1", role: "parent" };
    m.requireAppActor.mockResolvedValue({
      actor: parent,
      me: { user: { displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" } },
      deps: {},
    });
    m.getFamily.mockResolvedValue({
      members: [
        { userId: "s1", displayName: "Maya Rivera", memberRole: "student" },
        { userId: "p1", displayName: "Dana Rivera", memberRole: "parent" },
      ],
    });
    await expect(loadViewer()).resolves.toMatchObject({ studentId: "s1", studentName: "Maya Rivera", isParent: true });
    m.getFamily.mockResolvedValue(null);
    await expect(loadViewer()).resolves.toMatchObject({ studentId: null, isParent: true });
    expect(m.requireAppActor).toHaveBeenCalledWith(["student", "parent"]);
  });
});

describe("JobReply", () => {
  it("shows progress, then loads and renders the reply", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith(`/jobs/${JOB_ID}`)
        ? json(job({ status: "ready", conversationId: CONV_ID, resultMessageId: MSG_ID }))
        : json([reply]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<JobReply jobId={JOB_ID} workingText="Aid is outlining your appeal…" onDone={onDone} />);
    expect(screen.getByText("Aid is outlining your appeal…")).toBeTruthy();
    const source = FakeEventSource.instances[0];
    act(() => source?.emit("job", JSON.stringify(job({ progress: [{ at: "2026-10-06T15:00:02.000Z", role: "aid", text: "Reading your letter" }] }))));
    expect(screen.getByText("Reading your letter")).toBeTruthy();
    act(() => source?.emit("job", JSON.stringify(job({ status: "ready" }))));
    await waitFor(() => expect(screen.getByText("Here's an outline for your appeal.")).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([`/api/v1/jobs/${JOB_ID}`, `/api/v1/conversations/${CONV_ID}/messages`]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("explains a failed job", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(job({ status: "failed", error: "Aid couldn't finish this time." }))));
    render(<JobReply jobId={JOB_ID} workingText="Working…" />);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job({ status: "failed" }))));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Aid couldn't finish this time."));
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/shared`
Expected: FAIL with `Failed to resolve import "./JobReply" from "src/components/scholarships/shared.test.tsx"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/viewer.ts` (server only; pages import it):

```ts
import { requireAppActor } from "@/lib/pageActor";
import { getFamily } from "@scholarcrew/core/family";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type MeResponse, type UserActor, isAppError } from "@scholarcrew/domain";

export interface Viewer {
  actor: UserActor;
  me: MeResponse;
  deps: CoreDeps;
  /** Whose records the page shows; null when a parent has no student in their family yet. */
  studentId: string | null;
  studentName: string;
  isParent: boolean;
  timeZone: string;
}

export async function loadViewer(): Promise<Viewer> {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const base = { actor, me, deps, timeZone: me.user.timeZone };
  if (me.user.role !== "parent") {
    return { ...base, studentId: actor.userId, studentName: me.user.displayName, isParent: false };
  }
  const family = await getFamily(deps, actor);
  const student = family?.members.find((member) => member.memberRole === "student");
  return { ...base, studentId: student?.userId ?? null, studentName: student?.displayName ?? "", isParent: true };
}

/** A not_found from a service (not shared, or not yours) becomes null so the page can explain it. */
export async function readShared<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    if (isAppError(e) && e.code === "not_found") return null;
    throw e;
  }
}

/** Today's calendar date in a time zone, falling back to UTC for an unknown zone. */
export function todayIn(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
```

`apps/web/src/components/scholarships/NotShared.tsx`:

```tsx
import { Button, Card, EmptyState } from "@scholarcrew/ui";

/** Parents see this when the student hasn't joined yet or doesn't share this category. */
export function NotShared({ studentName, what }: { studentName: string; what: string }) {
  const title = studentName ? `${studentName} isn't sharing ${what} right now` : `Your student's ${what} show up here`;
  const body = studentName
    ? "They can turn sharing back on from their Family page."
    : "Once you join your student's family, you'll see what they share with you.";
  return (
    <Card padding="lg">
      <EmptyState
        title={title}
        icon="users"
        action={
          <Button variant="soft" href="/family">
            Open Family
          </Button>
        }
      >
        {body}
      </EmptyState>
    </Card>
  );
}
```

`apps/web/src/components/scholarships/JobReply.tsx`:

```tsx
"use client";

import { ReplyCard } from "@/components/crew/ReplyCard";
import { api, errorMessage } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, type Message, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { StatusPill } from "@scholarcrew/ui";
import { useEffect, useRef, useState } from "react";
import styles from "./shared.module.css";

/** Reads the finished job, then the reply message it points at. */
export async function loadJobReply(jobId: string): Promise<{ job: CrewJob; message: Message | null }> {
  const job = await api<CrewJob>(`/jobs/${jobId}`);
  if (!job.conversationId || !job.resultMessageId) return { job, message: null };
  const messages = await api<Message[]>(`/conversations/${job.conversationId}/messages`);
  return { job, message: messages.find((m) => m.id === job.resultMessageId) ?? null };
}

/** CR-06 for one background job: live progress, then the crew's reply (or the failure). */
export function JobReply({
  jobId,
  workingText,
  onDone,
  timeZone,
}: {
  jobId: string | null;
  workingText: string;
  onDone?: (job: CrewJob) => void;
  timeZone?: string;
}) {
  const { job, error } = useJobStream(jobId);
  const [result, setResult] = useState<{ job: CrewJob; message: Message | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finished = job !== null && TERMINAL_JOB_STATUSES.includes(job.status);

  useEffect(() => {
    if (!jobId || !finished) return;
    let live = true;
    loadJobReply(jobId)
      .then((r) => {
        if (!live) return;
        setResult(r);
        onDoneRef.current?.(r.job);
      })
      .catch((e: unknown) => {
        if (live) setLoadError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [jobId, finished]);

  if (!jobId) return null;
  const problem = error ?? loadError;
  if (problem) {
    return (
      <p className={styles.error} role="alert">
        {problem}
      </p>
    );
  }
  if (result) {
    if (result.job.status === "failed") {
      return (
        <p className={styles.error} role="alert">
          {result.job.error ?? "Your crew couldn't finish this one. Try again in a minute."}
        </p>
      );
    }
    return result.message ? <ReplyCard message={result.message} timeZone={timeZone} compact /> : null;
  }
  return (
    <div className={styles.working} aria-live="polite">
      <StatusPill status={job?.status ?? "queued"} />
      <span>{job?.progress.at(-1)?.text ?? workingText}</span>
    </div>
  );
}
```

`apps/web/src/components/scholarships/shared.module.css` (shared by every pipeline area):

```css
.error {
  font-size: 12.5px;
  color: var(--crit-text);
}

.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.working {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--navy-line);
  border-radius: 12px;
  font-size: 13px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.head h1 {
  font-size: 30px;
}

.sub {
  margin-top: 4px;
  color: var(--muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.room {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.roomTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.roomTitle {
  font-size: 16px;
  font-weight: 650;
}
```

The room's bubbles, composer, and progress come from plan 16's `Thread` and `crew.module.css` (Q2), so this file has no thread styles.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/shared && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 5 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/viewer.ts apps/web/src/components/scholarships/NotShared.tsx apps/web/src/components/scholarships/JobReply.tsx apps/web/src/components/scholarships/shared.module.css apps/web/src/components/scholarships/shared.test.tsx
git commit -m "feat(web): pipeline viewer, not-shared card, and job replies"
```

### Q2: Context crew room panel (CR-08)

The panel is a thin wrapper: it draws the room header and, once the room exists, hands the conversation to plan 16's `Thread` (`src/components/crew/Thread.tsx`, props as of P12: `conversation`, `messages`, `chips`, `compact`, `placeholder`, `emptyText`, `timeZone`). The composer, send, job stream, lost-stream message, crisis handling (no chips after a `safety: "crisis"` reply, CR-09), and `router.refresh()` after a reply all live in `Thread`, so a context room behaves exactly like `/crew` (D35). `Thread` needs a `Conversation`, so until the student asks, the panel shows one button that calls `POST /conversations` (which reopens the room for the same object) and then renders `Thread`. Viewing a page never creates an empty room.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/ContextCrew.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextCrew, type ContextCrewProps } from "./ContextCrew";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/scholarships/rotary" }));

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  readyState = 0;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  /** A connection the browser gave up on (CLOSED), so 16's hook treats it as lost. */
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.emit("error");
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const ESSAY = "99999999-9999-4999-8999-999999999999";
const CONV = "22222222-2222-4222-8222-222222222222";
const JOB = "11111111-1111-4111-8111-111111111111";
const conversation: Conversation = {
  id: CONV,
  room: "scholarship",
  roomRefId: SCHOLARSHIP,
  familyId: null,
  title: "Rotary Club of Eastside",
  createdAt: "2026-10-06T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};
const userMsg: Message = {
  id: "55555555-5555-4555-8555-555555555555",
  conversationId: CONV,
  authorKind: "user",
  authorUserId: "66666666-6666-4666-8666-666666666666",
  body: "Do I need a recommendation letter?",
  reply: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
};
const crewMsg = (safety: "crisis" | null = null): Message => ({
  ...userMsg,
  id: "77777777-7777-4777-8777-777777777777",
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text: safety === "crisis" ? "You deserve support right now." : "No. The listing asks for the essay, a transcript, and the online form.",
    contributors: ["scout"],
    question: null,
    actionCards: [],
    receipt: [],
    safety,
    needsInput: false,
  },
});
const job = (status: CrewJob["status"]): CrewJob => ({
  id: JOB,
  kind: "crew_request",
  status,
  conversationId: CONV,
  requestMessageId: userMsg.id,
  resultMessageId: null,
  refId: null,
  progress: [{ at: "2026-10-06T15:00:01.000Z", role: "scout", text: "Reading the listing" }],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props: ContextCrewProps = {
  room: "scholarship",
  refId: SCHOLARSHIP,
  title: "Rotary Club of Eastside",
  lead: "scout",
  placeholder: "Ask about this scholarship…",
  chips: [{ role: "quill", text: "@Quill check my outline" }],
  timeZone: "America/Chicago",
  conversation: null,
  messages: [],
};

describe("ContextCrew", () => {
  it("opens the room on the first click, then hands it to the crew thread", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      // 201 for POST /conversations; 14 N9 answers the message send with 202 (R3A-14).
      url === "/api/v1/conversations" ? json(conversation, 201) : json({ message: userMsg, job: job("queued") }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContextCrew {...props} />);
    expect(screen.getByText("Crew room · this scholarship")).toBeTruthy();
    expect(screen.getByText("Your crew reads this first in this room.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask your crew here" }));
    const box = await screen.findByRole("textbox", { name: "Message your crew" });
    expect(box.getAttribute("placeholder")).toBe("Ask about this scholarship…");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ room: "scholarship", roomRefId: SCHOLARSHIP });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    fireEvent.change(box, { target: { value: "Do I need a recommendation letter?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/conversations/${CONV}/messages`);
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${JOB}/events`);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("working"))));
    expect(screen.getByText("Reading the listing")).toBeTruthy();
  });

  it("renders an open room through Thread, with the room's chips filling the composer", () => {
    render(<ContextCrew {...props} conversation={conversation} messages={[userMsg, crewMsg()]} />);
    expect(screen.getByText("Do I need a recommendation letter?")).toBeTruthy();
    expect(screen.getByText(/The listing asks for the essay/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask your crew here" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "@Quill check my outline" }));
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe("@Quill check my outline");
  });

  it("hides the chips after a crisis reply, like every other thread (CR-09)", () => {
    render(<ContextCrew {...props} conversation={conversation} messages={[userMsg, crewMsg("crisis")]} />);
    expect(screen.getByText("You deserve support right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "@Quill check my outline" })).toBeNull();
  });

  it("shows a lost stream and lets the student send again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: userMsg, job: job("queued") }, 202)));
    render(<ContextCrew {...props} conversation={conversation} messages={[]} />);
    const box = screen.getByRole("textbox", { name: "Message your crew" });
    fireEvent.change(box, { target: { value: "Do I need a recommendation letter?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.instances[0]?.fail());
    expect(screen.getByText(/Refresh to check on your crew/)).toBeTruthy();
    fireEvent.change(box, { target: { value: "Still there?" } });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens essay rooms with the essay's id and shows the open error", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ error: { code: "not_found", message: "Essay not found" } }, 404),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContextCrew {...props} room="essay" refId={ESSAY} lead="quill" title="Rotary Club of Eastside essay" />);
    expect(screen.getByText("Crew room · this essay")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ask your crew here" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Essay not found"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ room: "essay", roomRefId: ESSAY });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/ContextCrew`
Expected: FAIL with `Failed to resolve import "./ContextCrew"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/ContextCrew.tsx`:

```tsx
"use client";

import { Thread } from "@/components/crew/Thread";
import { api, errorMessage } from "@/lib/api";
import type { Conversation, CrewRole, Message } from "@scholarcrew/domain";
import { Badge, Button, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./shared.module.css";

export type ContextRoom = "scholarship" | "college" | "essay";

export interface ContextCrewProps {
  room: ContextRoom;
  refId: string;
  title: string;
  lead: CrewRole;
  placeholder: string;
  chips: Array<{ role: CrewRole; text: string }>;
  timeZone: string;
  /** The open room for this object, or null when the student hasn't asked here yet. */
  conversation: Conversation | null;
  messages: Message[];
}

const ROOM_LABEL: Record<ContextRoom, string> = {
  scholarship: "Crew room · this scholarship",
  college: "Crew room · this college",
  essay: "Crew room · this essay",
};

/** CR-08: a room bound to one object. The header is this plan's; the conversation is plan 16's Thread (D35). */
export function ContextCrew({ room, refId, title, lead, placeholder, chips, timeZone, conversation, messages }: ContextCrewProps) {
  const router = useRouter();
  const [opened, setOpened] = useState<Conversation | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = conversation ?? opened;

  async function open() {
    setOpening(true);
    setError(null);
    try {
      setOpened(await api<Conversation>("/conversations", { method: "POST", body: { room, roomRefId: refId } }));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card padding="lg">
      <div className={styles.room}>
        <Eyebrow>{ROOM_LABEL[room]}</Eyebrow>
        <div className={styles.roomTop}>
          <span className={styles.roomTitle}>{title}</span>
          <Badge tone="neutral" icon="lock">
            Private
          </Badge>
        </div>
        <p className={styles.muted}>Your crew reads this first in this room.</p>
        {current ? (
          <Thread
            conversation={current}
            messages={conversation ? messages : []}
            chips={chips}
            compact
            placeholder={placeholder}
            emptyText={`Ask anything about this ${room}.`}
            timeZone={timeZone}
          />
        ) : (
          <div className={styles.actions}>
            <Who role={lead} size="sm" />
            <Button variant="primary" size="sm" icon="chat" disabled={opening} onClick={() => void open()}>
              Ask your crew here
            </Button>
          </div>
        )}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/ContextCrew && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 5 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/ContextCrew.tsx apps/web/src/components/scholarships/ContextCrew.test.tsx
git commit -m "feat(web): context crew rooms for scholarships, colleges, and essays on the shared crew thread"
```

### Q3: Board model: columns, filters, card actions, won validation (SC-03, SC-09)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/fixtures.ts` (test data builders shared by the scholarship tests; not a test file):

```ts
import type { Board, BoardCard, ScholarshipApplication, ScholarshipSummary } from "@scholarcrew/domain";

let n = 0;
function uuid(): string {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function summary(o: Partial<ScholarshipSummary> = {}): ScholarshipSummary {
  return {
    id: uuid(),
    slug: "rotary-club-of-eastside",
    name: "Rotary Club of Eastside",
    provider: "Rotary Club of Eastside",
    amountMinUsd: 2500,
    amountMaxUsd: 2500,
    renewable: false,
    deadline: "2026-10-30",
    localLabel: "Maple County, TX",
    status: "published",
    verifiedAt: "2026-10-02T15:00:00.000Z",
    scamFlags: [],
    unverified: false,
    estMinutes: 45,
    ...o,
  };
}

export function application(o: Partial<ScholarshipApplication> = {}): ScholarshipApplication {
  return {
    id: uuid(),
    scholarshipId: uuid(),
    stage: "matched",
    matchReasons: [{ code: "county", text: "you live in Maple County", sensitive: false }],
    fitScore: 80,
    estMinutes: 45,
    submittedAt: null,
    outcomeUsd: null,
    outcomeRenewable: null,
    outcomeAt: null,
    thankYouSent: false,
    createdAt: "2026-10-01T15:00:00.000Z",
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...o,
  };
}

export function card(stage: ScholarshipApplication["stage"], s: Partial<ScholarshipSummary> = {}, o: Partial<BoardCard> = {}): BoardCard {
  const scholarship = summary(s);
  const app = application({ stage, scholarshipId: scholarship.id });
  return { application: app, scholarship, reasons: app.matchReasons, reuseStoryTitle: null, progress: null, daysUntilDeadline: 24, ...o };
}

export function board(o: Partial<Board> = {}): Board {
  return {
    matched: [],
    working: [],
    submitted: [],
    won: [],
    lostOrSkipped: [],
    flagged: [],
    privateCount: 0,
  totals: { inPlayUsd: 0, wonUsd: 0, dueThisMonth: 0 },
    ...o,
  };
}
```

`apps/web/src/components/scholarships/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { boardColumns, cardActions, columnFor, parseWonInput, totalsLine } from "./board";
import { board, card } from "./fixtures";

describe("boardColumns", () => {
  const b = board({
    matched: [card("matched", { localLabel: "National", renewable: true }), card("matched")],
    working: [card("planned", {}, { reuseStoryTitle: "Robotics story" }), card("drafting")],
    submitted: [card("submitted")],
    won: [card("won")],
    lostOrSkipped: [card("skipped")],
  });

  it("maps the four columns and hides lost and skipped until asked", () => {
    expect(boardColumns(b, "all", false).map((c) => [c.title, c.cards.length])).toEqual([
      ["Matched", 2],
      ["Working on", 2],
      ["Submitted", 1],
      ["Won", 1],
    ]);
    expect(boardColumns(b, "all", true).at(-1)).toMatchObject({ key: "lostOrSkipped", title: "Lost and skipped" });
  });

  it("filters cards by local, national, renewable, and story reuse", () => {
    const counts = (f: Parameters<typeof boardColumns>[1]) => boardColumns(b, f, false).map((c) => c.cards.length);
    expect(counts("national")).toEqual([1, 0, 0, 0]);
    expect(counts("local")).toEqual([1, 2, 1, 1]);
    expect(counts("renewable")).toEqual([1, 0, 0, 0]);
    expect(counts("reuse")).toEqual([0, 1, 0, 0]);
  });

  it("keeps the core's ranked Matched order, even against deadline order (R2P-5)", () => {
    const value = card("matched", { name: "Higher value per hour", deadline: "2026-12-15" });
    const soon = card("matched", { name: "Due sooner", deadline: "2026-10-12" });
    const ranked = board({ matched: [value, soon] });
    expect(boardColumns(ranked, "all", false)[0]?.cards.map((c) => c.scholarship.name)).toEqual(["Higher value per hour", "Due sooner"]);
    expect(boardColumns(ranked, "local", false)[0]?.cards.map((c) => c.scholarship.name)).toEqual(["Higher value per hour", "Due sooner"]);
  });

  it("puts each stage in its column", () => {
    expect(["matched", "planned", "drafting", "submitted", "won", "lost", "skipped"].map((s) => columnFor(s as never))).toEqual([
      "matched",
      "working",
      "working",
      "submitted",
      "won",
      "lostOrSkipped",
      "lostOrSkipped",
    ]);
  });
});

describe("cardActions", () => {
  it("offers the next step for each stage", () => {
    expect(cardActions(card("matched").application).map((a) => [a.label, a.patch])).toEqual([
      ["Save", { stage: "planned" }],
      ["Skip", { stage: "skipped" }],
    ]);
    expect(cardActions(card("planned").application)[0]).toMatchObject({ label: "Start drafting", patch: { stage: "drafting" } });
    expect(cardActions(card("drafting").application)[0]).toMatchObject({ label: "Mark submitted", patch: { stage: "submitted" } });
    expect(cardActions(card("submitted").application).map((a) => a.label)).toEqual(["Mark won", "Didn't win"]);
    expect(cardActions(card("submitted").application)[0]?.patch).toBeNull();
    expect(cardActions(card("won").application)).toEqual([{ key: "thanks", label: "Thank-you note sent", patch: { thankYouSent: true } }]);
    expect(cardActions({ ...card("won").application, thankYouSent: true })).toEqual([]);
    expect(cardActions(card("lost").application)[0]).toMatchObject({ label: "Move back to matched", patch: { stage: "matched" } });
  });
});

describe("parseWonInput", () => {
  it("needs whole dollars and one-time or renewable", () => {
    expect(parseWonInput("", "renewable")).toEqual({ ok: false, error: "Enter the amount you won in whole dollars." });
    expect(parseWonInput("12.50", "renewable")).toEqual({ ok: false, error: "Enter the amount you won in whole dollars." });
    expect(parseWonInput("0", "one_time")).toEqual({ ok: false, error: "Enter an amount between $1 and $10,000,000." });
    expect(parseWonInput("$1,000", null)).toEqual({ ok: false, error: "Pick one-time or renewable." });
    expect(parseWonInput("$1,000", "renewable")).toEqual({
      ok: true,
      patch: { stage: "won", outcomeUsd: 1000, outcomeRenewable: true },
    });
    expect(parseWonInput(" 750 ", "one_time")).toMatchObject({ patch: { outcomeUsd: 750, outcomeRenewable: false } });
  });
});

describe("totalsLine", () => {
  it("reads like the mockup", () => {
    expect(totalsLine({ inPlayUsd: 12250, wonUsd: 1000, dueThisMonth: 2 })).toBe(
      "$12,250 in play · $1,000 won · 2 due this month · Scout looks for new matches every Sunday",
    );
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/board`
Expected: FAIL with `Failed to resolve import "./board" from "src/components/scholarships/board.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/board.ts`:

```ts
import { usd } from "@/lib/format";
import type { ApplicationPatch, ApplicationStage, Board, BoardCard, ScholarshipApplication } from "@scholarcrew/domain";

export type BoardFilter = "all" | "local" | "national" | "renewable" | "reuse";
export const BOARD_FILTERS: Array<{ key: BoardFilter; label: string }> = [
  { key: "all", label: "Matched to you" },
  { key: "local", label: "Local" },
  { key: "national", label: "National" },
  { key: "renewable", label: "Renewable" },
  { key: "reuse", label: "Reuses my essays" },
];

export type ColumnKey = "matched" | "working" | "submitted" | "won" | "lostOrSkipped";
export const COLUMN_TITLES: Record<ColumnKey, string> = {
  matched: "Matched",
  working: "Working on",
  submitted: "Submitted",
  won: "Won",
  lostOrSkipped: "Lost and skipped",
};

export function matchesFilter(c: BoardCard, filter: BoardFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "local":
      return c.scholarship.localLabel !== "National";
    case "national":
      return c.scholarship.localLabel === "National";
    case "renewable":
      return c.scholarship.renewable;
    case "reuse":
      return c.reuseStoryTitle !== null;
  }
}

/** SC-03: Matched, Working on, Submitted, Won; Lost and skipped only when the filter is on. Card order is the core's (07 ranks Matched by value per hour, R2P-5); filters never re-sort. */
export function boardColumns(
  b: Board,
  filter: BoardFilter,
  showClosed: boolean,
): Array<{ key: ColumnKey; title: string; cards: BoardCard[] }> {
  const keys: ColumnKey[] = ["matched", "working", "submitted", "won"];
  if (showClosed) keys.push("lostOrSkipped");
  return keys.map((key) => ({ key, title: COLUMN_TITLES[key], cards: b[key].filter((c) => matchesFilter(c, filter)) }));
}

export function columnFor(stage: ApplicationStage): ColumnKey {
  switch (stage) {
    case "matched":
      return "matched";
    case "planned":
    case "drafting":
      return "working";
    case "submitted":
      return "submitted";
    case "won":
      return "won";
    case "lost":
    case "skipped":
      return "lostOrSkipped";
  }
}

/** A null patch means "open the won dialog" (SC-09 needs the amount and renewability). */
export interface CardAction {
  key: string;
  label: string;
  patch: ApplicationPatch | null;
}

const SKIP: CardAction = { key: "skip", label: "Skip", patch: { stage: "skipped" } };

export function cardActions(app: Pick<ScholarshipApplication, "stage" | "thankYouSent">): CardAction[] {
  switch (app.stage) {
    case "matched":
      return [{ key: "save", label: "Save", patch: { stage: "planned" } }, SKIP];
    case "planned":
      return [{ key: "draft", label: "Start drafting", patch: { stage: "drafting" } }, SKIP];
    case "drafting":
      return [{ key: "submit", label: "Mark submitted", patch: { stage: "submitted" } }];
    case "submitted":
      return [
        { key: "won", label: "Mark won", patch: null },
        { key: "lost", label: "Didn't win", patch: { stage: "lost" } },
      ];
    case "won":
      return app.thankYouSent ? [] : [{ key: "thanks", label: "Thank-you note sent", patch: { thankYouSent: true } }];
    case "lost":
    case "skipped":
      return [{ key: "restore", label: "Move back to matched", patch: { stage: "matched" } }];
  }
}

/**
 * R3V-1: 07 stores a student's own local submission with amounts 0 until an admin publishes it. A draft is the only
 * kind of listing a student sees unpublished, so its amount reads as unknown instead of "$0". A published $0 stays "$0".
 */
export const UNKNOWN_AMOUNT = "Amount not known yet";

/** The card's headline amount: the won amount, else the listing's top amount, else unknown for a draft. */
export function cardAmount(c: Pick<BoardCard, "scholarship" | "application">): string {
  const { scholarship: s, application: a } = c;
  if (a.stage === "won" && a.outcomeUsd !== null) return usd(a.outcomeUsd);
  return s.status === "draft" ? UNKNOWN_AMOUNT : usd(s.amountMaxUsd);
}

export function totalsLine(t: Board["totals"]): string {
  return `${usd(t.inPlayUsd)} in play · ${usd(t.wonUsd)} won · ${t.dueThisMonth} due this month · Scout looks for new matches every Sunday`;
}

export type WonChoice = "one_time" | "renewable";
export type WonInput = { ok: true; patch: ApplicationPatch } | { ok: false; error: string };

/** SC-09: whole dollars (commas and $ allowed) plus one-time or renewable. */
export function parseWonInput(amountText: string, renewable: WonChoice | null): WonInput {
  const cleaned = amountText.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: "Enter the amount you won in whole dollars." };
  const amount = Number(cleaned);
  if (amount < 1 || amount > 10_000_000) return { ok: false, error: "Enter an amount between $1 and $10,000,000." };
  if (!renewable) return { ok: false, error: "Pick one-time or renewable." };
  return { ok: true, patch: { stage: "won", outcomeUsd: amount, outcomeRenewable: renewable === "renewable" } };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/board && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 7 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/board.ts apps/web/src/components/scholarships/board.test.ts apps/web/src/components/scholarships/fixtures.ts
git commit -m "feat(web): scholarship board columns, filters, actions, and won validation"
```

### Q4: Scholarship styles (mockups 03 and 10)

Style-only task: no behavior to test. The next tasks' tests import this module.

- [ ] **Step 1: Write the stylesheet**

`apps/web/src/components/scholarships/scholarships.module.css`:

```css
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.spacer {
  flex: 1;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.card + .card {
  margin-top: 10px;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.amount {
  font-size: 20px;
  font-weight: 700;
}

.date {
  padding: 2px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
}

.dateWarn {
  border-color: var(--warn-soft);
  background: var(--warn-soft);
  color: var(--warn-text);
}

.name {
  font-size: 15px;
  font-weight: 650;
}

.meta,
.fits {
  font-size: 13px;
  color: var(--muted);
}

.fits {
  color: var(--ink-2);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--line-2);
  font-size: 12.5px;
}

.reuse {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--navy);
  font-weight: 600;
}

.cardActions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.flagged {
  border-color: var(--crit-soft);
  background: var(--crit-soft);
}

.flagged .reason {
  font-size: 13px;
  color: var(--crit-text);
}

.struck {
  text-decoration: line-through;
  color: var(--muted);
}

.colNote {
  margin-top: 10px;
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 12.5px;
  text-align: center;
  color: var(--muted);
}

.results {
  margin-bottom: 18px;
}

.result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
}

.result:first-child {
  border-top: 0;
}

/* detail (mockup 10) */
.crumbs {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.stat {
  padding: 14px 16px;
  border-left: 1px solid var(--line-2);
}

.stat:first-child {
  border-left: 0;
}

.statLabel {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.statValue {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  list-style: none;
}

.list li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.list li:first-child {
  border-top: 0;
}

.prompt {
  font-size: 15px;
  font-weight: 650;
}

.source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
}

.radios {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 0;
  font-size: 13.5px;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 2: Check formatting**

Run: `pnpm exec biome check apps/web/src/components/scholarships/scholarships.module.css`
Expected: exit 0 (Biome 1.9 leaves CSS unchecked unless enabled; the command still exits 0).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/scholarships/scholarships.module.css
git commit -m "feat(web): scholarship board and detail styles"
```

### Q5: Board UI: cards, won dialog, local submission (SC-03, SC-06, SC-07, SC-09)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/BoardView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardView } from "./BoardView";
import { board, card, summary } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const matched = card("matched", { name: "Lone Star Credit Union Award", slug: "lone-star", amountMaxUsd: 1500 });
const renewable = card("matched", { name: "First-Gen Futures", renewable: true, amountMaxUsd: 5000 });
const submitted = card("submitted", { name: "Eastside PTA Senior Award", amountMaxUsd: 500 });
const b = board({
  matched: [matched, renewable],
  submitted: [submitted],
  flagged: [{ scholarship: summary({ name: "Golden Future Scholars Award", amountMaxUsd: 10000 }), reason: SCAM_FLAG_TEXT.application_fee }],
  privateCount: 0,
  totals: { inPlayUsd: 7000, wonUsd: 0, dueThisMonth: 1 },
});

describe("BoardView", () => {
  it("shows the private-match count only in the student's view", () => {
    const { unmount } = render(<BoardView board={board({ privateCount: 2 })} readOnly={false} timeZone="America/Chicago" />);
    expect(screen.getByText("2 more matches use details you keep private")).toBeTruthy();
    unmount();
    render(<BoardView board={board({ privateCount: 2 })} readOnly timeZone="America/Chicago" />);
    expect(screen.queryByText("2 more matches use details you keep private")).toBeNull();
  });

  it("shows the columns, totals, and flagged listings with the reason", () => {
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    expect(screen.getByText("$7,000 in play · $0 won · 1 due this month · Scout looks for new matches every Sunday")).toBeTruthy();
    const col = screen.getByRole("region", { name: "Matched 3" });
    expect(within(col).getByText(SCAM_FLAG_TEXT.application_fee)).toBeTruthy();
    expect(within(col).getByText("Hidden from your plan")).toBeTruthy();
    expect(within(col).getByRole("link", { name: "Why flagged?" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Submitted 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Renewable" }));
    expect(screen.getByRole("region", { name: "Matched 1" })).toBeTruthy();
  });

  it("shows a retired or under-review listing as not available, with no link to its page (R2P-4)", () => {
    const gone = board({
      flagged: [{ scholarship: summary({ name: "Old Mill Award", slug: "old-mill" }), reason: "This listing was retired" }],
    });
    render(<BoardView board={gone} readOnly={false} timeZone="America/Chicago" />);
    const article = screen.getByRole("article", { name: "Old Mill Award (not available)" });
    expect(within(article).getByText("This listing was retired")).toBeTruthy();
    expect(within(article).getByText("Not available")).toBeTruthy();
    expect(within(article).queryByText("Flagged")).toBeNull();
    expect(within(article).queryByRole("link")).toBeNull();
  });

  it("saves a match to Working on", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(matched.application));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    const lone = screen.getByRole("article", { name: "Lone Star Credit Union Award" });
    fireEvent.click(within(lone).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/scholarship-applications/${matched.application.id}`,
      expect.objectContaining({ method: "PATCH", body: '{"stage":"planned"}' }),
    );
  });

  it("validates the won dialog before saving the amount and renewability", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(submitted.application));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    fireEvent.click(within(screen.getByRole("article", { name: "Eastside PTA Senior Award" })).getByRole("button", { name: "Mark won" }));
    const dialog = screen.getByRole("dialog", { name: "You won Eastside PTA Senior Award" });
    const amount = within(dialog).getByRole("textbox", { name: "Amount you won" });
    fireEvent.change(amount, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter the amount you won in whole dollars.");
    fireEvent.change(amount, { target: { value: "1,000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick one-time or renewable.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Renewable/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save win" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ stage: "won", outcomeUsd: 1000, outcomeRenewable: true });
  });

  it("adds a local scholarship with one request (the core puts it on the board)", async () => {
    const local = summary({ name: "Maple Rotary", unverified: true });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(local, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<BoardView board={b} readOnly={false} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Add a local scholarship" }));
    const dialog = screen.getByRole("dialog", { name: "Add a local scholarship" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Link to the listing" }), { target: { value: "maple.example.org" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Paste the full link, starting with https://");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Link to the listing" }), {
      target: { value: "https://maple.example.org/award" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Scholarship name" }), { target: { value: "Maple Rotary" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(within(dialog).getByText(/marked unverified until we check/)).toBeTruthy());
    expect(within(dialog).getByText(/Added to your board/)).toBeTruthy();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/scholarships/local"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      url: "https://maple.example.org/award",
      name: "Maple Rotary",
      notes: "",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("shows a student's own unpublished submission as amount unknown, not $0 (R3V-1)", () => {
    const draft = card("planned", { name: "Maple Rotary", status: "draft", unverified: true, amountMinUsd: 0, amountMaxUsd: 0, deadline: null });
    render(<BoardView board={board({ working: [draft] })} readOnly={false} timeZone="America/Chicago" />);
    const article = screen.getByRole("article", { name: "Maple Rotary" });
    expect(within(article).getByText("Amount not known yet")).toBeTruthy();
    expect(within(article).queryByText("$0")).toBeNull();
  });

  it("is read-only for parents", () => {
    render(<BoardView board={b} readOnly timeZone="America/Chicago" />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a local scholarship" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/BoardView`
Expected: FAIL with `Failed to resolve import "./BoardView"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/ScholarshipCard.tsx`:

```tsx
import { cx } from "@/lib/cx";
import { dateShort, daysLabel, instantShort, minutesLabel, usd } from "@/lib/format";
import { type Board, type BoardCard, SCAM_FLAG_TEXT } from "@scholarcrew/domain";
import { Badge, Button, Icon, Progress } from "@scholarcrew/ui";
import { type CardAction, cardActions, cardAmount } from "./board";
import styles from "./scholarships.module.css";

const SCAM_REASONS: ReadonlySet<string> = new Set(Object.values(SCAM_FLAG_TEXT));

export function ScholarshipCard({
  card,
  timeZone,
  readOnly,
  pending,
  onAction,
}: {
  card: BoardCard;
  timeZone: string;
  readOnly: boolean;
  pending: boolean;
  onAction: (action: CardAction) => void;
}) {
  const { scholarship: s, application: a } = card;
  const won = a.stage === "won";
  const days = card.daysUntilDeadline;
  const soon = days !== null && days >= 0 && days <= 14 && (a.stage === "matched" || a.stage === "planned" || a.stage === "drafting");
  let dateChip = null;
  if (won) dateChip = <Badge tone="good">Won</Badge>;
  else if (a.stage === "submitted" && a.submittedAt) dateChip = <span className={styles.date}>{`Sent ${instantShort(a.submittedAt, timeZone)}`}</span>;
  else if (s.deadline)
    dateChip = (
      <span className={cx(styles.date, soon && styles.dateWarn)}>
        {soon && days !== null ? `${dateShort(s.deadline)} · ${daysLabel(days)}` : dateShort(s.deadline)}
      </span>
    );
  const verified = s.verifiedAt && !s.unverified ? `Verified ${instantShort(s.verifiedAt, timeZone)}` : null;
  return (
    <article className={styles.card} aria-label={s.name}>
      <div className={styles.top}>
        <span className={styles.amount}>{cardAmount(card)}</span>
        {s.renewable && !won ? <Badge tone="navy">Renewable</Badge> : null}
        {dateChip}
      </div>
      <a className={styles.name} href={`/scholarships/${s.slug}`}>
        {s.name}
      </a>
      <p className={styles.meta}>
        {won
          ? a.outcomeRenewable
            ? "Renewable · counts every year you keep it"
            : "One-time · counts toward year 1"
          : `${s.localLabel} · ~${minutesLabel(s.estMinutes)}`}
      </p>
      {!won && card.reasons[0] ? <p className={styles.fits}>{`Fits: ${card.reasons[0].text}`}</p> : null}
      {card.progress !== null ? <Progress value={card.progress} label="Draft progress" /> : null}
      <div className={styles.foot}>
        {won ? (
          a.thankYouSent ? (
            <Badge tone="good">Thank-you note sent</Badge>
          ) : (
            <span className={styles.meta}>Send a thank-you note</span>
          )
        ) : card.reuseStoryTitle ? (
          <span className={styles.reuse}>
            <Icon name="reuse" />
            {card.reuseStoryTitle}
          </span>
        ) : (
          <span className={styles.meta}>New writing</span>
        )}
        {won ? null : verified ? <Badge tone="good">{verified}</Badge> : <Badge tone="neutral" icon="info">Unverified</Badge>}
      </div>
      {readOnly ? null : (
        <div className={styles.cardActions}>
          {cardActions(a).map((action, position) => (
            <Button
              key={action.key}
              size="sm"
              variant={position === 0 ? "soft" : "line"}
              disabled={pending}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * SC-06: flagged listings stay visible with the reason, struck through and out of the plan.
 * R2P-4: 07 also moves open cards on retired or under-review listings here (`RETIRED_TEXT`, `UNDER_REVIEW_TEXT`).
 * Their detail page 404s, so only a scam reason (`SCAM_FLAG_TEXT`) gets the "Flagged" badge and the link.
 */
export function FlaggedCard({ scholarship, reason }: Board["flagged"][number]) {
  const scam = SCAM_REASONS.has(reason);
  return (
    <article className={cx(styles.card, styles.flagged)} aria-label={`${scholarship.name} (${scam ? "flagged" : "not available"})`}>
      <div className={styles.top}>
        <span className={cx(styles.amount, styles.struck)}>{usd(scholarship.amountMaxUsd)}</span>
        <Badge tone={scam ? "crit" : "neutral"}>{scam ? "Flagged" : "Not available"}</Badge>
      </div>
      <span className={styles.name}>{scholarship.name}</span>
      <p className={styles.reason}>{reason}</p>
      <div className={styles.foot}>
        <span className={styles.meta}>Hidden from your plan</span>
        {scam ? <a href={`/scholarships/${scholarship.slug}`}>Why flagged?</a> : null}
      </div>
    </article>
  );
}
```

`apps/web/src/components/scholarships/WonModal.tsx`:

```tsx
"use client";

import { errorMessage } from "@/lib/api";
import type { ApplicationPatch, BoardCard } from "@scholarcrew/domain";
import { Button, Modal, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import { type WonChoice, parseWonInput } from "./board";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

/** SC-09. Render with key={card id} so the fields reset per card. */
export function WonModal({
  card,
  onClose,
  onSave,
}: {
  card: BoardCard | null;
  onClose: () => void;
  onSave: (patch: ApplicationPatch) => Promise<void>;
}) {
  const [amount, setAmount] = useState(card ? String(card.scholarship.amountMaxUsd) : "");
  const [choice, setChoice] = useState<WonChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = parseWonInput(amount, choice);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.patch);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={card !== null}
      title={card ? `You won ${card.scholarship.name}` : "Mark won"}
      onClose={onClose}
      footer={
        <>
          <Button variant="line" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Save win
          </Button>
        </>
      }
    >
      <div className={shared.form}>
        <TextInput label="Amount you won" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <fieldset className={styles.radios}>
          <legend>Is it renewable?</legend>
          <label>
            <input type="radio" name="won-renewable" checked={choice === "one_time"} onChange={() => setChoice("one_time")} />{" "}
            One-time
          </label>
          <label>
            <input type="radio" name="won-renewable" checked={choice === "renewable"} onChange={() => setChoice("renewable")} />{" "}
            Renewable (it pays again each year you qualify)
          </label>
        </fieldset>
        <p className={shared.muted}>Ledger subtracts the win from your gap and adds a thank-you note to your plan.</p>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
```

`apps/web/src/components/scholarships/AddLocalModal.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { ScholarshipSummary } from "@scholarcrew/domain";
import { Button, Modal, TextArea, TextInput } from "@scholarcrew/ui";
import { type FormEvent, useState } from "react";
import shared from "./shared.module.css";

/**
 * SC-07: submitted by URL, visible only to this student and labeled unverified until an admin publishes it.
 * One request (R2C-12): 07 `submitLocalScholarship` also puts the listing on the board as `planned`.
 */
export function AddLocalModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setError("Paste the full link, starting with https://");
    if (!name.trim()) return setError("Add the scholarship's name.");
    setSaving(true);
    setError(null);
    try {
      await api<ScholarshipSummary>("/scholarships/local", {
        body: { url: url.trim(), name: name.trim(), notes: notes.trim() },
      });
      setDone(true);
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add a local scholarship" onClose={onClose}>
      {done ? (
        <div className={shared.form}>
          <p>Added to your board. It's marked unverified until we check the listing.</p>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form className={shared.form} onSubmit={submit} noValidate>
          <TextInput label="Link to the listing" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextInput label="Scholarship name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          <TextArea label="Notes (optional)" value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} />
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="primary" type="submit" disabled={saving}>
            Add it
          </Button>
        </form>
      )}
    </Modal>
  );
}
```

Note: `type="url"` inputs still have the `textbox` role, so the test finds them by label.

`apps/web/src/components/scholarships/BoardView.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { ApplicationPatch, Board, BoardCard, ScholarshipApplication } from "@scholarcrew/domain";
import { Badge, Button, Chip, Kanban } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddLocalModal } from "./AddLocalModal";
import { BOARD_FILTERS, type BoardFilter, type CardAction, type ColumnKey, boardColumns, totalsLine } from "./board";
import { FlaggedCard, ScholarshipCard } from "./ScholarshipCard";
import { WonModal } from "./WonModal";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

const EMPTY: Record<ColumnKey, string> = {
  matched: "Scout adds new matches every Sunday.",
  working: "Save a match here, or ask Compass to plan your week.",
  submitted: "Nothing sent yet.",
  won: "Ledger subtracts every win from your gap automatically.",
  lostOrSkipped: "Nothing here.",
};

/** SC-03 board with filters; every change is a PATCH and a server refresh. */
export function BoardView({ board, readOnly, timeZone }: { board: Board; readOnly: boolean; timeZone: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [won, setWon] = useState<BoardCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(card: BoardCard, p: ApplicationPatch) {
    await api<ScholarshipApplication>(`/scholarship-applications/${card.application.id}`, { method: "PATCH", body: p });
    router.refresh();
  }

  async function onAction(card: BoardCard, action: CardAction) {
    if (action.patch === null) {
      setWon(card);
      return;
    }
    setPending(card.application.id);
    setError(null);
    try {
      await patch(card, action.patch);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const flagged = filter === "all" ? board.flagged : [];
  const columns = boardColumns(board, filter, showClosed).map((col) => ({
    key: col.key,
    title: col.title,
    count: col.cards.length + (col.key === "matched" ? flagged.length : 0),
    children: (
      <>
        {col.cards.map((c) => (
          <ScholarshipCard
            key={c.application.id}
            card={c}
            timeZone={timeZone}
            readOnly={readOnly}
            pending={pending === c.application.id}
            onAction={(action) => void onAction(c, action)}
          />
        ))}
        {col.key === "matched" ? flagged.map((f) => <FlaggedCard key={f.scholarship.id} {...f} />) : null}
        {col.cards.length === 0 || col.key === "won" ? <p className={styles.colNote}>{EMPTY[col.key]}</p> : null}
      </>
    ),
  }));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Scholarships</h1>
          <p className={shared.sub}>{totalsLine(board.totals)}</p>
          {!readOnly && board.privateCount > 0 ? <p className={shared.sub}>{`${board.privateCount} more matches use details you keep private`}</p> : null}
        </div>
        {readOnly ? null : (
          <div className={shared.actions}>
            <Button variant="line" icon="plus" onClick={() => setAdding(true)}>
              Add a local scholarship
            </Button>
            <Button variant="primary" icon="chat" href="/crew">
              Ask Scout
            </Button>
          </div>
        )}
      </div>
      <div className={styles.toolbar}>
        {BOARD_FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        <Chip active={showClosed} onClick={() => setShowClosed((v) => !v)}>
          Lost and skipped
        </Chip>
        <span className={styles.spacer} />
        <Badge tone="good">No-fee scholarships only</Badge>
      </div>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      <Kanban columns={columns} />
      {readOnly ? null : (
        <>
          <WonModal
            key={won?.application.id ?? "none"}
            card={won}
            onClose={() => setWon(null)}
            onSave={async (p) => {
              if (won) await patch(won, p);
              setWon(null);
            }}
          />
          <AddLocalModal open={adding} onClose={() => setAdding(false)} onAdded={() => router.refresh()} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 25 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/ScholarshipCard.tsx apps/web/src/components/scholarships/WonModal.tsx apps/web/src/components/scholarships/AddLocalModal.tsx apps/web/src/components/scholarships/BoardView.tsx apps/web/src/components/scholarships/BoardView.test.tsx
git commit -m "feat(web): scholarship board with won dialog and local submissions"
```

### Q6: Search results and the /scholarships page (SC-01, SC-03)

The top bar's search (plan 16 layout) submits `?q=` to `/scholarships`; results show above the board.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/SearchResults.test.tsx`:

```tsx
// @vitest-environment jsdom
import ScholarshipsPage from "@/app/(app)/scholarships/page";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchResults } from "./SearchResults";
import { board, summary } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
const pm = vi.hoisted(() => ({ requireAppActor: vi.fn(), getFamily: vi.fn(), getBoard: vi.fn(), searchScholarships: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships" }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: pm.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: pm.getFamily }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getBoard: pm.getBoard, searchScholarships: pm.searchScholarships }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = summary({ name: "Coding for Good Award", amountMaxUsd: 1000 });
const saved = summary({ name: "Hill Country STEM Award" });
const scam = summary({ name: "Golden Future", scamFlags: ["application_fee"] });

describe("SearchResults", () => {
  it("lists results, marks saved ones, explains flags, and saves on click", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SearchResults query="stem" results={{ items: [open, saved, scam], page: 1, pageSize: 20, total: 3 }} savedIds={[saved.id]} readOnly={false} />,
    );
    expect(screen.getByRole("heading", { name: '3 results for "stem"' })).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "Hill Country STEM Award" })).getByText("On your board")).toBeTruthy();
    expect(screen.getByText("Charges a fee to apply. Real scholarships don't charge you to apply.")).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "Golden Future" })).queryByRole("button")).toBeNull();
    fireEvent.click(within(screen.getByRole("listitem", { name: "Coding for Good Award" })).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/scholarship-applications");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ scholarshipId: open.id });
  });

  it("says when nothing matched", () => {
    render(<SearchResults query="zzz" results={{ items: [], page: 1, pageSize: 20, total: 0 }} savedIds={[]} readOnly />);
    expect(screen.getByText("No published scholarships match that search yet.")).toBeTruthy();
  });
});

describe("/scholarships search", () => {
  it("searches only listings still open on the student's today (R3V-2)", async () => {
    // 03:00 UTC on Oct 7 is still Oct 6 in Chicago, so a listing due Oct 6 is still open.
    pm.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: { user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" }, onboardingComplete: true },
      deps: { clock: { now: () => new Date("2026-10-07T03:00:00.000Z") } },
    });
    pm.getBoard.mockResolvedValue(board());
    pm.searchScholarships.mockResolvedValue({ items: [open], page: 1, pageSize: 20, total: 1 });
    render(await ScholarshipsPage({ searchParams: Promise.resolve({ q: "stem" }) }));
    expect(pm.searchScholarships.mock.calls[0]?.[2]).toEqual({ q: "stem", page: 1, pageSize: 20, openOn: "2026-10-06" });
    expect(screen.getByRole("heading", { name: '1 results for "stem"' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/SearchResults`
Expected: FAIL with `Failed to resolve import "./SearchResults"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/SearchResults.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, usd } from "@/lib/format";
import { type Page, SCAM_FLAG_TEXT, type ScholarshipSummary } from "@scholarcrew/domain";
import { Badge, Button, Card } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./scholarships.module.css";
import shared from "./shared.module.css";

/** SC-01: catalog search results; flagged listings show the reason and can't be saved. */
export function SearchResults({
  query,
  results,
  savedIds,
  readOnly,
}: {
  query: string;
  results: Page<ScholarshipSummary>;
  savedIds: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string) {
    setPending(id);
    setError(null);
    try {
      await api("/scholarship-applications", { body: { scholarshipId: id } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card title={`${results.total} results for "${query}"`} className={styles.results}>
      {results.items.length === 0 ? <p className={shared.muted}>No published scholarships match that search yet.</p> : null}
      <ul>
        {results.items.map((s) => {
          const flag = s.scamFlags[0];
          return (
            <li key={s.id} className={styles.result} aria-label={s.name}>
              <div>
                <a className={styles.name} href={`/scholarships/${s.slug}`}>
                  {s.name}
                </a>
                <p className={styles.meta}>
                  {[usd(s.amountMaxUsd), s.localLabel, s.deadline ? `due ${dateShort(s.deadline)}` : "no deadline listed"].join(" · ")}
                </p>
                {flag ? <p className={shared.error}>{SCAM_FLAG_TEXT[flag]}</p> : null}
              </div>
              {flag ? (
                <Badge tone="crit">Flagged</Badge>
              ) : savedIds.includes(s.id) ? (
                <Badge tone="good">On your board</Badge>
              ) : readOnly ? null : (
                <Button size="sm" variant="soft" disabled={pending !== null} onClick={() => void save(s.id)}>
                  Save
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/app/(app)/scholarships/page.tsx`:

```tsx
import { BoardView } from "@/components/scholarships/BoardView";
import { NotShared } from "@/components/scholarships/NotShared";
import { SearchResults } from "@/components/scholarships/SearchResults";
import { loadViewer, readShared, todayIn } from "@/components/scholarships/viewer";
import { getBoard, searchScholarships } from "@scholarcrew/core/scholarships";

export const dynamic = "force-dynamic";

export default async function ScholarshipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="scholarships" />;
  const board = await readShared(() => getBoard(v.deps, v.actor, studentId));
  if (!board) return <NotShared studentName={v.studentName} what="scholarships" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  // R3V-2: like 18's directory, closed listings never show (07 G2 `openOn`); "today" is the student's calendar day.
  const openOn = todayIn(v.deps.clock.now(), v.timeZone);
  const results = q ? await searchScholarships(v.deps, v.actor, { q, page: 1, pageSize: 20, openOn }) : null;
  const savedIds = [...board.matched, ...board.working, ...board.submitted, ...board.won, ...board.lostOrSkipped].map(
    (c) => c.scholarship.id,
  );
  return (
    <>
      {results ? <SearchResults query={q} results={results} savedIds={savedIds} readOnly={v.isParent} /> : null}
      <BoardView board={board} readOnly={v.isParent} timeZone={v.timeZone} />
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 5 files, 28 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/SearchResults.tsx apps/web/src/components/scholarships/SearchResults.test.tsx "apps/web/src/app/(app)/scholarships/page.tsx"
git commit -m "feat(web): scholarships page with catalog search and the board"
```

### Q7: Detail model, report dialog, and detail actions (SC-04, SC-08, ES-01 start)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/detail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailActions, StartEssayButton } from "./DetailActions";
import { ReportModal } from "./ReportModal";
import { amountLabel, areaLabel, ruleText, sourceBadges } from "./detail";
import { application } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/scholarships/rotary" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const ID = "44444444-4444-4444-8444-444444444444";

describe("detail helpers", () => {
  it("describes listing rules in plain words", () => {
    expect(ruleText({ type: "county_in", state: "TX", counties: ["Maple"] })).toBe("Lives in Maple County, TX");
    expect(ruleText({ type: "class_year_in", years: [2027] })).toBe("Class of 2027");
    expect(ruleText({ type: "gpa_min", min: 3 })).toBe("GPA of 3.0 or higher");
    expect(ruleText({ type: "test_min", test: "ACT", min: 24 })).toBe("ACT of 24 or higher");
    expect(ruleText({ type: "first_gen" })).toBe("First in your family to go to college");
    expect(ruleText({ type: "custom", text: "Not related to a club member" })).toBe("Not related to a club member");
  });

  it("labels the area, amount, and source state", () => {
    expect(areaLabel({ national: false, state: "TX", counties: ["Maple"], cities: [] })).toBe("Local · Maple County, TX");
    expect(areaLabel({ national: true, state: null, counties: [], cities: [] })).toBe("National");
    expect(amountLabel(500, 2500)).toBe("$500–$2,500");
    expect(amountLabel(2500, 2500)).toBe("$2,500");
    const base = { verifiedAt: "2026-10-02T15:00:00.000Z", stale: false, scamFlags: [], status: "published" as const };
    expect(sourceBadges(base, "America/Chicago")).toEqual([{ tone: "good", label: "Verified Oct 2" }]);
    expect(sourceBadges({ ...base, stale: true, scamFlags: ["application_fee"] }, "America/Chicago")).toEqual([
      { tone: "warn", label: "Stale · re-checking" },
      { tone: "crit", label: "Flagged" },
    ]);
    expect(sourceBadges({ ...base, verifiedAt: null, status: "draft" }, "America/Chicago")).toEqual([
      { tone: "neutral", label: "Unverified" },
    ]);
  });
});

describe("ReportModal", () => {
  it("needs a reason, then sends the report", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportModal scholarshipId={ID} open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Report a problem" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Pick what's wrong.");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "What's wrong?" }), { target: { value: "wrong_deadline" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Details (optional)" }), { target: { value: "It says Nov 1 now" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(within(dialog).getByText("Thanks. An admin will check this listing.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/scholarships/${ID}/report`);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ reason: "wrong_deadline", details: "It says Nov 1 now" });
  });
});

describe("detail actions", () => {
  it("saves an unsaved listing and marks a draft submitted", async () => {
    // 14 answers the POST with 201 and the PATCH with 200 (R3A-20).
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({}, init?.method === "POST" ? 201 : 200));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<DetailActions scholarshipId={ID} application={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to my board" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ scholarshipId: ID });
    const app = application({ stage: "drafting" });
    rerender(<DetailActions scholarshipId={ID} application={app} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark submitted" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/scholarship-applications/${app.id}`);
  });

  it("starts an essay for a prompt and moves the card to drafting", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/v1/essays" ? json({ id: "e1" }, 201) : json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = application({ stage: "planned" });
    render(
      <StartEssayButton
        scholarshipId={ID}
        title="Rotary Club of Eastside essay"
        prompt="Describe a time you used your skills to serve your community."
        wordLimit={500}
        application={app}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/e1"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Rotary Club of Eastside essay",
      prompt: "Describe a time you used your skills to serve your community.",
      wordLimit: 500,
      targetType: "scholarship",
      targetScholarshipId: ID,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ stage: "drafting" });
  });

  it("cuts a long generated title to EssayInput's 200 characters (R3V-15, R3A-19)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === "/api/v1/essays" ? json({ id: "e2" }, 201) : json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const name = "N".repeat(200);
    render(<StartEssayButton scholarshipId={ID} title={`${name} essay 2`} prompt="Tell us about a goal." wordLimit={null} application={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/e2"));
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { title: string };
    expect(sent.title).toHaveLength(200);
    expect(sent.title.startsWith(name)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/detail`
Expected: FAIL with `Failed to resolve import "./DetailActions"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/scholarships/detail.ts`:

```ts
import { instantShort, usd } from "@/lib/format";
import {
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
  type CatalogStatus,
  type EligibilityRule,
  INCOME_RANGE_LABELS,
  type LocalArea,
  type ReportReason,
  type ScamFlag,
} from "@scholarcrew/domain";
import type { BadgeTone } from "@scholarcrew/ui";

const county = (name: string) => (/county$/i.test(name.trim()) ? name.trim() : `${name.trim()} County`);

/** SC-04: one plain sentence per listing rule. */
export function ruleText(rule: EligibilityRule): string {
  switch (rule.type) {
    case "state_in":
      return `Lives in ${rule.states.join(" or ")}`;
    case "county_in":
      return `Lives in ${rule.counties.map(county).join(" or ")}, ${rule.state}`;
    case "city_in":
      return `Lives in ${rule.cities.join(" or ")}, ${rule.state}`;
    case "class_year_in":
      return `Class of ${rule.years.join(" or ")}`;
    case "gpa_min":
      return `GPA of ${rule.min.toFixed(1)} or higher`;
    case "major_any":
      return `Plans to study ${rule.majors.join(", ")}`;
    case "interest_any":
      return `Interested in ${rule.interests.join(", ")}`;
    case "first_gen":
      return "First in your family to go to college";
    case "income_max":
      return `Household income up to ${INCOME_RANGE_LABELS[rule.maxRange]}`;
    case "heritage_any":
      return `Heritage: ${rule.values.join(", ")}`;
    case "disability":
      return "Students with a disability";
    case "religion_any":
      return `Faith community: ${rule.values.join(", ")}`;
    case "military_family":
      return "From a military family";
    case "foster_care":
      return "Has been in foster care";
    case "citizenship_required":
      return "U.S. citizen or eligible noncitizen";
    case "test_min":
      return `${rule.test} of ${rule.min} or higher`;
    case "service_hours_min":
      return `${rule.hours}+ service hours`;
    case "custom":
      return rule.text;
  }
}

export function areaLabel(area: LocalArea): string {
  if (area.national) return "National";
  const state = area.state ?? "";
  if (area.counties.length > 0) return `Local · ${area.counties.map(county).join(", ")}, ${state}`;
  if (area.cities.length > 0) return `Local · ${area.cities.join(", ")}, ${state}`;
  return state ? `Statewide · ${state}` : "Local";
}

export function amountLabel(minUsd: number, maxUsd: number): string {
  return minUsd > 0 && minUsd < maxUsd ? `${usd(minUsd)}–${usd(maxUsd)}` : usd(maxUsd);
}

/** R3V-8: the 02 map, so the student, helper, and admin screens use the same words. */
export const STAGE_LABEL: Record<ApplicationStage, string> = APPLICATION_STAGE_LABELS;

/** R3V-8: a null deadline means nobody has read one yet, so it isn't "Rolling" (same text as 18 R4 `deadlineLabel`). */
export const NO_DEADLINE = "Not posted";

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "wrong_deadline", label: "The deadline is wrong" },
  { value: "dead_link", label: "The link doesn't work" },
  { value: "wrong_amount", label: "The amount is wrong" },
  { value: "scam", label: "It looks like a scam" },
  { value: "other", label: "Something else" },
];

/** SC-04 labels: verified with its date, stale, unverified, flagged. */
export function sourceBadges(
  d: { verifiedAt: string | null; stale: boolean; scamFlags: ScamFlag[]; status: CatalogStatus },
  timeZone: string,
): Array<{ tone: BadgeTone; label: string }> {
  const out: Array<{ tone: BadgeTone; label: string }> = [];
  if (d.stale) out.push({ tone: "warn", label: "Stale · re-checking" });
  else if (d.verifiedAt && d.status !== "draft") out.push({ tone: "good", label: `Verified ${instantShort(d.verifiedAt, timeZone)}` });
  else out.push({ tone: "neutral", label: "Unverified" });
  if (d.scamFlags.length > 0) out.push({ tone: "crit", label: "Flagged" });
  return out;
}
```

`apps/web/src/components/scholarships/ReportModal.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { Button, Modal, Select, TextArea } from "@scholarcrew/ui";
import { useState } from "react";
import { REPORT_REASONS } from "./detail";
import shared from "./shared.module.css";

/** SC-08: reports become admin tasks. */
export function ReportModal({ scholarshipId, open, onClose }: { scholarshipId: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!reason) return setError("Pick what's wrong.");
    setSending(true);
    setError(null);
    try {
      await api(`/scholarships/${scholarshipId}/report`, { body: { reason, details: details.trim() } });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Report a problem"
      onClose={onClose}
      footer={
        sent ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" disabled={sending} onClick={() => void send()}>
            Send report
          </Button>
        )
      }
    >
      {sent ? (
        <p>Thanks. An admin will check this listing.</p>
      ) : (
        <div className={shared.form}>
          <Select
            label="What's wrong?"
            placeholder="Pick a reason"
            options={REPORT_REASONS}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <TextArea label="Details (optional)" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
```

`apps/web/src/components/scholarships/DetailActions.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Essay, ScholarshipApplication } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportModal } from "./ReportModal";
import shared from "./shared.module.css";

const OPEN_STAGES = ["matched", "planned", "drafting"];

/** Header actions: save, mark submitted, report. Parents only get Report. */
export function DetailActions({
  scholarshipId,
  application,
  readOnly,
}: {
  scholarshipId: string;
  application: Pick<ScholarshipApplication, "id" | "stage"> | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await call();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shared.actions}>
      {readOnly ? null : application === null ? (
        <Button variant="primary" icon="bookmark" disabled={busy} onClick={() => void run(() => api("/scholarship-applications", { body: { scholarshipId } }))}>
          Save to my board
        </Button>
      ) : OPEN_STAGES.includes(application.stage) ? (
        <Button
          variant="line"
          disabled={busy}
          onClick={() =>
            void run(() => api(`/scholarship-applications/${application.id}`, { method: "PATCH", body: { stage: "submitted" } }))
          }
        >
          Mark submitted
        </Button>
      ) : null}
      <Button variant="line" icon="alert" onClick={() => setReporting(true)}>
        Report a problem
      </Button>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      <ReportModal scholarshipId={scholarshipId} open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

/** Creates an essay bound to this prompt, moves a saved card to drafting, and opens Essay Studio. */
export function StartEssayButton({
  scholarshipId,
  title,
  prompt,
  wordLimit,
  application,
}: {
  scholarshipId: string;
  title: string;
  prompt: string;
  wordLimit: number | null;
  application: Pick<ScholarshipApplication, "id" | "stage"> | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      // R3V-15/R3A-19: a 200-character listing name plus " essay 2" would fail EssayInput.title's max(200).
      const essay = await api<Essay>("/essays", {
        body: { title: title.slice(0, 200), prompt, wordLimit, targetType: "scholarship", targetScholarshipId: scholarshipId },
      });
      if (application && (application.stage === "matched" || application.stage === "planned")) {
        await api(`/scholarship-applications/${application.id}`, { method: "PATCH", body: { stage: "drafting" } });
      }
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="pen" disabled={busy} onClick={() => void start()}>
        Start essay
      </Button>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/detail && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/detail.ts apps/web/src/components/scholarships/ReportModal.tsx apps/web/src/components/scholarships/DetailActions.tsx apps/web/src/components/scholarships/detail.test.tsx
git commit -m "feat(web): scholarship detail helpers, report dialog, and actions"
```

### Q8: Scholarship detail page (SC-02, SC-04, SC-06, SC-08, CR-08)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/scholarships/DetailPage.test.tsx` (renders the async server component with services mocked):

```tsx
// @vitest-environment jsdom
import DetailPage from "@/app/(app)/scholarships/[slug]/page";
import type { ScholarshipDetail } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application, board, card } from "./fixtures";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getScholarship: vi.fn(),
  getBoard: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getScholarship: m.getScholarship, getBoard: m.getBoard }));
vi.mock("@scholarcrew/core/crew", () => ({ listConversations: m.listConversations, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/scholarships/rotary",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
const sensitive = { code: "first_gen", text: "you're first in your family to go to college", sensitive: true };
const county = { code: "county", text: "you live in Maple County", sensitive: false };
const app = application({ stage: "drafting", matchReasons: [county, sensitive] });
const detail: ScholarshipDetail = {
  id: app.scholarshipId,
  slug: "rotary",
  name: "Rotary Club of Eastside Scholarship",
  provider: "Rotary Club of Eastside",
  url: "https://eastsiderotary.example.org/scholarship",
  sourceUrl: "https://eastsiderotary.example.org/scholarship",
  amountMinUsd: 2500,
  amountMaxUsd: 2500,
  renewable: false,
  renewalTerms: "",
  deadline: "2026-10-30",
  cycle: "2026-27",
  localArea: { national: false, state: "TX", counties: ["Maple"], cities: [] },
  eligibility: [{ type: "gpa_min", min: 3 }],
  requirements: {
    essays: [{ prompt: "Describe a time you used your skills to serve your community.", wordLimit: 500 }],
    recommendations: 0,
    transcript: true,
    serviceHours: null,
    other: ["Online form"],
  },
  status: "published",
  visibility: "public",
  submittedById: null,
  scamFlags: [],
  estMinutes: 45,
  verifiedAt: "2026-10-02T15:00:00.000Z",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-10-02T15:00:00.000Z",
  application: app,
  stale: false,
};
const me = (role: "student" | "parent") => ({
  user: { id: role === "student" ? "s1" : "p1", displayName: role === "student" ? "Maya Rivera" : "Dana Rivera", role, timeZone: "America/Chicago" },
  onboardingComplete: true,
});

describe("scholarship detail page", () => {
  it("shows the listing, every match reason, the essay prompt, and the crew room to the student", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: "s1", role: "student" }, me: me("student"), deps });
    m.getScholarship.mockResolvedValue(detail);
    m.listConversations.mockResolvedValue([]);
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Rotary Club of Eastside Scholarship" })).toBeTruthy();
    expect(screen.getByText("Local · Maple County, TX · from Rotary Club of Eastside")).toBeTruthy();
    expect(screen.getByText("Fri, Oct 30")).toBeTruthy();
    expect(screen.getByText("24 days left")).toBeTruthy();
    expect(screen.getByText("GPA of 3.0 or higher")).toBeTruthy();
    expect(screen.queryByText("you're first in your family to go to college")).toBeNull();
    expect(screen.getByRole("button", { name: "Start essay" })).toBeTruthy();
    expect(screen.getByText("Crew room · this scholarship")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask your crew here" })).toBeTruthy();
    expect(screen.getByText("Verified Oct 2")).toBeTruthy();
  });

  it("opens from a renewal reminder's slug link and shows the renewal terms and the open room (SC-11, D44)", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: "s1", role: "student" }, me: me("student"), deps });
    const won = { ...detail, renewable: true, renewalTerms: "Keep a 3.0 GPA and stay enrolled full time", application: { ...app, stage: "won" as const } };
    m.getScholarship.mockResolvedValue(won);
    const room = {
      id: "22222222-2222-4222-8222-222222222222",
      room: "scholarship" as const,
      roomRefId: detail.id,
      familyId: null,
      title: detail.name,
      createdAt: "2026-10-01T15:00:00.000Z",
      expiresAt: null,
      lastMessageAt: null,
    };
    m.listConversations.mockResolvedValue([{ ...room, id: "33333333-3333-4333-8333-333333333333", roomRefId: "someone-else" }, room]);
    m.getMessages.mockResolvedValue([]);
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(m.getScholarship.mock.calls[0]?.[2]).toBe("rotary");
    expect(screen.getByText("Renewable · Keep a 3.0 GPA and stay enrolled full time")).toBeTruthy();
    expect(screen.getByText("You won this. We'll remind you 30 days before each renewal date.")).toBeTruthy();
    expect(m.getMessages.mock.calls[0]?.[2]).toBe(room.id);
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
  });

  it("shows parents the reasons the core returns, and no editing or crew room", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: "p1", role: "parent" }, me: me("parent"), deps });
    m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
    m.getScholarship.mockResolvedValue({ ...detail, application: null });
    // R4Z-4: parent fixtures contain only non-private listings, regardless of sensitive grants.
    const c = card("drafting", { id: detail.id }, { reasons: [county] });
    m.getBoard.mockResolvedValue(board({ working: [c] }));
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(m.getBoard.mock.calls[0]?.[2]).toBe("s1");
    expect(screen.getByText("you live in Maple County")).toBeTruthy();
    expect(screen.queryByText("you're first in your family to go to college")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    expect(screen.queryByText("Crew room · this scholarship")).toBeNull();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy();
    expect(m.listConversations).not.toHaveBeenCalled();
  });

  it("tells a saved card with no reasons that nothing matches yet, and an unsaved listing to save it (R2P-3)", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: "s1", role: "student" }, me: me("student"), deps });
    m.listConversations.mockResolvedValue([]);
    m.getScholarship.mockResolvedValue({ ...detail, application: { ...app, stage: "planned" as const, matchReasons: [] } });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("You don't match any listed rule yet.")).toBeTruthy();
    expect(screen.queryByText("Save it to see how you match.")).toBeNull();
    cleanup();
    m.getScholarship.mockResolvedValue({ ...detail, application: null });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("Save it to see how you match.")).toBeTruthy();
  });

  it("shows a draft's amount as unknown and a missing deadline as not posted (R3V-1, R3V-8)", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: "s1", role: "student" }, me: me("student"), deps });
    m.listConversations.mockResolvedValue([]);
    m.getScholarship.mockResolvedValue({
      ...detail,
      status: "draft" as const,
      visibility: "submitter_only" as const,
      submittedById: "s1",
      amountMinUsd: 0,
      amountMaxUsd: 0,
      deadline: null,
      verifiedAt: null,
      application: { ...app, stage: "planned" as const },
    });
    render(await DetailPage({ params: Promise.resolve({ slug: "rotary" }) }));
    expect(screen.getByText("Amount not known yet")).toBeTruthy();
    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.getByText("Not posted")).toBeTruthy();
    expect(screen.getByText("Check the sponsor's page")).toBeTruthy();
    expect(screen.queryByText("Rolling")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/DetailPage`
Expected: FAIL with `Failed to resolve import "@/app/(app)/scholarships/[slug]/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/(app)/scholarships/[slug]/page.tsx`:

```tsx
import { safeHref } from "@/lib/format";
import { ContextCrew } from "@/components/scholarships/ContextCrew";
import { DetailActions, StartEssayButton } from "@/components/scholarships/DetailActions";
import { UNKNOWN_AMOUNT } from "@/components/scholarships/board";
import { NO_DEADLINE, STAGE_LABEL, amountLabel, areaLabel, ruleText, sourceBadges } from "@/components/scholarships/detail";
import styles from "@/components/scholarships/scholarships.module.css";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { dateWithWeekday, daysLabel, minutesLabel, plural } from "@/lib/format";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getBoard, getScholarship } from "@scholarcrew/core/scholarships";
import {
  type Board,
  type Conversation,
  type MatchReason,
  type Message,
  SCAM_FLAG_TEXT,
  type ScholarshipApplication,
} from "@scholarcrew/domain";
import { daysUntil } from "@scholarcrew/engines";
import { Badge, Card, Icon } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function allCards(b: Board) {
  return [...b.matched, ...b.working, ...b.submitted, ...b.won, ...b.lostOrSkipped];
}

function deadlineSub(days: number | null): string {
  // Same pair as 18 R4 `deadlineLabel`: "Not posted" over "Check the sponsor's page" (R3V-8).
  if (days === null) return "Check the sponsor's page";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  return `${daysLabel(days)} left`;
}

/** `slug` may be a slug or an id: renewal reminders (12, SC-11) link to `/scholarships/<slug>`, and `getScholarship` takes either. */
export default async function ScholarshipDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadViewer();
  const detail = await readShared(() => getScholarship(v.deps, v.actor, slug));
  if (!detail) notFound();

  let application: ScholarshipApplication | null = detail.application;
  let reasons: MatchReason[] = detail.application?.matchReasons ?? [];
  const studentId = v.studentId;
  if (v.isParent) {
    const b = studentId ? await readShared(() => getBoard(v.deps, v.actor, studentId)) : null;
    const found = b ? allCards(b).find((c) => c.scholarship.id === detail.id) : undefined;
    application = found?.application ?? null;
    // R4Z-4: core excludes all private matches from the parent view.
    reasons = found?.reasons ?? [];
  }

  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const existing =
      (await listConversations(v.deps, v.actor)).find((c) => c.room === "scholarship" && c.roomRefId === detail.id) ?? null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }
  const renewalNote = application?.stage === "won" && detail.renewable && !v.isParent;

  const days = detail.deadline ? daysUntil(detail.deadline, v.deps.clock.now(), v.timeZone) : null;
  const req = detail.requirements;
  const sendList = [
    ...req.essays.map((e, i) => ({ key: `essay-${i}`, label: "Essay", note: e.wordLimit ? `${e.wordLimit} words max` : "No word limit" })),
    ...(req.transcript ? [{ key: "transcript", label: "Transcript", note: "" }] : []),
    ...(req.recommendations > 0 ? [{ key: "recs", label: plural(req.recommendations, "recommendation letter"), note: "" }] : []),
    ...(req.serviceHours ? [{ key: "hours", label: `${req.serviceHours} service hours`, note: "" }] : []),
    ...req.other.map((o, i) => ({ key: `other-${i}`, label: o, note: "" })),
  ];

  return (
    <>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <a href="/scholarships">Scholarships</a>
        <span>›</span>
        <span>{application ? STAGE_LABEL[application.stage] : "Catalog"}</span>
      </nav>
      <div className={shared.head}>
        <div>
          <h1>{detail.name}</h1>
          <p className={shared.sub}>{`${areaLabel(detail.localArea)} · from ${detail.provider}`}</p>
        </div>
        <DetailActions scholarshipId={detail.id} application={application} readOnly={v.isParent} />
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <section className={styles.stats} aria-label="At a glance">
            <div className={styles.stat}>
              <div className={styles.statLabel}>Amount</div>
              <div className={styles.statValue}>
                {detail.status === "draft" ? UNKNOWN_AMOUNT : amountLabel(detail.amountMinUsd, detail.amountMaxUsd)}
              </div>
              <div className={shared.muted}>
                {detail.renewable ? `Renewable · ${detail.renewalTerms || "see terms"}` : "One-time · not renewable"}
              </div>
              {renewalNote ? <div className={shared.muted}>You won this. We'll remind you 30 days before each renewal date.</div> : null}
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Deadline</div>
              <div className={styles.statValue}>{detail.deadline ? dateWithWeekday(detail.deadline) : NO_DEADLINE}</div>
              <div className={shared.muted}>{deadlineSub(days)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Your time</div>
              <div className={styles.statValue}>{`~${minutesLabel(detail.estMinutes)}`}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Stage</div>
              <div className={styles.statValue}>{application ? STAGE_LABEL[application.stage] : "Not saved"}</div>
            </div>
          </section>
          <Card title="What to send">
            <ul className={styles.list}>
              {sendList.map((item) => (
                <li key={item.key}>
                  <b>{item.label}</b>
                  <span className={shared.muted}>{item.note}</span>
                </li>
              ))}
            </ul>
            {req.recommendations === 0 ? <p className={shared.muted}>No recommendation letters.</p> : null}
          </Card>
          {req.essays.map((e, i) => (
            <Card key={e.prompt} title={req.essays.length > 1 ? `Essay prompt ${i + 1}` : "Essay prompt"}>
              <p className={styles.prompt}>{e.prompt}</p>
              <p className={shared.muted}>{e.wordLimit ? `${e.wordLimit} words max` : "No word limit"}</p>
              {v.isParent ? null : (
                <StartEssayButton
                  scholarshipId={detail.id}
                  title={req.essays.length > 1 ? `${detail.name} essay ${i + 1}` : `${detail.name} essay`}
                  prompt={e.prompt}
                  wordLimit={e.wordLimit}
                  application={application}
                />
              )}
            </Card>
          ))}
          <Card title="Who can apply · why you match">
            <h3 className={shared.muted}>The listing says</h3>
            <ul className={styles.list}>
              {detail.eligibility.map((rule) => (
                <li key={ruleText(rule)}>{ruleText(rule)}</li>
              ))}
            </ul>
            <h3 className={shared.muted}>Why you match</h3>
            {reasons.length === 0 ? (
              <p className={shared.muted}>{application ? "You don't match any listed rule yet." : "Save it to see how you match."}</p>
            ) : (
              <ul className={styles.list}>
                {reasons.map((r) => (
                  <li key={r.code}>
                    <span>
                      <Icon name="check" /> {r.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Source">
            <div className={styles.source}>
              {sourceBadges(detail, v.timeZone).map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
              {safeHref(detail.sourceUrl) ? <a href={safeHref(detail.sourceUrl)!} target="_blank" rel="noopener noreferrer">
                {detail.sourceUrl.replace(/^https?:\/\//, "")} <Icon name="ext" />
              </a> : null}
            </div>
            {detail.scamFlags.map((f) => (
              <p key={f} className={shared.error}>
                {SCAM_FLAG_TEXT[f]}
              </p>
            ))}
            <p className={shared.muted}>
              Verified: matches its source as of the date shown. Stale: changed or 30+ days old, being re-checked.
              Unverified: not reviewed yet. Flagged: fee or scam signs, hidden from your plan.
            </p>
          </Card>
        </div>
        {room ? (
          <ContextCrew
            room="scholarship"
            refId={detail.id}
            title={detail.name}
            lead="scout"
            placeholder="Ask about this scholarship…"
            chips={[
              { role: "quill", text: "@Quill check my outline" },
              { role: "ledger", text: "@Ledger what if I win?" },
            ]}
            timeZone={v.timeZone}
            conversation={room.conversation}
            messages={room.messages}
          />
        ) : null}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 7 files, 39 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/scholarships/[slug]/page.tsx" apps/web/src/components/scholarships/DetailPage.test.tsx
git commit -m "feat(web): scholarship detail with match reasons, sources, and the crew room"
```

### Q9: Essay text helpers: limits, quote anchors, story match (ES-03, ES-04, ES-06)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/text.test.ts`:

```ts
import type { Story } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { essayStats, findOccurrence, highlightSegments, limitBadge, rankStories, stem } from "./text";

describe("essayStats and limitBadge", () => {
  it("counts against the word limit and warns at 90% and over 100%", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(essayStats(words(142), 500, null)).toMatchObject({ count: 142, limit: 500, unit: "words", state: "ok", label: "142 / 500 words" });
    expect(limitBadge(essayStats(words(142), 500, null))).toBeNull();
    expect(limitBadge(essayStats(words(450), 500, null))).toEqual({ tone: "warn", text: "50 words left" });
    expect(limitBadge(essayStats(words(503), 500, null))).toEqual({ tone: "crit", text: "3 over" });
  });

  it("falls back to characters (code points) and to no limit", () => {
    expect(essayStats("héllo 👋", null, 10)).toMatchObject({ count: 7, unit: "characters", label: "7 / 10 characters" });
    expect(essayStats("one two", null, null)).toMatchObject({ count: 2, limit: null, state: "ok", label: "2 words" });
    expect(essayStats("", 500, null).count).toBe(0);
  });
});

describe("quote anchors", () => {
  const body = "The first night, 30 kids came. The first night was loud. By May, kids built sensors.";

  it("finds the nth occurrence", () => {
    expect(findOccurrence(body, "The first night", 1)).toBe(0);
    expect(findOccurrence(body, "The first night", 2)).toBe(31);
    expect(findOccurrence(body, "The first night", 3)).toBe(-1);
    expect(findOccurrence(body, "", 1)).toBe(-1);
  });

  it("splits the body into numbered highlights in comment order and reports quotes it can't place", () => {
    const { segments, unplaced } = highlightSegments(body, [
      { id: "a", quote: "The first night", occurrence: 2 },
      { id: "b", quote: "kids built sensors", occurrence: 1 },
      { id: "c", quote: "no longer in the draft", occurrence: 1 },
      { id: "d", quote: "first night was", occurrence: 1 },
    ]);
    expect(segments).toEqual([
      { text: "The first night, 30 kids came. ", n: null, id: null, start: 0 },
      { text: "The first night", n: 1, id: "a", start: 31 },
      { text: " was loud. By May, ", n: null, id: null, start: 46 },
      { text: "kids built sensors", n: 2, id: "b", start: 65 },
      { text: ".", n: null, id: null, start: 83 },
    ]);
    expect(unplaced).toEqual(["c", "d"]);
  });

  it("returns the whole body when there are no comments", () => {
    expect(highlightSegments("Hi.", []).segments).toEqual([{ text: "Hi.", n: null, id: null, start: 0 }]);
  });
});

describe("rankStories", () => {
  const story = (o: Partial<Story>): Story => ({
    id: "00000000-0000-4000-8000-000000000001",
    title: "Story",
    moment: "",
    themes: [],
    evidence: "",
    summary: "",
    createdAt: "2026-09-01T15:00:00.000Z",
    updatedAt: "2026-09-01T15:00:00.000Z",
    archivedAt: null,
    uses: [],
    ...o,
  });
  const robotics = story({ id: "r", title: "Robotics → library STEM nights", themes: ["service", "teaching", "leadership"] });
  const clinic = story({ id: "c", title: "Translating at the clinic", themes: ["family", "community", "care"] });
  const bakery = story({ id: "b", title: "Night shift at the bakery", themes: ["work", "responsibility"] });
  const archived = story({ id: "x", title: "Old", themes: ["service"], archivedAt: "2026-09-02T15:00:00.000Z" });

  it("stems simple word endings", () => {
    expect(stem("service")).toBe(stem("serve"));
    expect(stem("teaching")).toBe("teach");
    expect(stem("is")).toBe("is");
  });

  it("ranks unarchived stories by theme overlap with the prompt, then by title", () => {
    const ranked = rankStories("Describe a time you used your skills to serve your community.", [bakery, clinic, robotics, archived]);
    expect(ranked.map((r) => [r.story.id, r.matched])).toEqual([
      ["r", ["service"]],
      ["c", ["community"]],
    ]);
  });

  it("breaks ties by fewer prior uses", () => {
    const used = { ...robotics, id: "r2", uses: [{ essayId: "e", essayTitle: "E", collegeId: null, scholarshipId: null, usedAt: "2026-09-03T15:00:00.000Z" }] };
    const ranked = rankStories("Tell us about service.", [used, robotics]);
    expect(ranked.map((r) => r.story.id)).toEqual(["r", "r2"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/text`
Expected: FAIL with `Failed to resolve import "./text" from "src/components/essays/text.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/text.ts`:

```ts
import type { Story } from "@scholarcrew/domain";
import { countChars, countWords, limitState } from "@scholarcrew/engines";
import type { BadgeTone } from "@scholarcrew/ui";

export interface EssayStats {
  count: number;
  limit: number | null;
  unit: "words" | "characters";
  state: "ok" | "near" | "over";
  label: string;
}

/** ES-03: counts follow the target's limit (words first, then characters). */
export function essayStats(body: string, wordLimit: number | null, charLimit: number | null): EssayStats {
  const unit = wordLimit === null && charLimit !== null ? "characters" : "words";
  const limit = unit === "words" ? wordLimit : charLimit;
  const count = unit === "words" ? countWords(body) : countChars(body);
  return {
    count,
    limit,
    unit,
    state: limitState(count, limit),
    label: limit === null ? `${count} ${unit}` : `${count} / ${limit} ${unit}`,
  };
}

export function limitBadge(s: EssayStats): { tone: BadgeTone; text: string } | null {
  if (s.limit === null || s.state === "ok") return null;
  if (s.state === "near") return { tone: "warn", text: `${s.limit - s.count} ${s.unit} left` };
  return { tone: "crit", text: `${s.count - s.limit} over` };
}

/** Index of the nth (1-based) occurrence of `quote`, or -1. */
export function findOccurrence(text: string, quote: string, n: number): number {
  if (!quote || n < 1) return -1;
  let from = 0;
  for (let seen = 1; ; seen += 1) {
    const at = text.indexOf(quote, from);
    if (at === -1) return -1;
    if (seen === n) return at;
    from = at + 1;
  }
}

export interface Segment {
  text: string;
  /** 1-based marker number (the comment's position in the list), null for plain text. */
  n: number | null;
  id: string | null;
  /** Offset of the segment in the body; unique per segment, so it's the React key (no index keys). */
  start: number;
}

/** ES-04: highlights each comment's exact quote; overlapping or missing quotes come back as `unplaced`. */
export function highlightSegments(
  body: string,
  comments: Array<{ id: string; quote: string; occurrence: number }>,
): { segments: Segment[]; unplaced: string[] } {
  const found: Array<{ start: number; end: number; n: number; id: string }> = [];
  const unplaced: string[] = [];
  for (const [index, c] of comments.entries()) {
    const start = findOccurrence(body, c.quote, c.occurrence);
    if (start === -1) unplaced.push(c.id);
    else found.push({ start, end: start + c.quote.length, n: index + 1, id: c.id });
  }
  found.sort((a, b) => a.start - b.start || a.n - b.n);
  const placed: typeof found = [];
  for (const f of found) {
    const last = placed.at(-1);
    if (last && f.start < last.end) unplaced.push(f.id);
    else placed.push(f);
  }
  const segments: Segment[] = [];
  let at = 0;
  for (const p of placed) {
    if (p.start > at) segments.push({ text: body.slice(at, p.start), n: null, id: null, start: at });
    segments.push({ text: body.slice(p.start, p.end), n: p.n, id: p.id, start: p.start });
    at = p.end;
  }
  if (at < body.length || segments.length === 0) segments.push({ text: body.slice(at), n: null, id: null, start: at });
  const order = new Map(comments.map((c, i) => [c.id, i]));
  unplaced.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { segments, unplaced };
}

/** Drops one common ending so "serve" and "service" meet. Short words are kept as is. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  const s = w.replace(/(ing|ers|er|ed|es|s|ice|e)$/, "");
  return s.length >= 3 ? s : w;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** ES-06: stories whose themes appear in the prompt, best first; ties go to fewer prior uses. */
export function rankStories(
  prompt: string,
  stories: Story[],
  limit = 3,
): Array<{ story: Story; matched: string[]; score: number }> {
  const promptStems = new Set(wordsOf(prompt).map(stem));
  return stories
    .filter((s) => s.archivedAt === null)
    .map((story) => {
      const matched = story.themes.filter((theme) => wordsOf(theme).some((w) => promptStems.has(stem(w))));
      return { story, matched, score: matched.length };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.story.uses.length - b.story.uses.length || a.story.title.localeCompare(b.story.title))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/text && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 8 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/text.ts apps/web/src/components/essays/text.test.ts
git commit -m "feat(web): essay limits, quote anchors, and story match ranking"
```

### Q10: Essay styles (mockup 04)

Style-only task.

- [ ] **Step 1: Write the stylesheet**

`apps/web/src/components/essays/essays.module.css`:

```css
.studio {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt {
  margin-top: 6px;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
}

.meta {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}

.integrity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--good-soft);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--good-text);
}

.paper {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
}

.paperHead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line-2);
  font-size: 13px;
  color: var(--muted);
}

.count {
  font-weight: 650;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.tabs {
  display: flex;
  gap: 6px;
}

.editor,
.page {
  width: 100%;
  min-height: 520px;
  padding: 22px 26px;
  border: 0;
  background: transparent;
  font: 17px/1.75 Georgia, "Times New Roman", serif;
  color: var(--ink);
  white-space: pre-wrap;
  resize: vertical;
  outline: none;
}

.mark {
  border-bottom: 2px solid var(--c-quill);
  background: var(--warn-soft);
}

.num {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  margin: 0 3px;
  border-radius: 5px;
  background: var(--warn-soft);
  font: 700 11px/1 system-ui, sans-serif;
  color: var(--warn-text);
  vertical-align: super;
}

.paperFoot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--line-2);
}

.conflict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--warn-soft);
  font-size: 13.5px;
  color: var(--warn-text);
}

.comment {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
  font-size: 13.5px;
}

.commentHead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12.5px;
  color: var(--muted);
}

.footnote {
  font-size: 12.5px;
  color: var(--muted);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.stories li {
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
}

.stories li:first-child {
  border-top: 0;
}

.storyTitle {
  font-size: 14px;
  font-weight: 650;
}

.warn {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--warn-soft);
  font-size: 13px;
  color: var(--warn-text);
}

.versions li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.readOnlyBody {
  max-height: 50vh;
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: var(--wash);
  font: 15px/1.6 Georgia, "Times New Roman", serif;
  white-space: pre-wrap;
}

.bank {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1200px) {
  .studio,
  .bank {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 2: Check formatting**

Run: `pnpm exec biome check apps/web/src/components/essays/essays.module.css`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/essays/essays.module.css
git commit -m "feat(web): essay studio styles"
```

### Q11: Essay editor with live counts and safe saves (ES-02, ES-03)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/EssayEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EssayEditor } from "./EssayEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const version = (v: number) => ({
  id: `00000000-0000-4000-8000-00000000000${v}`,
  essayId: "e1",
  version: v,
  body: "x",
  wordCount: 1,
  authorId: "00000000-0000-4000-8000-000000000009",
  createdAt: "2026-10-06T15:00:00.000Z",
});

describe("EssayEditor", () => {
  it("counts words live and warns near and over the limit", () => {
    render(<EssayEditor essayId="e1" initialBody="I have always been passionate." baseVersion={2} wordLimit={500} charLimit={null} />);
    expect(screen.getByText("5 / 500 words")).toBeTruthy();
    expect(screen.getByText("Draft 2 · every word typed by you")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Your draft" });
    fireEvent.change(box, { target: { value: words(450) } });
    expect(screen.getByText("450 / 500 words")).toBeTruthy();
    expect(screen.getByText("50 words left")).toBeTruthy();
    fireEvent.change(box, { target: { value: words(501) } });
    expect(screen.getByText("1 over")).toBeTruthy();
  });

  it("saves with the base version and moves to the new version", async () => {
    const fetchMock = vi
      .fn(async (_url: string, _init?: RequestInit) => json(version(3), 201))
      .mockResolvedValueOnce(json(version(3), 201))
      .mockResolvedValueOnce(json(version(4), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<EssayEditor essayId="e1" initialBody="First line." baseVersion={2} wordLimit={500} charLimit={null} />);
    const save = screen.getByRole("button", { name: "Save draft" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), { target: { value: "First line. Second line." } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Draft 3 saved")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays/e1/versions");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ body: "First line. Second line.", baseVersion: 2 });
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), { target: { value: "First line. Second line. Third." } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText("Draft 4 saved")).toBeTruthy());
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ baseVersion: 3 });
    expect(nav.router.refresh).toHaveBeenCalledTimes(2);
  });

  it("stops on a conflict and offers to reload the latest draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "conflict", message: "This essay changed since you opened it" } }, 409)),
    );
    const onReload = vi.fn();
    render(<EssayEditor essayId="e1" initialBody="Old" baseVersion={1} wordLimit={null} charLimit={null} onReload={onReload} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your draft" }), { target: { value: "Old and new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This draft changed in another tab."));
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reload the latest draft" }));
    expect(onReload).toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Your draft" }) as HTMLTextAreaElement).value).toBe("Old and new");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/EssayEditor`
Expected: FAIL with `Failed to resolve import "./EssayEditor"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/EssayEditor.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { EssayVersion } from "@scholarcrew/domain";
import { Badge, Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./essays.module.css";
import { essayStats, limitBadge } from "./text";

/**
 * ES-02/ES-03: the student's own words. Every save is a version based on the version this tab loaded;
 * a 409 means another tab saved first, so nothing is overwritten and the student reloads.
 */
export function EssayEditor({
  essayId,
  initialBody,
  baseVersion,
  wordLimit,
  charLimit,
  onReload = () => window.location.reload(),
}: {
  essayId: string;
  initialBody: string;
  baseVersion: number;
  wordLimit: number | null;
  charLimit: number | null;
  onReload?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [lastSaved, setLastSaved] = useState(initialBody);
  const [base, setBase] = useState(baseVersion);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = essayStats(body, wordLimit, charLimit);
  const badge = limitBadge(stats);
  const dirty = body !== lastSaved;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<EssayVersion>(`/essays/${essayId}/versions`, { body: { body, baseVersion: base } });
      setBase(saved.version);
      setLastSaved(body);
      setSavedNote(`Draft ${saved.version} saved`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") setConflict(true);
      else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.paper}>
      <div className={styles.paperHead}>
        <span>
          {`${base === 0 ? "New draft" : `Draft ${base}`} · every word typed by you`}
          {dirty ? " · unsaved changes" : ""}
        </span>
        <span className={styles.count}>{stats.label}</span>
        <span aria-live="polite">{badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}</span>
      </div>
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <span>This draft changed in another tab. Reload to see the latest version; copy anything you want to keep first.</span>
          <Button variant="line" size="sm" onClick={onReload}>
            Reload the latest draft
          </Button>
        </div>
      ) : null}
      <textarea
        aria-label="Your draft"
        className={styles.editor}
        value={body}
        maxLength={50_000}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.paperFoot}>
        <Button variant="primary" disabled={saving || !dirty || conflict} onClick={() => void save()}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
        {savedNote && !dirty ? <span className={styles.footnote}>{savedNote}</span> : null}
        {error ? (
          <p className={styles.footnote} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/EssayEditor.tsx apps/web/src/components/essays/EssayEditor.test.tsx
git commit -m "feat(web): essay editor with live limits and conflict-safe saves"
```

### Q12: Review view, Quill comments, Ask Quill, draft history (ES-02, ES-04, ES-09)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/Review.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CrewJob, EssayComment } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryModal } from "./HistoryModal";
import { ReviewView } from "./ReviewView";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  readyState = 0;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  /** A connection the browser gave up on (CLOSED), so 16's hook treats it as lost. */
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.emit("error");
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const comment = (id: string, quote: string, body: string, occurrence = 1): EssayComment => ({
  id,
  essayId: "e1",
  version: 2,
  author: "quill",
  kind: "question",
  quote,
  occurrence,
  body,
  resolvedAt: null,
  createdAt: "2026-10-06T15:00:00.000Z",
});
const body = "I have always been passionate about robotics. The first night, 30 kids came.";
const comments = [
  comment("c1", "I have always been passionate about robotics.", "Can you open inside the room instead?"),
  comment("c2", "30 kids came", "What changed for one of those kids?"),
  comment("c3", "a line I deleted", "Gone now."),
];
const job = (status: CrewJob["status"]): CrewJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "essay_review",
  status,
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: "e1",
  progress: [],
  error: status === "failed" ? "Quill couldn't finish this review." : null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
});

describe("ReviewView", () => {
  it("lists old-version comments without anchoring them to the current draft", () => {
    const { container } = render(<ReviewView body={body} comments={[comment("old", "30 kids came", "Old note")]} currentVersion={3} />);
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.getByText("From draft 2: 30 kids came")).toBeTruthy();
  });

  it("highlights each quote with its comment number and notes quotes that moved", () => {
    const { container } = render(<ReviewView body={body} comments={comments} currentVersion={2} />);
    const marks = container.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["I have always been passionate about robotics.1", "30 kids came2"]);
    expect(screen.getByText("1 comment points at text that changed since Quill read it.")).toBeTruthy();
  });
});

describe("CommentsPanel", () => {
  it("resolves a comment", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommentsPanel essayId="e1" comments={comments} budget="358 words left." readOnly={false} />);
    const first = screen.getByRole("article", { name: "Comment 1" });
    expect(within(first).getByText("Can you open inside the room instead?")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Comment 1" })).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essay-comments/c1/resolve");
    expect(nav.router.refresh).toHaveBeenCalled();
    expect(screen.getByText("358 words left.")).toBeTruthy();
    expect(screen.getByText(/It won't write paragraphs for you/)).toBeTruthy();
  });

  it("asks Quill, follows the job, and refreshes when comments are ready", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(job("queued"), 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(screen.getByText("Quill is reading your draft…")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays/e1/review");
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("ready"))));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    act(() => FakeEventSource.instances[0]?.emit("end"));
  });

  it("shows a failed review", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(job("queued"), 202)));
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("failed"))));
    expect(screen.getByRole("alert").textContent).toBe("Quill couldn't finish this review.");
  });

  it("shows a lost stream and lets the student ask again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(job("queued"), 202)));
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    await waitFor(() => expect(screen.getByText("Quill is reading your draft…")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Ask Quill" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => FakeEventSource.instances[0]?.fail());
    expect(screen.getByRole("alert").textContent).toMatch(/Refresh to check on your crew/);
    expect(screen.queryByText("Quill is reading your draft…")).toBeNull();
    expect((screen.getByRole("button", { name: "Ask Quill" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the allowance message with a See plans link on 402 (CR-10, E-16-6)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT." } }, 402)),
    );
    render(<CommentsPanel essayId="e1" comments={[]} budget={null} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Quill" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

describe("HistoryModal", () => {
  it("lists versions and opens one read-only", async () => {
    const versions = [1, 2].map((v) => ({
      id: `00000000-0000-4000-8000-00000000000${v}`,
      essayId: "e1",
      version: v,
      body: v === 1 ? "The very first try." : "Second try.",
      wordCount: v === 1 ? 4 : 2,
      authorId: "00000000-0000-4000-8000-000000000009",
      createdAt: `2026-10-0${v + 1}T15:00:00.000Z`,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => json(versions)));
    render(<HistoryModal essayId="e1" timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Draft history" }));
    const dialog = screen.getByRole("dialog", { name: "Draft history" });
    await waitFor(() => expect(within(dialog).getByText("Draft 2 · Oct 3 · 2 words")).toBeTruthy());
    expect(within(dialog).getAllByRole("listitem").map((li) => li.textContent?.startsWith("Draft 2"))).toEqual([true, false]);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "View" })[1] as HTMLElement);
    expect(within(dialog).getByText("The very first try.")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to all drafts" }));
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/Review`
Expected: FAIL with `Failed to resolve import "./CommentsPanel"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/ReviewView.tsx`:

```tsx
import type { EssayComment } from "@scholarcrew/domain";
import styles from "./essays.module.css";
import { highlightSegments } from "./text";

/** ES-04: the saved draft with each comment's exact quote highlighted and numbered. */
export function ReviewView({ body, comments, currentVersion }: { body: string; comments: EssayComment[]; currentVersion: number }) {
  const stale = comments.filter((comment) => comment.version !== currentVersion);
  const { segments, unplaced } = highlightSegments(body, comments.filter((comment) => comment.version === currentVersion));
  return (
    <>
      <div className={styles.page} aria-label="Your draft with Quill's notes">
        {segments.map((s) =>
          s.n === null ? (
            <span key={s.start}>{s.text}</span>
          ) : (
            <mark key={s.start} className={styles.mark}>
              {s.text}
              <sup className={styles.num}>{s.n}</sup>
            </mark>
          ),
        )}
      </div>
      {stale.map((comment) => <p key={comment.id} className={styles.footnote}>{`From draft ${comment.version}: ${comment.quote}`}</p>)}
      {unplaced.length > 0 ? (
        <p className={styles.footnote}>
          {unplaced.length === 1
            ? "1 comment points at text that changed since Quill read it."
            : `${unplaced.length} comments point at text that changed since Quill read it.`}
        </p>
      ) : null}
    </>
  );
}
```

`apps/web/src/components/essays/CommentsPanel.tsx`:

```tsx
"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, type EssayComment, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, StatusPill, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./essays.module.css";

const AUTHOR: Record<Exclude<EssayComment["author"], "quill">, string> = { helper: "Helper", user: "You" };

function shortQuote(q: string): string {
  return q.length > 40 ? `${q.slice(0, 37)}…` : q;
}

/** Quill's comments (numbered like the highlights), Ask Quill, and the integrity note (ES-09). */
export function CommentsPanel({
  essayId,
  comments,
  budget,
  readOnly,
}: {
  essayId: string;
  comments: EssayComment[];
  budget: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const { job, error: streamError } = useJobStream(jobId);
  const done = job !== null && TERMINAL_JOB_STATUSES.includes(job.status);

  useEffect(() => {
    if (done && job?.status !== "failed") router.refresh();
  }, [done, job?.status, router]);

  async function askQuill() {
    setAsking(true);
    setError(null);
    setLimited(false);
    try {
      const started = await api<CrewJob>(`/essays/${essayId}/review`, { method: "POST" });
      setJobId(started.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    } finally {
      setAsking(false);
    }
  }

  async function resolve(id: string) {
    setError(null);
    try {
      await api(`/essay-comments/${id}/resolve`, { method: "POST" });
      setResolved((list) => [...list, id]);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // A dropped or timed-out stream (16's hook sets `error`) ends the wait so Ask Quill works again.
  const working = jobId !== null && !done && streamError === null;
  const failed = done && job?.status === "failed" ? (job.error ?? "Quill couldn't finish this review. Try again.") : null;
  const problem = failed ?? (jobId !== null && !done ? streamError : null) ?? error;
  return (
    <div className={styles.col}>
      {readOnly ? null : (
        <Button variant="primary" icon="pen" disabled={asking || working} onClick={() => void askQuill()}>
          Ask Quill
        </Button>
      )}
      {working ? (
        <div className={styles.conflict} aria-live="polite">
          <StatusPill status={job?.status ?? "queued"} />
          <span>{job?.progress.at(-1)?.text ?? "Quill is reading your draft…"}</span>
        </div>
      ) : null}
      {problem ? (
        <p className={styles.footnote} role="alert">
          {problem}
        </p>
      ) : null}
      {limited && problem === error ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
      {comments.map((c, index) =>
        resolved.includes(c.id) ? null : (
          <article key={c.id} className={styles.comment} aria-label={`Comment ${index + 1}`}>
            <div className={styles.commentHead}>
              <span className={styles.num}>{index + 1}</span>
              {c.author === "quill" ? <Who role="quill" size="sm" /> : <b>{AUTHOR[c.author]}</b>}
              <span>{`on "${shortQuote(c.quote)}"`}</span>
            </div>
            <p>{c.body}</p>
            {readOnly ? null : (
              <Button variant="line" size="sm" onClick={() => void resolve(c.id)}>
                Resolve
              </Button>
            )}
          </article>
        ),
      )}
      {budget ? (
        <Card>
          <Eyebrow>Word budget</Eyebrow>
          <p>{budget}</p>
        </Card>
      ) : null}
      <p className={styles.footnote}>
        Quill asks questions and points at your sentences. It won't write paragraphs for you, because scholarships and
        colleges expect your own words.
      </p>
    </div>
  );
}
```

`apps/web/src/components/essays/HistoryModal.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { EssayVersion } from "@scholarcrew/domain";
import { Button, Modal } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./essays.module.css";

/** ES-02: every saved version, newest first; a version opens read-only. */
export function HistoryModal({ essayId, timeZone }: { essayId: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<EssayVersion[] | null>(null);
  const [viewing, setViewing] = useState<EssayVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setViewing(null);
    setError(null);
    try {
      const list = await api<EssayVersion[]>(`/essays/${essayId}/versions`);
      setVersions([...list].sort((a, b) => b.version - a.version));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <Button variant="line" onClick={() => void show()}>
        Draft history
      </Button>
      <Modal open={open} title="Draft history" onClose={() => setOpen(false)}>
        {error ? (
          <p className={styles.footnote} role="alert">
            {error}
          </p>
        ) : null}
        {viewing ? (
          <>
            <p className={styles.meta}>{`Draft ${viewing.version} · ${viewing.wordCount} words · read-only`}</p>
            <div className={styles.readOnlyBody}>{viewing.body}</div>
            <Button variant="line" onClick={() => setViewing(null)}>
              Back to all drafts
            </Button>
          </>
        ) : versions === null ? (
          <p className={styles.meta}>Loading drafts…</p>
        ) : versions.length === 0 ? (
          <p className={styles.meta}>No saved drafts yet.</p>
        ) : (
          <ul className={styles.versions}>
            {versions.map((v) => (
              <li key={v.id}>
                <span>{`Draft ${v.version} · ${instantShort(v.createdAt, timeZone)} · ${v.wordCount} words`}</span>
                <Button variant="line" size="sm" onClick={() => setViewing(v)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 19 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/ReviewView.tsx apps/web/src/components/essays/CommentsPanel.tsx apps/web/src/components/essays/HistoryModal.tsx apps/web/src/components/essays/Review.test.tsx
git commit -m "feat(web): Quill comments with highlights, Ask Quill, and draft history"
```

### Q13: Story match card with reuse warnings (ES-06, ES-07)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/StoryMatch.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Story } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryMatch } from "./StoryMatch";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const ESSAY = "99999999-9999-4999-8999-999999999999";
const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const story = (id: string, title: string, themes: string[], uses: Story["uses"] = []): Story => ({
  id,
  title,
  moment: "",
  themes,
  evidence: "",
  summary: "",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:00:00.000Z",
  archivedAt: null,
  uses,
});
const robotics = story("s1", "Robotics → library STEM nights", ["service", "teaching"], [
  { essayId: "e0", essayTitle: "Hill Country essay", collegeId: null, scholarshipId: SCHOLARSHIP, usedAt: "2026-09-20T15:00:00.000Z" },
]);
const bakery = story("s2", "Night shift at the bakery", ["work"]);
const prompt = "Describe a time you used your skills to serve your community.";

function setup(check: { alreadyUsedForTarget: boolean; priorUses: number; message: string | null }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.endsWith("/reuse-check") ? json({ storyId: "s1", ...check }) : json({ id: "u1" }, 201),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <StoryMatch
      essayId={ESSAY}
      prompt={prompt}
      stories={[bakery, robotics]}
      target={{ collegeId: null, scholarshipId: SCHOLARSHIP }}
      readOnly={false}
    />,
  );
  return fetchMock;
}

describe("StoryMatch", () => {
  it("suggests matching stories with their themes and prior uses", () => {
    setup({ alreadyUsedForTarget: false, priorUses: 1, message: null });
    const card = screen.getByRole("article", { name: "Robotics → library STEM nights" });
    expect(within(card).getByText("Matches the prompt: service")).toBeTruthy();
    expect(within(card).getByText("Used for Hill Country essay")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Night shift at the bakery" })).toBeNull();
  });

  it("links a story after a clean reuse check", async () => {
    const fetchMock = setup({ alreadyUsedForTarget: false, priorUses: 1, message: null });
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByText("Linked to this essay")).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/stories/reuse-check", "/api/v1/stories/link"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ storyId: "s1", scholarshipId: SCHOLARSHIP });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ storyId: "s1", essayId: ESSAY });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("warns before the same story goes to the same place twice", async () => {
    const fetchMock = setup({ alreadyUsedForTarget: true, priorUses: 1, message: "You already sent this story to this scholarship." });
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByText("You already sent this story to this scholarship.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
    expect(screen.queryByText("You already sent this story to this scholarship.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use this story" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Use it anyway" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Use it anyway" }));
    await waitFor(() => expect(screen.getByText("Linked to this essay")).toBeTruthy());
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/stories/link");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/StoryMatch`
Expected: FAIL with `Failed to resolve import "./StoryMatch"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/StoryMatch.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Story, StoryReuseCheck, StoryUse } from "@scholarcrew/domain";
import { Badge, Button, Card, Eyebrow, Tag, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./essays.module.css";
import { rankStories } from "./text";

/** ES-06 suggestions with ES-07 reuse tracking: link records the use; a repeat target asks first. */
export function StoryMatch({
  essayId,
  prompt,
  stories,
  target,
  readOnly,
}: {
  essayId: string;
  prompt: string;
  stories: Story[];
  target: { collegeId: string | null; scholarshipId: string | null };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [warning, setWarning] = useState<{ storyId: string; message: string } | null>(null);
  const [linked, setLinked] = useState<string[]>(() =>
    stories.filter((s) => s.uses.some((u) => u.essayId === essayId)).map((s) => s.id),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ranked = rankStories(prompt, stories);

  async function link(storyId: string) {
    await api<StoryUse>("/stories/link", { body: { storyId, essayId } });
    setLinked((ids) => [...ids, storyId]);
    setWarning(null);
    router.refresh();
  }

  async function use(storyId: string, force: boolean) {
    setBusy(storyId);
    setError(null);
    try {
      if (!force) {
        const body: { storyId: string; collegeId?: string; scholarshipId?: string } = { storyId };
        if (target.collegeId) body.collegeId = target.collegeId;
        if (target.scholarshipId) body.scholarshipId = target.scholarshipId;
        const check = await api<StoryReuseCheck>("/stories/reuse-check", { body });
        if (check.alreadyUsedForTarget) {
          setWarning({ storyId, message: check.message ?? "You've already used this story for this same school or scholarship." });
          return;
        }
      }
      await link(storyId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <Eyebrow>
        <Who role="quill" size="sm" /> <span>· Best match</span>
      </Eyebrow>
      {ranked.length === 0 ? (
        <p className={styles.meta}>No story in your bank matches this prompt's themes yet. Add one from the Story Bank.</p>
      ) : null}
      <div className={styles.stories}>
        {ranked.map(({ story, matched }) => (
          <article key={story.id} aria-label={story.title}>
            <p className={styles.storyTitle}>{story.title}</p>
            <div className={styles.tags}>
              {story.themes.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <p className={styles.meta}>{`Matches the prompt: ${matched.join(", ")}`}</p>
            <p className={styles.meta}>
              {story.uses.length === 0 ? "Not used yet" : `Used for ${story.uses.map((u) => u.essayTitle).join(" and ")}`}
            </p>
            {linked.includes(story.id) ? (
              <Badge tone="good">Linked to this essay</Badge>
            ) : readOnly ? null : (
              <Button variant="soft" size="sm" disabled={busy !== null} onClick={() => void use(story.id, false)}>
                Use this story
              </Button>
            )}
            {warning?.storyId === story.id ? (
              <div className={styles.warn} role="alert">
                <p>{warning.message}</p>
                <Button variant="line" size="sm" onClick={() => void use(story.id, true)}>
                  Use it anyway
                </Button>{" "}
                <Button variant="line" size="sm" onClick={() => setWarning(null)}>
                  Pick another
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {error ? (
        <p className={styles.footnote} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 22 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/StoryMatch.tsx apps/web/src/components/essays/StoryMatch.test.tsx
git commit -m "feat(web): story match suggestions with reuse warnings"
```

### Q14: Essay Studio workspace, the new-essay form, and the essay pages (ES-01, ES-03, CR-08, D34, D47)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/EssayWorkspace.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { EssayWithBody } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EssayWorkspace } from "./EssayWorkspace";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => "/essays/e1",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const essay: EssayWithBody = {
  id: "99999999-9999-4999-8999-999999999999",
  title: "Rotary Club of Eastside essay",
  prompt: "Describe a time you used your skills to serve your community.",
  wordLimit: 500,
  charLimit: null,
  targetType: "scholarship",
  targetCollegeId: null,
  targetScholarshipId: "44444444-4444-4444-8444-444444444444",
  currentVersion: 2,
  latestWordCount: 6,
  status: "drafting",
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  body: "The first night, 30 kids came.",
  wordCount: 6,
  comments: [
    {
      id: "c1",
      essayId: "99999999-9999-4999-8999-999999999999",
      version: 2,
      author: "quill",
      kind: "question",
      quote: "30 kids came",
      occurrence: 1,
      body: "What changed for one of those kids?",
      resolvedAt: null,
      createdAt: "2026-10-06T15:00:00.000Z",
    },
  ],
  targetLabel: "Rotary Club of Eastside",
};

describe("EssayWorkspace", () => {
  it("opens on the editor and switches to the review view with highlights", () => {
    const { container } = render(<EssayWorkspace essay={essay} readOnly={false} />);
    expect(screen.getByRole("textbox", { name: "Your draft" })).toBeTruthy();
    expect(screen.getByText("494 words left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    expect(screen.queryByRole("textbox", { name: "Your draft" })).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("30 kids came1");
  });

  it("shows parents the review view without editing or Ask Quill", () => {
    render(<EssayWorkspace essay={essay} readOnly />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask Quill" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Essay status" })).toBeNull();
    expect(screen.getByText("What changed for one of those kids?")).toBeTruthy();
  });

  it("lets the student set the essay status with PATCH /essays/:id, then refreshes (R2P-14)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...essay, status: "ready" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<EssayWorkspace essay={essay} readOnly={false} />);
    const select = screen.getByRole("combobox", { name: "Essay status" }) as HTMLSelectElement;
    expect(select.value).toBe("drafting");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Drafting", "Ready", "Submitted"]);
    fireEvent.change(select, { target: { value: "ready" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/essays/${essay.id}`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"ready"}' });
    expect(select.value).toBe("ready");
  });
});
```

`apps/web/src/components/essays/EssayPages.test.tsx` (renders the async server pages with services mocked):

```tsx
// @vitest-environment jsdom
import EssayStudioPage from "@/app/(app)/essays/[id]/page";
import EssaysPage from "@/app/(app)/essays/page";
import type { Conversation, Essay, EssayWithBody } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { board, card } from "../scholarships/fixtures";
import { NewEssayForm } from "./NewEssayForm";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  listEssays: vi.fn(),
  getEssay: vi.fn(),
  listStories: vi.fn(),
  getCollegeList: vi.fn(),
  getBoard: vi.fn(),
  getScholarship: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/essays", () => ({ listEssays: m.listEssays, getEssay: m.getEssay, listStories: m.listStories }));
vi.mock("@scholarcrew/core/colleges", () => ({ getCollegeList: m.getCollegeList }));
vi.mock("@scholarcrew/core/scholarships", () => ({ getBoard: m.getBoard, getScholarship: m.getScholarship }));
vi.mock("@scholarcrew/core/crew", () => ({ listConversations: m.listConversations, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/essays",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
const asStudent = () =>
  m.requireAppActor.mockResolvedValue({
    actor: { kind: "user", userId: "s1", role: "student" },
    me: { user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" }, onboardingComplete: true },
    deps,
  });
const asParent = () => {
  m.requireAppActor.mockResolvedValue({
    actor: { kind: "user", userId: "p1", role: "parent" },
    me: { user: { id: "p1", displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" }, onboardingComplete: true },
    deps,
  });
  m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
};
const SCHOLARSHIP = "44444444-4444-4444-8444-444444444444";
const ESSAY = "99999999-9999-4999-8999-999999999999";
const essay = (o: Partial<Essay> = {}): Essay => ({
  id: ESSAY,
  title: "Rotary Club of Eastside essay",
  prompt: "Describe a time you used your skills to serve your community.",
  wordLimit: 500,
  charLimit: null,
  targetType: "scholarship",
  targetCollegeId: null,
  targetScholarshipId: SCHOLARSHIP,
  currentVersion: 2,
  latestWordCount: 450,
  status: "drafting",
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  ...o,
});

describe("essay list page", () => {
  it("shows counts and targets from the list without reading bodies (D34), and the new-essay form to students only", async () => {
    asStudent();
    m.listEssays.mockResolvedValue([
      essay(),
      essay({ id: "88888888-8888-4888-8888-888888888888", title: "State U supplement", targetType: "college", targetCollegeId: "100", targetScholarshipId: null, wordLimit: 250, currentVersion: 0, latestWordCount: null }),
      essay({ id: "77777777-7777-4777-8777-777777777777", title: "Why me", targetType: "general", targetScholarshipId: null, wordLimit: null, latestWordCount: 12 }),
    ]);
    m.getCollegeList.mockResolvedValue([{ collegeId: "100", college: { name: "State U" } }]);
    m.getBoard.mockResolvedValue(board({ working: [card("drafting", { id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" })] }));
    render(await EssaysPage());
    expect(m.listEssays.mock.calls[0]?.[2]).toBe("s1");
    expect(m.getEssay).not.toHaveBeenCalled();
    const table = screen.getByRole("table", { name: "Your essays" });
    expect(within(table).getByText("450 / 500 words")).toBeTruthy();
    expect(within(table).getByText("50 words left")).toBeTruthy();
    expect(within(table).getByText("No draft yet")).toBeTruthy();
    expect(within(table).getByText("12 words")).toBeTruthy();
    expect(within(table).getByText("Rotary Club of Eastside Scholarship")).toBeTruthy();
    expect(within(table).getByText("State U")).toBeTruthy();
    expect(within(table).getByText("General")).toBeTruthy();
    expect(screen.getByRole("form", { name: "New essay" })).toBeTruthy();
    cleanup();
    asParent();
    render(await EssaysPage());
    expect(m.listEssays.mock.calls.at(-1)?.[2]).toBe("s1");
    expect(screen.queryByRole("form", { name: "New essay" })).toBeNull();
  });
});

describe("NewEssayForm (ES-01, D47)", () => {
  it("creates an essay for a college with a word limit and opens it in Essay Studio", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(essay({ id: "66666666-6666-4666-8666-666666666666" }), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewEssayForm colleges={[{ id: "100", name: "State U" }]} scholarships={[{ id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" }]} />);
    const form = screen.getByRole("form", { name: "New essay" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: " State U supplement " } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Prompt" }), { target: { value: "Why State U?" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), { target: { value: "250" } });
    fireEvent.change(within(form).getByRole("combobox", { name: "For" }), { target: { value: "college:100" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    await waitFor(() => expect(m.router.push).toHaveBeenCalledWith("/essays/66666666-6666-4666-8666-666666666666"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/essays");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "State U supplement",
      prompt: "Why State U?",
      wordLimit: 250,
      targetType: "college",
      targetCollegeId: "100",
      targetScholarshipId: null,
    });
  });

  it("needs a title and a word limit from 1 to 5,000, and allows no limit", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(essay(), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewEssayForm colleges={[]} scholarships={[{ id: SCHOLARSHIP, name: "Rotary Club of Eastside Scholarship" }]} />);
    const form = screen.getByRole("form", { name: "New essay" });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    expect(screen.getByRole("alert").textContent).toBe("Give the essay a title.");
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "Rotary essay" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), { target: { value: "0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    expect(screen.getByRole("alert").textContent).toBe("Word limits are whole numbers from 1 to 5,000. Leave it blank if there's none.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByRole("textbox", { name: "Word limit (optional)" }), { target: { value: "" } });
    fireEvent.change(within(form).getByRole("combobox", { name: "For" }), { target: { value: `scholarship:${SCHOLARSHIP}` } });
    fireEvent.click(within(form).getByRole("button", { name: "Create essay" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      wordLimit: null,
      targetType: "scholarship",
      targetCollegeId: null,
      targetScholarshipId: SCHOLARSHIP,
    });
  });
});

describe("Essay Studio page", () => {
  it("puts the essay's crew room in the left column for students only (CR-08)", async () => {
    const full: EssayWithBody = { ...essay(), body: "The first night, 30 kids came.", wordCount: 6, comments: [], targetLabel: "Rotary Club of Eastside" };
    const room: Conversation = {
      id: "22222222-2222-4222-8222-222222222222",
      room: "essay",
      roomRefId: ESSAY,
      familyId: null,
      title: "Rotary Club of Eastside essay",
      createdAt: "2026-10-02T15:00:00.000Z",
      expiresAt: null,
      lastMessageAt: null,
    };
    asStudent();
    m.getEssay.mockResolvedValue(full);
    m.getScholarship.mockResolvedValue({ deadline: "2026-10-30", verifiedAt: null, amountMaxUsd: 2500 });
    m.listStories.mockResolvedValue([]);
    m.listConversations.mockResolvedValue([{ ...room, room: "scholarship", roomRefId: SCHOLARSHIP, id: "33333333-3333-4333-8333-333333333333" }, room]);
    m.getMessages.mockResolvedValue([]);
    render(await EssayStudioPage({ params: Promise.resolve({ id: ESSAY }) }));
    expect(screen.getByText("Crew room · this essay")).toBeTruthy();
    expect(m.getMessages.mock.calls[0]?.[2]).toBe(room.id);
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "@Quill what is this prompt really asking?" })).toBeTruthy();
    cleanup();
    m.listConversations.mockClear();
    asParent();
    render(await EssayStudioPage({ params: Promise.resolve({ id: ESSAY }) }));
    expect(screen.queryByText("Crew room · this essay")).toBeNull();
    expect(m.listConversations).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/EssayWorkspace src/components/essays/EssayPages`
Expected: FAIL with `Failed to resolve import "./EssayWorkspace"` and `Failed to resolve import "./NewEssayForm"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/EssayWorkspace.tsx` (the middle and right columns of the studio grid):

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Essay, EssayPatch, EssayStatus, EssayWithBody } from "@scholarcrew/domain";
import { Button, Select } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { CommentsPanel } from "./CommentsPanel";
import { EssayEditor } from "./EssayEditor";
import { ReviewView } from "./ReviewView";
import styles from "./essays.module.css";
import { essayStats } from "./text";

const STATUS_OPTIONS: Array<{ value: EssayStatus; label: string }> = [
  { value: "drafting", label: "Drafting" },
  { value: "ready", label: "Ready" },
  { value: "submitted", label: "Submitted" },
];

/** R2P-14: the student marks the essay Drafting, Ready, or Submitted (`PATCH /essays/:id` with an `EssayPatch`). */
function EssayStatusSelect({ essayId, status }: { essayId: string; status: EssayStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<EssayStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(next: EssayStatus) {
    const previous = value;
    const body: EssayPatch = { status: next };
    setValue(next);
    setError(null);
    setBusy(true);
    try {
      await api<Essay>(`/essays/${essayId}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setValue(previous);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Select
        label="Essay status"
        options={STATUS_OPTIONS}
        value={value}
        disabled={busy}
        onChange={(e) => void change(e.target.value as EssayStatus)}
      />
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EssayWorkspace({ essay, readOnly }: { essay: EssayWithBody; readOnly: boolean }) {
  const [mode, setMode] = useState<"write" | "review">(readOnly ? "review" : "write");
  const stats = essayStats(essay.body, essay.wordLimit, essay.charLimit);
  const budget =
    stats.limit === null
      ? null
      : stats.count <= stats.limit
        ? `${stats.limit - stats.count} ${stats.unit} left.`
        : `${stats.count - stats.limit} ${stats.unit} over the limit.`;
  return (
    <>
      <div className={styles.col}>
        {readOnly ? null : (
          <div className={styles.tabs}>
            <Button variant={mode === "write" ? "primary" : "line"} size="sm" onClick={() => setMode("write")}>
              Write
            </Button>
            <Button variant={mode === "review" ? "primary" : "line"} size="sm" onClick={() => setMode("review")}>
              Review notes
            </Button>
            <EssayStatusSelect essayId={essay.id} status={essay.status} />
          </div>
        )}
        {mode === "write" && !readOnly ? (
          <EssayEditor
            essayId={essay.id}
            initialBody={essay.body}
            baseVersion={essay.currentVersion}
            wordLimit={essay.wordLimit}
            charLimit={essay.charLimit}
          />
        ) : (
          <div className={styles.paper}>
            <div className={styles.paperHead}>
              <span>{`Draft ${essay.currentVersion} · saved`}</span>
              <span className={styles.count}>{stats.label}</span>
            </div>
            <ReviewView body={essay.body} comments={essay.comments} currentVersion={essay.currentVersion} />
          </div>
        )}
      </div>
      <CommentsPanel essayId={essay.id} comments={essay.comments} budget={budget} readOnly={readOnly} />
    </>
  );
}
```

`apps/web/src/components/essays/NewEssayForm.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Essay, EssayTarget } from "@scholarcrew/domain";
import { Button, Card, Select, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";

type Option = { id: string; name: string };

/** The "For" select's value: "general", "college:<collegeId>", or "scholarship:<scholarshipId>". */
function targetOf(value: string): { targetType: EssayTarget; targetCollegeId: string | null; targetScholarshipId: string | null } {
  if (value.startsWith("college:")) return { targetType: "college", targetCollegeId: value.slice("college:".length), targetScholarshipId: null };
  if (value.startsWith("scholarship:")) {
    return { targetType: "scholarship", targetCollegeId: null, targetScholarshipId: value.slice("scholarship:".length) };
  }
  return { targetType: "general", targetCollegeId: null, targetScholarshipId: null };
}

/** ES-01 (D47): start an essay from any prompt, optionally tied to a listed college or saved scholarship. */
export function NewEssayForm({ colleges, scholarships }: { colleges: Option[]; scholarships: Option[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState("");
  const [target, setTarget] = useState("general");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name) return setError("Give the essay a title.");
    const raw = limit.trim().replace(/,/g, "");
    const wordLimit = raw === "" ? null : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (wordLimit !== null && !(wordLimit >= 1 && wordLimit <= 5000)) {
      return setError("Word limits are whole numbers from 1 to 5,000. Leave it blank if there's none.");
    }
    setBusy(true);
    setError(null);
    try {
      const essay = await api<Essay>("/essays", {
        method: "POST",
        body: { title: name, prompt: prompt.trim(), wordLimit, ...targetOf(target) },
      });
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const options = [
    { value: "general", label: "General (not for one school)" },
    ...colleges.map((c) => ({ value: `college:${c.id}`, label: `College · ${c.name}` })),
    ...scholarships.map((s) => ({ value: `scholarship:${s.id}`, label: `Scholarship · ${s.name}` })),
  ];
  return (
    <Card title="Start a new essay">
      <form id="new-essay" aria-label="New essay" className={shared.form} onSubmit={create} noValidate>
        <TextInput label="Title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea
          label="Prompt"
          hint="Paste it exactly as the school or scholarship wrote it."
          rows={4}
          maxLength={4000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <TextInput label="Word limit (optional)" inputMode="numeric" maxLength={5} value={limit} onChange={(e) => setLimit(e.target.value)} />
        <Select label="For" options={options} value={target} onChange={(e) => setTarget(e.target.value)} />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" icon="pen" disabled={busy}>
          Create essay
        </Button>
      </form>
    </Card>
  );
}
```

`apps/web/src/app/(app)/essays/page.tsx`:

```tsx
import { NewEssayForm } from "@/components/essays/NewEssayForm";
import { type EssayStats, limitBadge } from "@/components/essays/text";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { listEssays } from "@scholarcrew/core/essays";
import { getBoard } from "@scholarcrew/core/scholarships";
import type { Board, Essay, EssayStatus, EssayTarget } from "@scholarcrew/domain";
import { limitState } from "@scholarcrew/engines";
import { Badge, Button, Card, EmptyState, Table } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

const STATUS: Record<EssayStatus, { tone: "neutral" | "navy" | "good"; label: string }> = {
  drafting: { tone: "neutral", label: "Drafting" },
  ready: { tone: "navy", label: "Ready" },
  submitted: { tone: "good", label: "Submitted" },
};

const TARGET_LABEL: Record<EssayTarget, string> = { college: "A college", scholarship: "A scholarship", general: "General" };

/** D34: `latestWordCount` (words in the current version) comes with the list, so this page reads no essay bodies. */
function lengthStats(e: Essay): EssayStats | null {
  const count = e.latestWordCount;
  if (count === null) return null;
  return {
    count,
    limit: e.wordLimit,
    unit: "words",
    state: limitState(count, e.wordLimit),
    label: e.wordLimit === null ? `${count} words` : `${count} / ${e.wordLimit} words`,
  };
}

/** Saved scholarships (flagged listings left out) for the "For" column and the new-essay picker. */
function boardScholarships(b: Board | null): Array<{ id: string; name: string }> {
  if (!b) return [];
  return [...b.matched, ...b.working, ...b.submitted, ...b.won, ...b.lostOrSkipped].map((c) => ({
    id: c.scholarship.id,
    name: c.scholarship.name,
  }));
}

export default async function EssaysPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="essays" />;
  const essays = await readShared(() => listEssays(v.deps, v.actor, studentId));
  if (!essays) return <NotShared studentName={v.studentName} what="essays" />;
  const [list, board] = await Promise.all([
    readShared(() => getCollegeList(v.deps, v.actor, studentId)),
    readShared(() => getBoard(v.deps, v.actor, studentId)),
  ]);
  const colleges = (list ?? []).map((e) => ({ id: e.collegeId, name: e.college.name }));
  const scholarships = boardScholarships(board);
  const collegeName = new Map(colleges.map((c) => [c.id, c.name]));
  const scholarshipName = new Map(scholarships.map((s) => [s.id, s.name]));
  const targetName = (e: Essay): string =>
    (e.targetCollegeId ? collegeName.get(e.targetCollegeId) : undefined) ??
    (e.targetScholarshipId ? scholarshipName.get(e.targetScholarshipId) : undefined) ??
    TARGET_LABEL[e.targetType];
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Essays</h1>
          <p className={shared.sub}>{`${essays.length} drafts · Quill coaches, you write`}</p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" icon="bookmark" href="/essays/stories">
            Story Bank
          </Button>
          {v.isParent ? null : (
            <Button variant="primary" icon="plus" href="#new-essay">
              New essay
            </Button>
          )}
        </div>
      </div>
      <Card>
        {essays.length === 0 ? (
          <EmptyState title="No essays yet" icon="pen">
            {v.isParent
              ? "Essays your student starts show up here."
              : "Start one below, from a scholarship's essay prompt, or from a college supplement."}
          </EmptyState>
        ) : (
          <Table
            caption="Your essays"
            rowKey={(e) => e.id}
            rows={essays}
            columns={[
              { key: "title", header: "Essay", render: (e) => <a href={`/essays/${e.id}`}>{e.title}</a> },
              { key: "target", header: "For", render: (e) => targetName(e) },
              {
                key: "words",
                header: "Length",
                align: "right",
                render: (e) => {
                  const stats = lengthStats(e);
                  if (!stats) return "No draft yet";
                  const badge = limitBadge(stats);
                  return (
                    <>
                      {stats.label} {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
                    </>
                  );
                },
              },
              { key: "status", header: "Status", render: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> },
            ]}
          />
        )}
      </Card>
      {v.isParent ? null : <NewEssayForm colleges={colleges} scholarships={scholarships} />}
    </>
  );
}
```

The Length column counts words only: an essay with just a character limit shows its word count without a badge (the studio shows the character count from the body).

`apps/web/src/app/(app)/essays/[id]/page.tsx`:

```tsx
import { EssayWorkspace } from "@/components/essays/EssayWorkspace";
import { HistoryModal } from "@/components/essays/HistoryModal";
import { StoryMatch } from "@/components/essays/StoryMatch";
import styles from "@/components/essays/essays.module.css";
import { ContextCrew } from "@/components/scholarships/ContextCrew";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { dateShort, instantShort, usd } from "@/lib/format";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getEssay, listStories } from "@scholarcrew/core/essays";
import { getScholarship } from "@scholarcrew/core/scholarships";
import type { Conversation, Message, ScholarshipDetail, Story } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Icon, Tag } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EssayStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadViewer();
  const essay = await readShared(() => getEssay(v.deps, v.actor, id));
  if (!essay) notFound();
  const scholarshipId = essay.targetScholarshipId;
  const listing: ScholarshipDetail | null = scholarshipId
    ? await readShared(() => getScholarship(v.deps, v.actor, scholarshipId))
    : null;
  const stories: Story[] = v.isParent ? [] : await listStories(v.deps, v.actor, v.actor.userId);
  // CR-08: the essay's own room, looked up the same way as the scholarship and college rooms. Students only.
  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const existing = (await listConversations(v.deps, v.actor)).find((c) => c.room === "essay" && c.roomRefId === essay.id) ?? null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }
  const limitText = essay.wordLimit
    ? `${essay.wordLimit} words max`
    : essay.charLimit
      ? `${essay.charLimit} characters max`
      : "No length limit";
  const sub = [limitText];
  if (listing?.deadline) sub.push(`due ${dateShort(listing.deadline)}`);
  if (listing) sub.push(usd(listing.amountMaxUsd));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>{essay.title}</h1>
          <p className={shared.sub}>{sub.join(" · ")}</p>
        </div>
        <div className={shared.actions}>
          <span className={styles.integrity}>
            <Icon name="pen" /> Quill coaches · you write
          </span>
          {v.isParent ? null : <HistoryModal essayId={essay.id} timeZone={v.timeZone} />}
        </div>
      </div>
      <div className={styles.studio}>
        <div className={styles.col}>
          <Card>
            <Eyebrow>Prompt</Eyebrow>
            <p className={styles.prompt}>{essay.prompt || "No prompt yet. Paste it in when you have it."}</p>
            <p className={styles.meta}>{limitText}</p>
            {listing?.deadline ? <p className={styles.meta}>{`Due ${dateShort(listing.deadline)}`}</p> : null}
            {listing?.verifiedAt ? (
              <p className={styles.meta}>
                <Icon name="check" /> {`Verified ${instantShort(listing.verifiedAt, v.timeZone)} from the listing`}
              </p>
            ) : null}
            {essay.targetLabel ? <p className={styles.meta}>{`For ${essay.targetLabel}`}</p> : null}
          </Card>
          {v.isParent ? null : (
            <StoryMatch
              essayId={essay.id}
              prompt={essay.prompt}
              stories={stories}
              target={{ collegeId: essay.targetCollegeId, scholarshipId: essay.targetScholarshipId }}
              readOnly={false}
            />
          )}
          {v.isParent ? null : (
            <Card
              title="Story Bank"
              aside={
                <Button variant="line" size="sm" icon="plus" href="/essays/stories">
                  Add a story
                </Button>
              }
            >
              <ul className={styles.stories}>
                {stories
                  .filter((s) => s.archivedAt === null)
                  .slice(0, 5)
                  .map((s) => (
                    <li key={s.id}>
                      <p className={styles.storyTitle}>{s.title}</p>
                      <div className={styles.tags}>
                        {s.themes.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
          {room ? (
            <ContextCrew
              room="essay"
              refId={essay.id}
              title={essay.title}
              lead="quill"
              placeholder="Ask Quill about this essay…"
              chips={[
                { role: "quill", text: "@Quill what is this prompt really asking?" },
                { role: "quill", text: "@Quill which story fits this prompt?" },
              ]}
              timeZone={v.timeZone}
              conversation={room.conversation}
              messages={room.messages}
            />
          ) : null}
        </div>
        <EssayWorkspace essay={essay} readOnly={v.isParent} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 6 files, 29 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/EssayWorkspace.tsx apps/web/src/components/essays/NewEssayForm.tsx apps/web/src/components/essays/EssayWorkspace.test.tsx apps/web/src/components/essays/EssayPages.test.tsx "apps/web/src/app/(app)/essays/page.tsx" "apps/web/src/app/(app)/essays/[id]/page.tsx"
git commit -m "feat(web): essay list with a new-essay form, Essay Studio, and the essay crew room"
```

### Q15: Story Bank and the Quill story interview (ES-05, ES-07, ES-08, IM-05)

`/essays/stories?fromLog=<serviceLogId>` starts a new story from that service log's reflection (IM-05); the student edits and saves it. The "Capture a new story with Quill" card (ES-08, D9) opens My Crew with `?prefill=`, with the question filled in; the student sends it. An optional pasted past essay rides along, and the whole ask is capped at 4,000 characters (the message limit). Quill's interview happens in chat; the student saves the moment in their own words here. Plan 16's "Start a story interview" link and onboarding copy point at this page.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/essays/StoryBank.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Story } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryBank } from "./StoryBank";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/essays/stories" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const clinic: Story = {
  id: "s1",
  title: "Translating at the clinic",
  moment: "Mrs. Reyes squeezed my hand when the nurse finally understood her.",
  themes: ["family", "language"],
  evidence: "Volunteer since 2025",
  summary: "Interpreting for patients",
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:00:00.000Z",
  archivedAt: null,
  uses: [{ essayId: "e1", essayTitle: "State U supplement", collegeId: "100", scholarshipId: null, usedAt: "2026-09-20T15:00:00.000Z" }],
};

describe("StoryBank", () => {
  it("creates a story with theme chips", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...clinic, id: "s2" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<StoryBank stories={[clinic]} readOnly={false} prefill={null} />);
    const form = screen.getByRole("form", { name: "New story" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "Night shift at the bakery" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "The moment, in your words" }), {
      target: { value: "At 4 a.m. the ovens were mine." },
    });
    const theme = within(form).getByRole("textbox", { name: "Add a theme" });
    for (const t of ["work", "responsibility"]) {
      fireEvent.change(theme, { target: { value: t } });
      fireEvent.click(within(form).getByRole("button", { name: "Add theme" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Remove theme work" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save story" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/stories");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Night shift at the bakery",
      moment: "At 4 a.m. the ovens were mine.",
      themes: ["responsibility"],
      evidence: "",
      summary: "",
    });
  });

  it("lists uses, edits, and archives", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json(clinic),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<StoryBank stories={[clinic]} readOnly={false} prefill={null} />);
    const item = screen.getByRole("article", { name: "Translating at the clinic" });
    expect(within(item).getByText("Used in State U supplement")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit story" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "The clinic, Saturdays" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save story" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/stories/s1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    fireEvent.click(within(item).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("starts from a reflection and hides editing for parents", () => {
    render(<StoryBank stories={[]} readOnly={false} prefill={{ title: "Maple Library: STEM night", moment: "A girl asked to take the sensor home." }} />);
    expect((screen.getByRole("textbox", { name: "The moment, in your words" }) as HTMLTextAreaElement).value).toBe(
      "A girl asked to take the sensor home.",
    );
    cleanup();
    render(<StoryBank stories={[clinic]} readOnly prefill={null} />);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start a story interview" })).toBeNull();
  });

  it("starts a Quill story interview with an optional past essay, capped at 4,000 characters (ES-08)", () => {
    render(<StoryBank stories={[]} readOnly={false} prefill={null} />);
    const link = () => screen.getByRole("link", { name: "Start a story interview" });
    const ask = () => new URL(link().getAttribute("href") ?? "", "http://localhost").searchParams.get("ask") ?? "";
    expect(link().getAttribute("href")?.startsWith("/crew?prefill=")).toBe(true);
    expect(ask()).toBe("@Quill interview me for a new Story Bank story");
    expect(screen.getByText(/Your answers, in your words, become the story's moment/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Paste a past essay (optional)" }), { target: { value: "x".repeat(5000) } });
    expect(ask().startsWith("@Quill interview me for a new Story Bank story. Here's a past essay to start from:\n\nxxx")).toBe(true);
    expect(ask()).toHaveLength(4000);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/essays/StoryBank`
Expected: FAIL with `Failed to resolve import "./StoryBank"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/essays/StoryBank.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Story } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Tag, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./essays.module.css";

type Draft = { title: string; moment: string; themes: string[]; evidence: string; summary: string };
const EMPTY: Draft = { title: "", moment: "", themes: [], evidence: "", summary: "" };

const INTERVIEW_ASK = "@Quill interview me for a new Story Bank story";
/** Same cap as a crew message (the composer's maxLength). */
const MAX_ASK = 4000;

/** ES-08: Quill asks up to 5 questions in My Crew; the student's own answers become the moment they save here. */
function StoryInterview() {
  const [pasted, setPasted] = useState("");
  const extra = pasted.trim();
  const ask = (extra ? `${INTERVIEW_ASK}. Here's a past essay to start from:\n\n${extra}` : INTERVIEW_ASK).slice(0, MAX_ASK);
  return (
    <Card title="Capture a new story with Quill">
      <p className={styles.meta}>
        Quill asks up to 5 questions in chat. Your answers, in your words, become the story's moment; Quill doesn't write
        it. When you're done, add the story here.
      </p>
      <TextArea
        label="Paste a past essay (optional)"
        hint="Quill uses it to ask better questions. It isn't saved as a story."
        rows={4}
        maxLength={MAX_ASK}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <Button variant="soft" icon="chat" href={`/crew?prefill=${encodeURIComponent(ask)}`}>
        Start a story interview
      </Button>
    </Card>
  );
}

function StoryForm({ editing, initial, onDone }: { editing: Story | null; initial: Draft; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [theme, setTheme] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addTheme() {
    const t = theme.trim().toLowerCase().slice(0, 40);
    if (!t || draft.themes.includes(t) || draft.themes.length >= 8) return setTheme("");
    setDraft({ ...draft, themes: [...draft.themes, t] });
    setTheme("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.moment.trim()) return setError("A story needs a title and the moment in your words.");
    setSaving(true);
    setError(null);
    const body = { ...draft, title: draft.title.trim(), moment: draft.moment.trim() };
    try {
      if (editing) await api<Story>(`/stories/${editing.id}`, { method: "PATCH", body });
      else await api<Story>("/stories", { body });
      setDraft(EMPTY);
      onDone();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={editing ? "Edit story" : "Add a story"}>
      <form aria-label={editing ? "Edit story" : "New story"} className={shared.form} onSubmit={save}>
        <TextInput label="Title" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <TextArea
          label="The moment, in your words"
          hint="What happened, as you'd tell a friend. Quill never writes this part."
          rows={5}
          maxLength={4000}
          value={draft.moment}
          onChange={(e) => setDraft({ ...draft, moment: e.target.value })}
        />
        <div className={styles.tags}>
          {draft.themes.map((t) => (
            <Tag key={t}>
              {t}{" "}
              <button
                type="button"
                aria-label={`Remove theme ${t}`}
                onClick={() => setDraft({ ...draft, themes: draft.themes.filter((x) => x !== t) })}
              >
                ×
              </button>
            </Tag>
          ))}
        </div>
        <TextInput
          label="Add a theme"
          value={theme}
          maxLength={40}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTheme();
            }
          }}
        />
        <Button variant="line" size="sm" icon="plus" onClick={addTheme}>
          Add theme
        </Button>
        <TextArea label="Evidence (optional)" rows={2} maxLength={2000} value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} />
        <TextInput label="One-line summary (optional)" maxLength={400} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={shared.actions}>
          <Button variant="primary" type="submit" disabled={saving}>
            Save story
          </Button>
          {editing ? (
            <Button variant="line" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/** ES-05: create, edit, archive; ES-07: each story lists where it was used; ES-08: start a Quill interview. */
export function StoryBank({
  stories,
  readOnly,
  prefill,
}: {
  stories: Story[];
  readOnly: boolean;
  prefill: { title: string; moment: string } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = stories.filter((s) => s.archivedAt === null);

  async function archive(id: string) {
    setError(null);
    try {
      await api(`/stories/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const initial: Draft = editing
    ? { title: editing.title, moment: editing.moment, themes: editing.themes, evidence: editing.evidence, summary: editing.summary }
    : prefill
      ? { ...EMPTY, ...prefill }
      : EMPTY;

  return (
    <div className={styles.bank}>
      <Card title="Your stories">
        {active.length === 0 ? (
          <EmptyState title="No stories yet" icon="bookmark">
            A story is one moment you lived, in your own words. You can reuse it across essays.
          </EmptyState>
        ) : null}
        <div className={styles.stories}>
          {active.map((s) => (
            <article key={s.id} aria-label={s.title}>
              <p className={styles.storyTitle}>{s.title}</p>
              {s.summary ? <p className={styles.meta}>{s.summary}</p> : null}
              <p>{s.moment}</p>
              <div className={styles.tags}>
                {s.themes.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              {s.evidence ? <p className={styles.meta}>{`Evidence: ${s.evidence}`}</p> : null}
              <p className={styles.meta}>
                {s.uses.length === 0 ? "Not used yet" : `Used in ${s.uses.map((u) => u.essayTitle).join(", ")}`}
              </p>
              {readOnly ? null : (
                <div className={shared.actions}>
                  <Button variant="line" size="sm" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <Button variant="line" size="sm" onClick={() => void archive(s.id)}>
                    Archive
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {readOnly ? null : (
        <StoryForm key={editing?.id ?? "new"} editing={editing} initial={initial} onDone={() => setEditing(null)} />
      )}
      {readOnly ? null : <StoryInterview />}
    </div>
  );
}
```

`apps/web/src/app/(app)/essays/stories/page.tsx`:

```tsx
import { StoryBank } from "@/components/essays/StoryBank";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { listStories } from "@scholarcrew/core/essays";
import { listServiceLogs } from "@scholarcrew/core/impact";

export const dynamic = "force-dynamic";

export default async function StoryBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="stories" />;
  const stories = await readShared(() => listStories(v.deps, v.actor, studentId));
  if (!stories) return <NotShared studentName={v.studentName} what="stories" />;
  const sp = await searchParams;
  let prefill: { title: string; moment: string } | null = null;
  if (!v.isParent && typeof sp.fromLog === "string") {
    const log = (await listServiceLogs(v.deps, v.actor, v.actor.userId)).find((l) => l.id === sp.fromLog);
    if (log?.reflection) prefill = { title: `${log.organization}: ${log.activity}`.slice(0, 120), moment: log.reflection };
  }
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Story Bank</h1>
          <p className={shared.sub}>Moments in your own words, ready to reuse. Quill suggests them; you decide.</p>
        </div>
      </div>
      <StoryBank stories={stories} readOnly={v.isParent} prefill={prefill} />
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/essays && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 7 files, 33 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/essays/StoryBank.tsx apps/web/src/components/essays/StoryBank.test.tsx "apps/web/src/app/(app)/essays/stories/page.tsx"
git commit -m "feat(web): Story Bank with themes, uses, archive, reflection drafts, and the Quill story interview"
```

### Q16: College model and styles (CO-02, CO-05, CO-06, CO-07, CO-08, PR-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/colleges/colleges.test.ts`:

```ts
import type { CollegeListEntry, CostSummary, HelperLink, MeritTier, RecRequest } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  checklistLabel,
  limitMessage,
  listBalance,
  meritRows,
  outsidePolicyView,
  pastRequests,
  testPolicyLabel,
  withGaps,
} from "./colleges";

const entry = (o: Partial<CollegeListEntry> & { name: string }): CollegeListEntry => ({
  id: `id-${o.name}`,
  collegeId: `c-${o.name}`,
  college: { id: `c-${o.name}`, name: o.name, state: "TX", city: "Austin", control: "public", admitRate: 0.5, costOfAttendanceUsd: 27800, testPolicy: "optional" },
  fit: "target",
  plan: "EA",
  status: "researching",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 5,
  gapUsd: null,
  outsidePolicy: "added_on_top",
  testPolicy: "optional",
  createdAt: "2026-10-01T15:00:00.000Z",
  ...o,
});

describe("college labels", () => {
  it("labels checklist progress, test policy, and outside scholarship policy", () => {
    expect(checklistLabel(3, 5)).toBe("3 of 5");
    expect(checklistLabel(4, 4)).toBe("Done");
    expect(checklistLabel(0, 0)).toBe("No items");
    expect(testPolicyLabel("blind", true)).toBe("Not used");
    expect(testPolicyLabel("required", true)).toBe("Required · superscores");
    expect(testPolicyLabel("optional", null)).toBe("Optional");
    expect(outsidePolicyView("added_on_top")).toEqual({ icon: "check", tone: "good", text: "Added on top of your aid" });
    expect(outsidePolicyView("may_reduce_grant")).toMatchObject({ icon: "alert", tone: "warn" });
    expect(outsidePolicyView("unknown")).toMatchObject({ icon: "info", text: "Unconfirmed: ask the aid office" });
  });

  it("shows the 25-school limit", () => {
    expect(limitMessage(24)).toBeNull();
    expect(limitMessage(25)).toBe("Your list has 25 schools, the most it can hold. Remove one to add another.");
  });
});

describe("withGaps and listBalance", () => {
  it("fills each entry's gap from the money costs", () => {
    const costs = [{ collegeId: "c-State U", gapUsd: 9200 } as CostSummary];
    expect(withGaps([entry({ name: "State U" }), entry({ name: "Bay Tech" })], costs).map((e) => e.gapUsd)).toEqual([9200, null]);
  });

  it("describes balance and grant displacement risks (CO-08)", () => {
    expect(
      listBalance([
        entry({ name: "State U" }),
        entry({ name: "Riverside", fit: "likely" }),
        entry({ name: "Bay Tech", outsidePolicy: "may_reduce_grant" }),
        entry({ name: "Northgate", fit: "reach" }),
      ]),
    ).toEqual([
      "Your list: 1 likely, 2 target, 1 reach.",
      "Bay Tech may lower its own grant if you win outside scholarships. Ask its aid office before counting on outside money there.",
    ]);
    expect(listBalance([entry({ name: "Northgate", fit: "reach" })])).toEqual([
      "Your list: 0 likely, 0 target, 1 reach.",
      "Add a likely school so you have a sure option.",
    ]);
    expect(listBalance([])).toEqual([]);
  });
});

describe("meritRows (CO-06)", () => {
  const tiers: MeritTier[] = [
    { label: "Dean's", minGpa: 3.5, minAct: 30, minSat: null, annualUsd: 5000, renewalGpa: 3.0 },
    { label: "Merit", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3.0 },
  ];
  it("marks the tier the student qualifies for now", () => {
    expect(meritRows(tiers, 3.72, 27, null)).toEqual([
      { label: "Dean's", text: "$5,000/yr · GPA 3.5+, ACT 30+ · renews at 3.0", qualifies: false },
      { label: "Merit", text: "$3,000/yr · GPA 3.5+ · renews at 3.0", qualifies: true },
    ]);
    expect(meritRows([], 3.72, 27, null)).toEqual([]);
  });
});

describe("pastRequests (CO-07, D33)", () => {
  const request = (id: string, o: Partial<RecRequest> = {}): RecRequest => ({
    id,
    recommenderId: "r1",
    collegeListId: "e1",
    scholarshipApplicationId: null,
    helperLinkId: null,
    status: "requested",
    requestedAt: "2026-10-01T15:00:00.000Z",
    updatedAt: "2026-10-01T15:00:00.000Z",
    ...o,
  });
  const link = (id: string, o: Partial<HelperLink> = {}): HelperLink => ({
    id,
    label: "Letter for State U",
    helperRole: "recommender",
    scope: ["activities", "stories"],
    createdAt: "2026-10-01T15:00:00.000Z",
    expiresAt: "2026-10-31T15:00:00.000Z",
    revokedAt: null,
    lastUsedAt: null,
    ...o,
  });

  it("keeps this entry's requests in list order and matches each helper link by helperLinkId", () => {
    const rows = pastRequests(
      [
        request("q3", { helperLinkId: "h3", status: "confirmed" }),
        request("q2", { helperLinkId: "h2", recommenderId: "gone" }),
        request("q1", { helperLinkId: "h1" }),
        request("q0", { collegeListId: "other" }),
        request("q4", { helperLinkId: "missing" }),
      ],
      [link("h1", { expiresAt: "2026-10-05T15:00:00.000Z" }), link("h2", { revokedAt: "2026-10-02T15:00:00.000Z" }), link("h3")],
      [{ id: "r1", name: "Mr. Okafor", email: "okafor@school.example.org", relationship: "Counselor", createdAt: "2026-09-01T15:00:00.000Z" }],
      "e1",
      new Date("2026-10-06T15:00:00.000Z"),
    );
    expect(rows.map((r) => [r.id, r.recommenderName, r.status, r.link?.state ?? null])).toEqual([
      ["q3", "Mr. Okafor", "confirmed", "active"],
      ["q2", "A recommender", "requested", "revoked"],
      ["q1", "Mr. Okafor", "requested", "expired"],
      ["q4", "Mr. Okafor", "requested", null],
    ]);
    expect(rows[0]?.link?.expiresAt).toBe("2026-10-31T15:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges/colleges`
Expected: FAIL with `Failed to resolve import "./colleges"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/colleges/colleges.ts`:

```ts
import { usd } from "@/lib/format";
import {
  APP_PLAN_LABELS,
  type AppPlan,
  type CollegeListEntry,
  type CostSummary,
  type Fit,
  type HelperLink,
  type ItemStatus,
  MAX_COLLEGE_LIST,
  type MeritTier,
  OUTSIDE_POLICY_TEXT,
  type OutsidePolicy,
  type RecRequest,
  type RecStatus,
  type Recommender,
  type TestKind,
  type TestPolicy,
  type TestScore,
} from "@scholarcrew/domain";
import { meritTierFor } from "@scholarcrew/engines";
import type { IconName } from "@scholarcrew/ui";

export const FIT_LABEL: Record<Fit, string> = { reach: "Reach", target: "Target", likely: "Likely" };
/** R3V-8: one label map per enum, from 02 next to `AppPlan` (same wording as 08's deadline titles). */
export const PLAN_LABEL: Record<AppPlan, string> = APP_PLAN_LABELS;
export const ITEM_STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "not_needed", label: "Not needed" },
];
export const CONTROL_LABEL = { public: "public", private_nonprofit: "private", private_forprofit: "for-profit" } as const;

export function checklistLabel(done: number, total: number): string {
  if (total === 0) return "No items";
  return done >= total ? "Done" : `${done} of ${total}`;
}

/** PR-05: required, optional, blind, or unknown, plus superscoring when known. */
export function testPolicyLabel(policy: TestPolicy, superscore: boolean | null): string {
  const base = { required: "Required", optional: "Optional", blind: "Not used", unknown: "Unconfirmed" }[policy];
  return superscore && policy !== "blind" ? `${base} · superscores` : base;
}

/** CO-05 with an icon so the meaning never rests on color. */
export function outsidePolicyView(p: OutsidePolicy): { icon: IconName; tone: "good" | "warn" | "info"; text: string } {
  const icon: Record<OutsidePolicy, IconName> = {
    added_on_top: "check",
    reduces_loans_first: "info",
    may_reduce_grant: "alert",
    unknown: "info",
  };
  const tone = p === "added_on_top" ? "good" : p === "may_reduce_grant" ? "warn" : "info";
  return { icon: icon[p], tone, text: OUTSIDE_POLICY_TEXT[p] };
}

/** Longer sentence for the detail drawer. */
export const OUTSIDE_POLICY_NOTE: Record<OutsidePolicy, string> = {
  added_on_top: "Added on top of your aid",
  reduces_loans_first: "Outside money lowers your loans first, then other aid",
  may_reduce_grant: "Outside money may lower the school's own grant; ask the aid office",
  unknown: "Unconfirmed; ask the aid office how outside scholarships are handled",
};

/** D5: the 26th school is refused with invalid_input; the modal says so before trying. */
export function limitMessage(count: number): string | null {
  return count >= MAX_COLLEGE_LIST
    ? `Your list has ${MAX_COLLEGE_LIST} schools, the most it can hold. Remove one to add another.`
    : null;
}

/** getCollegeList leaves gapUsd null; the money summaries fill it. */
export function withGaps(entries: CollegeListEntry[], costs: Array<Pick<CostSummary, "collegeId" | "gapUsd">>): CollegeListEntry[] {
  const gap = new Map(costs.map((c) => [c.collegeId, c.gapUsd]));
  return entries.map((e) => ({ ...e, gapUsd: e.gapUsd ?? gap.get(e.collegeId) ?? null }));
}

/** CO-08: balance counts and grant-displacement risks. */
export function listBalance(entries: CollegeListEntry[]): string[] {
  if (entries.length === 0) return [];
  const n = (fit: Fit) => entries.filter((e) => e.fit === fit).length;
  const lines = [`Your list: ${n("likely")} likely, ${n("target")} target, ${n("reach")} reach.`];
  if (n("likely") === 0) lines.push("Add a likely school so you have a sure option.");
  for (const e of entries.filter((x) => x.outsidePolicy === "may_reduce_grant")) {
    lines.push(
      `${e.college.name} may lower its own grant if you win outside scholarships. Ask its aid office before counting on outside money there.`,
    );
  }
  return lines;
}

/** CO-06: each automatic merit tier and whether today's GPA and scores reach it. */
export function meritRows(
  tiers: MeritTier[],
  gpa: number | null,
  act: number | null,
  sat: number | null,
): Array<{ label: string; text: string; qualifies: boolean }> {
  const best = meritTierFor(tiers, gpa, act, sat);
  return tiers.map((t) => {
    const needs = [
      t.minGpa !== null ? `GPA ${t.minGpa.toFixed(1)}+` : null,
      t.minAct !== null ? `ACT ${t.minAct}+` : null,
      t.minSat !== null ? `SAT ${t.minSat}+` : null,
    ].filter(Boolean);
    const parts = [`${usd(t.annualUsd)}/yr`, needs.length > 0 ? needs.join(", ") : "automatic"];
    if (t.renewalGpa !== null) parts.push(`renews at ${t.renewalGpa.toFixed(1)}`);
    return { label: t.label, text: parts.join(" · "), qualifies: best?.label === t.label };
  });
}

/** Best official composite for one test. The college page (Q19) and the prep page (Q27, through `prep.ts`) share it. */
export function bestOfficial(scores: TestScore[], test: TestKind): number | null {
  const values = scores.filter((s) => s.official && s.test === test).map((s) => s.composite);
  return values.length > 0 ? Math.max(...values) : null;
}

/** Labels for the past-request status select (R2P-11). */
export const REC_STATUS_LABEL: Record<RecStatus, string> = {
  draft: "Not sent",
  requested: "Asked",
  confirmed: "Agreed to write",
  submitted: "Submitted",
  declined: "Declined",
};

export interface PastRequest {
  id: string;
  recommenderName: string;
  status: RecStatus;
  requestedAt: string | null;
  /** The helper link the request created, matched by `helperLinkId`. Its URL was only emailed, so it can't be shown again. */
  link: { state: "active" | "expired" | "revoked"; expiresAt: string } | null;
}

/** D33: this entry's requests from `listRecRequests` (newest first), each with its helper link's state. */
export function pastRequests(
  requests: RecRequest[],
  links: HelperLink[],
  recommenders: Recommender[],
  entryId: string,
  now: Date,
): PastRequest[] {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const nameById = new Map(recommenders.map((r) => [r.id, r.name]));
  return requests
    .filter((r) => r.collegeListId === entryId)
    .map((r) => {
      const l = r.helperLinkId ? linkById.get(r.helperLinkId) : undefined;
      const state = l?.revokedAt ? "revoked" : l && Date.parse(l.expiresAt) <= now.getTime() ? "expired" : "active";
      return {
        id: r.id,
        recommenderName: nameById.get(r.recommenderId) ?? "A recommender",
        status: r.status,
        requestedAt: r.requestedAt,
        link: l ? { state, expiresAt: l.expiresAt } : null,
      };
    });
}
```

`apps/web/src/components/colleges/colleges.module.css`:

```css
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 20px;
  align-items: start;
}

.school {
  font-weight: 650;
}

.sub {
  font-size: 12.5px;
  color: var(--muted);
}

.meter {
  display: grid;
  grid-template-columns: 76px auto;
  gap: 10px;
  align-items: center;
}

.policy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.good {
  color: var(--good-text);
}

.warn {
  color: var(--warn-text);
}

.info {
  color: var(--ink-2);
}

.items li,
.kv li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.items li:first-child,
.kv li:first-child {
  border-top: 0;
}

.sectionTitle {
  margin: 16px 0 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.balance p + p {
  margin-top: 6px;
}

.picked {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--navy-soft);
  font-size: 13.5px;
}

.statusSelect {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  font: inherit;
  font-size: 13px;
}

.options li + li {
  margin-top: 4px;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 6 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/colleges/colleges.ts apps/web/src/components/colleges/colleges.test.ts apps/web/src/components/colleges/colleges.module.css
git commit -m "feat(web): college list labels, balance notes, merit rows, and styles"
```

### Q17: Add-a-school dialog with search and the 25-school limit (CO-01, CO-02, D5)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/colleges/AddCollegeModal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCollegeModal } from "./AddCollegeModal";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/colleges" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const stateU = { id: "100", name: "State U", state: "TX", city: "Austin", control: "public", admitRate: 0.6, costOfAttendanceUsd: 27800, testPolicy: "optional" };

describe("AddCollegeModal", () => {
  it("explains the limit when the list already has 25 schools", () => {
    render(<AddCollegeModal open count={25} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    expect(within(dialog).getByText("Your list has 25 schools, the most it can hold. Remove one to add another.")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox", { name: "Search colleges" })).toBeNull();
  });

  it("searches, picks a school with fit and plan, and adds it", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.startsWith("/api/v1/colleges?") ? json({ items: [stateU], page: 1, pageSize: 20, total: 1 }) : json({ id: "e1" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCollegeModal open count={6} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search colleges" }), { target: { value: "state u" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "State U · Austin, TX" }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/colleges?q=state%20u");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Fit" }), { target: { value: "reach" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Plan" }), { target: { value: "EA" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to my list" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ collegeId: "100", fit: "reach", plan: "EA" });
  });

  it("shows the server's limit message if another tab filled the list", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.startsWith("/api/v1/colleges?")
        ? json({ items: [stateU], page: 1, pageSize: 20, total: 1 })
        : json({ error: { code: "invalid_input", message: "Your list holds up to 25 colleges. Remove one to add another." } }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AddCollegeModal open count={24} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add a school" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search colleges" }), { target: { value: "state" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "State U · Austin, TX" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to my list" }));
    // 07's exact text, which 14 N2 asserts too (R3A-20).
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("Your list holds up to 25 colleges. Remove one to add another."));
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges/AddCollegeModal`
Expected: FAIL with `Failed to resolve import "./AddCollegeModal"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/colleges/AddCollegeModal.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { AppPlan, CollegeListEntry, CollegeSummary, Fit, Page } from "@scholarcrew/domain";
import { Button, Modal, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { FIT_LABEL, PLAN_LABEL, limitMessage } from "./colleges";
import styles from "./colleges.module.css";

const FITS = (Object.keys(FIT_LABEL) as Fit[]).map((value) => ({ value, label: FIT_LABEL[value] }));
const PLANS = (Object.keys(PLAN_LABEL) as AppPlan[]).map((value) => ({ value, label: PLAN_LABEL[value] }));

/** CO-01 search plus CO-02 add with fit and plan; the 25-school cap shows before and after the request. */
export function AddCollegeModal({ open, count, onClose }: { open: boolean; count: number; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CollegeSummary[] | null>(null);
  const [picked, setPicked] = useState<CollegeSummary | null>(null);
  const [fit, setFit] = useState<Fit>("target");
  const [plan, setPlan] = useState<AppPlan>("RD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = limitMessage(count);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api<Page<CollegeSummary>>(`/colleges?q=${encodeURIComponent(q.trim())}`);
      setResults(page.items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api<CollegeListEntry>("/college-list", { body: { collegeId: picked.id, fit, plan } });
      router.refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add a school" onClose={onClose}>
      {full ? (
        <p>{full}</p>
      ) : (
        <div className={shared.form}>
          <form className={shared.form} onSubmit={search}>
            <TextInput label="Search colleges" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
            <Button variant="line" type="submit" icon="search" disabled={busy}>
              Search
            </Button>
          </form>
          {results && results.length === 0 ? <p className={shared.muted}>No colleges match that name.</p> : null}
          {results && results.length > 0 && !picked ? (
            <ul className={styles.options}>
              {results.map((c) => (
                <li key={c.id}>
                  <Button variant="line" size="sm" onClick={() => setPicked(c)}>
                    {`${c.name} · ${c.city}, ${c.state}`}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {picked ? (
            <>
              <p className={styles.picked}>{`${picked.name} · ${picked.city}, ${picked.state}`}</p>
              <Select label="Fit" options={FITS} value={fit} onChange={(e) => setFit(e.target.value as Fit)} />
              <Select label="Plan" options={PLANS} value={plan} onChange={(e) => setPlan(e.target.value as AppPlan)} />
              <Button variant="primary" disabled={busy} onClick={() => void add()}>
                Add to my list
              </Button>
            </>
          ) : null}
          {error ? (
            <p className={shared.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/colleges/AddCollegeModal.tsx apps/web/src/components/colleges/AddCollegeModal.test.tsx
git commit -m "feat(web): add-a-school dialog with search and the list limit"
```

### Q18: College table and the /colleges page (CO-02, CO-04, CO-05, CO-08, MO-01, PR-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/colleges/CollegeTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CollegeListEntry } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCollegeButton, CollegeTable } from "./CollegeTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/colleges",
}));
afterEach(cleanup);

const entry = (o: Partial<CollegeListEntry> & { name: string }): CollegeListEntry => ({
  id: `id-${o.name}`,
  collegeId: `c-${o.name}`,
  college: { id: `c-${o.name}`, name: o.name, state: "TX", city: "Austin", control: "public", admitRate: 0.5, costOfAttendanceUsd: 27800, testPolicy: "optional" },
  fit: "target",
  plan: "EA",
  status: "researching",
  season: "2026-27",
  deadline: "2026-11-01",
  itemsDone: 3,
  itemsTotal: 5,
  gapUsd: 9200,
  outsidePolicy: "added_on_top",
  testPolicy: "optional",
  createdAt: "2026-10-01T15:00:00.000Z",
  ...o,
});

describe("CollegeTable", () => {
  it("shows fit, deadline by plan, checklist, tests, gap, and outside scholarship policy", () => {
    render(
      <CollegeTable
        entries={[
          entry({ name: "State U" }),
          entry({ name: "Bay Tech", plan: "rolling", deadline: null, gapUsd: null, outsidePolicy: "may_reduce_grant", itemsDone: 4, itemsTotal: 4, testPolicy: "blind" }),
        ]}
        selectedId="id-State U"
      />,
    );
    const rows = screen.getAllByRole("row");
    const state = within(rows[1] as HTMLElement);
    expect(state.getByRole("link", { name: "State U" }).getAttribute("href")).toBe("/colleges/id-State U");
    expect(state.getByText("Target · public")).toBeTruthy();
    expect(state.getByText("Nov 1")).toBeTruthy();
    expect(state.getByText("Early Action")).toBeTruthy();
    expect(state.getByText("3 of 5")).toBeTruthy();
    expect(state.getByText("$9,200")).toBeTruthy();
    expect(state.getByText("Added on top of your aid")).toBeTruthy();
    const bay = within(rows[2] as HTMLElement);
    expect(bay.getByText("Rolling")).toBeTruthy();
    expect(bay.getByText("Rolling admission")).toBeTruthy();
    expect(bay.getByText("Done")).toBeTruthy();
    expect(bay.getByText("Not used")).toBeTruthy();
    expect(bay.getByText("Not estimated")).toBeTruthy();
    expect(bay.getByText("May lower the school's own grant")).toBeTruthy();
  });

  it("opens the add dialog", () => {
    render(<AddCollegeButton count={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a school" }));
    expect(screen.getByRole("dialog", { name: "Add a school" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges/CollegeTable`
Expected: FAIL with `Failed to resolve import "./CollegeTable"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/colleges/CollegeTable.tsx`:

```tsx
"use client";

import { cx } from "@/lib/cx";
import { dateShort, usd } from "@/lib/format";
import type { CollegeListEntry } from "@scholarcrew/domain";
import { Button, Icon, Progress, Table } from "@scholarcrew/ui";
import { useState } from "react";
import { AddCollegeModal } from "./AddCollegeModal";
import { CONTROL_LABEL, FIT_LABEL, PLAN_LABEL, checklistLabel, outsidePolicyView, testPolicyLabel } from "./colleges";
import styles from "./colleges.module.css";

/** Mockup 05 table. The school name opens the detail drawer page. */
export function CollegeTable({ entries, selectedId }: { entries: CollegeListEntry[]; selectedId?: string }) {
  return (
    <Table
      caption="Your college list"
      rows={entries}
      rowKey={(e) => e.id}
      selectedKey={selectedId}
      columns={[
        {
          key: "school",
          header: "School",
          render: (e) => (
            <>
              <a className={styles.school} href={`/colleges/${e.id}`}>
                {e.college.name}
              </a>
              <div className={styles.sub}>{`${FIT_LABEL[e.fit]} · ${CONTROL_LABEL[e.college.control]}`}</div>
            </>
          ),
        },
        {
          key: "deadline",
          header: "Deadline",
          render: (e) => (
            <>
              <div>{e.deadline ? dateShort(e.deadline) : "Rolling"}</div>
              <div className={styles.sub}>{PLAN_LABEL[e.plan]}</div>
            </>
          ),
        },
        {
          key: "checklist",
          header: "Checklist",
          render: (e) => (
            <div className={styles.meter}>
              <Progress value={e.itemsTotal === 0 ? 0 : e.itemsDone / e.itemsTotal} label={`${e.college.name} checklist`} />
              <span>{checklistLabel(e.itemsDone, e.itemsTotal)}</span>
            </div>
          ),
        },
        { key: "tests", header: "Tests", render: (e) => testPolicyLabel(e.testPolicy, null) },
        { key: "gap", header: "Gap / yr", align: "right", render: (e) => (e.gapUsd === null ? "Not estimated" : usd(e.gapUsd)) },
        {
          key: "outside",
          header: "Outside scholarships",
          render: (e) => {
            const view = outsidePolicyView(e.outsidePolicy);
            return (
              <span className={cx(styles.policy, styles[view.tone])}>
                <Icon name={view.icon} />
                {view.text}
              </span>
            );
          },
        },
      ]}
    />
  );
}

export function AddCollegeButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="line" icon="plus" onClick={() => setOpen(true)}>
        Add a school
      </Button>
      <AddCollegeModal open={open} count={count} onClose={() => setOpen(false)} />
    </>
  );
}
```

`apps/web/src/app/(app)/colleges/page.tsx`:

```tsx
import { AddCollegeButton, CollegeTable } from "@/components/colleges/CollegeTable";
import { listBalance, withGaps } from "@/components/colleges/colleges";
import styles from "@/components/colleges/colleges.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural } from "@/lib/format";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { getCosts } from "@scholarcrew/core/money";
import { Button, Card, EmptyState, Eyebrow, Who } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function CollegesPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="colleges" />;
  const list = await readShared(() => getCollegeList(v.deps, v.actor, studentId));
  if (!list) return <NotShared studentName={v.studentName} what="colleges" />;
  const costs = (await readShared(() => getCosts(v.deps, v.actor, studentId))) ?? [];
  const entries = withGaps(list, costs);
  const early = entries.filter((e) => e.plan === "EA" || e.plan === "ED" || e.plan === "REA").length;
  const balance = listBalance(entries);
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Colleges</h1>
          <p className={shared.sub}>
            {`${plural(entries.length, "school")} · ${plural(early, "early deadline")} · gap = estimated yearly cost after free money`}
          </p>
        </div>
        {v.isParent ? null : (
          <div className={shared.actions}>
            <AddCollegeButton count={entries.length} />
            <Button variant="primary" icon="chat" href="/crew">
              Ask Atlas
            </Button>
          </div>
        )}
      </div>
      <div className={shared.form}>
        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No schools yet" icon="columns">
              Add the colleges you're thinking about. Atlas checks deadlines and requirements for each one.
            </EmptyState>
          ) : (
            <CollegeTable entries={entries} />
          )}
        </Card>
        {balance.length > 0 ? (
          <Card>
            <Eyebrow>
              <Who role="atlas" size="sm" /> <span>· About your list</span>
            </Eyebrow>
            <div className={styles.balance}>
              {balance.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className={shared.actions}>
              <Button variant="line" href="/money">
                Compare all costs
              </Button>
            </div>
          </Card>
        ) : null}
        <p className={shared.muted}>
          Gaps are estimates from College Scorecard net price for your income range until you run each school's own
          calculator.
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/colleges/CollegeTable.tsx apps/web/src/components/colleges/CollegeTable.test.tsx "apps/web/src/app/(app)/colleges/page.tsx"
git commit -m "feat(web): college list table with gaps, policies, and Atlas balance notes"
```

### Q19: College detail: checklist, recommenders and past requests, money, testing, crew room (CO-03, CO-06, CO-07, CR-08, D33)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/colleges/CollegeDetail.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ApplicationItem, Recommender } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecklistItems } from "./ChecklistItems";
import { Recommenders } from "./Recommenders";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/colleges/e1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const item = (id: string, label: string, o: Partial<ApplicationItem> = {}): ApplicationItem => ({
  id,
  collegeListId: "e1",
  kind: "form",
  label,
  status: "todo",
  dueOn: "2026-11-01",
  essayId: null,
  updatedAt: "2026-10-01T15:00:00.000Z",
  ...o,
});
const okafor: Recommender = {
  id: "r1",
  name: "Mr. Okafor",
  email: "okafor@school.example.org",
  relationship: "Counselor",
  createdAt: "2026-09-01T15:00:00.000Z",
};

describe("ChecklistItems", () => {
  it("changes an item's status and links supplements to their draft", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ChecklistItems
        items={[item("i1", "Application form"), item("i2", "Supplement · 250 words", { kind: "supplement", essayId: "es1", status: "in_progress" })]}
        collegeId="100"
        readOnly={false}
      />,
    );
    expect(screen.getByRole("link", { name: "Open draft" }).getAttribute("href")).toBe("/essays/es1");
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Application form status" }), { target: { value: "done" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/application-items/i1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("starts a college essay from a supplement, links it to the item, then opens it (R2P-17)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/essays") ? json({ id: "es9" }, 201) : json(item("i2", "Why State U? · 250 words", { kind: "supplement", essayId: "es9" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChecklistItems items={[item("i2", "Why State U? · 250 words", { kind: "supplement" })]} collegeId="100" readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Start essay" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/essays/es9"));
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/essays", "POST"],
      ["/api/v1/application-items/i2", "PATCH"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      title: "Why State U? · 250 words",
      prompt: "Why State U? · 250 words",
      targetType: "college",
      targetCollegeId: "100",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ essayId: "es9" });
  });

  it("is read-only for parents", () => {
    render(<ChecklistItems items={[item("i1", "Application form", { status: "done" }), item("i3", "Supplement", { kind: "supplement" })]} collegeId="100" readOnly />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start essay" })).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
  });
});

describe("Recommenders", () => {
  it("adds a recommender", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(okafor, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<Recommenders recommenders={[]} entryId="e1" past={[]} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ms. Patel" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "patel@school.example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Add recommender" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      name: "Ms. Patel",
      email: "patel@school.example.org",
      relationship: "",
    });
  });

  it("requests a letter and explains the helper link that was created", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json(
        {
          id: "q1",
          recommenderId: "r1",
          collegeListId: "e1",
          scholarshipApplicationId: null,
          helperLinkId: "h1",
          status: "requested",
          requestedAt: "2026-10-06T15:00:00.000Z",
          updatedAt: "2026-10-06T15:00:00.000Z",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Recommenders recommenders={[okafor]} entryId="e1" past={[]} timeZone="America/Chicago" />);
    const form = screen.getByRole("form", { name: "Ask for a letter" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Message" }), { target: { value: "Could you write for State U?" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Request sent to Mr. Okafor"));
    expect(screen.getByRole("status").textContent).toContain("helper link");
    expect(screen.getByRole("link", { name: "Family → Helper links" }).getAttribute("href")).toBe("/family");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/recommenders/requests");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      recommenderId: "r1",
      collegeListId: "e1",
      message: "Could you write for State U?",
    });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("lists past requests for this school with each helper link's state (D33)", () => {
    render(
      <Recommenders
        recommenders={[okafor]}
        entryId="e1"
        timeZone="America/Chicago"
        past={[
          { id: "q2", recommenderName: "Mr. Okafor", status: "confirmed", requestedAt: "2026-10-01T15:00:00.000Z", link: { state: "active", expiresAt: "2026-10-31T15:00:00.000Z" } },
          { id: "q1", recommenderName: "Ms. Patel", status: "requested", requestedAt: "2026-09-02T15:00:00.000Z", link: { state: "expired", expiresAt: "2026-10-02T15:00:00.000Z" } },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Letters you asked for" });
    expect(within(list).getAllByRole("listitem").map((li) => li.firstElementChild?.textContent)).toEqual([
      "Mr. Okafor · asked Oct 1Helper link open until Oct 31",
      "Ms. Patel · asked Sep 2Helper link expired",
    ]);
    expect((screen.getByRole("combobox", { name: "Mr. Okafor letter status" }) as HTMLSelectElement).value).toBe("confirmed");
    expect((screen.getByRole("combobox", { name: "Ms. Patel letter status" }) as HTMLSelectElement).value).toBe("requested");
  });

  it("updates a past request's status with PATCH /recommendations/:id, then refreshes (R2P-11)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ id: "q1", status: "submitted" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Recommenders
        recommenders={[okafor]}
        entryId="e1"
        timeZone="America/Chicago"
        past={[{ id: "q1", recommenderName: "Mr. Okafor", status: "requested", requestedAt: "2026-09-02T15:00:00.000Z", link: null }]}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Mr. Okafor letter status" });
    expect(within(select).getAllByRole("option").map((o) => [o.textContent, (o as HTMLOptionElement).disabled])).toEqual([
      ["Asked", true],
      ["Agreed to write", false],
      ["Submitted", false],
      ["Declined", false],
    ]);
    fireEvent.change(select, { target: { value: "submitted" } });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/recommendations/q1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"submitted"}' });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges/CollegeDetail`
Expected: FAIL with `Failed to resolve import "./ChecklistItems"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/colleges/ChecklistItems.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { ApplicationItem, Essay, ItemStatus } from "@scholarcrew/domain";
import { Button, Select } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { ITEM_STATUS_OPTIONS } from "./colleges";
import styles from "./colleges.module.css";

/**
 * CO-03: each item can be to do, in progress, done, or not needed.
 * R2P-17: a supplement with no draft gets "Start essay" (students only), which creates a college essay,
 * links it to the item, and opens Essay Studio.
 */
export function ChecklistItems({ items, collegeId, readOnly }: { items: ApplicationItem[]; collegeId: string; readOnly: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  async function setStatus(id: string, status: ItemStatus) {
    setError(null);
    try {
      await api<ApplicationItem>(`/application-items/${id}`, { method: "PATCH", body: { status } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function startEssay(item: ApplicationItem) {
    setError(null);
    setStarting(item.id);
    try {
      const essay = await api<Essay>("/essays", {
        method: "POST",
        body: { title: item.label.slice(0, 200), prompt: item.label, targetType: "college", targetCollegeId: collegeId },
      });
      await api<ApplicationItem>(`/application-items/${item.id}`, { method: "PATCH", body: { essayId: essay.id } });
      router.push(`/essays/${essay.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setStarting(null);
    }
  }

  return (
    <>
      <ul className={styles.items}>
        {items.map((i) => (
          <li key={i.id}>
            <div>
              <div>{i.label}</div>
              <div className={styles.sub}>
                {i.dueOn ? `Due ${dateShort(i.dueOn)}` : "No date"}
                {i.essayId ? (
                  <>
                    {" · "}
                    <a href={`/essays/${i.essayId}`}>Open draft</a>
                  </>
                ) : null}
              </div>
              {!readOnly && i.kind === "supplement" && !i.essayId ? (
                <Button variant="line" size="sm" icon="pen" disabled={starting !== null} onClick={() => void startEssay(i)}>
                  {starting === i.id ? "Starting…" : "Start essay"}
                </Button>
              ) : null}
            </div>
            {readOnly ? (
              <span>{ITEM_STATUS_OPTIONS.find((o) => o.value === i.status)?.label}</span>
            ) : (
              <Select
                label={`${i.label} status`}
                options={ITEM_STATUS_OPTIONS}
                value={i.status}
                onChange={(e) => void setStatus(i.id, e.target.value as ItemStatus)}
              />
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
```

`apps/web/src/components/colleges/Recommenders.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { RecRequest, RecRequestPatch, RecStatus, Recommender } from "@scholarcrew/domain";
import { Button, Card, Select, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { type PastRequest, REC_STATUS_LABEL } from "./colleges";
import styles from "./colleges.module.css";

/** R2P-11: "Asked" is shown for a new request but can't be picked; the other three go to `PATCH /recommendations/:id`. */
const STATUS_CHOICES: RecStatus[] = ["requested", "confirmed", "submitted", "declined"];

function linkText(link: PastRequest["link"], timeZone: string): string {
  if (!link) return "No helper link";
  if (link.state === "revoked") return "Helper link turned off";
  if (link.state === "expired") return "Helper link expired";
  return `Helper link open until ${instantShort(link.expiresAt, timeZone)}`;
}

/** CO-07: track recommenders, past requests (D33), and send a request with a scoped brag-sheet link (HL-02). */
export function Recommenders({
  recommenders,
  entryId,
  past,
  timeZone,
}: {
  recommenders: Recommender[];
  entryId: string;
  past: PastRequest[];
  timeZone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [recommenderId, setRecommenderId] = useState(recommenders[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Recommender>("/recommenders", { body: { name: name.trim(), email: email.trim(), relationship: relationship.trim() } });
      setName("");
      setEmail("");
      setRelationship("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function request(event: FormEvent) {
    event.preventDefault();
    const who = recommenders.find((r) => r.id === recommenderId);
    if (!who) return setError("Add a recommender first.");
    setBusy(true);
    setError(null);
    try {
      await api<RecRequest>("/recommenders/requests", { body: { recommenderId, collegeListId: entryId, message: message.trim() } });
      setSent(who.name);
      setMessage("");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function setRecStatus(id: string, value: string) {
    if (value !== "confirmed" && value !== "submitted" && value !== "declined") return;
    const body: RecRequestPatch = { status: value };
    setBusy(true);
    setError(null);
    try {
      await api<RecRequest>(`/recommendations/${id}`, { method: "PATCH", body });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Recommenders">
      <ul className={styles.kv}>
        {recommenders.map((r) => (
          <li key={r.id}>
            <span>{r.name}</span>
            <span className={styles.sub}>{r.relationship || r.email}</span>
          </li>
        ))}
      </ul>
      {past.length > 0 ? (
        <>
          <h3 className={styles.sectionTitle}>Letters you asked for</h3>
          <ul className={styles.kv} aria-label="Letters you asked for">
            {past.map((p) => (
              <li key={p.id}>
                <div>
                  <div>
                    {[p.recommenderName, p.requestedAt ? `asked ${instantShort(p.requestedAt, timeZone)}` : null].filter(Boolean).join(" · ")}
                  </div>
                  <div className={styles.sub}>{linkText(p.link, timeZone)}</div>
                </div>
                {/* Native select so "Asked" can be shown but disabled; the UI kit's Select has no disabled options. No path creates `draft`. */}
                <select
                  aria-label={`${p.recommenderName} letter status`}
                  className={styles.statusSelect}
                  value={p.status === "draft" ? "requested" : p.status}
                  disabled={busy}
                  onChange={(e) => void setRecStatus(p.id, e.target.value)}
                >
                  {STATUS_CHOICES.map((s) => (
                    <option key={s} value={s} disabled={s === "requested"}>
                      {REC_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {recommenders.length > 0 ? (
        <form aria-label="Ask for a letter" className={shared.form} onSubmit={request}>
          <Select
            label="Recommender"
            options={recommenders.map((r) => ({ value: r.id, label: r.name }))}
            value={recommenderId}
            onChange={(e) => setRecommenderId(e.target.value)}
          />
          <TextArea label="Message" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          <Button variant="primary" type="submit" disabled={busy}>
            Send request
          </Button>
        </form>
      ) : null}
      {sent ? (
        <p className={styles.picked} role="status">
          {`Request sent to ${sent}. We created a helper link that shows only your activities and stories, expires in 30 days, and emailed it to them. Manage it under `}
          <a href="/family">Family → Helper links</a>.
        </p>
      ) : null}
      <h3 className={styles.sectionTitle}>Add a recommender</h3>
      <form aria-label="Add a recommender" className={shared.form} onSubmit={add}>
        <TextInput label="Name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label="Email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="How they know you (optional)" maxLength={120} value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        <Button variant="line" type="submit" icon="plus" disabled={busy}>
          Add recommender
        </Button>
      </form>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/app/(app)/colleges/[entryId]/page.tsx`:

```tsx
import { ChecklistItems } from "@/components/colleges/ChecklistItems";
import { CollegeTable } from "@/components/colleges/CollegeTable";
import { Recommenders } from "@/components/colleges/Recommenders";
import {
  FIT_LABEL,
  OUTSIDE_POLICY_NOTE,
  PLAN_LABEL,
  type PastRequest,
  bestOfficial,
  meritRows,
  pastRequests,
  testPolicyLabel,
  withGaps,
} from "@/components/colleges/colleges";
import styles from "@/components/colleges/colleges.module.css";
import { ContextCrew } from "@/components/scholarships/ContextCrew";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { dateShort, daysLabel, instantShort, usd } from "@/lib/format";
import { getCollege, getCollegeList, listApplicationItems, listRecRequests, listRecommenders } from "@scholarcrew/core/colleges";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { listHelperLinks } from "@scholarcrew/core/helpers";
import { getCosts } from "@scholarcrew/core/money";
import { listTestScores } from "@scholarcrew/core/prep";
import { getProfile } from "@scholarcrew/core/profile";
import type { Conversation, Message, Recommender } from "@scholarcrew/domain";
import { daysUntil } from "@scholarcrew/engines";
import { Badge, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CollegeDetailPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) notFound();
  const list = await readShared(() => getCollegeList(v.deps, v.actor, studentId));
  const entry = list?.find((e) => e.id === entryId);
  if (!list || !entry) notFound();
  const [college, items, costs, profile, scores] = await Promise.all([
    getCollege(v.deps, v.actor, entry.collegeId),
    readShared(() => listApplicationItems(v.deps, v.actor, entry.id)),
    readShared(() => getCosts(v.deps, v.actor, studentId)),
    readShared(() => getProfile(v.deps, v.actor, studentId)),
    readShared(() => listTestScores(v.deps, v.actor, studentId)),
  ]);
  const entries = withGaps(list, costs ?? []);
  const gap = entries.find((e) => e.id === entry.id)?.gapUsd ?? null;
  const act = bestOfficial(scores ?? [], "ACT");
  const sat = bestOfficial(scores ?? [], "SAT");
  const merit = meritRows(college.meritTiers, profile?.gpaUnweighted ?? null, act, sat);
  const days = entry.deadline ? daysUntil(entry.deadline, v.deps.clock.now(), v.timeZone) : null;
  // Students only: recommenders, past requests (GET /recommendations' service, D33), and their helper links.
  let recommenders: Recommender[] = [];
  let past: PastRequest[] = [];
  let room: { conversation: Conversation | null; messages: Message[] } | null = null;
  if (!v.isParent) {
    const [recs, requests, links, conversations] = await Promise.all([
      listRecommenders(v.deps, v.actor),
      listRecRequests(v.deps, v.actor),
      listHelperLinks(v.deps, v.actor),
      listConversations(v.deps, v.actor),
    ]);
    recommenders = recs;
    past = pastRequests(requests, links, recs, entry.id, v.deps.clock.now());
    const existing = conversations.find((c) => c.room === "college" && c.roomRefId === college.id) ?? null;
    room = { conversation: existing, messages: existing ? await getMessages(v.deps, v.actor, existing.id) : [] };
  }

  const scoreNote =
    act !== null || sat !== null
      ? `Your best official ${[act !== null ? `ACT ${act}` : null, sat !== null ? `SAT ${sat}` : null].filter(Boolean).join(" and ")}.`
      : "No official scores yet.";

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Colleges</h1>
          <p className={shared.sub}>
            <a href="/colleges">All schools</a> · {entry.college.name}
          </p>
        </div>
      </div>
      <div className={styles.layout}>
        <Card>
          <CollegeTable entries={entries} selectedId={entry.id} />
        </Card>
        <div className={shared.form}>
          <Card padding="lg">
            <div className={shared.roomTop}>
              <Eyebrow>
                <Who role="atlas" size="sm" /> <span>{`· ${college.name}`}</span>
              </Eyebrow>
              <Badge tone="neutral">{FIT_LABEL[entry.fit]}</Badge>
            </div>
            <h2>{`${PLAN_LABEL[entry.plan]}${entry.deadline ? ` · ${dateShort(entry.deadline)}` : ""}`}</h2>
            <p className={styles.sub}>
              {[
                days !== null ? (days >= 0 ? `${daysLabel(days)} left` : "Deadline passed") : null,
                college.verifiedAt ? `requirements verified ${instantShort(college.verifiedAt, v.timeZone)}` : "requirements not verified yet",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h3 className={styles.sectionTitle}>{`Checklist · ${entry.itemsDone} of ${entry.itemsTotal}`}</h3>
            {items ? <ChecklistItems items={items} collegeId={entry.collegeId} readOnly={v.isParent} /> : <p className={shared.muted}>Not shared.</p>}
            <h3 className={styles.sectionTitle}>Money</h3>
            <ul className={styles.kv}>
              <li>
                <span>Gap / yr</span>
                <b>{gap === null ? "Not estimated" : usd(gap)}</b>
              </li>
              {merit.length === 0 ? (
                <li>
                  <span>Merit aid</span>
                  <b>No automatic merit tiers on file</b>
                </li>
              ) : (
                merit.map((m) => (
                  <li key={m.label}>
                    <span>{m.label}</span>
                    <b>{m.qualifies ? `${m.text} · you qualify` : m.text}</b>
                  </li>
                ))
              )}
              <li>
                <span>Aid priority</span>
                <b>{college.aidPriorityDate ? `Submit the FAFSA by ${dateShort(college.aidPriorityDate)}` : "No priority date listed"}</b>
              </li>
              <li>
                <span>Outside $</span>
                <b>{OUTSIDE_POLICY_NOTE[college.outsidePolicy]}</b>
              </li>
            </ul>
            <h3 className={styles.sectionTitle}>Testing</h3>
            <p>{`${testPolicyLabel(college.testPolicy, college.superscore)}. ${scoreNote}`}</p>
          </Card>
          {v.isParent ? null : <Recommenders recommenders={recommenders} entryId={entry.id} past={past} timeZone={v.timeZone} />}
          {room ? (
            <ContextCrew
              room="college"
              refId={college.id}
              title={college.name}
              lead="atlas"
              placeholder={`Ask about ${college.name}…`}
              chips={[
                { role: "ledger", text: "@Ledger what will it really cost?" },
                { role: "prep", text: "@Prep should I send my scores?" },
              ]}
              timeZone={v.timeZone}
              conversation={room.conversation}
              messages={room.messages}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/colleges && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 18 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/colleges/ChecklistItems.tsx apps/web/src/components/colleges/Recommenders.tsx apps/web/src/components/colleges/CollegeDetail.test.tsx "apps/web/src/app/(app)/colleges/[entryId]/page.tsx"
git commit -m "feat(web): college detail with checklist, recommenders, merit tiers, and crew room"
```

### Q20: Money model, offer fixtures, and styles (MO-01..MO-03, MO-06, MO-07, MO-10)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/money/fixtures.ts` (the mockup 06 comparison as test data; not a test file):

```ts
import type { OfferComparison, OfferLine, OfferWithLines } from "@scholarcrew/domain";

export const STATE_U = "11111111-0000-4000-8000-000000000001";
export const RIVERSIDE = "11111111-0000-4000-8000-000000000002";
export const NORTHGATE = "11111111-0000-4000-8000-000000000003";

export const comparison: OfferComparison = {
  columns: [
    { offerId: STATE_U, collegeId: "100", collegeName: "State U", costOfAttendanceUsd: 27800, freeMoneyUsd: 18600, workStudyUsd: 2000, loansUsd: 5500, letterSaysOweUsd: 1700, reallyCostsUsd: 9200, fourYearUsd: 36800, oneTimeFreeUsd: 0, warnings: ["Merit $3,000 renews at 3.0 GPA"] },
    { offerId: RIVERSIDE, collegeId: "200", collegeName: "Riverside College", costOfAttendanceUsd: 31200, freeMoneyUsd: 24400, workStudyUsd: 0, loansUsd: 3500, letterSaysOweUsd: 3300, reallyCostsUsd: 6800, fourYearUsd: 45200, oneTimeFreeUsd: 6000, warnings: ["$6,000 Riverside Welcome Grant is year 1 only"] },
    { offerId: NORTHGATE, collegeId: "300", collegeName: "Northgate University", costOfAttendanceUsd: 68400, freeMoneyUsd: 55600, workStudyUsd: 3000, loansUsd: 5500, letterSaysOweUsd: 4300, reallyCostsUsd: 12800, fourYearUsd: 51200, oneTimeFreeUsd: 0, warnings: [] },
  ],
  lowestFourYearOfferId: STATE_U,
  assumptions: ["Assumes costs stay flat and renewable awards are kept."],
};

export function line(o: Partial<OfferLine> = {}): OfferLine {
  return {
    id: "22222222-0000-4000-8000-000000000001",
    offerId: STATE_U,
    position: 0,
    label: "State U Grant",
    amountUsd: 15600,
    category: "grant",
    renewable: true,
    renewalCondition: "",
    page: 1,
    citedText: "State U Grant ... $15,600",
    userCorrected: false,
    ...o,
  };
}

export function offer(o: Partial<OfferWithLines> = {}): OfferWithLines {
  return {
    id: STATE_U,
    collegeId: "100",
    collegeName: "State U",
    awardYear: "2027-28",
    documentId: "33333333-0000-4000-8000-000000000001",
    status: "confirmed",
    costOfAttendanceUsd: 27800,
    createdAt: "2027-03-01T15:00:00.000Z",
    confirmedAt: "2027-03-02T15:00:00.000Z",
    parseJobId: null,
    lines: [
      line(),
      line({ id: "22222222-0000-4000-8000-000000000002", position: 1, label: "Merit Scholarship", amountUsd: 3000, category: "scholarship" }),
      line({ id: "22222222-0000-4000-8000-000000000003", position: 2, label: "Federal Work-Study", amountUsd: 2000, category: "work_study", page: 2 }),
      line({ id: "22222222-0000-4000-8000-000000000004", position: 3, label: "Direct Subsidized Loan", amountUsd: 3500, category: "loan_federal_subsidized", page: 2 }),
    ],
    ...o,
  };
}
```

`apps/web/src/components/money/offers.test.ts`:

```ts
import type { CostSummary } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { comparison, offer } from "./fixtures";
import { axisMaxFor, budgetLine, endParts, pageChip, pendingLine, sourceLine } from "./offers";

describe("offer helpers", () => {
  it("rounds the shared axis up to the next $20k", () => {
    expect(axisMaxFor(comparison.columns)).toBe(80000);
    expect(axisMaxFor([])).toBe(20000);
  });

  it("says when year 1 is cheaper than later years", () => {
    const [stateU, riverside] = comparison.columns;
    expect(stateU && endParts(stateU)).toEqual({ amount: "$9,200", rest: "really costs you" });
    expect(riverside && endParts(riverside)).toEqual({ amount: "$6,800", rest: "this year, then $12,800 a year after" });
  });

  it("finds the letter page for a group of lines (MO-07)", () => {
    expect(pageChip(offer().lines, ["grant", "scholarship"])).toEqual({ label: "p.1", citedText: "State U Grant ... $15,600" });
    expect(pageChip(offer().lines, ["loan_private"])).toBeNull();
  });
});

describe("cost lines", () => {
  const cost: CostSummary = {
    collegeId: "100",
    collegeName: "State U",
    source: "scorecard",
    sourceLabel: "College Scorecard net price, $48k–75k",
    costOfAttendanceUsd: 27800,
    freeMoneyUsd: 18600,
    gapUsd: 9200,
    pendingUsd: 2500,
    gapIfPendingWinUsd: 6700,
    isEstimate: true,
    budgetUsd: 6000,
    gapAfterBudgetUsd: 3200,
  };

  it("labels the source, pending applications, and the family budget", () => {
    expect(sourceLine(cost)).toBe("College Scorecard net price, $48k–75k · estimate");
    expect(sourceLine({ ...cost, isEstimate: false })).toBe("College Scorecard net price, $48k–75k");
    expect(pendingLine(cost)).toBe("$2,500 in pending applications · gap $6,700 if they come through");
    expect(pendingLine({ ...cost, pendingUsd: 0 })).toBeNull();
    expect(budgetLine(cost)).toBe("Family budget $6,000/yr · $3,200 left after it");
    expect(budgetLine({ ...cost, gapAfterBudgetUsd: 0 })).toBe("Family budget $6,000/yr · covers the gap");
    expect(budgetLine({ ...cost, budgetUsd: null, gapAfterBudgetUsd: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/money/offers`
Expected: FAIL with `Failed to resolve import "./offers"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/money/offers.ts`:

```ts
import { usd } from "@/lib/format";
import type { CostSummary, OfferColumn, OfferLine, OfferLineCategory, OfferStatus } from "@scholarcrew/domain";

export const CATEGORY_LABEL: Record<OfferLineCategory, string> = {
  grant: "Grant (free)",
  scholarship: "Scholarship (free)",
  work_study: "Work-study (you earn it)",
  loan_federal_subsidized: "Federal subsidized loan",
  loan_federal_unsubsidized: "Federal unsubsidized loan",
  loan_parent_plus: "Parent PLUS loan",
  loan_private: "Private loan",
  other: "Other",
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  uploaded: "Uploaded",
  parsing: "Aid is reading it",
  needs_review: "Ready for your review",
  confirmed: "Confirmed",
  failed: "Couldn't read it",
};

// R3V-8: free money is 02's `FREE_CATEGORIES` (imported where it's used), not a copy here.
export const WORK: OfferLineCategory[] = ["work_study"];
export const LOANS: OfferLineCategory[] = ["loan_federal_subsidized", "loan_federal_unsubsidized", "loan_parent_plus", "loan_private"];

/** One shared axis for every bar, rounded up to the next $20k. */
export function axisMaxFor(columns: Array<Pick<OfferColumn, "costOfAttendanceUsd">>): number {
  const max = Math.max(0, ...columns.map((c) => c.costOfAttendanceUsd));
  return Math.max(20000, Math.ceil(max / 20000) * 20000);
}

/** The words after each bar: one-time grants make later years cost more. */
export function endParts(c: Pick<OfferColumn, "reallyCostsUsd" | "oneTimeFreeUsd">): { amount: string; rest: string } {
  if (c.oneTimeFreeUsd > 0) {
    return { amount: usd(c.reallyCostsUsd), rest: `this year, then ${usd(c.reallyCostsUsd + c.oneTimeFreeUsd)} a year after` };
  }
  return { amount: usd(c.reallyCostsUsd), rest: "really costs you" };
}

/** MO-07: the first letter page behind a group of lines, with the cited text. */
export function pageChip(
  lines: Array<Pick<OfferLine, "category" | "page" | "citedText">>,
  categories: OfferLineCategory[],
): { label: string; citedText: string } | null {
  const hit = lines.filter((l) => categories.includes(l.category) && l.page !== null).sort((a, b) => (a.page ?? 0) - (b.page ?? 0))[0];
  return hit && hit.page !== null ? { label: `p.${hit.page}`, citedText: hit.citedText } : null;
}

export function sourceLine(c: Pick<CostSummary, "sourceLabel" | "isEstimate">): string {
  return c.isEstimate ? `${c.sourceLabel} · estimate` : c.sourceLabel;
}

export function pendingLine(c: Pick<CostSummary, "pendingUsd" | "gapIfPendingWinUsd">): string | null {
  if (c.pendingUsd <= 0) return null;
  return `${usd(c.pendingUsd)} in pending applications · gap ${usd(c.gapIfPendingWinUsd)} if they come through`;
}

/** MO-10: the parent's shared yearly budget and what's left after it. */
export function budgetLine(c: Pick<CostSummary, "budgetUsd" | "gapAfterBudgetUsd">): string | null {
  if (c.budgetUsd === null) return null;
  const after = c.gapAfterBudgetUsd ?? 0;
  return `Family budget ${usd(c.budgetUsd)}/yr · ${after > 0 ? `${usd(after)} left after it` : "covers the gap"}`;
}
```

`apps/web/src/components/money/money.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.big {
  font-size: 26px;
  font-weight: 700;
}

.line {
  font-size: 13px;
  color: var(--muted);
}

.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border: 1px solid var(--navy-line);
  border-radius: var(--r);
  background: var(--navy-soft);
}

.banner p {
  flex: 1;
  min-width: 260px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.table th,
.table td {
  padding: 9px 12px;
  border-top: 1px solid var(--line-2);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.table th:first-child,
.table td:first-child {
  text-align: left;
}

.table thead th {
  border-top: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.really td {
  background: var(--crit-soft);
  font-weight: 700;
}

.chip {
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--wash);
  font-size: 11px;
  color: var(--ink-2);
  cursor: help;
}

.cite {
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--wash);
  font-size: 12.5px;
  color: var(--ink-2);
}

/* Read by screen readers, not shown: the comparison table's page citations (MO-07). */
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13.5px;
}

.steps li + li {
  margin-top: 6px;
}

.lineRow {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 120px minmax(0, 1.2fr) auto auto;
  gap: 12px;
  align-items: end;
  padding: 12px 0;
  border-top: 1px solid var(--line-2);
}

.lineRow:first-child {
  border-top: 0;
}

.items li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.items li:first-child {
  border-top: 0;
}

@media (max-width: 900px) {
  .lineRow {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/money && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money/offers.ts apps/web/src/components/money/offers.test.ts apps/web/src/components/money/fixtures.ts apps/web/src/components/money/money.module.css
git commit -m "feat(web): offer and cost helpers, comparison fixture, and money styles"
```

### Q21: Costs, calculator result, FAFSA and CSS checklists, special circumstances, verification, and /money (MO-01..MO-03, MO-10, AID-01..AID-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/money/CostsAid.test.tsx`:

```tsx
// @vitest-environment jsdom
import MoneyPage from "@/app/(app)/money/page";
import type { AidChecklist, AidDeadline, CostSummary } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AidChecklists, AidHelpCards } from "./AidChecklists";
import { CalculatorForm } from "./CalculatorForm";
import { CostCards } from "./CostCards";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getCosts: vi.fn(),
  getAidChecklists: vi.fn(),
  listAidDeadlines: vi.fn(),
  getCollegeList: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money" }));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/money", () => ({ getCosts: m.getCosts }));
vi.mock("@scholarcrew/core/aid", () => ({ getAidChecklists: m.getAidChecklists, listAidDeadlines: m.listAidDeadlines }));
vi.mock("@scholarcrew/core/colleges", () => ({ getCollegeList: m.getCollegeList }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const cost: CostSummary = {
  collegeId: "100",
  collegeName: "State U",
  source: "calculator",
  sourceLabel: "State U net price calculator",
  costOfAttendanceUsd: 27800,
  freeMoneyUsd: 18600,
  gapUsd: 9200,
  pendingUsd: 0,
  gapIfPendingWinUsd: 9200,
  isEstimate: false,
  budgetUsd: 6000,
  gapAfterBudgetUsd: 3200,
};
const fafsa: AidChecklist = {
  program: "fafsa",
  awardYear: "2027-28",
  collegeId: null,
  collegeName: null,
  doneCount: 1,
  totalCount: 2,
  items: [
    { id: "a1", awardYear: "2027-28", program: "fafsa", collegeId: null, key: "studentaid_account", title: "Create your StudentAid.gov account", assignee: "student", status: "done", dueOn: null, completedAt: "2026-10-01T15:00:00.000Z" },
    { id: "a2", awardYear: "2027-28", program: "fafsa", collegeId: null, key: "contributor_consent", title: "Give consent to share federal tax information", assignee: "parent", status: "todo", dueOn: "2026-12-01", completedAt: null },
  ],
};
const deadline: AidDeadline = {
  id: "d1",
  awardYear: "2027-28",
  state: "TX",
  program: "Texas Application for State Financial Aid priority",
  deadline: "2027-01-15",
  note: "Earlier is better.",
  sourceUrl: "https://aid.example.org/tx",
  verifiedAt: "2026-09-30T15:00:00.000Z",
};

describe("CostCards", () => {
  it("shows the gap, its source, and the family budget line", () => {
    render(<CostCards costs={[cost]} />);
    expect(screen.getByText("$9,200 a year")).toBeTruthy();
    expect(screen.getByText("State U net price calculator")).toBeTruthy();
    expect(screen.getByText("Family budget $6,000/yr · $3,200 left after it")).toBeTruthy();
  });
});

describe("CalculatorForm", () => {
  it("validates and saves a calculator result", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(cost));
    vi.stubGlobal("fetch", fetchMock);
    render(<CalculatorForm colleges={[{ id: "100", name: "State U" }]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cost to attend for a year" }), { target: { value: "27,800" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Grants and scholarships it showed" }), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter whole dollars, up to $200,000.");
    fireEvent.change(screen.getByRole("textbox", { name: "Grants and scholarships it showed" }), { target: { value: "18600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/costs/calculator");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ collegeId: "100", costOfAttendanceUsd: 27800, grantsUsd: 18600 });
  });
});

describe("AidChecklists", () => {
  it("checks off a step, marks parent steps, and lists state deadlines", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...fafsa.items[1], status: "done" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AidChecklists checklists={[fafsa]} deadlines={[deadline]} readOnly={false} />);
    expect(screen.getByRole("heading", { name: "FAFSA · 2027-28" })).toBeTruthy();
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    expect(screen.getByText(/Parent step/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Give consent to share federal tax information" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/aid/items/a2");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ status: "done" });
    expect(screen.getByText("Texas Application for State Financial Aid priority")).toBeTruthy();
    expect(screen.getByText("Jan 15")).toBeTruthy();
  });
});

describe("AidHelpCards (AID-04, AID-05)", () => {
  it("explains a special-circumstances review and verification, with Ask Aid links for students only", () => {
    render(<AidHelpCards readOnly={false} />);
    const changed = screen.getByRole("region", { name: "Family finances changed?" });
    expect(within(changed).getByText(/Schools can adjust it through a professional judgment review/)).toBeTruthy();
    expect(within(changed).getByText("A letter from a parent explaining what changed and when")).toBeTruthy();
    const ask = (name: string) => new URL(screen.getByRole("link", { name }).getAttribute("href") ?? "", "http://localhost").searchParams.get("prefill");
    expect(ask("Ask Aid about a review")).toBe("@Aid my family's finances changed. How do I ask my schools for a review, and what should I gather?");
    const verify = screen.getByRole("region", { name: "Selected for verification?" });
    expect(within(verify).getByText("The school's verification worksheet, filled out and signed")).toBeTruthy();
    expect(ask("Ask Aid to track it")).toBe("@Aid I was selected for verification. Help me list what my school asked for and add the steps to my plan.");
    cleanup();
    render(<AidHelpCards readOnly />);
    expect(screen.getByRole("region", { name: "Family finances changed?" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ask Aid about a review" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ask Aid to track it" })).toBeNull();
  });
});

describe("money page calculator picker (R2P-13)", () => {
  it("offers every listed college, including one with no cost estimate yet, and none to parents", async () => {
    const deps = { clock: { now: () => new Date("2026-10-06T15:00:00.000Z") } };
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "s1", role: "student" },
      me: { user: { id: "s1", displayName: "Maya Rivera", role: "student", timeZone: "America/Chicago" }, onboardingComplete: true },
      deps,
    });
    m.getCosts.mockResolvedValue([cost]);
    m.getAidChecklists.mockResolvedValue([]);
    m.listAidDeadlines.mockResolvedValue([]);
    m.getCollegeList.mockResolvedValue([
      { collegeId: "100", college: { name: "State U" } },
      { collegeId: "200", college: { name: "Riverside College" } },
    ]);
    render(await MoneyPage());
    expect(m.getCollegeList.mock.calls[0]?.[2]).toBe("s1");
    const picker = screen.getByRole("combobox", { name: "College" }) as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => [o.value, o.textContent])).toEqual([
      ["100", "State U"],
      ["200", "Riverside College"],
    ]);
    cleanup();
    m.requireAppActor.mockResolvedValue({
      actor: { kind: "user", userId: "p1", role: "parent" },
      me: { user: { id: "p1", displayName: "Dana Rivera", role: "parent", timeZone: "America/Chicago" }, onboardingComplete: true },
      deps,
    });
    m.getFamily.mockResolvedValue({ members: [{ userId: "s1", displayName: "Maya Rivera", memberRole: "student" }] });
    m.getCollegeList.mockClear();
    render(await MoneyPage());
    expect(screen.queryByRole("combobox", { name: "College" })).toBeNull();
    expect(m.getCollegeList).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/money/CostsAid`
Expected: FAIL with `Failed to resolve import "./AidChecklists"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/money/CostCards.tsx`:

```tsx
import { usd } from "@/lib/format";
import type { CostSummary } from "@scholarcrew/domain";
import { Card, EmptyState, GapBar } from "@scholarcrew/ui";
import styles from "./money.module.css";
import { budgetLine, pendingLine, sourceLine } from "./offers";

/** MO-01..MO-03 and MO-10: year-1 gap per listed college with its source. */
export function CostCards({ costs }: { costs: CostSummary[] }) {
  if (costs.length === 0) {
    return (
      <Card>
        <EmptyState title="No costs yet" icon="dollar">
          Add colleges to your list and Ledger estimates what each one really costs.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className={styles.grid}>
      {costs.map((c) => {
        const pending = pendingLine(c);
        const budget = budgetLine(c);
        return (
          <Card key={c.collegeId} title={c.collegeName}>
            <div className={styles.big}>{`${usd(c.gapUsd)} a year`}</div>
            <p className={styles.line}>gap after free money</p>
            <GapBar freeUsd={c.freeMoneyUsd} gapUsd={c.gapUsd} totalLabel="to attend" />
            <p className={styles.line}>{sourceLine(c)}</p>
            {pending ? <p className={styles.line}>{pending}</p> : null}
            {budget ? <p className={styles.line}>{budget}</p> : null}
          </Card>
        );
      })}
    </div>
  );
}
```

`apps/web/src/components/money/CalculatorForm.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { CostSummary } from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";

function dollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= 200_000 ? n : null;
}

/** MO-02: a school's own net price calculator result replaces the Scorecard estimate; a confirmed award letter outranks both (08 source order, R2P-6). */
export function CalculatorForm({ colleges }: { colleges: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [coa, setCoa] = useState("");
  const [grants, setGrants] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const costOfAttendanceUsd = dollars(coa);
    const grantsUsd = dollars(grants);
    if (costOfAttendanceUsd === null || grantsUsd === null) return setError("Enter whole dollars, up to $200,000.");
    setError(null);
    try {
      await api<CostSummary>("/costs/calculator", { method: "PUT", body: { collegeId, costOfAttendanceUsd, grantsUsd } });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (colleges.length === 0) return null;
  return (
    <Card title="Ran a school's net price calculator?">
      <form className={shared.form} onSubmit={save}>
        <Select
          label="College"
          options={colleges.map((c) => ({ value: c.id, label: c.name }))}
          value={collegeId}
          onChange={(e) => setCollegeId(e.target.value)}
        />
        <TextInput label="Cost to attend for a year" inputMode="numeric" value={coa} onChange={(e) => setCoa(e.target.value)} />
        <TextInput label="Grants and scholarships it showed" inputMode="numeric" value={grants} onChange={(e) => setGrants(e.target.value)} />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? <p className={shared.muted}>Saved. Ledger uses this instead of the Scorecard estimate until you confirm an award letter.</p> : null}
        <Button variant="primary" type="submit">
          Save result
        </Button>
      </form>
    </Card>
  );
}
```

`apps/web/src/components/money/AidChecklists.tsx`:

```tsx
"use client";

import { safeHref } from "@/lib/format";
import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { AidChecklist, AidChecklistItem, AidDeadline } from "@scholarcrew/domain";
import { Button, Card, Icon, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./money.module.css";

/** AID-01/AID-02 step lists (parent steps also show as family tasks) and AID-03 state deadlines. */
export function AidChecklists({
  checklists,
  deadlines,
  readOnly,
}: {
  checklists: AidChecklist[];
  deadlines: AidDeadline[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function setDone(item: AidChecklistItem, done: boolean) {
    setError(null);
    try {
      await api<AidChecklistItem>(`/aid/items/${item.id}`, { method: "PATCH", body: { status: done ? "done" : "todo" } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.stack}>
      {checklists.map((list) => (
        <Card
          key={`${list.program}:${list.collegeId ?? "all"}`}
          title={list.program === "fafsa" ? `FAFSA · ${list.awardYear}` : `CSS Profile · ${list.collegeName ?? "college"}`}
          aside={<span className={styles.line}>{`${list.doneCount} of ${list.totalCount} done`}</span>}
        >
          {list.items.map((item) => (
            <Toggle
              key={item.id}
              label={item.title}
              detail={[item.assignee === "parent" ? "Parent step" : null, item.dueOn ? `due ${dateShort(item.dueOn)}` : null]
                .filter(Boolean)
                .join(" · ")}
              checked={item.status === "done"}
              disabled={readOnly}
              onChange={(checked) => void setDone(item, checked)}
            />
          ))}
        </Card>
      ))}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {deadlines.length > 0 ? (
        <Card title="State aid deadlines">
          <ul className={styles.items}>
            {deadlines.map((d) => (
              <li key={d.id}>
                <div>
                  <div>{d.program}</div>
                  <div className={styles.line}>{d.note}</div>
                </div>
                <span>{d.deadline ? dateShort(d.deadline) : "No fixed date"}</span>
                {safeHref(d.sourceUrl) ? <a href={safeHref(d.sourceUrl)!} target="_blank" rel="noopener noreferrer" aria-label={`Source for ${d.program}`}>
                  <Icon name="ext" />
                </a> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

const REVIEW_STEPS = [
  "File the FAFSA (and CSS Profile, if a school asks) as usual, with the tax year it asks for.",
  "Email or call each school's financial aid office and ask for a special circumstances (professional judgment) review.",
  "Send the documents the office asks for, then follow up if you don't hear back within two weeks.",
];
const REVIEW_DOCS = [
  "A letter from a parent explaining what changed and when",
  "A layoff or termination letter, or proof of fewer hours",
  "Recent pay stubs or unemployment benefit statements",
  "Bills for large medical or care costs",
  "Divorce, separation, or death records, if one applies",
];
const VERIFY_DOCS = [
  "The school's verification worksheet, filled out and signed",
  "IRS tax return transcripts (or signed tax returns) for you and your parents",
  "W-2 forms for everyone who worked",
  "Proof of household size and how many are in college, if the worksheet asks",
  "Proof of identity or high school completion, if the school asks",
];

function HelpCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card title={title}>{children}</Card>
    </section>
  );
}

/**
 * AID-04: how to ask for a review when family finances change, and what to gather.
 * AID-05: the usual verification documents. Aid tracks them as plan items from chat (the ask link); there's no stored
 * verification checklist yet (see Deviations).
 */
export function AidHelpCards({ readOnly }: { readOnly: boolean }) {
  return (
    <div className={styles.stack}>
      <HelpCard title="Family finances changed?">
        <p className={styles.line}>
          A job loss, a big medical bill, or a divorce after you filed can change your aid. Schools can adjust it through a
          professional judgment review, but only if you ask.
        </p>
        <ol className={styles.steps}>
          {REVIEW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h4 className={styles.line}>Documents to gather</h4>
        <ul className={styles.steps}>
          {REVIEW_DOCS.map((doc) => (
            <li key={doc}>{doc}</li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            variant="soft"
            size="sm"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Aid my family's finances changed. How do I ask my schools for a review, and what should I gather?")}`}
          >
            Ask Aid about a review
          </Button>
        )}
      </HelpCard>
      <HelpCard title="Selected for verification?">
        <p className={styles.line}>
          A school may ask you to confirm what's on your FAFSA. Watch your StudentAid.gov account and each school's portal, then
          send what the school asks for by its deadline. Aid isn't released until verification is done.
        </p>
        <ul className={styles.steps}>
          {VERIFY_DOCS.map((doc) => (
            <li key={doc}>{doc}</li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            variant="soft"
            size="sm"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Aid I was selected for verification. Help me list what my school asked for and add the steps to my plan.")}`}
          >
            Ask Aid to track it
          </Button>
        )}
      </HelpCard>
    </div>
  );
}
```

`apps/web/src/app/(app)/money/page.tsx`:

```tsx
import { AidChecklists, AidHelpCards } from "@/components/money/AidChecklists";
import { CalculatorForm } from "@/components/money/CalculatorForm";
import { CostCards } from "@/components/money/CostCards";
import styles from "@/components/money/money.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getAidChecklists, listAidDeadlines } from "@scholarcrew/core/aid";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { getCosts } from "@scholarcrew/core/money";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="costs" />;
  const costs = await readShared(() => getCosts(v.deps, v.actor, studentId));
  if (!costs) return <NotShared studentName={v.studentName} what="costs" />;
  // R2P-13: the calculator picker lists every current-season college, not only the ones that already have an estimate.
  const [checklists, deadlines, list] = await Promise.all([
    readShared(() => getAidChecklists(v.deps, v.actor, studentId)),
    readShared(() => listAidDeadlines(v.deps, v.actor, studentId)),
    v.isParent ? Promise.resolve(null) : readShared(() => getCollegeList(v.deps, v.actor, studentId)),
  ]);
  const calculatorColleges = (list ?? []).map((e) => ({ id: e.collegeId, name: e.college.name }));
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Money</h1>
          <p className={shared.sub}>Year-1 cost after free money for each school · Ledger does the math, labeled by source</p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" icon="clip" href="/money/offers">
            Compare award letters
          </Button>
          {v.isParent ? null : (
            <Button variant="primary" icon="chat" href="/crew">
              Ask Ledger
            </Button>
          )}
        </div>
      </div>
      <div className={styles.stack}>
        <CostCards costs={costs} />
        {v.isParent ? null : <CalculatorForm colleges={calculatorColleges} />}
        <h2>Financial aid forms</h2>
        <AidChecklists checklists={checklists ?? []} deadlines={deadlines ?? []} readOnly={v.isParent} />
        <AidHelpCards readOnly={v.isParent} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/money && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money/CostCards.tsx apps/web/src/components/money/CalculatorForm.tsx apps/web/src/components/money/AidChecklists.tsx apps/web/src/components/money/CostsAid.test.tsx "apps/web/src/app/(app)/money/page.tsx"
git commit -m "feat(web): money page with gaps, calculator results, aid checklists, and aid help cards"
```

### Q22: Offer comparison view (MO-06, MO-07)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/money/OfferComparisonView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfferComparisonView } from "./OfferComparisonView";
import { comparison, offer } from "./fixtures";

afterEach(cleanup);

describe("OfferComparisonView", () => {
  it("leads with the lowest 4-year cost and the one-time grant warning", () => {
    render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    expect(screen.getByText("Over four years, State U costs least: $36,800.")).toBeTruthy();
    expect(
      screen.getByText("Riverside College looks cheapest this year ($6,800), but $6,000 of its free money only applies to the first year."),
    ).toBeTruthy();
  });

  it("draws the bars on a shared axis with end labels", () => {
    const { container } = render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    expect(container.querySelectorAll("[data-row]")).toHaveLength(3);
    expect(screen.getByText("$27,800 to attend")).toBeTruthy();
    expect(screen.getByText("this year, then $12,800 a year after")).toBeTruthy();
    expect(screen.getByText("$80k")).toBeTruthy();
  });

  it("fills the comparison table from the fixture", () => {
    render(<OfferComparisonView comparison={comparison} offers={[offer()]} />);
    const table = screen.getByRole("table", { name: "Offer comparison" });
    const cells = (name: RegExp) =>
      within(within(table).getByRole("row", { name })).getAllByRole("cell").map((c) => c.textContent);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "",
      "State U",
      "Riverside College",
      "Northgate University",
    ]);
    expect(cells(/^Cost to attend/)).toEqual(["$27,800", "$31,200", "$68,400"]);
    expect(cells(/^Free money/)).toEqual(["$18,600p.1Page 1: State U Grant ... $15,600", "$24,400", "$55,600"]);
    expect(cells(/^Work-study/)).toEqual(["$2,000p.2Page 2: State U Grant ... $15,600", "$0", "$3,000"]);
    expect(cells(/^Loans/)).toEqual(["$5,500p.2Page 2: State U Grant ... $15,600", "$3,500", "$5,500"]);
    expect(cells(/^What the letter says you owe/)).toEqual(["$1,700", "$3,300", "$4,300"]);
    expect(cells(/^Really costs you, year 1/)).toEqual(["$9,200", "$6,800", "$12,800"]);
    expect(cells(/^Over 4 years/)).toEqual(["Lowest $36,800", "$45,200", "$51,200"]);
    expect(cells(/^Watch for/)).toEqual(["Merit $3,000 renews at 3.0 GPA", "$6,000 Riverside Welcome Grant is year 1 only", "—"]);
    expect(within(table).getAllByText("p.1")[0]?.getAttribute("title")).toBe("Page 1: State U Grant ... $15,600");
    expect(within(table).getAllByText("p.1")[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(within(table).getByText("Page 1: State U Grant ... $15,600")).toBeTruthy();
    expect(screen.getByText("Assumes costs stay flat and renewable awards are kept.")).toBeTruthy();
  });

  it("explains an empty comparison", () => {
    render(<OfferComparisonView comparison={{ columns: [], lowestFourYearOfferId: null, assumptions: [] }} offers={[]} />);
    expect(screen.getByText("Confirm an award letter to compare offers")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/money/OfferComparisonView`
Expected: FAIL with `Failed to resolve import "./OfferComparisonView"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/money/OfferComparisonView.tsx`:

```tsx
import { usd } from "@/lib/format";
import { FREE_CATEGORIES, type OfferColumn, type OfferComparison, type OfferLineCategory, type OfferWithLines } from "@scholarcrew/domain";
import { Badge, Card, EmptyState, OfferBars, Who } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import styles from "./money.module.css";
import { LOANS, WORK, axisMaxFor, endParts, pageChip } from "./offers";

/** MO-07: the visible chip has the cited text as a hover title; a visually hidden span gives it to screen readers. */
function Chip({ offer, categories }: { offer: OfferWithLines | undefined; categories: OfferLineCategory[] }) {
  const chip = offer ? pageChip(offer.lines, categories) : null;
  if (!chip) return null;
  const cited = `Page ${chip.label.slice(2)}: ${chip.citedText}`;
  return (
    <>
      <span className={styles.chip} title={cited} aria-hidden="true">
        {chip.label}
      </span>
      <span className={styles.srOnly}>{cited}</span>
    </>
  );
}

function headline(c: OfferComparison): string[] {
  const lowest = c.columns.find((col) => col.offerId === c.lowestFourYearOfferId);
  if (!lowest) return [];
  const lines = [`Over four years, ${lowest.collegeName} costs least: ${usd(lowest.fourYearUsd)}.`];
  const cheapestNow = [...c.columns].sort((a, b) => a.reallyCostsUsd - b.reallyCostsUsd)[0];
  if (cheapestNow && cheapestNow.offerId !== lowest.offerId && cheapestNow.oneTimeFreeUsd > 0) {
    lines.push(
      `${cheapestNow.collegeName} looks cheapest this year (${usd(cheapestNow.reallyCostsUsd)}), but ${usd(cheapestNow.oneTimeFreeUsd)} of its free money only applies to the first year.`,
    );
  }
  return lines;
}

/** MO-06: year 1 bars on one axis, the full table, and Ledger's assumptions. MO-07: page chips. */
export function OfferComparisonView({ comparison, offers }: { comparison: OfferComparison; offers: OfferWithLines[] }) {
  if (comparison.columns.length === 0) {
    return (
      <Card>
        <EmptyState title="Confirm an award letter to compare offers" icon="clip">
          Upload a letter, check each line Aid labeled, then confirm it. Confirmed offers show up here side by side.
        </EmptyState>
      </Card>
    );
  }
  const byId = new Map(offers.map((o) => [o.id, o]));
  const cols = comparison.columns;
  const row = (label: ReactNode, cell: (c: OfferColumn) => ReactNode, className?: string) => (
    <tr className={className}>
      <th scope="row">{label}</th>
      {cols.map((c) => (
        <td key={c.offerId}>{cell(c)}</td>
      ))}
    </tr>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.banner}>
        <Who role="compass" />
        <div>
          {headline(comparison).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <Card title="Year 1: free money vs. what really costs you">
        <OfferBars
          axisMaxUsd={axisMaxFor(cols)}
          rows={cols.map((c) => {
            const end = endParts(c);
            return {
              label: c.collegeName,
              sub: `${usd(c.costOfAttendanceUsd)} to attend`,
              freeUsd: c.freeMoneyUsd,
              costUsd: c.reallyCostsUsd,
              endLabel: (
                <>
                  <b>{end.amount}</b> <span>{end.rest}</span>
                </>
              ),
            };
          })}
        />
      </Card>
      <Card>
        <table className={styles.table} aria-label="Offer comparison">
          <thead>
            <tr>
              <th scope="col" />
              {cols.map((c) => (
                <th key={c.offerId} scope="col">
                  {c.collegeName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row("Cost to attend", (c) => usd(c.costOfAttendanceUsd))}
            {row("Free money (grants + scholarships)", (c) => (
              <>
                {usd(c.freeMoneyUsd)}
                <Chip offer={byId.get(c.offerId)} categories={FREE_CATEGORIES} />
              </>
            ))}
            {row("Work-study (you earn it)", (c) => (
              <>
                {usd(c.workStudyUsd)}
                <Chip offer={byId.get(c.offerId)} categories={WORK} />
              </>
            ))}
            {row("Loans (you repay them)", (c) => (
              <>
                {usd(c.loansUsd)}
                <Chip offer={byId.get(c.offerId)} categories={LOANS} />
              </>
            ))}
            {row("What the letter says you owe", (c) => usd(c.letterSaysOweUsd))}
            {row("Really costs you, year 1", (c) => usd(c.reallyCostsUsd), styles.really)}
            {row("Over 4 years", (c) =>
              c.offerId === comparison.lowestFourYearOfferId ? (
                <>
                  <Badge tone="good">Lowest</Badge> {usd(c.fourYearUsd)}
                </>
              ) : (
                usd(c.fourYearUsd)
              ),
            )}
            {row("Watch for", (c) => (c.warnings.length > 0 ? c.warnings.join(" · ") : "—"))}
          </tbody>
        </table>
        {comparison.assumptions.map((a) => (
          <p key={a} className={styles.line}>
            {a}
          </p>
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/money && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 13 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money/OfferComparisonView.tsx apps/web/src/components/money/OfferComparisonView.test.tsx
git commit -m "feat(web): offer comparison bars and table with page citations"
```

### Q23: Award letter upload, appeal outline, loans, and /money/offers (MO-04, MO-06, MO-08, MO-09)

`createOffer` returns the offer with `parseJobId` (D31). When it's set, the upload follows `GET /jobs/:id/events` through plan 16's `useJobStream` and reads `GET /offers/:id` once the job ends. With no job id, or when the stream drops, it falls back to polling `GET /offers/:id` every 2 s, up to 60 times, until the status leaves `parsing`. The file's type and size are checked before anything is sent, since the server answers 413 past 10 MB (D-13-1). R2P-8: the parser reads PDFs only, so this form takes only `application/pdf` ("Upload the award letter as a PDF"). A failed letter offers "Remove and try again" (`DELETE /offers/:id`, then the same form), and the offers page's "Letters in progress" list has a Remove button on failed and `needs_review` letters (`RemoveOfferButton`). The failure copy matches the worker's `PARSE_FAILED_TEXT` (12 L8): upload a clearer PDF, or compare it by hand in the offer tool.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/money/UploadLetter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppealButton } from "./AppealButton";
import { RemoveOfferButton, UploadLetter } from "./UploadLetter";
import { STATE_U, offer } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money/offers" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const DOC = { id: "33333333-0000-4000-8000-000000000001", kind: "award_letter", filename: "stateu.pdf", mime: "application/pdf", sizeBytes: 2048, parseStatus: "none", uploadedAt: "2027-03-01T15:00:00.000Z" };
const pdf = () => new File(["%PDF-1.7"], "stateu.pdf", { type: "application/pdf" });

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Award letter file"), { target: { files: [file] } });
}

describe("UploadLetter", () => {
  it("takes only a PDF under 10 MB, checked before anything is sent (R2P-8)", () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    expect(screen.getByLabelText("Award letter file").getAttribute("accept")).toBe("application/pdf");
    expect(screen.getByText("Upload the award letter as a PDF (up to 10 MB).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Pick the award letter file.");
    pick(new File(["png"], "letter.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Upload the award letter as a PDF. Aid can only read PDFs.");
    pick(new File(["x"], "letter.docx", { type: "application/msword" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Upload the award letter as a PDF. Aid can only read PDFs.");
    const big = pdf();
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    pick(big);
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    expect(screen.getByRole("alert").textContent).toBe("This file is over 10 MB. Save just the award pages as a PDF and try again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads, creates the offer, waits for the parse, and links to the review", async () => {
    const replies = [
      json(DOC, 201),
      json(offer({ status: "parsing", lines: [] }), 201),
      json(offer({ status: "parsing", lines: [] })),
      json(offer({ status: "needs_review" })),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() => expect(screen.getByText("Aid is reading your letter…")).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("link", { name: "Review the lines" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "Review the lines" }).getAttribute("href")).toBe(`/money/offers/${STATE_U}`);
    const calls = fetchMock.mock.calls;
    expect(calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/documents", "POST"],
      ["/api/v1/offers", "POST"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
    ]);
    const form = calls[0]?.[1]?.body as FormData;
    expect(form.get("kind")).toBe("award_letter");
    expect((form.get("file") as File).name).toBe("stateu.pdf");
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ collegeId: "100", documentId: DOC.id, awardYear: "2027-28" });
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("follows the parse job over SSE when the offer has a parseJobId (D31)", async () => {
    const JOB = "44444444-0000-4000-8000-000000000001";
    const sources: Array<{ url: string; emit: (type: string, data?: string) => void }> = [];
    class FakeEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      url: string;
      listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
      constructor(url: string) {
        this.url = url;
        sources.push({ url, emit: (type, data = "{}") => this.emit(type, data) });
      }
      addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      emit(type: string, data: string) {
        for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
      }
      close() {
        this.readyState = 2;
      }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const replies = [json(DOC, 201), json(offer({ status: "parsing", lines: [], parseJobId: JOB }), 201), json(offer({ status: "needs_review" }))];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0]?.url).toBe(`/api/v1/jobs/${JOB}/events`);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const done = {
      id: JOB,
      kind: "offer_parse",
      status: "ready",
      conversationId: null,
      requestMessageId: null,
      resultMessageId: null,
      refId: STATE_U,
      progress: [],
      error: null,
      safety: null,
      createdAt: "2027-03-01T15:00:00.000Z",
      updatedAt: "2027-03-01T15:00:05.000Z",
    };
    act(() => sources[0]?.emit("job", JSON.stringify(done)));
    await waitFor(() => expect(screen.getByRole("link", { name: "Review the lines" })).toBeTruthy());
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ["/api/v1/documents", "POST"],
      ["/api/v1/offers", "POST"],
      [`/api/v1/offers/${STATE_U}`, "GET"],
    ]);
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it("explains a letter Aid couldn't read, then removes it so the student can try again (R2P-8)", async () => {
    const replies = [
      json(DOC, 201),
      json(offer({ status: "parsing", lines: [] }), 201),
      json(offer({ status: "failed", lines: [] })),
      new Response(null, { status: 204 }),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<UploadLetter colleges={[{ id: "100", name: "State U" }]} awardYear="2027-28" pollMs={1} />);
    pick(pdf());
    fireEvent.click(screen.getByRole("button", { name: "Upload letter" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Aid couldn't read this letter. Upload a clearer PDF, or compare it by hand in the offer tool.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove and try again" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/v1/offers/${STATE_U}`);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Upload letter" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("RemoveOfferButton (R2P-8)", () => {
  it("deletes a failed or unconfirmed letter, then refreshes, and shows the server's message on a conflict", async () => {
    const replies = [
      new Response(null, { status: 204 }),
      json({ error: { code: "conflict", message: "Confirmed offers stay. Start a new season to archive them." } }, 409),
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift() ?? json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<RemoveOfferButton offerId={STATE_U} collegeName="State U" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the State U letter" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/offers/${STATE_U}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    fireEvent.click(screen.getByRole("button", { name: "Remove the State U letter" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Confirmed offers stay. Start a new season to archive them."),
    );
    expect(nav.router.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("AppealButton (MO-08)", () => {
  it("shows the allowance message with a See plans link on 402 and starts no job (CR-10, E-16-6)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT." } }, 402),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AppealButton offerId={STATE_U} collegeName="State U" timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Draft an appeal outline for State U" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/api/v1/offers/${STATE_U}/appeal`]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/money/UploadLetter`
Expected: FAIL with `Failed to resolve import "./UploadLetter"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/money/UploadLetter.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type DocumentMeta, MAX_UPLOAD_BYTES, type OfferWithLines, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button, Card, Select, StatusPill, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import shared from "../scholarships/shared.module.css";

type Phase = "idle" | "uploading" | "parsing" | "ready" | "failed" | "slow";

/** R2P-8: the parser (12 L8) reads PDFs only, so the award-letter form takes only PDFs. */
const LETTER_MIME = "application/pdf";

/**
 * R2P-8: removes a failed or unconfirmed letter (`DELETE /offers/:id`, 204). Confirmed letters stay;
 * the core answers 409 and the message is shown. The uploaded document stays in Settings → Documents.
 */
export function RemoveOfferButton({ offerId, collegeName }: { offerId: string; collegeName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/offers/${offerId}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <Button variant="line" size="sm" aria-label={`Remove the ${collegeName} letter`} disabled={busy} onClick={() => void remove()}>
        Remove
      </Button>
      {error ? (
        <span className={shared.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * MO-04: upload the letter as a document, create the offer (which queues the parse), then wait for Aid.
 * D31: with `parseJobId`, follow the job's SSE stream and read the offer once it ends; otherwise (or if the stream
 * drops) poll the offer.
 */
export function UploadLetter({
  colleges,
  awardYear,
  pollMs = 2000,
  maxPolls = 60,
}: {
  colleges: Array<{ id: string; name: string }>;
  awardYear: string;
  pollMs?: number;
  maxPolls?: number;
}) {
  const router = useRouter();
  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? "");
  const [year, setYear] = useState(awardYear);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [offerId, setOfferId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, error: streamError } = useJobStream(jobId);

  // The job ended or the stream dropped: hand over to the poller, which reads the offer's status.
  useEffect(() => {
    if (!jobId) return;
    if ((job && TERMINAL_JOB_STATUSES.includes(job.status)) || streamError) {
      setJobId(null);
      setPolling(true);
    }
  }, [jobId, job, streamError]);

  useEffect(() => {
    if (phase !== "parsing" || !offerId || !polling) return;
    let live = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      polls += 1;
      try {
        const current = await api<OfferWithLines>(`/offers/${offerId}`);
        if (!live) return;
        if (current.status === "needs_review" || current.status === "confirmed") {
          setPhase("ready");
          router.refresh();
          return;
        }
        if (current.status === "failed") {
          setPhase("failed");
          return;
        }
      } catch (e) {
        if (live) setError(errorMessage(e));
      }
      if (!live) return;
      if (polls >= maxPolls) setPhase("slow");
      else timer = setTimeout(() => void tick(), pollMs);
    };
    timer = setTimeout(() => void tick(), pollMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [phase, offerId, polling, pollMs, maxPolls, router]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError("Pick the award letter file.");
    if (file.type !== LETTER_MIME) return setError("Upload the award letter as a PDF. Aid can only read PDFs.");
    // Checked before sending: the server refuses anything past 10 MB with a 413.
    if (file.size > MAX_UPLOAD_BYTES) return setError("This file is over 10 MB. Save just the award pages as a PDF and try again.");
    if (!/^\d{4}-\d{2}$/.test(year)) return setError("Use the award year format 2027-28.");
    setError(null);
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("kind", "award_letter");
      form.append("file", file);
      const doc = await api<DocumentMeta>("/documents", { method: "POST", body: form });
      const created = await api<OfferWithLines>("/offers", { body: { collegeId, documentId: doc.id, awardYear: year } });
      setOfferId(created.id);
      setPolling(created.parseJobId === null);
      setJobId(created.parseJobId);
      setPhase("parsing");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  // R2P-8 retry: remove the failed offer, then the same form takes a clearer PDF. The file input is keyed by the
  // offer id, so clearing `offerId` also clears the picked file.
  async function removeAndRetry() {
    if (!offerId) return;
    setError(null);
    try {
      await api<void>(`/offers/${offerId}`, { method: "DELETE" });
      setOfferId(null);
      setJobId(null);
      setPolling(false);
      setFile(null);
      setPhase("idle");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (colleges.length === 0) return null;
  return (
    <Card title="Add an award letter">
      <form className={shared.form} onSubmit={upload} noValidate>
        <Select label="College" options={colleges.map((c) => ({ value: c.id, label: c.name }))} value={collegeId} onChange={(e) => setCollegeId(e.target.value)} />
        <TextInput label="Award year" value={year} maxLength={7} onChange={(e) => setYear(e.target.value)} />
        <input
          key={offerId ?? "new"}
          type="file"
          aria-label="Award letter file"
          accept={LETTER_MIME}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className={shared.muted}>Upload the award letter as a PDF (up to 10 MB).</p>
        <Button variant="primary" type="submit" icon="clip" disabled={phase === "uploading" || phase === "parsing"}>
          Upload letter
        </Button>
      </form>
      {phase === "uploading" ? <p className={shared.muted}>Uploading…</p> : null}
      {phase === "parsing" ? (
        <div className={shared.working} aria-live="polite">
          <StatusPill status="working" />
          <span>Aid is reading your letter…</span>
        </div>
      ) : null}
      {phase === "slow" ? <p className={shared.muted}>Aid is still reading. We'll notify you when it's ready to review.</p> : null}
      {phase === "ready" && offerId ? (
        <p>
          Aid labeled every line. <a href={`/money/offers/${offerId}`}>Review the lines</a>
        </p>
      ) : null}
      {phase === "failed" ? (
        <div className={shared.form}>
          <p className={shared.error} role="alert">
            Aid couldn't read this letter. Upload a clearer PDF, or compare it by hand in the offer tool.
          </p>
          <Button variant="line" size="sm" onClick={() => void removeAndRetry()}>
            Remove and try again
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/money/AppealButton.tsx`:

```tsx
"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import type { CrewJob } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useState } from "react";
import { JobReply } from "../scholarships/JobReply";
import shared from "../scholarships/shared.module.css";

/** MO-08: Aid outlines the appeal (points, documents, who to contact); the student writes the letter. */
export function AppealButton({ offerId, collegeName, timeZone }: { offerId: string; collegeName: string; timeZone: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setLimited(false);
    try {
      const job = await api<CrewJob>(`/offers/${offerId}/appeal`, { method: "POST" });
      setJobId(job.id);
    } catch (e) {
      setError(errorMessage(e));
      // The 402 comes from this POST; JobReply only follows a job that started.
      setLimited(isLimit(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={shared.form}>
      <Button variant="soft" disabled={busy || jobId !== null} onClick={() => void start()}>
        {`Draft an appeal outline for ${collegeName}`}
      </Button>
      <JobReply jobId={jobId} workingText="Aid is outlining your appeal…" timeZone={timeZone} />
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {limited ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
    </div>
  );
}
```

`apps/web/src/app/(app)/money/offers/page.tsx`:

```tsx
import { AppealButton } from "@/components/money/AppealButton";
import { OfferComparisonView } from "@/components/money/OfferComparisonView";
import { RemoveOfferButton, UploadLetter } from "@/components/money/UploadLetter";
import styles from "@/components/money/money.module.css";
import { OFFER_STATUS_LABEL } from "@/components/money/offers";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural, usd } from "@/lib/format";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { compareMyOffers, listOffers, loanEstimates } from "@scholarcrew/core/money";
import { currentAwardYear } from "@scholarcrew/core/shared";
import type { LoanEstimate } from "@scholarcrew/domain";
import { Badge, Button, Card } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="costs" />;
  const offers = await readShared(() => listOffers(v.deps, v.actor, studentId));
  if (!offers) return <NotShared studentName={v.studentName} what="costs" />;
  const comparison = await compareMyOffers(v.deps, v.actor, studentId);
  const confirmed = offers.filter((o) => o.status === "confirmed");
  const loans: Array<{ offerId: string; collegeName: string; estimates: LoanEstimate[] }> = await Promise.all(
    confirmed.map(async (o) => ({ offerId: o.id, collegeName: o.collegeName, estimates: await loanEstimates(v.deps, v.actor, o.id) })),
  );
  const pending = offers.filter((o) => o.status !== "confirmed");
  const colleges = v.isParent
    ? []
    : ((await readShared(() => getCollegeList(v.deps, v.actor, studentId))) ?? []).map((e) => ({ id: e.collegeId, name: e.college.name }));

  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Compare offers</h1>
          <p className={shared.sub}>{`${plural(offers.length, "award letter")} · Aid labeled every line · Ledger did the math`}</p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" href="/money">
            Back to costs
          </Button>
        </div>
      </div>
      <div className={styles.stack}>
        <OfferComparisonView comparison={comparison} offers={offers} />
        {pending.length > 0 ? (
          <Card title="Letters in progress">
            <ul className={styles.items}>
              {pending.map((o) => (
                <li key={o.id}>
                  <span>{`${o.collegeName} · ${o.awardYear}`}</span>
                  <Badge tone={o.status === "failed" ? "crit" : o.status === "needs_review" ? "warn" : "neutral"}>
                    {OFFER_STATUS_LABEL[o.status]}
                  </Badge>
                  {o.status === "needs_review" ? <a href={`/money/offers/${o.id}`}>Review the lines</a> : <span />}
                  {/* R2P-8: a failed or unreviewed letter can be removed; confirmed letters stay for the season. */}
                  {!v.isParent && (o.status === "failed" || o.status === "needs_review") ? (
                    <RemoveOfferButton offerId={o.id} collegeName={o.collegeName} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {loans.some((l) => l.estimates.length > 0) ? (
          <Card title="Loan payments (10-year standard plan)">
            <ul className={styles.items}>
              {loans.flatMap((l) =>
                l.estimates.map((e) => (
                  <li key={`${l.offerId}:${e.label}`}>
                    <span>{`${l.collegeName} · ${e.label}`}</span>
                    <span>{`${usd(e.principalUsd)} at ${e.annualRatePct}% for ${e.years} years ≈ ${usd(e.monthlyUsd)}/month · ${usd(e.totalInterestUsd)} interest`}</span>
                  </li>
                )),
              )}
            </ul>
          </Card>
        ) : null}
        {v.isParent || confirmed.length === 0 ? null : (
          <Card title="Ask for more aid">
            <p className={styles.line}>Aid gives you the points, documents, and who to contact. You write the letter.</p>
            <div className={styles.stack}>
              {confirmed.map((o) => (
                <AppealButton key={o.id} offerId={o.id} collegeName={o.collegeName} timeZone={v.timeZone} />
              ))}
            </div>
          </Card>
        )}
        {v.isParent ? null : <UploadLetter colleges={colleges} awardYear={currentAwardYear(v.deps.clock.now())} />}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/money && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 19 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money/UploadLetter.tsx apps/web/src/components/money/AppealButton.tsx apps/web/src/components/money/UploadLetter.test.tsx "apps/web/src/app/(app)/money/offers/page.tsx"
git commit -m "feat(web): award letter upload, appeal outlines, loans, and the offers page"
```

### Q24: Offer line review and /money/offers/[id] (MO-05, MO-07)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/money/LineReview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineReview } from "./LineReview";
import { STATE_U, offer } from "./fixtures";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/money/offers/x" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const review = () => offer({ status: "needs_review", confirmedAt: null });

describe("LineReview", () => {
  it("PATCHes a line when its category changes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Direct Subsidized Loan category" }), {
      target: { value: "loan_federal_unsubsidized" },
    });
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/offer-lines/22222222-0000-4000-8000-000000000004");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"category":"loan_federal_unsubsidized"}' });
  });

  it("saves an edited amount on blur and rejects bad amounts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    const amount = screen.getByRole("textbox", { name: "Merit Scholarship amount" });
    fireEvent.change(amount, { target: { value: "3.5k" } });
    fireEvent.blur(amount);
    expect(screen.getByRole("alert").textContent).toBe("Amounts are whole dollars up to $200,000.");
    fireEvent.change(amount, { target: { value: "3,500" } });
    fireEvent.blur(amount);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ amountUsd: 3500 });
  });

  it("shows the cited text for a page chip and confirms the offer", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<LineReview offer={review()} readOnly={false} />);
    const chip = screen.getAllByRole("button", { name: "p.2" })[0] as HTMLElement;
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("From your letter, page 2: “State U Grant ... $15,600”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm these lines" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/money/offers"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/offers/${STATE_U}/confirm`);
  });

  it("is read-only once confirmed or for parents", () => {
    render(<LineReview offer={offer()} readOnly />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm these lines" })).toBeNull();
    expect(screen.getByText("Federal work-study")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/money/LineReview`
Expected: FAIL with `Failed to resolve import "./LineReview"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/money/LineReview.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";
import { OFFER_LINE_CATEGORIES, type OfferLine, type OfferLinePatch, type OfferWithLines } from "@scholarcrew/domain";
import { Badge, Button, Card, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./money.module.css";
import { CATEGORY_LABEL } from "./offers";

const CATEGORY_OPTIONS = OFFER_LINE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }));
const READ_LABEL: Record<OfferLine["category"], string> = { ...CATEGORY_LABEL, work_study: "Federal work-study" };

function LineRow({ line, editable, onPatch }: { line: OfferLine; editable: boolean; onPatch: (p: OfferLinePatch) => Promise<boolean> }) {
  const [amount, setAmount] = useState(String(line.amountUsd));
  const [showCite, setShowCite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAmount() {
    const cleaned = amount.replace(/[$,\s]/g, "");
    if (!/^\d+$/.test(cleaned) || Number(cleaned) > 200_000) return setError("Amounts are whole dollars up to $200,000.");
    setError(null);
    if (Number(cleaned) !== line.amountUsd) await onPatch({ amountUsd: Number(cleaned) });
  }

  return (
    <div className={styles.lineRow}>
      <div>
        <b>{line.label}</b>
        {line.userCorrected ? (
          <>
            {" "}
            <Badge tone="navy">You corrected this</Badge>
          </>
        ) : null}
        {line.page !== null ? (
          <button type="button" className={styles.chip} aria-expanded={showCite} onClick={() => setShowCite((s) => !s)}>
            {`p.${line.page}`}
          </button>
        ) : null}
        {showCite ? <p className={styles.cite}>{`From your letter, page ${line.page}: “${line.citedText}”`}</p> : null}
        {line.renewalCondition ? <p className={styles.line}>{line.renewalCondition}</p> : null}
      </div>
      {editable ? (
        <>
          <TextInput
            label={`${line.label} amount`}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => void saveAmount()}
          />
          <Select
            label={`${line.label} category`}
            options={CATEGORY_OPTIONS}
            value={line.category}
            onChange={(e) => void onPatch({ category: e.target.value as OfferLine["category"] })}
          />
          <Toggle label={`${line.label} renews`} checked={line.renewable} onChange={(renewable) => void onPatch({ renewable })} />
        </>
      ) : (
        <>
          <span>{usd(line.amountUsd)}</span>
          <span>{READ_LABEL[line.category]}</span>
          <span>{line.renewable ? "Renews" : "One-time"}</span>
        </>
      )}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** MO-05: the student checks every line Aid extracted before the offer counts; MO-07: page citations. */
export function LineReview({ offer, readOnly }: { offer: OfferWithLines; readOnly: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = !readOnly && offer.status === "needs_review";

  async function patch(id: string, p: OfferLinePatch): Promise<boolean> {
    setError(null);
    try {
      await api<OfferLine>(`/offer-lines/${id}`, { method: "PATCH", body: p });
      router.refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/offers/${offer.id}/confirm`, { method: "POST" });
      router.push("/money/offers");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Card
      title={`${offer.collegeName} · ${offer.awardYear}`}
      aside={offer.costOfAttendanceUsd !== null ? <span className={styles.line}>{`${usd(offer.costOfAttendanceUsd)} to attend`}</span> : null}
    >
      {offer.lines.length === 0 ? <p className={styles.line}>No lines yet. Aid may still be reading this letter.</p> : null}
      {[...offer.lines]
        .sort((a, b) => a.position - b.position)
        .map((line) => (
          <LineRow key={line.id} line={line} editable={editable} onPatch={(p) => patch(line.id, p)} />
        ))}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {editable ? (
        <div className={shared.actions}>
          <Button variant="primary" icon="check" disabled={busy || offer.lines.length === 0} onClick={() => void confirm()}>
            Confirm these lines
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/app/(app)/money/offers/[id]/page.tsx`:

```tsx
import { LineReview } from "@/components/money/LineReview";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getOffer } from "@scholarcrew/core/money";
import { Button } from "@scholarcrew/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OfferReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await loadViewer();
  const offer = await readShared(() => getOffer(v.deps, v.actor, id));
  if (!offer) notFound();
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Check your award letter</h1>
          <p className={shared.sub}>Aid read every line. Fix anything that's labeled wrong, then confirm so Ledger can compare it.</p>
        </div>
        <Button variant="line" href="/money/offers">
          Back to offers
        </Button>
      </div>
      <LineReview offer={offer} readOnly={v.isParent} />
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/money && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 5 files, 23 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money/LineReview.tsx apps/web/src/components/money/LineReview.test.tsx "apps/web/src/app/(app)/money/offers/[id]/page.tsx"
git commit -m "feat(web): award letter line review with citations and confirm"
```

### Q25: Prep model and styles (PR-01, PR-03, PR-04)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/prep/prep.test.ts`:

```ts
import type { TestScore } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { bestOfficial, mondayOf, parseTarget, planSummary, proposeStudyPlan, sectionsText } from "./prep";

const score = (o: Partial<TestScore>): TestScore => ({
  id: "x",
  test: "ACT",
  takenOn: "2026-09-12",
  official: true,
  composite: 27,
  sections: { english: 26, math: 28, reading: 27 },
  createdAt: "2026-09-20T15:00:00.000Z",
  ...o,
});

describe("prep helpers", () => {
  it("finds the best official composite and lists sections", () => {
    const scores = [score({}), score({ id: "y", composite: 26 }), score({ id: "z", composite: 28, official: false }), score({ id: "s", test: "SAT", composite: 1280 })];
    expect(bestOfficial(scores, "ACT")).toBe(27);
    expect(bestOfficial(scores, "SAT")).toBe(1280);
    expect(bestOfficial([], "ACT")).toBeNull();
    expect(sectionsText({ english: 26, math: 28, rw: 640 })).toBe("English 26 · Math 28 · Reading and Writing 640");
  });

  it("checks a target against the test's range", () => {
    expect(parseTarget("ACT", "29")).toBe(29);
    expect(parseTarget("ACT", "37")).toBeNull();
    expect(parseTarget("SAT", "1450")).toBe(1450);
    expect(parseTarget("SAT", "390")).toBeNull();
    expect(parseTarget("ACT", "2 9")).toBeNull();
  });

  it("proposes three weekly sessions until the test date, capped at 40", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    const sessions = proposeStudyPlan("2026-10-08", "2026-10-24");
    expect(sessions.map((s) => [s.weekStart, s.dueOn, s.minutes])).toEqual([
      ["2026-10-12", "2026-10-13", 25],
      ["2026-10-12", "2026-10-15", 25],
      ["2026-10-12", "2026-10-17", 30],
      ["2026-10-19", "2026-10-20", 25],
      ["2026-10-19", "2026-10-22", 25],
    ]);
    expect(planSummary(sessions, "2026-10-24")).toBe("1 h 20 min a week until Oct 24");
    expect(proposeStudyPlan("2026-10-08", "2027-12-31")).toHaveLength(40);
    expect(proposeStudyPlan("2026-10-08", "2026-10-09")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/prep/prep`
Expected: FAIL with `Failed to resolve import "./prep"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/prep/prep.ts`:

```ts
import { addDaysIso, dateShort, minutesLabel } from "@/lib/format";
import { COMPOSITE_RANGE, type StudySession, type TestKind } from "@scholarcrew/domain";

/** Defined once in the college model (Q16) and shared with the college page; re-exported for the prep page. */
export { bestOfficial } from "../colleges/colleges";

/** Section keys match plan 04's superscore: ACT english/math/reading/science, SAT and PSAT rw/math. */
export const SECTIONS: Record<TestKind, Array<{ key: string; label: string }>> = {
  ACT: [
    { key: "english", label: "English" },
    { key: "math", label: "Math" },
    { key: "reading", label: "Reading" },
    { key: "science", label: "Science" },
  ],
  SAT: [
    { key: "rw", label: "Reading and Writing" },
    { key: "math", label: "Math" },
  ],
  PSAT: [
    { key: "rw", label: "Reading and Writing" },
    { key: "math", label: "Math" },
  ],
};
const SECTION_LABEL: Record<string, string> = {
  english: "English",
  math: "Math",
  reading: "Reading",
  science: "Science",
  rw: "Reading and Writing",
};

export function sectionsText(sections: Record<string, number>): string {
  return Object.entries(sections)
    .map(([key, value]) => `${SECTION_LABEL[key] ?? key} ${value}`)
    .join(" · ");
}

export function parseTarget(test: "ACT" | "SAT", text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  const range = COMPOSITE_RANGE[test];
  return n >= range.min && n <= range.max ? n : null;
}

/** Monday of the week containing a calendar date. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDaysIso(day, -((weekday + 6) % 7));
}

const WEEKLY: Array<{ title: string; minutes: number; offset: number }> = [
  { title: "Reading: timed passages", minutes: 25, offset: 1 },
  { title: "Math: review missed problems", minutes: 25, offset: 3 },
  { title: "One timed section, then review", minutes: 30, offset: 5 },
];

/** PR-04: three sessions a week from next Monday until the day before the test, at most 40. */
export function proposeStudyPlan(today: string, testDate: string): StudySession[] {
  const sessions: StudySession[] = [];
  for (let week = addDaysIso(mondayOf(today), 7); week < testDate && sessions.length < 40; week = addDaysIso(week, 7)) {
    for (const s of WEEKLY) {
      const dueOn = addDaysIso(week, s.offset);
      if (dueOn >= testDate || sessions.length >= 40) continue;
      sessions.push({ title: s.title, minutes: s.minutes, weekStart: week, dueOn });
    }
  }
  return sessions;
}

export function planSummary(sessions: StudySession[], testDate: string): string {
  const first = sessions[0]?.weekStart;
  const perWeek = sessions.filter((s) => s.weekStart === first).reduce((sum, s) => sum + s.minutes, 0);
  return `${minutesLabel(perWeek)} a week until ${dateShort(testDate)}`;
}
```

`apps/web/src/components/prep/prep.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.big {
  font-size: 52px;
  font-weight: 700;
  line-height: 1;
}

.note {
  font-size: 13px;
  color: var(--muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
}

.sessions li {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.sessions li:first-child {
  border-top: 0;
}

.callout {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 13.5px;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/prep && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 3 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/prep/prep.ts apps/web/src/components/prep/prep.test.ts apps/web/src/components/prep/prep.module.css
git commit -m "feat(web): prep helpers for scores, targets, and study plans"
```

### Q26: Scores table, superscores, and the add-score dialog (PR-01, PR-02)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/prep/ScoresCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Superscore, TestScore } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoresCard } from "./ScoresCard";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/prep" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const scores: TestScore[] = [
  { id: "t1", test: "ACT", takenOn: "2026-09-12", official: true, composite: 27, sections: { english: 26, math: 28, reading: 27 }, createdAt: "2026-09-20T15:00:00.000Z" },
  { id: "t2", test: "ACT", takenOn: "2026-09-26", official: false, composite: 28, sections: { english: 28, math: 29, reading: 27 }, createdAt: "2026-09-27T15:00:00.000Z" },
];
const superscores: Superscore[] = [{ test: "ACT", composite: 28, sections: { english: 29, math: 28, reading: 27 }, fromDates: ["2026-06-13", "2026-09-12"] }];

describe("ScoresCard", () => {
  it("lists official and practice scores with the superscore", () => {
    render(<ScoresCard scores={scores} superscores={superscores} readOnly={false} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("ACT · Sep 12")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Official")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("Practice")).toBeTruthy();
    expect(screen.getByText("ACT superscore")).toBeTruthy();
    expect(screen.getByText("Best official section from 2 test dates. Practice tests don't count.")).toBeTruthy();
  });

  it("deletes a score", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScoresCard scores={scores} superscores={[]} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete ACT Sep 12 score" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(["/api/v1/test-scores/t1", expect.objectContaining({ method: "DELETE" })]);
  });

  it("validates and adds a score with sections", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ScoresCard scores={[]} superscores={[]} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a score" }));
    const dialog = screen.getByRole("dialog", { name: "Add a score" });
    fireEvent.change(within(dialog).getByLabelText("Test date"), { target: { value: "2026-10-24" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Composite" }), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save score" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("ACT composites run from 1 to 36.");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Composite" }), { target: { value: "29" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Math" }), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save score" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      test: "ACT",
      takenOn: "2026-10-24",
      official: true,
      composite: 29,
      sections: { math: 30 },
    });
  });

  it("hides editing for parents", () => {
    render(<ScoresCard scores={scores} superscores={[]} readOnly />);
    expect(screen.queryByRole("button", { name: "Add a score" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/prep/ScoresCard`
Expected: FAIL with `Failed to resolve import "./ScoresCard"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/prep/AddScoreModal.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { COMPOSITE_RANGE, type TestKind, type TestScore } from "@scholarcrew/domain";
import { Button, Modal, Select, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { SECTIONS } from "./prep";

const TESTS = (["ACT", "SAT", "PSAT"] as const).map((value) => ({ value, label: value }));

/** PR-01: official or practice scores with optional section scores. */
export function AddScoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [test, setTest] = useState<TestKind>("ACT");
  const [takenOn, setTakenOn] = useState("");
  const [official, setOfficial] = useState("official");
  const [composite, setComposite] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const range = COMPOSITE_RANGE[test];
    const n = Number(composite);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(takenOn)) return setError("Pick the test date.");
    if (!/^\d+$/.test(composite) || n < range.min || n > range.max) {
      return setError(`${test} composites run from ${range.min} to ${range.max}.`);
    }
    const parsed: Record<string, number> = {};
    for (const section of SECTIONS[test]) {
      const raw = sections[section.key]?.trim();
      if (!raw) continue;
      if (!/^\d+$/.test(raw) || Number(raw) > 800) return setError(`Check the ${section.label} score.`);
      parsed[section.key] = Number(raw);
    }
    setBusy(true);
    setError(null);
    try {
      await api<TestScore>("/test-scores", { body: { test, takenOn, official: official === "official", composite: n, sections: parsed } });
      router.refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add a score" onClose={onClose}>
      <form className={shared.form} onSubmit={save} noValidate>
        <Select
          label="Test"
          options={TESTS}
          value={test}
          onChange={(e) => {
            setTest(e.target.value as TestKind);
            setSections({});
          }}
        />
        <TextInput label="Test date" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
        <Select
          label="Type"
          options={[
            { value: "official", label: "Official" },
            { value: "practice", label: "Practice" },
          ]}
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
        />
        <TextInput label="Composite" inputMode="numeric" value={composite} onChange={(e) => setComposite(e.target.value)} />
        {SECTIONS[test].map((section) => (
          <TextInput
            key={section.key}
            label={section.label}
            inputMode="numeric"
            value={sections[section.key] ?? ""}
            onChange={(e) => setSections({ ...sections, [section.key]: e.target.value })}
          />
        ))}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" disabled={busy}>
          Save score
        </Button>
      </form>
    </Modal>
  );
}
```

`apps/web/src/components/prep/ScoresCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { Superscore, TestScore } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Table } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { AddScoreModal } from "./AddScoreModal";
import { sectionsText } from "./prep";
import styles from "./prep.module.css";

/** PR-01 scores table and PR-02 superscores (computed by the service from official sections). */
export function ScoresCard({ scores, superscores, readOnly }: { scores: TestScore[]; superscores: Superscore[]; readOnly: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...scores].sort((a, b) => a.takenOn.localeCompare(b.takenOn));

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/test-scores/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.col}>
      <Card
        title="Your scores"
        aside={
          readOnly ? null : (
            <Button variant="line" size="sm" icon="plus" onClick={() => setAdding(true)}>
              Add a score
            </Button>
          )
        }
      >
        {sorted.length === 0 ? (
          <EmptyState title="No scores yet" icon="award">
            Add official and practice scores. Prep uses only official ones for superscores.
          </EmptyState>
        ) : (
          <Table
            caption="Test scores"
            rows={sorted}
            rowKey={(s) => s.id}
            columns={[
              { key: "test", header: "Test", render: (s) => `${s.test} · ${dateShort(s.takenOn)}` },
              { key: "type", header: "Type", render: (s) => <Badge tone="neutral">{s.official ? "Official" : "Practice"}</Badge> },
              { key: "sections", header: "Sections", render: (s) => sectionsText(s.sections) },
              { key: "composite", header: "Composite", align: "right", render: (s) => s.composite },
              {
                key: "actions",
                header: "",
                render: (s) =>
                  readOnly ? null : (
                    <Button
                      variant="line"
                      size="sm"
                      aria-label={`Delete ${s.test} ${dateShort(s.takenOn)} score`}
                      onClick={() => void remove(s.id)}
                    >
                      Delete
                    </Button>
                  ),
              },
            ]}
          />
        )}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {superscores.map((s) => (
        <Card key={s.test} title={`${s.test} superscore`}>
          <div className={styles.big}>{s.composite}</div>
          <p className={styles.note}>{sectionsText(s.sections)}</p>
          <p className={styles.note}>{`Best official section from ${s.fromDates.length} test dates. Practice tests don't count.`}</p>
        </Card>
      ))}
      {readOnly ? null : <AddScoreModal key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/prep && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 7 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/prep/AddScoreModal.tsx apps/web/src/components/prep/ScoresCard.tsx apps/web/src/components/prep/ScoresCard.test.tsx
git commit -m "feat(web): test scores table, superscores, and add-score dialog"
```

### Q27: Retake value, study plan, and /prep (PR-03, PR-04, PR-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/prep/RetakeForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetakeForm } from "./RetakeForm";
import { StudyPlan } from "./StudyPlan";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/prep" }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data = "{}") {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }));
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const JOB = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const job = (status: CrewJob["status"]): CrewJob => ({
  id: JOB,
  kind: "retake_analysis",
  status,
  conversationId: status === "ready" ? CONV : null,
  requestMessageId: null,
  resultMessageId: status === "ready" ? MSG : null,
  refId: "ACT",
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
});
const reply: Message = {
  id: MSG,
  conversationId: CONV,
  authorKind: "crew",
  authorUserId: null,
  body: "",
  reply: {
    text: "Here's what the retake numbers say for your list.",
    contributors: ["prep"],
    question: null,
    actionCards: [],
    receipt: [],
    safety: null,
    needsInput: false,
  },
  createdAt: "2026-10-06T15:01:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
};
const inputs = {
  colleges: [
    {
      id: "100",
      name: "State U",
      meritTiers: [
        { label: "Merit", minGpa: 3.5, minAct: null, minSat: null, annualUsd: 3000, renewalGpa: 3 },
        { label: "Dean's", minGpa: 3.5, minAct: 29, minSat: null, annualUsd: 5000, renewalGpa: 3 },
      ],
    },
  ],
  gpa: 3.72,
  currentAct: 28,
  currentSat: null,
};

describe("RetakeForm", () => {
  it("shows empty-list and unhelpful-target refusals without starting a stream", async () => {
    for (const message of ["Add colleges with merit scholarships first.", "Pick a target above your best score."]) {
      vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "invalid_input", message } }, 400)));
      const { unmount } = render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
      fireEvent.click(screen.getByRole("button", { name: "29" }));
      fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(FakeEventSource.instances).toHaveLength(0);
      unmount();
    }
  });

  it("checks the target, starts the job, then shows the code's table and Prep's explanation", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/v1/prep/retake") return json(job("queued"), 202);
      if (url === `/api/v1/jobs/${JOB}`) return json(job("ready"));
      return json([reply]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Target composite" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect(screen.getByRole("alert").textContent).toBe("ACT targets run from 1 to 36.");
    fireEvent.click(screen.getByRole("button", { name: "29" }));
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ test: "ACT", targetComposite: 29 });
    expect(screen.queryByRole("table")).toBeNull();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job("ready"))));
    await waitFor(() => expect(screen.getByText("Here's what the retake numbers say for your list.")).toBeTruthy());
    const table = screen.getByRole("table", { name: "Retake value by school" });
    const row = within(table).getByRole("row", { name: /State U/ });
    expect(within(row).getByText("Merit")).toBeTruthy();
    expect(within(row).getByText("Dean's")).toBeTruthy();
    expect(within(row).getByText("+$2,000")).toBeTruthy();
    expect(within(row).getByText("+$8,000")).toBeTruthy();
  });

  it("shows the allowance message with a See plans link on 402 (CR-10, E-16-6)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT." } }, 402)),
    );
    render(<RetakeForm inputs={inputs} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "29" }));
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Target composite" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the numbers" }));
    expect(screen.getByRole("alert").textContent).toBe("ACT targets run from 1 to 36.");
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });
});

describe("StudyPlan", () => {
  it("proposes sessions up to the test date and adds them to the plan", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json([{}, {}, {}, {}, {}], 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<StudyPlan today="2026-10-08" />);
    fireEvent.change(screen.getByLabelText("Next test date"), { target: { value: "2026-10-24" } });
    expect(screen.getByText("1 h 20 min a week until Oct 24")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Add to my weekly plan" }));
    await waitFor(() => expect(screen.getByText("Added 5 sessions to your weekly plan.")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/prep/study-plan");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).sessions).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/prep/RetakeForm`
Expected: FAIL with `Failed to resolve import "./RetakeForm"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/prep/RetakeForm.tsx`:

```tsx
"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { usd } from "@/lib/format";
import type { College, CrewJob } from "@scholarcrew/domain";
import { retakeAnalysis } from "@scholarcrew/engines";
import { Button, Card, Chip, Select, Table, TextInput } from "@scholarcrew/ui";
import { type FormEvent, useState } from "react";
import { JobReply } from "../scholarships/JobReply";
import shared from "../scholarships/shared.module.css";
import { parseTarget } from "./prep";
import styles from "./prep.module.css";

export interface RetakeInputs {
  colleges: Array<Pick<College, "id" | "name" | "meritTiers">>;
  gpa: number | null;
  currentAct: number | null;
  currentSat: number | null;
}

const RANGE_TEXT = { ACT: "ACT targets run from 1 to 36.", SAT: "SAT targets run from 400 to 1600." } as const;

/**
 * PR-03: the job runs the same calculation in the worker and Prep explains it. The table here comes from
 * engines.retakeAnalysis over the inputs computeRetake uses (the job result isn't readable by actors).
 */
export function RetakeForm({ inputs, timeZone }: { inputs: RetakeInputs; timeZone: string }) {
  const [test, setTest] = useState<"ACT" | "SAT">(inputs.currentAct === null && inputs.currentSat !== null ? "SAT" : "ACT");
  const [target, setTarget] = useState("");
  const [requested, setRequested] = useState<{ test: "ACT" | "SAT"; composite: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const current = test === "ACT" ? inputs.currentAct : inputs.currentSat;
  const step = test === "ACT" ? 1 : 50;
  const max = test === "ACT" ? 36 : 1600;
  const quick = current === null ? [] : [1, 2, 3].map((k) => current + k * step).filter((n) => n <= max);

  async function run(event: FormEvent) {
    event.preventDefault();
    const composite = parseTarget(test, target);
    setLimited(false);
    if (composite === null) return setError(RANGE_TEXT[test]);
    setError(null);
    setDone(false);
    try {
      const job = await api<CrewJob>("/prep/retake", { body: { test, targetComposite: composite } });
      setRequested({ test, composite });
      setJobId(job.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    }
  }

  const analysis = done && requested ? retakeAnalysis({ ...inputs, target: requested }) : null;
  const bestRow = analysis ? [...analysis.rows].sort((a, b) => b.fourYearDeltaUsd - a.fourYearDeltaUsd)[0] : undefined;
  return (
    <Card title="Is a retake worth it?">
      <p className={styles.note}>Merit tiers from each school's aid page · calculated by code</p>
      <form className={styles.row} onSubmit={run}>
        <Select
          label="Test"
          options={[
            { value: "ACT", label: "ACT" },
            { value: "SAT", label: "SAT" },
          ]}
          value={test}
          onChange={(e) => setTest(e.target.value as "ACT" | "SAT")}
        />
        <TextInput label="Target composite" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        {quick.map((n) => (
          <Chip key={n} active={target === String(n)} onClick={() => setTarget(String(n))}>
            {String(n)}
          </Chip>
        ))}
        <Button variant="primary" type="submit" disabled={jobId !== null && !done}>
          Run the numbers
        </Button>
      </form>
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
      {limited ? (
        <Button variant="soft" size="sm" href="/settings">
          See plans
        </Button>
      ) : null}
      {analysis && requested ? (
        <>
          <Table
            caption="Retake value by school"
            rows={analysis.rows}
            rowKey={(r) => r.collegeId}
            columns={[
              { key: "school", header: "School", render: (r) => r.collegeName },
              {
                key: "now",
                header: analysis.currentComposite === null ? "Now" : `Now, at ${analysis.currentComposite}`,
                render: (r) => r.currentTierLabel ?? "No merit award",
              },
              { key: "then", header: `At a ${requested.composite}`, render: (r) => r.targetTierLabel ?? "No change" },
              { key: "year", header: "Per year", align: "right", render: (r) => (r.annualDeltaUsd > 0 ? `+${usd(r.annualDeltaUsd)}` : "$0") },
              { key: "four", header: "Over 4 years", align: "right", render: (r) => (r.fourYearDeltaUsd > 0 ? `+${usd(r.fourYearDeltaUsd)}` : "$0") },
            ]}
          />
          <p className={styles.callout}>
            {bestRow && bestRow.fourYearDeltaUsd > 0
              ? `You'll go to one school, so these don't add up. A ${requested.composite} is worth at most ${usd(bestRow.fourYearDeltaUsd)} over 4 years, at ${bestRow.collegeName}.`
              : `A ${requested.composite} doesn't unlock a bigger merit award at any school on your list.`}
          </p>
        </>
      ) : null}
      <JobReply jobId={jobId} workingText="Prep is running the numbers…" timeZone={timeZone} onDone={() => setDone(true)} />
    </Card>
  );
}
```

`apps/web/src/components/prep/StudyPlan.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, plural } from "@/lib/format";
import type { PlanItem } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, TextInput, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import shared from "../scholarships/shared.module.css";
import { planSummary, proposeStudyPlan } from "./prep";
import styles from "./prep.module.css";

/** PR-04: weekly sessions up to the next test date; accepting adds them to the weekly plan. */
export function StudyPlan({ today }: { today: string }) {
  const router = useRouter();
  const [testDate, setTestDate] = useState("");
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = /^\d{4}-\d{2}-\d{2}$/.test(testDate) ? proposeStudyPlan(today, testDate) : [];

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const items = await api<PlanItem[]>("/prep/study-plan", { body: { sessions } });
      setAdded(items.length);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>
        <Who role="prep" size="sm" /> <span>· Study plan proposal</span>
      </Eyebrow>
      <TextInput label="Next test date" type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
      {sessions.length > 0 ? (
        <>
          <h3>{planSummary(sessions, testDate)}</h3>
          <ul className={styles.sessions}>
            {sessions.map((s) => (
              <li key={`${s.dueOn}:${s.title}`}>
                <b>{s.dueOn ? dateShort(s.dueOn) : ""}</b>
                <span>{s.title}</span>
                <span>{`${s.minutes} min`}</span>
              </li>
            ))}
          </ul>
          {added === null ? (
            <Button variant="primary" icon="plus" disabled={busy} onClick={() => void accept()}>
              Add to my weekly plan
            </Button>
          ) : (
            <p>{`Added ${plural(added, "session")} to your weekly plan.`}</p>
          )}
        </>
      ) : testDate ? (
        <p className={styles.note}>That date is too soon for a weekly plan. One timed practice test is the best use of the time.</p>
      ) : (
        <p className={styles.note}>Pick your next test date and Prep proposes short weekly sessions until then.</p>
      )}
      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/app/(app)/prep/page.tsx`:

```tsx
import { RetakeForm, type RetakeInputs } from "@/components/prep/RetakeForm";
import { ScoresCard } from "@/components/prep/ScoresCard";
import { StudyPlan } from "@/components/prep/StudyPlan";
import { bestOfficial } from "@/components/prep/prep";
import styles from "@/components/prep/prep.module.css";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, todayIn } from "@/components/scholarships/viewer";
import { getCollege, getCollegeList } from "@scholarcrew/core/colleges";
import { getSuperscores, listTestScores } from "@scholarcrew/core/prep";
import { Button, Card, EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const v = await loadViewer();
  // Test scores have no share category (07: owner only), so parents get a plain note instead of NotShared,
  // which would point at a sharing switch that doesn't exist.
  if (v.isParent) {
    return (
      <Card padding="lg">
        <EmptyState title="Test scores stay private to your student" icon="lock">
          ScholarCrew doesn't share test scores with family members. Ask your student how testing is going.
        </EmptyState>
      </Card>
    );
  }
  const studentId = v.actor.userId;
  const scores = await listTestScores(v.deps, v.actor, studentId);
  const superscores = await getSuperscores(v.deps, v.actor, studentId);
  const list = await getCollegeList(v.deps, v.actor, studentId);
  const colleges = await Promise.all(list.map((e) => getCollege(v.deps, v.actor, e.collegeId)));
  const inputs: RetakeInputs = {
    colleges: colleges.map((c) => ({ id: c.id, name: c.name, meritTiers: c.meritTiers })).sort((a, b) => a.name.localeCompare(b.name)),
    gpa: v.me.profile?.gpaUnweighted ?? null,
    currentAct: bestOfficial(scores, "ACT"),
    currentSat: bestOfficial(scores, "SAT"),
  };
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Test prep</h1>
          <p className={shared.sub}>Prep runs the numbers with code, and you decide</p>
        </div>
        <Button variant="primary" icon="chat" href="/crew">
          Ask Prep
        </Button>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <ScoresCard scores={scores} superscores={superscores} readOnly={false} />
          <RetakeForm inputs={inputs} timeZone={v.timeZone} />
        </div>
        <StudyPlan today={todayIn(v.deps.clock.now(), v.timeZone)} />
      </div>
    </>
  );
}
```

The page puts `ScoresCard` (which includes the superscore cards) in the main column, matching mockup 11's left column; the study plan card sits on the right.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/prep && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/prep/RetakeForm.tsx apps/web/src/components/prep/StudyPlan.tsx apps/web/src/components/prep/RetakeForm.test.tsx "apps/web/src/app/(app)/prep/page.tsx"
git commit -m "feat(web): retake value, study plan proposals, and the prep page"
```

### Q28: Impact model and styles (IM-01..IM-04)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/impact/impact.test.ts`:

```ts
import type { ServiceLog } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { activityCounter, hoursLabel, logTotals, parseHours, progressView } from "./impact";

const log = (minutes: number, verification: ServiceLog["verification"]) => ({ minutes, verification });

describe("hours", () => {
  it("formats and parses hours", () => {
    expect(hoursLabel(90)).toBe("1.5");
    expect(hoursLabel(240)).toBe("4");
    expect(hoursLabel(20)).toBe("0.3");
    expect(parseHours("2.5")).toBe(150);
    expect(parseHours("0")).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("two")).toBeNull();
  });

  it("totals logged and confirmed hours", () => {
    expect(logTotals([log(240, "verified"), log(150, "requested"), log(90, "declined")])).toBe(
      "8 hours logged · 4 confirmed by supervisors",
    );
    expect(logTotals([])).toBe("0 hours logged · 0 confirmed by supervisors");
  });
});

describe("progressView (IM-03)", () => {
  it("counts only confirmed hours toward the requirement", () => {
    expect(progressView({ requiredHours: 40, verifiedHours: 26, totalHours: 28.5 })).toEqual({
      value: 0.65,
      met: false,
      status: "14 to go",
      detail: "Confirmed 26 · waiting or self-reported 2.5 · still needed 14",
    });
    expect(progressView({ requiredHours: 25, verifiedHours: 26, totalHours: 26 })).toMatchObject({ value: 1, met: true, status: "Met" });
  });
});

describe("activityCounter (IM-04)", () => {
  it("counts code points against 150 and warns near and over", () => {
    expect(activityCounter("a".repeat(120))).toEqual({ label: "120 / 150", state: "ok", note: null });
    expect(activityCounter("a".repeat(140))).toEqual({ label: "140 / 150", state: "near", note: "10 left" });
    expect(activityCounter("a".repeat(155))).toEqual({ label: "155 / 150", state: "over", note: "5 over" });
    expect(activityCounter("👋".repeat(150)).label).toBe("150 / 150");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/impact/impact`
Expected: FAIL with `Failed to resolve import "./impact"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/impact/impact.ts`:

```ts
import type { RequirementProgress, ServiceLog, VerificationStatus } from "@scholarcrew/domain";
import { countChars, limitState } from "@scholarcrew/engines";
import type { BadgeTone, IconName } from "@scholarcrew/ui";

export const ACTIVITY_LIMIT = 150;
export const MAX_ACTIVITIES = 10;

function trim1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function hoursLabel(minutes: number): string {
  return trim1(minutes / 60);
}

/** Decimal hours for one day of service (0 < h <= 24) as whole minutes. */
export function parseHours(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const h = Number(text.trim());
  return h > 0 && h <= 24 ? Math.round(h * 60) : null;
}

export const VERIFICATION_VIEW: Record<VerificationStatus, { tone: BadgeTone; icon: IconName; label: string }> = {
  self_reported: { tone: "neutral", icon: "info", label: "Not sent yet" },
  requested: { tone: "warn", icon: "clock", label: "Waiting" },
  verified: { tone: "good", icon: "check", label: "Confirmed" },
  declined: { tone: "crit", icon: "alert", label: "Declined" },
};

export function logTotals(logs: Array<Pick<ServiceLog, "minutes" | "verification">>): string {
  const total = logs.reduce((sum, l) => sum + l.minutes, 0);
  const verified = logs.filter((l) => l.verification === "verified").reduce((sum, l) => sum + l.minutes, 0);
  return `${hoursLabel(total)} hours logged · ${hoursLabel(verified)} confirmed by supervisors`;
}

/** IM-03: only confirmed hours count toward the requirement. */
export function progressView(p: Pick<RequirementProgress, "requiredHours" | "verifiedHours" | "totalHours">): {
  value: number;
  met: boolean;
  status: string;
  detail: string;
} {
  const required = Math.max(1, p.requiredHours);
  const met = p.verifiedHours >= p.requiredHours;
  const needed = Math.max(0, p.requiredHours - p.verifiedHours);
  const waiting = Math.max(0, p.totalHours - p.verifiedHours);
  return {
    value: Math.min(1, Math.round((p.verifiedHours / required) * 100) / 100),
    met,
    status: met ? "Met" : `${trim1(needed)} to go`,
    detail: `Confirmed ${trim1(p.verifiedHours)} · waiting or self-reported ${trim1(waiting)} · still needed ${trim1(needed)}`,
  };
}

/** IM-04: 150 characters, counted exactly (code points), warning at 90%. */
export function activityCounter(text: string): { label: string; state: "ok" | "near" | "over"; note: string | null } {
  const n = countChars(text);
  const state = limitState(n, ACTIVITY_LIMIT);
  const note = state === "near" ? `${ACTIVITY_LIMIT - n} left` : state === "over" ? `${n - ACTIVITY_LIMIT} over` : null;
  return { label: `${n} / ${ACTIVITY_LIMIT}`, state, note };
}
```

`apps/web/src/components/impact/impact.module.css`:

```css
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sub {
  font-size: 12.5px;
  color: var(--muted);
}

.req + .req {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line-2);
}

.reqHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 650;
}

.slot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--line-2);
}

.slot:first-child {
  border-top: 0;
}

.counter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.over textarea {
  border-color: var(--crit);
}

.grades {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  border: 0;
  font-size: 13px;
}

@media (max-width: 1100px) {
  .grid,
  .slot {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/impact && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/impact/impact.ts apps/web/src/components/impact/impact.test.ts apps/web/src/components/impact/impact.module.css
git commit -m "feat(web): service hour, requirement, and activity counter helpers"
```

### Q29: Service log, supervisor verification, and requirement progress (IM-01..IM-03, IM-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/impact/ServiceLogs.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { RequirementProgress, ServiceLog } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequirementCard } from "./RequirementCard";
import { ServiceLogs } from "./ServiceLogs";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/impact" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
const log = (o: Partial<ServiceLog>): ServiceLog => ({
  id: "l1",
  organization: "Eastside Food Pantry",
  activity: "sorting",
  servedOn: "2026-10-03",
  minutes: 240,
  supervisorName: "Mr. Greene",
  supervisorEmail: "greene@pantry.example.org",
  verification: "self_reported",
  verificationExpiresAt: null,
  verifiedAt: null,
  verifierNote: "",
  reflection: "",
  createdAt: "2026-10-03T20:00:00.000Z",
  ...o,
});
const NOW = "2026-10-06T15:00:00.000Z";
const logs = [
  log({}),
  log({ id: "l2", organization: "Riverside Park", activity: "cleanup", minutes: 90, verification: "declined", verifierNote: "1 hour, not 1.5" }),
  log({ id: "l3", organization: "Maple Library", activity: "STEM night", minutes: 150, verification: "verified", verifiedAt: "2026-09-25T15:00:00.000Z", reflection: "A girl asked to take the sensor home." }),
];

describe("ServiceLogs", () => {
  it("shows each status and asks a supervisor to confirm", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...logs[0], verification: "requested" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceLogs logs={logs} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Not sent yet")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("Declined")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("“1 hour, not 1.5”")).toBeTruthy();
    expect(within(rows[3] as HTMLElement).getByText("Confirmed")).toBeTruthy();
    expect(within(rows[3] as HTMLElement).getByRole("link", { name: "Start a story from this" }).getAttribute("href")).toBe(
      "/essays/stories?fromLog=l3",
    );
    fireEvent.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Ask to confirm" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/service-logs/l1/verify");
  });

  it("shows a lapsed supervisor link as expired and lets the student ask again (R2P-10)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(log({ id: "l4", verification: "requested" })));
    vi.stubGlobal("fetch", fetchMock);
    const lapsed = log({ id: "l4", servedOn: "2026-09-10", verification: "requested", verificationExpiresAt: "2026-09-24T20:00:00.000Z" });
    const open = log({ id: "l5", servedOn: "2026-10-01", verification: "requested", verificationExpiresAt: "2026-10-15T20:00:00.000Z" });
    render(<ServiceLogs logs={[lapsed, open]} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Waiting")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByRole("button", { name: "Ask to confirm" })).toBeNull();
    expect(within(rows[2] as HTMLElement).getByText("Link expired")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).queryByText(/link sent/)).toBeNull();
    fireEvent.click(within(rows[2] as HTMLElement).getByRole("button", { name: "Ask to confirm" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/service-logs/l4/verify");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    cleanup();
    render(<ServiceLogs logs={[lapsed]} readOnly timeZone="America/Chicago" now={NOW} />);
    expect(screen.getByText("Link expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask to confirm" })).toBeNull();
  });

  it("validates and logs hours", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(log({}), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<ServiceLogs logs={[]} readOnly={false} timeZone="America/Chicago" now={NOW} />);
    const form = screen.getByRole("form", { name: "Log hours" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Organization" }), { target: { value: "Eastside Food Pantry" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "What you did" }), { target: { value: "sorting" } });
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-10-03" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Hours" }), { target: { value: "30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save hours" }));
    expect(within(form).getByRole("alert").textContent).toBe("Hours are a number between 0 and 24, like 1.5.");
    fireEvent.change(within(form).getByRole("textbox", { name: "Hours" }), { target: { value: "4" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Supervisor email (optional)" }), { target: { value: "greene@pantry.example.org" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      organization: "Eastside Food Pantry",
      activity: "sorting",
      servedOn: "2026-10-03",
      minutes: 240,
      supervisorName: "",
      supervisorEmail: "greene@pantry.example.org",
      reflection: "",
    });
  });
});

describe("RequirementCard", () => {
  it("shows confirmed hours against each requirement", () => {
    const progress: RequirementProgress[] = [
      { scholarshipId: "s1", scholarshipName: "Lone Star Credit Union Award", requiredHours: 40, verifiedHours: 26, totalHours: 28.5 },
      { scholarshipId: "s2", scholarshipName: "First-Gen Futures", requiredHours: 25, verifiedHours: 26, totalHours: 26 },
    ];
    render(<RequirementCard progress={progress} />);
    expect(screen.getByText("14 to go")).toBeTruthy();
    expect(screen.getByText("Met")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/impact/ServiceLogs`
Expected: FAIL with `Failed to resolve import "./RequirementCard"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/impact/ServiceLogs.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort, instantShort } from "@/lib/format";
import type { ServiceLog } from "@scholarcrew/domain";
import { Badge, Button, Card, EmptyState, Table, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { VERIFICATION_VIEW, hoursLabel, parseHours } from "./impact";
import styles from "./impact.module.css";

const EMPTY = { organization: "", activity: "", servedOn: "", hours: "", supervisorName: "", supervisorEmail: "", reflection: "" };

function LogForm() {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!f.organization.trim() || !f.activity.trim()) return setError("Add where you served and what you did.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.servedOn)) return setError("Pick the date you served.");
    const minutes = parseHours(f.hours);
    if (minutes === null) return setError("Hours are a number between 0 and 24, like 1.5.");
    setBusy(true);
    setError(null);
    try {
      await api<ServiceLog>("/service-logs", {
        body: {
          organization: f.organization.trim(),
          activity: f.activity.trim(),
          servedOn: f.servedOn,
          minutes,
          supervisorName: f.supervisorName.trim(),
          supervisorEmail: f.supervisorEmail.trim(),
          reflection: f.reflection.trim(),
        },
      });
      setF(EMPTY);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log hours">
      <form aria-label="Log hours" className={shared.form} onSubmit={save} noValidate>
        <TextInput label="Organization" maxLength={200} value={f.organization} onChange={set("organization")} />
        <TextInput label="What you did" maxLength={200} value={f.activity} onChange={set("activity")} />
        <TextInput label="Date" type="date" value={f.servedOn} onChange={set("servedOn")} />
        <TextInput label="Hours" inputMode="decimal" value={f.hours} onChange={set("hours")} />
        <TextInput label="Supervisor name (optional)" maxLength={120} value={f.supervisorName} onChange={set("supervisorName")} />
        <TextInput label="Supervisor email (optional)" type="email" maxLength={254} value={f.supervisorEmail} onChange={set("supervisorEmail")} />
        <TextArea
          label="Reflection (optional)"
          hint="A sentence or two about one moment. It can become a Story Bank entry later."
          rows={3}
          maxLength={2000}
          value={f.reflection}
          onChange={set("reflection")}
        />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" disabled={busy}>
          Save hours
        </Button>
      </form>
    </Card>
  );
}

/** R2P-10: a `requested` log whose supervisor link lapsed (14 days) can be sent again. */
const LINK_EXPIRED_VIEW = { tone: "neutral", icon: "clock", label: "Link expired" } as const;

function linkExpired(l: ServiceLog, nowMs: number): boolean {
  return l.verification === "requested" && l.verificationExpiresAt !== null && Date.parse(l.verificationExpiresAt) <= nowMs;
}

/**
 * IM-01 log, IM-02 supervisor confirmation by email link (14 days, no account), IM-05 story starter.
 * `now` is the server clock (ISO), so the expired check renders the same on the server and in the browser.
 */
export function ServiceLogs({ logs, readOnly, timeZone, now }: { logs: ServiceLog[]; readOnly: boolean; timeZone: string; now: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const sorted = [...logs].sort((a, b) => b.servedOn.localeCompare(a.servedOn));
  const nowMs = Date.parse(now);

  async function call(path: string, method: "POST" | "DELETE") {
    setError(null);
    try {
      await api(path, { method });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={styles.col}>
      <Card title="Service hours" aside={<span className={styles.sub}>Supervisors confirm by email link, no account needed</span>}>
        {sorted.length === 0 ? (
          <EmptyState title="No hours yet" icon="clock">
            Log each time you serve. Only hours a supervisor confirms count toward scholarship requirements.
          </EmptyState>
        ) : (
          <Table
            caption="Service hours"
            rows={sorted}
            rowKey={(l) => l.id}
            columns={[
              { key: "date", header: "Date", render: (l) => dateShort(l.servedOn) },
              {
                key: "what",
                header: "Where and what",
                render: (l) => (
                  <>
                    {l.organization} <span className={styles.sub}>{`· ${l.activity}`}</span>
                  </>
                ),
              },
              { key: "hours", header: "Hours", align: "right", render: (l) => hoursLabel(l.minutes) },
              { key: "supervisor", header: "Supervisor", render: (l) => l.supervisorName || "—" },
              {
                key: "status",
                header: "Status",
                render: (l) => {
                  const expired = linkExpired(l, nowMs);
                  const view = expired ? LINK_EXPIRED_VIEW : VERIFICATION_VIEW[l.verification];
                  const canAsk = !readOnly && (l.verification === "self_reported" || l.verification === "declined" || expired);
                  return (
                    <>
                      <Badge tone={view.tone} icon={view.icon}>
                        {view.label}
                      </Badge>
                      {l.verification === "verified" && l.verifiedAt ? (
                        <span className={styles.sub}>{` · ${instantShort(l.verifiedAt, timeZone)}`}</span>
                      ) : null}
                      {l.verification === "requested" && !expired ? <span className={styles.sub}> · link sent</span> : null}
                      {l.verification === "declined" && l.verifierNote ? <span className={styles.sub}>{`“${l.verifierNote}”`}</span> : null}
                      {canAsk && l.supervisorEmail ? (
                        <Button variant="line" size="sm" onClick={() => void call(`/service-logs/${l.id}/verify`, "POST")}>
                          Ask to confirm
                        </Button>
                      ) : null}
                      {canAsk && !l.supervisorEmail ? <span className={styles.sub}> · add a supervisor email to ask</span> : null}
                    </>
                  );
                },
              },
              {
                key: "actions",
                header: "",
                render: (l) => (
                  <>
                    {l.reflection && !readOnly ? <a href={`/essays/stories?fromLog=${l.id}`}>Start a story from this</a> : null}
                    {readOnly ? null : (
                      <Button
                        variant="line"
                        size="sm"
                        aria-label={`Delete ${l.organization} on ${dateShort(l.servedOn)}`}
                        onClick={() => void call(`/service-logs/${l.id}`, "DELETE")}
                      >
                        Delete
                      </Button>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {readOnly ? null : <LogForm />}
    </div>
  );
}
```

`apps/web/src/components/impact/RequirementCard.tsx`:

```tsx
import type { RequirementProgress } from "@scholarcrew/domain";
import { Badge, Card, Progress, Who } from "@scholarcrew/ui";
import { progressView } from "./impact";
import styles from "./impact.module.css";

/** IM-03: confirmed hours against each saved scholarship's requirement. */
export function RequirementCard({ progress }: { progress: RequirementProgress[] }) {
  return (
    <Card title="Hours a scholarship asks for" aside={<Who role="impact" size="sm" />}>
      {progress.length === 0 ? <p className={styles.sub}>No saved scholarship asks for service hours yet.</p> : null}
      {progress.map((p) => {
        const view = progressView(p);
        return (
          <div key={p.scholarshipId} className={styles.req}>
            <div className={styles.reqHead}>
              <span>{p.scholarshipName}</span>
              <Badge tone={view.met ? "good" : "warn"} icon={view.met ? "check" : "clock"}>
                {view.status}
              </Badge>
            </div>
            <p className={styles.sub}>{`${p.requiredHours} confirmed hours required`}</p>
            <Progress value={view.value} label={`${p.scholarshipName} confirmed hours`} />
            <p className={styles.sub}>{view.detail}</p>
          </div>
        );
      })}
      <p className={styles.sub}>Only confirmed hours count.</p>
    </Card>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/impact && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 8 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/impact/ServiceLogs.tsx apps/web/src/components/impact/RequirementCard.tsx apps/web/src/components/impact/ServiceLogs.test.tsx
git commit -m "feat(web): service log with supervisor confirmation and requirement progress"
```

### Q30: Activities editor and /impact (IM-04, IM-06 ask link)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/impact/ActivitiesEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Activity } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivitiesEditor } from "./ActivitiesEditor";

const nav = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => "/impact" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const robotics: Activity = {
  id: "a1",
  position: 1,
  name: "Robotics team",
  role: "Build lead",
  organization: "Maple High",
  description: "Build lead for a 14-person team.",
  hoursPerWeek: 8,
  weeksPerYear: 30,
  grades: [9, 10, 11, 12],
  category: "Robotics",
};

describe("ActivitiesEditor", () => {
  it("counts the description against 150 characters and blocks saving over the limit", () => {
    render(<ActivitiesEditor activities={[robotics]} readOnly={false} />);
    expect(screen.getByText("1 of 10 · 150 characters each, counted exactly")).toBeTruthy();
    const slot = screen.getByRole("form", { name: "Activity 1" });
    const description = within(slot).getByRole("textbox", { name: "Description" });
    expect(within(slot).getByText("32 / 150")).toBeTruthy();
    fireEvent.change(description, { target: { value: "a".repeat(145) } });
    expect(within(slot).getByText("145 / 150")).toBeTruthy();
    expect(within(slot).getByText("5 left")).toBeTruthy();
    fireEvent.change(description, { target: { value: "a".repeat(155) } });
    expect(within(slot).getByText("155 / 150")).toBeTruthy();
    expect(within(slot).getByText("5 over")).toBeTruthy();
    expect((within(slot).getByRole("button", { name: "Save activity" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(description, { target: { value: "🤖".repeat(150) } });
    expect(within(slot).getByText("150 / 150")).toBeTruthy();
    expect((within(slot).getByRole("button", { name: "Save activity" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves an activity in the next free slot with PUT", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ActivitiesEditor activities={[robotics]} readOnly={false} />);
    const slot = screen.getByRole("form", { name: "Activity 2" });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Activity name" }), { target: { value: "Library STEM nights" } });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Description" }), { target: { value: "Started free robotics nights." } });
    fireEvent.change(within(slot).getByRole("textbox", { name: "Hours per week" }), { target: { value: "3" } });
    fireEvent.click(within(slot).getByRole("checkbox", { name: "Grade 11" }));
    fireEvent.click(within(slot).getByRole("button", { name: "Save activity" }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/activities");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      position: 2,
      name: "Library STEM nights",
      role: "",
      organization: "",
      description: "Started free robotics nights.",
      hoursPerWeek: 3,
      weeksPerYear: 0,
      grades: [11],
      category: "",
    });
  });

  it("stops offering slots at 10 and is read-only for parents", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...robotics, id: `a${i + 1}`, position: i + 1 }));
    render(<ActivitiesEditor activities={ten} readOnly={false} />);
    expect(screen.queryByRole("form", { name: "Activity 11" })).toBeNull();
    cleanup();
    render(<ActivitiesEditor activities={[robotics]} readOnly />);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByText("Build lead for a 14-person team.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/impact/ActivitiesEditor`
Expected: FAIL with `Failed to resolve import "./ActivitiesEditor"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/impact/ActivitiesEditor.tsx`:

```tsx
"use client";

import { cx } from "@/lib/cx";
import { api, errorMessage } from "@/lib/api";
import type { Activity, ActivityInput } from "@scholarcrew/domain";
import { Badge, Button, Card, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import { MAX_ACTIVITIES, activityCounter } from "./impact";
import styles from "./impact.module.css";

const GRADES = [9, 10, 11, 12];

function whole(text: string, max: number): number | null {
  if (text.trim() === "") return 0;
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= max ? n : null;
}

function ActivitySlot({ position, activity }: { position: number; activity: Activity | null }) {
  const router = useRouter();
  const [name, setName] = useState(activity?.name ?? "");
  const [role, setRole] = useState(activity?.role ?? "");
  const [organization, setOrganization] = useState(activity?.organization ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [hours, setHours] = useState(activity ? String(activity.hoursPerWeek) : "");
  const [weeks, setWeeks] = useState(activity ? String(activity.weeksPerYear) : "");
  const [grades, setGrades] = useState<number[]>(activity?.grades ?? []);
  const [category, setCategory] = useState(activity?.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counter = activityCounter(description);

  async function save(event: FormEvent) {
    event.preventDefault();
    const hoursPerWeek = whole(hours, 80);
    const weeksPerYear = whole(weeks, 52);
    if (!name.trim()) return setError("Give the activity a name.");
    if (hoursPerWeek === null || weeksPerYear === null) return setError("Use whole numbers: up to 80 hours a week and 52 weeks a year.");
    const input: ActivityInput = {
      position,
      name: name.trim(),
      role: role.trim(),
      organization: organization.trim(),
      description,
      hoursPerWeek,
      weeksPerYear,
      grades: [...grades].sort((a, b) => a - b),
      category: category.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      await api<Activity>("/activities", { method: "PUT", body: input });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!activity) return;
    setError(null);
    try {
      await api(`/activities/${activity.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form aria-label={`Activity ${position}`} className={styles.slot} onSubmit={save} noValidate>
      <div className={shared.form}>
        <TextInput label="Activity name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label="Your role" maxLength={50} value={role} onChange={(e) => setRole(e.target.value)} />
        <TextInput label="Organization" maxLength={100} value={organization} onChange={(e) => setOrganization(e.target.value)} />
        <TextInput label="Hours per week" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        <TextInput label="Weeks per year" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        <fieldset className={styles.grades}>
          <legend>Grades</legend>
          {GRADES.map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                aria-label={`Grade ${g}`}
                checked={grades.includes(g)}
                onChange={(e) => setGrades(e.target.checked ? [...grades, g] : grades.filter((x) => x !== g))}
              />{" "}
              {g}
            </label>
          ))}
        </fieldset>
        <TextInput label="Category" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className={cx(shared.form, counter.state === "over" && styles.over)}>
        <TextArea label="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className={styles.counter}>
          <span>{counter.label}</span>
          {/* Only the near/over note is announced, when it changes; the running count would speak on every keystroke. */}
          <span aria-live="polite">
            {counter.note ? <Badge tone={counter.state === "over" ? "crit" : "warn"}>{counter.note}</Badge> : null}
          </span>
        </div>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={shared.actions}>
          <Button variant="primary" type="submit" disabled={busy || counter.state === "over"}>
            Save activity
          </Button>
          {activity ? (
            <Button variant="line" onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

/** IM-04: up to 10 activities; descriptions are 150 characters, counted exactly. */
export function ActivitiesEditor({ activities, readOnly }: { activities: Activity[]; readOnly: boolean }) {
  const sorted = [...activities].sort((a, b) => a.position - b.position);
  const used = new Set(sorted.map((a) => a.position));
  const nextFree = Array.from({ length: MAX_ACTIVITIES }, (_, i) => i + 1).find((p) => !used.has(p)) ?? null;
  return (
    <Card title="Activities list" aside={<span className={styles.sub}>{`${sorted.length} of ${MAX_ACTIVITIES} · 150 characters each, counted exactly`}</span>}>
      {readOnly ? (
        <ul>
          {sorted.map((a) => (
            <li key={a.id} className={styles.slot}>
              <div>
                <b>{a.name}</b>
                <div className={styles.sub}>{[a.role, a.organization].filter(Boolean).join(" · ")}</div>
                <div className={styles.sub}>{`${a.hoursPerWeek} h/wk · ${a.weeksPerYear} wk/yr`}</div>
              </div>
              <p>{a.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {sorted.map((a) => (
            <ActivitySlot key={a.id} position={a.position} activity={a} />
          ))}
          {nextFree !== null ? <ActivitySlot key={`new-${nextFree}-${sorted.length}`} position={nextFree} activity={null} /> : null}
        </>
      )}
    </Card>
  );
}
```

`apps/web/src/app/(app)/impact/page.tsx`:

```tsx
import { ActivitiesEditor } from "@/components/impact/ActivitiesEditor";
import { RequirementCard } from "@/components/impact/RequirementCard";
import { ServiceLogs } from "@/components/impact/ServiceLogs";
import { logTotals } from "@/components/impact/impact";
import styles from "@/components/impact/impact.module.css";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { plural } from "@/lib/format";
import { getRequirementProgress, listActivities, listServiceLogs } from "@scholarcrew/core/impact";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="activities" />;
  const [logs, activities, progress] = await Promise.all([
    readShared(() => listServiceLogs(v.deps, v.actor, studentId)),
    readShared(() => listActivities(v.deps, v.actor, studentId)),
    readShared(() => getRequirementProgress(v.deps, v.actor, studentId)),
  ]);
  if (!logs || !activities) return <NotShared studentName={v.studentName} what="activities" />;
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Service and activities</h1>
          <p className={shared.sub}>
            {`${logTotals(logs)} · ${plural(activities.length, "activity", "activities")} · Impact helps you log and describe, never pads hours`}
          </p>
        </div>
        {v.isParent ? null : (
          <Button
            variant="primary"
            icon="chat"
            href={`/crew?prefill=${encodeURIComponent("@Impact suggest local service that fits my interests and requirement gaps")}`}
          >
            Ask Impact for ideas
          </Button>
        )}
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <ServiceLogs logs={logs} readOnly={v.isParent} timeZone={v.timeZone} now={v.deps.clock.now().toISOString()} />
          <ActivitiesEditor activities={activities} readOnly={v.isParent} />
        </div>
        <RequirementCard progress={progress ?? []} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/impact && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/impact/ActivitiesEditor.tsx apps/web/src/components/impact/ActivitiesEditor.test.tsx "apps/web/src/app/(app)/impact/page.tsx"
git commit -m "feat(web): activities editor with exact 150-character counts and the impact page"
```

### Q31: Asset scan for the pipeline screens (SE-05)

Plan 16's `rootAssets.test.ts` walks `app/(app)` but not this plan's component folders, so this scan covers both with 16's patterns.

- [ ] **Step 1: Write the test**

`apps/web/src/components/scholarships/assets.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const AREAS = ["scholarships", "essays", "colleges", "money", "prep", "impact"];
const DIRS = AREAS.flatMap((a) => [`app/(app)/${a}`, `components/${a}`]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = DIRS.flatMap((d) => walk(join(SRC, d))).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

describe("SE-05 asset rules for the pipeline screens", () => {
  it("loads no third-party scripts, fonts, analytics, or remote assets", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/gtag|googletagmanager|analytics|segment\.io|posthog|mixpanel|hotjar/i);
      if (file.endsWith(".css")) expect(text, file).not.toMatch(/https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run it against a planted violation and see it fail**

Create `apps/web/src/components/impact/planted.tsx` containing `import Script from "next/script";`, then run:
Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/assets`
Expected: FAIL with `expected` … `not to match /next\/script|next\/font|<script|@import|@font-face|url\(/` naming `components/impact/planted.tsx`.

- [ ] **Step 3: Remove the planted file**

Delete `apps/web/src/components/impact/planted.tsx`. The scan has no implementation of its own; Q1–Q30 are what it checks.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/scholarships/assets`
Expected: PASS, 1 file, 1 test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/scholarships/assets.test.ts
git commit -m "test(web): asset scan for the pipeline screens"
```

### Q32: Gate

- [ ] **Step 1: Format and check the whole package**

Run: `pnpm format`
Expected: Biome rewrites import order and formatting in the new files; exit 0.

Run: `pnpm --filter @scholarcrew/web typecheck`
Expected: `tsc --noEmit` prints nothing.

Run: `pnpm --filter @scholarcrew/web test`
Expected: PASS. This plan adds 30 files and 136 tests (scholarships 40, essays 33, colleges 18, money 23, prep 11, impact 11) on top of plans 13, 14, and 16; 0 failed.

Run: `pnpm --filter @scholarcrew/web build`
Expected: `next build` completes and lists `/scholarships`, `/scholarships/[slug]`, `/essays`, `/essays/[id]`, `/essays/stories`, `/colleges`, `/colleges/[entryId]`, `/money`, `/money/offers`, `/money/offers/[id]`, `/prep`, `/impact` as dynamic (ƒ) routes.

Run: `pnpm lint`
Expected: `biome check .` reports no errors.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/scholarships apps/web/src/components/essays apps/web/src/components/colleges apps/web/src/components/money apps/web/src/components/prep apps/web/src/components/impact "apps/web/src/app/(app)/scholarships" "apps/web/src/app/(app)/essays" "apps/web/src/app/(app)/colleges" "apps/web/src/app/(app)/money" "apps/web/src/app/(app)/prep" "apps/web/src/app/(app)/impact"
git commit -m "chore(web): format pipeline screens"
```

Skip the commit if `pnpm format` changed nothing.

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/web typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/web test` exits 0 (test database up, as plan 13's setup truncates it before each test).
- [ ] `pnpm --filter @scholarcrew/web build` exits 0.
- [ ] `pnpm lint` exits 0.

## Testing Requirements

Command: `pnpm --filter @scholarcrew/web test src/components/{scholarships,essays,colleges,money,prep,impact}`. Expected: 30 files, 136 tests (scholarships 40, essays 33, colleges 18, money 23, prep 11, impact 11), all passing. The tests prove:

- **Scholarships:** board columns map stages (planned and drafting in Working on; lost and skipped only behind the filter), filters, card actions per stage, totals line, and the core's ranked Matched order kept as is (R2P-5); the won dialog rejects empty, fractional, and zero amounts and a missing one-time/renewable choice before any request; flagged listings show the scam reason and "Why flagged?", while retired or under-review listings show "Not available" with no link (R2P-4); local submissions validate the URL then create the listing with one request, since the core puts it on the board (R2C-12); a draft listing (the student's own submission) shows "Amount not known yet" on its card and detail page, never "$0" (R3V-1); parents get no actions; search results save and explain flags, and `/scholarships` searches with `openOn` set to the student's today so closed listings never show (R3V-2); the report dialog needs a reason and posts `{ reason, details }`; Start essay posts the prompt and moves the card to drafting, cutting the title to 200 characters (R3V-15, R3A-19); a null deadline reads "Not posted" (R3V-8); the detail page shows parents the reasons the core returns (07 applies the `sensitive` grant, SC-02, R2I-11) and no crew room, students every reason and the room; a saved card with no reasons says "You don't match any listed rule yet." and an unsaved listing says to save it (R2P-3); a renewal link by slug opens a won renewable award with its terms and the existing room (SC-11, D44); no pipeline file loads third-party scripts, fonts, analytics, or remote CSS assets (SE-05).
- **Context rooms:** "Ask your crew here" opens the room with `{ room, roomRefId }` (scholarship, college, or essay) and mounts plan 16's `Thread`, which sends and streams; an existing room renders through `Thread` with the room's chips; a crisis reply hides the chips (CR-09); a lost stream shows 16's message and Send works again; a failed open shows the server message.
- **Essays:** word and character counts (code points) with near at 90% and over at 100%; the nth occurrence of a quote is highlighted with its number, each segment carries its body offset (the React key), and overlapping or missing quotes are reported; story ranking by theme overlap with simple stemming and ties by fewer uses; saves send `baseVersion` and advance it; a 409 shows "This draft changed in another tab" with a reload and keeps the text; resolve, Ask Quill (job then refresh), a 402 with "See plans" (E-16-6), failed review, and a lost stream that clears "Quill is reading" and re-enables Ask Quill; draft history opens a version read-only; reuse check warns before linking the same story to the same target and links after "Use it anyway"; the essay list shows `latestWordCount` and target names without calling `getEssay` (D34); the new-essay form validates the title and a 1–5,000 word limit and posts `POST /essays` with the target, then opens the studio (D47); Essay Studio shows the essay's crew room to students only (CR-08) and a Drafting/Ready/Submitted select that sends `PATCH /essays/:id` (R2P-14); Story Bank create with theme chips, edit with PATCH, archive with DELETE, prefill from a reflection, the Quill story interview link capped at 4,000 characters (ES-08), read-only for parents.
- **Colleges:** labels, the 25-school message before searching, the server's `invalid_input` message (07's exact text, D5, R3A-20), plan names from 02 `APP_PLAN_LABELS` ("Rolling admission", R3V-8), search, pick, add with fit and plan; table cells per mockup 05; item status PATCH; "Start essay" on a supplement posts `POST /essays` (college target), then `PATCH /application-items/:id { essayId }`, then opens the studio (R2P-17); recommender add and request with the helper link note and a refresh; past requests for the entry with their helper link state matched by `helperLinkId` (D33), and a status select ("Asked" shown but disabled) that sends `PATCH /recommendations/:id` (R2P-11).
- **Money:** axis rounding, one-time grant end labels, page chips with cited text; the comparison renders the State U / Riverside / Northgate fixture with the lowest 4-year badge, warnings, and assumptions; upload takes only PDFs (a PNG is refused) and refuses files over 10 MB before sending (R2P-8), then goes `POST /documents` (FormData `kind=award_letter`) → `POST /offers` → the parse job's SSE stream when `parseJobId` is set (one `GET /offers/:id` after it ends) or polling when it's null, until `needs_review` with a review link, or a failure message with "Remove and try again" (`DELETE /offers/:id`) (D31, R2P-8); Remove on a listed letter sends DELETE, then refreshes, and shows a 409's message; page chips carry the cited text for screen readers (MO-07); line category changes PATCH `/offer-lines/:id`; amounts validate on blur; confirm posts and returns to the offers page; the appeal outline shows "See plans" on 402 (E-16-6); calculator results PUT whole dollars, and the calculator picker lists every current-season college, including one with no estimate (R2P-13); aid steps PATCH `done`; the special-circumstances and verification cards list steps and documents, with Ask Aid links for students only (AID-04, AID-05).
- **Prep:** target ranges, quick chips, retake job then the computed table and Prep's reply, and "See plans" on a 402 (E-16-6); scores table, delete, add with validation and engine section keys; study plan proposal and accept.
- **Impact:** hour parsing and totals, confirmed-only requirement progress, verification statuses with "Ask to confirm", a lapsed supervisor link shown as "Link expired" with "Ask to confirm" again (R2P-10), the reflection-to-story link, the 150-character counter (near, over with Save disabled, emoji counted as one), PUT with the next free position, 10-slot cap, read-only for parents.

## Review Checklist

- [ ] Every file is under `apps/web/src/app/(app)/{scholarships,essays,colleges,money,prep,impact}/**` or `apps/web/src/components/{scholarships,essays,colleges,money,prep,impact}/**`.
- [ ] Pages read only through `@scholarcrew/core` services with the page actor; parents pass the student id from `getFamily` and every read is wrapped in `readShared`; parent views render no mutation controls.
- [ ] Client components call only routes in `00-overview.md` section 10 with the domain body shapes: `PATCH /scholarship-applications/:id` (`ApplicationPatch`), `POST /scholarships/local`, `POST /scholarships/:id/report`, `POST /essays`, `POST /essays/:id/versions` (`{ body, baseVersion }`), `POST /essays/:id/review`, `POST /essay-comments/:id/resolve`, `POST /stories/reuse-check` (no null fields), `POST /stories/link`, `GET /colleges?q=`, `POST /college-list`, `PATCH /application-items/:id` (`{ status }` or `{ essayId }`), `POST /recommenders`, `POST /recommenders/requests`, `PATCH /recommendations/:id` (`RecRequestPatch`), `PATCH /essays/:id` (`EssayPatch`), `PUT /costs/calculator`, `POST /documents`, `POST /offers`, `GET /offers/:id`, `DELETE /offers/:id`, `PATCH /offer-lines/:id`, `POST /offers/:id/confirm`, `POST /offers/:id/appeal`, `PATCH /aid/items/:id`, `POST /test-scores`, `DELETE /test-scores/:id`, `POST /prep/retake`, `POST /prep/study-plan`, `POST /service-logs`, `POST /service-logs/:id/verify`, `DELETE /service-logs/:id`, `PUT /activities`, `DELETE /activities/:id`, `POST /conversations`, `GET /jobs/:id`, and `GET /jobs/:id/events` (through `useJobStream`). `POST /conversations/:id/messages` is sent only by plan 16's `Thread`. Server pages call `colleges.listRecRequests` and `helpers.listHelperLinks` directly (the services behind `GET /recommendations` and `GET /helper-links`).
- [ ] Limits use `@scholarcrew/engines` (`countWords`, `countChars`, `limitState`); retake numbers use `retakeAnalysis` with the same inputs as `computeRetake`.
- [ ] Only `ICON_NAMES` icons are used; no remote assets or scripts (Q31 scans every non-test file in these folders).
- [ ] No React key is built from a map index; `ReviewView` keys segments by `start`.
- [ ] `ContextCrew` holds no composer, send, or stream logic of its own: the conversation is plan 16's `Thread` with only its P12 props, so chips disappear after a crisis reply everywhere (D35, CR-09).
- [ ] Every `useJobStream` caller (`JobReply`, `CommentsPanel`, `UploadLetter`, and `Thread` inside `ContextCrew`) reads `error` and stops showing "working" when it's set.
- [ ] `bestOfficial` exists once (`colleges/colleges.ts`); `prep/prep.ts` re-exports it.
- [ ] `/prep` never shows parents `NotShared`; the share-less test scores get their own card.
- [ ] The deviations at the top (context rooms on `Thread`, offer parse job id, retake result, recommendation requests, essay list counts, new essay, story interview, AID-04/05, IM-06, prep for parents, report links, shared folder, plan limits, and the round 2 PDF-only letters, parent match reasons, recommendation status, link expiry, and retired cards) are recorded in `review-log.md`.
- [ ] Round 2 depends on other plans: 07 `submitLocalScholarship` adds the planned application (R2C-12), `getBoard` ranks Matched, moves retired and under-review cards to `flagged`, and applies the `sensitive` grant (R2P-5, R2P-4, R2I-11), `saveScholarship` writes reasons (R2P-3), `updateRecRequest`, `updateEssay`, and `ServiceLog.verificationExpiresAt`; 08 `deleteOffer`; 14 `PATCH /recommendations/:id`, `PATCH /essays/:id`, and `DELETE /offers/:id`.
- [ ] Round 3 depends on other plans: 02 `APP_PLAN_LABELS`, `APPLICATION_STAGE_LABELS`, and `FREE_CATEGORIES` (R3V-8); 07 `searchScholarships` `openOn` (R3V-2) and the 25-college `invalid_input` text (R3A-20); 14 N9 answering message sends with 202 (R3A-14); 16 `isLimit` (E-16-6). `PLAN_LABEL`, `STAGE_LABEL`, and the board/detail exports keep their names, so 18/19 imports are unchanged.
