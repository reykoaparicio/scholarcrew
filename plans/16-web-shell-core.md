# Plan 16: Web shell and core screens (Agent P)

This plan builds the signed-in frame of the web app and the six core screens: the root layout (tokens, globals, no third-party scripts), the `(app)` layout (session guard, onboarding redirect, sidebar, top bar with notifications, mobile tab bar), the client helpers every screen uses (`src/lib`: `api`, `useJobStream`, formatting, greetings), and the screens This week, Crew, Onboarding, Settings, Memory, and Family, ported from mockups 01, 02, 07, 08, 09, 13, and 19. Server components call `@scholarcrew/core` services directly with the page actor; client components talk to `/api/v1` through `api()`. Feature IDs: WK-01..WK-06, CR-01..CR-07 and CR-09..CR-11 (screen side), ON-01..ON-06, ME-01..ME-09, FA-01..FA-05 and FA-07, HL-01, HL-04 (helper link management), NO-01, NO-04, NO-05 (SMS setting, R3), BI-01..BI-05, EX-01 (extension tokens), ID-03, ID-04 (parent nav and page guards), ID-05, SE-05.

Rules this plan follows on top of `00-overview.md`:

- Pages and layouts are server components. Anything with state, effects, or handlers is a `"use client"` component under `src/components/**`. Server components never pass functions to client components.
- Every component composes `@scholarcrew/ui` parts (plan 15) and only uses the 24 icon names in `ICON_NAMES`. Screen-specific layout lives in one CSS module per area (`week.module.css`, `crew.module.css`, ...).
- `api(path)` accepts `/api/v1/...` paths or short paths (`/plan-items/1` becomes `/api/v1/plan-items/1`). Plans 17 and 18 may use either.
- Client tests start with `// @vitest-environment jsdom`, mock `next/navigation`, stub `fetch` with `vi.stubGlobal` (plan 13's `test/setup.ts` unstubs after each test), and call `cleanup` in `afterEach` (Vitest globals are off, so Testing Library can't auto-clean). Plan 13's setup truncates the test database before every test, so the gate needs the test database up even for these tests.
- Tests use `fireEvent` and `waitFor` from `@testing-library/react` (no `user-event`; it isn't a pinned dependency).
- Mockup data (Jordan, Dana, Hill Country) is never hardcoded. Copy and layout follow the mockups; values come from services.

Exports for 17/18 (fixed; later changes only add optional props or fields):

- `@/lib/api`: `api<T>(path, init?)`, `ApiError` (`code`, `status`, `details`), `apiUrl(path)`, `errorMessage(e)`, `isLimit(e)` (true for 402 `limit_reached`; render `<Button variant="soft" size="sm" href="/settings">See plans</Button>` next to the alert, E-16-6).
- `@/lib/sse`: `useJobStream(jobId: string | null, opts?: { pollMs?: number; maxMs?: number }): { job: CrewJob | null; error: string | null }`. It follows `GET /jobs/:id/events`, closes on a terminal job, and when the server sends `end` before a terminal status (the 130 s cap) or the connection errors while the browser is reconnecting (`readyState` CONNECTING), it closes the stream and polls `GET /jobs/:id` (first poll right away, then every `pollMs`, default 3000) until a terminal status. An `error` with `readyState` CLOSED (2) sets `error` at once with no polling, so 17's fakes that set CLOSED keep working. Otherwise `error` is set only when a poll answers 4xx or a non-job body, after 3 failed polls in a row ("Lost the live connection. Refresh to check on your crew."), or after `maxMs` (default 15 minutes; "Still working. Refresh to check on your crew."). Tests that emit a non-fatal `error` or an early `end` must stub `fetch` for `/api/v1/jobs/<id>`: a terminal `CrewJob` to finish, or a 404 for an immediate `error`. Also exported: `JOB_POLL_MS`, `JOB_FOLLOW_MAX_MS`, `STREAM_LOST`, `STILL_WORKING`.
- `@/components/crew/Thread`: `Thread` with `ThreadProps` = `conversation: Conversation | null`, `messages: Message[]`, `prefill?`, `chips?: Array<{ role: CrewRole; text: string }>`, `compact?`, `readOnlyCards?`, `authors?: Record<string, string>`, `placeholder?`, `emptyText?`, `timeZone?`, plus the additive `openRoom?: { room: "scholarship" | "college" | "essay"; roomRefId: string }` (with `conversation={null}`, the first send POSTs `/conversations` with `{ room, roomRefId, familyId: null, title: "" }` and then sends there; don't `key` the Thread on the conversation id for a lazy room) and `readOnly?: boolean` (messages only: no chips or composer, and action cards render read-only). `DEFAULT_CHIPS` is exported too. Chips hide after a crisis reply, the stream error shows in the job progress, a finished job calls `router.refresh()`, and 402 shows "See plans".
- `@/components/crew/ReplyCard`: `ReplyCard({ message: Message; readOnly?: boolean; compact?: boolean; timeZone?: string })`, unchanged.
- `@/lib/pageActor`: `requireAppActor(roles?)` → `{ actor, me, deps }` (server only) and `loadMe`.
- `@/lib/format`, `@/lib/cx`, `@/lib/time`: unchanged (`usd`, `dateShort`, `daysLabel`, `instantShort`, `plural`, `minutesLabel`, `addDaysIso`, `dateWithWeekday`, `cx`, `greeting`, ...).
- `@/components/shell/nav`: `navFor(role, enabled?, shared?: ShareCategory[])`, `mobileTabsFor(role, enabled, shared?)`, `rosterFor(enabled, role?)`, `sharedCategoriesOf(settings)`, `activeKeyFor`, `onboardingRedirect`, `displayNameOf`, `userCard`, `OPTIONAL_CREW`, `OPTIONAL_CREW_FACT`. Parents get `scholarships` (→ `/scholarships`) when `scholarships` is shared, `essays` (→ `/essays`, or "Story Bank" → `/essays/stories` when only `stories` is shared), and `impact` ("Service" → `/impact`) when `activities` is shared, plus "Crew chats" (→ `/crew`, the family room) always. 17's parent views must accept `requireAppActor(["student", "parent"])` on those paths.
- `src/app/(app)/error.tsx` and `loading.tsx` wrap every `(app)` page, 17's included: a thrown non-`not_found` error renders "Something went wrong on our side" with Try again, and server pages show "Loading…" while they stream.

Deviations and gaps (also in the final report):

- **Onboarding redirect (D30).** Plan 13's middleware forwards `x-pathname`, so the `(app)` layout redirects unfinished students to `/onboarding` on the server. When the header is missing (paths outside the middleware matcher), it falls back to `SetupFrame` + the client `OnboardingGate`. `requireAppActor` redirects too, and `/onboarding` itself sends finished users to `/week`.
- **Documents and exports (D27).** The settings page reads `listDocuments(deps, actor)` and `latestExport(deps, actor)` from core, the services behind `GET /documents` and `GET /account/exports/latest` (server components call core, not their own API). The export card's "Check again" calls `GET /account/exports/latest`. `src/lib/owned.ts` is gone.
- **Background jobs (D28).** The "Working in the background" panel lists `GET /jobs?active=1&limit=10` (weekly plan, essay review, offer parse, and crew jobs from any tab) and labels this tab's crew questions from `sessionStorage`.
- **Prep and Impact switches (D29, D43).** The "add" chips write the confirmed fact `crew_prep_enabled` / `crew_impact_enabled` = `true` with visibility `crew` through `POST /facts`; plan 12's port reads it through `crewVisibleFacts(..., "crew")`. The sidebar "add" links go to `/crew#add-teammate`, and parents get no "add" links.
- **Parent crew chats (E-16-2).** Plan 08 never lets parents read a student's private rooms, so a parent's "Crew chats" screen is the family room at `/crew/<familyRoomId>` (parents can post there; cards stay read-only). The `chats` share category has no reader in 08 yet, so it doesn't open private rooms. Follow-up for 08 if that's wanted.
- Admins hitting an `(app)` page are redirected to `/admin` (plan 18).
- `src/lib/pageActor.ts` adds `requireAppActor(roles?)` and a request-cached `loadMe` on top of plan 13's `requirePageActor`; plans 17 and 18 can use them so unfinished students are redirected server-side too.
- 00 §5 lists `src/app/(app)/layout.tsx` for 16 but not the `(app)` `error.tsx`/`loading.tsx` this plan creates (E-16-4); the integrator adds them to the plan-16 line.

## Files

Create:

- `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/error.tsx`, `apps/web/src/app/(app)/loading.tsx`
- `apps/web/src/app/(app)/week/page.tsx`
- `apps/web/src/app/(app)/crew/page.tsx`, `apps/web/src/app/(app)/crew/[conversationId]/page.tsx`
- `apps/web/src/app/(app)/onboarding/page.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/memory/page.tsx`
- `apps/web/src/app/(app)/family/page.tsx`
- `apps/web/src/lib/cx.ts`, `format.ts`, `time.ts`, `api.ts`, `sse.ts`, `sensitive.ts`, `pageActor.ts` (server-only `requireAppActor` and a per-request `loadMe`; plans 17 and 18 may use them)
- `apps/web/src/components/shell/nav.ts`, `NotificationBell.tsx`, `ShellFrame.tsx`, `SetupFrame.tsx`, `OnboardingGate.tsx`, `shell.module.css`
- `apps/web/src/components/week/summary.ts`, `PlanList.tsx`, `NextStepHero.tsx`, `GapCard.tsx`, `ComingUp.tsx`, `SweepCard.tsx`, `AskBar.tsx`, `CrewWorking.tsx`, `PlanWeekButton.tsx`, `week.module.css`
- `apps/web/src/components/crew/ActionButtons.tsx`, `Receipt.tsx`, `CrisisReply.tsx`, `ReplyCard.tsx`, `JobProgress.tsx`, `jobMemory.ts`, `Thread.tsx`, `roomFacts.ts`, `BackgroundJobs.tsx`, `RoomButtons.tsx`, `AddTeammate.tsx`, `crew.module.css`
- `apps/web/src/components/onboarding/model.ts`, `steps.tsx`, `SidePanels.tsx`, `Under13Notice.tsx`, `OnboardingWizard.tsx`, `onboarding.module.css`
- `apps/web/src/components/settings/AccountCard.tsx`, `NotificationsCard.tsx`, `PlanCard.tsx`, `ExtensionTokens.tsx`, `DocumentsCard.tsx`, `DataCard.tsx`, `BillingReturnNotice.tsx`, `settings.module.css`
- `apps/web/src/components/memory/labels.ts`, `FactsCard.tsx`, `DecisionsCard.tsx`, `SensitiveToggles.tsx`, `StoryBankCard.tsx`, `StartFresh.tsx`, `memory.module.css`
- `apps/web/src/components/family/ShareToggles.tsx`, `FamilyTasks.tsx`, `ParentSpace.tsx`, `HelperLinks.tsx`, `Members.tsx`, `family.module.css`

Modify: none (plan 13 owns `package.json`, configs, `test/**`, `src/server/**`, and `src/middleware.ts`).

Test:

- `apps/web/src/lib/format.test.ts`, `time.test.ts`, `api.test.ts`, `sse.test.tsx`
- `apps/web/src/components/shell/rootAssets.test.ts`, `nav.test.ts`, `NotificationBell.test.tsx`, `frames.test.tsx`, `AppLayout.test.tsx`, `boundaries.test.tsx`
- `apps/web/src/components/week/summary.test.ts`, `PlanList.test.tsx`, `cards.test.tsx`, `WeekPage.test.tsx`
- `apps/web/src/components/crew/ReplyCard.test.tsx`, `Thread.test.tsx`, `roomFacts.test.ts`, `BackgroundJobs.test.tsx`, `CrewPage.test.tsx`
- `apps/web/src/components/onboarding/model.test.ts`, `OnboardingWizard.test.tsx`
- `apps/web/src/components/settings/cards.test.tsx`, `ExtensionTokens.test.tsx`, `DataCard.test.tsx`, `SettingsPage.test.tsx`
- `apps/web/src/components/memory/SensitiveToggles.test.tsx`, `FactsCard.test.tsx`
- `apps/web/src/components/family/ShareToggles.test.tsx`, `HelperLinks.test.tsx`, `FamilyPage.test.tsx`

## Tasks

### P1: Formatting, time, and class-name helpers

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDaysIso, dateShort, dateWithWeekday, daysLabel, instantShort, minutesLabel, plural, usd, internalHref, safeHref } from "./format";

describe("safe links", () => {
  it("keeps source links HTTP(S) and action links on the app origin", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/plain,x")).toBeNull();
    expect(safeHref("https://source.test/a")).toBe("https://source.test/a");
    expect(internalHref("/\\evil.example", "https://app.test")).toBeNull();
    expect(internalHref("//evil.example", "https://app.test")).toBeNull();
    expect(internalHref("/week?x=1", "https://app.test")).toBe("/week?x=1");
  });
});

describe("usd", () => {
  it("formats whole dollars", () => {
    expect(usd(9200)).toBe("$9,200");
    expect(usd(0)).toBe("$0");
    expect(usd(1000.4)).toBe("$1,000");
    expect(usd(1_250_000)).toBe("$1,250,000");
  });
});

describe("dates", () => {
  it("formats calendar dates without shifting the day", () => {
    expect(dateShort("2026-10-15")).toBe("Oct 15");
    expect(dateShort("2027-01-01")).toBe("Jan 1");
    expect(dateWithWeekday("2026-10-15")).toBe("Thu, Oct 15");
  });

  it("formats instants in a time zone", () => {
    expect(instantShort("2026-10-02T03:00:00.000Z", "America/Chicago")).toBe("Oct 1");
    expect(instantShort("2026-10-02T03:00:00.000Z", "UTC")).toBe("Oct 2");
  });

  it("adds days across month ends", () => {
    expect(addDaysIso("2026-10-26", 7)).toBe("2026-11-02");
    expect(addDaysIso("2026-10-05", -1)).toBe("2026-10-04");
  });
});

describe("daysLabel", () => {
  it("reads like the mockups", () => {
    expect(daysLabel(9)).toBe("9 days");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(-1)).toBe("1 day ago");
    expect(daysLabel(-3)).toBe("3 days ago");
  });
});

describe("minutesLabel and plural", () => {
  it("formats durations", () => {
    expect(minutesLabel(30)).toBe("30 min");
    expect(minutesLabel(0)).toBe("0 min");
    expect(minutesLabel(60)).toBe("1 h");
    expect(minutesLabel(135)).toBe("2 h 15 min");
  });

  it("pluralizes", () => {
    expect(plural(1, "thing")).toBe("1 thing");
    expect(plural(4, "thing")).toBe("4 things");
    expect(plural(2, "story", "stories")).toBe("2 stories");
  });
});
```

`apps/web/src/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TIME_ZONES, greeting, localHour } from "./time";

describe("greeting", () => {
  it("uses the hour in the student's time zone", () => {
    expect(localHour(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toBe(10);
    expect(greeting(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toBe("Good morning");
    expect(greeting(new Date("2026-10-06T20:00:00.000Z"), "America/Chicago")).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-07T01:00:00.000Z"), "America/Chicago")).toBe("Good evening");
    expect(greeting(new Date("2026-10-06T15:00:00.000Z"), "America/Los_Angeles")).toBe("Good morning");
    expect(greeting(new Date("2026-10-06T22:30:00.000Z"), "America/New_York")).toBe("Good evening");
  });

  it("treats the small hours as evening and survives a bad zone", () => {
    expect(greeting(new Date("2026-10-06T08:00:00.000Z"), "America/Chicago")).toBe("Good evening");
    expect(greeting(new Date("2026-10-06T20:00:00.000Z"), "Mars/Olympus")).toBe("Good afternoon");
  });

  it("lists US time zones with Central first", () => {
    expect(TIME_ZONES[0]).toEqual({ value: "America/Chicago", label: "Central" });
    expect(TIME_ZONES.map((z) => z.value)).toContain("Pacific/Honolulu");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/lib`
Expected: FAIL with `Failed to resolve import "./format" from "src/lib/format.test.ts"` and the same for `./time`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/cx.ts`:

```ts
/** Joins truthy class names with a space. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

`apps/web/src/lib/format.ts`:

```ts
import type { IsoDate } from "@scholarcrew/domain";

/** External source links accept only parsed HTTP(S) URLs. */
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Internal action links stay on the supplied application origin after parsing. */
export function internalHref(href: string, origin: string): string | null {
  if (!/^\/(?![\/\\])[^\s\\]*$/.test(href)) return null;
  try {
    const parsed = new URL(href, origin);
    return parsed.origin === origin ? parsed.pathname + parsed.search + parsed.hash : null;
  } catch {
    return null;
  }
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WITH_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function utcDate(d: IsoDate): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

/** Whole US dollars: 9200 → "$9,200". */
export function usd(n: number): string {
  return USD.format(Math.round(n));
}

/** Calendar date: "2026-10-15" → "Oct 15". Formatted in UTC so the day never shifts. */
export function dateShort(d: IsoDate): string {
  return SHORT.format(utcDate(d));
}

/** "2026-10-15" → "Thu, Oct 15". */
export function dateWithWeekday(d: IsoDate): string {
  return WITH_WEEKDAY.format(utcDate(d));
}

/** An instant as a short date in a time zone: "Oct 2". */
export function instantShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(iso));
}

/** 9 → "9 days", 1 → "1 day", 0 → "today", -3 → "3 days ago". */
export function daysLabel(n: number): string {
  if (n === 0) return "today";
  const abs = Math.abs(n);
  const unit = abs === 1 ? "day" : "days";
  return n > 0 ? `${abs} ${unit}` : `${abs} ${unit} ago`;
}

/** 135 → "2 h 15 min", 60 → "1 h", 30 → "30 min". */
export function minutesLabel(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function addDaysIso(d: IsoDate, days: number): IsoDate {
  const t = utcDate(d);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
```

`apps/web/src/lib/time.ts`:

```ts
export const DEFAULT_TIME_ZONE = "America/Chicago";

export const TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

/** 0..23 in the given zone. Throws RangeError on an unknown zone. */
export function localHour(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return hour === 24 ? 0 : hour;
}

/** "Good morning" before noon, "Good afternoon" until 5 p.m., otherwise (and before 5 a.m.) "Good evening". */
export function greeting(now: Date, timeZone: string): string {
  let hour: number;
  try {
    hour = localHour(now, timeZone);
  } catch {
    hour = localHour(now, DEFAULT_TIME_ZONE);
  }
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function timeZoneLabel(value: string): string {
  return TIME_ZONES.find((z) => z.value === value)?.label ?? value;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/lib && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/cx.ts apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts apps/web/src/lib/time.ts apps/web/src/lib/time.test.ts
git commit -m "feat(web): money, date, duration, and greeting helpers"
```

### P2: API client and error mapping

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError, api, apiUrl, errorMessage, isLimit } from "./api";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** A typed fetch mock so mock.calls[n][1] is the RequestInit. */
function fetchReturning(make: () => Response) {
  return vi.fn(async (_url: string, _init?: RequestInit) => make());
}

describe("apiUrl", () => {
  it("prefixes short paths and keeps full ones", () => {
    expect(apiUrl("/plan-items/1")).toBe("/api/v1/plan-items/1");
    expect(apiUrl("me")).toBe("/api/v1/me");
    expect(apiUrl("/api/v1/me")).toBe("/api/v1/me");
  });
});

describe("api", () => {
  it("GETs JSON with cookies and no body", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api<{ ok: boolean }>("/me")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/me", {
      method: "GET",
      headers: { Accept: "application/json" },
      body: undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("sends JSON bodies and defaults the method to POST", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ id: "x" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await api("/plan-items/1", { method: "PATCH", body: { status: "done" } });
    await api("/actions/apply", { body: { messageId: "m", cardId: "c" } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"status":"done"}',
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });

  it("passes FormData through without a JSON content type", async () => {
    const fetchMock = fetchReturning(() => jsonResponse({ id: "d" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("kind", "transcript");
    await api("/documents", { method: "POST", body: form });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe(form);
    expect(init?.headers).toEqual({ Accept: "application/json" });
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api("/facts/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("maps the error body to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month" } }, 402),
      ),
    );
    const err = await api("/conversations/c/messages", { body: { body: "hi" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "limit_reached", status: 402, message: "You've used all 20 crew requests this month" });
    expect(errorMessage(err)).toBe("You've used all 20 crew requests this month");
  });

  it("falls back when the error isn't an ErrorBody", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    await expect(api("/me")).rejects.toMatchObject({ code: "internal", status: 502, message: "Something went wrong (502). Try again." });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(api("/me")).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>too large</html>", { status: 413 })));
    await expect(api("/documents", { body: new FormData() })).rejects.toMatchObject({
      code: "invalid_input",
      status: 413,
      message: "That's too big to upload. Files can be up to 10 MB.",
    });
  });

  it("spots allowance errors with isLimit", () => {
    expect(isLimit(new ApiError("limit_reached", "Used up", 402))).toBe(true);
    expect(isLimit(new ApiError("invalid_input", "Too many colleges", 400))).toBe(false);
    expect(isLimit(new Error("limit_reached"))).toBe(false);
  });

  it("reports network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api("/me")).rejects.toMatchObject({ code: "network", status: 0 });
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/lib/api`
Expected: FAIL with `Failed to resolve import "./api" from "src/lib/api.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/api.ts`:

```ts
import { ErrorBody } from "@scholarcrew/domain";

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** "/plan-items/1" → "/api/v1/plan-items/1"; paths already under /api/ are kept. */
export function apiUrl(path: string): string {
  if (path.startsWith("/api/")) return path;
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Same-origin JSON call. The method defaults to GET, or POST when a body is given.
 * FormData bodies are sent as multipart. 204 resolves to undefined. Errors throw ApiError.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, headers, body, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("network", "Can't reach ScholarCrew right now. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(data);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(e.code, e.message, res.status, e.details);
    }
    const code = res.status === 401 ? "unauthenticated" : "internal";
    // A proxy can cut an upload off at 413 before plan 13's ErrorBody is written.
    if (res.status === 413) throw new ApiError("invalid_input", "That's too big to upload. Files can be up to 10 MB.", 413);
    throw new ApiError(code, `Something went wrong (${res.status}). Try again.`, res.status);
  }
  return data as T;
}

/** Message to show the user for any thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again.";
}

/** CR-10/BI-02: the monthly allowance is used up (402 limit_reached); show a "See plans" link. */
export function isLimit(e: unknown): boolean {
  return e instanceof ApiError && e.code === "limit_reached";
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/lib/api && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "feat(web): api client with ApiError mapped from the error body"
```

### P3: Job stream hook

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/sse.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CrewJob } from "@scholarcrew/domain";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STILL_WORKING, STREAM_LOST, useJobStream } from "./sse";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  /** 0 CONNECTING (the browser retries), 2 CLOSED (it gave up). */
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
  close() {
    this.closed = true;
  }
}

const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "crew_request",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [{ at: "2026-10-06T15:00:01.000Z", role: "scout", text: "Checking local listings" }],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:01.000Z",
  ...o,
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(cleanup);

const JOB_URL = `/api/v1/jobs/${job().id}`;

/** fetch that answers GET /jobs/:id with each job in turn (the last one repeats). */
function pollReturning(...jobs: CrewJob[]) {
  let n = 0;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = jobs[Math.min(n, jobs.length - 1)];
    n += 1;
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useJobStream", () => {
  it("does nothing without a job id", () => {
    const { result } = renderHook(() => useJobStream(null));
    expect(result.current).toEqual({ job: null, error: null });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("follows job events and closes on a terminal job without polling", () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result, unmount } = renderHook(() => useJobStream(job().id));
    const source = FakeEventSource.instances[0];
    expect(source?.url).toBe(`/api/v1/jobs/${job().id}/events`);
    act(() => source?.emit("job", JSON.stringify(job())));
    expect(result.current.job?.status).toBe("working");
    expect(result.current.job?.progress[0]?.text).toBe("Checking local listings");
    act(() => source?.emit("job", JSON.stringify(job({ status: "ready" }))));
    expect(result.current.job?.status).toBe("ready");
    expect(source?.closed).toBe(true);
    act(() => source?.emit("end"));
    act(() => source?.emit("error"));
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });

  it("ignores malformed events", () => {
    const { result } = renderHook(() => useJobStream(job().id));
    act(() => FakeEventSource.instances[0]?.emit("job", "not json"));
    expect(result.current).toEqual({ job: null, error: null });
  });

  it("an error falls back to polling GET /jobs/:id until a terminal status", async () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    act(() => source?.emit("job", JSON.stringify(job())));
    act(() => source?.emit("error"));
    expect(source?.closed).toBe(true);
    await waitFor(() => expect(result.current.job?.status).toBe("ready"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(JOB_URL);
    expect(result.current.error).toBeNull();
    await pause(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("end before a terminal status polls until the job finishes", async () => {
    const fetchMock = pollReturning(job({ status: "working" }), job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    act(() => source?.emit("job", JSON.stringify(job())));
    act(() => source?.emit("end"));
    expect(source?.closed).toBe(true);
    await waitFor(() => expect(result.current.job?.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("reports a lost connection when polling keeps failing or the job is gone", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", offline);
    const first = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    act(() => FakeEventSource.instances[0]?.emit("error"));
    await waitFor(() => expect(first.result.current.error).toBe(STREAM_LOST));
    expect(offline).toHaveBeenCalledTimes(3);
    first.unmount();

    const gone = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Job not found" } }), { status: 404 }),
    );
    vi.stubGlobal("fetch", gone);
    const second = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    act(() => FakeEventSource.instances[1]?.emit("error"));
    await waitFor(() => expect(second.result.current.error).toBe(STREAM_LOST));
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("stops with a still-working message after maxMs", async () => {
    pollReturning(job({ status: "working" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5, maxMs: 40 }));
    act(() => FakeEventSource.instances[0]?.emit("end"));
    await waitFor(() => expect(result.current.error).toBe(STILL_WORKING));
    expect(result.current.job?.status).toBe("working");
  });

  it("reports a fatal error (stream CLOSED) at once without polling", () => {
    const fetchMock = pollReturning(job({ status: "ready" }));
    const { result } = renderHook(() => useJobStream(job().id, { pollMs: 5 }));
    const source = FakeEventSource.instances[0];
    if (source) source.readyState = 2;
    act(() => source?.emit("error"));
    expect(result.current.error).toBe(STREAM_LOST);
    expect(source?.closed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the old stream when the id changes", () => {
    const { rerender } = renderHook(({ id }) => useJobStream(id), { initialProps: { id: "a" as string | null } });
    rerender({ id: "b" });
    expect(FakeEventSource.instances.map((s) => s.closed)).toEqual([true, false]);
    rerender({ id: null });
    expect(FakeEventSource.instances[1]?.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/lib/sse`
Expected: FAIL with `Failed to resolve import "./sse" from "src/lib/sse.test.tsx"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/sse.ts`:

```ts
import { CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";

/** Poll cadence once the live stream ends early (the route's 130 s cap) or drops. */
export const JOB_POLL_MS = 3000;
/** Stop following after this long; crew jobs expire at 900 s. */
export const JOB_FOLLOW_MAX_MS = 15 * 60 * 1000;
const MAX_POLL_FAILURES = 3;
/** EventSource.CLOSED; a literal so test doubles without the static constants still work. */
const EVENT_SOURCE_CLOSED = 2;

export const STREAM_LOST = "Lost the live connection. Refresh to check on your crew.";
export const STILL_WORKING = "Still working. Refresh to check on your crew.";

type StreamState = { id: string | null; job: CrewJob | null; error: string | null };

function parseJob(data: unknown): CrewJob | null {
  const parsed = CrewJob.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function parseEvent(data: string): CrewJob | null {
  try {
    return parseJob(JSON.parse(data));
  } catch {
    return null;
  }
}

function isTerminal(job: CrewJob | null): boolean {
  return job !== null && TERMINAL_JOB_STATUSES.includes(job.status);
}

/** Network errors, rate limits, and 5xx are worth another poll; other 4xx answers are final. */
function retryable(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status === 0 || e.status === 429 || e.status >= 500;
}

/**
 * CR-06: follows GET /api/v1/jobs/:id/events. "job" events carry the CrewJob, and a terminal job closes the
 * stream. When the server ends the stream before a terminal status, or the connection errors, the stream is
 * closed and GET /api/v1/jobs/:id is polled until the job is terminal (E-16-1). A CLOSED stream error is final. `error` is set only when
 * polling can't continue or `maxMs` passes.
 */
export function useJobStream(
  jobId: string | null,
  opts?: { pollMs?: number; maxMs?: number },
): { job: CrewJob | null; error: string | null } {
  const [state, setState] = useState<StreamState>({ id: null, job: null, error: null });
  const pollMs = opts?.pollMs ?? JOB_POLL_MS;
  const maxMs = opts?.maxMs ?? JOB_FOLLOW_MAX_MS;

  useEffect(() => {
    if (!jobId) return;
    const id = jobId;
    const startedAt = Date.now();
    let stopped = false;
    let polling = false;
    let failures = 0;
    let last: CrewJob | null = null;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setState({ id, job: null, error: null });

    const stop = () => {
      stopped = true;
      source?.close();
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const show = (job: CrewJob) => {
      last = job;
      setState((s) => ({ ...s, id, job }));
      if (isTerminal(job)) stop();
    };
    const fail = (message: string) => {
      stop();
      setState((s) => ({ ...s, id, error: message }));
    };
    const poll = async () => {
      timer = null;
      if (stopped) return;
      if (Date.now() - startedAt >= maxMs) {
        fail(STILL_WORKING);
        return;
      }
      try {
        const job = parseJob(await api<unknown>(`/jobs/${encodeURIComponent(id)}`));
        if (stopped) return;
        if (!job) {
          fail(STREAM_LOST);
          return;
        }
        failures = 0;
        show(job);
      } catch (e) {
        if (stopped) return;
        failures += 1;
        if (!retryable(e) || failures >= MAX_POLL_FAILURES) {
          fail(STREAM_LOST);
          return;
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), pollMs);
    };
    const startPolling = () => {
      if (polling || stopped) return;
      polling = true;
      source?.close();
      timer = setTimeout(() => void poll(), 0);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
      return stop;
    }
    source = new EventSource(`/api/v1/jobs/${encodeURIComponent(id)}/events`, { withCredentials: true });
    source.addEventListener("job", (event: Event) => {
      const next = parseEvent(String((event as MessageEvent<string>).data));
      if (next && !stopped) show(next);
    });
    source.addEventListener("end", () => {
      if (isTerminal(last)) stop();
      else startPolling();
    });
    source.addEventListener("error", () => {
      if (stopped) return;
      // CLOSED means the browser gave up (the stream answered 401/404/5xx), so polling would fail too.
      if (source?.readyState === EVENT_SOURCE_CLOSED) fail(STREAM_LOST);
      else startPolling();
    });
    return stop;
  }, [jobId, pollMs, maxMs]);

  if (!jobId || state.id !== jobId) return { job: null, error: null };
  return { job: state.job, error: state.error };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/lib && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 29 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sse.ts apps/web/src/lib/sse.test.tsx
git commit -m "feat(web): useJobStream follows crew job events over SSE and falls back to polling"
```

### P4: Root layout, globals, and the 404 page (SE-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/shell/rootAssets.test.ts` (scans every file this plan owns for third-party scripts, fonts, and remote assets):

```ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "../../app/layout";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const OWNED_DIRS = [
  "app/(app)",
  "components/shell",
  "components/week",
  "components/crew",
  "components/onboarding",
  "components/settings",
  "components/memory",
  "components/family",
  "lib",
];
const OWNED_FILES = ["app/layout.tsx", "app/globals.css", "app/not-found.tsx"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [
  ...OWNED_FILES.map((f) => join(SRC, f)),
  ...OWNED_DIRS.flatMap((d) => walk(join(SRC, d))).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")),
];

describe("root layout", () => {
  it("renders an English document titled ScholarCrew with no scripts", async () => {
    expect(metadata.title).toBe("ScholarCrew");
    const html = renderToStaticMarkup(await RootLayout({ children: createElement("p", null, "hello") }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<p>hello</p>");
    expect(html).not.toMatch(/<script|<link/i);
  });
});

describe("SE-05 asset rules", () => {
  it("finds the owned files", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("loads no third-party scripts, fonts, analytics, or remote assets", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/script|next\/font|<script|@import|@font-face|url\(/);
      expect(text, file).not.toMatch(/gtag|googletagmanager|analytics|segment\.io|posthog|mixpanel|hotjar/i);
    }
  });

  it("keeps remote URLs out of layouts and styles", () => {
    for (const file of files.filter((f) => f.endsWith(".css") || f.endsWith("layout.tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/rootAssets`
Expected: FAIL with `Failed to resolve import "../../app/layout"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/layout.tsx`:

```tsx
import "@scholarcrew/ui/tokens.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ScholarCrew",
  description: "A crew of AI specialists that plans scholarships, essays, applications, and the cost of college.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// SE-05: system fonts from tokens.css; no third-party scripts, fonts, or trackers.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce");
  return (
    <html lang="en" data-nonce={nonce ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/globals.css`:

```css
/* App-wide rules on top of @scholarcrew/ui/tokens.css. No fonts, imports, or remote assets (SE-05). */
html {
  -webkit-text-size-adjust: 100%;
}

body {
  min-height: 100vh;
}

button:not(:disabled) {
  cursor: pointer;
}

/* The phone layout (mockup 19) lives in AppShell: ShellFrame passes its tab bar as `mobileNav`, and
   AppShell hides the sidebar under 640px. Nothing here selects AppShell's inner DOM (E-15-4). */

.sc-notfound {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}

.sc-notfound > div {
  width: 100%;
  max-width: 440px;
}
```

`apps/web/src/app/not-found.tsx`:

```tsx
import { Button, EmptyState } from "@scholarcrew/ui";

export default function NotFound() {
  return (
    <main className="sc-notfound">
      <div>
        <EmptyState
          title="We couldn't find that page"
          icon="search"
          action={
            <Button variant="primary" href="/week">
              Go to This week
            </Button>
          }
        >
          It may have moved, or it isn't shared with you.
        </EmptyState>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/rootAssets && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 4 tests; `tsc --noEmit` prints nothing. (The scan re-runs over every later task's files; keep it green.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css apps/web/src/app/not-found.tsx apps/web/src/components/shell/rootAssets.test.ts
git commit -m "feat(web): root layout, globals, and 404 page with no third-party assets"
```

### P5: Shell model: nav, roster, user card, onboarding guard

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/shell/nav.test.ts`:

```ts
import type { MeResponse, MemoryFact } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import {
  activeKeyFor,
  enabledOptionalCrew,
  mobileTabsFor,
  navFor,
  onboardingRedirect,
  rosterFor,
  sharedCategoriesOf,
  userCard,
} from "./nav";

const me = (o: { role?: "student" | "parent"; name?: string; classYear?: number | null; family?: boolean } = {}): MeResponse => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "maya.r@example.test",
    displayName: o.name ?? "Maya R.",
    role: o.role ?? "student",
    birthYear: 2009,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile:
    o.role === "parent"
      ? null
      : {
          userId: "11111111-1111-4111-8111-111111111111",
          classYear: o.classYear === undefined ? 2027 : o.classYear,
          highSchool: "Maple High School",
          state: "TX",
          county: "Maple",
          city: "",
          gpaUnweighted: 3.72,
          gpaWeighted: null,
          intendedMajors: [],
          interests: [],
          onboardingCompletedAt: "2026-10-01T15:00:00.000Z",
          updatedAt: "2026-10-01T15:00:00.000Z",
        },
  onboardingComplete: true,
  family: o.family ? { id: "22222222-2222-4222-8222-222222222222", role: o.role ?? "student" } : null,
  plan: "free",
});

const fact = (key: string, value: MemoryFact["value"], status: MemoryFact["status"] = "confirmed"): MemoryFact => ({
  id: "33333333-3333-4333-8333-333333333333",
  key,
  value,
  valueText: String(value),
  source: "user_stated",
  sourceRef: null,
  visibility: "crew",
  status,
  createdAt: "2026-10-01T15:00:00.000Z",
  confirmedAt: null,
  expiresAt: null,
});

describe("navFor", () => {
  it("gives students the eight mockup items in order", () => {
    expect(navFor("student").map((i) => i.label)).toEqual([
      "This week",
      "Crew",
      "Scholarships",
      "Essays",
      "Colleges",
      "Money",
      "Family",
      "Memory",
    ]);
    expect(navFor("student")[0]).toEqual({ key: "week", label: "This week", href: "/week", icon: "calendar" });
  });

  it("adds switched-on teammates after Colleges", () => {
    expect(navFor("student", ["prep", "impact"]).map((i) => i.key)).toEqual([
      "week",
      "crew",
      "scholarships",
      "essays",
      "colleges",
      "prep",
      "impact",
      "money",
      "family",
      "memory",
    ]);
  });

  it("gives parents the reduced nav with the family room as Crew chats", () => {
    expect(navFor("parent", ["prep"]).map((i) => i.key)).toEqual(["week", "crew", "colleges", "money", "family"]);
    expect(navFor("parent").find((i) => i.key === "crew")).toEqual({ key: "crew", label: "Crew chats", href: "/crew", icon: "chat" });
  });

  it("adds the screens a student shares to the parent nav (E-16-2)", () => {
    const shared = sharedCategoriesOf({
      studentId: "11111111-1111-4111-8111-111111111111",
      familyId: "22222222-2222-4222-8222-222222222222",
      categories: {
        deadlines: true,
        colleges: true,
        costs: true,
        scholarships: true,
        activities: true,
        essays: false,
        chats: false,
        stories: true,
        sensitive: false,
      },
    });
    expect(shared).toEqual(["deadlines", "colleges", "costs", "scholarships", "activities", "stories"]);
    expect(sharedCategoriesOf(null)).toEqual([]);
    const nav = navFor("parent", [], shared);
    expect(nav.map((i) => [i.key, i.label, i.href])).toEqual([
      ["week", "This week", "/week"],
      ["crew", "Crew chats", "/crew"],
      ["scholarships", "Scholarships", "/scholarships"],
      ["essays", "Story Bank", "/essays/stories"],
      ["colleges", "Colleges", "/colleges"],
      ["impact", "Service", "/impact"],
      ["money", "Money", "/money"],
      ["family", "Family", "/family"],
    ]);
    expect(navFor("parent", [], ["essays", "stories"]).find((i) => i.key === "essays")).toMatchObject({ label: "Essays", href: "/essays" });
    expect(navFor("student", [], ["chats"]).map((i) => i.key)).toEqual(navFor("student").map((i) => i.key));
  });
});

describe("activeKeyFor", () => {
  it("uses the first path segment", () => {
    expect(activeKeyFor("/week")).toBe("week");
    expect(activeKeyFor("/crew/abc")).toBe("crew");
    expect(activeKeyFor("/essays/stories")).toBe("essays");
    expect(activeKeyFor("/settings")).toBe("settings");
    expect(activeKeyFor("/")).toBe("");
    expect(activeKeyFor("/weekly")).toBe("");
  });
});

describe("mobileTabsFor", () => {
  it("puts four tabs up front and the rest under More", () => {
    const student = mobileTabsFor("student", []);
    expect(student.tabs.map((t) => t.key)).toEqual(["week", "crew", "scholarships", "essays"]);
    expect(student.more.map((t) => t.key)).toEqual(["colleges", "money", "family", "memory", "settings"]);
    const parent = mobileTabsFor("parent", []);
    expect(parent.tabs.map((t) => t.key)).toEqual(["week", "crew", "colleges", "money"]);
    expect(parent.more.map((t) => t.key)).toEqual(["family", "settings"]);
    const sharing = mobileTabsFor("parent", [], ["scholarships", "activities"]);
    expect(sharing.tabs.map((t) => t.key)).toEqual(["week", "crew", "scholarships", "colleges"]);
    expect(sharing.more.map((t) => t.key)).toEqual(["impact", "money", "family", "settings"]);
  });
});

describe("crew roster", () => {
  it("shows Prep and Impact as add until switched on", () => {
    const roster = rosterFor([]);
    expect(roster.map((r) => r.role)).toEqual(["compass", "scout", "atlas", "quill", "aid", "ledger", "prep", "impact"]);
    expect(roster.filter((r) => !r.enabled).map((r) => [r.role, r.addHref])).toEqual([
      ["prep", "/crew#add-teammate"],
      ["impact", "/crew#add-teammate"],
    ]);
    expect(rosterFor(["impact"]).find((r) => r.role === "impact")?.enabled).toBe(true);
    expect(rosterFor([], "parent").filter((r) => !r.enabled).map((r) => r.addHref)).toEqual([undefined, undefined]);
  });

  it("reads switches from confirmed true facts only", () => {
    expect(
      enabledOptionalCrew([
        fact("crew_prep_enabled", true),
        fact("crew_impact_enabled", false),
        fact("crew_impact_enabled", true, "candidate"),
        fact("county", "Maple"),
      ]),
    ).toEqual(["prep"]);
  });
});

describe("userCard", () => {
  it("matches the sidebar card", () => {
    expect(userCard(me())).toEqual({ name: "Maya R.", subtitle: "Class of 2027 · Private" });
    expect(userCard(me({ classYear: null }))).toEqual({ name: "Maya R.", subtitle: "Student · Private" });
    expect(userCard(me({ role: "parent", name: "", family: true }))).toEqual({ name: "maya.r", subtitle: "Parent · Family" });
  });
});

describe("onboardingRedirect", () => {
  it("sends unfinished students to onboarding from anywhere else", () => {
    const unfinished = { role: "student" as const, onboardingComplete: false };
    expect(onboardingRedirect(unfinished, "/week")).toBe("/onboarding");
    expect(onboardingRedirect(unfinished, "/crew/abc")).toBe("/onboarding");
    expect(onboardingRedirect(unfinished, "/onboarding")).toBeNull();
    expect(onboardingRedirect(unfinished, "/onboarding/step")).toBeNull();
    expect(onboardingRedirect(unfinished, "/onboardingx")).toBe("/onboarding");
  });

  it("leaves finished students and parents alone", () => {
    expect(onboardingRedirect({ role: "student", onboardingComplete: true }, "/week")).toBeNull();
    expect(onboardingRedirect({ role: "parent", onboardingComplete: false }, "/week")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/nav`
Expected: FAIL with `Failed to resolve import "./nav" from "src/components/shell/nav.test.ts"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/shell/nav.ts`:

```ts
import {
  CREW_ROLES,
  type MeResponse,
  type MemoryFact,
  type Role,
  SHARE_CATEGORIES,
  type ShareCategory,
  type ShareSettings,
} from "@scholarcrew/domain";
import type { CrewRosterItem, NavItem } from "@scholarcrew/ui";

export type OptionalCrew = "prep" | "impact";
export const OPTIONAL_CREW: OptionalCrew[] = ["prep", "impact"];
/** Confirmed fact (value true, visibility crew) that switches an optional teammate on (D29, D43). */
export const OPTIONAL_CREW_FACT: Record<OptionalCrew, string> = {
  prep: "crew_prep_enabled",
  impact: "crew_impact_enabled",
};
/** Where the sidebar "add" links go: the AddTeammate chips in the Crew side panel. */
export const ADD_TEAMMATE_HREF = "/crew#add-teammate";

type NavKey =
  | "week"
  | "crew"
  | "scholarships"
  | "essays"
  | "colleges"
  | "prep"
  | "impact"
  | "money"
  | "family"
  | "memory"
  | "settings";

const NAV_ITEMS: Record<NavKey, NavItem> = {
  week: { key: "week", label: "This week", href: "/week", icon: "calendar" },
  crew: { key: "crew", label: "Crew", href: "/crew", icon: "chat" },
  scholarships: { key: "scholarships", label: "Scholarships", href: "/scholarships", icon: "award" },
  essays: { key: "essays", label: "Essays", href: "/essays", icon: "pen" },
  colleges: { key: "colleges", label: "Colleges", href: "/colleges", icon: "columns" },
  prep: { key: "prep", label: "Test prep", href: "/prep", icon: "clock" },
  impact: { key: "impact", label: "Service", href: "/impact", icon: "spark" },
  money: { key: "money", label: "Money", href: "/money", icon: "dollar" },
  family: { key: "family", label: "Family", href: "/family", icon: "users" },
  memory: { key: "memory", label: "Memory", href: "/memory", icon: "bookmark" },
  settings: { key: "settings", label: "Settings", href: "/settings", icon: "info" },
};

const STUDENT_KEYS: NavKey[] = ["week", "crew", "scholarships", "essays", "colleges", "money", "family", "memory"];
const ALL_KEYS = Object.keys(NAV_ITEMS) as NavKey[];

/** Parents: This week, Crew chats (the family room), shared screens from plan 17, Colleges, Money, Family. */
function parentKeys(shared: ShareCategory[]): NavKey[] {
  const on = (c: ShareCategory) => shared.includes(c);
  const keys: NavKey[] = ["week", "crew"];
  if (on("scholarships")) keys.push("scholarships");
  if (on("essays") || on("stories")) keys.push("essays");
  keys.push("colleges");
  if (on("activities")) keys.push("impact");
  keys.push("money", "family");
  return keys;
}

function navKeysFor(role: Role, enabled: OptionalCrew[], shared: ShareCategory[]): NavKey[] {
  if (role === "parent") return parentKeys(shared);
  const extra = OPTIONAL_CREW.filter((r) => enabled.includes(r));
  const at = STUDENT_KEYS.indexOf("colleges") + 1;
  return [...STUDENT_KEYS.slice(0, at), ...extra, ...STUDENT_KEYS.slice(at)];
}

function itemFor(role: Role, key: NavKey, shared: ShareCategory[]): NavItem {
  if (role !== "parent") return NAV_ITEMS[key];
  if (key === "crew") return { ...NAV_ITEMS.crew, label: "Crew chats" };
  if (key === "essays" && !shared.includes("essays")) {
    return { ...NAV_ITEMS.essays, label: "Story Bank", href: "/essays/stories" };
  }
  return NAV_ITEMS[key];
}

/** Sidebar items. `shared` (parents only) is the student's shared categories from sharedCategoriesOf. */
export function navFor(role: Role, enabled: OptionalCrew[] = [], shared: ShareCategory[] = []): NavItem[] {
  return navKeysFor(role, enabled, shared).map((k) => itemFor(role, k, shared));
}

/** The categories switched on in a student's share settings, in SHARE_CATEGORIES order. */
export function sharedCategoriesOf(settings: Pick<ShareSettings, "categories"> | null): ShareCategory[] {
  if (!settings) return [];
  return SHARE_CATEGORIES.filter((c) => settings.categories[c] === true);
}

/** "/crew/abc" → "crew"; unknown first segments → "". */
export function activeKeyFor(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return (ALL_KEYS as string[]).includes(seg) ? seg : "";
}

/** Mockup 19: four tabs plus "More". */
export function mobileTabsFor(
  role: Role,
  enabled: OptionalCrew[],
  shared: ShareCategory[] = [],
): { tabs: NavItem[]; more: NavItem[] } {
  const keys = navKeysFor(role, enabled, shared);
  const tabs = keys.slice(0, 4);
  const more: NavKey[] = [...keys.slice(4), "settings"];
  return { tabs: tabs.map((k) => itemFor(role, k, shared)), more: more.map((k) => itemFor(role, k, shared)) };
}

export function enabledOptionalCrew(facts: Array<Pick<MemoryFact, "key" | "value" | "status">>): OptionalCrew[] {
  return OPTIONAL_CREW.filter((role) =>
    facts.some((f) => f.key === OPTIONAL_CREW_FACT[role] && f.status === "confirmed" && f.value === true),
  );
}

/** Fixed crew order; students' "add" links open the AddTeammate chips. Parents can't add teammates. */
export function rosterFor(enabled: OptionalCrew[], role: Role = "student"): CrewRosterItem[] {
  return CREW_ROLES.map((r) => {
    if (r === "prep" || r === "impact") {
      return { role: r, enabled: enabled.includes(r), addHref: role === "student" ? ADD_TEAMMATE_HREF : undefined };
    }
    return { role: r, enabled: true };
  });
}

export function displayNameOf(me: Pick<MeResponse, "user">): string {
  return me.user.displayName.trim() || me.user.email.split("@")[0] || "You";
}

export function userCard(me: MeResponse): { name: string; subtitle: string } {
  const name = displayNameOf(me);
  if (me.user.role === "parent") return { name, subtitle: me.family ? "Parent · Family" : "Parent" };
  if (me.user.role === "admin") return { name, subtitle: "Admin" };
  const year = me.profile?.classYear;
  return { name, subtitle: `${year ? `Class of ${year}` : "Student"} · Private` };
}

/** Students who haven't finished onboarding go to /onboarding from every other (app) page. */
export function onboardingRedirect(me: { role: Role; onboardingComplete: boolean }, pathname: string): string | null {
  if (me.role !== "student" || me.onboardingComplete) return null;
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return null;
  return "/onboarding";
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/nav && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/nav.ts apps/web/src/components/shell/nav.test.ts
git commit -m "feat(web): shell nav, crew roster, user card, and onboarding guard"
```

### P6: Notification bell and shell styles (NO-01, E-16-5)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/shell/NotificationBell.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Notification } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const note = (o: Partial<Notification>): Notification => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "new_matches",
  title: "3 new matches",
  body: "Scout found 3 scholarships worth $7,500",
  link: "/scholarships",
  createdAt: "2026-10-04T19:00:00.000Z",
  readAt: null,
  ...o,
});

const list = [
  note({}),
  note({ id: "22222222-2222-4222-8222-222222222222", kind: "digest", title: "Weekly digest", link: "", readAt: "2026-10-05T12:00:00.000Z" }),
];

function stubApi() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(list), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotificationBell", () => {
  it("shows the unread count and lists notifications", async () => {
    stubApi();
    render(<NotificationBell timeZone="America/Chicago" />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    expect(screen.getByRole("region", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("Scout found 3 scholarships worth $7,500")).toBeTruthy();
    expect(screen.getByText("Weekly digest")).toBeTruthy();
    expect(screen.getByText("Oct 4")).toBeTruthy();
  });

  it("marks a notification read and follows its internal link", async () => {
    const fetchMock = stubApi();
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: /3 new matches/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/scholarships"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/v1/notifications/11111111-1111-4111-8111-111111111111/read");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("doesn't re-mark read items or navigate without a link", async () => {
    const fetchMock = stubApi();
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: /Weekly digest/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(router.push).not.toHaveBeenCalledWith("");
  });

  it("moves focus into the panel and closes on Escape back to the bell", async () => {
    stubApi();
    render(<NotificationBell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(bell.getAttribute("aria-controls")).toBe(panel.id);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark all read" }));
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it("closes when you click outside it", async () => {
    stubApi();
    render(
      <>
        <NotificationBell />
        <p>page</p>
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.mouseDown(screen.getByRole("region", { name: "Notifications" }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("page"));
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/NotificationBell`
Expected: FAIL with `Failed to resolve import "./NotificationBell"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/shell/NotificationBell.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { instantShort } from "@/lib/format";
import type { Notification } from "@scholarcrew/domain";
import { Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./shell.module.css";

function isInternal(link: string): boolean {
  return /^\/(?!\/)/.test(link);
}

/**
 * NO-01: the top-bar bell. Lists /api/v1/notifications, marks items read, follows internal links. Opening moves
 * focus into the panel; Escape closes it and refocuses the bell; a click outside closes it.
 */
export function NotificationBell({ timeZone = "America/Chicago" }: { timeZone?: string }) {
  const router = useRouter();
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<Notification[]>("/notifications"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("button") ?? panel)?.focus();
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => n.readAt === null);

  async function markRead(n: Notification) {
    if (n.readAt !== null) return;
    const at = new Date().toISOString();
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: at } : x)));
    try {
      await api(`/notifications/${n.id}/read`, { method: "POST" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function openItem(n: Notification) {
    await markRead(n);
    if (isInternal(n.link)) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function markAll() {
    for (const n of unread) await markRead(n);
  }

  return (
    <div ref={wrapRef} className={styles.bellWrap}>
      <button
        ref={bellRef}
        type="button"
        className={styles.bell}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}
        onClick={() => {
          if (!open) void load();
          setOpen(!open);
        }}
      >
        <Icon name="bell" />
        {unread.length > 0 ? <span className={styles.pip} /> : null}
      </button>
      {open ? (
        <section
          ref={panelRef}
          id={panelId}
          tabIndex={-1}
          className={styles.panel}
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setOpen(false);
            bellRef.current?.focus();
          }}
        >
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Notifications</h2>
            {unread.length > 0 ? (
              <button type="button" className={styles.linkBtn} onClick={() => void markAll()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {error ? <p className={styles.panelError}>{error}</p> : null}
          {items.length === 0 ? (
            <p className={styles.panelEmpty}>Nothing new. Your crew sends one weekly digest, not a stream of pings.</p>
          ) : (
            <ul className={styles.panelList}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cx(styles.note, n.readAt === null && styles.unread)}
                    onClick={() => void openItem(n)}
                  >
                    <span className={styles.noteTitle}>
                      {n.readAt === null ? <span className={styles.srOnly}>Unread: </span> : null}
                      {n.title}
                    </span>
                    <span className={styles.noteBody}>{n.body}</span>
                    <span className={styles.noteTime}>{instantShort(n.createdAt, timeZone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
```

`apps/web/src/components/shell/shell.module.css` (bell, setup frame, onboarding gate, phone tab bar):

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---------- bell ---------- */
.bellWrap {
  position: relative;
}

.bell {
  position: relative;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  color: var(--ink-2);
}

.bell svg {
  width: 18px;
  height: 18px;
}

.pip {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 0 0 2px var(--card);
}

.panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  width: 340px;
  max-height: 420px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--card);
  box-shadow: 0 8px 24px rgba(20, 32, 47, 0.12);
}

.panelHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panelTitle {
  font-size: 15px;
}

.linkBtn {
  border: 0;
  background: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--navy);
}

.panelError {
  margin-bottom: 8px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.panelEmpty {
  font-size: 13px;
  color: var(--muted);
}

.panelList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: none;
  text-align: left;
}

.note:hover {
  background: var(--wash);
}

.unread {
  background: var(--navy-soft);
}

.noteTitle {
  font-size: 13px;
  font-weight: 650;
}

.noteBody {
  font-size: 12.5px;
  color: var(--ink-2);
}

.noteTime {
  font-size: 11.5px;
  color: var(--muted);
}

/* ---------- setup frame (mockup 09, data-shell="setup") ---------- */
.setupFrame {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100vh;
}

.setupSide {
  display: flex;
  flex-direction: column;
  padding: 22px 14px 18px;
  border-right: 1px solid var(--line);
  background: var(--rail);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 20px;
}

.mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--navy);
}

.mark svg {
  fill: #fff;
  stroke: none;
}

.word {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--navy);
}

.setupNote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--wash);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.setupNote svg {
  width: 14px;
  height: 14px;
  color: var(--muted);
}

.dim {
  opacity: 0.38;
}

.dimItem {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 38px;
  padding: 0 10px;
  font-weight: 500;
  color: var(--ink-2);
}

.dimItem svg {
  width: 18px;
  height: 18px;
  color: var(--muted);
}

.railSec {
  margin-top: 24px;
  padding: 0 10px;
}

.railTitle {
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.roster {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}

.roster li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 550;
  color: var(--ink-2);
}

.me {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 14px 10px 0;
  border-top: 1px solid var(--line);
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--navy);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.meName {
  font-size: 13px;
  font-weight: 650;
}

.meSub {
  font-size: 12px;
  color: var(--muted);
}

.setupMain {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.setupTop {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 32px;
  border-bottom: 1px solid var(--line);
  font-size: 13.5px;
  color: var(--ink-2);
}

.setupTop b {
  color: var(--ink);
}

.spacer {
  flex: 1;
}

.setupContent {
  flex: 1;
  padding: 20px 32px 32px;
}

.gate {
  padding: 40px 0;
  color: var(--muted);
}

@media (max-width: 900px) {
  .setupFrame {
    grid-template-columns: minmax(0, 1fr);
  }

  .setupSide {
    display: none;
  }

  .setupTop {
    padding: 0 16px;
  }

  .setupContent {
    padding: 16px;
  }
}

/* ---------- phone tab bar (mockup 19) ---------- */
.tabs {
  display: none;
}

.tab,
.moreToggle {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--muted);
}

.tab svg,
.moreToggle svg {
  width: 23px;
  height: 23px;
}

.tabOn {
  color: var(--navy);
}

.more {
  position: relative;
}

.moreToggle {
  list-style: none;
  cursor: pointer;
}

.moreToggle::-webkit-details-marker {
  display: none;
}

.moreMenu {
  position: absolute;
  right: 4px;
  bottom: calc(100% + 10px);
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  box-shadow: 0 8px 24px rgba(20, 32, 47, 0.12);
}

.moreMenu a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--ink-2);
}

.moreMenu a[aria-current="page"] {
  background: var(--navy-soft);
  color: var(--navy);
}

@media (max-width: 640px) {
  .tabs {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: 72px;
    padding: 8px 4px 0;
    border-top: 1px solid var(--line);
    background: rgba(250, 248, 244, 0.97);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/shell && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 20 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/NotificationBell.tsx apps/web/src/components/shell/NotificationBell.test.tsx apps/web/src/components/shell/shell.module.css
git commit -m "feat(web): notification bell with unread state and shell styles"
```

### P7: Shell frames, page actor helper, the (app) layout, error and loading boundaries (ID-04, ON-06 redirect, D30, E-16-2, E-16-4)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/shell/frames.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./OnboardingGate";
import { SetupFrame } from "./SetupFrame";
import { ShellFrame } from "./ShellFrame";
import { mobileTabsFor, navFor, rosterFor } from "./nav";

const nav = vi.hoisted(() => ({ pathname: "/crew/abc", router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => nav.router, usePathname: () => nav.pathname }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShellFrame", () => {
  it("marks the active page in the sidebar and the phone tab bar", () => {
    nav.pathname = "/crew/abc";
    const { tabs, more } = mobileTabsFor("student", []);
    const { container } = render(
      <ShellFrame
        nav={navFor("student")}
        crew={rosterFor([])}
        user={{ name: "Maya R.", subtitle: "Class of 2027 · Private" }}
        topbar={<header>top</header>}
        tabs={tabs}
        more={more}
      >
        <p>page body</p>
      </ShellFrame>,
    );
    const crewLinks = screen.getAllByRole("link", { name: "Crew" });
    expect(crewLinks).toHaveLength(2);
    for (const link of crewLinks) expect(link.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("page body")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(container.querySelector('details a[href="/settings"]')?.textContent).toBe("Settings");
  });
});

describe("OnboardingGate", () => {
  it("redirects unfinished students and hides the page", () => {
    nav.pathname = "/week";
    render(
      <OnboardingGate role="student" onboardingComplete={false}>
        <p>week page</p>
      </OnboardingGate>,
    );
    expect(nav.router.replace).toHaveBeenCalledWith("/onboarding");
    expect(screen.queryByText("week page")).toBeNull();
    expect(screen.getByText("Taking you to setup…")).toBeTruthy();
  });

  it("renders onboarding itself", () => {
    nav.pathname = "/onboarding";
    render(
      <OnboardingGate role="student" onboardingComplete={false}>
        <p>steps</p>
      </OnboardingGate>,
    );
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(screen.getByText("steps")).toBeTruthy();
  });
});

describe("SetupFrame", () => {
  it("dims the nav and offers Finish later", () => {
    render(
      <SetupFrame user={{ name: "Maya R.", subtitle: "Student · Private" }}>
        <p>wizard</p>
      </SetupFrame>,
    );
    expect(screen.getByText("Opens after setup")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Crew" })).toBeNull();
    expect(screen.getByText("Crew")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Finish later" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("wizard")).toBeTruthy();
  });
});
```

`apps/web/src/components/shell/AppLayout.test.tsx`:

```tsx
// @vitest-environment jsdom
import AppLayout from "@/app/(app)/layout";
import type { FamilyView, MeResponse, ShareSettings } from "@scholarcrew/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pathname: "/week" as string | null,
  requirePageActor: vi.fn(),
  loadMe: vi.fn(),
  listFacts: vi.fn(),
  getFamily: vi.fn(),
  getShareSettings: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/server/session", () => ({ requirePageActor: m.requirePageActor }));
vi.mock("@/server/deps", () => ({ getDeps: () => ({}) }));
vi.mock("@/lib/pageActor", () => ({ loadMe: m.loadMe }));
vi.mock("@scholarcrew/core/memory", () => ({ listFacts: m.listFacts }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily, getShareSettings: m.getShareSettings }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(m.pathname === null ? {} : { "x-pathname": m.pathname }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => m.router,
  usePathname: () => m.pathname ?? "/week",
}));

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const me = (role: "student" | "parent", onboardingComplete: boolean): MeResponse => ({
  user: {
    id: role === "student" ? STUDENT : PARENT,
    email: `${role}@example.test`,
    displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
    role,
    birthYear: null,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: null,
  onboardingComplete,
  family: role === "parent" ? { id: FAMILY, role } : null,
  plan: "free",
});

const family: FamilyView = {
  id: FAMILY,
  name: "Family",
  myRole: "parent",
  members: [
    { userId: STUDENT, displayName: "Maya Rivera", email: "student@example.test", memberRole: "student", joinedAt: "2026-10-01T15:00:00.000Z" },
    { userId: PARENT, displayName: "Dana Rivera", email: "parent@example.test", memberRole: "parent", joinedAt: "2026-10-02T15:00:00.000Z" },
  ],
  pendingInvites: [],
};

const settings: ShareSettings = {
  studentId: STUDENT,
  familyId: FAMILY,
  categories: { deadlines: true, colleges: true, costs: true, scholarships: true, activities: true, essays: false, chats: false, stories: true, sensitive: false },
};

function as(role: "student" | "parent", onboardingComplete = true) {
  const actor = { kind: "user", userId: role === "student" ? STUDENT : PARENT, role };
  m.requirePageActor.mockResolvedValue(actor);
  m.loadMe.mockResolvedValue(me(role, onboardingComplete));
  m.listFacts.mockResolvedValue([]);
  m.getFamily.mockResolvedValue(family);
  m.getShareSettings.mockResolvedValue(settings);
  return actor;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  m.pathname = "/week";
});

describe("(app) layout", () => {
  it("redirects unfinished students on the server from x-pathname and keeps the client gate as a fallback (D30)", async () => {
    as("student", false);
    m.pathname = "/week";
    await expect(AppLayout({ children: <p>week page</p> })).rejects.toThrow("NEXT_REDIRECT /onboarding");

    m.pathname = "/onboarding";
    const { unmount } = render(await AppLayout({ children: <p>steps</p> }));
    expect(screen.getByText("Opens after setup")).toBeTruthy();
    expect(screen.getByText("steps")).toBeTruthy();
    unmount();

    m.pathname = null;
    render(await AppLayout({ children: <p>week page</p> }));
    expect(screen.getByText("Taking you to setup…")).toBeTruthy();
    expect(m.router.replace).toHaveBeenCalledWith("/onboarding");
  });

  it("gives parents the screens their student shares and no add links (E-16-2, E-16-7)", async () => {
    const actor = as("parent");
    render(await AppLayout({ children: <p>week page</p> }));
    expect(m.getShareSettings).toHaveBeenCalledWith({}, actor, STUDENT);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/week",
      "/crew",
      "/scholarships",
      "/essays/stories",
      "/colleges",
      "/impact",
      "/money",
      "/family",
    ]);
    expect(within(nav).getByRole("link", { name: "Crew chats" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Story Bank" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "add Prep" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ask your crew" }).getAttribute("href")).toBe("/crew");
    expect(m.listFacts).not.toHaveBeenCalled();
  });
});
```

`apps/web/src/components/shell/boundaries.test.tsx`:

```tsx
// @vitest-environment jsdom
import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("(app) boundaries (E-16-4)", () => {
  it("shows a plain error with Try again and never the error's message", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("connect ECONNREFUSED 10.0.0.5:5432")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong on our side" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("marks the loading state busy", () => {
    render(<AppLoading />);
    expect(screen.getByText("Loading…").closest('[aria-busy="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/shell/frames src/components/shell/AppLayout src/components/shell/boundaries`
Expected: FAIL, 3 files, with `Failed to resolve import "./OnboardingGate"`, `Failed to resolve import "@/app/(app)/layout"`, and `Failed to resolve import "@/app/(app)/error"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/shell/ShellFrame.tsx` (client only because it reads the pathname; `AppShell` itself is server-safe):

```tsx
"use client";

import { cx } from "@/lib/cx";
import { AppShell, type CrewRosterItem, Icon, type NavItem } from "@scholarcrew/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { activeKeyFor } from "./nav";
import styles from "./shell.module.css";

export interface ShellFrameProps {
  nav: NavItem[];
  crew: CrewRosterItem[];
  user: { name: string; subtitle: string };
  topbar: ReactNode;
  tabs: NavItem[];
  more: NavItem[];
  children: ReactNode;
}

export function ShellFrame({ nav, crew, user, topbar, tabs, more, children }: ShellFrameProps) {
  const active = activeKeyFor(usePathname() ?? "/");
  const phoneNav = (
    <nav className={styles.tabs} aria-label="Main on phones">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={cx(styles.tab, t.key === active && styles.tabOn)}
          aria-current={t.key === active ? "page" : undefined}
        >
          <Icon name={t.icon} />
          {t.label}
        </a>
      ))}
      <details className={styles.more}>
        <summary className={cx(styles.moreToggle, more.some((m) => m.key === active) && styles.tabOn)}>
          <Icon name="chev" />
          More
        </summary>
        <div className={styles.moreMenu}>
          {more.map((m) => (
            <a key={m.key} href={m.href} aria-current={m.key === active ? "page" : undefined}>
              <Icon name={m.icon} />
              {m.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
  return (
    <AppShell
      nav={nav}
      activeKey={active}
      crew={crew}
      user={user}
      topbar={topbar}
      className="sc-shell"
      mobileNav={phoneNav}
    >
      {children}
    </AppShell>
  );
}
```

`apps/web/src/components/shell/SetupFrame.tsx`:

```tsx
import { cx } from "@/lib/cx";
import { CREW_NAMES, CREW_ROLES } from "@scholarcrew/domain";
import { Button, CrewDot, Icon } from "@scholarcrew/ui";
import type { ReactNode } from "react";
import { navFor } from "./nav";
import styles from "./shell.module.css";

/** Mockup 09 frame: the nav is dimmed and not clickable until setup is done. */
export function SetupFrame({ user, children }: { user: { name: string; subtitle: string }; children: ReactNode }) {
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <div className={styles.setupFrame}>
      <aside className={styles.setupSide}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <Icon name="spark" />
          </span>
          <span className={styles.word}>scholarcrew</span>
        </div>
        <div className={styles.setupNote}>
          <Icon name="lock" />
          <span>Opens after setup</span>
        </div>
        <ul className={styles.dim} aria-label="Pages that open after setup">
          {navFor("student").map((item) => (
            <li key={item.key} className={styles.dimItem}>
              <Icon name={item.icon} />
              {item.label}
            </li>
          ))}
        </ul>
        <div className={cx(styles.railSec, styles.dim)}>
          <h2 className={styles.railTitle}>Your crew</h2>
          <ul className={styles.roster}>
            {CREW_ROLES.map((role) => (
              <li key={role}>
                <CrewDot role={role} hollow={role === "prep" || role === "impact"} />
                {CREW_NAMES[role]}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div>
            <div className={styles.meName}>{user.name}</div>
            <div className={styles.meSub}>{user.subtitle}</div>
          </div>
        </div>
      </aside>
      <div className={styles.setupMain}>
        <header className={styles.setupTop}>
          <b>Setting up your crew</b>
          <span>· about 4 minutes · saved on this device as you go</span>
          <span className={styles.spacer} />
          <Button variant="line" href="/">
            Finish later
          </Button>
        </header>
        <main id="main" className={styles.setupContent}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

`apps/web/src/components/shell/OnboardingGate.tsx`:

```tsx
"use client";

import type { Role } from "@scholarcrew/domain";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { onboardingRedirect } from "./nav";
import styles from "./shell.module.css";

/** Client fallback for the onboarding redirect when the layout has no x-pathname header (D30). */
export function OnboardingGate({
  role,
  onboardingComplete,
  children,
}: {
  role: Role;
  onboardingComplete: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const target = onboardingRedirect({ role, onboardingComplete }, pathname);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (target) return <p className={styles.gate}>Taking you to setup…</p>;
  return <>{children}</>;
}
```

`apps/web/src/lib/pageActor.ts` (server only: pages import it; client components never do):

```ts
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getMe } from "@scholarcrew/core/profile";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type MeResponse, type Role, type UserActor, userActor } from "@scholarcrew/domain";
import { redirect } from "next/navigation";
import { cache } from "react";

/** One getMe per request, shared by the (app) layout and the page. */
export const loadMe = cache(async (userId: string, role: Role): Promise<MeResponse> => getMe(getDeps(), userActor(userId, role)));

export interface AppPageContext {
  actor: UserActor;
  me: MeResponse;
  deps: CoreDeps;
}

/** requirePageActor + getMe; students who haven't finished onboarding go to /onboarding. */
export async function requireAppActor(roles?: Role[]): Promise<AppPageContext> {
  const actor = await requirePageActor(roles);
  const me = await loadMe(actor.userId, actor.role);
  if (!me.onboardingComplete) redirect("/onboarding");
  return { actor, me, deps: getDeps() };
}
```

`apps/web/src/app/(app)/layout.tsx`:

```tsx
import { NotificationBell } from "@/components/shell/NotificationBell";
import { OnboardingGate } from "@/components/shell/OnboardingGate";
import { SetupFrame } from "@/components/shell/SetupFrame";
import { ShellFrame } from "@/components/shell/ShellFrame";
import {
  enabledOptionalCrew,
  mobileTabsFor,
  navFor,
  onboardingRedirect,
  rosterFor,
  sharedCategoriesOf,
  userCard,
} from "@/components/shell/nav";
import { loadMe } from "@/lib/pageActor";
import { getDeps } from "@/server/deps";
import { requirePageActor } from "@/server/session";
import { getFamily, getShareSettings } from "@scholarcrew/core/family";
import { listFacts } from "@scholarcrew/core/memory";
import type { ShareCategory, UserActor } from "@scholarcrew/domain";
import { Button, Topbar } from "@scholarcrew/ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/** A parent's view of what their student shares; the nav only hides links, the pages still check (E-16-2). */
async function parentShares(actor: UserActor): Promise<ShareCategory[]> {
  const deps = getDeps();
  const family = await getFamily(deps, actor);
  const student = family?.members.find((member) => member.memberRole === "student");
  if (!student) return [];
  return sharedCategoriesOf(await getShareSettings(deps, actor, student.userId));
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor();
  if (actor.role === "admin") redirect("/admin");
  const me = await loadMe(actor.userId, actor.role);
  const card = userCard(me);

  if (!me.onboardingComplete) {
    // D30: plan 13's middleware forwards x-pathname; without it the client gate below redirects.
    const pathname = (await headers()).get("x-pathname");
    const target = pathname === null ? null : onboardingRedirect({ role: me.user.role, onboardingComplete: false }, pathname);
    if (target) redirect(target);
    return (
      <SetupFrame user={card}>
        <OnboardingGate role={me.user.role} onboardingComplete={false}>
          {children}
        </OnboardingGate>
      </SetupFrame>
    );
  }

  const isStudent = me.user.role === "student";
  const enabled = isStudent ? enabledOptionalCrew(await listFacts(getDeps(), actor, actor.userId)) : [];
  const shared = isStudent ? [] : await parentShares(actor);
  const { tabs, more } = mobileTabsFor(me.user.role, enabled, shared);
  const topbar = (
    <Topbar
      search={isStudent ? { action: "/scholarships", placeholder: "Search scholarships, schools, essays…" } : undefined}
    >
      <NotificationBell timeZone={me.user.timeZone} />
      <Button variant="line" size="sm" href="/settings">
        Settings
      </Button>
      <Button variant="primary" icon="chat" href="/crew">
        Ask your crew
      </Button>
    </Topbar>
  );

  return (
    <ShellFrame
      nav={navFor(me.user.role, enabled, shared)}
      crew={rosterFor(enabled, me.user.role)}
      user={card}
      topbar={topbar}
      tabs={tabs}
      more={more}
    >
      {children}
    </ShellFrame>
  );
}
```

`apps/web/src/app/(app)/error.tsx` (E-16-4; catches errors thrown by any `(app)` page, plan 17's included):

```tsx
"use client";

import { Button, Card, EmptyState } from "@scholarcrew/ui";

/** Never shows error.message: it can carry internal details. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card title="Something went wrong on our side">
      <EmptyState
        title="Your work is saved."
        icon="alert"
        action={
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
        }
      >
        Try again, or come back in a few minutes.
      </EmptyState>
    </Card>
  );
}
```

`apps/web/src/app/(app)/loading.tsx`:

```tsx
import styles from "@/components/shell/shell.module.css";
import { Card } from "@scholarcrew/ui";

/** Shown while a server-rendered (app) page loads. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Card>
        <p className={styles.gate}>Loading…</p>
      </Card>
    </div>
  );
}
```


- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/shell && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 6 files, 28 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell apps/web/src/lib/pageActor.ts "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/error.tsx" "apps/web/src/app/(app)/loading.tsx"
git commit -m "feat(web): app shell layout with server onboarding redirect, parent nav, error and loading states"
```

### P8: Week summary helpers and the plan check-off (WK-02)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/week/summary.test.ts`:

```ts
import type { PlanItem, WeekPlan } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { contributorsLine, heroMeta, itemMeta, openLabel, openSummary, planHref, weekSubline } from "./summary";

const item = (o: Partial<PlanItem> = {}): PlanItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Hill Country STEM Award: two short answers",
  kind: "scholarship",
  refType: "scholarship",
  refId: "hill-country-stem",
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["compass", "scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
  ...o,
});

const plan = (items: PlanItem[]): WeekPlan => ({
  weekStart: "2026-10-05",
  items,
  totalMinutes: items.reduce((s, i) => s + i.minutes, 0),
  doneCount: items.filter((i) => i.status === "done").length,
});

describe("week summary", () => {
  it("counts open items and minutes like the mockup header", () => {
    const p = plan([
      item(),
      item({ id: "2", minutes: 60 }),
      item({ id: "3", minutes: 10 }),
      item({ id: "4", minutes: 35 }),
      item({ id: "5", minutes: 15, status: "done" }),
      item({ id: "6", minutes: 20, status: "skipped" }),
    ]);
    expect(openSummary(p)).toEqual({ count: 4, minutes: 135, done: 1 });
    expect(weekSubline({ weekStart: "2026-10-05", plan: p })).toBe(
      "Week of Oct 5 · 4 things · about 2 h 15 min · Compass planned this from your deadlines",
    );
    expect(weekSubline({ weekStart: "2026-10-05", plan: plan([]) })).toBe("Week of Oct 5 · nothing open yet");
  });

  it("formats item and hero meta", () => {
    expect(itemMeta(item())).toBe("$1,000 · due Oct 15");
    expect(itemMeta(item({ valueUsd: null, dueOn: null }))).toBe("");
    expect(heroMeta(item())).toBe("$1,000 · due Thu, Oct 15 · about 30 min");
    expect(contributorsLine(["compass", "scout", "quill"])).toEqual({ lead: "compass", others: "Scout + Quill" });
    expect(contributorsLine([])).toEqual({ lead: null, others: "" });
  });

  it("links each item to the screen that does the work", () => {
    expect(planHref(item())).toBe("/scholarships/hill-country-stem");
    expect(planHref(item({ kind: "essay", refType: "essay", refId: "e1" }))).toBe("/essays/e1");
    expect(planHref(item({ kind: "application", refType: "college_list", refId: "c1" }))).toBe("/colleges/c1");
    expect(planHref(item({ kind: "application", refType: null, refId: null }))).toBe("/colleges");
    expect(planHref(item({ kind: "aid", refType: null, refId: null }))).toBe("/money");
    expect(planHref(item({ kind: "test_prep", refType: null, refId: null }))).toBe("/prep");
    expect(planHref(item({ kind: "service", refType: null, refId: null }))).toBe("/impact");
    expect(planHref(item({ kind: "custom", refType: null, refId: null }))).toBe("/crew");
    expect(openLabel(item({ kind: "essay" }))).toBe("Open in Essay Studio");
    expect(openLabel(item())).toBe("Open");
  });
});
```

`apps/web/src/components/week/PlanList.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { PlanItem, WeekPlan } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanList } from "./PlanList";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (o: Partial<PlanItem>): PlanItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Hill Country STEM Award: two short answers",
  kind: "scholarship",
  refType: null,
  refId: null,
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
  ...o,
});

const plan: WeekPlan = {
  weekStart: "2026-10-05",
  items: [
    item({}),
    item({ id: "22222222-2222-4222-8222-222222222222", title: "Upload your transcript", status: "done", minutes: 5 }),
  ],
  totalMinutes: 35,
  doneCount: 1,
};

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PlanList", () => {
  it("renders items with time, meta, contributors, and the header", () => {
    stub(200, {});
    render(<PlanList plan={plan} />);
    expect(screen.getByText("30 min planned · 1 done")).toBeTruthy();
    expect(screen.getByText("$1,000 · due Oct 15")).toBeTruthy();
    expect(screen.getAllByText("Scout")).toHaveLength(2);
    expect(screen.getByText("done")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Upload your transcript" }) as HTMLInputElement).checked).toBe(true);
  });

  it("checking an item PATCHes it done and refreshes", async () => {
    const fetchMock = stub(200, item({ status: "done" }));
    render(<PlanList plan={plan} />);
    const box = screen.getByRole("checkbox", { name: "Hill Country STEM Award: two short answers" }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/plan-items/11111111-1111-4111-8111-111111111111");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("unchecking sends todo, and a failure reverts with the message", async () => {
    stub(404, { error: { code: "not_found", message: "Plan item not found" } });
    render(<PlanList plan={plan} />);
    const box = screen.getByRole("checkbox", { name: "Upload your transcript" }) as HTMLInputElement;
    fireEvent.click(box);
    expect(await screen.findByText("Plan item not found")).toBeTruthy();
    expect(box.checked).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("is read-only for parents", () => {
    const fetchMock = stub(200, {});
    render(<PlanList plan={plan} readOnly />);
    const box = screen.getByRole("checkbox", { name: "Hill Country STEM Award: two short answers" }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    fireEvent.click(box);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an empty state", () => {
    render(<PlanList plan={{ weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 }} />);
    expect(screen.getByText("Nothing planned yet")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/week`
Expected: FAIL with `Failed to resolve import "./summary"` and `Failed to resolve import "./PlanList"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/week/summary.ts`:

```ts
import { addDaysIso, dateShort, dateWithWeekday, minutesLabel, plural, usd } from "@/lib/format";
import { CREW_NAMES, type CrewRole, type IsoDate, type PlanItem, type WeekPlan } from "@scholarcrew/domain";

export function openSummary(plan: WeekPlan): { count: number; minutes: number; done: number } {
  const open = plan.items.filter((i) => i.status === "todo");
  return {
    count: open.length,
    minutes: open.reduce((sum, i) => sum + i.minutes, 0),
    done: plan.items.filter((i) => i.status === "done").length,
  };
}

/** "Week of Oct 5 · 4 things · about 2 h 15 min · Compass planned this from your deadlines" */
export function weekSubline(view: { weekStart: IsoDate; plan: WeekPlan }): string {
  const s = openSummary(view.plan);
  const parts = [`Week of ${dateShort(view.weekStart)}`];
  if (s.count === 0) parts.push("nothing open yet");
  else parts.push(plural(s.count, "thing"), `about ${minutesLabel(s.minutes)}`, "Compass planned this from your deadlines");
  return parts.join(" · ");
}

export function itemMeta(item: Pick<PlanItem, "valueUsd" | "dueOn">): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateShort(item.dueOn)}`);
  return parts.join(" · ");
}

export function heroMeta(item: Pick<PlanItem, "valueUsd" | "dueOn" | "minutes">): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateWithWeekday(item.dueOn)}`);
  parts.push(`about ${minutesLabel(item.minutes)}`);
  return parts.join(" · ");
}

export function contributorsLine(roles: CrewRole[]): { lead: CrewRole | null; others: string } {
  const [lead, ...rest] = roles;
  return { lead: lead ?? null, others: rest.map((r) => CREW_NAMES[r]).join(" + ") };
}

const BY_KIND: Record<PlanItem["kind"], string> = {
  scholarship: "/scholarships",
  essay: "/essays",
  application: "/colleges",
  recommendation: "/colleges",
  aid: "/money",
  test_prep: "/prep",
  service: "/impact",
  thank_you: "/scholarships",
  custom: "/crew",
};

/** WK-01 "Open": the record the item points at, else the screen for its kind. */
export function planHref(item: Pick<PlanItem, "kind" | "refType" | "refId">): string {
  if (item.refId) {
    const id = encodeURIComponent(item.refId);
    if (item.refType === "scholarship") return `/scholarships/${id}`;
    if (item.refType === "essay") return `/essays/${id}`;
    if (item.refType === "college_list") return `/colleges/${id}`;
  }
  return BY_KIND[item.kind];
}

export function openLabel(item: Pick<PlanItem, "kind">): string {
  return item.kind === "essay" ? "Open in Essay Studio" : "Open";
}

export function nextWeekStart(weekStart: IsoDate): IsoDate {
  return addDaysIso(weekStart, 7);
}
```

`apps/web/src/components/week/PlanList.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { minutesLabel } from "@/lib/format";
import type { PlanItem, TaskStatus, WeekPlan } from "@scholarcrew/domain";
import { Card, EmptyState, Icon, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { itemMeta } from "./summary";
import styles from "./week.module.css";

/** WK-02: the week's open and done items. Checking an item marks it done (PATCH /plan-items/:id). */
export function PlanList({ plan, readOnly = false }: { plan: WeekPlan; readOnly?: boolean }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusOf = (i: PlanItem): TaskStatus => overrides[i.id] ?? i.status;

  async function toggle(i: PlanItem) {
    if (readOnly) return;
    const next: TaskStatus = statusOf(i) === "done" ? "todo" : "done";
    setOverrides((o) => ({ ...o, [i.id]: next }));
    setPending(i.id);
    setError(null);
    try {
      await api<PlanItem>(`/plan-items/${i.id}`, { method: "PATCH", body: { status: next } });
      router.refresh();
    } catch (e) {
      setOverrides((o) => ({ ...o, [i.id]: i.status }));
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const items = plan.items.filter((i) => statusOf(i) !== "skipped");
  const open = items.filter((i) => statusOf(i) === "todo");
  const doneCount = items.length - open.length;
  const minutes = open.reduce((sum, i) => sum + i.minutes, 0);

  return (
    <Card
      title="This week"
      aside={
        <span className={styles.muted}>
          {minutesLabel(minutes)} planned · {doneCount} done
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Nothing planned yet" icon="calendar">
          Ask your crew to plan your week, or add something from a scholarship or essay.
        </EmptyState>
      ) : (
        <ul className={styles.tasks}>
          {items.map((i) => {
            const done = statusOf(i) === "done";
            const meta = itemMeta(i);
            return (
              <li key={i.id} className={cx(styles.task, done && styles.done)}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    className={styles.srOnly}
                    checked={done}
                    disabled={readOnly || pending === i.id}
                    onChange={() => void toggle(i)}
                  />
                  <span className={cx(styles.cbx, done && styles.cbxOn)} aria-hidden="true">
                    {done ? <Icon name="check" /> : null}
                  </span>
                  <span className={styles.srOnly}>{i.title}</span>
                </label>
                <div className={styles.tMain}>
                  <div className={styles.tTitle}>{i.title}</div>
                  <div className={styles.tMeta}>
                    {meta ? <span>{meta}</span> : null}
                    {i.contributors.map((r) => (
                      <Who key={r} role={r} size="sm" />
                    ))}
                  </div>
                </div>
                <span className={styles.tTime}>{done ? "done" : `${i.minutes} min`}</span>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/week/week.module.css` (mockups 01 and 19):

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.error {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.head {
  margin-bottom: 16px;
}

.sub {
  margin-top: 5px;
  font-size: 14px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 22px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

/* next step hero */
.hero {
  padding: 18px 22px;
  border-radius: 16px;
  background: var(--navy);
  color: #fff;
}

.heroEyebrow {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
}

.heroEyebrow b {
  color: #fff;
}

.hero h2 {
  margin: 8px 0 4px;
  font-size: 24px;
  color: #fff;
}

.hero p {
  color: rgba(255, 255, 255, 0.86);
}

.heroRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.heroError {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 13px;
}

/* plan list */
.tasks li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
}

.tasks li:first-child {
  padding-top: 2px;
  border-top: 0;
}

.check {
  position: relative;
  display: grid;
  flex: none;
  cursor: pointer;
}

.cbx {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1.5px solid #b9bfc8;
  border-radius: 6px;
}

.check:focus-within .cbx {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

.cbx svg {
  width: 14px;
  height: 14px;
}

.cbxOn {
  border-color: var(--navy);
  background: var(--navy);
  color: #fff;
}

.task {
  min-width: 0;
}

.done .tTitle {
  color: var(--muted);
  text-decoration: line-through;
}

.tMain {
  flex: 1;
  min-width: 0;
}

.tTitle {
  font-weight: 600;
}

.tMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--muted);
}

.tTime {
  width: 56px;
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--ink-2);
}

/* gap card */
.note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 13px;
}

.srcline {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

/* coming up */
.deadlines li {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.deadlines li:first-child {
  padding-top: 2px;
  border-top: 0;
}

.date {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.days {
  font-size: 12px;
  color: var(--muted);
}

/* sweep */
.mLine {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
}

.mSub {
  margin: 4px 0 12px;
  font-size: 13px;
  color: var(--muted);
}

/* ask bar */
.askCard {
  padding: 12px;
}

.askbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--wash);
  color: var(--muted);
}

.askInput {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 13.5px;
  color: var(--ink);
  outline: none;
}

.askSend {
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--card);
  font-size: 12px;
  font-weight: 700;
  color: var(--navy);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

/* crew working */
.working {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.working p {
  margin-top: 4px;
  font-size: 13.5px;
  color: var(--ink-2);
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .head h1 {
    font-size: 23px;
  }

  .sub {
    font-size: 13px;
  }

  .hero {
    padding: 14px 16px;
  }

  .hero h2 {
    font-size: 19px;
  }

  .heroRow {
    flex-wrap: nowrap;
  }

  .heroRow > * {
    flex: 1;
    justify-content: center;
  }

  .tTime {
    width: auto;
    font-size: 12px;
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/week && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 8 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/week/summary.ts apps/web/src/components/week/summary.test.ts apps/web/src/components/week/PlanList.tsx apps/web/src/components/week/PlanList.test.tsx apps/web/src/components/week/week.module.css
git commit -m "feat(web): week plan list with check-off and summary helpers"
```

### P9: Week cards: next step, gap, coming up, sweep, ask bar, crew working, plan my week (WK-01..WK-06, ON-06, R2C-5)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/week/cards.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CostSummary, CrewJob, Deadline, PlanItem } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskBar } from "./AskBar";
import { ComingUp } from "./ComingUp";
import { CrewWorking } from "./CrewWorking";
import { GapCard } from "./GapCard";
import { NextStepHero } from "./NextStepHero";
import { PlanWeekButton } from "./PlanWeekButton";
import { SweepCard } from "./SweepCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/week" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const next: PlanItem = {
  id: "11111111-1111-4111-8111-111111111111",
  weekStart: "2026-10-05",
  title: "Finish the Hill Country STEM Award",
  kind: "essay",
  refType: "essay",
  refId: "e1",
  minutes: 30,
  valueUsd: 1000,
  dueOn: "2026-10-15",
  status: "todo",
  contributors: ["compass", "scout", "quill"],
  priority: 0,
  createdAt: "2026-10-05T12:00:00.000Z",
  completedAt: null,
};

const gap: CostSummary = {
  collegeId: "100001",
  collegeName: "State U",
  source: "scorecard",
  sourceLabel: "Estimate from College Scorecard",
  costOfAttendanceUsd: 27800,
  freeMoneyUsd: 18600,
  gapUsd: 9200,
  pendingUsd: 4750,
  gapIfPendingWinUsd: 4450,
  isEstimate: true,
  budgetUsd: null,
  gapAfterBudgetUsd: null,
};

const deadline = (o: Partial<Deadline>): Deadline => ({
  kind: "scholarship",
  title: "Hill Country STEM Award",
  dueOn: "2026-10-15",
  daysLeft: 9,
  refType: "scholarship",
  refId: "s1",
  valueUsd: 1000,
  warning: true,
  ...o,
});

describe("NextStepHero", () => {
  it("shows the step, its crew, and an Open link", () => {
    render(<NextStepHero item={next} weekStart="2026-10-05" />);
    expect(screen.getByRole("heading", { name: "Finish the Hill Country STEM Award" })).toBeTruthy();
    expect(screen.getByText("$1,000 · due Thu, Oct 15 · about 30 min")).toBeTruthy();
    expect(screen.getByText(/with Scout \+ Quill/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Essay Studio" }).getAttribute("href")).toBe("/essays/e1");
  });

  it("Not this week moves the item to next week", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NextStepHero item={next} weekStart="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "Not this week" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"weekStart":"2026-10-12"}' });
  });

  it("hides Not this week when read-only", () => {
    render(<NextStepHero item={next} weekStart="2026-10-05" readOnly />);
    expect(screen.queryByRole("button", { name: "Not this week" })).toBeNull();
  });
});

describe("GapCard", () => {
  it("shows the gap, the pending note, and the Ledger source line", () => {
    render(<GapCard gap={gap} />);
    expect(screen.getByText("Year-1 gap · State U")).toBeTruthy();
    expect(screen.getAllByText("$9,200").length).toBeGreaterThan(0);
    expect(screen.getByText("left to pay, earn, or borrow · estimate")).toBeTruthy();
    expect(screen.getByText("$4,750")).toBeTruthy();
    expect(screen.getByText("$4,450")).toBeTruthy();
    expect(screen.getByText(/Estimate from College Scorecard/)).toBeTruthy();
  });

  it("asks for a college when there's no gap yet", () => {
    render(<GapCard gap={null} />);
    expect(screen.getByText("Add a college to see your gap")).toBeTruthy();
  });
});

describe("ComingUp", () => {
  it("warns on items due within 14 days", () => {
    render(
      <ComingUp
        deadlines={[
          deadline({}),
          deadline({ title: "State U · Early Action", dueOn: "2026-11-01", daysLeft: 26, warning: false, valueUsd: null }),
        ]}
      />,
    );
    expect(screen.getByText("Hill Country STEM Award · $1,000")).toBeTruthy();
    expect(screen.getByText("9 days").closest("span")?.className).toContain("warn");
    expect(screen.getByText("26 days").className).toContain("days");
    expect(screen.getByText("Nov 1")).toBeTruthy();
  });

  it("has an empty state", () => {
    render(<ComingUp deadlines={[]} />);
    expect(screen.getByText("Nothing due in the next few weeks.")).toBeTruthy();
  });
});

describe("SweepCard", () => {
  it("summarizes the last sweep", () => {
    render(
      <SweepCard
        sweep={{ ranAt: "2026-10-04T19:00:00.000Z", newMatches: 3, totalUsd: 7500, reuseCount: 2, hiddenScams: 1 }}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText("Sunday's sweep")).toBeTruthy();
    expect(screen.getByText("3 new matches worth $7,500")).toBeTruthy();
    expect(screen.getByText("2 reuse your essays · 1 hidden for charging a fee")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review matches" }).getAttribute("href")).toBe("/scholarships");
  });

  it("explains that the first sweep is coming", () => {
    render(<SweepCard sweep={null} timeZone="America/Chicago" />);
    expect(screen.getByText("Scout runs your first sweep soon.")).toBeTruthy();
  });
});

describe("AskBar", () => {
  it("sends the question to the Crew screen", () => {
    render(<AskBar />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask your crew" }), {
      target: { value: "Can I still apply Early Action?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(router.push).toHaveBeenCalledWith("/crew?prefill=Can%20I%20still%20apply%20Early%20Action%3F");
  });

  it("chips prefill the composer and blank questions go nowhere", () => {
    render(<AskBar />);
    fireEvent.click(screen.getByRole("button", { name: "@Scout local scholarships" }));
    expect(router.push).toHaveBeenCalledWith("/crew?prefill=%40Scout%20local%20scholarships");
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe("CrewWorking", () => {
  it("refreshes the page while the first plan is built", () => {
    vi.useFakeTimers();
    render(<CrewWorking intervalMs={1000} maxRefreshes={2} />);
    expect(screen.getByText("Your crew is working")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});

describe("PlanWeekButton (R2C-5)", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
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
    close() {}
  }

  const planJob = (o: Partial<CrewJob> = {}): CrewJob => ({
    id: "66666666-6666-4666-8666-666666666666",
    kind: "weekly_plan",
    status: "queued",
    conversationId: null,
    requestMessageId: null,
    resultMessageId: null,
    refId: null,
    progress: [],
    error: null,
    safety: null,
    createdAt: "2026-10-06T15:00:00.000Z",
    updatedAt: "2026-10-06T15:00:00.000Z",
    ...o,
  });

  const respond = (data: unknown, status: number) =>
    vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
    );

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  it("posts /plan/regenerate, follows the job, and refreshes when it's done", async () => {
    const fetchMock = respond(planJob(), 202);
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanWeekButton />);
    fireEvent.click(screen.getByRole("button", { name: "Plan my week" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/plan/regenerate");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${planJob().id}/events`);
    expect((screen.getByRole("button", { name: "Planning…" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(planJob({ status: "working" }))));
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(planJob({ status: "ready" }))));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Plan my week" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the allowance message with a See plans link on 402", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ error: { code: "limit_reached", message: "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT." } }, 402),
    );
    render(<PlanWeekButton />);
    fireEvent.click(screen.getByRole("button", { name: "Plan my week" }));
    expect(await screen.findByText("You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
    expect(FakeEventSource.instances).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Plan my week" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/week/cards`
Expected: FAIL with `Failed to resolve import "./AskBar"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/week/NextStepHero.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { CREW_NAMES, type IsoDate, type PlanItem } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { contributorsLine, heroMeta, nextWeekStart, openLabel, planHref } from "./summary";
import styles from "./week.module.css";

/** WK-01: the highest-priority open item with Open and Not this week. */
export function NextStepHero({
  item,
  weekStart,
  readOnly = false,
}: {
  item: PlanItem;
  weekStart: IsoDate;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { lead, others } = contributorsLine(item.contributors);

  async function defer() {
    setBusy(true);
    setError(null);
    try {
      await api(`/plan-items/${item.id}`, { method: "PATCH", body: { weekStart: nextWeekStart(weekStart) } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className={styles.hero} aria-label="Your next step">
      <div className={styles.heroEyebrow}>
        Your next step
        {lead ? (
          <>
            {" · "}
            <b>{CREW_NAMES[lead]}</b>
            {others ? ` with ${others}` : ""}
          </>
        ) : null}
      </div>
      <h2>{item.title}</h2>
      <p>{heroMeta(item)}</p>
      <div className={styles.heroRow}>
        <Button variant="white" iconEnd="arrow" href={planHref(item)}>
          {openLabel(item)}
        </Button>
        {readOnly ? null : (
          <Button variant="glass" disabled={busy} onClick={() => void defer()}>
            Not this week
          </Button>
        )}
      </div>
      {error ? (
        <p className={styles.heroError} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

`apps/web/src/components/week/GapCard.tsx`:

```tsx
import { usd } from "@/lib/format";
import type { CostSummary } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Eyebrow, GapBar, HeroNumber, Who } from "@scholarcrew/ui";
import styles from "./week.module.css";

/** WK-03: year-1 gap for the top school, computed by Ledger (plan 08), with the estimate source. */
export function GapCard({ gap }: { gap: CostSummary | null }) {
  if (!gap) {
    return (
      <Card title={<Eyebrow>Year-1 gap</Eyebrow>} aside={<Who role="ledger" size="sm" />}>
        <EmptyState
          title="Add a college to see your gap"
          icon="dollar"
          action={
            <Button variant="soft" href="/colleges">
              Add colleges
            </Button>
          }
        >
          Ledger works out what's left to pay once your list has a school.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card title={<Eyebrow>Year-1 gap · {gap.collegeName}</Eyebrow>} aside={<Who role="ledger" size="sm" />}>
      <HeroNumber
        value={usd(gap.gapUsd)}
        caption={`left to pay, earn, or borrow${gap.isEstimate ? " · estimate" : ""}`}
      />
      <GapBar freeUsd={gap.freeMoneyUsd} gapUsd={gap.gapUsd} totalLabel="to attend" />
      {gap.pendingUsd > 0 ? (
        <p className={styles.note}>
          Your open applications are worth <b>{usd(gap.pendingUsd)}</b>. If they all come through, this year's gap
          drops to <b>{usd(gap.gapIfPendingWinUsd)}</b>.
        </p>
      ) : null}
      {gap.budgetUsd !== null && gap.gapAfterBudgetUsd !== null ? (
        <p className={styles.note}>
          After the family budget of <b>{usd(gap.budgetUsd)}</b> a year, <b>{usd(gap.gapAfterBudgetUsd)}</b> is left.
        </p>
      ) : null}
      <p className={styles.srcline}>
        {gap.sourceLabel}. <a href="/money">Run {gap.collegeName}'s calculator</a>
      </p>
    </Card>
  );
}
```

`apps/web/src/components/week/ComingUp.tsx`:

```tsx
import { dateShort, daysLabel, usd } from "@/lib/format";
import type { Deadline } from "@scholarcrew/domain";
import { Badge, Card } from "@scholarcrew/ui";
import styles from "./week.module.css";

/** WK-04: the next four deadlines; within 14 days gets a warning badge (icon + text, never color alone). */
export function ComingUp({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <Card title="Coming up">
      {deadlines.length === 0 ? (
        <p className={styles.muted}>Nothing due in the next few weeks.</p>
      ) : (
        <ul className={styles.deadlines}>
          {deadlines.map((d) => (
            <li key={`${d.refType}:${d.refId}:${d.dueOn}`}>
              <span className={styles.date}>{dateShort(d.dueOn)}</span>
              <span>{d.valueUsd ? `${d.title} · ${usd(d.valueUsd)}` : d.title}</span>
              {d.warning ? (
                <Badge tone="warn" icon="clock">
                  {daysLabel(d.daysLeft)}
                </Badge>
              ) : (
                <span className={styles.days}>{daysLabel(d.daysLeft)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

`apps/web/src/components/week/SweepCard.tsx`:

```tsx
import { plural, usd } from "@/lib/format";
import type { SweepSummary } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Who } from "@scholarcrew/ui";
import styles from "./week.module.css";

function weekday(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(iso));
}

/** WK-05: the last Scout sweep. */
export function SweepCard({ sweep, timeZone }: { sweep: SweepSummary | null; timeZone: string }) {
  if (!sweep) {
    return (
      <Card>
        <Eyebrow>
          <Who role="scout" /> · Weekly sweep
        </Eyebrow>
        <p className={styles.mSub}>Scout runs your first sweep soon.</p>
      </Card>
    );
  }
  return (
    <Card>
      <Eyebrow>
        <Who role="scout" /> · <span>{`${weekday(sweep.ranAt, timeZone)}'s sweep`}</span>
      </Eyebrow>
      <p className={styles.mLine}>{`${plural(sweep.newMatches, "new match", "new matches")} worth ${usd(sweep.totalUsd)}`}</p>
      <p className={styles.mSub}>
        {`${sweep.reuseCount} reuse your essays · ${sweep.hiddenScams} hidden for charging a fee`}
      </p>
      <Button variant="soft" iconEnd="arrow" href="/scholarships">
        Review matches
      </Button>
    </Card>
  );
}
```

`apps/web/src/components/week/AskBar.tsx`:

```tsx
"use client";

import type { CrewRole } from "@scholarcrew/domain";
import { Card, Chip, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./week.module.css";

const CHIPS: Array<{ role: CrewRole; text: string }> = [
  { role: "scout", text: "@Scout local scholarships" },
  { role: "ledger", text: "@Ledger what if I win my open applications?" },
  { role: "aid", text: "@Aid what does my family need to do?" },
];

/** WK-06: submitting opens Crew and sends the message; chips prefill the composer. */
export function AskBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <Card className={styles.askCard}>
      <form
        className={styles.askbar}
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (q) router.push(`/crew?prefill=${encodeURIComponent(q)}`);
        }}
      >
        <Icon name="chat" />
        <input
          className={styles.askInput}
          aria-label="Ask your crew"
          placeholder={'Ask your crew anything, like "Can I still apply Early Action?"'}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={styles.askSend}>
          Ask
        </button>
      </form>
      <div className={styles.chips}>
        {CHIPS.map((c) => (
          <Chip key={c.text} dot={c.role} onClick={() => router.push(`/crew?prefill=${encodeURIComponent(c.text)}`)}>
            {c.text}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
```

`apps/web/src/components/week/CrewWorking.tsx`:

```tsx
"use client";

import { Card, StatusPill, Who } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./week.module.css";

/** ON-06: shown while the first sweep and plan run; refreshes the page until they land. */
export function CrewWorking({ intervalMs = 15_000, maxRefreshes = 40 }: { intervalMs?: number; maxRefreshes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= maxRefreshes) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, maxRefreshes]);
  return (
    <Card>
      <div className={styles.working}>
        <StatusPill status="working" />
        <div>
          <h3>Your crew is working</h3>
          <p>
            <Who role="scout" /> is running your first scholarship sweep and <Who role="compass" /> is planning your
            first week. This page updates on its own, and the work keeps going if you close the tab.
          </p>
        </div>
      </div>
    </Card>
  );
}
```

`apps/web/src/components/week/PlanWeekButton.tsx` (R2C-5: the student reruns the weekly plan; the Monday `plan.weekly.fanout` covers everyone else):

```tsx
"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type CrewJob, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./week.module.css";

/**
 * WK-02: "Plan my week" posts /plan/regenerate (402 when the allowance is used), follows the returned
 * `weekly_plan` job with useJobStream, and refreshes the page once the job is terminal. Students only; the
 * page never renders it for parents.
 */
export function PlanWeekButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const { job, error: streamError } = useJobStream(jobId);

  useEffect(() => {
    if (!job || !TERMINAL_JOB_STATUSES.includes(job.status)) return;
    if (job.status === "failed") setError("Your crew couldn't plan this week. Try again in a minute.");
    setJobId(null);
    router.refresh();
  }, [job, router]);

  async function start() {
    setStarting(true);
    setError(null);
    setLimited(false);
    try {
      const started = await api<CrewJob>("/plan/regenerate", { method: "POST" });
      setJobId(started.id);
    } catch (e) {
      setError(errorMessage(e));
      setLimited(isLimit(e));
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || (jobId !== null && streamError === null);
  const message = error ?? streamError;
  return (
    <div>
      <Button variant="soft" size="sm" icon="spark" disabled={busy} onClick={() => void start()}>
        {busy ? "Planning…" : "Plan my week"}
      </Button>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
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

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/week && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 22 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/week
git commit -m "feat(web): week cards for next step, gap, deadlines, sweep, ask bar, and plan my week"
```

### P10: This Week page (WK-01..WK-06, parents' shared view)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/week/WeekPage.test.tsx` (renders the async server component with the services mocked):

```tsx
// @vitest-environment jsdom
import WeekPage from "@/app/(app)/week/page";
import type { FamilyView, MeResponse, ThisWeekView } from "@scholarcrew/domain";
import { AppError } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getThisWeek: vi.fn(),
  getFamily: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/plan", () => ({ getThisWeek: m.getThisWeek }));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/week" }));

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";

const me = (role: "student" | "parent"): MeResponse => ({
  user: {
    id: role === "student" ? STUDENT : PARENT,
    email: `${role}@example.test`,
    displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
    role,
    birthYear: null,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: null,
  onboardingComplete: true,
  family: null,
  plan: "free",
});

const view = (o: Partial<ThisWeekView> = {}): ThisWeekView => ({
  greetingName: "Maya",
  weekStart: "2026-10-05",
  nextStep: {
    id: "33333333-3333-4333-8333-333333333333",
    weekStart: "2026-10-05",
    title: "Finish the Hill Country STEM Award",
    kind: "scholarship",
    refType: null,
    refId: null,
    minutes: 30,
    valueUsd: 1000,
    dueOn: "2026-10-15",
    status: "todo",
    contributors: ["compass"],
    priority: 0,
    createdAt: "2026-10-05T12:00:00.000Z",
    completedAt: null,
  },
  plan: { weekStart: "2026-10-05", items: [], totalMinutes: 0, doneCount: 0 },
  gap: null,
  deadlines: [],
  sweep: null,
  crewWorking: false,
  ...o,
});

const family: FamilyView = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Family",
  myRole: "parent",
  members: [
    { userId: STUDENT, displayName: "Maya Rivera", email: "student@example.test", memberRole: "student", joinedAt: "2026-10-01T15:00:00.000Z" },
    { userId: PARENT, displayName: "Dana Rivera", email: "parent@example.test", memberRole: "parent", joinedAt: "2026-10-02T15:00:00.000Z" },
  ],
  pendingInvites: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T20:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("This Week page", () => {
  it("greets the student and shows the hero, plan, and ask bar", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: STUDENT, role: "student" }, me: me("student"), deps: {} });
    m.getThisWeek.mockResolvedValue(view());
    render(await WeekPage());
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon, Maya." })).toBeTruthy();
    expect(screen.getByText("Week of Oct 5 · nothing open yet")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your next step" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Ask your crew" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plan my week" })).toBeTruthy();
    expect(m.getThisWeek).toHaveBeenCalledWith({}, { kind: "user", userId: STUDENT, role: "student" }, STUDENT);
  });

  it("shows the crew-working state when the first plan is still being built", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: STUDENT, role: "student" }, me: me("student"), deps: {} });
    m.getThisWeek.mockResolvedValue(view({ crewWorking: true, nextStep: null }));
    render(await WeekPage());
    expect(screen.getByText("Your crew is working")).toBeTruthy();
  });

  it("shows parents their student's shared week without editing, asking, or planning", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: PARENT, role: "parent" }, me: me("parent"), deps: {} });
    m.getFamily.mockResolvedValue(family);
    m.getThisWeek.mockResolvedValue(view());
    render(await WeekPage());
    expect(m.getThisWeek.mock.calls[0]?.[2]).toBe(STUDENT);
    expect(screen.getByRole("heading", { level: 1, name: "Good afternoon, Dana." })).toBeTruthy();
    expect(screen.getByText(/Shared by Maya/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Not this week" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Ask your crew" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Plan my week" })).toBeNull();
  });

  it("explains when a parent has no family or deadlines aren't shared", async () => {
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: PARENT, role: "parent" }, me: me("parent"), deps: {} });
    m.getFamily.mockResolvedValue(null);
    render(await WeekPage());
    expect(screen.getByText("Your student's week shows up here")).toBeTruthy();
    cleanup();
    m.getFamily.mockResolvedValue(family);
    m.getThisWeek.mockRejectedValue(new AppError("not_found", "Not found"));
    render(await WeekPage());
    expect(screen.getByText("Maya Rivera isn't sharing deadlines right now")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/week/WeekPage`
Expected: FAIL with `Failed to resolve import "@/app/(app)/week/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/(app)/week/page.tsx`:

```tsx
import { displayNameOf } from "@/components/shell/nav";
import { AskBar } from "@/components/week/AskBar";
import { ComingUp } from "@/components/week/ComingUp";
import { CrewWorking } from "@/components/week/CrewWorking";
import { GapCard } from "@/components/week/GapCard";
import { NextStepHero } from "@/components/week/NextStepHero";
import { PlanList } from "@/components/week/PlanList";
import { PlanWeekButton } from "@/components/week/PlanWeekButton";
import { SweepCard } from "@/components/week/SweepCard";
import { weekSubline } from "@/components/week/summary";
import styles from "@/components/week/week.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { greeting } from "@/lib/time";
import { getFamily } from "@scholarcrew/core/family";
import { getThisWeek } from "@scholarcrew/core/plan";
import { type ThisWeekView, isAppError } from "@scholarcrew/domain";
import { Button, Card, EmptyState } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

function Explain({ title, children }: { title: string; children: string }) {
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
        {children}
      </EmptyState>
    </Card>
  );
}

export default async function WeekPage() {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isParent = me.user.role === "parent";
  let studentId = actor.userId;
  let studentName = "";
  if (isParent) {
    const family = await getFamily(deps, actor);
    const student = family?.members.find((member) => member.memberRole === "student");
    if (!student) {
      return (
        <Explain title="Your student's week shows up here">
          Once you join your student's family, you'll see the plan and deadlines they share with you.
        </Explain>
      );
    }
    studentId = student.userId;
    studentName = student.displayName;
  }

  let view: ThisWeekView;
  try {
    view = await getThisWeek(deps, actor, studentId);
  } catch (e) {
    if (isParent && isAppError(e) && e.code === "not_found") {
      return (
        <Explain title={`${studentName || "Your student"} isn't sharing deadlines right now`}>
          They can turn sharing back on from their Family page.
        </Explain>
      );
    }
    throw e;
  }

  const name = isParent ? (displayNameOf(me).split(" ")[0] ?? "") : view.greetingName;
  const subline = weekSubline(view);
  return (
    <>
      <div className={styles.head}>
        <h1>{`${greeting(new Date(), me.user.timeZone)}, ${name}.`}</h1>
        <p className={styles.sub}>{isParent ? `Shared by ${view.greetingName} · ${subline}` : subline}</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          {view.crewWorking && view.plan.items.length === 0 ? <CrewWorking /> : null}
          {view.nextStep ? <NextStepHero item={view.nextStep} weekStart={view.weekStart} readOnly={isParent} /> : null}
          <PlanList plan={view.plan} readOnly={isParent} />
          {isParent ? null : <PlanWeekButton />}
          {isParent ? null : <AskBar />}
        </div>
        <div className={styles.col}>
          <GapCard gap={view.gap} />
          <ComingUp deadlines={view.deadlines} />
          {isParent && !view.sweep ? null : <SweepCard sweep={view.sweep} timeZone={me.user.timeZone} />}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/week && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 26 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/week/page.tsx" apps/web/src/components/week/WeekPage.test.tsx
git commit -m "feat(web): This Week page for students and parents"
```

### P11: Crew reply card: contributors, steps, receipt, question, action cards, crisis (CR-03..CR-05, CR-09, CR-11)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/crew/ReplyCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CrewReply, Message } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplyCard } from "./ReplyCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/crew/c1" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";

const planItem = (title: string, minutes: number, valueUsd: number | null, dueOn: string | null) => ({
  title,
  kind: "scholarship" as const,
  refType: null,
  refId: null,
  minutes,
  valueUsd,
  dueOn,
  contributors: [],
  weekStart: null,
});

const reply = (o: Partial<CrewReply> = {}): CrewReply => ({
  text: "Start with the Hill Country STEM Award. It's due Thursday.",
  contributors: ["compass", "atlas", "scout", "quill"],
  question: "Want me to block Saturday morning for it?",
  actionCards: [
    { kind: "add_plan_item", id: "add-hill", label: "Add Hill Country to my week", item: planItem("Hill Country STEM Award", 30, 1000, "2026-10-15") },
    { kind: "add_plan_item", id: "add-stateu", label: "Add the State U draft", item: planItem("State U supplement", 60, null, "2026-11-01") },
    { kind: "open_link", id: "open-hill", label: "Open Hill Country answers", href: "/essays/e1" },
  ],
  receipt: [
    { kind: "fact", label: "Profile: GPA 3.72, Maple County", refId: null, sourceUrl: null, verifiedAt: null },
    { kind: "catalog", label: "Hill Country listing", refId: "s1", sourceUrl: "https://hillcountry.example/award", verifiedAt: "2026-10-02T15:00:00.000Z" },
  ],
  safety: null,
  needsInput: false,
  ...o,
});

const message = (o: Partial<Message> = {}): Message => ({
  id: MESSAGE_ID,
  conversationId: "22222222-2222-4222-8222-222222222222",
  authorKind: "crew",
  authorUserId: null,
  body: "Start with the Hill Country STEM Award.",
  reply: reply(),
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
  ...o,
});

describe("ReplyCard", () => {
  it("shows the fact key, value, and visibility above the fixed save button", () => {
    render(<ReplyCard message={message({ reply: reply({ actionCards: [{ kind: "confirm_fact", id: "memory", label: "Friendly model label", fact: { key: "intended_majors", value: ["Nursing"], visibility: "crew", source: "crew_inferred", sourceRef: null } }] }) })} />);
    expect(screen.getByText("Save to memory: Intended majors = Nursing · visible to your crew")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save to memory" })).toBeTruthy();
  });

  it("does not render unsafe internal actions or unsafe external receipt sources", () => {
    render(<ReplyCard message={message({ reply: reply({
      actionCards: [{ kind: "open_link", id: "unsafe", label: "Unsafe action", href: "/\\evil.example" }],
      receipt: [{ kind: "catalog", label: "Unsafe source", refId: null, sourceUrl: "javascript:alert(1)", verifiedAt: null }],
    }) })} />);
    expect(screen.queryByRole("link", { name: "Unsafe action" })).toBeNull();
    expect(screen.queryByRole("link", { name: "source" })).toBeNull();
    expect(screen.getByText("Unsafe source")).toBeTruthy();
  });

  it("names the contributors and shows one answer, steps, and one question", () => {
    render(<ReplyCard message={message()} />);
    expect(screen.getByText("Compass")).toBeTruthy();
    expect(screen.getByText("· with Atlas, Scout, Quill")).toBeTruthy();
    expect(screen.getByText("Start with the Hill Country STEM Award. It's due Thursday.")).toBeTruthy();
    expect(screen.getByText("Hill Country STEM Award")).toBeTruthy();
    expect(screen.getByText("· $1,000 · due Oct 15")).toBeTruthy();
    expect(screen.getByText("· due Nov 1")).toBeTruthy();
    expect(screen.getByText("Want me to block Saturday morning for it?")).toBeTruthy();
  });

  it("lists what the team used with verified dates and sources", () => {
    render(<ReplyCard message={message()} timeZone="America/Chicago" />);
    expect(screen.getByText("What the team used")).toBeTruthy();
    expect(screen.getByText("Profile: GPA 3.72, Maple County")).toBeTruthy();
    expect(screen.getByText("Hill Country listing, verified Oct 2")).toBeTruthy();
    const source = screen.getByRole("link", { name: "source" });
    expect(source.getAttribute("href")).toBe("https://hillcountry.example/award");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("applies a card once, disabling buttons while it saves", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/actions/apply");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ messageId: MESSAGE_ID, cardId: "add-hill" }));
    resolve(
      new Response(
        JSON.stringify({ id: "r1", messageId: MESSAGE_ID, cardId: "add-hill", appliedAt: "2026-10-06T15:01:00.000Z", result: {} }),
        // 14 N9 answers POST /actions/apply with 200 (R3A-14).
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const applied = await screen.findByRole("button", { name: "Added to your week" });
    expect((applied as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows cards applied earlier as applied and links open_link cards", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReplyCard message={message({ appliedCardIds: ["add-hill"] })} />);
    expect((screen.getByRole("button", { name: "Added to your week" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Open Hill Country answers" }).getAttribute("href")).toBe("/essays/e1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the API message when applying fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Scholarship not found" } }), { status: 404 })),
    );
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect(await screen.findByText("Scholarship not found")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Hill Country to my week" })).toBeTruthy();
  });

  it("treats a 409 as already being applied: status text, disabled card, refresh, no alert (R3A-15)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "conflict", message: "This action is still being applied" } }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    render(<ReplyCard message={message()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Hill Country to my week" }));
    expect((await screen.findByRole("status")).textContent).toBe("Already being added…");
    expect((screen.getByRole("button", { name: "Add Hill Country to my week" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add the State U draft" }) as HTMLButtonElement).disabled).toBe(false);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders crisis replies with 988 up front and nothing to click", () => {
    render(
      <ReplyCard
        message={message({
          reply: reply({ safety: "crisis", text: "I'm really glad you told me. You deserve support right now.", question: null }),
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "988" }).getAttribute("href")).toBe("tel:988");
    expect(screen.getByText(/988 Suicide & Crisis Lifeline/)).toBeTruthy();
    expect(screen.getByText("I'm really glad you told me. You deserve support right now.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("What the team used")).toBeNull();
  });

  it("falls back to the message body when there's no structured reply", () => {
    render(<ReplyCard message={message({ reply: null, body: "Plain text reply" })} />);
    expect(screen.getByText("Plain text reply")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/crew/ReplyCard`
Expected: FAIL with `Failed to resolve import "./ReplyCard"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/crew/ActionButtons.tsx`:

```tsx
"use client";

import Link from "next/link";
import { internalHref, dateShort } from "@/lib/format";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { ActionCard, ActionReceipt } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

export function cardSummary(card: ActionCard): string | null {
  if (card.kind === "confirm_fact") {
    const words = card.fact.key.replace(/_/g, " ").trim();
    const key = words.charAt(0).toUpperCase() + words.slice(1);
    const value = Array.isArray(card.fact.value) ? card.fact.value.join(", ") : String(card.fact.value);
    return `Save to memory: ${key} = ${value} · ${({ crew: "visible to your crew", crew_family: "visible to your crew and family", scout_only: "used for matching only", private: "private" } as const)[card.fact.visibility]}`;
  }
  if (card.kind === "record_decision") return `Log decision: ${card.decision.summary}`;
  if (card.kind === "add_plan_item") return `${card.item.title}${card.item.dueOn ? ` · due ${dateShort(card.item.dueOn)}` : ""}`;
  return null;
}

const APPLIED_LABEL: Record<Exclude<ActionCard["kind"], "open_link">, string> = {
  add_plan_item: "Added to your week",
  save_scholarship: "Saved to your board",
  add_college: "Added to your list",
  start_essay: "Essay started",
  record_decision: "Decision saved",
  confirm_fact: "Remembered",
};

/** R3A-15: 08 answers 409 `conflict` while another apply of the same card still holds its claim. */
export const ALREADY_APPLYING = "Already being added…";

/** CR-05: nothing changes until a click; applied cards stay applied (the server is idempotent too). */
export function ActionButtons({
  messageId,
  cards,
  applied,
  readOnly = false,
}: {
  messageId: string;
  cards: ActionCard[];
  applied: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [applying, setApplying] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (cards.length === 0) return null;

  async function apply(card: ActionCard) {
    setPending(card.id);
    setError(null);
    try {
      await api<ActionReceipt>("/actions/apply", { method: "POST", body: { messageId, cardId: card.id } });
      setDone((d) => (d.includes(card.id) ? d : [...d, card.id]));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        // Another tab or a retried call is applying this card; the refresh picks up appliedCardIds.
        setApplying((a) => (a.includes(card.id) ? a : [...a, card.id]));
        router.refresh();
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.actions}>
      {cards.map((card, position) => {
        const variant = position === 0 ? "primary" : "line";
        if (card.kind === "open_link") {
          const href = internalHref(card.href, typeof window === "undefined" ? "https://scholarcrew.test" : window.location.origin);
          return href ? <Link key={card.id} href={href}>{card.label}</Link> : <span key={card.id}>{card.label}</span>;
        }
        if (applied.includes(card.id) || done.includes(card.id)) {
          return (
            <Button key={card.id} variant="soft" icon="check" disabled>
              {APPLIED_LABEL[card.kind]}
            </Button>
          );
        }
        if (applying.includes(card.id)) {
          return (
            <Button key={card.id} variant={variant} disabled>
              {card.label}
            </Button>
          );
        }
        return (
          <div key={card.id}>
            {cardSummary(card) ? <p>{cardSummary(card)}</p> : null}
            <Button variant={variant} disabled={readOnly || pending !== null} onClick={() => void apply(card)}>
              {pending === card.id ? "Saving…" : card.kind === "confirm_fact" ? "Save to memory" : card.kind === "record_decision" ? "Log this decision" : card.label}
            </Button>
          </div>
        );
      })}
      {applying.length > 0 ? (
        <p className={styles.muted} role="status">
          {ALREADY_APPLYING}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`apps/web/src/components/crew/Receipt.tsx`:

```tsx
import { instantShort, safeHref } from "@/lib/format";
import type { ReceiptItem } from "@scholarcrew/domain";
import { Icon } from "@scholarcrew/ui";
import styles from "./crew.module.css";

/** CR-04: "What the team used", with verified dates for catalog items. */
export function Receipt({ items, timeZone }: { items: ReceiptItem[]; timeZone: string }) {
  if (items.length === 0) return null;
  return (
    <details className={styles.receipt} open>
      <summary className={styles.receiptTitle}>
        <span>What the team used</span>
        <Icon name="chev" />
      </summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.kind}:${item.label}:${item.refId ?? ""}`}>
            <span>{item.verifiedAt ? `${item.label}, verified ${instantShort(item.verifiedAt, timeZone)}` : item.label}</span>
            {safeHref(item.sourceUrl) ? (
              <>
                {" · "}
                <a href={safeHref(item.sourceUrl)!} target="_blank" rel="noopener noreferrer">
                  source
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
```

`apps/web/src/components/crew/CrisisReply.tsx`:

```tsx
import type { CrewReply } from "@scholarcrew/domain";
import styles from "./crew.module.css";

/** CR-09: the reviewed crisis reply. 988 comes first; no plans, chips, or action cards. */
export function CrisisReply({ reply }: { reply: CrewReply }) {
  return (
    <article className={styles.crisis} aria-label="Support is available">
      <div className={styles.crisisBox}>
        <p className={styles.crisisLead}>
          Call or text <a href="tel:988">988</a>
        </p>
        <p>
          The 988 Suicide & Crisis Lifeline is free, confidential, and open 24 hours a day. You can also chat at
          988lifeline.org.
        </p>
        <p>If you're in immediate danger, call 911.</p>
      </div>
      <p className={styles.replyText}>{reply.text}</p>
    </article>
  );
}
```

`apps/web/src/components/crew/ReplyCard.tsx`:

```tsx
"use client";

import { cx } from "@/lib/cx";
import { dateShort, usd } from "@/lib/format";
import { type ActionCard, CREW_NAMES, type Message, type PlanItemInput } from "@scholarcrew/domain";
import { Badge, Eyebrow, Icon, Who } from "@scholarcrew/ui";
import { ActionButtons } from "./ActionButtons";
import { CrisisReply } from "./CrisisReply";
import { Receipt } from "./Receipt";
import styles from "./crew.module.css";

type PlanCard = Extract<ActionCard, { kind: "add_plan_item" }>;

function stepMeta(item: PlanItemInput): string {
  const parts: string[] = [];
  if (item.valueUsd) parts.push(usd(item.valueUsd));
  if (item.dueOn) parts.push(`due ${dateShort(item.dueOn)}`);
  return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
}

/** CR-03: one coordinated reply naming its contributors, with steps, receipt, at most one question, and cards. */
export function ReplyCard({
  message,
  readOnly = false,
  compact = false,
  timeZone = "America/Chicago",
}: {
  message: Message;
  readOnly?: boolean;
  compact?: boolean;
  timeZone?: string;
}) {
  const reply = message.reply;
  if (!reply) {
    return (
      <div className={cx(styles.reply, compact && styles.replySm)}>
        <p className={styles.replyText}>{message.body}</p>
      </div>
    );
  }
  if (reply.safety === "crisis") return <CrisisReply reply={reply} />;
  const [lead, ...others] = reply.contributors;
  const steps = reply.actionCards.filter((c): c is PlanCard => c.kind === "add_plan_item");
  return (
    <article className={cx(styles.reply, compact && styles.replySm)} aria-label={`Reply from ${lead ? CREW_NAMES[lead] : "your crew"}`}>
      <Eyebrow>
        {lead ? <Who role={lead} /> : null}
        {others.length > 0 ? <span>{`· with ${others.map((r) => CREW_NAMES[r]).join(", ")}`}</span> : null}
        {reply.safety === "partial" ? <Badge tone="neutral">Partial answer</Badge> : null}
      </Eyebrow>
      <p className={styles.replyText}>{reply.text}</p>
      {steps.length > 0 ? (
        <ol className={styles.steps}>
          {steps.map((card, n) => (
            <li key={card.id} className={cx(styles.step, card.item.weekStart !== null && styles.later)}>
              <span className={styles.stepN}>{card.item.weekStart !== null ? "→" : n + 1}</span>
              <div>
                <b>{card.item.title}</b> <span className={styles.stepMeta}>{stepMeta(card.item)}</span>
              </div>
              <span className={styles.stepTime}>{card.item.minutes} min</span>
            </li>
          ))}
        </ol>
      ) : null}
      <Receipt items={reply.receipt} timeZone={timeZone} />
      {reply.question ? (
        <p className={styles.question}>
          <Icon name="info" />
          <span>{reply.question}</span>
        </p>
      ) : null}
      <ActionButtons messageId={message.id} cards={reply.actionCards} applied={message.appliedCardIds} readOnly={readOnly} />
    </article>
  );
}
```

`apps/web/src/components/crew/crew.module.css` (mockup 02, plus the family room's compact replies from 08):

```css
.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.error {
  width: 100%;
  font-size: 12.5px;
  color: var(--crit-text);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 22px;
  align-items: start;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* room head */
.roomHead {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.roomHead h1 {
  font-size: 24px;
}

.crewLine {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  font-size: 12.5px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* thread */
.thread {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bubble {
  align-self: flex-end;
  max-width: 72%;
  padding: 10px 15px;
  border: 1px solid var(--navy-line);
  border-radius: 14px 14px 4px 14px;
  background: var(--navy-soft);
  font-size: 14px;
  white-space: pre-line;
}

.author {
  display: block;
  margin-bottom: 2px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--muted);
}

.reply {
  max-width: 92%;
  padding: 15px 18px;
  border: 1px solid var(--line);
  border-radius: 14px 14px 14px 4px;
  background: var(--card);
}

.replySm {
  max-width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
}

.replyText {
  margin-top: 7px;
  font-size: 14px;
  white-space: pre-line;
}

.replySm .replyText {
  font-size: 13.5px;
}

.steps {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.step:first-child {
  border-top: 0;
}

.stepN {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--navy-soft);
  font-size: 12px;
  font-weight: 700;
  color: var(--navy);
}

.later {
  background: var(--wash);
}

.later .stepN {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}

.stepMeta {
  font-size: 12.5px;
  color: var(--muted);
}

.stepTime {
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.receipt {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 12.5px;
  color: var(--ink-2);
}

.receiptTitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--navy);
  list-style: none;
  cursor: pointer;
}

.receiptTitle::-webkit-details-marker {
  display: none;
}

.receiptTitle svg {
  width: 13px;
  height: 13px;
}

.receipt ul {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 18px;
}

.receipt li::before {
  content: "•";
  margin-right: 6px;
  color: var(--faint);
}

.question {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: 13.5px;
  font-weight: 600;
}

.question svg {
  margin-top: 2px;
  color: var(--navy);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

/* crisis (CR-09) */
.crisis {
  max-width: 92%;
  padding: 16px 18px;
  border: 1px solid var(--navy-line);
  border-radius: 14px;
  background: var(--card);
}

.crisisBox {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--navy-soft);
  font-size: 13.5px;
  color: var(--ink);
}

.crisisBox p + p {
  margin-top: 6px;
}

.crisisLead {
  font-size: 20px;
  font-weight: 700;
  color: var(--navy);
}

.crisisLead a {
  text-decoration: underline;
}

/* job progress */
.progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 92%;
  padding: 12px 14px;
  border: 1px dashed var(--navy-line);
  border-radius: 12px;
  background: var(--card);
  font-size: 13px;
}

.progressHead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-2);
}

.progress li {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* composer */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 8px 8px 8px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
}

.composer:focus-within {
  border-color: var(--navy);
}

.composerInput {
  flex: 1;
  min-height: 36px;
  max-height: 160px;
  padding: 8px 0;
  border: 0;
  background: transparent;
  font-size: 14px;
  resize: vertical;
  outline: none;
}

/* side panel */
.jobs li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.jobs li:first-child {
  padding-top: 0;
  border-top: 0;
}

.ji {
  padding-top: 1px;
  color: var(--navy);
}

.jiOk {
  color: var(--good);
}

.kv {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.kv:first-child {
  border-top: 0;
}

.kv > span {
  color: var(--muted);
}

.kv > b {
  font-weight: 600;
}

.addmate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.convs li + li {
  margin-top: 6px;
}

.convs a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.footNote {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--muted);
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .bubble,
  .reply,
  .crisis,
  .progress {
    max-width: 100%;
  }

  .receipt ul {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/crew && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 10 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/crew/ActionButtons.tsx apps/web/src/components/crew/Receipt.tsx apps/web/src/components/crew/CrisisReply.tsx apps/web/src/components/crew/ReplyCard.tsx apps/web/src/components/crew/ReplyCard.test.tsx apps/web/src/components/crew/crew.module.css
git commit -m "feat(web): crew reply card with receipt, action cards, and crisis handling"
```

### P12: Thread, composer, and live job progress (CR-01, CR-02, CR-06, CR-10; lazy context rooms for 17, D35)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/crew/Thread.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Conversation, CrewJob, Message } from "@scholarcrew/domain";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Thread } from "./Thread";
import { recalledJobs } from "./jobMemory";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/crew/c1" }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
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
  close() {}
}

const CONV = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const conversation: Conversation = {
  id: CONV,
  room: "my_crew",
  roomRefId: null,
  familyId: null,
  title: "My Crew",
  createdAt: "2026-10-01T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};

const msg = (o: Partial<Message>): Message => ({
  id: "11111111-1111-4111-8111-111111111111",
  conversationId: CONV,
  authorKind: "user",
  authorUserId: "99999999-9999-4999-8999-999999999999",
  body: "I have 2 hours this weekend. What should I work on?",
  reply: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  appliedCardIds: [],
  sharedCategories: null,
  ...o,
});

const job = (o: Partial<CrewJob> = {}): CrewJob => ({
  id: "22222222-2222-4222-8222-222222222222",
  kind: "crew_request",
  status: "queued",
  conversationId: CONV,
  requestMessageId: "33333333-3333-4333-8333-333333333333",
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
  ...o,
});

// 14 N9 answers POST /conversations/:id/messages with 202 (R3A-14).
function stubSend(status = 202, body: unknown = { message: msg({ id: "33333333-3333-4333-8333-333333333333", body: "@Ledger how much would Rotary change my gap?" }), job: job() }) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

describe("Thread", () => {
  it("offers Send again after a failed job and resends only when clicked", async () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} prefill="Please check my deadlines" />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job({ status: "failed", error: "My Crew didn't finish" }))));
    const retry = await screen.findByRole("button", { name: "Send again" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ body: "Please check my deadlines" });
  });

  it("loads an earlier page before the first message", async () => {
    const page = Array.from({ length: 50 }, (_, index) => msg({ id: `m-${index}`, body: `Current ${index}` }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([msg({ id: "older", body: "Earlier question" })]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Thread conversation={conversation} messages={page} />);
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(await screen.findByText("Earlier question")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/conversations/${conversation.id}/messages?before=m-0&limit=50`);
    expect(screen.queryByRole("button", { name: "Show earlier messages" })).toBeNull();
  });

  it("renders user bubbles and crew replies", () => {
    render(
      <Thread
        conversation={conversation}
        messages={[
          msg({}),
          msg({
            id: "44444444-4444-4444-8444-444444444444",
            authorKind: "crew",
            authorUserId: null,
            body: "Start with Hill Country.",
            reply: {
              text: "Start with Hill Country.",
              contributors: ["compass"],
              question: null,
              actionCards: [],
              receipt: [],
              safety: null,
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("I have 2 hours this weekend. What should I work on?")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Reply from Compass" })).toBeTruthy();
  });

  it("labels each family-room bubble with its author's first name, so a parent's question reads as theirs (R2C-1)", () => {
    const STUDENT_ID = "99999999-9999-4999-8999-999999999999";
    const PARENT_ID = "88888888-8888-4888-8888-888888888888";
    render(
      <Thread
        conversation={{ ...conversation, room: "family", familyId: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1", title: "Family room" }}
        authors={{ [STUDENT_ID]: "Maya", [PARENT_ID]: "Dana" }}
        messages={[
          msg({}),
          msg({ id: "77777777-7777-4777-8777-777777777777", authorUserId: PARENT_ID, body: "How are things going?" }),
        ]}
      />,
    );
    const parentBubble = screen.getByText("How are things going?");
    expect(within(parentBubble).getByText("Dana")).toBeTruthy();
    expect(within(parentBubble).queryByText("Maya")).toBeNull();
    expect(within(screen.getByText("I have 2 hours this weekend. What should I work on?")).getByText("Maya")).toBeTruthy();
  });

  it("sends a message, streams progress, and refreshes when the reply is ready", async () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} />);
    const box = screen.getByRole("textbox", { name: "Message your crew" });
    fireEvent.change(box, { target: { value: "@Ledger how much would Rotary change my gap?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/conversations/${CONV}/messages`);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ body: "@Ledger how much would Rotary change my gap?" }));
    expect(FakeEventSource.instances[0]?.url).toBe(`/api/v1/jobs/${job().id}/events`);
    expect(screen.getByText("@Ledger how much would Rotary change my gap?")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
    expect(recalledJobs().map((j) => j.id)).toEqual([job().id]);

    act(() =>
      FakeEventSource.instances[0]?.emit(
        "job",
        JSON.stringify(job({ status: "working", progress: [{ at: "2026-10-06T15:00:02.000Z", role: "ledger", text: "Running the gap math" }] })),
      ),
    );
    expect(screen.getByText("Running the gap math")).toBeTruthy();
    expect(screen.getByText("Your crew is on it")).toBeTruthy();
    router.refresh.mockClear();
    act(() => FakeEventSource.instances[0]?.emit("job", JSON.stringify(job({ status: "ready" }))));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Your crew is on it")).toBeNull();
  });

  it("shows the allowance message and keeps the draft (CR-10)", async () => {
    stubSend(402, { error: { code: "limit_reached", message: "You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT." } });
    render(<Thread conversation={conversation} messages={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message your crew" }), { target: { value: "Plan my week" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("You've used all 20 crew requests this month. Manual tools still work, and the count resets Oct 31, 2026, 7:00 PM CDT.")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe("Plan my week");
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/settings");
  });

  it("opens a lazy context room on the first send (openRoom)", async () => {
    const ROOM = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const created = url === "/api/v1/conversations";
      const data = created
        ? { ...conversation, id: ROOM, room: "scholarship", roomRefId: "hill-country-stem", title: "Hill Country STEM Award" }
        : { message: msg({ id: "55555555-5555-4555-8555-555555555555", conversationId: ROOM, body: "Is my essay a fit?" }), job: job({ conversationId: ROOM }) };
      // 201 only for POST /conversations; the message send is 202 (R3A-14).
      return new Response(JSON.stringify(data), { status: created ? 201 : 202, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Thread conversation={null} openRoom={{ room: "scholarship", roomRefId: "hill-country-stem" }} messages={[]} compact />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message your crew" }), { target: { value: "Is my essay a fit?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/v1/conversations", `/api/v1/conversations/${ROOM}/messages`]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ room: "scholarship", roomRefId: "hill-country-stem", familyId: null, title: "" }),
    );
    expect(screen.getByText("Is my essay a fit?")).toBeTruthy();
  });

  it("read-only threads show messages with no chips or composer, and cards can't be applied", () => {
    render(
      <Thread
        conversation={conversation}
        readOnly
        messages={[
          msg({}),
          msg({
            id: "66666666-6666-4666-8666-666666666666",
            authorKind: "crew",
            authorUserId: null,
            body: "Save the Rotary award.",
            reply: {
              text: "Save the Rotary award.",
              contributors: ["compass"],
              question: null,
              actionCards: [
                { id: "c1", kind: "save_scholarship", label: "Save Rotary", scholarshipId: "77777777-7777-4777-8777-777777777777" },
              ],
              receipt: [],
              safety: null,
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("I have 2 hours this weekend. What should I work on?")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message your crew" })).toBeNull();
    expect(screen.queryByRole("button", { name: "@Quill essay help" })).toBeNull();
    expect((screen.getByRole("button", { name: "Save Rotary" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("prefill fills the composer and makes no request", () => {
    const fetchMock = stubSend();
    render(<Thread conversation={conversation} messages={[]} prefill="Can I still apply Early Action?" />);
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe("Can I still apply Early Action?");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefills from chips and hides chips after a crisis reply", () => {
    const { unmount } = render(<Thread conversation={conversation} messages={[]} prefill="@Scout new matches" />);
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe("@Scout new matches");
    fireEvent.click(screen.getByRole("button", { name: "@Quill essay help" }));
    expect((screen.getByRole("textbox", { name: "Message your crew" }) as HTMLTextAreaElement).value).toBe("@Quill essay help");
    unmount();
    render(
      <Thread
        conversation={conversation}
        messages={[
          msg({
            authorKind: "crew",
            authorUserId: null,
            reply: {
              text: "You deserve support right now.",
              contributors: ["compass"],
              question: null,
              actionCards: [],
              receipt: [],
              safety: "crisis",
              needsInput: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "@Quill essay help" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/crew/Thread`
Expected: FAIL with `Failed to resolve import "./Thread"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/crew/jobMemory.ts` (this tab's crew questions, so the side panel can label the jobs `GET /jobs?active=1` returns):

```ts
export interface RememberedJob {
  id: string;
  label: string;
  at: string;
}

const KEY = "sc:jobs";
export const JOBS_EVENT = "sc:jobs";

function isRemembered(x: unknown): x is RememberedJob {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.label === "string" && typeof r.at === "string";
}

export function recalledJobs(): RememberedJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRemembered).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function rememberJob(job: { id: string }, label: string, at = new Date().toISOString()): void {
  if (typeof window === "undefined") return;
  const next = [{ id: job.id, label: label.slice(0, 80), at }, ...recalledJobs().filter((j) => j.id !== job.id)].slice(0, 5);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the panel just won't list this job.
  }
  window.dispatchEvent(new Event(JOBS_EVENT));
}
```

`apps/web/src/components/crew/JobProgress.tsx`:

```tsx
import type { CrewJob, JobStatus } from "@scholarcrew/domain";
import { StatusPill, Who } from "@scholarcrew/ui";
import styles from "./crew.module.css";

const HEADLINE: Record<JobStatus, string> = {
  queued: "Your crew got your message",
  working: "Your crew is on it",
  ready: "Reply ready",
  needs_input: "Your crew needs one more thing",
  failed: "Your crew couldn't finish this one",
};

/** CR-06: queued → working → ready, with the latest progress events. */
export function JobProgress({ job, error }: { job: CrewJob | null; error: string | null }) {
  const status = job?.status ?? "queued";
  const events = (job?.progress ?? []).slice(-3);
  return (
    <div className={styles.progress} aria-live="polite">
      <div className={styles.progressHead}>
        <StatusPill status={status} />
        <span>{HEADLINE[status]}</span>
      </div>
      {events.length > 0 ? (
        <ul>
          {events.map((e) => (
            <li key={`${e.at}:${e.role}:${e.text}`}>
              {e.role === "system" ? <b>ScholarCrew</b> : <Who role={e.role} size="sm" />}
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
```

`apps/web/src/components/crew/Thread.tsx`:

```tsx
"use client";

import { api, errorMessage, isLimit } from "@/lib/api";
import { useJobStream } from "@/lib/sse";
import { type Conversation, type CrewJob, type CrewRole, type Message, TERMINAL_JOB_STATUSES } from "@scholarcrew/domain";
import { Button, Chip } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { JobProgress } from "./JobProgress";
import { ReplyCard } from "./ReplyCard";
import { rememberJob } from "./jobMemory";
import styles from "./crew.module.css";

export const DEFAULT_CHIPS: Array<{ role: CrewRole; text: string }> = [
  { role: "scout", text: "@Scout new matches" },
  { role: "quill", text: "@Quill essay help" },
  { role: "aid", text: "@Aid FAFSA checklist" },
  { role: "ledger", text: "@Ledger compare schools" },
];

/** A context room that doesn't exist yet; the first send creates (or reopens) it (CR-08, D35). */
export interface LazyRoom {
  room: "scholarship" | "college" | "essay";
  roomRefId: string;
}

export interface ThreadProps {
  /** null with `openRoom` set: the room is created on the first send. */
  conversation: Conversation | null;
  messages: Message[];
  prefill?: string;
  chips?: Array<{ role: CrewRole; text: string }>;
  compact?: boolean;
  readOnlyCards?: boolean;
  /** userId → name, shown above bubbles in the family room. */
  authors?: Record<string, string>;
  placeholder?: string;
  emptyText?: string;
  timeZone?: string;
  openRoom?: LazyRoom;
  /** Messages only: no chips or composer, and action cards render read-only (parents' shared views). */
  readOnly?: boolean;
}

/** A conversation: bubbles, crew replies, live job progress, mention chips, and the composer. */
export function Thread({
  conversation,
  messages,
  prefill,
  chips = DEFAULT_CHIPS,
  compact = false,
  readOnlyCards = false,
  authors,
  placeholder = "Message your crew… mention @Scout, @Quill, @Aid, or @Ledger",
  emptyText = "Ask anything about scholarships, essays, colleges, or paying for school.",
  timeZone = "America/Chicago",
  openRoom,
  readOnly = false,
}: ThreadProps) {
  const router = useRouter();
  const [earlier, setEarlier] = useState<Message[]>([]);
  const [hasEarlier, setHasEarlier] = useState(messages.length >= 50);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [lastSent, setLastSent] = useState("");
  const [room, setRoom] = useState<Conversation | null>(conversation);
  const [text, setText] = useState(prefill ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState<Message | null>(null);
  const { job, error: streamError } = useJobStream(jobId);
  const current = room ?? conversation;
  const canSend = !readOnly && (current !== null || openRoom !== undefined);

  useEffect(() => {
    if (!job || !TERMINAL_JOB_STATUSES.includes(job.status)) return;
    if (job.status === "failed") setFailure("Your crew couldn't finish this one. Try asking again in a minute.");
    setJobId(null);
    router.refresh();
  }, [job, router]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || sending || !canSend) return;
      setLastSent(trimmed);
      setSending(true);
      setError(null);
      setLimited(false);
      setFailure(null);
      try {
        let target = current;
        if (!target && openRoom) {
          target = await api<Conversation>("/conversations", {
            method: "POST",
            body: { room: openRoom.room, roomRefId: openRoom.roomRefId, familyId: null, title: "" },
          });
          setRoom(target);
        }
        if (!target) return;
        const res = await api<{ message: Message; job: CrewJob }>(`/conversations/${target.id}/messages`, {
          method: "POST",
          body: { body: trimmed },
        });
        setPending(res.message);
        setText("");
        setJobId(res.job.id);
        rememberJob(res.job, trimmed);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e));
        setLimited(isLimit(e));
      } finally {
        setSending(false);
      }
    },
    [canSend, current, openRoom, router, sending],
  );


  const history = [...earlier, ...messages].filter((message, i, all) => all.findIndex((other) => other.id === message.id) === i);
  const shown = pending && !history.some((m) => m.id === pending.id) ? [...history, pending] : history;
  async function loadEarlier() {
    const first = shown[0];
    if (!current || !first || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await api<Message[]>(`/conversations/${current.id}/messages?before=${encodeURIComponent(first.id)}&limit=50`);
      setEarlier((previous) => [...page, ...previous]);
      setHasEarlier(page.length === 50);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoadingEarlier(false); }
  }
  const lastCrew = [...shown].reverse().find((m) => m.authorKind === "crew");
  const showChips = !readOnly && chips.length > 0 && lastCrew?.reply?.safety !== "crisis";
  const busy = sending || (jobId !== null && streamError === null);

  return (
    <div className={styles.thread}>
      {hasEarlier && current ? <Button variant="line" disabled={loadingEarlier} onClick={() => void loadEarlier()}>Show earlier messages</Button> : null}
      {shown.length === 0 && !jobId ? <p className={styles.muted}>{emptyText}</p> : null}
      {shown.map((m) =>
        m.authorKind === "user" ? (
          <div key={m.id} className={styles.bubble}>
            {authors && m.authorUserId && authors[m.authorUserId] ? (
              <span className={styles.author}>{authors[m.authorUserId]}</span>
            ) : null}
            {m.body}
          </div>
        ) : (
          <ReplyCard key={m.id} message={m} compact={compact} readOnly={readOnly || readOnlyCards} timeZone={timeZone} />
        ),
      )}
      {jobId ? <JobProgress job={job} error={streamError} /> : null}
      {failure ? (
        <p className={styles.error} role="alert">
          {failure}
          {!readOnly && lastSent ? <Button variant="line" disabled={busy} onClick={() => void send(lastSent)}>Send again</Button> : null}
        </p>
      ) : null}
      {showChips ? (
        <div className={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.text} dot={c.role} onClick={() => setText(c.text)}>
              {c.text}
            </Chip>
          ))}
        </div>
      ) : null}
      {readOnly ? null : (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            className={styles.composerInput}
            aria-label="Message your crew"
            placeholder={placeholder}
            value={text}
            rows={1}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <Button variant="primary" type="submit" disabled={busy || !canSend || text.trim() === ""}>
            Send
          </Button>
        </form>
      )}
      {error ? (
        <div className={styles.row}>
          <p className={styles.error} role="alert">
            {error}
          </p>
          {limited ? (
            <Button variant="soft" size="sm" href="/settings">
              See plans
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/crew && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 20 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/crew/jobMemory.ts apps/web/src/components/crew/JobProgress.tsx apps/web/src/components/crew/Thread.tsx apps/web/src/components/crew/Thread.test.tsx
git commit -m "feat(web): crew thread with composer, mentions, and live job progress"
```

### P13: Crew side panel and the Crew pages (CR-01, CR-07, ME-06; parents' crew chats E-16-2, active jobs D28, teammate facts D29/D43)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/crew/roomFacts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roomBadge, roomFacts } from "./roomFacts";

describe("roomFacts", () => {
  it("describes My Crew like the mockup", () => {
    expect(roomFacts("my_crew", { parentNames: ["Dana"], title: "My Crew" })).toEqual([
      { label: "Memory", value: "Your private profile and history" },
      { label: "Family", value: "Not shared with Dana" },
      { label: "Can't see", value: "Sensitive facts, your family's documents" },
      { label: "Saves", value: "Only when you click" },
    ]);
    expect(roomFacts("my_crew", { parentNames: [], title: "" })[1]).toEqual({ label: "Family", value: "No family members yet" });
    expect(roomFacts("my_crew", { parentNames: ["Dana", "Sam"], title: "" })[1]?.value).toBe("Not shared with Dana and Sam");
  });

  it("says temporary chats load and save nothing (CR-07)", () => {
    const facts = roomFacts("temporary", { parentNames: ["Dana"], title: "Temporary chat" });
    expect(facts.find((f) => f.label === "Memory")?.value).toBe("Nothing from your profile or past chats");
    expect(facts.find((f) => f.label === "Saves")?.value).toBe("Nothing. Deleted after 24 hours");
    expect(roomBadge("temporary")).toEqual({ label: "Temporary · deleted after 24 hours", icon: "clock" });
  });

  it("puts the room's object first in context rooms", () => {
    expect(roomFacts("scholarship", { parentNames: [], title: "Hill Country STEM Award" })[0]).toEqual({
      label: "Focus",
      value: "Hill Country STEM Award",
    });
    expect(roomBadge("my_crew")).toEqual({ label: "Private to you", icon: "lock" });
    expect(roomBadge("family").label).toBe("Shared with family");
  });
});
```

`apps/web/src/components/crew/BackgroundJobs.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { CrewJob } from "@scholarcrew/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobs } from "./BackgroundJobs";
import { rememberJob } from "./jobMemory";

afterEach(cleanup);
beforeEach(() => window.sessionStorage.clear());

const job: CrewJob = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "crew_request",
  status: "working",
  conversationId: null,
  requestMessageId: null,
  resultMessageId: null,
  refId: null,
  progress: [],
  error: null,
  safety: null,
  createdAt: "2026-10-06T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
};

describe("BackgroundJobs", () => {
  it("lists active jobs from GET /jobs?active=1, the last sweep, and the deadline watcher (D28)", async () => {
    rememberJob(job, "Plan my weekend");
    const plan: CrewJob = { ...job, id: "33333333-3333-4333-8333-333333333333", kind: "weekly_plan", status: "queued" };
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(JSON.stringify([job, plan]), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BackgroundJobs
        sweep={{ ranAt: "2026-10-04T19:00:00.000Z", newMatches: 3, totalUsd: 7500, reuseCount: 2, hiddenScams: 1 }}
        timeZone="America/Chicago"
      />,
    );
    expect(await screen.findByText("“Plan my weekend”")).toBeTruthy();
    expect(screen.getByText("Planning your week")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/jobs?active=1&limit=10");
    expect(screen.getByText(/found 3 new matches · Oct 4/)).toBeTruthy();
    expect(screen.getByText(/reminders 7, 3, and 1 day before/)).toBeTruthy();
  });

  it("shows only the standing rows when nothing is running, and the error when the list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "internal", message: "Try again soon" } }), { status: 500 })),
    );
    render(<BackgroundJobs sweep={null} timeZone="America/Chicago" />);
    expect(await screen.findByText("Try again soon")).toBeTruthy();
    expect(screen.getByText(/runs every Sunday/)).toBeTruthy();
    expect(screen.queryByText("Your crew")).toBeNull();
  });
});
```

`apps/web/src/components/crew/CrewPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import CrewIndexPage from "@/app/(app)/crew/page";
import ConversationPage from "@/app/(app)/crew/[conversationId]/page";
import { AppError, type Conversation, type FamilyView, type MeResponse } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddTeammate } from "./AddTeammate";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  getFamily: vi.fn(),
  listFacts: vi.fn(),
  lastSweep: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/crew", () => ({
  listConversations: m.listConversations,
  createConversation: m.createConversation,
  getMessages: m.getMessages,
}));
vi.mock("@scholarcrew/core/family", () => ({ getFamily: m.getFamily }));
vi.mock("@scholarcrew/core/memory", () => ({ listFacts: m.listFacts }));
vi.mock("@scholarcrew/core/scholarships", () => ({ lastSweep: m.lastSweep }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => m.router,
  usePathname: () => "/crew",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const room = (o: Partial<Conversation>): Conversation => ({
  id: "44444444-4444-4444-8444-444444444444",
  room: "family",
  roomRefId: null,
  familyId: FAMILY,
  title: "Family room",
  createdAt: "2026-10-02T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
  ...o,
});
const familyRoom = room({});
const privateRoom = room({ id: "55555555-5555-4555-8555-555555555555", room: "my_crew", familyId: null, title: "My Crew" });

const family: FamilyView = {
  id: FAMILY,
  name: "Family",
  myRole: "parent",
  members: [
    { userId: STUDENT, displayName: "Maya Rivera", email: "student@example.test", memberRole: "student", joinedAt: "2026-10-01T15:00:00.000Z" },
    { userId: PARENT, displayName: "Dana Rivera", email: "parent@example.test", memberRole: "parent", joinedAt: "2026-10-02T15:00:00.000Z" },
  ],
  pendingInvites: [],
};

function asParent(conversations: Conversation[]) {
  const me: MeResponse = {
    user: {
      id: PARENT,
      email: "parent@example.test",
      displayName: "Dana Rivera",
      role: "parent",
      birthYear: null,
      timeZone: "America/Chicago",
      status: "active",
      createdAt: "2026-10-01T15:00:00.000Z",
    },
    profile: null,
    onboardingComplete: true,
    family: { id: FAMILY, role: "parent" },
    plan: "family",
  };
  m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: PARENT, role: "parent" }, me, deps: {} });
  m.listConversations.mockResolvedValue(conversations);
  m.getMessages.mockResolvedValue([]);
  m.getFamily.mockResolvedValue(family);
}

const page = (conversationId: string) =>
  ConversationPage({ params: Promise.resolve({ conversationId }), searchParams: Promise.resolve({}) });

describe("Crew pages for parents (E-16-2)", () => {
  it("open the family room as their crew chat, with read-only cards and no student tools", async () => {
    asParent([familyRoom]);
    render(await page(familyRoom.id));
    expect(m.requireAppActor).toHaveBeenCalledWith(["student", "parent"]);
    expect(screen.getByRole("heading", { level: 1, name: "Family room" })).toBeTruthy();
    expect(screen.getByText("Shared with family")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    expect(screen.queryByText("Add a teammate")).toBeNull();
    expect(screen.getByText(/Maya's private chats stay private/)).toBeTruthy();
    expect(m.listFacts).not.toHaveBeenCalled();
  });

  it("send /crew to the family room and never open a private room", async () => {
    asParent([familyRoom]);
    await expect(CrewIndexPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(`NEXT_REDIRECT /crew/${familyRoom.id}`);
    asParent([familyRoom, privateRoom]);
    await expect(page(privateRoom.id)).rejects.toThrow("NEXT_NOT_FOUND");
    asParent([]);
    m.createConversation.mockRejectedValue(new AppError("invalid_input", "This family has no student yet"));
    await expect(CrewIndexPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /family");
  });
});

describe("AddTeammate (D29, D43)", () => {
  it("saves a confirmed crew-visible fact and refreshes", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({}), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<AddTeammate missing={["prep"]} />);
    expect(container.querySelector("#add-teammate")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prep · tests" }));
    await waitFor(() => expect(m.router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/facts");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ key: "crew_prep_enabled", value: true, visibility: "crew" }));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/crew`
Expected: FAIL with `Failed to resolve import "./roomFacts"`, `Failed to resolve import "./BackgroundJobs"`, and `Failed to resolve import "@/app/(app)/crew/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/crew/roomFacts.ts`:

```ts
import type { RoomKind } from "@scholarcrew/domain";
import type { IconName } from "@scholarcrew/ui";

export const ROOM_TITLES: Record<RoomKind, string> = {
  my_crew: "My Crew",
  family: "Family room",
  temporary: "Temporary chat",
  scholarship: "Scholarship room",
  college: "College room",
  essay: "Essay room",
};

function familyLine(parentNames: string[]): string {
  return parentNames.length > 0 ? `Not shared with ${parentNames.join(" and ")}` : "No family members yet";
}

/** The "In this room" privacy facts for the Crew side panel. */
export function roomFacts(room: RoomKind, ctx: { parentNames: string[]; title: string }): Array<{ label: string; value: string }> {
  const cantSee = { label: "Can't see", value: "Sensitive facts, your family's documents" };
  const saves = { label: "Saves", value: "Only when you click" };
  if (room === "temporary") {
    return [
      { label: "Memory", value: "Nothing from your profile or past chats" },
      { label: "Family", value: "Not shared" },
      { label: "Can't see", value: "Saved facts, sensitive facts" },
      { label: "Saves", value: "Nothing. Deleted after 24 hours" },
    ];
  }
  if (room === "family") {
    return [
      { label: "Memory", value: "Only what you've both shared" },
      { label: "Family", value: "Everyone in your family room" },
      { label: "Can't see", value: "Private chats, unshared items, sensitive facts" },
      saves,
    ];
  }
  if (room === "my_crew") {
    return [{ label: "Memory", value: "Your private profile and history" }, { label: "Family", value: familyLine(ctx.parentNames) }, cantSee, saves];
  }
  return [
    { label: "Focus", value: ctx.title || ROOM_TITLES[room] },
    { label: "Memory", value: "Your private profile and history" },
    { label: "Family", value: familyLine(ctx.parentNames) },
    cantSee,
    saves,
  ];
}

export function roomBadge(room: RoomKind): { label: string; icon: IconName } {
  if (room === "temporary") return { label: "Temporary · deleted after 24 hours", icon: "clock" };
  if (room === "family") return { label: "Shared with family", icon: "users" };
  return { label: "Private to you", icon: "lock" };
}
```

`apps/web/src/components/crew/BackgroundJobs.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort, plural } from "@/lib/format";
import type { CrewJob, JobKind, SweepSummary } from "@scholarcrew/domain";
import { Card, Icon, StatusPill } from "@scholarcrew/ui";
import { useEffect, useState } from "react";
import { JOBS_EVENT, recalledJobs } from "./jobMemory";
import styles from "./crew.module.css";

const ACTIVE_JOBS = "/jobs?active=1&limit=10";
/** While something is running, re-read the list this often. */
const REFRESH_MS = 15_000;

const KIND_LABELS: Record<JobKind, string> = {
  crew_request: "Answering your message",
  weekly_plan: "Planning your week",
  essay_review: "Reviewing your essay",
  offer_parse: "Reading an award letter",
  appeal_outline: "Outlining an appeal",
  retake_analysis: "Checking a retake",
};

/** D28: queued and working jobs from GET /jobs?active=1, from any tab, plus the standing sweep and watcher rows. */
export function BackgroundJobs({ sweep, timeZone }: { sweep: SweepSummary | null; timeZone: string }) {
  const [jobs, setJobs] = useState<CrewJob[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      try {
        const list = await api<CrewJob[]>(ACTIVE_JOBS);
        if (!alive) return;
        setJobs(list);
        setLabels(new Map(recalledJobs().map((j) => [j.id, j.label])));
        setError(null);
        if (list.length > 0) timer = setTimeout(() => void load(), REFRESH_MS);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    };
    void load();
    const onChange = () => {
      void load();
    };
    window.addEventListener(JOBS_EVENT, onChange);
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener(JOBS_EVENT, onChange);
    };
  }, []);

  return (
    <Card title="Working in the background">
      <ul className={styles.jobs}>
        {jobs.map((job) => {
          const asked = labels.get(job.id);
          return (
            <li key={job.id}>
              <span className={styles.ji}>
                <Icon name={job.status === "working" ? "spin" : "clock"} />
              </span>
              <div>
                <b>Your crew</b> · <span>{asked ? `“${asked}”` : KIND_LABELS[job.kind]}</span>
              </div>
              <StatusPill status={job.status} />
            </li>
          );
        })}
        <li>
          <span className={sweep ? styles.jiOk : styles.ji}>
            <Icon name={sweep ? "check" : "clock"} />
          </span>
          <div>
            <b>Weekly sweep</b>
            <span>
              {sweep
                ? ` found ${plural(sweep.newMatches, "new match", "new matches")} · ${instantShort(sweep.ranAt, timeZone)}`
                : " · runs every Sunday"}
            </span>
          </div>
          <StatusPill status={sweep ? "ready" : "on"} />
        </li>
        <li>
          <span className={styles.ji}>
            <Icon name="clock" />
          </span>
          <div>
            <b>Deadline watcher</b>
            <span> · reminders 7, 3, and 1 day before</span>
          </div>
          <StatusPill status="on" />
        </li>
      </ul>
      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.footNote}>
        This keeps running after you close the tab. You get one weekly digest, not eight bots pinging you.
      </p>
    </Card>
  );
}
```

`apps/web/src/components/crew/RoomButtons.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { Conversation, RoomKind } from "@scholarcrew/domain";
import { Button } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

/** New chat and Temporary chat (CR-07: loads no memory, saves nothing, deleted after 24 hours). */
export function RoomButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(room: Extract<RoomKind, "my_crew" | "temporary">) {
    setBusy(true);
    setError(null);
    try {
      const conv = await api<Conversation>("/conversations", { method: "POST", body: { room } });
      router.push(`/crew/${conv.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <Button variant="line" disabled={busy} onClick={() => void start("my_crew")}>
        New chat
      </Button>
      <Button variant="line" disabled={busy} onClick={() => void start("temporary")}>
        Temporary chat
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
```

`apps/web/src/components/crew/AddTeammate.tsx`:

```tsx
"use client";

import { OPTIONAL_CREW_FACT, type OptionalCrew } from "@/components/shell/nav";
import { api, errorMessage } from "@/lib/api";
import { Chip } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./crew.module.css";

const LABELS: Record<OptionalCrew, string> = { prep: "Prep · tests", impact: "Impact · service" };

/** Switches on Prep or Impact by saving the confirmed fact the shell and plan 12's port read (visibility crew, D43). */
export function AddTeammate({ missing }: { missing: OptionalCrew[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (missing.length === 0) return null;

  async function add(role: OptionalCrew) {
    setError(null);
    try {
      await api("/facts", { method: "POST", body: { key: OPTIONAL_CREW_FACT[role], value: true, visibility: "crew" } });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div id="add-teammate" className={styles.addmate}>
      <span className={styles.muted}>Add a teammate</span>
      {missing.map((role) => (
        <Chip key={role} dot={role} onClick={() => void add(role)}>
          {LABELS[role]}
        </Chip>
      ))}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
```

`apps/web/src/app/(app)/crew/page.tsx`:

```tsx
import { requireAppActor } from "@/lib/pageActor";
import { createConversation, listConversations } from "@scholarcrew/core/crew";
import type { CoreDeps } from "@scholarcrew/core/shared";
import { type Conversation, type UserActor, isAppError } from "@scholarcrew/domain";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A parent's crew chat is the family room; it exists once the family has a student (08 createConversation). */
async function openFamilyRoom(deps: CoreDeps, actor: UserActor, familyId: string | null): Promise<Conversation | null> {
  if (!familyId) return null;
  try {
    return await createConversation(deps, actor, { room: "family", roomRefId: null, familyId, title: "" });
  } catch (e) {
    if (isAppError(e) && (e.code === "invalid_input" || e.code === "not_found")) return null;
    throw e;
  }
}

/** CR-01: opens the student's My Crew room, creating it on first visit. Keeps ?prefill and ?ask. Parents go to the family room. */
export default async function CrewIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const sp = await searchParams;
  const conversations = await listConversations(deps, actor);
  if (me.user.role === "parent") {
    const familyRoom = conversations.find((c) => c.room === "family") ?? (await openFamilyRoom(deps, actor, me.family?.id ?? null));
    redirect(familyRoom ? `/crew/${familyRoom.id}` : "/family");
  }
  const mine =
    conversations.find((c) => c.room === "my_crew") ??
    (await createConversation(deps, actor, { room: "my_crew", roomRefId: null, familyId: null, title: "" }));
  const qs = new URLSearchParams();
  for (const key of ["prefill", "ask"]) {
    const value = sp[key];
    if (typeof value === "string" && value.trim()) qs.set(key, value.slice(0, 4000));
  }
  const query = qs.toString();
  redirect(`/crew/${mine.id}${query ? `?${query}` : ""}`);
}
```

`apps/web/src/app/(app)/crew/[conversationId]/page.tsx`:

```tsx
import { AddTeammate } from "@/components/crew/AddTeammate";
import { BackgroundJobs } from "@/components/crew/BackgroundJobs";
import { RoomButtons } from "@/components/crew/RoomButtons";
import { Thread } from "@/components/crew/Thread";
import styles from "@/components/crew/crew.module.css";
import { ROOM_TITLES, roomBadge, roomFacts } from "@/components/crew/roomFacts";
import { OPTIONAL_CREW, enabledOptionalCrew } from "@/components/shell/nav";
import { instantShort } from "@/lib/format";
import { type AppPageContext, requireAppActor } from "@/lib/pageActor";
import { getMessages, listConversations } from "@scholarcrew/core/crew";
import { getFamily } from "@scholarcrew/core/family";
import { listFacts } from "@scholarcrew/core/memory";
import { lastSweep } from "@scholarcrew/core/scholarships";
import { CREW_ROLES, type Conversation } from "@scholarcrew/domain";
import { Badge, Card, Eyebrow, Who } from "@scholarcrew/ui";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.slice(0, 4000) : undefined;
}

function firstName(name: string, email: string): string {
  return name.trim().split(" ")[0] || email;
}

/** E-16-2: a parent's crew chat. Only family rooms; plan 08 never opens a student's private rooms to parents. */
async function parentRoom(ctx: AppPageContext, conversation: Conversation): Promise<ReactElement> {
  const { actor, me, deps } = ctx;
  const [messages, family] = await Promise.all([getMessages(deps, actor, conversation.id), getFamily(deps, actor)]);
  const members = family?.members ?? [];
  const authors = Object.fromEntries(members.map((x) => [x.userId, firstName(x.displayName, x.email)]));
  const student = members.find((x) => x.memberRole === "student");
  const studentName = student ? firstName(student.displayName, student.email) : "Your student";
  const badge = roomBadge("family");
  const title = conversation.title || ROOM_TITLES.family;
  return (
    <div className={styles.grid}>
      <div className={styles.thread}>
        <div className={styles.roomHead}>
          <div>
            <h1>{title}</h1>
            <div className={styles.crewLine}>
              <Who role="compass" />
              <Badge tone="neutral" icon={badge.icon}>
                {badge.label}
              </Badge>
            </div>
          </div>
        </div>
        <Thread
          conversation={conversation}
          messages={messages}
          chips={[]}
          readOnlyCards
          authors={authors}
          placeholder="Ask the crew about your shared plans…"
          emptyText="Ask a question here and the crew answers with only what you've both shared."
          timeZone={me.user.timeZone}
        />
      </div>
      <div className={styles.side}>
        <Card title="In this room">
          {roomFacts("family", { parentNames: [], title }).map((f) => (
            <div key={f.label} className={styles.kv}>
              <span>{f.label}</span>
              <b>{f.value}</b>
            </div>
          ))}
        </Card>
        <Card>
          <Eyebrow>Private chats</Eyebrow>
          <p className={styles.footNote}>
            {`${studentName}'s private chats stay private. This family room is the crew chat you share.`}
          </p>
        </Card>
      </div>
    </div>
  );
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAppActor(["student", "parent"]);
  const { actor, me, deps } = ctx;
  const { conversationId } = await params;
  const sp = await searchParams;
  const conversations = await listConversations(deps, actor);
  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) notFound();
  if (me.user.role === "parent") {
    if (conversation.room !== "family") notFound();
    return parentRoom(ctx, conversation);
  }
  if (conversation.room === "family") redirect("/family#family-room");

  const [messages, facts, family, sweep] = await Promise.all([
    getMessages(deps, actor, conversation.id),
    listFacts(deps, actor, actor.userId),
    getFamily(deps, actor),
    lastSweep(deps, actor, actor.userId),
  ]);
  const enabled = enabledOptionalCrew(facts);
  const crew = CREW_ROLES.filter((r) => (r !== "prep" && r !== "impact") || enabled.includes(r));
  const parentNames = (family?.members ?? [])
    .filter((m) => m.memberRole === "parent")
    .map((m) => m.displayName.split(" ")[0] || m.email);
  const badge = roomBadge(conversation.room);
  const title = conversation.title || ROOM_TITLES[conversation.room];
  const others = conversations.filter((c) => c.id !== conversation.id && c.room !== "family").slice(0, 6);
  const tz = me.user.timeZone;

  return (
    <div className={styles.grid}>
      <div className={styles.thread}>
        <div className={styles.roomHead}>
          <div>
            <h1>{title}</h1>
            <div className={styles.crewLine}>
              {crew.map((role) => (
                <Who key={role} role={role} />
              ))}
              <Badge tone="neutral" icon={badge.icon}>
                {badge.label}
              </Badge>
            </div>
          </div>
          <RoomButtons />
        </div>
        <Thread
          key={conversation.id}
          conversation={conversation}
          messages={messages}
          prefill={first(sp.prefill) ?? first(sp.ask)}
          timeZone={tz}
        />
      </div>
      <div className={styles.side}>
        <BackgroundJobs sweep={sweep} timeZone={tz} />
        <Card title="In this room">
          {roomFacts(conversation.room, { parentNames, title }).map((f) => (
            <div key={f.label} className={styles.kv}>
              <span>{f.label}</span>
              <b>{f.value}</b>
            </div>
          ))}
          <AddTeammate missing={OPTIONAL_CREW.filter((r) => !enabled.includes(r))} />
        </Card>
        {others.length > 0 ? (
          <Card title="Your chats">
            <ul className={styles.convs}>
              {others.map((c) => (
                <li key={c.id}>
                  <a href={`/crew/${c.id}`}>
                    <span>{c.title || ROOM_TITLES[c.room]}</span>
                    <span className={styles.muted}>
                      {c.room === "temporary" ? "Temporary" : c.lastMessageAt ? instantShort(c.lastMessageAt, tz) : "New"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <Eyebrow>How your crew answers</Eyebrow>
          <p className={styles.footNote}>
            Compass asks only the specialists it needs, merges their work into one reply, and shows what it used. Money
            math is calculated by code, not guessed.
          </p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/crew && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 5 files, 28 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/crew "apps/web/src/app/(app)/crew"
git commit -m "feat(web): crew pages with room privacy facts and background jobs"
```

### P14: Onboarding model and sensitive-fact labels (ON-01, ON-03..ON-05, ID-03)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/onboarding/model.test.ts`:

```ts
import { OnboardingInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { sensitiveValue, splitList } from "../../lib/sensitive";
import { buildInput, draftForStorage, emptyDraft, isUnder13, restoreDraft, stepSummary, validateStep } from "./model";

const NOW = new Date("2026-10-06T15:00:00.000Z");

const filled = () => {
  const d = emptyDraft({ displayName: "Maya", timeZone: "America/Chicago" });
  return {
    ...d,
    birthYear: "2009",
    classYear: "2027",
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    gpa: "3.72",
    majors: "Mechanical engineering",
    interests: "Robotics, programming, teaching kids",
  };
};

describe("validateStep", () => {
  it("requires the About you basics", () => {
    const errors = validateStep(0, emptyDraft({}), NOW);
    expect(errors).toEqual({
      displayName: "Tell us what to call you",
      birthYear: "Enter the year you were born, like 2009",
      classYear: "Enter your high school graduation year",
      highSchool: "Enter your high school",
      state: "Pick your state",
      county: "Enter your county",
    });
    expect(validateStep(0, filled(), NOW)).toEqual({});
    expect(validateStep(0, { ...filled(), birthYear: "2027" }, NOW).birthYear).toBeDefined();
    expect(validateStep(0, { ...filled(), state: "ZZ" }, NOW).state).toBe("Pick your state");
  });

  it("checks GPA and list sizes", () => {
    expect(validateStep(1, filled(), NOW)).toEqual({});
    expect(validateStep(1, { ...filled(), gpa: "" }, NOW)).toEqual({});
    expect(validateStep(1, { ...filled(), gpa: "5.5" }, NOW).gpa).toBe("GPA is a number from 0 to 5, like 3.72");
    expect(validateStep(1, { ...filled(), majors: "a, b, c, d, e, f" }, NOW).majors).toBe("List up to 5 majors");
    expect(validateStep(1, { ...filled(), interests: "1,2,3,4,5,6,7,8,9,10,11" }, NOW).interests).toBe("List up to 10 interests");
  });

  it("needs a range when income is on", () => {
    const d = filled();
    d.sensitive.income_range = { enabled: true, value: "" };
    expect(validateStep(2, d, NOW)).toEqual({ income_range: "Pick a range or turn this off" });
    d.sensitive.income_range = { enabled: true, value: "48_75k" };
    expect(validateStep(2, d, NOW)).toEqual({});
  });

  it("checks the parent email and the 15-college cap", () => {
    expect(validateStep(4, { ...filled(), parentEmail: "dana@" }, NOW).parentEmail).toBe("Enter a valid email or leave it blank");
    expect(validateStep(4, { ...filled(), parentEmail: "dana@example.test" }, NOW)).toEqual({});
    const many = Array.from({ length: 16 }, (_, n) => ({ id: String(100000 + n), name: `College ${n}`, state: "TX" }));
    expect(validateStep(4, { ...filled(), colleges: many }, NOW).colleges).toBe("Pick up to 15 colleges for now");
  });
});

describe("isUnder13", () => {
  it("uses the calendar year like the server", () => {
    expect(isUnder13(2014, NOW)).toBe(true);
    expect(isUnder13(2013, NOW)).toBe(false);
  });
});

describe("buildInput", () => {
  it("produces a valid OnboardingInput with only the opt-ins that are on", () => {
    const d = filled();
    d.sensitive.first_gen = { enabled: true, value: "" };
    d.sensitive.income_range = { enabled: true, value: "48_75k" };
    d.sensitive.heritage = { enabled: true, value: "Mexican American, Tejano" };
    d.colleges = [{ id: "100001", name: "State U", state: "TX" }];
    const input = buildInput(d);
    expect(OnboardingInput.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      displayName: "Maya",
      birthYear: 2009,
      classYear: 2027,
      state: "TX",
      gpaUnweighted: 3.72,
      intendedMajors: ["Mechanical engineering"],
      interests: ["Robotics", "programming", "teaching kids"],
      collegeIds: ["100001"],
      timeZone: "America/Chicago",
    });
    expect(input.sensitive).toEqual([
      { kind: "first_gen", enabled: true, value: null },
      { kind: "income_range", enabled: true, value: "48_75k" },
      { kind: "heritage", enabled: true, value: ["Mexican American", "Tejano"] },
    ]);
    expect(buildInput({ ...filled(), gpa: "" }).gpaUnweighted).toBeNull();
  });
});

describe("drafts and summaries", () => {
  it("never stores sensitive answers on the device", () => {
    const d = filled();
    d.sensitive.disability = { enabled: true, value: "" };
    const stored = draftForStorage(d);
    expect(JSON.stringify(stored)).not.toContain("disability");
    const restored = restoreDraft(JSON.stringify(stored), emptyDraft({}));
    expect(restored.highSchool).toBe("Maple High School");
    expect(restored.sensitive.disability.enabled).toBe(false);
    expect(restoreDraft("not json", emptyDraft({ displayName: "X" })).displayName).toBe("X");
  });

  it("summarizes finished steps for the stepper", () => {
    expect(stepSummary(0, filled())).toBe("Class of 2027 · Maple High School");
    expect(stepSummary(1, filled())).toBe("GPA 3.72 · Robotics");
    expect(stepSummary(2, filled())).toBe("Optional · all start off");
    expect(stepSummary(4, { ...filled(), colleges: [{ id: "1", name: "A", state: "TX" }] })).toBe("1 college");
  });
});

describe("sensitive helpers", () => {
  it("splits lists and shapes values by kind", () => {
    expect(splitList(" a, b ,, a\nc ", 5)).toEqual(["a", "b", "c"]);
    expect(sensitiveValue("income_range", "48_75k")).toBe("48_75k");
    expect(sensitiveValue("income_range", "lots")).toBeNull();
    expect(sensitiveValue("religion", "")).toBeNull();
    expect(sensitiveValue("religion", "Catholic")).toEqual(["Catholic"]);
    expect(sensitiveValue("first_gen", "anything")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/onboarding/model`
Expected: FAIL with `Failed to resolve import "../../lib/sensitive"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/lib/sensitive.ts`:

```ts
import {
  INCOME_RANGE_LABELS,
  IncomeRange,
  SENSITIVE_KINDS,
  type SensitiveFactInput,
  type SensitiveKind,
} from "@scholarcrew/domain";

/** Copy from mockups 07 and 09. `value` says what extra answer the kind takes. */
export const SENSITIVE_OPTIONS: Record<SensitiveKind, { label: string; detail: string; value: "none" | "income" | "list" }> = {
  first_gen: { label: "First in my family to go to college", detail: "Opens awards for first-generation students", value: "none" },
  income_range: {
    label: "Household income range",
    detail: "A range, not exact income. A parent can share it from the Family page.",
    value: "income",
  },
  heritage: { label: "Heritage or ethnicity", detail: "For awards from heritage and community groups", value: "list" },
  disability: { label: "Disability", detail: "You never have to say which one", value: "none" },
  religion: { label: "Religion", detail: "For awards from faith groups", value: "list" },
  military_family: { label: "Military family", detail: "A parent or guardian who serves or served", value: "none" },
  foster_care: { label: "Foster care", detail: "Now or in the past", value: "none" },
  noncitizen_filter: {
    label: "Only show scholarships open to non-citizens",
    detail: "Hides awards that require U.S. citizenship. It doesn't record your status.",
    value: "none",
  },
};

export const SENSITIVE_ORDER: readonly SensitiveKind[] = SENSITIVE_KINDS;

export const INCOME_OPTIONS = (Object.keys(INCOME_RANGE_LABELS) as IncomeRange[]).map((value) => ({
  value,
  label: INCOME_RANGE_LABELS[value],
}));

/** "a, b ,, a\nc" → ["a", "b", "c"]: trimmed, de-duplicated, capped. */
export function splitList(text: string, max: number): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, max);
}

export function sensitiveValue(kind: SensitiveKind, raw: string): SensitiveFactInput["value"] {
  const shape = SENSITIVE_OPTIONS[kind].value;
  if (shape === "income") {
    const parsed = IncomeRange.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  if (shape === "list") {
    const list = splitList(raw, 5).map((v) => v.slice(0, 60));
    return list.length > 0 ? list : null;
  }
  return null;
}
```

`apps/web/src/components/onboarding/model.ts`:

```ts
import { SENSITIVE_ORDER, sensitiveValue, splitList } from "@/lib/sensitive";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import { type OnboardingInput, type SensitiveKind, US_STATES, type USState } from "@scholarcrew/domain";

export type StepIndex = 0 | 1 | 2 | 3 | 4;
export const STEP_TITLES = ["About you", "Grades and interests", "Matching opt-ins", "Starter uploads", "Colleges and family"] as const;
export const MAX_ONBOARDING_COLLEGES = 15;
export const DRAFT_KEY = "sc:onboarding";

export interface CollegePick {
  id: string;
  name: string;
  state: string;
}

export interface OnboardingDraft {
  displayName: string;
  birthYear: string;
  classYear: string;
  highSchool: string;
  state: string;
  county: string;
  city: string;
  timeZone: string;
  gpa: string;
  majors: string;
  interests: string;
  sensitive: Record<SensitiveKind, { enabled: boolean; value: string }>;
  colleges: CollegePick[];
  parentEmail: string;
}

export type StepErrors = Partial<Record<string, string>>;

function noSensitive(): OnboardingDraft["sensitive"] {
  const out = {} as OnboardingDraft["sensitive"];
  for (const kind of SENSITIVE_ORDER) out[kind] = { enabled: false, value: "" };
  return out;
}

export function emptyDraft(o: { displayName?: string; timeZone?: string }): OnboardingDraft {
  return {
    displayName: o.displayName ?? "",
    birthYear: "",
    classYear: "",
    highSchool: "",
    state: "",
    county: "",
    city: "",
    timeZone: o.timeZone ?? DEFAULT_TIME_ZONE,
    gpa: "",
    majors: "",
    interests: "",
    sensitive: noSensitive(),
    colleges: [],
    parentEmail: "",
  };
}

function intIn(raw: string, min: number, max: number): number | null {
  if (!/^\d{4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUnder13(birthYear: number, now: Date): boolean {
  return now.getUTCFullYear() - birthYear < 13;
}

export function validateStep(step: StepIndex, d: OnboardingDraft, now: Date): StepErrors {
  const e: StepErrors = {};
  if (step === 0) {
    const name = d.displayName.trim();
    if (!name) e.displayName = "Tell us what to call you";
    else if (name.length > 80) e.displayName = "Keep it under 80 characters";
    if (intIn(d.birthYear, 1900, now.getUTCFullYear()) === null) e.birthYear = "Enter the year you were born, like 2009";
    if (intIn(d.classYear, 2020, 2040) === null) e.classYear = "Enter your high school graduation year";
    if (!d.highSchool.trim()) e.highSchool = "Enter your high school";
    if (!(US_STATES as readonly string[]).includes(d.state)) e.state = "Pick your state";
    if (!d.county.trim()) e.county = "Enter your county";
    if (!d.timeZone) e.timeZone = "Pick your time zone";
  }
  if (step === 1) {
    if (d.gpa.trim()) {
      const gpa = Number(d.gpa);
      if (!Number.isFinite(gpa) || gpa < 0 || gpa > 5) e.gpa = "GPA is a number from 0 to 5, like 3.72";
    }
    if (splitList(d.majors, 99).length > 5) e.majors = "List up to 5 majors";
    if (splitList(d.interests, 99).length > 10) e.interests = "List up to 10 interests";
  }
  if (step === 2) {
    const income = d.sensitive.income_range;
    if (income.enabled && sensitiveValue("income_range", income.value) === null) {
      e.income_range = "Pick a range or turn this off";
    }
  }
  if (step === 4) {
    if (d.colleges.length > MAX_ONBOARDING_COLLEGES) e.colleges = "Pick up to 15 colleges for now";
    if (d.parentEmail.trim() && !EMAIL.test(d.parentEmail.trim())) e.parentEmail = "Enter a valid email or leave it blank";
  }
  return e;
}

/** The POST /onboarding body. Only opt-ins that are on are sent (ON-04: all start off). */
export function buildInput(d: OnboardingDraft): OnboardingInput {
  const gpa = d.gpa.trim() ? Math.round(Number(d.gpa) * 100) / 100 : null;
  return {
    displayName: d.displayName.trim(),
    birthYear: Number(d.birthYear),
    classYear: Number(d.classYear),
    highSchool: d.highSchool.trim(),
    state: d.state as USState,
    county: d.county.trim(),
    city: d.city.trim(),
    gpaUnweighted: gpa,
    intendedMajors: splitList(d.majors, 5).map((v) => v.slice(0, 80)),
    interests: splitList(d.interests, 10).map((v) => v.slice(0, 60)),
    timeZone: d.timeZone,
    collegeIds: d.colleges.slice(0, MAX_ONBOARDING_COLLEGES).map((c) => c.id),
    sensitive: SENSITIVE_ORDER.filter((kind) => d.sensitive[kind].enabled).map((kind) => ({
      kind,
      enabled: true,
      value: sensitiveValue(kind, d.sensitive[kind].value),
    })),
  };
}

/** What we keep in localStorage between visits: everything except sensitive opt-ins. */
export function draftForStorage(d: OnboardingDraft): Omit<OnboardingDraft, "sensitive"> {
  const { sensitive: _omit, ...rest } = d;
  return rest;
}

export function restoreDraft(raw: string | null, base: OnboardingDraft): OnboardingDraft {
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof OnboardingDraft, unknown>>;
    const text = (k: keyof OnboardingDraft): string => (typeof parsed[k] === "string" ? (parsed[k] as string) : (base[k] as string));
    const colleges = Array.isArray(parsed.colleges)
      ? (parsed.colleges as unknown[]).filter(
          (c): c is CollegePick =>
            typeof c === "object" && c !== null && typeof (c as CollegePick).id === "string" && typeof (c as CollegePick).name === "string",
        )
      : base.colleges;
    return {
      ...base,
      displayName: text("displayName"),
      birthYear: text("birthYear"),
      classYear: text("classYear"),
      highSchool: text("highSchool"),
      state: text("state"),
      county: text("county"),
      city: text("city"),
      timeZone: text("timeZone"),
      gpa: text("gpa"),
      majors: text("majors"),
      interests: text("interests"),
      parentEmail: text("parentEmail"),
      colleges: colleges.slice(0, MAX_ONBOARDING_COLLEGES),
      sensitive: base.sensitive,
    };
  } catch {
    return base;
  }
}

/** Stepper subtitles, like "Class of 2027 · Maple High School". */
export function stepSummary(step: StepIndex, d: OnboardingDraft): string {
  if (step === 0) return d.classYear && d.highSchool ? `Class of ${d.classYear} · ${d.highSchool}` : "Name, school, where you live";
  if (step === 1) {
    const first = splitList(d.interests, 1)[0];
    return [d.gpa ? `GPA ${d.gpa}` : "GPA optional", first].filter(Boolean).join(" · ");
  }
  if (step === 2) {
    const on = SENSITIVE_ORDER.filter((k) => d.sensitive[k].enabled).length;
    return on === 0 ? "Optional · all start off" : `${on} on`;
  }
  if (step === 3) return "Transcript, past essays";
  return d.colleges.length > 0 ? `${d.colleges.length} ${d.colleges.length === 1 ? "college" : "colleges"}` : "Your list, invite a parent";
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/onboarding && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 9 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sensitive.ts apps/web/src/components/onboarding/model.ts apps/web/src/components/onboarding/model.test.ts
git commit -m "feat(web): onboarding draft model, validation, and sensitive-fact labels"
```

### P15: Onboarding wizard and page (ON-01..ON-06, ID-03, D9)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/onboarding/OnboardingWizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { MeResponse } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "./OnboardingWizard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/onboarding" }));

const NOW = "2026-10-06T15:00:00.000Z";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** What 13 M8 returns from POST /onboarding: a full MeResponse (R3A-18). */
const ME: MeResponse = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "maya.r@example.test",
    displayName: "Maya",
    role: "student",
    birthYear: 2009,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: {
    userId: "11111111-1111-4111-8111-111111111111",
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "",
    gpaUnweighted: null,
    gpaWeighted: null,
    intendedMajors: [],
    interests: [],
    onboardingCompletedAt: NOW,
    updatedAt: NOW,
  },
  onboardingComplete: true,
  family: null,
  plan: "free",
};

const UNDERAGE = { error: { code: "forbidden", message: "ScholarCrew is for students 13 and older", details: { reason: "underage" } } };

function stubApi(o: { under13?: boolean; onboarding?: () => Response } = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith("/api/v1/colleges")) {
      return json({
        items: [
          {
            id: "100001",
            name: "State U",
            state: "TX",
            city: "Austin",
            control: "public",
            admitRate: 0.45,
            costOfAttendanceUsd: 27800,
            testPolicy: "optional",
          },
        ],
        page: 1,
        pageSize: 8,
        total: 1,
      });
    }
    if (url === "/api/v1/onboarding") {
      if (o.onboarding) return o.onboarding();
      return o.under13 ? json(UNDERAGE, 403) : json(ME);
    }
    if (url === "/api/v1/documents") {
      return json(
        {
          id: "55555555-5555-4555-8555-555555555555",
          kind: "essay",
          filename: "old-essay.txt",
          mime: "text/plain",
          sizeBytes: 12,
          parseStatus: "none",
          uploadedAt: NOW,
        },
        201,
      );
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillAbout(birthYear = "2009") {
  type("What should we call you?", "Maya");
  type("Birth year", birthYear);
  type("High school graduation year", "2027");
  type("High school", "Maple High School");
  type("State", "TX");
  type("County", "Maple");
}

/** Steps 2 to 5 with nothing added, then Finish setup. */
function finishWithDefaults() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingWizard", () => {
  it("validates step 1 before moving on", () => {
    stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    expect(screen.getByText("Step 1 of 5 · About you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Tell us what to call you")).toBeTruthy();
    expect(screen.getByText("Pick your state")).toBeTruthy();
    expect(screen.getByText("Step 1 of 5 · About you")).toBeTruthy();
  });

  it("checks the age right away and shows the plain explanation when under 13 (ID-03)", async () => {
    const fetchMock = stubApi({ under13: true });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout("2015");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "ScholarCrew is for students 13 and older" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/onboarding");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ birthYear: 2015, sensitive: [], collegeIds: [] });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(window.localStorage.getItem("sc:onboarding")).toBeNull();
  });

  it("explains that past essays go into a Quill story interview and uploads files (ON-02, D9)", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    expect(screen.getByText(/paste it into a Quill story interview/)).toBeTruthy();
    type("What is it?", "essay");
    const file = new File(["my old essay"], "old-essay.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
    expect(await screen.findByText("old-essay.txt")).toBeTruthy();
    const upload = fetchMock.mock.calls.find(([url]) => url === "/api/v1/documents");
    const form = upload?.[1]?.body as FormData;
    expect(form.get("kind")).toBe("essay");
    expect((form.get("file") as File).name).toBe("old-essay.txt");
  });

  it("rejects files that are too big or the wrong type before uploading", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    const zip = new File(["x"], "essays.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [zip] } });
    expect(await screen.findByText("Upload a PDF, text file, PNG, or JPEG.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/v1/documents")).toBe(false);
  });

  it("finishes with opt-ins, colleges, and a parent invite", async () => {
    const fetchMock = stubApi();
    render(<OnboardingWizard initialName="Maya R." initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    type("Unweighted GPA (optional)", "3.72");
    fireEvent.click(screen.getByRole("button", { name: "Continue to opt-ins" }));
    expect(screen.getByText("Never sent to AI.")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "First in my family to go to college" }));
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    expect(screen.getByText("Pick a range or turn this off")).toBeTruthy();
    type("Income range", "48_75k");
    fireEvent.click(screen.getByRole("button", { name: "Continue to uploads" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to colleges" }));
    type("Search colleges", "State");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add State U" }));
    expect(screen.getByRole("button", { name: "Remove State U" })).toBeTruthy();
    type("Parent or guardian email (optional)", "dana@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/week"));

    const onboarding = fetchMock.mock.calls.find(([url]) => url === "/api/v1/onboarding");
    expect(JSON.parse(String(onboarding?.[1]?.body))).toMatchObject({
      displayName: "Maya",
      gpaUnweighted: 3.72,
      collegeIds: ["100001"],
      sensitive: [
        { kind: "first_gen", enabled: true, value: null },
        { kind: "income_range", enabled: true, value: "48_75k" },
      ],
    });
    const invite = fetchMock.mock.calls.find(([url]) => url === "/api/v1/family/invites");
    expect(JSON.parse(String(invite?.[1]?.body))).toEqual({ email: "dana@example.test" });
    expect(fetchMock.mock.calls.find(([url]) => url.startsWith("/api/v1/colleges"))?.[0]).toBe("/api/v1/colleges?q=State&pageSize=8");
  });

  it("keeps the draft on this device without sensitive answers", () => {
    stubApi();
    const { unmount } = render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    unmount();
    const saved = window.localStorage.getItem("sc:onboarding") ?? "";
    expect(saved).toContain("Maple High School");
    expect(saved).not.toContain("sensitive");
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    expect((screen.getByLabelText("High school") as HTMLInputElement).value).toBe("Maple High School");
  });

  it("goes to This week and clears the draft when setup already finished in another tab (409, R3A-17)", async () => {
    stubApi({ onboarding: () => json({ error: { code: "conflict", message: "Onboarding is already complete" } }, 409) });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    finishWithDefaults();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/week"));
    expect(router.refresh).toHaveBeenCalled();
    expect(window.localStorage.getItem("sc:onboarding")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the draft and shows the message on a 403 that isn't the age block (CSRF, R3A-17)", async () => {
    stubApi({ onboarding: () => json({ error: { code: "forbidden", message: "This request didn't come from ScholarCrew" } }, 403) });
    render(<OnboardingWizard initialName="" initialTimeZone="America/Chicago" nowIso={NOW} />);
    fillAbout();
    finishWithDefaults();
    expect((await screen.findByRole("alert")).textContent).toBe("This request didn't come from ScholarCrew");
    expect(screen.queryByRole("heading", { name: "ScholarCrew is for students 13 and older" })).toBeNull();
    expect(window.localStorage.getItem("sc:onboarding") ?? "").toContain("Maple High School");
    expect(router.push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/onboarding/OnboardingWizard`
Expected: FAIL with `Failed to resolve import "./OnboardingWizard"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/onboarding/steps.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { INCOME_OPTIONS, SENSITIVE_OPTIONS, SENSITIVE_ORDER } from "@/lib/sensitive";
import { TIME_ZONES } from "@/lib/time";
import {
  ALLOWED_UPLOAD_MIMES,
  type CollegeSummary,
  type DocumentKind,
  type DocumentMeta,
  MAX_UPLOAD_BYTES,
  type Page,
  type SensitiveKind,
  US_STATES,
} from "@scholarcrew/domain";
import { Button, Select, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import { MAX_ONBOARDING_COLLEGES, type OnboardingDraft, type StepErrors } from "./model";
import styles from "./onboarding.module.css";

export interface StepProps {
  draft: OnboardingDraft;
  errors: StepErrors;
  update: (patch: Partial<OnboardingDraft>) => void;
}

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));

export function AboutStep({ draft, errors, update }: StepProps) {
  return (
    <div className={styles.fields}>
      <TextInput
        label="What should we call you?"
        value={draft.displayName}
        error={errors.displayName}
        maxLength={80}
        onChange={(e) => update({ displayName: e.target.value })}
      />
      <TextInput
        label="Birth year"
        hint="ScholarCrew is for students 13 and older."
        inputMode="numeric"
        value={draft.birthYear}
        error={errors.birthYear}
        maxLength={4}
        onChange={(e) => update({ birthYear: e.target.value })}
      />
      <TextInput
        label="High school graduation year"
        inputMode="numeric"
        value={draft.classYear}
        error={errors.classYear}
        maxLength={4}
        onChange={(e) => update({ classYear: e.target.value })}
      />
      <TextInput
        label="High school"
        value={draft.highSchool}
        error={errors.highSchool}
        maxLength={200}
        onChange={(e) => update({ highSchool: e.target.value })}
      />
      <Select
        label="State"
        placeholder="Pick a state"
        options={STATE_OPTIONS}
        value={draft.state}
        error={errors.state}
        onChange={(e) => update({ state: e.target.value })}
      />
      <TextInput
        label="County"
        hint="Local scholarships are often by county."
        value={draft.county}
        error={errors.county}
        maxLength={100}
        onChange={(e) => update({ county: e.target.value })}
      />
      <TextInput label="City (optional)" value={draft.city} maxLength={100} onChange={(e) => update({ city: e.target.value })} />
      <Select
        label="Time zone"
        options={TIME_ZONES}
        value={draft.timeZone}
        error={errors.timeZone}
        onChange={(e) => update({ timeZone: e.target.value })}
      />
    </div>
  );
}

export function GradesStep({ draft, errors, update }: StepProps) {
  return (
    <div className={styles.fields}>
      <TextInput
        label="Unweighted GPA (optional)"
        hint="Like 3.72. Skip it if you're not sure."
        inputMode="decimal"
        value={draft.gpa}
        error={errors.gpa}
        onChange={(e) => update({ gpa: e.target.value })}
      />
      <TextArea
        label="Intended majors"
        hint="Separate with commas. Up to 5. Undecided is fine."
        rows={2}
        value={draft.majors}
        error={errors.majors}
        onChange={(e) => update({ majors: e.target.value })}
      />
      <TextArea
        label="Interests"
        hint="Up to 10, like robotics, programming, teaching kids."
        rows={2}
        value={draft.interests}
        error={errors.interests}
        onChange={(e) => update({ interests: e.target.value })}
      />
    </div>
  );
}

export function OptInsStep({ draft, errors, update }: StepProps) {
  const set = (kind: SensitiveKind, next: { enabled: boolean; value: string }) =>
    update({ sensitive: { ...draft.sensitive, [kind]: next } });
  return (
    <div className={styles.optins}>
      {SENSITIVE_ORDER.map((kind) => {
        const option = SENSITIVE_OPTIONS[kind];
        const state = draft.sensitive[kind];
        return (
          <div key={kind} className={styles.optin}>
            <Toggle
              checked={state.enabled}
              label={option.label}
              detail={option.detail}
              onChange={(enabled) => set(kind, { enabled, value: enabled ? state.value : "" })}
            />
            {state.enabled && option.value === "income" ? (
              <Select
                label="Income range"
                placeholder="Pick a range"
                options={INCOME_OPTIONS}
                value={state.value}
                error={errors.income_range}
                onChange={(e) => set(kind, { enabled: true, value: e.target.value })}
              />
            ) : null}
            {state.enabled && option.value === "list" ? (
              <TextInput
                label={`${option.label}: which ones? (optional)`}
                hint="Separate with commas. Up to 5."
                value={state.value}
                onChange={(e) => set(kind, { enabled: true, value: e.target.value })}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const UPLOAD_KINDS: Array<{ value: DocumentKind; label: string }> = [
  { value: "transcript", label: "Transcript" },
  { value: "essay", label: "Past essay" },
  { value: "resume", label: "Resume" },
  { value: "other", label: "Something else" },
];

export function UploadsStep({ uploads, onUploaded }: { uploads: DocumentMeta[]; onUploaded: (d: DocumentMeta) => void }) {
  const [kind, setKind] = useState<DocumentKind>("transcript");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!(ALLOWED_UPLOAD_MIMES as readonly string[]).includes(file.type)) {
      setError("Upload a PDF, text file, PNG, or JPEG.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That file is over 10 MB.");
      return;
    }
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    setBusy(true);
    try {
      onUploaded(await api<DocumentMeta>("/documents", { method: "POST", body: form }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.fields}>
      <Select
        label="What is it?"
        options={UPLOAD_KINDS}
        value={kind}
        onChange={(e) => setKind(e.target.value as DocumentKind)}
      />
      <label className={styles.file}>
        <span>Choose a file</span>
        <input
          type="file"
          accept="application/pdf,text/plain,image/png,image/jpeg,.pdf,.txt,.png,.jpg,.jpeg"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className={styles.hint}>
        PDF, text, or image, 10 MB max. Files are encrypted, and you can download or delete them in Settings.
      </p>
      <p className={styles.note}>
        Past essays are saved as documents. To turn one into Story Bank stories, paste it into a Quill story interview
        in Essays after setup.
      </p>
      {busy ? <p className={styles.hint}>Uploading…</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {uploads.length > 0 ? (
        <ul className={styles.list}>
          {uploads.map((d) => (
            <li key={d.id}>
              <b>{d.filename}</b>
              <span className={styles.hint}>{UPLOAD_KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CollegesStep({ draft, errors, update }: StepProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CollegeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = draft.colleges.length >= MAX_ONBOARDING_COLLEGES;

  async function search() {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      const page = await api<Page<CollegeSummary>>(`/colleges?q=${encodeURIComponent(term)}&pageSize=8`);
      setResults(page.items);
      if (page.items.length === 0) setError("No colleges matched. Try a shorter name.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={styles.fields}>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <TextInput label="Search colleges" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        <Button variant="soft" type="submit" disabled={searching}>
          Search
        </Button>
      </form>
      {error ? <p className={styles.hint}>{error}</p> : null}
      {results.length > 0 ? (
        <ul className={styles.list}>
          {results.map((c) => {
            const added = draft.colleges.some((p) => p.id === c.id);
            return (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b> <span className={styles.hint}>{[c.city, c.state].filter(Boolean).join(", ")}</span>
                </span>
                <Button
                  variant="line"
                  size="sm"
                  disabled={added || full}
                  aria-label={`Add ${c.name}`}
                  onClick={() => update({ colleges: [...draft.colleges, { id: c.id, name: c.name, state: c.state }] })}
                >
                  {added ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div>
        <p className={styles.label}>{`Your list · ${draft.colleges.length} of ${MAX_ONBOARDING_COLLEGES}`}</p>
        {draft.colleges.length === 0 ? (
          <p className={styles.hint}>No colleges yet. You can add them later on the Colleges page.</p>
        ) : (
          <ul className={styles.list}>
            {draft.colleges.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b> <span className={styles.hint}>{c.state}</span>
                </span>
                <Button
                  variant="line"
                  size="sm"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => update({ colleges: draft.colleges.filter((p) => p.id !== c.id) })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {errors.colleges ? <p className={styles.error}>{errors.colleges}</p> : null}
      </div>
      <TextInput
        label="Parent or guardian email (optional)"
        hint="We'll send an invite that works once and expires in 7 days. You can also do this later from Family."
        type="email"
        value={draft.parentEmail}
        error={errors.parentEmail}
        maxLength={254}
        onChange={(e) => update({ parentEmail: e.target.value })}
      />
    </div>
  );
}
```

`apps/web/src/components/onboarding/SidePanels.tsx`:

```tsx
import { Card, Eyebrow, Icon, Who } from "@scholarcrew/ui";
import type { OnboardingDraft } from "./model";
import styles from "./onboarding.module.css";

export function UsesPanel() {
  const lines: Array<[string, string]> = [
    ["Only by the matcher.", "That's plain code that compares your answers to each scholarship's rules."],
    ["Never sent to AI.", "Your crew can't read these, and they never show up in chat."],
    ["Never shown to family, schools, or helpers.", "Match reasons in the family room leave them out."],
    ["Encrypted and never guessed.", "Nothing here is inferred from what you write."],
  ];
  return (
    <Card title="How these are used" aside={<Icon name="lock" />}>
      {lines.map(([lead, rest]) => (
        <p key={lead} className={styles.tline}>
          <Icon name="check" />
          <span>
            <b>{lead}</b> {rest}
          </span>
        </p>
      ))}
      <p className={styles.hint}>Change or delete any of these later in Memory.</p>
    </Card>
  );
}

export function SoFarPanel({ draft }: { draft: OnboardingDraft }) {
  const rows: Array<[string, string]> = [
    ["School", [draft.highSchool, draft.classYear ? `class of ${draft.classYear}` : ""].filter(Boolean).join(" · ")],
    ["Lives in", [draft.county ? `${draft.county} County` : "", draft.state].filter(Boolean).join(", ")],
    ["GPA", draft.gpa ? `${draft.gpa} unweighted` : "Not added"],
    ["Majors", draft.majors.trim() || "Not added"],
    ["Interests", draft.interests.trim() || "Not added"],
  ];
  return (
    <Card title="What you've told us so far">
      {rows.map(([k, v]) => (
        <div key={k} className={styles.kv}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      <p className={styles.hint}>Each is saved as something you said. Fix anything in Memory.</p>
    </Card>
  );
}

export function WhenYouFinish() {
  return (
    <Card>
      <Eyebrow>When you finish</Eyebrow>
      <p className={styles.small}>
        <Who role="scout" /> runs your first scholarship sweep and <Who role="compass" /> plans your first week. It takes
        a few minutes, and it keeps going if you close the tab.
      </p>
    </Card>
  );
}
```

`apps/web/src/components/onboarding/Under13Notice.tsx`:

```tsx
import { Button, Card } from "@scholarcrew/ui";
import styles from "./onboarding.module.css";

/** ID-03: the plain explanation after the server deactivates an under-13 account. */
export function Under13Notice() {
  return (
    <Card padding="lg">
      <div className={styles.blocked}>
        <h1>ScholarCrew is for students 13 and older</h1>
        <p>
          Because the birth year you entered means you're under 13, we've turned off this account and signed you out.
          Nothing else from setup was saved.
        </p>
        <p>If you typed the wrong year, ask a parent, guardian, or school counselor to contact us about this account.</p>
        <Button variant="line" href="/">
          Back to the home page
        </Button>
      </div>
    </Card>
  );
}
```

`apps/web/src/components/onboarding/OnboardingWizard.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { DocumentMeta, MeResponse } from "@scholarcrew/domain";
import { Button, Card, Eyebrow, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DRAFT_KEY,
  type OnboardingDraft,
  STEP_TITLES,
  type StepErrors,
  type StepIndex,
  buildInput,
  draftForStorage,
  emptyDraft,
  isUnder13,
  restoreDraft,
  stepSummary,
  validateStep,
} from "./model";
import { SoFarPanel, UsesPanel, WhenYouFinish } from "./SidePanels";
import { AboutStep, CollegesStep, GradesStep, OptInsStep, UploadsStep } from "./steps";
import { Under13Notice } from "./Under13Notice";
import styles from "./onboarding.module.css";

const HEADLINES: Record<StepIndex, { h1: string; sub: string }> = {
  0: {
    h1: "Tell us about you",
    sub: "Your crew uses this to find local scholarships and plan around your deadlines. Each answer is saved as something you said.",
  },
  1: { h1: "Grades and interests", sub: "Optional, but it helps Scout match you and Quill find your stories." },
  2: {
    h1: "Choose what the matcher can use",
    sub: "Some scholarships are only for certain students, like first-generation college students or military families. Turn on only what you're comfortable sharing. You can skip this whole step.",
  },
  3: { h1: "Starter uploads", sub: "Add a transcript, a resume, or past essays. You can skip this and upload later." },
  4: { h1: "Colleges and family", sub: "Add up to 15 colleges you're thinking about, and invite a parent if you'd like." },
};

const DEFAULT_HINTS = ["Name, school, where you live", "GPA and interests", "Optional · all start off", "Transcript, past essays", "Your list, invite a parent"];

/** 06 F13 throws `forbidden` with `details: { reason: "underage" }` for the under-13 gate (R3A-17). */
function isUnderageBlock(e: unknown): boolean {
  return e instanceof ApiError && e.code === "forbidden" && (e.details as { reason?: string } | undefined)?.reason === "underage";
}
const CONTINUE: Record<StepIndex, string> = {
  0: "Continue",
  1: "Continue to opt-ins",
  2: "Continue to uploads",
  3: "Continue to colleges",
  4: "Finish setup",
};

export function OnboardingWizard({
  initialName,
  initialTimeZone,
  nowIso,
}: {
  initialName: string;
  initialTimeZone: string;
  nowIso: string;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [step, setStep] = useState<StepIndex>(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyDraft({ displayName: initialName, timeZone: initialTimeZone }));
  const [errors, setErrors] = useState<StepErrors>({});
  const [uploads, setUploads] = useState<DocumentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let raw: string | null = null;
    try {
      // Read now: the save effect below runs in this same commit and would overwrite the stored draft.
      raw = window.localStorage.getItem(DRAFT_KEY);
    } catch {
      // Storage blocked: start fresh.
    }
    setDraft((d) => restoreDraft(raw, d));
  }, []);

  useEffect(() => {
    if (!restored.current || blocked) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftForStorage(draft)));
    } catch {
      // Storage blocked or full: the draft just isn't kept.
    }
  }, [draft, blocked]);

  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api<MeResponse>("/onboarding", { method: "POST", body: buildInput(draft) });
    } catch (e) {
      setSubmitting(false);
      // R3A-17: branch on codes, never the status number. Only 06's age gate carries reason "underage";
      // a CSRF 403 on this route must not show the under-13 block or clear the draft.
      if (isUnderageBlock(e)) {
        clearDraft();
        setBlocked(true);
        return;
      }
      if (e instanceof ApiError && e.code === "conflict") {
        // Setup already finished (another tab, or an earlier submit whose response was lost).
        clearDraft();
        router.push("/week");
        router.refresh();
        return;
      }
      setSubmitError(errorMessage(e));
      return;
    }
    clearDraft();
    const email = draft.parentEmail.trim();
    if (email) {
      try {
        await api("/family/invites", { method: "POST", body: { email } });
      } catch (e) {
        setInviteProblem(`Your crew is set up, but we couldn't send the invite: ${errorMessage(e)} You can invite a parent from Family.`);
        setSubmitting(false);
        return;
      }
    }
    router.push("/week");
    router.refresh();
  }

  async function next() {
    const errs = validateStep(step, draft, now);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step === 0 && isUnder13(Number(draft.birthYear), now)) {
      await submit();
      return;
    }
    if (step === 4) {
      await submit();
      return;
    }
    setStep((step + 1) as StepIndex);
  }

  function skip() {
    setErrors({});
    if (step === 2) update({ sensitive: emptyDraft({}).sensitive });
    setStep((step + 1) as StepIndex);
  }

  if (blocked) return <Under13Notice />;

  if (inviteProblem) {
    return (
      <Card padding="lg">
        <p>{inviteProblem}</p>
        <div className={styles.foot}>
          <Button variant="primary" href="/week">
            Go to This week
          </Button>
        </div>
      </Card>
    );
  }

  const head = HEADLINES[step];
  return (
    <>
      <ol className={styles.stepper}>
        {STEP_TITLES.map((title, n) => {
          const state = n < step ? "done" : n === step ? "now" : "later";
          return (
            <li key={title} className={cx(styles.stp, styles[state])} aria-current={n === step ? "step" : undefined}>
              <span className={styles.n}>{state === "done" ? <Icon name="check" /> : n + 1}</span>
              <span className={styles.l}>
                {title}
                <span>{state === "done" ? stepSummary(n as StepIndex, draft) : DEFAULT_HINTS[n]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.grid}>
        <Card padding="lg">
          <Eyebrow>{`Step ${step + 1} of 5 · ${STEP_TITLES[step]}`}</Eyebrow>
          <h1 className={styles.h1}>{head.h1}</h1>
          <p className={styles.sub}>{head.sub}</p>
          <div className={styles.body}>
            {step === 0 ? <AboutStep draft={draft} errors={errors} update={update} /> : null}
            {step === 1 ? <GradesStep draft={draft} errors={errors} update={update} /> : null}
            {step === 2 ? <OptInsStep draft={draft} errors={errors} update={update} /> : null}
            {step === 3 ? <UploadsStep uploads={uploads} onUploaded={(d) => setUploads((u) => [...u, d])} /> : null}
            {step === 4 ? <CollegesStep draft={draft} errors={errors} update={update} /> : null}
          </div>
          {submitError ? (
            <p className={styles.error} role="alert">
              {submitError}
            </p>
          ) : null}
          <div className={styles.foot}>
            {step > 0 ? (
              <Button variant="line" disabled={submitting} onClick={() => setStep((step - 1) as StepIndex)}>
                Back
              </Button>
            ) : null}
            <span className={styles.spacer} />
            {step >= 1 && step <= 3 ? (
              <Button variant="line" disabled={submitting} onClick={skip}>
                Skip this step
              </Button>
            ) : null}
            <Button variant="primary" iconEnd="arrow" disabled={submitting} onClick={() => void next()}>
              {submitting ? "Saving…" : CONTINUE[step]}
            </Button>
          </div>
        </Card>
        <div className={styles.side}>
          {step === 2 ? <UsesPanel /> : null}
          {step >= 1 ? <SoFarPanel draft={draft} /> : null}
          <WhenYouFinish />
        </div>
      </div>
    </>
  );
}
```

`apps/web/src/components/onboarding/onboarding.module.css` (mockup 09):

```css
.stepper {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 28px;
  margin: 2px 0 18px;
  list-style: none;
}

.stp {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.n {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1.5px solid #b9bfc8;
  border-radius: 50%;
  background: var(--card);
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.n svg {
  width: 15px;
  height: 15px;
}

.done .n {
  border-color: var(--navy);
  background: var(--navy);
  color: #fff;
}

.now .n {
  border-color: var(--navy);
  box-shadow: 0 0 0 4px var(--navy-soft);
  color: var(--navy);
}

.l {
  padding-top: 1px;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.25;
}

.l span {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}

.later .l {
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;
  align-items: start;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.h1 {
  margin-top: 8px;
  font-size: 26px;
}

.sub {
  max-width: 640px;
  margin-top: 5px;
  color: var(--muted);
}

.body {
  margin-top: 16px;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.fields > :global(*) {
  min-width: 0;
}

.optins {
  display: flex;
  flex-direction: column;
}

.optin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
}

.file {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.label {
  margin-bottom: 6px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.hint {
  font-size: 12.5px;
  color: var(--muted);
}

.small {
  margin-top: 6px;
  font-size: 12.5px;
}

.note {
  grid-column: 1 / -1;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 13px;
}

.error {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.search {
  display: flex;
  grid-column: 1 / -1;
  align-items: flex-end;
  gap: 10px;
}

.search > :first-child {
  flex: 1;
}

.list {
  display: flex;
  grid-column: 1 / -1;
  flex-direction: column;
}

.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.list li:first-child {
  border-top: 0;
}

.foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.spacer {
  flex: 1;
}

.tline {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 6px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.tline:first-of-type {
  border-top: 0;
}

.tline svg {
  margin-top: 2px;
  color: var(--good);
}

.kv {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.kv:first-of-type {
  border-top: 0;
}

.kv > span {
  color: var(--muted);
}

.kv > b {
  font-weight: 600;
}

.blocked {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
}

.blocked > a {
  align-self: flex-start;
}

@media (max-width: 1000px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .stepper {
    gap: 10px 16px;
  }
}
```

`apps/web/src/app/(app)/onboarding/page.tsx`:

```tsx
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { loadMe } from "@/lib/pageActor";
import { requirePageActor } from "@/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const actor = await requirePageActor();
  if (actor.role !== "student") redirect("/week");
  const me = await loadMe(actor.userId, actor.role);
  if (me.onboardingComplete) redirect("/week");
  return (
    <OnboardingWizard
      initialName={me.user.displayName}
      initialTimeZone={me.user.timeZone}
      nowIso={new Date().toISOString()}
    />
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/onboarding && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 17 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding "apps/web/src/app/(app)/onboarding/page.tsx"
git commit -m "feat(web): five-step onboarding with age gate, opt-ins, uploads, and colleges"
```

### P16: Settings cards: account, notifications, plan and usage (NO-04, NO-05 SMS setting (R3), BI-01..BI-05)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/settings/cards.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { BillingView, NotificationPrefs, Profile } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountCard } from "./AccountCard";
import { NotificationsCard, hourLabel } from "./NotificationsCard";
import { PlanCard, resetLabel } from "./PlanCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const prefs: NotificationPrefs = {
  digestDay: 0,
  digestHour: 16,
  emailEnabled: true,
  smsEnabled: false,
  phoneSet: false,
  quietStartHour: 21,
  quietEndHour: 7,
};

const billing = (o: Partial<BillingView["subscription"]> = {}): BillingView => ({
  subscription: { plan: "free", status: "active", currentPeriodEnd: null, managedByStripe: false, sponsor: null, ...o },
  usage: { month: "2026-10", crewRequests: 12, limit: 20, costMicros: 0 },
});

/** PATCH /profile returns the saved Profile (R3A-18). */
const profile: Profile = {
  userId: "11111111-1111-4111-8111-111111111111",
  classYear: 2027,
  highSchool: "Maple High School",
  state: "TX",
  county: "Maple",
  city: "",
  gpaUnweighted: 3.72,
  gpaWeighted: null,
  intendedMajors: [],
  interests: [],
  onboardingCompletedAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-06T15:00:00.000Z",
};

describe("helpers", () => {
  it("labels hours and the usage reset date", () => {
    expect(hourLabel(0)).toBe("12 a.m.");
    expect(hourLabel(12)).toBe("12 p.m.");
    expect(hourLabel(16)).toBe("4 p.m.");
    expect(hourLabel(21)).toBe("9 p.m.");
    expect(resetLabel("2026-10")).toBe("Nov 1");
    expect(resetLabel("2026-12")).toBe("Jan 1");
  });
});

describe("AccountCard", () => {
  it("signs out everywhere through the dedicated route", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountCard displayName="Maya" email="maya@example.test" timeZone="America/Chicago" roleLine="Student" editable={true} navigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/sign-out-all"));
  });

  it("saves the display name and time zone", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(profile));
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountCard displayName="Maya R." email="maya@example.test" timeZone="America/Chicago" roleLine="Student · Maple High School" editable />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Maya Rivera" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/Denver" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/profile");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Maya Rivera", timeZone: "America/Denver" }),
    });
  });

  it("lets a parent set a first name and time zone (R2I-3)", async () => {
    // 06 updateProfile creates a blank profile row when there is none, so a parent also gets a Profile back.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ ...profile, classYear: null, highSchool: "", state: "", county: "", gpaUnweighted: null, onboardingCompletedAt: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountCard displayName="" email="dana@example.test" timeZone="America/Chicago" roleLine="Parent" editable />);
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Dana Rivera " } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/New_York" } });
    fireEvent.click(save);
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Dana Rivera", timeZone: "America/New_York" }),
    });
    expect(screen.getByText("Parent")).toBeTruthy();
  });

  it("stays put and shows the message when sign-out fails, and leaves on success or a dead session (R3A-13)", async () => {
    const navigate = vi.fn();
    let status = 500;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        status === 204
          ? new Response(null, { status: 204 })
          : status === 401
            ? json({ error: { code: "unauthenticated", message: "Sign in again" } }, 401)
            : json({ error: { code: "internal", message: "Something went wrong" } }, 500),
      ),
    );
    render(<AccountCard displayName="Maya R." email="maya@example.test" timeZone="America/Chicago" roleLine="Student" editable navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong");
    expect(navigate).not.toHaveBeenCalled();
    status = 401;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in"));
    navigate.mockClear();
    status = 204;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("NotificationsCard", () => {
  it("saves each change right away (NO-04)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({ ...prefs, ...JSON.parse(String(init?.body)) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    expect(screen.getByRole("button", { name: "Sun" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Wed" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Wed" }).getAttribute("aria-pressed")).toBe("true"));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"digestDay":3}' });
    fireEvent.click(screen.getByRole("switch", { name: "Email me (digest, deadline reminders, new matches)" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"emailEnabled":false}');
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "22" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe('{"quietStartHour":22}');
    expect(screen.getByText("Emails never include sensitive facts or essays.")).toBeTruthy();
  });

  it("turning email off shows the deadline reminders as off, in the app only (R2I-8)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({ ...prefs, ...JSON.parse(String(init?.body)) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("7, 3, and 1 day before")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Email me (digest, deadline reminders, new matches)" }));
    await waitFor(() => expect(screen.getByText("In the app only")).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"emailEnabled":false}');
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByText("On")).toBeNull();
    expect(screen.queryByText("7, 3, and 1 day before")).toBeNull();
  });

  it("needs a valid phone number before text reminders can switch on (NO-05, R3)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const patch = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const { phone, ...rest } = patch;
      return json({ ...prefs, phoneSet: phone !== undefined ? phone !== null : true, ...rest });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationsCard prefs={prefs} timeZone="America/Chicago" />);
    const sms = screen.getByRole("switch", { name: "Text me 1-day reminders" }) as HTMLButtonElement;
    expect(sms.disabled).toBe(true);
    expect(screen.getByText("Add a phone number first")).toBeTruthy();
    expect(screen.getByText("Texts wait until your quiet hours end.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "512-555-0123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    expect(screen.getByText("Use the format +15125550123")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+15125550123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    await waitFor(() => expect((screen.getByRole("switch", { name: "Text me 1-day reminders" }) as HTMLButtonElement).disabled).toBe(false));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"phone":"+15125550123"}');
    fireEvent.click(screen.getByRole("switch", { name: "Text me 1-day reminders" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"smsEnabled":true}');
  });
});

describe("PlanCard", () => {
  it("shows usage and starts checkout for a free plan", async () => {
    const navigate = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => json({ url: "https://checkout.stripe.test/session" })));
    render(<PlanCard billing={billing()} navigate={navigate} />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("of 20")).toBeTruthy();
    expect(screen.getByText("Resets Nov 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get the Family plan" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.test/session"));
  });

  it("opens the Stripe portal for paid plans and redeems sponsor codes", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/portal") ? json({ url: "https://billing.stripe.test/portal" }) : json(billing().subscription),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanCard billing={billing({ plan: "family", managedByStripe: true })} navigate={navigate} />);
    expect(screen.queryByRole("button", { name: "Get the Family plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://billing.stripe.test/portal"));
    fireEvent.change(screen.getByLabelText("Sponsor code"), { target: { value: "MAPLE-2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    expect(await screen.findByText("Code applied.")).toBeTruthy();
    expect(fetchMock.mock.calls.find(([url]) => url === "/api/v1/billing/sponsor-code")?.[1]?.body).toBe('{"code":"MAPLE-2027"}');
    expect(router.refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/settings`
Expected: FAIL with `Failed to resolve import "./AccountCard"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/settings/AccountCard.tsx`:

```tsx
"use client";

import { ApiError, api, errorMessage } from "@/lib/api";
import { TIME_ZONES, timeZoneLabel } from "@/lib/time";
import type { Profile } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

export function AccountCard({
  displayName,
  email,
  timeZone,
  roleLine,
  editable,
  navigate = (url: string) => window.location.assign(url),
}: {
  displayName: string;
  email: string;
  timeZone: string;
  roleLine: string;
  editable: boolean;
  navigate?: (url: string) => void;
}) {
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timeZone);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await api<Profile>("/profile", { method: "PATCH", body: { displayName: name.trim(), timeZone: zone } });
      setStatus("Saved");
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(everywhere = false) {
    setSignOutError(null);
    try {
      await api(everywhere ? "/auth/sign-out-all" : "/auth/sign-out", { method: "POST" });
    } catch (e) {
      // R3A-13: 13 always clears the cookie on 204. Leave only when that happened, or when the
      // session is already gone; otherwise the session is still live, so stay and say why.
      if (!(e instanceof ApiError && e.code === "unauthenticated")) {
        setSignOutError(errorMessage(e));
        return;
      }
    }
    navigate("/sign-in");
  }

  return (
    <Card title="Account" aside={<Icon name="users" />}>
      {editable ? (
        <div className={styles.form}>
          <TextInput label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Select label="Time zone" options={TIME_ZONES} value={zone} onChange={(e) => setZone(e.target.value)} />
          <div className={styles.row}>
            <Button variant="primary" size="sm" disabled={busy || name.trim() === ""} onClick={() => void save()}>
              Save
            </Button>
            {status ? <span className={styles.muted}>{status}</span> : null}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.kv}>
            <span>Name</span>
            <b>{displayName}</b>
          </div>
          <div className={styles.kv}>
            <span>Time zone</span>
            <b>{timeZoneLabel(timeZone)}</b>
          </div>
        </>
      )}
      <div className={styles.kv}>
        <span>Email</span>
        <b>{email}</b>
      </div>
      <div className={styles.kv}>
        <span>Sign-in</span>
        <b>Email link · no password</b>
      </div>
      <div className={styles.kv}>
        <span>Account</span>
        <b>{roleLine}</b>
      </div>
      <Button variant="line" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
      <Button variant="line" size="sm" onClick={() => void signOut(true)}>Sign out everywhere</Button>
      {signOutError ? (
        <p className={styles.error} role="alert">
          {signOutError}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/settings/NotificationsCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { timeZoneLabel } from "@/lib/time";
import type { NotificationPrefs, NotificationPrefsPatch } from "@scholarcrew/domain";
import { Badge, Button, Card, Icon, Select, StatusPill, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** E.164, the same rule as NotificationPrefsPatch.phone. */
const PHONE = /^\+[1-9]\d{7,14}$/;

export function hourLabel(h: number): string {
  const suffix = h < 12 ? "a.m." : "p.m.";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }));

/**
 * NO-04: digest day and hour, email on or off, quiet hours. The one email switch is `emailEnabled`, which gates
 * every email (digest, deadline reminders, new matches), so it's labeled that way, and the reminders row reads
 * Off, "In the app only", while it's off (R2I-8). NO-05 (R3): a mobile number and opt-in 1-day SMS reminders,
 * which stay off until a number is saved and wait out quiet hours (R2I-9). Each change saves right away.
 */
export function NotificationsCard({ prefs, timeZone }: { prefs: NotificationPrefs; timeZone: string }) {
  const [current, setCurrent] = useState(prefs);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);

  async function save(patch: NotificationPrefsPatch): Promise<boolean> {
    const before = current;
    const { phone: _phone, ...shown } = patch;
    setCurrent({ ...current, ...shown });
    setError(null);
    try {
      setCurrent(await api<NotificationPrefs>("/notification-prefs", { method: "PATCH", body: patch }));
      return true;
    } catch (e) {
      setCurrent(before);
      setError(errorMessage(e));
      return false;
    }
  }

  async function savePhone() {
    const value = phone.trim();
    if (!PHONE.test(value)) {
      setPhoneError("Use the format +15125550123");
      return;
    }
    setPhoneError(undefined);
    if (await save({ phone: value })) setPhone("");
  }

  return (
    <Card title="Notifications" aside={<Icon name="bell" />}>
      <p className={styles.setL}>Weekly digest day</p>
      <div className={styles.days}>
        {DAYS.map((day, n) => (
          <button
            key={day}
            type="button"
            className={cx(styles.day, current.digestDay === n && styles.dayOn)}
            aria-pressed={current.digestDay === n}
            onClick={() => void save({ digestDay: n })}
          >
            {day}
          </button>
        ))}
      </div>
      <Select
        label="Digest time"
        options={HOURS}
        value={String(current.digestHour)}
        onChange={(e) => void save({ digestHour: Number(e.target.value) })}
      />
      <Toggle
        checked={current.emailEnabled}
        label="Email me (digest, deadline reminders, new matches)"
        detail="The digest is skipped when there's nothing new"
        onChange={(emailEnabled) => void save({ emailEnabled })}
      />
      <div className={styles.trow}>
        <span className={styles.tl}>
          Deadline reminders
          <span className={styles.sub2}>{current.emailEnabled ? "7, 3, and 1 day before" : "In the app only"}</span>
        </span>
        {current.emailEnabled ? <StatusPill status="on" /> : <Badge tone="neutral">Off</Badge>}
      </div>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          void savePhone();
        }}
      >
        <TextInput
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={current.phoneSet ? "Saved · enter a new number to change it" : "+15125550123"}
          value={phone}
          maxLength={16}
          error={phoneError}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button variant="line" size="sm" type="submit" disabled={phone.trim() === ""}>
          Save number
        </Button>
      </form>
      <Toggle
        checked={current.smsEnabled}
        label="Text me 1-day reminders"
        detail={current.phoneSet ? "Only the day before a deadline, never in quiet hours" : "Add a phone number first"}
        disabled={!current.phoneSet}
        onChange={(smsEnabled) => void save({ smsEnabled })}
      />
      <p className={styles.muted}>Texts wait until your quiet hours end.</p>
      <p className={styles.setL}>Quiet hours</p>
      <div className={styles.times}>
        <Select
          label="Quiet hours start"
          options={HOURS}
          value={String(current.quietStartHour)}
          onChange={(e) => void save({ quietStartHour: Number(e.target.value) })}
        />
        <span>to</span>
        <Select
          label="Quiet hours end"
          options={HOURS}
          value={String(current.quietEndHour)}
          onChange={(e) => void save({ quietEndHour: Number(e.target.value) })}
        />
        <span className={styles.muted}>{timeZoneLabel(timeZone)}</span>
      </div>
      <p className={styles.muted}>Emails never include sensitive facts or essays.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/settings/PlanCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { dateShort, instantShort } from "@/lib/format";
import type { BillingView, PlanId, Subscription } from "@scholarcrew/domain";
import { Badge, Button, Card, Progress, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

const PLANS: Array<{ id: PlanId; name: string; price: string; detail: string }> = [
  { id: "free", name: "Free", price: "$0", detail: "20 crew requests a month · matches, board, calendar, Story Bank" },
  { id: "family", name: "Family plan", price: "$12/mo", detail: "300 a month · 1 student and up to 2 parents" },
  { id: "season_pass", name: "Season pass", price: "$79 once", detail: "August to May · same limits as the Family plan" },
];

/** "2026-10" → "Nov 1": usage counters reset on the first of next month. */
export function resetLabel(month: string): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return dateShort(next);
}

export function PlanCard({
  billing,
  navigate = (url: string) => window.location.assign(url),
}: {
  billing: BillingView;
  navigate?: (url: string) => void;
}) {
  const router = useRouter();
  const { subscription: sub, usage } = billing;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const current = PLANS.find((p) => p.id === sub.plan) ?? PLANS[0];
  const left = Math.max(0, usage.limit - usage.crewRequests);
  const reset = resetLabel(usage.month);

  async function go(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST", body });
      navigate(url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function redeem() {
    setCodeStatus(null);
    try {
      await api<Subscription>("/billing/sponsor-code", { method: "POST", body: { code: code.trim() } });
      setCodeStatus("Code applied.");
      setCode("");
      router.refresh();
    } catch (e) {
      setCodeStatus(errorMessage(e));
    }
  }

  return (
    <Card title="Plan and usage" aside={sub.sponsor ? <Badge tone="navy">{`Sponsored by ${sub.sponsor}`}</Badge> : undefined}>
      <h2 className={styles.planName}>{current?.name}</h2>
      <p className={styles.muted}>
        {sub.plan === "free"
          ? "Free forever"
          : `${current?.price} (test price)${sub.currentPeriodEnd ? ` · ${sub.plan === "season_pass" ? "ends" : "renews"} ${instantShort(sub.currentPeriodEnd, "UTC")}` : ""}`}
        {sub.status === "past_due" ? " · payment past due" : ""}
      </p>
      <div className={styles.divider} />
      <div className={styles.usageRow}>
        <div>
          <p className={styles.setL}>Crew requests this month</p>
          <p className={styles.usageNum}>
            <span>{usage.crewRequests}</span> <small>{`of ${usage.limit}`}</small>
          </p>
        </div>
        <span className={styles.muted}>{`Resets ${reset}`}</span>
      </div>
      <Progress value={usage.limit > 0 ? usage.crewRequests / usage.limit : 1} label="Crew requests used this month" />
      <p className={styles.muted}>
        {`Used ${usage.crewRequests} · left ${left}. At ${usage.limit}, crew chat pauses until ${reset}. Your board, essays, calendar, and Memory keep working.`}
      </p>
      <div className={styles.divider} />
      <ul className={styles.plans}>
        {PLANS.map((p) => (
          <li key={p.id} className={cx(p.id === sub.plan && styles.cur)}>
            <b>
              {p.name} {p.id === sub.plan ? <Badge tone="navy">Current</Badge> : null}
            </b>
            <span className={styles.pp}>{p.price}</span>
            <span className={styles.pd}>{p.detail}</span>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>Test prices, not final.</p>
      <div className={styles.row}>
        {sub.managedByStripe ? (
          <Button variant="line" size="sm" disabled={busy} onClick={() => void go("/billing/portal")}>
            Manage billing
          </Button>
        ) : null}
        {sub.plan === "free" ? (
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void go("/billing/checkout", { plan: "family" })}>
              Get the Family plan
            </Button>
            <Button variant="line" size="sm" disabled={busy} onClick={() => void go("/billing/checkout", { plan: "season_pass" })}>
              Buy a season pass
            </Button>
          </>
        ) : null}
      </div>
      <p className={styles.lockline}>Paying for a plan doesn't unlock anyone's essays, chats, or sensitive facts.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4) void redeem();
        }}
      >
        <TextInput label="Sponsor code" hint="From your school or a nonprofit" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
        <Button variant="line" size="sm" type="submit" disabled={code.trim().length < 4}>
          Redeem
        </Button>
      </form>
      {codeStatus ? <p className={styles.muted}>{codeStatus}</p> : null}
    </Card>
  );
}
```

`apps/web/src/components/settings/settings.module.css` (mockup 13):

```css
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.sub {
  margin-top: 5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.inline {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.inline > :first-child {
  flex: 1;
}

.muted {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--muted);
}

.error {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.kv {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
  padding: 7px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.kv > span {
  color: var(--muted);
}

.kv > b {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.setL {
  margin-top: 10px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0 10px;
}

.day {
  display: grid;
  place-items: center;
  width: 38px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
}

.dayOn {
  border-color: var(--navy);
  background: var(--navy);
  color: #fff;
}

.trow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.tl {
  flex: 1;
}

.sub2 {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

.times {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}

.planName {
  font-size: 20px;
}

.divider {
  height: 1px;
  margin: 14px 0;
  background: var(--line-2);
}

.usageRow {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.usageNum {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

.usageNum small {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--muted);
}

.plans li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.plans li:first-child {
  border-top: 0;
}

.cur {
  margin: 0 -10px;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--navy-soft);
}

.pp {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.pd {
  grid-column: 1 / span 2;
  font-size: 12px;
  color: var(--muted);
}

.lockline {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 12.5px;
  color: var(--ink-2);
}

/* Stripe checkout return (R2I-19) */
.notice {
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--navy-line);
  border-radius: 10px;
  background: var(--navy-soft);
  font-size: 13.5px;
  color: var(--ink-2);
}

.token {
  padding: 4px 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--wash);
  font: 600 12.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.secret {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--navy-line);
  border-radius: 10px;
  background: var(--navy-soft);
  font-size: 13px;
}

.list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.list li:first-child {
  border-top: 0;
}

.crit {
  border-color: #f1c9c9;
  color: var(--crit-text);
}

@media (max-width: 1200px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/settings && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 1 file, 10 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings/AccountCard.tsx apps/web/src/components/settings/NotificationsCard.tsx apps/web/src/components/settings/PlanCard.tsx apps/web/src/components/settings/settings.module.css apps/web/src/components/settings/cards.test.tsx
git commit -m "feat(web): settings cards for account, notifications, plan and usage"
```

### P17: Settings: extension tokens, documents, export, delete account, and the page (ID-05, ME-08, ME-09, ON-02, EX-01)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/settings/ExtensionTokens.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ApiToken } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionTokens } from "./ExtensionTokens";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const token = (o: Partial<ApiToken> = {}): ApiToken => ({
  id: "11111111-1111-4111-8111-111111114f2a",
  label: "Chrome on my laptop",
  scopes: ["autofill", "save_page"],
  expiresAt: "2027-04-04T15:00:00.000Z",
  createdAt: "2026-10-01T15:00:00.000Z",
  lastUsedAt: "2026-10-04T15:00:00.000Z",
  revokedAt: null,
  ...o,
});

/** The real secret format (06 F15): `sct_` + base64url. The list never shows any part of it after creation. */
const SECRET = "sct_q9f8e7d6c5b4a39281706ZxYwVuTsRqP";

describe("ExtensionTokens", () => {
  it("lists active tokens without secrets and hides revoked ones", () => {
    render(<ExtensionTokens tokens={[token(), token({ id: "22222222-2222-4222-8222-222222222222", label: "Old laptop", revokedAt: "2026-10-02T00:00:00.000Z" })]} timeZone="America/Chicago" />);
    expect(screen.getByText("Chrome on my laptop")).toBeTruthy();
    expect(screen.getByText("Connected Oct 1 · expires Apr 4 · last used Oct 4")).toBeTruthy();
    expect(screen.getByText("sct_••••")).toBeTruthy();
    expect(screen.queryByText(/4f2a/)).toBeNull();
    expect(screen.queryByText("Old laptop")).toBeNull();
  });

  it("shows a new secret once with a copy button", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const created = token({ id: "33333333-3333-4333-8333-333333339999", label: "Work Chromebook", lastUsedAt: null });
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ token: created, secret: SECRET }), { status: 201, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtensionTokens tokens={[]} timeZone="America/Chicago" />);
    fireEvent.change(screen.getByLabelText("Browser name"), { target: { value: "Work Chromebook" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect a browser" }));
    expect(await screen.findByText(SECRET)).toBeTruthy();
    expect(screen.getByText("Copy this code into the extension now. You won't see it again.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ label: "Work Chromebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(SECRET)).toBeNull();
    expect(screen.getByText("Work Chromebook")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("disconnects a browser", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ExtensionTokens tokens={[token()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Chrome on my laptop" }));
    await waitFor(() => expect(screen.queryByText("Chrome on my laptop")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/extension/tokens/${token().id}`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
```

`apps/web/src/components/settings/DataCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { DocumentMeta, ExportRecord } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataCard } from "./DataCard";
import { DocumentsCard } from "./DocumentsCard";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const record = (o: Partial<ExportRecord> = {}): ExportRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "queued",
  createdAt: "2026-10-06T15:00:00.000Z",
  expiresAt: null,
  downloadUrl: null,
  ...o,
});

describe("DataCard export (ME-08)", () => {
  it("requests an export and shows that it's being prepared", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(record(), 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataCard latest={null} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Request export" }));
    expect(await screen.findByText(/usually ready in about 10 minutes/)).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account/export");
  });

  it("links a ready export as JSON and Markdown and marks an old one expired", () => {
    const ready = record({ status: "ready", expiresAt: "2026-10-07T15:00:00.000Z", downloadUrl: "/api/v1/account/exports/x" });
    const { unmount } = render(<DataCard latest={ready} timeZone="America/Chicago" nowIso="2026-10-06T16:00:00.000Z" />);
    expect(screen.getByRole("link", { name: "Download export" }).getAttribute("href")).toBe("/api/v1/account/exports/x");
    // R3E-11: the Markdown copy is its own download of the same export.
    expect(screen.getByRole("link", { name: "Download as Markdown" }).getAttribute("href")).toBe(
      "/api/v1/account/exports/11111111-1111-4111-8111-111111111111?format=md",
    );
    unmount();
    render(<DataCard latest={ready} timeZone="America/Chicago" nowIso="2026-10-08T16:00:00.000Z" />);
    expect(screen.getByText("Last: Oct 6 · link expired")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Download export" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download as Markdown" })).toBeNull();
  });

  it("checks a queued export again through GET /account/exports/latest (D27)", async () => {
    const ready = record({ status: "ready", expiresAt: "2026-10-07T15:00:00.000Z", downloadUrl: "/api/v1/account/exports/x" });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(ready));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataCard latest={record()} timeZone="America/Chicago" nowIso="2026-10-06T15:30:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("link", { name: "Download export" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account/exports/latest");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});

describe("DataCard delete account (ID-05)", () => {
  it("needs DELETE typed before it deletes, then leaves", async () => {
    const onDeleted = vi.fn();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataCard latest={null} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    const confirm = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/account");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});

describe("DocumentsCard (ON-02)", () => {
  it("lists documents with download links and deletes them", async () => {
    const doc: DocumentMeta = {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      sizeBytes: 240_000,
      parseStatus: "parsed",
      uploadedAt: "2026-09-12T15:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    render(<DocumentsCard documents={[doc]} timeZone="America/Chicago" />);
    expect(screen.getByRole("link", { name: "Download transcript.pdf" }).getAttribute("href")).toBe(
      "/api/v1/documents/22222222-2222-4222-8222-222222222222/download",
    );
    expect(screen.getByText("Transcript · 234 KB · Sep 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete transcript.pdf" }));
    await waitFor(() => expect(screen.queryByText("transcript.pdf")).toBeNull());
  });
});
```

`apps/web/src/components/settings/SettingsPage.test.tsx` (the Stripe return notice, plus the page rendered with core mocked):

```tsx
// @vitest-environment jsdom
import SettingsPage from "@/app/(app)/settings/page";
import type { BillingView, MeResponse, NotificationPrefs, PlanId } from "@scholarcrew/domain";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingReturnNotice } from "./BillingReturnNotice";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getPrefs: vi.fn(),
  getSubscription: vi.fn(),
  getUsage: vi.fn(),
  listApiTokens: vi.fn(),
  listDocuments: vi.fn(),
  latestExport: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/notifications", () => ({ getPrefs: m.getPrefs }));
vi.mock("@scholarcrew/core/billing", () => ({ getSubscription: m.getSubscription, getUsage: m.getUsage }));
vi.mock("@scholarcrew/core/apitokens", () => ({ listApiTokens: m.listApiTokens }));
vi.mock("@scholarcrew/core/documents", () => ({ listDocuments: m.listDocuments }));
vi.mock("@scholarcrew/core/account", () => ({ latestExport: m.latestExport }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/settings" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const billing = (plan: PlanId): BillingView => ({
  subscription: { plan, status: "active", currentPeriodEnd: null, managedByStripe: plan !== "free", sponsor: null },
  usage: { month: "2026-10", crewRequests: 3, limit: plan === "free" ? 20 : 300, costMicros: 0 },
});

describe("BillingReturnNotice (R2I-19)", () => {
  it("after checkout, polls GET /billing until the plan changes, then refreshes and stops", async () => {
    const plans: PlanId[] = ["free", "family"];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing(plans.shift() ?? "family")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="success" pollMs={5} />);
    expect(screen.getByRole("status").textContent).toBe("Payment received. Your plan updates in a minute.");
    await waitFor(() => expect(m.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/billing");
    expect(screen.getByRole("status").textContent).toBe("Payment received. Your plan is updated.");
    await pause(40);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after five checks while the plan still reads free", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing("free")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="success" pollMs={5} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await pause(40);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(m.router.refresh).not.toHaveBeenCalled();
  });

  it("says checkout was canceled and never polls", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(billing("free")));
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingReturnNotice status="cancel" pollMs={5} />);
    expect(screen.getByRole("status").textContent).toBe("Checkout canceled.");
    await pause(40);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Settings page", () => {
  const prefs: NotificationPrefs = {
    digestDay: 0,
    digestHour: 16,
    emailEnabled: true,
    smsEnabled: false,
    phoneSet: false,
    quietStartHour: 21,
    quietEndHour: 7,
  };

  function signedInAs(role: "student" | "parent") {
    const id = role === "student" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222";
    const me: MeResponse = {
      user: {
        id,
        email: `${role}@example.test`,
        displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
        role,
        birthYear: null,
        timeZone: "America/Chicago",
        status: "active",
        createdAt: "2026-10-01T15:00:00.000Z",
      },
      profile: null,
      onboardingComplete: true,
      family: null,
      plan: "free",
    };
    m.requireAppActor.mockResolvedValue({ actor: { kind: "user", userId: id, role }, me, deps: {} });
    m.getPrefs.mockResolvedValue(prefs);
    m.getSubscription.mockResolvedValue(billing("free").subscription);
    m.getUsage.mockResolvedValue(billing("free").usage);
    m.listApiTokens.mockResolvedValue([]);
    m.listDocuments.mockResolvedValue([]);
    m.latestExport.mockResolvedValue(null);
  }

  it("gives parents an editable name and time zone, and no extension card (R2I-3)", async () => {
    signedInAs("parent");
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Dana Rivera");
    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("America/Chicago");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.queryByText("Browser extension")).toBeNull();
    expect(m.listApiTokens).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the checkout notice from ?billing= and ignores other values (R2I-19)", async () => {
    signedInAs("student");
    render(await SettingsPage({ searchParams: Promise.resolve({ billing: "cancel" }) }));
    expect(screen.getByRole("status").textContent).toBe("Checkout canceled.");
    cleanup();
    render(await SettingsPage({ searchParams: Promise.resolve({ billing: "maybe" }) }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/settings`
Expected: FAIL with `Failed to resolve import "./ExtensionTokens"`, `"./DataCard"`, `"./DocumentsCard"`, and `"./BillingReturnNotice"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/settings/ExtensionTokens.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { ApiToken, ApiTokenCreated } from "@scholarcrew/domain";
import { Badge, Button, Card, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

/** EX-01: connect the browser extension. The secret is shown once and never stored in the page. */
export function ExtensionTokens({ tokens: initial, timeZone }: { tokens: ApiToken[]; timeZone: string }) {
  const [tokens, setTokens] = useState(initial.filter((t) => t.revokedAt === null));
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<ApiTokenCreated>("/extension/tokens", { method: "POST", body: { label: label.trim() } });
      setTokens((t) => [res.token, ...t]);
      setSecret(res.secret);
      setCopied(false);
      setLabel("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: ApiToken) {
    setError(null);
    try {
      await api(`/extension/tokens/${t.id}`, { method: "DELETE" });
      setTokens((list) => list.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy didn't work. Select the code and copy it yourself.");
    }
  }

  return (
    <Card title="Browser extension" aside={tokens.length > 0 ? <Badge tone="good">Connected</Badge> : undefined}>
      {tokens.length > 0 ? (
        <ul className={styles.list}>
          {tokens.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.label}</b>
                <p className={styles.muted}>
                  {`Connected ${instantShort(t.createdAt, timeZone)} · expires ${instantShort(t.expiresAt, timeZone)}${t.lastUsedAt ? ` · last used ${instantShort(t.lastUsedAt, timeZone)}` : " · not used yet"}`}
                </p>
                {/* R2I-20: the secret's prefix only; the id has nothing to do with the secret. */}
                <span className={styles.token}>sct_••••</span>
              </div>
              <Button variant="line" size="sm" className={styles.crit} aria-label={`Disconnect ${t.label}`} onClick={() => void revoke(t)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No browsers connected.</p>
      )}
      {secret ? (
        <div className={styles.secret}>
          <p>Copy this code into the extension now. You won't see it again.</p>
          <code className={styles.token}>{secret}</code>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={() => void copy(secret)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="line" size="sm" onClick={() => setSecret(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      <p className={styles.muted}>
        Suggests answers from your profile on scholarship forms. You check each one; it never clicks submit.
      </p>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void create();
        }}
      >
        <TextInput label="Browser name" placeholder="Chrome on my laptop" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <Button variant="line" size="sm" type="submit" disabled={busy || label.trim() === ""}>
          Connect a browser
        </Button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/settings/DocumentsCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { DocumentKind, DocumentMeta } from "@scholarcrew/domain";
import { Button, Card, Icon } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

const KIND_LABELS: Record<DocumentKind, string> = {
  award_letter: "Award letter",
  transcript: "Transcript",
  score_report: "Score report",
  essay: "Essay",
  resume: "Resume",
  other: "Document",
};

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** ON-02: uploads are encrypted at rest and listed here for download or deletion. */
export function DocumentsCard({ documents, timeZone }: { documents: DocumentMeta[]; timeZone: string }) {
  const [docs, setDocs] = useState(documents);
  const [error, setError] = useState<string | null>(null);

  async function remove(d: DocumentMeta) {
    setError(null);
    try {
      await api(`/documents/${d.id}`, { method: "DELETE" });
      setDocs((list) => list.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Documents" aside={<Icon name="doc" />}>
      {docs.length === 0 ? (
        <p className={styles.muted}>Nothing uploaded yet. Transcripts, award letters, and past essays show up here.</p>
      ) : (
        <ul className={styles.list}>
          {docs.map((d) => (
            <li key={d.id}>
              <div>
                <a href={`/api/v1/documents/${d.id}/download`} aria-label={`Download ${d.filename}`}>
                  {d.filename}
                </a>
                <p className={styles.muted}>{`${KIND_LABELS[d.kind]} · ${sizeLabel(d.sizeBytes)} · ${instantShort(d.uploadedAt, timeZone)}`}</p>
              </div>
              <Button variant="line" size="sm" className={styles.crit} aria-label={`Delete ${d.filename}`} onClick={() => void remove(d)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/settings/DataCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { ExportRecord } from "@scholarcrew/domain";
import { Button, Card, Icon, Modal, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

/** R3E-11: 13 M14 serves the same export's Markdown as its own download. */
export function markdownExportUrl(id: string): string {
  return `/api/v1/account/exports/${id}?format=md`;
}

function exportLine(
  r: ExportRecord,
  now: Date,
  timeZone: string,
): { text: string; href: string | null; markdownHref: string | null } {
  const made = instantShort(r.createdAt, timeZone);
  if (r.status === "queued") return { text: "Preparing your export. It's usually ready in about 10 minutes.", href: null, markdownHref: null };
  if (r.status === "failed") return { text: `Last: ${made} · that export failed. Request a new one.`, href: null, markdownHref: null };
  if (!r.downloadUrl || (r.expiresAt && new Date(r.expiresAt) <= now)) {
    return { text: `Last: ${made} · link expired`, href: null, markdownHref: null };
  }
  return {
    text: `Ready ${made}${r.expiresAt ? ` · link works until ${instantShort(r.expiresAt, timeZone)}` : ""}`,
    href: r.downloadUrl,
    markdownHref: markdownExportUrl(r.id),
  };
}

/** ME-08 export and ID-05/ME-09 delete account. */
export function DataCard({
  latest,
  timeZone,
  nowIso,
  onDeleted = () => window.location.assign("/"),
}: {
  latest: ExportRecord | null;
  timeZone: string;
  nowIso: string;
  onDeleted?: () => void;
}) {
  const [record, setRecord] = useState(latest);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const line = record ? exportLine(record, new Date(nowIso), timeZone) : null;

  async function requestExport() {
    setError(null);
    try {
      setRecord(await api<ExportRecord>("/account/export", { method: "POST" }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** D27: GET /account/exports/latest returns the newest unexpired export, or null. */
  async function checkAgain() {
    setError(null);
    try {
      setRecord(await api<ExportRecord | null>("/account/exports/latest"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await api("/account", { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <div id="data">
      <Card title="Your data" aside={<Icon name="lock" />}>
        <p className={styles.setL}>Export everything</p>
        <p className={styles.muted}>
          JSON and Markdown copies of your profile, essays, stories, and records. Ready in about 10 minutes; the link lasts
          24 hours.
        </p>
        <div className={styles.row}>
          <Button variant="line" size="sm" disabled={record?.status === "queued"} onClick={() => void requestExport()}>
            Request export
          </Button>
          {record?.status === "queued" ? (
            <Button variant="line" size="sm" onClick={() => void checkAgain()}>
              Check again
            </Button>
          ) : null}
        </div>
        {line ? (
          <p className={styles.muted}>
            {line.href ? (
              <>
                <a href={line.href}>Download export</a>
                {" · "}
              </>
            ) : null}
            {line.markdownHref ? (
              <>
                <a href={line.markdownHref}>Download as Markdown</a>
                {" · "}
              </>
            ) : null}
            {line.text}
          </p>
        ) : null}
        <div className={styles.divider} />
        <div id="delete">
          <p className={styles.setL}>Delete account</p>
          <p className={styles.muted}>
            Signs you out everywhere and hides your data right away. It's permanently deleted within 7 days. Things you
            shared in the family room are removed too. Exports you already downloaded can't be recalled.
          </p>
          <Button variant="line" size="sm" className={styles.crit} onClick={() => setConfirming(true)}>
            Delete my account…
          </Button>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      <Modal
        open={confirming}
        title="Delete your account?"
        onClose={() => {
          setConfirming(false);
          setTyped("");
        }}
        footer={
          <Button variant="line" className={styles.crit} disabled={typed !== "DELETE" || deleting} onClick={() => void deleteAccount()}>
            Delete account
          </Button>
        }
      >
        <p>This signs you out on every device and can't be undone after 7 days.</p>
        <TextInput label="Type DELETE to confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </div>
  );
}
```

`apps/web/src/components/settings/BillingReturnNotice.tsx` (R2I-19: Stripe sends the student back to `/settings?billing=success|cancel`, often before the webhook lands):

```tsx
"use client";

import { api } from "@/lib/api";
import type { BillingView } from "@scholarcrew/domain";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./settings.module.css";

export const BILLING_POLL_MS = 3000;
export const BILLING_MAX_POLLS = 5;

/**
 * After a successful checkout, checks GET /billing every `pollMs` (3 s), at most `maxPolls` (5) times, and
 * refreshes the page once the plan isn't "free". A failed check counts as one try. `pollMs` and `maxPolls`
 * exist for tests.
 */
export function BillingReturnNotice({
  status,
  pollMs = BILLING_POLL_MS,
  maxPolls = BILLING_MAX_POLLS,
}: {
  status: "success" | "cancel";
  pollMs?: number;
  maxPolls?: number;
}) {
  const router = useRouter();
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (status !== "success") return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      timer = null;
      tries += 1;
      try {
        const billing = await api<BillingView>("/billing");
        if (stopped) return;
        if (billing.subscription.plan !== "free") {
          stopped = true;
          setUpdated(true);
          router.refresh();
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (tries < maxPolls) timer = setTimeout(() => void check(), pollMs);
    };
    timer = setTimeout(() => void check(), pollMs);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [status, pollMs, maxPolls, router]);

  const text =
    status === "cancel"
      ? "Checkout canceled."
      : updated
        ? "Payment received. Your plan is updated."
        : "Payment received. Your plan updates in a minute.";
  return (
    <p className={styles.notice} role="status">
      {text}
    </p>
  );
}
```

`apps/web/src/app/(app)/settings/page.tsx` (D27: `listDocuments` and `latestExport` are the core services behind `GET /documents` and `GET /account/exports/latest`; R2I-19: reads `?billing=`):

```tsx
import { AccountCard } from "@/components/settings/AccountCard";
import { BillingReturnNotice } from "@/components/settings/BillingReturnNotice";
import { DataCard } from "@/components/settings/DataCard";
import { DocumentsCard } from "@/components/settings/DocumentsCard";
import { ExtensionTokens } from "@/components/settings/ExtensionTokens";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { PlanCard } from "@/components/settings/PlanCard";
import styles from "@/components/settings/settings.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { latestExport } from "@scholarcrew/core/account";
import { listApiTokens } from "@scholarcrew/core/apitokens";
import { getSubscription, getUsage } from "@scholarcrew/core/billing";
import { listDocuments } from "@scholarcrew/core/documents";
import { getPrefs } from "@scholarcrew/core/notifications";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isStudent = me.user.role === "student";
  const isParent = me.user.role === "parent";
  const sp = await searchParams;
  const billingReturn = sp.billing === "success" || sp.billing === "cancel" ? sp.billing : null;
  const [prefs, subscription, usage, tokens, docs, latest] = await Promise.all([
    getPrefs(deps, actor),
    getSubscription(deps, actor),
    getUsage(deps, actor),
    isStudent ? listApiTokens(deps, actor) : Promise.resolve([]),
    listDocuments(deps, actor),
    latestExport(deps, actor),
  ]);
  const tz = me.user.timeZone;
  const roleLine = isStudent ? `Student${me.profile?.highSchool ? ` · ${me.profile.highSchool}` : ""}` : "Parent";

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Settings</h1>
          <p className={styles.sub}>Your account, reminders, plan, and data · changes save right away</p>
        </div>
        <div className={styles.row}>
          <Button variant="line" href="/privacy">
            Privacy policy
          </Button>
          <Button variant="line" href="/ai-policy">
            AI use policy
          </Button>
        </div>
      </div>
      {billingReturn ? <BillingReturnNotice status={billingReturn} /> : null}
      <div className={styles.grid}>
        <div className={styles.col}>
          {/* R2I-3: parents set their own name and time zone too (admins never reach (app) pages). The raw
              name, not displayNameOf's email fallback, so a parent with no name sees an empty field. */}
          <AccountCard
            displayName={me.user.displayName.trim()}
            email={me.user.email}
            timeZone={tz}
            roleLine={roleLine}
            editable={isStudent || isParent}
          />
          <NotificationsCard prefs={prefs} timeZone={tz} />
        </div>
        <div className={styles.col}>
          <PlanCard billing={{ subscription, usage }} />
        </div>
        <div className={styles.col}>
          {isStudent ? <ExtensionTokens tokens={tokens} timeZone={tz} /> : null}
          <DocumentsCard documents={docs} timeZone={tz} />
          <DataCard latest={latest} timeZone={tz} nowIso={new Date().toISOString()} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/settings && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 4 files, 23 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "feat(web): settings page with extension tokens, documents, export, and account deletion"
```

### P18: Memory screen (ME-01..ME-09)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/memory/FactsCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { MemoryFact } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatesCard, FactsCard } from "./FactsCard";
import { factLabel, textToValue, visibilityOptionsFor } from "./labels";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/memory" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const fact = (o: Partial<MemoryFact> = {}): MemoryFact => ({
  id: "11111111-1111-4111-8111-111111111111",
  key: "intended_majors",
  value: ["Mechanical engineering"],
  valueText: "Mechanical engineering",
  source: "user_stated",
  sourceRef: null,
  visibility: "crew",
  status: "confirmed",
  createdAt: "2026-10-01T15:00:00.000Z",
  confirmedAt: "2026-10-01T15:00:00.000Z",
  expiresAt: null,
  ...o,
});

describe("labels", () => {
  it("humanizes keys and keeps value types when editing", () => {
    expect(factLabel("intended_majors")).toBe("Intended majors");
    expect(textToValue(["a"], "x, y")).toEqual(["x", "y"]);
    expect(textToValue(3, "4")).toBe(4);
    expect(textToValue(3, "four")).toBe("four");
    expect(textToValue(true, "no")).toBe(false);
    expect(textToValue("Maple", " Travis ")).toBe("Travis");
  });
});

describe("FactsCard (ME-01, ME-02)", () => {
  it("shows value, source with date, and who can use it", () => {
    render(<FactsCard facts={[fact(), fact({ id: "2", key: "county", value: "Maple", valueText: "Maple", visibility: "scout_only", source: "parent_shared" })]} timeZone="America/Chicago" />);
    expect(screen.getByText("Intended majors")).toBeTruthy();
    expect(screen.getByText("You · Oct 1")).toBeTruthy();
    expect(screen.getByText("Shared by family · Oct 1")).toBeTruthy();
    expect(screen.getByText("Scout only")).toBeTruthy();
  });

  it("edits a fact, replacing it with the new version", async () => {
    const updated = fact({ id: "33333333-3333-4333-8333-333333333333", value: ["Nursing"], valueText: "Nursing", visibility: "crew_family" });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(updated));
    vi.stubGlobal("fetch", fetchMock);
    render(<FactsCard facts={[fact()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Intended majors" }));
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Nursing" } });
    fireEvent.change(screen.getByLabelText("Who can use it"), { target: { value: "crew_family" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nursing")).toBeTruthy();
    expect(screen.getByText("Crew + family")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/facts/11111111-1111-4111-8111-111111111111");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ value: ["Nursing"], visibility: "crew_family" }),
    });
  });

  it("forgets a fact right away", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FactsCard facts={[fact()]} timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Forget Intended majors" }));
    await waitFor(() => expect(screen.queryByText("Mechanical engineering")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("offers Scout only just for the matcher's profile keys (R2I-10)", () => {
    const options = () => Array.from((screen.getByLabelText("Who can use it") as HTMLSelectElement).options).map((o) => o.text);
    render(
      <FactsCard
        facts={[fact(), fact({ id: "66666666-6666-4666-8666-666666666666", key: "distance_pref", value: "Within 3 hours", valueText: "Within 3 hours" })]}
        timeZone="America/Chicago"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Intended majors" }));
    expect(options()).toEqual(["Crew", "Crew + family", "Scout only", "Private"]);
    expect(screen.queryByText("Used for scholarship matching only")).toBeNull();
    fireEvent.change(screen.getByLabelText("Who can use it"), { target: { value: "scout_only" } });
    expect(screen.getByText("Used for scholarship matching only")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Distance pref" }));
    expect(options()).toEqual(["Crew", "Crew + family", "Private"]);
    expect(visibilityOptionsFor("county", "crew").map((o) => o.value)).toContain("scout_only");
    expect(visibilityOptionsFor("distance_pref", "scout_only").map((o) => o.value)).toContain("scout_only");
  });
});

describe("CandidatesCard (ME-03)", () => {
  it("confirms or rejects guesses", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => json(fact({ status: url.endsWith("/confirm") ? "confirmed" : "rejected" })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CandidatesCard
        candidates={[
          fact({ id: "44444444-4444-4444-8444-444444444444", status: "candidate", key: "possible_major", value: "Nursing", valueText: "Nursing" }),
          fact({ id: "55555555-5555-4555-8555-555555555555", status: "candidate", key: "distance_pref", value: "Within 3 hours", valueText: "Within 3 hours" }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remember Possible major" }));
    fireEvent.click(screen.getByRole("button", { name: "No to Distance pref" }));
    await waitFor(() => expect(screen.getByText(/Nothing waiting/)).toBeTruthy());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/facts/44444444-4444-4444-8444-444444444444/confirm",
      "/api/v1/facts/55555555-5555-4555-8555-555555555555/reject",
    ]);
  });
});
```

`apps/web/src/components/memory/SensitiveToggles.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { SensitiveFactSummary } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SensitiveToggles } from "./SensitiveToggles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const summary = (o: Partial<SensitiveFactSummary> & Pick<SensitiveFactSummary, "kind">): SensitiveFactSummary => ({
  enabled: false,
  hasValue: false,
  displayValue: null,
  sharedByParent: false,
  ...o,
});

function stubEcho() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { kind: SensitiveFactSummary["kind"]; enabled: boolean; value: unknown };
    return new Response(
      JSON.stringify(
        summary({
          kind: body.kind,
          enabled: body.enabled,
          hasValue: body.value !== null,
          displayValue: body.value === "48_75k" ? "$48k–75k" : null,
        }),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SensitiveToggles (ME-05)", () => {
  it("shows a parent-shared income range as an opt-in offer", () => {
    render(<SensitiveToggles facts={[summary({ kind: "income_range", enabled: false, hasValue: true, displayValue: "$48k–75k", sharedByParent: true })]} />);
    expect(screen.getByText("Your parent shared an income range. Turn it on to use it for matching.")).toBeTruthy();
  });

  it("lists all eight kinds off by default with the matcher-only note", () => {
    render(<SensitiveToggles facts={[]} />);
    expect(screen.getAllByRole("switch")).toHaveLength(8);
    for (const s of screen.getAllByRole("switch")) expect(s.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/never in AI prompts/)).toBeTruthy();
    expect(screen.getByText(/never shown to family unless you share sensitive match reasons/)).toBeTruthy();
  });

  it("turns a yes/no kind on with PUT /sensitive-facts", async () => {
    const fetchMock = stubEcho();
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "First in my family to go to college" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "First in my family to go to college" }).getAttribute("aria-checked")).toBe("true"),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/sensitive-facts");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ kind: "first_gen", enabled: true, value: null }),
    });
  });

  it("asks for a range before turning income on", async () => {
    const fetchMock = stubEcho();
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Income range"), { target: { value: "48_75k" } });
    expect(await screen.findByText("$48k–75k")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ kind: "income_range", enabled: true, value: "48_75k" }));
  });

  it("shows ranges a parent shared and turns them off", async () => {
    const fetchMock = stubEcho();
    render(<SensitiveToggles facts={[summary({ kind: "income_range", enabled: true, hasValue: true, displayValue: "$48k–75k", sharedByParent: true })]} />);
    expect(screen.getByText("$48k–75k · shared by family")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Household income range" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ kind: "income_range", enabled: false, value: null }));
  });

  it("reverts when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "invalid_input", message: "Try again" } }), { status: 400 })),
    );
    render(<SensitiveToggles facts={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Military family" }));
    expect(await screen.findByText("Try again")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Military family" }).getAttribute("aria-checked")).toBe("false");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/memory`
Expected: FAIL with `Failed to resolve import "./FactsCard"` and `Failed to resolve import "./SensitiveToggles"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/memory/labels.ts`:

```ts
import { instantShort } from "@/lib/format";
import { splitList } from "@/lib/sensitive";
import { type FactSource, type FactValue, type FactVisibility, type MemoryFact, PROFILE_FACT_KEYS } from "@scholarcrew/domain";

export const SOURCE_LABELS: Record<FactSource, string> = {
  user_stated: "You",
  document: "Document",
  parent_shared: "Shared by family",
  crew_inferred: "Crew guess",
  system: "ScholarCrew",
};

export const VISIBILITY_LABELS: Record<FactVisibility, string> = {
  crew: "Crew",
  crew_family: "Crew + family",
  scout_only: "Scout only",
  private: "Private",
};

export const VISIBILITY_OPTIONS = (Object.keys(VISIBILITY_LABELS) as FactVisibility[]).map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

/** Shown under the select while "Scout only" is picked. */
export const SCOUT_ONLY_HINT = "Used for scholarship matching only";

/**
 * R2I-10: "Scout only" means "matching only", and only the eight profile keys reach the matcher (12's port
 * blanks them from crew prompts, the matcher reads `profiles`). Other keys don't get the option, except a fact
 * that already has it, so the select can show its current value.
 */
export function visibilityOptionsFor(key: string, current: FactVisibility): Array<{ value: FactVisibility; label: string }> {
  const matcherKey = (PROFILE_FACT_KEYS as readonly string[]).includes(key);
  return VISIBILITY_OPTIONS.filter((o) => o.value !== "scout_only" || matcherKey || current === "scout_only");
}

/** "intended_majors" → "Intended majors". */
export function factLabel(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function factSource(f: Pick<MemoryFact, "source" | "createdAt">, timeZone: string): string {
  return `${SOURCE_LABELS[f.source]} · ${instantShort(f.createdAt, timeZone)}`;
}

export function valueToText(v: FactValue): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/** Parse edited text back to the original value's type. */
export function textToValue(original: FactValue, text: string): FactValue {
  if (Array.isArray(original)) return splitList(text, 20).map((s) => s.slice(0, 100));
  if (typeof original === "number") {
    const n = Number(text.trim());
    return text.trim() !== "" && Number.isFinite(n) ? n : text.trim().slice(0, 500);
  }
  if (typeof original === "boolean") return /^(yes|true|y)$/i.test(text.trim());
  return text.trim().slice(0, 500);
}
```

`apps/web/src/components/memory/FactsCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import type { FactVisibility, MemoryFact } from "@scholarcrew/domain";
import { Button, Card, Icon, Modal, Select, Table, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCOUT_ONLY_HINT, VISIBILITY_LABELS, factLabel, factSource, textToValue, valueToText, visibilityOptionsFor } from "./labels";
import styles from "./memory.module.css";

/** ME-01/ME-02: every fact with its source, date, and audience; edit supersedes, forget deletes. */
export function FactsCard({ facts: initial, timeZone }: { facts: MemoryFact[]; timeZone: string }) {
  const router = useRouter();
  const [facts, setFacts] = useState(initial);
  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<FactVisibility>("crew");
  const [error, setError] = useState<string | null>(null);

  function startEdit(f: MemoryFact) {
    setEditing(f);
    setText(valueToText(f.value));
    setVisibility(f.visibility);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    try {
      const updated = await api<MemoryFact>(`/facts/${editing.id}`, {
        method: "PATCH",
        body: { value: textToValue(editing.value, text), visibility },
      });
      setFacts((list) => list.map((f) => (f.id === editing.id ? updated : f)));
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function forget(f: MemoryFact) {
    setError(null);
    try {
      await api(`/facts/${f.id}`, { method: "DELETE" });
      setFacts((list) => list.filter((x) => x.id !== f.id));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Profile facts" aside={<span className={styles.muted}>Every fact shows where it came from</span>}>
      {facts.length === 0 ? (
        <p className={styles.muted}>Nothing saved yet. Facts appear here as you tell your crew about yourself.</p>
      ) : (
        <Table
          rows={facts}
          rowKey={(f) => f.id}
          caption="Profile facts"
          columns={[
            {
              key: "fact",
              header: "Fact",
              render: (f) => (
                <span>
                  <b>{factLabel(f.key)}</b>
                  <span className={styles.value}>{f.valueText}</span>
                </span>
              ),
            },
            { key: "source", header: "Source", render: (f) => <span className={styles.src}>{factSource(f, timeZone)}</span> },
            { key: "vis", header: "Used by", render: (f) => <span className={styles.vis}>{VISIBILITY_LABELS[f.visibility]}</span> },
            {
              key: "acts",
              header: <span className={styles.srOnly}>Actions</span>,
              align: "right",
              render: (f) => (
                <span className={styles.acts}>
                  <button type="button" className={styles.link} aria-label={`Edit ${factLabel(f.key)}`} onClick={() => startEdit(f)}>
                    Edit
                  </button>
                  <button type="button" className={styles.link} aria-label={`Forget ${factLabel(f.key)}`} onClick={() => void forget(f)}>
                    Forget
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}
      {error && !editing ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        open={editing !== null}
        title={editing ? `Edit ${factLabel(editing.key)}` : "Edit"}
        onClose={() => setEditing(null)}
        footer={
          <Button variant="primary" onClick={() => void save()} disabled={text.trim() === ""}>
            Save
          </Button>
        }
      >
        <div className={styles.form}>
          <TextInput label="Value" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
          <Select
            label="Who can use it"
            options={editing ? visibilityOptionsFor(editing.key, editing.visibility) : []}
            hint={visibility === "scout_only" ? SCOUT_ONLY_HINT : undefined}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as FactVisibility)}
          />
          <p className={styles.muted}>Saving replaces the old fact. Your crew sees the new one right away.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}

/** ME-03: crew guesses wait here; they're never used as facts until confirmed. */
export function CandidatesCard({ candidates: initial }: { candidates: MemoryFact[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function decide(f: MemoryFact, action: "confirm" | "reject") {
    setError(null);
    setItems((list) => list.filter((x) => x.id !== f.id));
    try {
      await api<MemoryFact>(`/facts/${f.id}/${action}`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setItems((list) => [f, ...list]);
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Waiting for your OK" aside={<span className={styles.muted}>Unconfirmed guesses expire in 30 days</span>}>
      {items.length === 0 ? (
        <p className={styles.muted}>Nothing waiting. Your crew asks before it remembers a guess.</p>
      ) : (
        <ul>
          {items.map((f) => (
            <li key={f.id} className={styles.cand}>
              <Icon name="spark" />
              <span className={styles.candText}>{`Remember ${factLabel(f.key).toLowerCase()}: ${f.valueText}?`}</span>
              <Button variant="soft" size="sm" aria-label={`Remember ${factLabel(f.key)}`} onClick={() => void decide(f, "confirm")}>
                Remember
              </Button>
              <Button variant="line" size="sm" aria-label={`No to ${factLabel(f.key)}`} onClick={() => void decide(f, "reject")}>
                No
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/memory/DecisionsCard.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { Decision } from "@scholarcrew/domain";
import { Card } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./memory.module.css";

/** ME-04: decisions so the crew doesn't re-argue them. The student can delete any. */
export function DecisionsCard({ decisions: initial, timeZone }: { decisions: Decision[]; timeZone: string }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function remove(d: Decision) {
    setError(null);
    try {
      await api(`/decisions/${d.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Decisions we made" aside={<span className={styles.muted}>So the crew doesn't re-argue them</span>}>
      {items.length === 0 ? (
        <p className={styles.muted}>No decisions yet. When you settle something in chat, Compass can save it here.</p>
      ) : (
        <ul>
          {items.map((d) => (
            <li key={d.id} className={styles.dec}>
              <span className={styles.date}>{instantShort(d.decidedAt, timeZone)}</span>
              <span>
                {d.summary}
                {d.rationale ? <span className={styles.muted}>{` ${d.rationale}`}</span> : null}
              </span>
              <button type="button" className={styles.link} aria-label={`Delete decision: ${d.summary}`} onClick={() => void remove(d)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/memory/SensitiveToggles.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { INCOME_OPTIONS, SENSITIVE_OPTIONS, SENSITIVE_ORDER, sensitiveValue } from "@/lib/sensitive";
import type { SensitiveFactInput, SensitiveFactSummary, SensitiveKind } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./memory.module.css";

function blank(kind: SensitiveKind): SensitiveFactSummary {
  return { kind, enabled: false, hasValue: false, displayValue: null, sharedByParent: false };
}

/** ME-05: sensitive matching facts. Off unless turned on; read only by the matcher. */
export function SensitiveToggles({ facts }: { facts: SensitiveFactSummary[] }) {
  const [byKind, setByKind] = useState<Record<SensitiveKind, SensitiveFactSummary>>(() => {
    const out = {} as Record<SensitiveKind, SensitiveFactSummary>;
    for (const kind of SENSITIVE_ORDER) out[kind] = facts.find((f) => f.kind === kind) ?? blank(kind);
    return out;
  });
  const [choosingIncome, setChoosingIncome] = useState(false);
  const [lists, setLists] = useState<Partial<Record<SensitiveKind, string>>>({});
  const [error, setError] = useState<string | null>(null);

  async function put(input: SensitiveFactInput) {
    const before = byKind[input.kind];
    setByKind((m) => ({ ...m, [input.kind]: { ...before, enabled: input.enabled } }));
    setError(null);
    try {
      const saved = await api<SensitiveFactSummary>("/sensitive-facts", { method: "PUT", body: input });
      setByKind((m) => ({ ...m, [input.kind]: saved }));
    } catch (e) {
      setByKind((m) => ({ ...m, [input.kind]: before }));
      setError(errorMessage(e));
    }
  }

  function flip(kind: SensitiveKind, enabled: boolean) {
    if (kind === "income_range") {
      if (enabled && !byKind[kind].hasValue) {
        setChoosingIncome(true);
        return;
      }
      setChoosingIncome(false);
    }
    void put({ kind, enabled, value: null });
  }

  return (
    <Card title="Only used to find scholarships" aside={<Icon name="lock" />}>
      <p className={styles.muted}>
        Off unless you turn it on. Used only by the matcher: never in AI prompts, never shown to schools, never shown to
        family; matches based on these details are visible only to you, never guessed.
      </p>
      {SENSITIVE_ORDER.map((kind) => {
        const s = byKind[kind];
        const option = SENSITIVE_OPTIONS[kind];
        const on = s.enabled || (kind === "income_range" && choosingIncome);
        const detail = s.sharedByParent && !s.enabled && kind === "income_range" ? "Your parent shared an income range. Turn it on to use it for matching." : s.displayValue ? `${s.displayValue}${s.sharedByParent ? " · shared by family" : ""}` : undefined;
        return (
          <div key={kind} className={styles.trow}>
            <Toggle checked={on} label={option.label} detail={detail} onChange={(next) => flip(kind, next)} />
            {kind === "income_range" && choosingIncome && !s.enabled ? (
              <Select
                label="Income range"
                placeholder="Pick a range"
                options={INCOME_OPTIONS}
                value=""
                onChange={(e) => {
                  const value = sensitiveValue("income_range", e.target.value);
                  if (value) {
                    setChoosingIncome(false);
                    void put({ kind, enabled: true, value });
                  }
                }}
              />
            ) : null}
            {option.value === "list" && s.enabled ? (
              <form
                className={styles.inline}
                onSubmit={(e) => {
                  e.preventDefault();
                  void put({ kind, enabled: true, value: sensitiveValue(kind, lists[kind] ?? "") });
                }}
              >
                <TextInput
                  label={`${option.label}: which ones? (optional)`}
                  value={lists[kind] ?? ""}
                  onChange={(e) => setLists((l) => ({ ...l, [kind]: e.target.value }))}
                />
                <Button variant="line" size="sm" type="submit">
                  Save
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/memory/StoryBankCard.tsx`:

```tsx
import { plural } from "@/lib/format";
import type { Story } from "@scholarcrew/domain";
import { Button, Card } from "@scholarcrew/ui";
import styles from "./memory.module.css";

function usedLabel(n: number): string {
  if (n === 0) return "not used yet";
  return n === 1 ? "used once" : `used ${n} times`;
}

export function StoryBankCard({ stories }: { stories: Story[] }) {
  const live = stories.filter((s) => s.archivedAt === null);
  const essays = new Set(live.flatMap((s) => s.uses.map((u) => u.essayId)));
  const top = [...live].sort((a, b) => b.uses.length - a.uses.length).slice(0, 4);
  return (
    <Card
      title="Story Bank"
      aside={<span className={styles.muted}>{`${plural(live.length, "story", "stories")} · used in ${plural(essays.size, "essay")}`}</span>}
    >
      {top.length === 0 ? (
        <p className={styles.muted}>No stories yet. Quill builds them with you from a short interview.</p>
      ) : (
        <ul>
          {top.map((s) => (
            <li key={s.id} className={styles.srow}>
              <b>{s.title}</b>
              <span>{usedLabel(s.uses.length)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <Button variant="soft" size="sm" iconEnd="arrow" href="/essays/stories">
          {top.length === 0 ? "Start a story interview" : "Open Story Bank"}
        </Button>
      </div>
    </Card>
  );
}
```

`apps/web/src/components/memory/StartFresh.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Conversation } from "@scholarcrew/domain";
import { Button, Card, Modal } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./memory.module.css";

/** New chat, temporary chat (CR-07/ME-06), new season (ME-07), and the way to delete the account (ME-09). */
export function StartFresh() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function chat(room: "my_crew" | "temporary") {
    setBusy(true);
    try {
      const conv = await api<Conversation>("/conversations", { method: "POST", body: { room } });
      router.push(`/crew/${conv.id}`);
    } catch (e) {
      setMessage(errorMessage(e));
      setBusy(false);
    }
  }

  async function newSeason() {
    setBusy(true);
    try {
      const { archived } = await api<{ archived: number }>("/college-list/archive-season", { method: "POST" });
      setMessage(`Archived ${plural(archived, "college")} from last season. Your stories, essays, and records are still here.`);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Start fresh">
      <div className={styles.row}>
        <Button variant="line" disabled={busy} onClick={() => void chat("my_crew")}>
          New chat
        </Button>
        <Button variant="line" disabled={busy} onClick={() => void chat("temporary")}>
          Temporary chat
        </Button>
        <Button variant="line" disabled={busy} onClick={() => setConfirming(true)}>
          New season
        </Button>
        <Button variant="line" href="/settings#delete">
          Delete account
        </Button>
      </div>
      <p className={styles.muted}>
        Temporary chats load no memory, save nothing, and are deleted after 24 hours. New season archives senior-year
        admissions and keeps your stories and records.
      </p>
      {message ? <p className={styles.note}>{message}</p> : null}
      <Modal
        open={confirming}
        title="Start a new season?"
        onClose={() => setConfirming(false)}
        footer={
          <Button variant="primary" disabled={busy} onClick={() => void newSeason()}>
            Archive this season
          </Button>
        }
      >
        <p>
          This archives your college list, application checklists, and award letters for this season. Stories, essays,
          activities, and facts stay.
        </p>
      </Modal>
    </Card>
  );
}
```

`apps/web/src/components/memory/memory.module.css` (mockup 07):

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.sub {
  margin-top: 5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 470px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.muted {
  font-size: 12.5px;
  color: var(--muted);
}

.error {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.note {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--wash);
  font-size: 13px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inline {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.inline > :first-child {
  flex: 1;
}

.value {
  margin-left: 6px;
}

.src {
  font-size: 12px;
  color: var(--muted);
}

.vis {
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--wash);
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
  color: var(--ink-2);
}

.acts {
  display: inline-flex;
  justify-content: flex-end;
  gap: 10px;
  font-size: 12px;
}

.link {
  border: 0;
  background: none;
  font-weight: 600;
  color: var(--navy);
}

.cand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.cand:first-child {
  border-top: 0;
}

.cand > svg {
  color: var(--navy);
}

.candText {
  flex: 1;
}

.dec {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.dec:first-child {
  border-top: 0;
}

.date {
  font-weight: 700;
  color: var(--ink-2);
}

.trow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 0;
  border-top: 1px solid var(--line-2);
}

.srow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.srow:first-child {
  border-top: 0;
}

.srow span {
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

`apps/web/src/app/(app)/memory/page.tsx`:

```tsx
import { DecisionsCard } from "@/components/memory/DecisionsCard";
import { CandidatesCard, FactsCard } from "@/components/memory/FactsCard";
import { SensitiveToggles } from "@/components/memory/SensitiveToggles";
import { StartFresh } from "@/components/memory/StartFresh";
import { StoryBankCard } from "@/components/memory/StoryBankCard";
import styles from "@/components/memory/memory.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { listStories } from "@scholarcrew/core/essays";
import { listDecisions, listFacts, listSensitiveFacts } from "@scholarcrew/core/memory";
import { Button } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { actor, me, deps } = await requireAppActor(["student"]);
  const [facts, decisions, sensitive, stories] = await Promise.all([
    listFacts(deps, actor, actor.userId),
    listDecisions(deps, actor, actor.userId),
    listSensitiveFacts(deps, actor),
    listStories(deps, actor, actor.userId),
  ]);
  const tz = me.user.timeZone;
  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>What your crew remembers</h1>
          <p className={styles.sub}>
            Private to you · edit or forget anything · sensitive facts are never guessed from your chats
          </p>
        </div>
        <div className={styles.row}>
          <Button variant="line" href="/settings#data">
            Export everything
          </Button>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          <FactsCard facts={facts.filter((f) => f.status === "confirmed")} timeZone={tz} />
          <CandidatesCard candidates={facts.filter((f) => f.status === "candidate")} />
          <DecisionsCard decisions={decisions} timeZone={tz} />
        </div>
        <div className={styles.col}>
          <SensitiveToggles facts={sensitive} />
          <StoryBankCard stories={stories} />
          <StartFresh />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/memory && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 12 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/memory "apps/web/src/app/(app)/memory/page.tsx"
git commit -m "feat(web): memory screen with facts, candidates, decisions, sensitive toggles, and start fresh"
```

### P19: Family components: share toggles, tasks, parent space, helper links, members (FA-01..FA-05, FA-07, HL-01, HL-04)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/family/ShareToggles.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { FamilyTask, ShareSettings } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyTasks } from "./FamilyTasks";
import { ParentSpace } from "./ParentSpace";
import { ShareToggles } from "./ShareToggles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings: ShareSettings = {
  studentId: "11111111-1111-4111-8111-111111111111",
  familyId: "22222222-2222-4222-8222-222222222222",
  categories: {
    deadlines: true,
    colleges: true,
    costs: true,
    scholarships: true,
    activities: true,
    essays: false,
    chats: false,
    stories: false,
    sensitive: false,
  },
};

describe("ShareToggles (FA-02)", () => {
  it("shows the defaults and names who sees them", () => {
    render(<ShareToggles settings={settings} parentNames={["Dana"]} />);
    expect(screen.getByRole("heading", { name: "What I share with Dana" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Deadlines and calendar" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Essays and drafts" }).getAttribute("aria-checked")).toBe("false");
    // R2I-11: `sensitive` gates the parent-visible sensitive match reasons (07); it never reaches chat.
    expect(
      screen.getByRole("switch", { name: "Sensitive match reasons (scholarship board only, never in chat)" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getAllByRole("switch")).toHaveLength(9);
    expect(screen.getByText("Dana sees only what's on. Turning something off hides it right away.")).toBeTruthy();
  });

  it("saves one category at a time", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...settings, categories: { ...settings.categories, essays: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareToggles settings={settings} parentNames={["Dana"]} />);
    fireEvent.click(screen.getByRole("switch", { name: "Essays and drafts" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/share-settings");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ categories: { essays: true } }) });
    expect(screen.getByRole("switch", { name: "Essays and drafts" }).getAttribute("aria-checked")).toBe("true");
  });

  it("reverts when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Family not found" } }), { status: 404 })),
    );
    render(<ShareToggles settings={settings} parentNames={[]} />);
    fireEvent.click(screen.getByRole("switch", { name: "College list" }));
    expect(await screen.findByText("Family not found")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "College list" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("FamilyTasks (FA-05)", () => {
  const task = (o: Partial<FamilyTask>): FamilyTask => ({
    id: "33333333-3333-4333-8333-333333333333",
    familyId: settings.familyId,
    assigneeId: "44444444-4444-4444-8444-444444444444",
    assigneeName: "Dana Rivera",
    studentId: settings.studentId,
    kind: "fafsa_contributor",
    title: "Add your info to the 2027-28 FAFSA",
    detail: "As a contributor, from your own StudentAid.gov account",
    status: "todo",
    dueOn: null,
    createdAt: "2026-10-01T15:00:00.000Z",
    completedAt: null,
    ...o,
  });

  it("shows who each task is for and lets the assignee mark it done", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(task({ status: "done" })), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FamilyTasks
        tasks={[task({}), task({ id: "55555555-5555-4555-8555-555555555555", assigneeId: settings.studentId, assigneeName: "Maya Rivera", title: "Add Dana as a FAFSA contributor", status: "done" })]}
        myUserId="44444444-4444-4444-8444-444444444444"
      />,
    );
    expect(screen.getByText("Dana")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Mark done/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Add your info to the 2027-28 FAFSA" }));
    await waitFor(() => expect(screen.getAllByText("Done")).toHaveLength(2));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: '{"status":"done"}' });
  });

  it("shows due dates, a skipped task without a check, and the nameless-assignee fallback (R3V-11, R3V-14)", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <FamilyTasks
        tasks={[
          task({ dueOn: "2026-10-15" }),
          task({ id: "66666666-6666-4666-8666-666666666666", title: "Review the cost sheet together", status: "skipped", assigneeName: "Your family member" }),
        ]}
        myUserId="11111111-1111-4111-8111-111111111111"
      />,
    );
    expect(screen.getByText("Due Oct 15")).toBeTruthy();
    expect(screen.getAllByText(/^Due /)).toHaveLength(1);
    const skipped = screen.getByText("Skipped");
    expect(skipped.querySelector('[data-icon="check"]')).toBeNull();
    expect(skipped.querySelector('[data-icon="info"]')).toBeTruthy();
    expect(screen.getByText("Your family member")).toBeTruthy();
    expect(screen.getByText("Dana")).toBeTruthy();
  });
});

describe("ParentSpace budget (FA-04, R3V-3)", () => {
  const budgetField = () => screen.getByLabelText("Yearly family budget for college");
  const saveButton = () => screen.getByRole("button", { name: "Save budget" }) as HTMLButtonElement;

  it("saves \"12,000\" as 12000", async () => {
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            familyId: settings.familyId,
            annualUsd: JSON.parse(String(init?.body)).annualUsd,
            sharedById: "44444444-4444-4444-8444-444444444444",
            updatedAt: "2026-10-06T15:00:00.000Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ParentSpace studentId={settings.studentId} studentName="Maya" budget={null} />);
    fireEvent.change(budgetField(), { target: { value: "12,000" } });
    fireEvent.click(saveButton());
    expect(await screen.findByText("Saved: $12,000 a year. Ledger uses it in the gap.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/budget");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: '{"annualUsd":12000}' });
  });

  it("keeps Save off for a blank field and refuses text that isn't whole dollars", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ParentSpace studentId={settings.studentId} studentName="Maya" budget={null} />);
    fireEvent.change(budgetField(), { target: { value: " " } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(budgetField(), { target: { value: "12k" } });
    fireEvent.click(saveButton());
    expect(screen.getByText("Enter whole dollars, up to $500,000.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

`apps/web/src/components/family/HelperLinks.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { HelperLink } from "@scholarcrew/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelperLinks } from "./HelperLinks";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const link = (o: Partial<HelperLink> = {}): HelperLink => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "Ms. Patel",
  helperRole: "recommender",
  scope: ["activities"],
  createdAt: "2026-10-01T15:00:00.000Z",
  expiresAt: "2026-10-31T15:00:00.000Z",
  revokedAt: null,
  lastUsedAt: null,
  ...o,
});

describe("HelperLinks (HL-01, HL-04)", () => {
  it("lists live links with their role and scope", () => {
    render(<HelperLinks links={[link(), link({ id: "2", label: "Old link", revokedAt: "2026-10-02T00:00:00.000Z" })]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    expect(screen.getByText("Ms. Patel")).toBeTruthy();
    expect(screen.getByText("Recommender · sees activities (brag sheet) · until Oct 31")).toBeTruthy();
    expect(screen.queryByText("Old link")).toBeNull();
  });

  it("only offers helper scopes, never essays, chats, costs, or sensitive facts", () => {
    render(<HelperLinks links={[]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "New helper link" }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("value"))).toEqual(["deadlines", "colleges", "activities", "stories", "scholarships"]);
    for (const word of [/essay/i, /chat/i, /cost/i, /sensitive/i]) {
      expect(screen.queryByRole("checkbox", { name: word })).toBeNull();
    }
    expect((screen.getByRole("button", { name: "Create link" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates a link with the checked scopes and shows the URL once", async () => {
    const created = link({ id: "33333333-3333-4333-8333-333333333333", label: "Mr. Okafor", helperRole: "counselor", scope: ["deadlines", "colleges"] });
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ link: created, url: "http://localhost:3000/h/abc123" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<HelperLinks links={[]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "New helper link" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mr. Okafor" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "counselor" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Deadlines and application status" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "College list" }));
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByText("http://localhost:3000/h/abc123")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      label: "Mr. Okafor",
      helperRole: "counselor",
      scope: ["deadlines", "colleges"],
      expiresInDays: 30,
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("http://localhost:3000/h/abc123")).toBeNull();
    expect(screen.getByText("Mr. Okafor")).toBeTruthy();
  });

  it("revokes a link", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HelperLinks links={[link()]} timeZone="America/Chicago" nowIso="2026-10-06T15:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke Ms. Patel" }));
    await waitFor(() => expect(screen.queryByText("Ms. Patel")).toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/helper-links/11111111-1111-4111-8111-111111111111");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/web test src/components/family`
Expected: FAIL with `Failed to resolve import "./ShareToggles"`, `"./FamilyTasks"`, and `"./HelperLinks"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/family/ShareToggles.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { DEFAULT_SHARED, SHARE_CATEGORIES, type ShareCategory, type ShareSettings } from "@scholarcrew/domain";
import { Card, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

export const SHARE_LABELS: Record<ShareCategory, string> = {
  deadlines: "Deadlines and calendar",
  colleges: "College list",
  costs: "Costs, offers, and the gap",
  scholarships: "Scholarships (names and amounts)",
  activities: "Activities and service",
  essays: "Essays and drafts",
  chats: "Crew chats",
  stories: "Story Bank",
  sensitive: "Sensitive match reasons (scholarship board only, never in chat)",
};

function names(list: string[]): string {
  return list.length > 0 ? list.join(" and ") : "your family";
}

/** FA-02: the student turns sharing on or off per category. */
export function ShareToggles({ settings, parentNames }: { settings: ShareSettings; parentNames: string[] }) {
  const [cats, setCats] = useState<Record<ShareCategory, boolean>>({ ...DEFAULT_SHARED, ...settings.categories });
  const [error, setError] = useState<string | null>(null);
  const who = names(parentNames);

  async function set(category: ShareCategory, enabled: boolean) {
    const before = cats;
    setCats({ ...cats, [category]: enabled });
    setError(null);
    try {
      const saved = await api<ShareSettings>("/family/share-settings", { method: "PUT", body: { categories: { [category]: enabled } } });
      setCats({ ...DEFAULT_SHARED, ...saved.categories });
    } catch (e) {
      setCats(before);
      setError(errorMessage(e));
    }
  }

  return (
    <Card title={`What I share with ${who}`}>
      {SHARE_CATEGORIES.map((category) => (
        <div key={category} className={styles.trow}>
          <Toggle checked={cats[category]} label={SHARE_LABELS[category]} onChange={(next) => void set(category, next)} />
        </div>
      ))}
      <p className={styles.muted}>{`${parentNames.length > 0 ? who : "Your family"} sees only what's on. Turning something off hides it right away.`}</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/family/FamilyTasks.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type { FamilyTask } from "@scholarcrew/domain";
import { Badge, Button, Card, StatusPill, Who } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

function pill(t: FamilyTask) {
  if (t.status === "done") return <StatusPill status="ready" label="Done" />;
  // R3V-11: StatusPill "on" carries a check icon, which reads as done. Skipped gets a neutral info badge.
  if (t.status === "skipped") {
    return (
      <Badge tone="neutral" icon="info">
        Skipped
      </Badge>
    );
  }
  return <StatusPill status="needs_input" label="Not started" />;
}

/**
 * R3V-14: 06 `listTasks` already falls back to `unnamedInviter` ("Your family member", "Your student") for a
 * nameless assignee. Those read as a whole phrase, so they aren't cut to a first word; a real name shows its first name.
 */
const UNNAMED_ASSIGNEES = new Set(["Your family member", "Your student"]);
function assigneeTag(name: string): string {
  const n = name.trim();
  if (n === "") return "Your family member";
  if (UNNAMED_ASSIGNEES.has(n)) return n;
  return n.split(/\s+/)[0] ?? n;
}

/** FA-05: FAFSA/CSS contributor steps, budget input, and shared reviews, each assigned to a person. */
export function FamilyTasks({ tasks: initial, myUserId }: { tasks: FamilyTask[]; myUserId: string }) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function done(t: FamilyTask) {
    setError(null);
    try {
      const saved = await api<FamilyTask>(`/family/tasks/${t.id}`, { method: "PATCH", body: { status: "done" } });
      setTasks((list) => list.map((x) => (x.id === t.id ? saved : x)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="This week, together" aside={<Who role="aid" size="sm" />}>
      {tasks.length === 0 ? (
        <p className={styles.muted}>No shared tasks yet. Aid adds FAFSA and CSS steps here when they're due.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <li key={t.id} className={styles.ftask}>
              <span className={styles.whoTag}>{assigneeTag(t.assigneeName)}</span>
              <div>
                <b>{t.title}</b>
                {t.detail ? <p className={styles.muted}>{t.detail}</p> : null}
                {t.dueOn ? <p className={styles.muted}>{`Due ${dateShort(t.dueOn)}`}</p> : null}
                {t.assigneeId === myUserId && t.status === "todo" ? (
                  <Button variant="line" size="sm" aria-label={`Mark done: ${t.title}`} onClick={() => void done(t)}>
                    Mark done
                  </Button>
                ) : null}
              </div>
              {pill(t)}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/family/ParentSpace.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";
import { INCOME_OPTIONS } from "@/lib/sensitive";
import type { FamilyBudget, IncomeRange } from "@scholarcrew/domain";
import { Button, Card, Icon, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

const MAX_BUDGET_USD = 500_000;

/**
 * R3V-3: whole dollars like 17's money inputs: "$12,000" and "12 000" are 12000. Anything else, an empty
 * result, or more than $500,000 is null.
 */
function parseDollars(text: string): number | null {
  const digits = text.replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n <= MAX_BUDGET_USD ? n : null;
}

/** FA-04: a parent's private space. They can share a result (an income range) and a yearly budget. */
export function ParentSpace({
  studentId,
  studentName,
  budget,
}: {
  studentId: string | null;
  studentName: string;
  budget: FamilyBudget | null;
}) {
  const [range, setRange] = useState("");
  const [rangeStatus, setRangeStatus] = useState<string | null>(null);
  const [annual, setAnnual] = useState(budget ? String(budget.annualUsd) : "");
  const [budgetStatus, setBudgetStatus] = useState<string | null>(null);
  const name = studentName || "your student";

  async function shareRange() {
    if (!studentId || !range) return;
    setRangeStatus(null);
    try {
      await api("/sensitive-facts/share-income", { method: "POST", body: { studentId, range: range as IncomeRange } });
      setRangeStatus(`Shared with ${name}'s matching. They can turn it off in Memory.`);
    } catch (e) {
      setRangeStatus(errorMessage(e));
    }
  }

  async function saveBudget() {
    const n = parseDollars(annual);
    if (n === null) {
      setBudgetStatus("Enter whole dollars, up to $500,000.");
      return;
    }
    setBudgetStatus(null);
    try {
      const saved = await api<FamilyBudget>("/family/budget", { method: "PUT", body: { annualUsd: n } });
      setBudgetStatus(`Saved: ${usd(saved.annualUsd)} a year. Ledger uses it in the gap.`);
    } catch (e) {
      setBudgetStatus(errorMessage(e));
    }
  }

  return (
    <Card title="Your private space" aside={<Icon name="lock" />}>
      <p className={styles.small}>
        {`Tax returns, exact income, and your FAFSA details stay with you. ${name} sees only what you choose to share, like the income range used for matching.`}
      </p>
      <div className={styles.form}>
        <Select
          label="Household income range"
          placeholder="Pick a range"
          options={INCOME_OPTIONS}
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
        <Button variant="soft" size="sm" disabled={!studentId || !range} onClick={() => void shareRange()}>
          {`Share range with ${name}`}
        </Button>
        {rangeStatus ? <p className={styles.muted}>{rangeStatus}</p> : null}
      </div>
      <div className={styles.form}>
        <TextInput
          label="Yearly family budget for college"
          hint="What your family can put toward each year, in whole dollars"
          inputMode="numeric"
          value={annual}
          onChange={(e) => setAnnual(e.target.value)}
        />
        <Button variant="soft" size="sm" disabled={annual.trim() === ""} onClick={() => void saveBudget()}>
          Save budget
        </Button>
        {budgetStatus ? <p className={styles.muted}>{budgetStatus}</p> : null}
      </div>
    </Card>
  );
}
```

`apps/web/src/components/family/HelperLinks.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import { HELPER_SCOPES, type HelperLink, type HelperLinkCreated, type HelperRole, type HelperScope } from "@scholarcrew/domain";
import { Button, Card, Select, TextInput } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./family.module.css";

export const SCOPE_LABELS: Record<HelperScope, string> = {
  deadlines: "Deadlines and application status",
  colleges: "College list",
  activities: "Activities (brag sheet)",
  stories: "Story summaries",
  scholarships: "Scholarships",
};

const ROLE_OPTIONS: Array<{ value: HelperRole; label: string }> = [
  { value: "recommender", label: "Recommender" },
  { value: "counselor", label: "Counselor" },
  { value: "mentor", label: "Mentor" },
];

const DAYS_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function roleLabel(r: HelperRole): string {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

/** HL-01/HL-04: read-only links for recommenders and counselors, limited to HelperScope. */
export function HelperLinks({ links, timeZone, nowIso }: { links: HelperLink[]; timeZone: string; nowIso: string }) {
  const now = new Date(nowIso);
  const [items, setItems] = useState(links.filter((l) => l.revokedAt === null && new Date(l.expiresAt) > now));
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<HelperRole>("recommender");
  const [scope, setScope] = useState<HelperScope[]>([]);
  const [days, setDays] = useState("30");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(s: HelperScope) {
    setScope((list) => (list.includes(s) ? list.filter((x) => x !== s) : HELPER_SCOPES.filter((x) => x === s || list.includes(x))));
  }

  async function create() {
    setError(null);
    try {
      const res = await api<HelperLinkCreated>("/helper-links", {
        method: "POST",
        body: { label: label.trim(), helperRole: role, scope, expiresInDays: Number(days) },
      });
      setItems((list) => [res.link, ...list]);
      setUrl(res.url);
      setCopied(false);
      setOpen(false);
      setLabel("");
      setScope([]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function revoke(l: HelperLink) {
    setError(null);
    try {
      await api(`/helper-links/${l.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== l.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy didn't work. Select the link and copy it yourself.");
    }
  }

  return (
    <Card
      title="Helper links"
      aside={
        <Button variant="line" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Cancel" : "New helper link"}
        </Button>
      }
    >
      {items.length === 0 ? <p className={styles.muted}>No helper links yet.</p> : null}
      {items.map((l) => (
        <div key={l.id} className={styles.kvRow}>
          <div>
            <b>{l.label}</b>
            <p className={styles.muted}>
              {`${roleLabel(l.helperRole)} · sees ${l.scope.map((s) => SCOPE_LABELS[s].toLowerCase()).join(", ")} · until ${instantShort(l.expiresAt, timeZone)}`}
            </p>
          </div>
          <Button variant="line" size="sm" aria-label={`Revoke ${l.label}`} onClick={() => void revoke(l)}>
            Revoke
          </Button>
        </div>
      ))}
      {url ? (
        <div className={styles.secret}>
          <p>Send this link to your helper. It's shown once, and anyone with it can see what you checked until it expires.</p>
          <code className={styles.code}>{url}</code>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={() => void copy(url)}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="line" size="sm" onClick={() => setUrl(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      {open ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim() && scope.length > 0) void create();
          }}
        >
          <TextInput label="Name" placeholder="Ms. Patel" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
          <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value as HelperRole)} />
          <fieldset className={styles.fieldset}>
            <legend>What they can see</legend>
            {HELPER_SCOPES.map((s) => (
              <label key={s} className={styles.checkRow}>
                <input type="checkbox" value={s} checked={scope.includes(s)} onChange={() => toggleScope(s)} />
                {SCOPE_LABELS[s]}
              </label>
            ))}
          </fieldset>
          <Select label="Link lasts" options={DAYS_OPTIONS} value={days} onChange={(e) => setDays(e.target.value)} />
          <p className={styles.muted}>Helper links never show essays, chats, money, or sensitive facts.</p>
          <Button variant="primary" size="sm" type="submit" disabled={label.trim() === "" || scope.length === 0}>
            Create link
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
```

`apps/web/src/components/family/Members.tsx`:

```tsx
"use client";

import { api, errorMessage } from "@/lib/api";
import { instantShort } from "@/lib/format";
import type { FamilyMemberRole, FamilyView } from "@scholarcrew/domain";
import { Button, Card, Modal, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./family.module.css";

type Member = FamilyView["members"][number];

/** FA-01 invites, FA-07 leave or remove. Removing or leaving ends access right away. */
export function Members({
  family,
  myUserId,
  myRole,
  timeZone,
  onLeft = () => window.location.assign("/week"),
}: {
  family: FamilyView | null;
  myUserId: string;
  myRole: FamilyMemberRole;
  timeZone: string;
  onLeft?: () => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(family?.members ?? []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function invite() {
    setStatus(null);
    try {
      await api("/family/invites", { method: "POST", body: { email: email.trim() } });
      setStatus(`Invite sent to ${email.trim()}. The link works once and expires in 7 days.`);
      setEmail("");
      router.refresh();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  async function cancelInvite(id: string) {
    try {
      await api(`/family/invites/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) { setStatus(errorMessage(e)); }
  }

  async function remove(m: Member) {
    try {
      await api(`/family/members/${m.userId}`, { method: "DELETE" });
      setMembers((list) => list.filter((x) => x.userId !== m.userId));
      setRemoving(null);
      router.refresh();
    } catch (e) {
      setStatus(errorMessage(e));
      setRemoving(null);
    }
  }

  async function leave() {
    try {
      await api("/family/leave", { method: "POST" });
      onLeft();
    } catch (e) {
      setStatus(errorMessage(e));
      setLeaving(false);
    }
  }

  return (
    <div id="invite">
      <Card title="People in your family">
        {members.map((m) => (
          <div key={m.userId} className={styles.kvRow}>
            <div>
              <b>{m.userId === myUserId ? `${m.displayName || m.email} (you)` : m.displayName || m.email}</b>
              <p className={styles.muted}>{m.memberRole === "student" ? "Student" : "Parent"}</p>
            </div>
            {myRole === "student" && m.memberRole === "parent" ? (
              <Button variant="line" size="sm" aria-label={`Remove ${m.displayName || m.email}`} onClick={() => setRemoving(m)}>
                Remove
              </Button>
            ) : null}
          </div>
        ))}
        {(family?.pendingInvites ?? []).map((i) => (
          <div key={i.id} className={styles.kvRow}>
            <div>
              <b>{i.email}</b>
              <p className={styles.muted}>{`Invite sent · expires ${instantShort(i.expiresAt, timeZone)}`}</p>
            </div>
            {myRole === "student" ? <Button variant="line" size="sm" onClick={() => void cancelInvite(i.id)}>Cancel invite</Button> : null}
          </div>
        ))}
        {myRole === "student" ? <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void invite();
          }}
        >
          <TextInput label="Invite a parent by email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="line" size="sm" type="submit" disabled={email.trim() === ""}>
            Send invite
          </Button>
        </form> : <p className={styles.muted}>{`Ask ${members.find((m) => m.memberRole === "student")?.displayName || "your student"} to invite another parent.`}</p>}
        {status ? <p className={styles.muted}>{status}</p> : null}
        {family ? (
          <div className={styles.row}>
            <Button variant="line" size="sm" onClick={() => setLeaving(true)}>
              Leave family room
            </Button>
          </div>
        ) : null}
      </Card>
      <Modal
        open={removing !== null}
        title={`Remove ${removing?.displayName || removing?.email || "this parent"}?`}
        onClose={() => setRemoving(null)}
        footer={
          <Button variant="primary" onClick={() => (removing ? void remove(removing) : undefined)}>
            Remove
          </Button>
        }
      >
        <p>Their access ends right away. Anything they already exported or downloaded can't be recalled.</p>
      </Modal>
      <Modal
        open={leaving}
        title="Leave the family room?"
        onClose={() => setLeaving(false)}
        footer={
          <Button variant="primary" onClick={() => void leave()}>
            Leave
          </Button>
        }
      >
        <p>You'll stop seeing shared items right away. Anything already exported can't be recalled.</p>
      </Modal>
    </div>
  );
}
```

`apps/web/src/components/family/family.module.css` (mockup 08):

```css
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}

.sub {
  margin-top: 5px;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: 350px minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.inline {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.inline > :first-child {
  flex: 1;
}

.muted {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--muted);
}

.small {
  font-size: 12.5px;
}

.error {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--crit-text);
}

.trow {
  padding: 9px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.trow:first-child {
  border-top: 0;
}

.ftask {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13.5px;
}

.ftask:first-child {
  border-top: 0;
}

.ftask button {
  margin-top: 6px;
}

.whoTag {
  justify-self: start;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--wash);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-2);
}

.kvRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line-2);
  font-size: 13px;
}

.kvRow:first-child {
  border-top: 0;
}

.secret {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--navy-line);
  border-radius: 10px;
  background: var(--navy-soft);
  font-size: 13px;
}

.code {
  font: 600 12.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}

.fieldset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: 0;
}

.fieldset legend {
  margin-bottom: 4px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.checkRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.room {
  scroll-margin-top: 16px;
}

@media (max-width: 1200px) {
  .grid {
    grid-template-columns: minmax(0, 1fr) 300px;
  }

  .grid > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 800px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/web test src/components/family && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 2 files, 11 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/family
git commit -m "feat(web): family share toggles, tasks, parent space, helper links, and members"
```

### P20: Family page (FA-01..FA-05, FA-07; family room reuses the crew thread)

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/family/FamilyPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { Members } from "./Members";
import FamilyPage from "@/app/(app)/family/page";
import type { Conversation, FamilyView, MeResponse } from "@scholarcrew/domain";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAppActor: vi.fn(),
  getFamily: vi.fn(),
  getShareSettings: vi.fn(),
  listTasks: vi.fn(),
  getBudget: vi.fn(),
  listHelperLinks: vi.fn(),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock("@/lib/pageActor", () => ({ requireAppActor: m.requireAppActor }));
vi.mock("@scholarcrew/core/family", () => ({
  getFamily: m.getFamily,
  getShareSettings: m.getShareSettings,
  listTasks: m.listTasks,
  getBudget: m.getBudget,
}));
vi.mock("@scholarcrew/core/helpers", () => ({ listHelperLinks: m.listHelperLinks }));
vi.mock("@scholarcrew/core/crew", () => ({ createConversation: m.createConversation, getMessages: m.getMessages }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => "/family" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";
const FAMILY = "33333333-3333-4333-8333-333333333333";

const me = (role: "student" | "parent"): MeResponse => ({
  user: {
    id: role === "student" ? STUDENT : PARENT,
    email: `${role}@example.test`,
    displayName: role === "student" ? "Maya Rivera" : "Dana Rivera",
    role,
    birthYear: null,
    timeZone: "America/Chicago",
    status: "active",
    createdAt: "2026-10-01T15:00:00.000Z",
  },
  profile: null,
  onboardingComplete: true,
  family: { id: FAMILY, role },
  plan: "family",
});

const family = (myRole: "student" | "parent"): FamilyView => ({
  id: FAMILY,
  name: "Family",
  myRole,
  members: [
    { userId: STUDENT, displayName: "Maya Rivera", email: "student@example.test", memberRole: "student", joinedAt: "2026-10-01T15:00:00.000Z" },
    { userId: PARENT, displayName: "Dana Rivera", email: "parent@example.test", memberRole: "parent", joinedAt: "2026-10-02T15:00:00.000Z" },
  ],
  pendingInvites: [],
});

const room: Conversation = {
  id: "44444444-4444-4444-8444-444444444444",
  room: "family",
  roomRefId: null,
  familyId: FAMILY,
  title: "Family room",
  createdAt: "2026-10-02T15:00:00.000Z",
  expiresAt: null,
  lastMessageAt: null,
};

function as(role: "student" | "parent") {
  const actor = { kind: "user", userId: role === "student" ? STUDENT : PARENT, role };
  m.requireAppActor.mockResolvedValue({ actor, me: me(role), deps: {} });
  m.getFamily.mockResolvedValue(family(role));
  m.listTasks.mockResolvedValue([]);
  m.getBudget.mockResolvedValue(null);
  m.listHelperLinks.mockResolvedValue([]);
  m.createConversation.mockResolvedValue(room);
  m.getMessages.mockResolvedValue([]);
  m.getShareSettings.mockResolvedValue({
    studentId: STUDENT,
    familyId: FAMILY,
    categories: { deadlines: true, colleges: true, costs: true, scholarships: true, activities: true, essays: false, chats: false, stories: false, sensitive: false },
  });
  return actor;
}

describe("Family page", () => {
  it("shows no invite form for parents and lets the student cancel a pending invite", async () => {
    const data = family("student");
    const { unmount } = render(<Members family={data} myUserId={PARENT} myRole="parent" timeZone="America/Chicago" />);
    expect(screen.queryByLabelText("Invite a parent by email")).toBeNull();
    unmount();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Members family={{ ...data, pendingInvites: [{ id: "pending", email: "new@example.test", expiresAt: "2026-10-13T15:00:00.000Z" }] }} myUserId={STUDENT} myRole="student" timeZone="America/Chicago" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/family/invites/pending"));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("gives the student share toggles, helper links, members, and the family room", async () => {
    const actor = as("student");
    render(await FamilyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Family" })).toBeTruthy();
    expect(screen.getByText(/Maya \+ Dana · each of you controls what you share/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What I share with Dana" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Helper links" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dana's private space" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Dana Rivera" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message your crew" })).toBeTruthy();
    expect(m.createConversation).toHaveBeenCalledWith({}, actor, { room: "family", roomRefId: null, familyId: FAMILY, title: "" });
    expect(m.getShareSettings).toHaveBeenCalledWith({}, actor, STUDENT);
  });

  it("gives parents their private space and no student-only controls", async () => {
    as("parent");
    render(await FamilyPage());
    expect(screen.getByRole("heading", { name: "Your private space" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share range with Maya" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /What I share/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Helper links" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(m.getShareSettings).not.toHaveBeenCalled();
    expect(m.listHelperLinks).not.toHaveBeenCalled();
  });

  it("offers an invite when the student has no family yet", async () => {
    as("student");
    m.getFamily.mockResolvedValue(null);
    render(await FamilyPage());
    expect(screen.getByLabelText("Invite a parent by email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave family room" })).toBeNull();
    expect(m.createConversation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/web test src/components/family/FamilyPage`
Expected: FAIL with `Failed to resolve import "@/app/(app)/family/page"`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/app/(app)/family/page.tsx`:

```tsx
import { Thread } from "@/components/crew/Thread";
import { FamilyTasks } from "@/components/family/FamilyTasks";
import { HelperLinks } from "@/components/family/HelperLinks";
import { Members } from "@/components/family/Members";
import { ParentSpace } from "@/components/family/ParentSpace";
import { ShareToggles } from "@/components/family/ShareToggles";
import styles from "@/components/family/family.module.css";
import { requireAppActor } from "@/lib/pageActor";
import { createConversation, getMessages } from "@scholarcrew/core/crew";
import { getBudget, getFamily, getShareSettings, listTasks } from "@scholarcrew/core/family";
import { listHelperLinks } from "@scholarcrew/core/helpers";
import { Badge, Button, Card, Icon } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

function firstName(name: string, email: string): string {
  return name.trim().split(" ")[0] || email;
}

function BillingNote() {
  return (
    <Card title="Billing">
      <p className={styles.small}>Whoever pays for the Family plan, paying doesn't unlock essays, chats, or sensitive facts.</p>
    </Card>
  );
}

export default async function FamilyPage() {
  const { actor, me, deps } = await requireAppActor(["student", "parent"]);
  const isStudent = me.user.role === "student";
  const myRole = isStudent ? "student" : "parent";
  const tz = me.user.timeZone;
  const nowIso = new Date().toISOString();
  const [family, links] = await Promise.all([getFamily(deps, actor), isStudent ? listHelperLinks(deps, actor) : Promise.resolve([])]);

  if (!family) {
    return (
      <>
        <div className={styles.head}>
          <div>
            <h1>Family</h1>
            <p className={styles.sub}>
              {isStudent
                ? "Invite a parent to plan together. You choose what they can see."
                : "You're not in a family yet. Ask your student to send you an invite."}
            </p>
          </div>
        </div>
        <div className={styles.grid}>
          <Members family={null} myUserId={actor.userId} myRole={myRole} timeZone={tz} />
          {isStudent ? <HelperLinks links={links} timeZone={tz} nowIso={nowIso} /> : null}
        </div>
      </>
    );
  }

  const student = family.members.find((x) => x.memberRole === "student") ?? null;
  const parents = family.members.filter((x) => x.memberRole === "parent");
  const parentNames = parents.map((p) => firstName(p.displayName, p.email));
  const everyone = family.members.map((x) => firstName(x.displayName, x.email)).join(" + ");
  const authors = Object.fromEntries(family.members.map((x) => [x.userId, firstName(x.displayName, x.email)]));
  const [tasks, budget, share, room] = await Promise.all([
    listTasks(deps, actor),
    getBudget(deps, actor),
    isStudent ? getShareSettings(deps, actor, actor.userId) : Promise.resolve(null),
    student
      ? createConversation(deps, actor, { room: "family", roomRefId: null, familyId: family.id, title: "" })
      : Promise.resolve(null),
  ]);
  const messages = room ? await getMessages(deps, actor, room.id) : [];

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1>Family</h1>
          <p className={styles.sub}>
            {`${everyone} · each of you controls what you share · paying for the plan doesn't unlock private data`}
          </p>
        </div>
        <div className={styles.row}>
          {isStudent ? <Button variant="line" icon="plus" href="#invite">Invite another parent</Button> : null}
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.col}>
          {isStudent && share ? <ShareToggles settings={share} parentNames={parentNames} /> : null}
          {isStudent ? <p className={styles.sub}>Matches that use details you keep private are visible only to you, even when sensitive sharing is on.</p> : null}
          {isStudent ? null : (
            <ParentSpace
              studentId={student?.userId ?? null}
              studentName={student ? firstName(student.displayName, student.email) : ""}
              budget={budget}
            />
          )}
        </div>
        <div className={styles.col}>
          <FamilyTasks tasks={tasks} myUserId={actor.userId} />
          <div id="family-room" className={styles.room}>
            <Card title="Family room" aside={<Badge tone="neutral">Shared items only</Badge>}>
              {room ? (
                <Thread
                  key={room.id}
                  conversation={room}
                  messages={messages}
                  chips={[]}
                  compact
                  readOnlyCards={!isStudent}
                  authors={authors}
                  placeholder="Ask the crew about your shared plans…"
                  emptyText="Ask a question here and the crew answers with only what you've both shared."
                  timeZone={tz}
                />
              ) : (
                <p className={styles.muted}>The family room opens once a student joins.</p>
              )}
              <p className={styles.muted}>Answers here use only what you've both shared.</p>
            </Card>
          </div>
        </div>
        <div className={styles.col}>
          {isStudent && parentNames.length > 0 ? (
            <Card title={`${parentNames.join(" and ")}'s private space`} aside={<Icon name="lock" />}>
              <p className={styles.small}>
                {`Tax returns, exact income, and their FAFSA details stay with them. You see only what they choose to share, like the income range used for matching.`}
              </p>
            </Card>
          ) : null}
          <BillingNote />
          {isStudent ? <HelperLinks links={links} timeZone={tz} nowIso={nowIso} /> : null}
          <Members family={family} myUserId={actor.userId} myRole={myRole} timeZone={tz} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/web test src/components/family && pnpm --filter @scholarcrew/web typecheck`
Expected: PASS, 3 files, 15 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/family/page.tsx" apps/web/src/components/family/FamilyPage.test.tsx
git commit -m "feat(web): family page with share settings, tasks, family room, and helper links"
```

### P21: Gate

Verification-only task: no new code.

- [ ] **Step 1: Format**

Run: `pnpm format`
Expected: Biome rewrites import order and line wrapping in this plan's files only where needed; exit 0.

- [ ] **Step 2: Typecheck, test, build, lint**

Run:

```bash
pnpm db:up && pnpm db:wait && pnpm db:migrate:test
pnpm --filter @scholarcrew/web typecheck
pnpm --filter @scholarcrew/web test
pnpm --filter @scholarcrew/web build
pnpm lint
```

Expected: `tsc --noEmit` prints nothing; Vitest reports every file passing, including this plan's 30 files and 178 tests (lib 29, shell 28, week 26, crew 28, onboarding 17, settings 23, memory 12, family 15) alongside plan 13's suites; `next build` lists `/week`, `/crew`, `/crew/[conversationId]`, `/onboarding`, `/settings`, `/memory`, `/family` as dynamic (ƒ) routes and finishes; Biome prints no errors.

- [ ] **Step 3: Manual smoke (dev server, fake model)**

Run: `SCHOLARCREW_FAKE_MODEL=1 pnpm dev`, sign in through `/sign-in` with a dev-outbox link (`GET /api/v1/dev/outbox/latest?to=`), then check:

- A new student lands on `/onboarding`; `/week` and `/crew` redirect to it on the server (no flash of the page) until setup is done.
- Birth year 2015 on step 1 shows "ScholarCrew is for students 13 and older" and the session is gone.
- After setup, `/week` shows "Your crew is working" until the first plan arrives. "Plan my week" shows "Planning…" and the page refreshes with the new plan; a parent's `/week` has no such button.
- A crew message shows Queued → Working → the reply card with "What the team used"; an action card turns into its applied label and stays applied after reload. A reply that takes longer than 130 s still arrives without a reload (polling after the stream's `end`).
- Under 640px wide, the sidebar is replaced by the bottom tab bar.
- A parent sees Crew chats (the family room) and only the shared screens in the sidebar; turning a share off on the student's Family page removes its link on the parent's next load.
- The browser's network panel shows no requests to other origins on any of these pages (SE-05).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app apps/web/src/components apps/web/src/lib
git commit -m "test(web): plan 16 gate green"
```

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/web typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/web test` exits 0 (needs the test database from `pnpm db:up && pnpm db:migrate:test`, because plan 13's setup truncates it before every test).
- [ ] `pnpm --filter @scholarcrew/web build` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `grep -rnE "TODO|TBD|implement later" apps/web/src/app/layout.tsx "apps/web/src/app/(app)" apps/web/src/components/{shell,week,crew,onboarding,settings,memory,family} apps/web/src/lib` prints nothing.

## Testing Requirements

Run `pnpm --filter @scholarcrew/web test`. Expected: all files pass; this plan contributes 30 files and 178 tests. They prove:

- **lib:** `usd`, `dateShort`, `daysLabel` match section 9.8 (`"$9,200"`, `"Oct 15"`, `"9 days"`, `"today"`, `"1 day"`, `"3 days ago"`); greetings use the student's time zone; `api` sends cookies and JSON, passes FormData through, returns `undefined` on 204, maps `ErrorBody` to `ApiError` (`limit_reached` → 402 with the server message), turns a bare 413 into an `invalid_input` upload message, and reports network failures; `isLimit` is true only for `limit_reached`; `useJobStream` opens `/api/v1/jobs/:id/events`, follows `job` events, closes on a terminal job without polling, ignores malformed data, falls back to polling `GET /jobs/:id` after an `error` or an early `end` until the job is terminal, reports a lost connection after 3 failed polls, a 404, or a fatal (CLOSED) stream error without polling, and stops with "Still working" after `maxMs`.
- **Shell:** students get the eight-item nav (plus Prep/Impact after Colleges when switched on); parents get This week, Crew chats, Colleges, Money, Family, plus Scholarships, Essays or Story Bank, and Service when the student shares `scholarships`, `essays`/`stories`, or `activities`; Prep and Impact show as "add" linked to `/crew#add-teammate` for students and unlinked for parents; `onboardingRedirect` sends unfinished students to `/onboarding` from every other page and never redirects parents; the layout redirects on the server from `x-pathname` and falls back to the client gate without it; the gate hides the page while redirecting; the bell lists notifications, shows the unread count, marks read, follows only internal links, moves focus into the panel, and closes on Escape (focus back on the bell) or an outside click; the `(app)` error boundary shows a plain message with Try again and never `error.message`, and the loading state is `aria-busy`; no owned file loads third-party scripts, fonts, or remote assets (SE-05).
- **Week:** the header matches mockup 01's "Week of Oct 5 · 4 things · about 2 h 15 min"; checking a plan item PATCHes `/plan-items/:id` and refreshes, failures revert with the server message, parents can't check off; Not this week moves the item to next Monday; the gap card shows the Ledger source line and pending note; deadlines within 14 days get a warning badge; the sweep card and ask bar route to `/scholarships` and `/crew?prefill=` / `/crew?prefill=`; the crew-working state refreshes until the first plan lands; "Plan my week" posts `/plan/regenerate`, follows the job, refreshes when it's terminal, and shows "See plans" on 402 (R2C-5); parents see a shared, read-only week with no "Plan my week" and a plain message when deadlines aren't shared.
- **Crew:** replies name contributors, show steps from plan cards, the receipt with verified dates and sources, and at most one question; applying a card disables the buttons while saving, shows the applied label, and cards in `appliedCardIds` render applied without a request; a 409 `conflict` shows "Already being added…", disables that card, refreshes, and shows no error (R3A-15); crisis replies show 988 first with no buttons, receipt, or chips; sending posts the message, streams progress, refreshes when the job is terminal, and shows the allowance message on 402 with a "See plans" link without losing the draft; a lazy context room (`openRoom`) is created by the first send; read-only threads have no chips or composer and cards can't be applied; family-room bubbles carry their author's first name, so a parent's question is labeled as the parent's (R2C-1); `?ask=` and `?prefill=` fill the composer without sending; failed jobs show Send again and full history pages show Show earlier messages; the side panel lists `GET /jobs?active=1&limit=10` (this tab's questions by their text, other jobs by kind), the last sweep, and the deadline watcher; "In this room" facts describe My Crew, temporary chats, family, and context rooms; parents reach the family room from `/crew`, get 404 on private rooms, and see no student tools; "add" teammate chips POST a confirmed fact with visibility `crew`.
- **Onboarding:** step 1 validation messages; under-13 birth years submit immediately and show the plain explanation, keyed on `forbidden` with `details.reason: "underage"` (ID-03, R3A-17); a 409 `conflict` clears the draft and goes to `/week`, and any other 403 (CSRF) keeps the draft and shows the message; uploads go to `POST /documents` as multipart with the chosen kind, wrong types and big files are refused client-side, and the past-essay note points to the Quill story interview (D9); income needs a range when on; colleges come from `/api/v1/colleges` and cap at 15; the final POST matches `OnboardingInput` with only the opt-ins that are on, then the parent invite is sent; the device draft never contains sensitive answers.
- **Settings:** name and time zone save, for parents as well as students (R2I-3); sign-out leaves for `/sign-in` only on 204 or `unauthenticated`, and a 500 shows the message and stays (R3A-13); notification changes save immediately; the one email switch is labeled "Email me (digest, deadline reminders, new matches)", and turning it off shows the deadline reminders as Off, "In the app only" (R2I-8); a mobile number must match E.164 before it saves, "Text me 1-day reminders" stays disabled until one is saved, and texts wait out quiet hours (NO-05, R2I-9); usage shows used of limit and the reset date; checkout and portal redirect to the returned URL; `?billing=success` polls `GET /billing` (at most five times) and refreshes once the plan changes, and `?billing=cancel` says so (R2I-19); sponsor codes redeem; an extension secret is shown once with a copy button and is gone after Done; tokens show only `sct_••••` (R2I-20) and revoke; exports request, link when ready as JSON and as Markdown (`?format=md`, R3E-11), re-check through `GET /account/exports/latest`, and read as expired after 24 hours; account deletion needs `DELETE` typed exactly; documents download and delete.
- **Memory:** facts show value, source, date, and audience; edits PATCH and replace the old fact; "Scout only" is offered only for the eight `PROFILE_FACT_KEYS`, with its hint (R2I-10); forget deletes; candidates confirm or reject; all eight sensitive kinds start off, yes/no kinds PUT immediately, income asks for a range first, a parent-shared range is labeled, failures revert; parent-shared income starts disabled and the student opts in; sensitive-match identities stay student-only (R4Z-4).
- **Family:** share toggles default to section 3's `DEFAULT_SHARED`, save one category per PUT, and revert on failure, and `sensitive` is labeled as board-only match reasons (R2I-11); only the assignee can mark a family task done; tasks show `Due Oct 15` when dated, a skipped task has a neutral info badge with no check, and a nameless assignee shows 06's fallback whole (R3V-11, R3V-14); the parent budget reads "12,000" as 12000 and keeps Save off for a blank field (R3V-3); helper links offer exactly the five `HELPER_SCOPES` (never essays, chats, costs, or sensitive facts), show the URL once, and revoke; the page gives students share toggles, helper links, and member removal, gives parents the private space (income range and budget), and offers an invite when there's no family yet.

## Review Checklist

- [ ] Every created path is in section 5's plan-16 list (`src/app/layout.tsx`, `globals.css`, `not-found.tsx`, `(app)/layout.tsx`, `(app)/error.tsx` and `(app)/loading.tsx` (pending the §5 line, see deviations), `(app)/{week,crew,onboarding,settings,memory,family}/**`, `src/components/{shell,week,crew,onboarding,settings,memory,family}/**`, `src/lib/**`); nothing under `src/server/**`, `test/**`, configs, or other plans' route groups is touched, and no file reads `@scholarcrew/db` tables directly (`src/lib/owned.ts` is gone, D27).
- [ ] `src/lib/api.ts`, `sse.ts`, and `format.ts` export exactly the section 9.8 names and signatures (`api`, `ApiError` with `code` and `status`, `isLimit`, `useJobStream` with its optional `opts`, `usd`, `dateShort`, `daysLabel`); extras (`apiUrl`, `errorMessage`, `minutesLabel`, ...) are additive. The "Exports for 17/18" list at the top matches the code.
- [ ] `Thread` keeps every prop 17 uses (`conversation`, `messages`, `prefill`, `chips`, `compact`, `readOnlyCards`, `authors`, `placeholder`, `emptyText`, `timeZone`); `openRoom` and `readOnly` are optional additions, and `conversation` only widened to `Conversation | null`.
- [ ] Every stream error message contains "Refresh to check on your crew" (17's tests match it).
- [ ] Components use `@scholarcrew/ui` props exactly as plan 15 defines them (`Button` variants, `Badge` tones, `StatusPill` statuses and `label`, `Toggle` `checked/onChange/label/detail/disabled`, `Modal` `open/title/onClose/footer`, `Table` `columns/rows/rowKey`, `Topbar` `search` + children, `AppShell` props including `className`/`mobileNav`) and only the 24 `ICON_NAMES`; nothing selects AppShell's inner DOM.
- [ ] Server components never pass functions or client-module constants to client components (`Thread` gets its default chips on the client).
- [ ] Pages call services with the page actor from `requireAppActor`/`requirePageActor`; parents only reach shared data through services that enforce share grants (`getThisWeek` with `assertCanRead`, family room via `createConversation`/`getMessages`, nav via `getShareSettings` with the student's id); parents never open a private room (`/crew/[id]` 404s anything but the family room).
- [ ] No sensitive value is written to `localStorage`, `sessionStorage`, URLs, or logs; only opt-in summaries from `listSensitiveFacts` reach the page.
- [ ] Crisis replies (`reply.safety === "crisis"`) never render action cards, chips, or receipts.
- [ ] The deviations at the top of this plan (server onboarding redirect with client fallback, core document/export reads, active-jobs panel, Prep/Impact facts with visibility `crew`, parent crew chats as the family room, admin redirect, the §5 line for the `(app)` boundaries) are recorded in `plans/review-log.md`.
