# Plan 06: Core identity (Agent F)

`@scholarcrew/core` holds the business services. This plan creates the package (manifest, TypeScript and Vitest config, test wiring), declares the subpath exports for every core module of plans 06, 07, and 08 up front, and builds the identity modules: `shared`, `access`, `crypto`, `audit`, `ratelimit`, `auth`, `profile`, `memory`, `family`, `helpers`, `notifications`, `billing`, `documents`, `account`, `apitokens`. Every service takes `(deps, actor, ...)` and checks access first. Not-yours objects throw `not_found`.

Feature IDs: ID-01, ID-02, ID-03, ID-04, ID-05 (core side), ON-01, ON-02 (encrypted uploads, 10 MB cap), ON-03 (starter list rows), ON-04, ON-05, ON-06 (enqueue), ME-01, ME-02, ME-03, ME-04, ME-05, ME-08, ME-09, FA-01, FA-02, FA-04, FA-05, FA-06/MO-10 (budget storage), FA-07, HL-01, HL-04, NO-01, NO-03 (dedupe), NO-04, NO-05 (encrypted phone, prefs, `deliverSms` texts), BI-01..BI-05, CR-10 (allowance), AG-06 (usage counters), SE-01, SE-02, SE-03, SE-04 (sign-in limits, `consumeRateLimit`), SE-07, EX-01 and EX-02 (API tokens, autofill profile).

Rules this plan follows on top of `00-overview.md`:

- Access rules (module `access`): the owner user reads and writes. A parent member of the same family reads only the categories enabled in `shareSettings` (`getShareGrants`) and never writes student data (writes use `assertOwner`). A helper actor reads only its scope for its `studentId`. An admin gets no automatic access to student data. The system actor passes every check. The public actor gets nothing personal. A denied read throws `AppError("not_found")`.
- `assertOwner` and `assertCanRead` pass for the system actor; user-facing writes also call `assertUser`, so the system actor can't use them by accident.
- Every time-dependent insert sets its timestamp from `deps.clock.now()` (not the DB default), so tests with `fixedClock` are exact.
- `@scholarcrew/db` exports the exports table only as `exportsTable` (section 8, review-log D3). Core imports `exportsTable` directly, so no local binding is named `exports`.
- Module `index.ts` files export exactly the section 9.4 names. Extras are marked: `shared` adds `addDays`, `addMinutes`, `monthKey`, `seasonStartYear`, `localTimeParts`, `isValidTimeZone`, `isUuid`, `requireUuid`, `one`, `toUser`, `createFakeStripeGateway`, `FakeStripeGateway`, `TEST_NOW`; `crypto` adds `encryptJson`, `decryptJson`, `Sealed`, `Keyring`, `parseKeyring`, `assertProductionKeyring`, `reencryptAll`; `billing` adds `createFakeStripeGateway`, `seasonPassEnd`; `notifications` adds `secondsUntilQuietEnd`; `ratelimit` adds `waitText` (R3A-11); `profile` adds `isUnderMinAge` (R3V-13); `family/core.ts` exports `unnamedInviter` for `family/settings.ts` (R3V-14). Internal helpers other modules reuse are imported by relative path (`../memory/facts`), never through the package exports.
- Sensitive values never leave `memory/sensitive.ts` except through `readSensitiveForMatcher` (system) and owner summaries. Notification emails contain only the notification's title, body, and link; texts contain only its title and link.

## Files

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/test/global-setup.ts`
- Create: `packages/core/test/setup.ts`
- Create: `packages/core/test/helpers.ts`
- Create: `packages/core/src/shared/types.ts`, `clock.ts`, `dates.ts`, `email.ts`, `log.ts`, `rows.ts`, `stripe-fake.ts`, `test-deps.ts`, `index.ts`
- Create: `packages/core/src/crypto/index.ts`
- Create: `packages/core/src/audit/index.ts`
- Create: `packages/core/src/ratelimit/index.ts`
- Create: `packages/core/src/access/index.ts`
- Create: `packages/core/src/auth/index.ts`
- Create: `packages/core/src/memory/facts.ts`, `decisions.ts`, `sensitive.ts`, `index.ts`
- Create: `packages/core/src/family/core.ts`, `settings.ts`, `index.ts`
- Create: `packages/core/src/billing/plans.ts`, `stripe.ts`, `index.ts`
- Create: `packages/core/src/profile/index.ts`
- Create: `packages/core/src/helpers/index.ts`
- Create: `packages/core/src/apitokens/index.ts`
- Create: `packages/core/src/notifications/index.ts`
- Create: `packages/core/src/documents/index.ts`
- Create: `packages/core/src/account/export.ts`, `delete.ts`, `index.ts`
- Test: `packages/core/src/shared/shared.test.ts`
- Test: `packages/core/src/crypto/crypto.test.ts`, `src/audit/audit.test.ts`, `src/ratelimit/ratelimit.test.ts`
- Test: `packages/core/src/access/access.test.ts`
- Test: `packages/core/src/auth/auth.test.ts`
- Test: `packages/core/src/memory/facts.test.ts`, `decisions.test.ts`, `sensitive.test.ts`
- Test: `packages/core/src/family/core.test.ts`, `settings.test.ts`
- Test: `packages/core/src/billing/plans.test.ts`, `stripe.test.ts`
- Test: `packages/core/src/profile/profile.test.ts`
- Test: `packages/core/src/helpers/helpers.test.ts`
- Test: `packages/core/src/apitokens/apitokens.test.ts`
- Test: `packages/core/src/notifications/notifications.test.ts`
- Test: `packages/core/src/documents/documents.test.ts`
- Test: `packages/core/src/account/export.test.ts`, `delete.test.ts`

Plans 07 and 08 add `src/{scholarships,colleges,essays,prep,impact,helperview}/**` and `src/{money,aid,plan,crew,admin}/**` and reuse this package's `vitest.config.ts`, `test/setup.ts`, and `test/helpers.ts` unchanged.

## Tasks

### F1: Package scaffold and test wiring

Config-only task.

- [ ] **Step 1: Create the package files**

`packages/core/package.json`:

```json
{
  "name": "@scholarcrew/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./shared": "./src/shared/index.ts",
    "./access": "./src/access/index.ts",
    "./crypto": "./src/crypto/index.ts",
    "./audit": "./src/audit/index.ts",
    "./ratelimit": "./src/ratelimit/index.ts",
    "./auth": "./src/auth/index.ts",
    "./profile": "./src/profile/index.ts",
    "./memory": "./src/memory/index.ts",
    "./family": "./src/family/index.ts",
    "./helpers": "./src/helpers/index.ts",
    "./notifications": "./src/notifications/index.ts",
    "./billing": "./src/billing/index.ts",
    "./documents": "./src/documents/index.ts",
    "./account": "./src/account/index.ts",
    "./apitokens": "./src/apitokens/index.ts",
    "./scholarships": "./src/scholarships/index.ts",
    "./colleges": "./src/colleges/index.ts",
    "./essays": "./src/essays/index.ts",
    "./prep": "./src/prep/index.ts",
    "./impact": "./src/impact/index.ts",
    "./helperview": "./src/helperview/index.ts",
    "./money": "./src/money/index.ts",
    "./aid": "./src/aid/index.ts",
    "./plan": "./src/plan/index.ts",
    "./crew": "./src/crew/index.ts",
    "./admin": "./src/admin/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scholarcrew/db": "workspace:*",
    "@scholarcrew/domain": "workspace:*",
    "@scholarcrew/engines": "workspace:*",
    "@scholarcrew/jobs": "workspace:*",
    "drizzle-orm": "^0.44.0",
    "stripe": "^18.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
```

`packages/core/test/global-setup.ts`:

```ts
import { setupTestDatabase } from "@scholarcrew/db/testing";

export default setupTestDatabase;
```

`packages/core/test/setup.ts`:

```ts
import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});
```

`packages/core/test/helpers.ts` (shared by plans 06, 07, 08 tests):

```ts
import { type Db, desc, devOutbox, eq } from "@scholarcrew/db";
import { type Role, type SystemActor, type UserActor, systemActor, userActor } from "@scholarcrew/domain";

export const SYSTEM: SystemActor = systemActor("test");

export function actorOf(user: { id: string; role: Role }): UserActor {
  return userActor(user.id, user.role);
}

/** Newest dev_outbox message sent to `to`. */
export async function latestEmail(db: Db, to: string): Promise<{ subject: string; text: string }> {
  const rows = await db
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.to, to.toLowerCase()))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`No email to ${to}`);
  return { subject: row.subject, text: row.text };
}

/** The `token=` query value in an email body. */
export function tokenIn(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("No token in email text");
  return match[1];
}
```

- [ ] **Step 2: Link the package**

Run: `pnpm install`
Expected: the workspace links `@scholarcrew/core` to `@scholarcrew/{db,domain,engines,jobs}` and installs `drizzle-orm` 0.44.x (plan 07 imports `type SQL` from it) and `stripe` 18.x; `Done`.

- [ ] **Step 3: Typecheck the scaffold**

Run: `pnpm --filter @scholarcrew/core typecheck`
Expected: `tsc --noEmit` prints nothing and exits 0 (the inputs are `test/*.ts` and `vitest.config.ts`; `src/` is empty until F2).

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts packages/core/test
git commit -m "feat(core): package scaffold, subpath exports, test wiring"
```

### F2: Shared deps, clocks, dates, email senders, test deps

- [ ] **Step 1: Write the failing test**

`packages/core/src/shared/shared.test.ts`:

```ts
import { parseKeyring } from "../crypto";

import { devOutbox, eq } from "@scholarcrew/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  calendarShort,
  createFakeStripeGateway,
  createTestDeps,
  errorLabel,
  currentAwardYear,
  currentSeason,
  devOutboxEmailSender,
  fixedClock,
  instantInZone,
  isUuid,
  localTimeParts,
  monthKey,
  nextMonthStartUtc,
  safeTimeZone,
  resendEmailSender,
  systemClock,
  toIso,
  toIsoOrNull,
  todayIn} from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clocks", () => {
  it("fixedClock returns the set instant and can move", () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-06T15:00:00.000Z");
    clock.set("2026-10-07T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("systemClock reads the real time", () => {
    const before = Date.now();
    expect(systemClock().now().getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("dates", () => {
  it("follows the season: the award year of currentSeason, rolling on August 1 (R3V-7)", () => {
    expect(currentAwardYear(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-27");
    expect(currentAwardYear(new Date("2026-08-01T00:00:00.000Z"))).toBe("2027-28");
    expect(currentAwardYear(new Date("2026-08-15T12:00:00.000Z"))).toBe("2027-28");
    expect(currentAwardYear(new Date("2026-10-06T15:00:00.000Z"))).toBe("2027-28");
  });

  it("rolls the season on August 1", () => {
    expect(currentSeason(new Date("2026-10-06T15:00:00.000Z"))).toBe("2026-27");
    expect(currentSeason(new Date("2026-07-31T23:59:59.000Z"))).toBe("2025-26");
    expect(currentSeason(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-27");
    expect(currentSeason(new Date("2099-09-01T00:00:00.000Z"))).toBe("2099-00");
  });

  it("formats instants and months", () => {
    const d = new Date("2026-10-06T15:00:00.000Z");
    expect(toIso(d)).toBe("2026-10-06T15:00:00.000Z");
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(d)).toBe("2026-10-06T15:00:00.000Z");
    expect(monthKey(d)).toBe("2026-10");
    expect(addDays(d, 1).toISOString()).toBe("2026-10-07T15:00:00.000Z");
  });

  it("reads local wall-clock time in a time zone", () => {
    expect(localTimeParts(new Date("2026-10-06T15:00:00.000Z"), "America/Chicago")).toEqual({
      hour: 10,
      minute: 0,
      second: 0,
    });
    expect(localTimeParts(new Date("2026-10-07T03:30:00.000Z"), "America/Chicago").hour).toBe(22);
  });

  it("recognizes uuids", () => {
    expect(isUuid("6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("reads today in a time zone (R3V-9)", () => {
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "America/Chicago")).toBe("2026-10-06");
    expect(todayIn(new Date("2026-10-07T03:00:00.000Z"), "UTC")).toBe("2026-10-07");
  });

  it("writes message dates like the web screens (R3E-8)", () => {
    expect(calendarShort("2026-10-15")).toBe("Oct 15");
    expect(calendarShort("2027-01-01")).toBe("Jan 1");
    expect(instantInZone(new Date("2026-10-21T01:00:00.000Z"), "America/Chicago")).toBe("Oct 20, 2026, 8:00 PM CDT");
    expect(instantInZone(new Date("2026-12-01T15:30:00.000Z"), "America/New_York")).toBe("Dec 1, 2026, 10:30 AM EST");
  });
});

describe("email senders", () => {
  it("devOutboxEmailSender writes the message to dev_outbox", async () => {
    const deps = createTestDeps();
    await devOutboxEmailSender(deps.db).send({ to: "Maya@Example.test", subject: "Hi", text: "Body" });
    const rows = await deps.db.select().from(devOutbox).where(eq(devOutbox.to, "maya@example.test"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("Hi");
  });

  it("resendEmailSender posts to the Resend API", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await resendEmailSender("re_key", "ScholarCrew <crew@scholarcrew.example>").send({
      to: "maya@example.test",
      subject: "Hi",
      text: "Body",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer re_key", "content-type": "application/json" },
      body: JSON.stringify({
        from: "ScholarCrew <crew@scholarcrew.example>",
        to: ["maya@example.test"],
        subject: "Hi",
        text: "Body",
      }),
    });
  });

  it("flattens newlines in subjects for both senders (R3E-10)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await resendEmailSender("re_key", "x@example.test").send({ to: "a@example.test", subject: "Maya\r\ninvited you", text: "t" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body)).subject).toBe("Maya invited you");
    const deps = createTestDeps();
    await devOutboxEmailSender(deps.db).send({ to: "b@example.test", subject: "Maya\ninvited\r\n\nyou", text: "t" });
    const [row] = await deps.db.select().from(devOutbox).where(eq(devOutbox.to, "b@example.test"));
    expect(row?.subject).toBe("Maya invited you");
  });

  it("throws internal when Resend rejects the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await expect(
      resendEmailSender("re_key", "x@example.test").send({ to: "a@example.test", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("createTestDeps", () => {
  it("wires the test defaults", async () => {
    const deps = createTestDeps();
    expect(deps.clock.now().toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(deps.config).toEqual({
      appUrl: "http://localhost:3000",
      keyring: parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) }),
      sessionDays: 30,
      stripePriceFamily: "price_family_test",
      stripePriceSeason: "price_season_test",
      stripeWebhookSecret: "whsec_test",
    });
    await deps.jobs.enqueue("sweep.weekly", {});
    expect(deps.jobs.sent).toEqual([{ name: "sweep.weekly", payload: {} }]);
  });

  it("accepts overrides", () => {
    const deps = createTestDeps({ clock: fixedClock("2027-01-01T00:00:00.000Z"), stripe: null });
    expect(deps.clock.now().getUTCFullYear()).toBe(2027);
    expect(deps.stripe).toBeNull();
  });
});

describe("createFakeStripeGateway", () => {
  it("records checkout sessions, portal sessions, and cancellations", async () => {
    const fake = createFakeStripeGateway();
    const checkout = await fake.createCheckoutSession({
      customerEmail: "maya@example.test",
      priceId: "price_family_test",
      mode: "subscription",
      successUrl: "http://localhost:3000/settings?billing=success",
      cancelUrl: "http://localhost:3000/settings?billing=cancel",
      clientReferenceId: "u1",
    });
    const portal = await fake.createPortalSession({ customerId: "cus_1", returnUrl: "http://localhost:3000/settings" });
    expect(checkout.url).toBe("https://checkout.stripe.test/session/1");
    expect(portal.url).toBe("https://billing.stripe.test/portal/1");
    expect(fake.checkouts[0]?.priceId).toBe("price_family_test");
    expect(fake.portals[0]?.customerId).toBe("cus_1");
    await fake.cancelSubscription("sub_1");
    expect(fake.canceled).toEqual(["sub_1"]);
  });
});

describe("safe driver logs", () => {
  it("includes only safe driver fields", () => {
    const label = errorLabel({ code: "23505", constraint: "users_email_unique", table: "users", message: "Key (email)=(private@example.test) already exists" });
    expect(label).toContain("23505");
    expect(label).not.toContain("@");
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/shared/shared.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/shared/types.ts`:

```ts
import type { Db } from "@scholarcrew/db";
import type { JobsClient } from "@scholarcrew/jobs";

export interface Clock {
  now(): Date;
}

export interface EmailSender {
  send(m: { to: string; subject: string; text: string }, o?: { idempotencyKey?: string }): Promise<void>;
}

/**
 * R2I-9: text-message sender. The worker passes one to `deliverSms` (Twilio in production, the dev
 * outbox otherwise, plan 12 `src/sms.ts`). It isn't part of CoreDeps.
 */
export interface SmsSender {
  send(m: { to: string; text: string }): Promise<void>;
}

export interface StripeGateway {
  createCheckoutSession(i: {
    customerEmail: string;
    priceId: string;
    mode: "subscription" | "payment";
    successUrl: string;
    cancelUrl: string;
    clientReferenceId: string;
  }, o?: { idempotencyKey: string }): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Cancels a subscription at once (account deletion). */
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export interface CoreConfig {
  appUrl: string;
  keyring: import("../crypto").Keyring;
  sessionDays: number;
  stripePriceFamily: string;
  stripePriceSeason: string;
  stripeWebhookSecret: string;
}

export interface CoreDeps {
  db: Db;
  jobs: JobsClient;
  clock: Clock;
  email: EmailSender;
  config: CoreConfig;
  stripe: StripeGateway | null;
}
```

`packages/core/src/shared/clock.ts`:

```ts
import type { Clock } from "./types";

export function systemClock(): Clock {
  return { now: () => new Date() };
}

/** A clock that stays at `iso` until `set` moves it. */
export function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    set(next: string) {
      current = new Date(next).getTime();
    },
  };
}
```

`packages/core/src/shared/dates.ts`:

```ts
import { type IsoDate, type IsoDateTime, awardYearFor } from "@scholarcrew/domain";

const DAY_MS = 86_400_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

export function toIso(d: Date): IsoDateTime {
  return d.toISOString();
}

export function toIsoOrNull(d: Date | null): IsoDateTime | null {
  return d ? d.toISOString() : null;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/**
 * FAFSA award year. Aug 1 rollover (UTC): the award year of the current season (R3V-7), so the
 * checklist year and the college-list season never disagree. 2026-08-15 → "2027-28".
 */
export function currentAwardYear(now: Date): string {
  return awardYearFor(currentSeason(now));
}

/** Admissions season. Rolls over on August 1 (UTC): 2026-10-06 → "2026-27". */
export function currentSeason(now: Date): string {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 7 ? year : year - 1;
  return `${start}-${pad2((start + 1) % 100)}`;
}

export function seasonStartYear(season: string): number {
  return Number.parseInt(season.slice(0, 4), 10);
}

/** Usage month in UTC, "YYYY-MM". */
export function nextMonthStartUtc(now: Date): Date { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)); }
export function safeTimeZone(timeZone: string): string { return isValidTimeZone(timeZone) ? timeZone : "UTC"; }

export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
}

/** Wall-clock hour, minute, and second of `d` in `timeZone` (hour is 0–23). */
export function localTimeParts(d: Date, timeZone: string): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { hour: pick("hour"), minute: pick("minute"), second: pick("second") };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of `now` in `timeZone`, "YYYY-MM-DD". The one core copy (R3V-9); 07, 08, and 12 import it. */
export function todayIn(now: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const CALENDAR_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A calendar date in messages, like 16 `dateShort`: "2026-10-15" → "Oct 15". Formatted in UTC so the day never shifts (R3E-8). */
export function calendarShort(d: IsoDate): string {
  return CALENDAR_SHORT.format(new Date(`${d}T00:00:00.000Z`));
}

/**
 * An instant in messages, in the reader's zone with the zone named (R3E-8):
 * "Oct 20, 2026, 8:00 PM CDT". The narrow no-break space newer ICU puts before AM/PM becomes a
 * plain space, so the text is the same on every Node version.
 */
export function instantInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  })
    .format(d)
    .replace(/\u202f/g, " ");
}
```

`packages/core/src/shared/rows.ts`:

```ts
import type { users } from "@scholarcrew/db";
import { AppError, type User, notFound } from "@scholarcrew/domain";
import { toIso } from "./dates";
import { and, eq, type SQL, type AnyColumn } from "@scholarcrew/db";

export function isUniqueConstraint(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (e.code === "23505" && (e.constraint_name === constraint || e.constraint === constraint)) return true;
  return e.cause !== error && e.cause !== undefined ? isUniqueConstraint(e.cause, constraint) : false;
}

export function ownedWhere(table: { id: AnyColumn; ownerId: AnyColumn }, id: string, ownerId: string): SQL {
  return and(eq(table.id, id), eq(table.ownerId, ownerId))!;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First row of an insert/update `returning()`, or an internal error. */
export function one<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new AppError("internal", `${what} returned no row`);
  return row;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Non-UUID path ids would make Postgres throw; they can't match anything, so they're not_found. */
export function requireUuid(id: string, message = "Not found"): void {
  if (!isUuid(id)) throw notFound(message);
}

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    birthYear: row.birthYear,
    timeZone: row.timeZone,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}
```

`packages/core/src/shared/log.ts`:

```ts
export function errorLabel(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const e = error as Record<string, unknown>;
  return ["code", "constraint", "table"].flatMap((key) => typeof e[key] === "string" ? [`${key}=${e[key]}`] : []).join(" ") || "unknown";
}
```

`packages/core/src/shared/email.ts`:

```ts
import { type Db, devOutbox } from "@scholarcrew/db";
import { AppError } from "@scholarcrew/domain";
import type { EmailSender } from "./types";

/** A subject is one line: a newline from user text (a display name) would get the send rejected (R3E-10). */
const oneLine = (subject: string): string => subject.replace(/[\r\n]+/g, " ");

/** Dev and test sender: stores each message in dev_outbox (read by /api/v1/dev/outbox/latest). */
export function devOutboxEmailSender(db: Db): EmailSender {
  return {
    async send(m) {
      await db.insert(devOutbox).values({ to: m.to.toLowerCase(), subject: oneLine(m.subject), text: m.text });
    },
  };
}

/** Production sender over Resend's REST API. Never logs the body. */
export function resendEmailSender(apiKey: string, from: string): EmailSender {
  return {
    async send(m, o) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(o?.idempotencyKey ? { "Idempotency-Key": o.idempotencyKey } : {}) },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ from, to: [m.to], subject: oneLine(m.subject), text: m.text }),
      });
      if (!res.ok) throw new AppError("internal", `Email send failed with status ${res.status}`, { status: res.status });
    },
  };
}
```

`packages/core/src/shared/stripe-fake.ts`:

```ts
import type { StripeGateway } from "./types";

type CheckoutArgs = Parameters<StripeGateway["createCheckoutSession"]>[0];
type PortalArgs = Parameters<StripeGateway["createPortalSession"]>[0];

export type FakeStripeGateway = StripeGateway & { checkouts: CheckoutArgs[]; portals: PortalArgs[]; canceled: string[] };

/** Records calls and returns numbered fake URLs. No network. */
export function createFakeStripeGateway(): FakeStripeGateway {
  const checkouts: CheckoutArgs[] = [];
  const portals: PortalArgs[] = [];
  const canceled: string[] = [];
  return {
    checkouts,
    portals,
    canceled,
    async createCheckoutSession(i) {
      checkouts.push(i);
      return { url: `https://checkout.stripe.test/session/${checkouts.length}` };
    },
    async createPortalSession(i) {
      portals.push(i);
      return { url: `https://billing.stripe.test/portal/${portals.length}` };
    },
    async cancelSubscription(subscriptionId) {
      if (!canceled.includes(subscriptionId)) canceled.push(subscriptionId);
    },
  };
}
```

`packages/core/src/shared/test-deps.ts`:

```ts
import { parseKeyring } from "../crypto";

import { getTestDb } from "@scholarcrew/db/testing";
import { createMemoryJobsClient } from "@scholarcrew/jobs";
import { fixedClock } from "./clock";
import { devOutboxEmailSender } from "./email";
import { createFakeStripeGateway } from "./stripe-fake";
import type { CoreDeps } from "./types";

export const TEST_NOW = "2026-10-06T15:00:00.000Z";

type MemoryJobs = ReturnType<typeof createMemoryJobsClient>;

/** Deps for service tests: test DB, memory jobs, fixed clock, dev outbox email, fake Stripe. */
export function createTestDeps(o: Partial<CoreDeps> = {}): CoreDeps & { jobs: MemoryJobs } {
  const db = o.db ?? getTestDb();
  const base: CoreDeps & { jobs: MemoryJobs } = {
    db,
    jobs: createMemoryJobsClient(),
    clock: fixedClock(TEST_NOW),
    email: devOutboxEmailSender(db),
    config: {
      appUrl: "http://localhost:3000",
      keyring: parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) }),
      sessionDays: 30,
      stripePriceFamily: "price_family_test",
      stripePriceSeason: "price_season_test",
      stripeWebhookSecret: "whsec_test",
    },
    stripe: createFakeStripeGateway(),
  };
  // Callers that override `jobs` take responsibility for its shape.
  return { ...base, ...o } as CoreDeps & { jobs: MemoryJobs };
}
```

`packages/core/src/shared/index.ts`:

```ts
export type { Clock, CoreConfig, CoreDeps, EmailSender, SmsSender, StripeGateway } from "./types";
export { fixedClock, systemClock } from "./clock";
export {
  addDays,
  addMinutes,
  calendarShort,
  currentAwardYear,
  currentSeason,
  instantInZone,
  isValidTimeZone,
  localTimeParts,
  monthKey,
  nextMonthStartUtc,
  safeTimeZone,
  seasonStartYear,
  toIso,
  toIsoOrNull,
  todayIn,
} from "./dates";
export { devOutboxEmailSender, resendEmailSender } from "./email";
export { isUniqueConstraint, ownedWhere, isUuid, one, requireUuid, toUser } from "./rows";
export { createFakeStripeGateway, type FakeStripeGateway } from "./stripe-fake";
export { errorLabel } from "./log";
export { TEST_NOW, createTestDeps } from "./test-deps";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test && pnpm --filter @scholarcrew/core typecheck`
Expected: PASS, 1 file, 16 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shared
git commit -m "feat(core): shared deps, clocks, dates, email senders, test deps"
```

### F3: Crypto, audit, rate limits

- [ ] **Step 1: Write the failing tests**

`packages/core/src/crypto/crypto.test.ts`:

```ts
import { blobs, eq } from "@scholarcrew/db";
import { SYSTEM } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { describe, expect, it } from "vitest";
import { reencryptAll, assertProductionKeyring, parseKeyring, decrypt, decryptJson, encrypt, encryptJson, randomToken, sha256Hex } from "./index";

const KEY = parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) });

describe("AES-256-GCM", () => {
  it("round-trips bytes with a 12-byte iv and 16-byte tag", () => {
    const sealed = encrypt(KEY, Buffer.from("first-gen student"));
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(sealed.ciphertext.includes(Buffer.from("first-gen"))).toBe(false);
    expect(decrypt(KEY, sealed).toString("utf8")).toBe("first-gen student");
  });

  it("uses a fresh iv each time", () => {
    const a = encrypt(KEY, Buffer.from("same"));
    const b = encrypt(KEY, Buffer.from("same"));
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it("rejects a tampered tag or the wrong key", () => {
    const sealed = encrypt(KEY, Buffer.from("secret"));
    const badTag = Buffer.from(sealed.tag);
    badTag[0] = (badTag[0] ?? 0) ^ 1;
    expect(() => decrypt(KEY, { ...sealed, tag: badTag })).toThrow();
    expect(() => decrypt(parseKeyring({ ENCRYPTION_KEY: "08".repeat(32) }), sealed)).toThrow();
  });

  it("refuses keys that aren't 32 bytes", () => {
    expect(() => parseKeyring({ ENCRYPTION_KEY: "00".repeat(16) })).toThrow(/32 bytes/);
  });

  it("round-trips JSON values", () => {
    expect(decryptJson(KEY, encryptJson(KEY, ["Mexican American"]))).toEqual(["Mexican American"]);
  });
});

describe("tokens and hashes", () => {
  it("makes base64url tokens of the requested size", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(token);
  });

  it("hashes with sha256 hex", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("key rotation and sealed lengths", () => {
  it("decrypts old ciphertext after rotation and pins the GCM tag length", () => {
    const old = parseKeyring({ ENCRYPTION_KEYS: `1:${"07".repeat(32)}` });
    const next = parseKeyring({ ENCRYPTION_KEYS: `2:${"08".repeat(32)},1:${"07".repeat(32)}` });
    const sealed = encrypt(old, Buffer.from("private"));
    expect(decrypt(next, sealed).toString()).toBe("private");
    expect(encrypt(next, Buffer.from("private")).keyId).toBe(2);
    expect(() => decrypt(next, { ...sealed, tag: Buffer.alloc(4) })).toThrow();
    expect(() => decrypt(next, { ...sealed, iv: Buffer.alloc(4) })).toThrow();
  });
  it("rejects production placeholders", () => {
    expect(() => assertProductionKeyring(KEY)).toThrow(/placeholder/);
  });
});


describe("reencryptAll", () => {
  it("moves stored ciphertext to the primary key without changing plaintext", async () => {
    const deps = createTestDeps();
    const sealed = encrypt(deps.config.keyring, Buffer.from("old private bytes"));
    const [row] = await deps.db.insert(blobs).values(sealed).returning();
    if (!row) throw new Error("expected blob");
    deps.config.keyring = parseKeyring({ ENCRYPTION_KEYS: `2:${"08".repeat(32)},1:${"07".repeat(32)}` });
    expect(await reencryptAll(deps, SYSTEM, { batch: 100 })).toBe(1);
    const [updated] = await deps.db.select().from(blobs).where(eq(blobs.id, row.id));
    if (!updated) throw new Error("expected blob");
    expect(updated.keyId).toBe(2);
    expect(decrypt(deps.config.keyring, updated).toString()).toBe("old private bytes");
    expect(await reencryptAll(deps, SYSTEM, { batch: 100 })).toBe(0);
  });
});

```

`packages/core/src/audit/audit.test.ts`:

```ts
import { auditEvents, eq } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { PUBLIC_ACTOR } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { recordAudit } from "./index";

describe("recordAudit", () => {
  it("stores user, helper, system, and public actors", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const helperLinkId = "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f";
    await recordAudit(deps, { actor: actorOf(user), action: "sign_in", entityType: "user", entityId: user.id });
    await recordAudit(deps, {
      actor: { kind: "helper", helperLinkId, studentId: user.id, scope: ["activities"] },
      action: "helper_link_used",
      entityType: "helper_link",
      entityId: helperLinkId,
      meta: { scope: ["activities"] },
    });
    await recordAudit(deps, { actor: SYSTEM, action: "export_ready", entityType: "export", entityId: "e1" });
    await recordAudit(deps, { actor: PUBLIC_ACTOR, action: "viewed", entityType: "page", entityId: "p1" });
    const rows = await deps.db.select().from(auditEvents);
    expect(Object.fromEntries(rows.map((r) => [r.actorKind, r.actorId]))).toEqual({
      user: user.id,
      helper: helperLinkId,
      system: null,
      public: null,
    });
    const [helper] = await deps.db.select().from(auditEvents).where(eq(auditEvents.actorKind, "helper"));
    expect(helper?.meta).toEqual({ scope: ["activities"] });
    expect(rows[0]?.createdAt.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });
});
```

`packages/core/src/ratelimit/ratelimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDeps, fixedClock } from "../shared";
import { consumeRateLimit, waitText } from "./index";

const rule = { key: "ml:ip:203.0.113.9", limit: 5, windowSeconds: 900 };

describe("consumeRateLimit", () => {
  it("allows the limit and refuses the next call", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    await expect(consumeRateLimit(deps, rule)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("counts keys separately", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    await expect(consumeRateLimit(deps, { ...rule, key: "ml:ip:203.0.113.10" })).resolves.toBeUndefined();
  });

  it("starts a new window after windowSeconds", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    for (let n = 0; n < 5; n += 1) await consumeRateLimit(deps, rule);
    clock.set("2026-10-06T15:15:00.000Z");
    await expect(consumeRateLimit(deps, rule)).resolves.toBeUndefined();
  });

  it("is atomic under concurrent calls", async () => {
    const deps = createTestDeps();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeRateLimit(deps, rule)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });

  it("says how long to wait, in details and in the message (R3A-11)", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const crew = { key: "crew:u1", limit: 2, windowSeconds: 600 };
    await consumeRateLimit(deps, crew);
    await consumeRateLimit(deps, crew);
    await expect(consumeRateLimit(deps, crew)).rejects.toMatchObject({
      code: "rate_limited",
      message: "Too many requests. Try again in 10 minutes.",
      details: { retryAfterSeconds: 600 },
    });
    clock.set("2026-10-06T15:01:40.000Z");
    await expect(consumeRateLimit(deps, crew)).rejects.toMatchObject({
      message: "Too many requests. Try again in 9 minutes.",
      details: { retryAfterSeconds: 500 },
    });
    expect([waitText(1), waitText(60), waitText(61), waitText(3599), waitText(3600), waitText(86_400)]).toEqual([
      "a minute",
      "a minute",
      "2 minutes",
      "60 minutes",
      "1 hour",
      "24 hours",
    ]);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/crypto/crypto.test.ts". Does the file exist?` (and the same for `src/audit/audit.test.ts` and `src/ratelimit/ratelimit.test.ts`).

- [ ] **Step 3: Write the implementation**

`packages/core/src/crypto/index.ts`:

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { type Actor, AppError } from "@scholarcrew/domain";
import { and, eq, ne, isNotNull, sensitiveFacts, blobs, notificationPrefs } from "@scholarcrew/db";
import { assertSystem } from "../access";
import type { CoreDeps } from "../shared";

export type Keyring = { primary: { id: number; key: Buffer }; byId: Map<number, Buffer> };
export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyId: number };

export function parseKeyring(env: { ENCRYPTION_KEYS?: string; ENCRYPTION_KEY?: string }): Keyring {
  const entries = (env.ENCRYPTION_KEYS || `1:${env.ENCRYPTION_KEY ?? ""}`).split(",");
  const byId = new Map<number, Buffer>();
  let primary: Keyring["primary"] | undefined;
  for (const entry of entries) {
    const match = /^(\d+):([a-fA-F0-9]{64})$/.exec(entry.trim());
    if (!match) throw new AppError("internal", "Encryption key must be 32 bytes of hex with a key id");
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1 || id > 32767 || byId.has(id)) throw new AppError("internal", "Invalid or duplicate encryption key id");
    const key = Buffer.from(match[2]!, "hex");
    byId.set(id, key);
    primary ??= { id, key };
  }
  if (!primary) throw new AppError("internal", "An encryption key is required");
  return { primary, byId };
}
export function assertProductionKeyring(keyring: Keyring): void {
  for (const key of keyring.byId.values()) {
    if (key.every((byte) => byte === key[0]) || key.toString("hex") === "0123456789abcdef".repeat(4)) {
      throw new AppError("internal", "Replace the placeholder encryption key in production");
    }
  }
}
export function encrypt(keyring: Keyring, plaintext: Buffer): Sealed {
  const { id: keyId, key } = keyring.primary;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyId };
}
export function decrypt(keyring: Keyring, parts: Sealed): Buffer {
  const key = keyring.byId.get(parts.keyId);
  if (!key || parts.iv.length !== 12 || parts.tag.length !== 16) throw new AppError("internal", "Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, parts.iv, { authTagLength: 16 });
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
}
export function encryptJson(keyring: Keyring, value: unknown): Sealed {
  return encrypt(keyring, Buffer.from(JSON.stringify(value), "utf8"));
}
export function decryptJson<T>(keyring: Keyring, parts: Sealed): T {
  return JSON.parse(decrypt(keyring, parts).toString("utf8")) as T;
}

export async function reencryptAll(deps: CoreDeps, system: Actor, o: { batch: number }): Promise<number> {
  assertSystem(system);
  if (!Number.isInteger(o.batch) || o.batch < 1 || o.batch > 1000) throw new AppError("invalid_input", "Batch must be 1–1000");
  const primary = deps.config.keyring.primary.id;
  let changed = 0;
  await deps.db.transaction(async (tx) => {
    const facts = await tx.select().from(sensitiveFacts).where(and(ne(sensitiveFacts.keyId, primary), isNotNull(sensitiveFacts.ciphertext))).limit(o.batch);
    for (const row of facts) {
      if (!row.ciphertext || !row.iv || !row.tag) throw new AppError("internal", "Incomplete encrypted fact");
      const sealed = encrypt(deps.config.keyring, decrypt(deps.config.keyring, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId }));
      changed += (await tx.update(sensitiveFacts).set(sealed).where(and(eq(sensitiveFacts.ownerId, row.ownerId), eq(sensitiveFacts.kind, row.kind), eq(sensitiveFacts.keyId, row.keyId))).returning()).length;
    }
    const files = await tx.select().from(blobs).where(ne(blobs.keyId, primary)).limit(Math.max(0, o.batch - changed));
    for (const row of files) changed += (await tx.update(blobs).set(encrypt(deps.config.keyring, decrypt(deps.config.keyring, row))).where(and(eq(blobs.id, row.id), eq(blobs.keyId, row.keyId))).returning()).length;
    const phones = await tx.select().from(notificationPrefs).where(and(ne(notificationPrefs.phoneKeyId, primary), isNotNull(notificationPrefs.phoneCiphertext))).limit(Math.max(0, o.batch - changed));
    for (const row of phones) {
      if (!row.phoneCiphertext || !row.phoneIv || !row.phoneTag) throw new AppError("internal", "Incomplete encrypted phone");
      const sealed = encrypt(deps.config.keyring, decrypt(deps.config.keyring, { ciphertext: row.phoneCiphertext, iv: row.phoneIv, tag: row.phoneTag, keyId: row.phoneKeyId }));
      changed += (await tx.update(notificationPrefs).set({ phoneCiphertext: sealed.ciphertext, phoneIv: sealed.iv, phoneTag: sealed.tag, phoneKeyId: sealed.keyId }).where(and(eq(notificationPrefs.userId, row.userId), eq(notificationPrefs.phoneKeyId, row.phoneKeyId))).returning()).length;
    }
  });
  return changed;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

`packages/core/src/audit/index.ts`:

```ts
import { auditEvents } from "@scholarcrew/db";
import type { Actor } from "@scholarcrew/domain";
import type { CoreDeps } from "../shared";

function actorIdOf(actor: Actor): string | null {
  if (actor.kind === "user") return actor.userId;
  if (actor.kind === "helper") return actor.helperLinkId;
  return null;
}

/** Appends one audit event. Never put tokens, essay text, or sensitive values in `meta`. */
export async function recordAudit(
  deps: CoreDeps,
  e: { actor: Actor; action: string; entityType: string; entityId: string; meta?: Record<string, unknown> },
): Promise<void> {
  await deps.db.insert(auditEvents).values({
    actorId: actorIdOf(e.actor),
    actorKind: e.actor.kind,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    meta: e.meta ?? {},
    createdAt: deps.clock.now(),
  });
}
```

`packages/core/src/ratelimit/index.ts`:

```ts
import { rateLimits, sql } from "@scholarcrew/db";
import { AppError } from "@scholarcrew/domain";
import { type CoreDeps, one } from "../shared";

/**
 * Fixed-window counter in one atomic upsert. A row whose window started at or before
 * now - windowSeconds restarts at count 1; otherwise the count goes up by one.
 */
export async function consumeRateLimit(
  deps: CoreDeps,
  i: { key: string; limit: number; windowSeconds: number },
): Promise<void> {
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - i.windowSeconds * 1000).toISOString();
  const rows = await deps.db
    .insert(rateLimits)
    .values({ key: i.key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
        count: sql`case when ${rateLimits.windowStart} <= ${cutoffIso}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  const row = one(rows, "rate_limits upsert");
  if (row.count > i.limit) {
    // R3A-11: seconds until this window ends, at least 1. 13's errorResponse copies it into Retry-After.
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((row.windowStart.getTime() + i.windowSeconds * 1000 - now.getTime()) / 1000),
    );
    throw new AppError("rate_limited", `Too many requests. Try again in ${waitText(retryAfterSeconds)}.`, {
      retryAfterSeconds,
    });
  }
}

/** "a minute" up to 60 s, "<n> minutes" under an hour, then "<n> hour(s)"; always rounded up. */
export function waitText(seconds: number): string {
  if (seconds <= 60) return "a minute";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 4 files, 33 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/crypto packages/core/src/audit packages/core/src/ratelimit
git commit -m "feat(core): AES-256-GCM crypto, audit events, atomic rate limits"
```

### F4: Access rules

- [ ] **Step 1: Write the failing test**

`packages/core/src/access/access.test.ts`:

```ts
import { and, eq, shareSettings } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { type HelperActor, PUBLIC_ACTOR } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import {
  assertAdmin,
  assertCanRead,
  assertOwner,
  assertRole,
  assertSystem,
  assertUser,
  canRead,
  familyIdsFor,
  getShareGrants,
  isOwner} from "./index";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

async function setup() {
  const deps = createTestDeps();
  const { user: student } = await factories.student(deps.db);
  const parent = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
  const outsider = await factories.parent(deps.db);
  const admin = await factories.admin(deps.db);
  return { deps, student, parent, family, outsider, admin };
}

describe("actor assertions", () => {
  it("assertUser accepts users and rejects everyone else as unauthenticated", async () => {
    const { student } = await setup();
    const helper: HelperActor = { kind: "helper", helperLinkId: student.id, studentId: student.id, scope: [] };
    expect(codeOf(() => assertUser(PUBLIC_ACTOR))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(SYSTEM))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(helper))).toBe("unauthenticated");
    expect(codeOf(() => assertUser(actorOf(student)))).toBeUndefined();
  });

  it("assertRole and assertAdmin check the role", async () => {
    const { student, admin } = await setup();
    expect(codeOf(() => assertRole(actorOf(student), "parent"))).toBe("forbidden");
    expect(codeOf(() => assertRole(actorOf(student), "student", "parent"))).toBeUndefined();
    expect(codeOf(() => assertAdmin(actorOf(admin)))).toBeUndefined();
    expect(codeOf(() => assertAdmin(actorOf(student)))).toBe("forbidden");
  });

  it("assertSystem accepts only the system actor", async () => {
    const { student } = await setup();
    expect(codeOf(() => assertSystem(SYSTEM))).toBeUndefined();
    expect(codeOf(() => assertSystem(actorOf(student)))).toBe("forbidden");
  });

  it("assertOwner passes the owner and system and hides the object from everyone else", async () => {
    const { student, parent, admin } = await setup();
    const helper: HelperActor = { kind: "helper", helperLinkId: parent.id, studentId: student.id, scope: ["activities"] };
    expect(isOwner(actorOf(student), student.id)).toBe(true);
    expect(isOwner(SYSTEM, student.id)).toBe(false);
    expect(codeOf(() => assertOwner(actorOf(student), student.id))).toBeUndefined();
    expect(codeOf(() => assertOwner(SYSTEM, student.id))).toBeUndefined();
    expect(codeOf(() => assertOwner(actorOf(parent), student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(actorOf(admin), student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(helper, student.id))).toBe("not_found");
    expect(codeOf(() => assertOwner(PUBLIC_ACTOR, student.id))).toBe("not_found");
  });
});

describe("family share grants", () => {
  it("gives a parent the default categories and the student everything", async () => {
    const { deps, student, parent, outsider } = await setup();
    expect(await getShareGrants(deps, student.id, parent.id)).toEqual([
      "deadlines",
      "colleges",
      "costs",
      "scholarships",
      "activities",
    ]);
    expect(await getShareGrants(deps, student.id, student.id)).toHaveLength(9);
    expect(await getShareGrants(deps, student.id, outsider.id)).toEqual([]);
  });

  it("follows the student's current settings", async () => {
    const { deps, student, parent, family } = await setup();
    const row = (category: "essays" | "costs") =>
      and(eq(shareSettings.studentId, student.id), eq(shareSettings.familyId, family.id), eq(shareSettings.category, category));
    await deps.db.update(shareSettings).set({ enabled: true }).where(row("essays"));
    await deps.db.update(shareSettings).set({ enabled: false }).where(row("costs"));
    const grants = await getShareGrants(deps, student.id, parent.id);
    expect(grants).toContain("essays");
    expect(grants).not.toContain("costs");
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
  });

  it("applies the default for a category with no row (R2I-11)", async () => {
    const { deps, student, parent, family } = await setup();
    await deps.db.delete(shareSettings).where(eq(shareSettings.familyId, family.id));
    expect(await getShareGrants(deps, student.id, parent.id)).toEqual([
      "deadlines",
      "colleges",
      "costs",
      "scholarships",
      "activities",
    ]);
    await deps.db.insert(shareSettings).values({ studentId: student.id, familyId: family.id, category: "costs", enabled: false });
    expect(await getShareGrants(deps, student.id, parent.id)).not.toContain("costs");
  });

  it("canRead applies owner, parent, admin, public, and system rules", async () => {
    const { deps, student, parent, outsider, admin } = await setup();
    expect(await canRead(deps, actorOf(student), student.id, "essays")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "essays")).toBe(false);
    expect(await canRead(deps, actorOf(parent), student.id, "sensitive")).toBe(false);
    expect(await canRead(deps, actorOf(outsider), student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, actorOf(admin), student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, PUBLIC_ACTOR, student.id, "deadlines")).toBe(false);
    expect(await canRead(deps, SYSTEM, student.id, "sensitive")).toBe(true);
  });

  it("canRead limits a helper to its scope and its student", async () => {
    const { deps, student } = await setup();
    const { user: other } = await factories.student(deps.db);
    const helper: HelperActor = {
      kind: "helper",
      helperLinkId: other.id,
      studentId: student.id,
      scope: ["activities", "stories"],
    };
    expect(await canRead(deps, helper, student.id, "activities")).toBe(true);
    expect(await canRead(deps, helper, student.id, "colleges")).toBe(false);
    expect(await canRead(deps, helper, student.id, "essays")).toBe(false);
    expect(await canRead(deps, helper, other.id, "activities")).toBe(false);
  });

  it("assertCanRead throws not_found when denied", async () => {
    const { deps, student, parent } = await setup();
    await expect(assertCanRead(deps, actorOf(parent), student.id, "deadlines")).resolves.toBeUndefined();
    await expect(assertCanRead(deps, actorOf(parent), student.id, "chats")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("familyIdsFor lists the user's families", async () => {
    const { deps, student, family, outsider } = await setup();
    expect(await familyIdsFor(deps, student.id)).toEqual([family.id]);
    expect(await familyIdsFor(deps, outsider.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/access/access.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/access/index.ts`:

```ts
import { and, eq, familyMembers, inArray, shareSettings } from "@scholarcrew/db";
import {
  type Actor,
  DEFAULT_SHARED,
  type Role,
  SHARE_CATEGORIES,
  type ShareCategory,
  type SystemActor,
  type UserActor,
  forbidden,
  notFound,
  unauthenticated} from "@scholarcrew/domain";
import type { CoreDeps } from "../shared";

export function assertUser(actor: Actor): asserts actor is UserActor {
  if (actor.kind !== "user") throw unauthenticated();
}

export function assertRole(actor: Actor, ...roles: Role[]): asserts actor is UserActor {
  assertUser(actor);
  if (!roles.includes(actor.role)) throw forbidden("Your account can't do that");
}

export function assertAdmin(actor: Actor): asserts actor is UserActor {
  assertRole(actor, "admin");
}

export function assertSystem(actor: Actor): asserts actor is SystemActor {
  if (actor.kind !== "system") throw forbidden("Only the system can do that");
}

export function isOwner(actor: Actor, ownerId: string): boolean {
  return actor.kind === "user" && actor.userId === ownerId;
}

/** Owner user or system. Everyone else gets not_found so ids can't be probed. */
export function assertOwner(actor: Actor, ownerId: string): void {
  if (actor.kind === "system" || isOwner(actor, ownerId)) return;
  throw notFound();
}

export async function familyIdsFor(deps: CoreDeps, userId: string): Promise<string[]> {
  const rows = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId));
  return rows.map((r) => r.familyId);
}

async function familyIdsAs(deps: CoreDeps, userId: string, memberRole: "student" | "parent"): Promise<string[]> {
  const rows = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.memberRole, memberRole)));
  return rows.map((r) => r.familyId);
}

/**
 * Categories `viewerUserId` may read for `studentId`: everything for the student, the enabled
 * shareSettings categories for a parent member of the student's family, nothing otherwise.
 * A category with no row uses DEFAULT_SHARED, the same rule readShareSettings shows (R2I-11).
 */
export async function getShareGrants(deps: CoreDeps, studentId: string, viewerUserId: string): Promise<ShareCategory[]> {
  if (studentId === viewerUserId) return [...SHARE_CATEGORIES];
  const studentFamilies = await familyIdsAs(deps, studentId, "student");
  if (studentFamilies.length === 0) return [];
  const viewerFamilies = await familyIdsAs(deps, viewerUserId, "parent");
  const shared = studentFamilies.filter((id) => viewerFamilies.includes(id));
  if (shared.length === 0) return [];
  const rows = await deps.db
    .select({ category: shareSettings.category, enabled: shareSettings.enabled })
    .from(shareSettings)
    .where(and(eq(shareSettings.studentId, studentId), inArray(shareSettings.familyId, shared)));
  return SHARE_CATEGORIES.filter((c) => {
    const forCategory = rows.filter((r) => r.category === c);
    return forCategory.length === 0 ? DEFAULT_SHARED[c] : forCategory.some((r) => r.enabled);
  });
}

export async function canRead(deps: CoreDeps, actor: Actor, ownerId: string, category: ShareCategory): Promise<boolean> {
  switch (actor.kind) {
    case "system":
      return true;
    case "public":
      return false;
    case "helper":
      return actor.studentId === ownerId && actor.scope.some((s) => s === category);
    case "user":
      if (actor.userId === ownerId) return true;
      return (await getShareGrants(deps, ownerId, actor.userId)).includes(category);
  }
}

export async function assertCanRead(deps: CoreDeps, actor: Actor, ownerId: string, category: ShareCategory): Promise<void> {
  if (!(await canRead(deps, actor, ownerId, category))) throw notFound();
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 5 files, 44 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/access
git commit -m "feat(core): access rules for owners, family grants, helpers, admin, system"
```

### F5: Magic-link auth and sessions

- [ ] **Step 1: Write the failing test**

`packages/core/src/auth/auth.test.ts`:

```ts
import {
  auditEvents,
  apiTokens,
  eq,
  familyInvites,
  magicLinks,
  notificationPrefs,
  profiles,
  sessions,
  subscriptions,
  users} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { sha256Hex } from "../crypto";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";
import { signOutEverywhere, SESSION_COOKIE, getSessionUser, requestMagicLink, signOut, verifyMagicLink } from "./index";

const IP = "203.0.113.9";

async function linkFor(deps: CoreDeps, email: string): Promise<string> {
  await requestMagicLink(deps, { email, ip: IP });
  return tokenIn((await latestEmail(deps.db, email)).text);
}

describe("requestMagicLink", () => {
  it("emails a one-time link and stores only its hash", async () => {
    const deps = createTestDeps();
    await requestMagicLink(deps, { email: "  Maya@Example.TEST ", ip: IP });
    const mail = await latestEmail(deps.db, "maya@example.test");
    expect(mail.subject).toBe("Your ScholarCrew sign-in link");
    expect(mail.text).toContain("http://localhost:3000/api/v1/auth/verify?token=");
    const token = tokenIn(mail.text);
    const [row] = await deps.db.select().from(magicLinks);
    expect(row?.email).toBe("maya@example.test");
    expect(row?.tokenHash).toBe(sha256Hex(token));
    expect(row?.expiresAt.toISOString()).toBe("2026-10-06T15:15:00.000Z");
  });

  it("rejects an invalid email", async () => {
    await expect(requestMagicLink(createTestDeps(), { email: "nope", ip: IP })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("limits each IP to 5 requests per 15 minutes", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await requestMagicLink(deps, { email: `s${n}@example.test`, ip: IP });
    await expect(requestMagicLink(deps, { email: "s5@example.test", ip: IP })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("limits each email to 5 requests per 15 minutes across IPs", async () => {
    const deps = createTestDeps();
    for (let n = 0; n < 5; n += 1) await requestMagicLink(deps, { email: "maya@example.test", ip: `198.51.100.${n}` });
    await expect(
      requestMagicLink(deps, { email: "MAYA@example.test", ip: "198.51.100.9" }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("verifyMagicLink", () => {
  it("creates a student account with profile, free plan, and prefs on first use", async () => {
    const deps = createTestDeps();
    const result = await verifyMagicLink(deps, { token: await linkFor(deps, "maya@example.test"), userAgent: "vitest" });
    expect(result.isNew).toBe(true);
    expect(result.user).toMatchObject({ email: "maya@example.test", role: "student", status: "active" });
    const id = result.user.id;
    expect(await deps.db.select().from(profiles).where(eq(profiles.userId, id))).toHaveLength(1);
    const [sub] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, id));
    expect(sub?.plan).toBe("free");
    expect(await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, id))).toHaveLength(1);
    const [session] = await deps.db.select().from(sessions).where(eq(sessions.userId, id));
    expect(session?.tokenHash).toBe(sha256Hex(result.sessionToken));
    expect(session?.userAgent).toBe("vitest");
    expect(session?.expiresAt.toISOString()).toBe("2026-11-05T15:00:00.000Z");
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "sign_in"))).toHaveLength(1);
  });

  it("creates a parent when the email has a pending parent invite (R2I-2)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [] });
    const invite = (email: string, o: { memberRole?: "parent" | "student"; acceptedAt?: Date } = {}) =>
      deps.db.insert(familyInvites).values({
        familyId: family.id,
        email,
        memberRole: o.memberRole ?? "parent",
        invitedById: student.id,
        tokenHash: sha256Hex(`invite-${email}`),
        expiresAt: new Date("2026-10-13T15:00:00.000Z"),
        acceptedAt: o.acceptedAt ?? null,
      });
    await invite("dana@example.test");
    await invite("sib@example.test", { memberRole: "student" });
    await invite("used@example.test", { acceptedAt: new Date("2026-10-05T15:00:00.000Z") });
    const dana = await verifyMagicLink(deps, { token: await linkFor(deps, "dana@example.test"), userAgent: "" });
    expect(dana).toMatchObject({ isNew: true, user: { role: "parent" } });
    expect(await deps.db.select().from(profiles).where(eq(profiles.userId, dana.user.id))).toHaveLength(1);
    for (const email of ["sib@example.test", "used@example.test", "new@example.test"]) {
      const r = await verifyMagicLink(deps, { token: await linkFor(deps, email), userAgent: "" });
      expect(r.user.role).toBe("student");
    }
  });

  it("works only once", async () => {
    const deps = createTestDeps();
    const token = await linkFor(deps, "maya@example.test");
    await verifyMagicLink(deps, { token, userAgent: "" });
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("expires after 15 minutes", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const token = await linkFor(deps, "maya@example.test");
    clock.set("2026-10-06T15:15:01.000Z");
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("signs in an existing user without creating another", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "dana@example.test" });
    const result = await verifyMagicLink(deps, { token: await linkFor(deps, "dana@example.test"), userAgent: "" });
    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe(user.id);
    expect(await deps.db.select().from(users).where(eq(users.email, "dana@example.test"))).toHaveLength(1);
  });

  it("refuses blocked and deleted accounts", async () => {
    const deps = createTestDeps();
    await factories.user(deps.db, { email: "kid@example.test", status: "blocked_underage" });
    await factories.user(deps.db, { email: "gone@example.test", status: "deleted" });
    for (const email of ["kid@example.test", "gone@example.test"]) {
      const token = await linkFor(deps, email);
      await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
    }
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
  });

  it("rejects an unknown token", async () => {
    await expect(verifyMagicLink(createTestDeps(), { token: "x".repeat(43), userAgent: "" })).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

describe("sessions", () => {
  it("returns the user and refreshes lastSeenAt at most every 5 minutes", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { sessionToken, user } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    clock.set("2026-10-06T15:04:00.000Z");
    expect((await getSessionUser(deps, sessionToken))?.id).toBe(user.id);
    const [early] = await deps.db.select().from(sessions);
    expect(early?.lastSeenAt.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    clock.set("2026-10-06T15:06:00.000Z");
    await getSessionUser(deps, sessionToken);
    const [late] = await deps.db.select().from(sessions);
    expect(late?.lastSeenAt.toISOString()).toBe("2026-10-06T15:06:00.000Z");
  });

  it("returns null for expired sessions, unknown tokens, and inactive users", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { sessionToken, user } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    expect(await getSessionUser(deps, "")).toBeNull();
    expect(await getSessionUser(deps, "unknown")).toBeNull();
    clock.set("2026-11-05T15:00:01.000Z");
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
    clock.set("2026-10-06T16:00:00.000Z");
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
  });

  it("signOut deletes the session server-side", async () => {
    const deps = createTestDeps();
    const { sessionToken } = await verifyMagicLink(deps, {
      token: await linkFor(deps, "maya@example.test"),
      userAgent: "",
    });
    await signOut(deps, sessionToken);
    expect(await getSessionUser(deps, sessionToken)).toBeNull();
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
  });

  it("names the cookie sc_session", () => {
    expect(SESSION_COOKIE).toBe("sc_session");
  });
});

describe("round 4 session controls", () => {
  it("coalesces magic-link requests within 60 seconds", async () => {
    const clock = fixedClock("2026-10-06T15:00:00Z");
    const deps = createTestDeps({ clock });
    await requestMagicLink(deps, { email: "cooldown@example.test", ip: IP });
    clock.set("2026-10-06T15:00:10Z");
    await requestMagicLink(deps, { email: "cooldown@example.test", ip: IP });
    expect(await deps.db.select().from(magicLinks).where(eq(magicLinks.email, "cooldown@example.test"))).toHaveLength(1);
  });
  it("ends every session and token", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(sessions).values({ userId: user.id, tokenHash: sha256Hex("r4-session"), expiresAt: new Date("2027-01-01") });
    await deps.db.insert(apiTokens).values({ userId: user.id, tokenHash: sha256Hex("r4-token"), scopes: ["autofill"], expiresAt: new Date("2027-01-01") });
    await signOutEverywhere(deps, actorOf(user));
    expect(await deps.db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
    const [token] = await deps.db.select().from(apiTokens).where(eq(apiTokens.userId, user.id));
    expect(token?.revokedAt).not.toBeNull();
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/auth/auth.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/auth/index.ts`:

```ts
import {
  and,
  apiTokens,
  eq,
  familyInvites,
  gt,
  isNull,
  magicLinks,
  notificationPrefs,
  profiles,
  sessions,
  subscriptions,
  users} from "@scholarcrew/db";
import { type Actor, MagicLinkRequest, type User, invalidInput, unauthenticated, userActor } from "@scholarcrew/domain";
import { assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { consumeRateLimit } from "../ratelimit";
import { type CoreDeps, addDays, addMinutes, one, toUser } from "../shared";

export const SESSION_COOKIE = "sc_session";

const LINK_MINUTES = 15;
const LAST_SEEN_REFRESH_MS = 5 * 60_000;

type UserRow = typeof users.$inferSelect;

export async function requestMagicLink(deps: CoreDeps, i: { email: string; ip: string }): Promise<void> {
  const parsed = MagicLinkRequest.safeParse({ email: i.email.trim().toLowerCase() });
  if (!parsed.success) throw invalidInput("Enter a valid email address");
  const email = parsed.data.email.trim().toLowerCase();
  await consumeRateLimit(deps, { key: `ml:ip:${i.ip}`, limit: 5, windowSeconds: 900 });
  await consumeRateLimit(deps, { key: `ml:email:${email}`, limit: 5, windowSeconds: 900 });
  const now = deps.clock.now();
  const [recent] = await deps.db.select().from(magicLinks).where(and(eq(magicLinks.email, email), gt(magicLinks.createdAt, new Date(now.getTime() - 60_000)))).limit(1);
  if (recent) return;
  const token = randomToken(32);
  await deps.db.insert(magicLinks).values({
    email,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt: addMinutes(now, LINK_MINUTES),
  });
  await deps.email.send({
    to: email,
    subject: "Your ScholarCrew sign-in link",
    text: [
      "Use this link to sign in to ScholarCrew:",
      "",
      `${deps.config.appUrl}/api/v1/auth/verify?token=${token}`,
      "",
      "It works once and expires in 15 minutes. If you didn't ask for it, ignore this email.",
    ].join("\n"),
  });
}

/**
 * New accounts are students, except an email with a live, unaccepted parent invite, which becomes a
 * parent (R2I-2): the invitee then skips student onboarding and lands on /week.
 */
async function createAccount(deps: CoreDeps, email: string, now: Date): Promise<UserRow> {
  return deps.db.transaction(async (tx) => {
    const [parentInvite] = await tx
      .select({ id: familyInvites.id })
      .from(familyInvites)
      .where(
        and(
          eq(familyInvites.email, email),
          eq(familyInvites.memberRole, "parent"),
          isNull(familyInvites.acceptedAt),
          gt(familyInvites.expiresAt, now),
        ),
      )
      .limit(1);
    const role = parentInvite ? ("parent" as const) : ("student" as const);
    const [inserted] = await tx.insert(users).values({ email, role, createdAt: now }).onConflictDoNothing({ target: users.email }).returning();
    if (!inserted) return one(await tx.select().from(users).where(eq(users.email, email)), "existing user");
    const created = inserted;
    await tx.insert(profiles).values({ userId: created.id, updatedAt: now });
    await tx.insert(subscriptions).values({ ownerId: created.id, plan: "free", status: "active", createdAt: now, updatedAt: now });
    await tx.insert(notificationPrefs).values({ userId: created.id, updatedAt: now });
    return created;
  });
}

export async function signOutEverywhere(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  await deps.db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, actor.userId));
    await tx.update(apiTokens).set({ revokedAt: deps.clock.now() }).where(eq(apiTokens.userId, actor.userId));
  });
  await recordAudit(deps, { actor, action: "signed_out_everywhere", entityType: "user", entityId: actor.userId });
}

export async function verifyMagicLink(
  deps: CoreDeps,
  i: { token: string; userAgent: string },
): Promise<{ sessionToken: string; user: User; isNew: boolean }> {
  const now = deps.clock.now();
  const invalid = () => unauthenticated("This sign-in link is invalid or has expired");
  if (!i.token) throw invalid();
  // Marking the link used in the same statement that checks it makes it single-use under races.
  const [link] = await deps.db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(and(eq(magicLinks.tokenHash, sha256Hex(i.token)), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, now)))
    .returning();
  if (!link) throw invalid();
  const [existing] = await deps.db.select().from(users).where(eq(users.email, link.email)).limit(1);
  if (existing && existing.status !== "active") throw unauthenticated("This account can't sign in");
  const user = existing ?? (await createAccount(deps, link.email, now));
  const isNew = existing === undefined;
  const sessionToken = randomToken(32);
  await deps.db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256Hex(sessionToken),
    userAgent: i.userAgent.slice(0, 300),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: addDays(now, deps.config.sessionDays),
  });
  await recordAudit(deps, {
    actor: userActor(user.id, user.role),
    action: "sign_in",
    entityType: "user",
    entityId: user.id,
    meta: { isNew },
  });
  return { sessionToken, user: toUser(user), isNew };
}

export async function getSessionUser(deps: CoreDeps, sessionToken: string): Promise<User | null> {
  if (!sessionToken) return null;
  const now = deps.clock.now();
  const [row] = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(sessionToken)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.status !== "active" || row.session.expiresAt <= deps.clock.now()) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() >= LAST_SEEN_REFRESH_MS) {
    await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }
  return toUser(row.user);
}

export async function signOut(deps: CoreDeps, sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  await deps.db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(sessionToken)));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 6 files, 61 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/auth
git commit -m "feat(core): magic-link sign in, sessions, sign out"
```

### F6: Memory facts and candidates

- [ ] **Step 1: Write the failing test**

`packages/core/src/memory/facts.test.ts`:

```ts
import { and, eq, memoryFacts, profiles } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { FactInput, FactValue, FactVisibility } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps, fixedClock } from "../shared";
import {
  confirmCandidate,
  createCandidate,
  createFact,
  crewVisibleFacts,
  forgetFact,
  listFacts,
  rejectCandidate,
  updateFact,
  valueText} from "./facts";

const fact = (key: string, value: FactValue, visibility: FactVisibility = "crew"): FactInput => ({
  key,
  value,
  visibility,
  source: "user_stated",
  sourceRef: null,
});

describe("facts", () => {
  it("creates and lists the owner's facts with value text", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createFact(deps, actorOf(user), fact("intended_majors", ["Mechanical engineering", "Robotics"]));
    expect(created).toMatchObject({
      key: "intended_majors",
      valueText: "Mechanical engineering, Robotics",
      source: "user_stated",
      status: "confirmed",
      createdAt: "2026-10-06T15:00:00.000Z",
    });
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(1);
  });

  it("hides facts from everyone but the owner and system", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const admin = await factories.admin(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Maple"));
    for (const actor of [actorOf(other), actorOf(parent), actorOf(admin)]) {
      await expect(listFacts(deps, actor, user.id)).rejects.toMatchObject({ code: "not_found" });
    }
    expect(await listFacts(deps, SYSTEM, user.id)).toHaveLength(1);
  });

  it("refuses sensitive-looking keys", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const key of ["income_exact", "religion", "citizenship_status"]) {
      await expect(createFact(deps, actorOf(user), fact(key, "x"))).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("editing supersedes the old fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const old = await createFact(deps, actorOf(user), fact("county", "Maple"));
    const next = await updateFact(deps, actorOf(user), old.id, { value: "Travis" });
    expect(next.value).toBe("Travis");
    const listed = await listFacts(deps, actorOf(user), user.id);
    expect(listed.map((f) => f.value)).toEqual(["Travis"]);
    const [oldRow] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.id, old.id));
    expect(oldRow?.supersededById).toBe(next.id);
  });

  it("creating a fact with an existing key supersedes it", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Maple"));
    await createFact(deps, actorOf(user), fact("county", "Travis"));
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => f.value)).toEqual(["Travis"]);
  });

  it("forgetting deletes the fact and its superseded chain", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const a = await createFact(deps, actorOf(user), fact("county", "Maple"));
    const b = await updateFact(deps, actorOf(user), a.id, { value: "Travis" });
    const c = await updateFact(deps, actorOf(user), b.id, { value: "Hays" });
    await forgetFact(deps, actorOf(user), c.id);
    const rows = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.key, "county")));
    expect(rows).toHaveLength(0);
  });

  it("only the owner can edit or forget", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const f = await createFact(deps, actorOf(user), fact("county", "Maple"));
    await expect(updateFact(deps, actorOf(other), f.id, { value: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(forgetFact(deps, actorOf(other), f.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(forgetFact(deps, actorOf(user), "nope")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("candidates", () => {
  it("creates system candidates that expire in 30 days", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(c).toMatchObject({ status: "candidate", source: "crew_inferred", expiresAt: "2026-11-05T15:00:00.000Z" });
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(1);
    await expect(createCandidate(deps, actorOf(user), user.id, fact("x_y", "z"))).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(createCandidate(deps, SYSTEM, user.id, fact("income_guess", "low"))).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("confirming a candidate supersedes the current fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("favorite_subject", "Math"));
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    const confirmed = await confirmCandidate(deps, actorOf(user), c.id);
    expect(confirmed).toMatchObject({ status: "confirmed", expiresAt: null, confirmedAt: "2026-10-06T15:00:00.000Z" });
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => f.value)).toEqual(["Physics"]);
  });

  it("rejecting hides the candidate", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect((await rejectCandidate(deps, actorOf(user), c.id)).status).toBe("rejected");
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(0);
  });

  it("expired candidates are never listed or confirmed", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    clock.set("2026-11-06T15:00:00.000Z");
    expect(await listFacts(deps, actorOf(user), user.id)).toHaveLength(0);
    await expect(confirmCandidate(deps, actorOf(user), c.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("crewVisibleFacts filters by audience, status, and visibility", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("a_crew", "1", "crew"));
    await createFact(deps, actorOf(user), fact("b_family", "2", "crew_family"));
    await createFact(deps, actorOf(user), fact("c_scout", "3", "scout_only"));
    await createFact(deps, actorOf(user), fact("d_private", "4", "private"));
    await createCandidate(deps, SYSTEM, user.id, fact("e_candidate", "5", "crew"));
    expect((await crewVisibleFacts(deps, SYSTEM, user.id, "crew")).map((f) => f.key)).toEqual(["a_crew", "b_family"]);
    expect((await crewVisibleFacts(deps, SYSTEM, user.id, "family")).map((f) => f.key)).toEqual(["b_family"]);
    await expect(crewVisibleFacts(deps, actorOf(user), user.id, "crew")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("renders value text", () => {
    expect(valueText(3.72)).toBe("3.72");
    expect(valueText(true)).toBe("Yes");
    expect(valueText(false)).toBe("No");
    expect(valueText("Maple")).toBe("Maple");
    expect(valueText(["a", "b"])).toBe("a, b");
  });

  it("a confirmed fact retires live candidates for its key (R2C-2)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createCandidate(deps, SYSTEM, user.id, fact("intended_majors", ["Physics"]));
    const confirmed = await createFact(deps, actorOf(user), fact("intended_majors", ["Physics"]));
    const listed = await listFacts(deps, actorOf(user), user.id);
    expect(listed.map((f) => [f.id, f.status])).toEqual([[confirmed.id, "confirmed"]]);
  });

  it("files an identical candidate only once (R2C-15)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    const again = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(again.id).toBe(first.id);
    const rows = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.key, "favorite_subject")));
    expect(rows).toHaveLength(1);
  });

  it("files no candidate that matches a confirmed fact", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const confirmed = await createFact(deps, actorOf(user), fact("favorite_subject", "Physics"));
    const c = await createCandidate(deps, SYSTEM, user.id, fact("favorite_subject", "Physics"));
    expect(c).toMatchObject({ id: confirmed.id, status: "confirmed" });
    const candidates = await deps.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, user.id), eq(memoryFacts.status, "candidate")));
    expect(candidates).toEqual([]);
  });
});

describe("profile columns follow profile facts (R2I-1)", () => {
  const profileOf = async (deps: ReturnType<typeof createTestDeps>, userId: string) =>
    (await deps.db.select().from(profiles).where(eq(profiles.userId, userId)))[0];

  it("createFact writes the column", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), fact("county", "Travis"));
    expect((await profileOf(deps, user.id))?.county).toBe("Travis");
  });

  it("updateFact writes the new value, GPA stored x100", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const gpa = await createFact(deps, actorOf(user), fact("gpa_unweighted", 3.72));
    await updateFact(deps, actorOf(user), gpa.id, { value: 3.9 });
    expect((await profileOf(deps, user.id))?.gpaUnweightedX100).toBe(390);
  });

  it("confirmCandidate writes the candidate's value and retires the other candidates", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const ok = await createCandidate(deps, SYSTEM, user.id, fact("state", "OK"));
    await createCandidate(deps, SYSTEM, user.id, fact("state", "NM"));
    await confirmCandidate(deps, actorOf(user), ok.id);
    expect((await profileOf(deps, user.id))?.state).toBe("OK");
    expect((await listFacts(deps, actorOf(user), user.id)).map((f) => [f.value, f.status])).toEqual([["OK", "confirmed"]]);
  });

  it("forgetting the current fact clears the column", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const county = await createFact(deps, actorOf(user), fact("county", "Travis"));
    await forgetFact(deps, actorOf(user), county.id);
    expect((await profileOf(deps, user.id))?.county).toBe("");
  });

  it("refuses a value the column can't hold", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(createFact(deps, actorOf(user), fact("state", "Texas"))).rejects.toMatchObject({
      code: "invalid_input",
      message: "That value doesn't fit state",
    });
    expect((await profileOf(deps, user.id))?.state).toBe("TX");
    expect(await listFacts(deps, actorOf(user), user.id)).toEqual([]);
  });
});

describe("round 4 sensitive candidate isolation", () => {
  it("refuses aliases and sensitive terms in otherwise ordinary candidate values", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const key of ["first_gen", "military_family", "is_first_generation", "family_income"]) await expect(createFact(deps, actorOf(user), fact(key, "x"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createCandidate(deps, SYSTEM, user.id, fact("background", "first-generation"))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(updateFact(deps, SYSTEM, "00000000-0000-4000-8000-000000000000", { value: "x" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./facts" from "src/memory/facts.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/memory/facts.ts`:

```ts
import { type DbOrTx, sql, and, asc, desc, eq, gt, inArray, isNull, memoryFacts, ne, or, profiles } from "@scholarcrew/db";
import {
  type Actor,
  FactInput,
  FactPatch,
  type FactSource,
  type FactValue,
  type FactVisibility,
  type MemoryFact,
  PROFILE_FACT_KEYS,
  isSensitiveFactKey,
  containsSensitiveTerm,
  ProfilePatch,
  type ProfileFactKey,
  conflict,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertOwner, assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { type CoreDeps, isUniqueConstraint, addDays, ownedWhere, one, requireUuid, toIso, toIsoOrNull } from "../shared";

type FactRow = typeof memoryFacts.$inferSelect;
type ProfileSet = Partial<typeof profiles.$inferInsert>;

const CANDIDATE_DAYS = 30;

export function valueText(value: FactValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function toFact(row: FactRow): MemoryFact {
  const value = row.value as FactValue;
  return {
    id: row.id,
    key: row.key,
    value,
    valueText: valueText(value),
    source: row.source,
    sourceRef: row.sourceRef,
    visibility: row.visibility,
    status: row.status,
    createdAt: toIso(row.createdAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    expiresAt: toIsoOrNull(row.expiresAt),
  };
}

function parseFactInput(i: unknown, sensitiveMessage: string): FactInput {
  const parsed = FactInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the fact and try again", parsed.error.issues);
  if (isSensitiveFactKey(parsed.data.key)) throw invalidInput(sensitiveMessage);
  return parsed.data;
}

async function currentFact(db: DbOrTx, ownerId: string, key: string): Promise<FactRow | undefined> {
  const [row] = await db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, key),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt))
    .limit(1);
  return row;
}

/**
 * R2C-2: once a key has a confirmed fact, its live candidates are settled. They point at the
 * confirmed row through supersededById, so listFacts stops showing them.
 */
async function retireCandidates(db: DbOrTx, ownerId: string, key: string, confirmedId: string): Promise<void> {
  await db
    .update(memoryFacts)
    .set({ supersededById: confirmedId })
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, key),
        eq(memoryFacts.status, "candidate"),
        isNull(memoryFacts.supersededById),
        ne(memoryFacts.id, confirmedId),
      ),
    );
}

type ProfileColumn = { label: string; field: keyof ProfilePatch; set: (v: unknown) => ProfileSet; clear: ProfileSet };

/** The `profiles` column behind each PROFILE_FACT_KEYS key, validated by the matching ProfilePatch field. */
const PROFILE_COLUMNS: Record<ProfileFactKey, ProfileColumn> = {
  class_year: { label: "class year", field: "classYear", set: (v) => ({ classYear: v as number | null }), clear: { classYear: null } },
  high_school: { label: "high school", field: "highSchool", set: (v) => ({ highSchool: v as string }), clear: { highSchool: "" } },
  state: { label: "state", field: "state", set: (v) => ({ state: v as string }), clear: { state: "" } },
  county: { label: "county", field: "county", set: (v) => ({ county: v as string }), clear: { county: "" } },
  city: { label: "city", field: "city", set: (v) => ({ city: v as string }), clear: { city: "" } },
  gpa_unweighted: {
    label: "unweighted GPA",
    field: "gpaUnweighted",
    set: (v) => ({ gpaUnweightedX100: v === null ? null : Math.round((v as number) * 100) }),
    clear: { gpaUnweightedX100: null },
  },
  intended_majors: {
    label: "intended majors",
    field: "intendedMajors",
    set: (v) => ({ intendedMajors: v as string[] }),
    clear: { intendedMajors: [] },
  },
  interests: { label: "interests", field: "interests", set: (v) => ({ interests: v as string[] }), clear: { interests: [] } },
};

function isProfileFactKey(key: string): key is ProfileFactKey {
  return (PROFILE_FACT_KEYS as readonly string[]).includes(key);
}

/**
 * R2I-1: memory writes on the eight profile keys keep `profiles` in step, in the caller's transaction,
 * so the matcher, the crew port, and autofill see edits and forgets at once. Other keys are ignored.
 * `null` clears the column. A value the column can't hold is invalid_input (the transaction rolls back).
 */
async function syncProfileColumn(tx: DbOrTx, ownerId: string, key: string, value: FactValue | null): Promise<void> {
  if (!isProfileFactKey(key)) return;
  const column = PROFILE_COLUMNS[key];
  let set = column.clear;
  if (value !== null) {
    const parsed = ProfilePatch.shape[column.field].safeParse(value);
    if (!parsed.success || parsed.data === undefined) throw invalidInput(`That value doesn't fit ${column.label}`);
    set = column.set(parsed.data);
  }
  await tx.update(profiles).set(set).where(eq(profiles.userId, ownerId));
}

/**
 * Internal (profile and onboarding use it): writes a confirmed fact and supersedes the current
 * confirmed fact with the same key. The same value and visibility is a no-op. Either way, live
 * candidates for the key are retired (R2C-2). It doesn't touch `profiles`: profile writes set both.
 */
export async function writeConfirmedFact(
  db: DbOrTx,
  ownerId: string,
  f: { key: string; value: FactValue; visibility?: FactVisibility; source: FactSource; sourceRef: string | null },
  now: Date,
): Promise<FactRow> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId + ":" + f.key}))`);
  const current = await currentFact(db, ownerId, f.key);
  const visibility = f.visibility ?? current?.visibility ?? "crew";
  if (current && JSON.stringify(current.value) === JSON.stringify(f.value) && current.visibility === visibility) {
    await retireCandidates(db, ownerId, f.key, current.id);
    return current;
  }
  if (current) await db.update(memoryFacts).set({ status: "rejected" }).where(and(eq(memoryFacts.id, current.id), eq(memoryFacts.ownerId, ownerId), isNull(memoryFacts.supersededById)));
  const created = one(
    await db
      .insert(memoryFacts)
      .values({
        ownerId,
        key: f.key,
        value: f.value,
        source: f.source,
        sourceRef: f.sourceRef,
        visibility,
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      })
      .returning(),
    "memory_facts insert",
  );
  if (current) await db.update(memoryFacts).set({ supersededById: created.id, status: "confirmed" }).where(eq(memoryFacts.id, current.id));
  await retireCandidates(db, ownerId, f.key, created.id);
  return created;
}

async function loadFact(deps: CoreDeps, actor: Actor, id: string): Promise<FactRow> {
  requireUuid(id, "Fact not found");
  const [row] = await deps.db.select().from(memoryFacts).where(eq(memoryFacts.id, id)).limit(1);
  if (!row) throw notFound("Fact not found");
  assertOwner(actor, row.ownerId);
  return row;
}

function isLiveCandidate(row: FactRow, now: Date): boolean {
  return row.status === "candidate" && (row.expiresAt === null || row.expiresAt > now);
}

/** Current facts and live candidates. Superseded, rejected, and expired rows are hidden. */
export async function listFacts(deps: CoreDeps, actor: Actor, ownerId: string): Promise<MemoryFact[]> {
  assertOwner(actor, ownerId);
  const now = deps.clock.now();
  const rows = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        isNull(memoryFacts.supersededById),
        ne(memoryFacts.status, "rejected"),
        or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, now)),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt));
  return rows.map(toFact);
}

export async function createFact(deps: CoreDeps, actor: Actor, i: FactInput): Promise<MemoryFact> {
  assertUser(actor);
  const input = parseFactInput(i, "Sensitive facts go in matching opt-ins, not memory");
  const ownerId = actor.userId;
  const row = await deps.db.transaction(async (tx) => {
    const written = await writeConfirmedFact(
      tx,
      ownerId,
      { key: input.key, value: input.value, visibility: input.visibility, source: "user_stated", sourceRef: input.sourceRef },
      deps.clock.now(),
    );
    await syncProfileColumn(tx, ownerId, input.key, input.value);
    return written;
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error, "memory_facts_current_uq")) throw conflict("This fact just changed. Refresh and try again." );
    throw error;
  });
  return toFact(row);
}

export async function updateFact(deps: CoreDeps, actor: Actor, id: string, p: FactPatch): Promise<MemoryFact> {
  assertUser(actor);
  const parsed = FactPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check the fact and try again", parsed.error.issues);
  const row = await loadFact(deps, actor, id);
  if (row.status !== "confirmed" || row.supersededById !== null) {
    throw conflict("Only a current confirmed fact can be edited");
  }
  parseFactInput({ key: row.key, value: parsed.data.value ?? row.value, visibility: parsed.data.visibility ?? row.visibility, sourceRef: row.sourceRef }, "Sensitive facts go in matching opt-ins, not memory");
  const now = deps.clock.now();
  const next = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${row.ownerId + ":" + row.key}))`);
    const claimed = await tx.update(memoryFacts).set({ status: "rejected" }).where(and(eq(memoryFacts.id, row.id), eq(memoryFacts.ownerId, row.ownerId), eq(memoryFacts.status, "confirmed"), isNull(memoryFacts.supersededById))).returning();
    if (!claimed.length) throw conflict("This fact just changed. Refresh and try again.");
    const created = one(await tx.insert(memoryFacts).values({ ownerId: row.ownerId, key: row.key, value: parsed.data.value ?? row.value, source: "user_stated", sourceRef: row.sourceRef, visibility: parsed.data.visibility ?? row.visibility, status: "confirmed", createdAt: now, confirmedAt: now }).returning(), "memory_facts insert");
    await tx.update(memoryFacts).set({ supersededById: created.id, status: "confirmed" }).where(and(eq(memoryFacts.id, row.id), eq(memoryFacts.ownerId, row.ownerId)));
    await retireCandidates(tx, row.ownerId, row.key, created.id);
    await syncProfileColumn(tx, row.ownerId, row.key, created.value as FactValue);
    return created;
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error, "memory_facts_current_uq")) throw conflict("This fact just changed. Refresh and try again." );
    throw error;
  });
  return toFact(next);
}

/**
 * Deletes the fact and every older version it superseded. The crew stops seeing it at once. When the
 * forgotten row is the current confirmed fact for a profile key, the profile column is cleared in the
 * same transaction (R2I-1).
 */
export async function forgetFact(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  const ids = [row.id];
  let frontier = [row.id];
  while (frontier.length > 0) {
    const older = await deps.db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(and(eq(memoryFacts.ownerId, row.ownerId), inArray(memoryFacts.supersededById, frontier)));
    frontier = older.map((r) => r.id).filter((x) => !ids.includes(x));
    ids.push(...frontier);
  }
  const wasCurrent = row.status === "confirmed" && row.supersededById === null;
  await deps.db.transaction(async (tx) => {
    await tx.delete(memoryFacts).where(and(eq(memoryFacts.ownerId, row.ownerId), inArray(memoryFacts.id, ids)));
    if (wasCurrent) await syncProfileColumn(tx, row.ownerId, row.key, null);
  });
  await recordAudit(deps, {
    actor,
    action: "fact_forgotten",
    entityType: "memory_fact",
    entityId: row.id,
    meta: { key: row.key, removed: ids.length },
  });
}

export async function confirmCandidate(deps: CoreDeps, actor: Actor, id: string): Promise<MemoryFact> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  parseFactInput({ key: row.key, value: row.value, visibility: row.visibility, sourceRef: row.sourceRef }, "Sensitive facts go in matching opt-ins, not memory");
  const now = deps.clock.now();
  if (!isLiveCandidate(row, now)) throw notFound("Candidate not found");
  const confirmed = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${row.ownerId + ":" + row.key}))`);
    const current = await currentFact(tx, row.ownerId, row.key);
    if (current) await tx.update(memoryFacts).set({ status: "rejected" }).where(and(eq(memoryFacts.id, current.id), eq(memoryFacts.ownerId, row.ownerId), isNull(memoryFacts.supersededById)));
    const updated = one(
      await tx
        .update(memoryFacts)
        .set({ status: "confirmed", confirmedAt: now, expiresAt: null })
        .where(and(eq(memoryFacts.id, row.id), eq(memoryFacts.ownerId, row.ownerId), eq(memoryFacts.status, "candidate")))
        .returning(),
      "memory_facts update",
    );
    if (current) await tx.update(memoryFacts).set({ supersededById: row.id, status: "confirmed" }).where(and(eq(memoryFacts.id, current.id), eq(memoryFacts.ownerId, row.ownerId)));
    await retireCandidates(tx, row.ownerId, row.key, row.id);
    await syncProfileColumn(tx, row.ownerId, row.key, row.value as FactValue);
    return updated;
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error, "memory_facts_current_uq")) throw conflict("This fact just changed. Refresh and try again." );
    throw error;
  });
  return toFact(confirmed);
}

export async function rejectCandidate(deps: CoreDeps, actor: Actor, id: string): Promise<MemoryFact> {
  assertUser(actor);
  const row = await loadFact(deps, actor, id);
  if (!isLiveCandidate(row, deps.clock.now())) throw notFound("Candidate not found");
  const updated = one(
    await deps.db.update(memoryFacts).set({ status: "rejected" }).where(eq(memoryFacts.id, row.id)).returning(),
    "memory_facts update",
  );
  return toFact(updated);
}

/**
 * System only (crew jobs). Never for sensitive-looking keys. Expires in 30 days unless confirmed.
 * R2C-15: when the owner already has a current confirmed fact or a live candidate with the same key and
 * value, that row comes back and nothing is inserted, so a retried job files each guess once.
 */
export async function createCandidate(deps: CoreDeps, system: Actor, ownerId: string, i: FactInput): Promise<MemoryFact> {
  assertSystem(system);
  const input = parseFactInput(i, "Sensitive facts are never inferred");
  if (containsSensitiveTerm(valueText(input.value))) throw invalidInput("Sensitive facts go in matching opt-ins, not memory");
  const now = deps.clock.now();
  const same = JSON.stringify(input.value);
  const existing = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.key, input.key),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.status, ["confirmed", "candidate"]),
        or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, now)),
      ),
    )
    .orderBy(desc(memoryFacts.createdAt));
  const match = existing.find((r) => JSON.stringify(r.value) === same);
  if (match) return toFact(match);
  const row = one(
    await deps.db
      .insert(memoryFacts)
      .values({
        ownerId,
        key: input.key,
        value: input.value,
        source: "crew_inferred",
        sourceRef: input.sourceRef,
        visibility: input.visibility,
        status: "candidate",
        createdAt: now,
        expiresAt: addDays(now, CANDIDATE_DAYS),
      })
      .returning(),
    "memory_facts insert",
  );
  return toFact(row);
}

/** Confirmed current facts the crew may read: crew → crew + crew_family; family → crew_family only. */
export async function crewVisibleFacts(
  deps: CoreDeps,
  system: Actor,
  ownerId: string,
  audience: "crew" | "family",
): Promise<MemoryFact[]> {
  assertSystem(system);
  const visible: FactVisibility[] = audience === "crew" ? ["crew", "crew_family"] : ["crew_family"];
  const rows = await deps.db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.ownerId, ownerId),
        eq(memoryFacts.status, "confirmed"),
        isNull(memoryFacts.supersededById),
        inArray(memoryFacts.visibility, visible),
      ),
    )
    .orderBy(asc(memoryFacts.key));
  return rows.map(toFact);
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 7 files, 83 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/facts.ts packages/core/src/memory/facts.test.ts
git commit -m "feat(core): memory facts, superseding edits, forget, candidates"
```

### F7: Decisions log

- [ ] **Step 1: Write the failing test**

`packages/core/src/memory/decisions.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import { deleteDecision, listDecisions, recordDecision } from "./decisions";

describe("decisions", () => {
  it("records and lists the student's decisions with a date and reason", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const d = await recordDecision(deps, actorOf(user), { summary: "Skip ED at Northgate", rationale: "Wants to compare aid" });
    expect(d).toMatchObject({
      summary: "Skip ED at Northgate",
      rationale: "Wants to compare aid",
      decidedAt: "2026-10-06T15:00:00.000Z",
      sourceMessageId: null,
    });
    expect(await listDecisions(deps, actorOf(user), user.id)).toEqual([d]);
    expect(await listDecisions(deps, SYSTEM, user.id)).toHaveLength(1);
  });

  it("hides decisions from other users and parents", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await recordDecision(deps, actorOf(user), { summary: "Skip ED", rationale: "" });
    await expect(listDecisions(deps, actorOf(parent), user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only the owner delete", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const d = await recordDecision(deps, actorOf(user), { summary: "Skip ED", rationale: "" });
    await expect(deleteDecision(deps, actorOf(other), d.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteDecision(deps, actorOf(user), d.id);
    expect(await listDecisions(deps, actorOf(user), user.id)).toEqual([]);
  });

  it("validates input", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(recordDecision(deps, actorOf(user), { summary: "", rationale: "" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("stores the chat message a decision came from (R2I-12)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const messageId = randomUUID();
    const d = await recordDecision(deps, actorOf(user), { summary: "Apply EA to State U", rationale: "" }, messageId);
    expect(d.sourceMessageId).toBe(messageId);
    expect((await listDecisions(deps, actorOf(user), user.id))[0]?.sourceMessageId).toBe(messageId);
    await expect(
      recordDecision(deps, actorOf(user), { summary: "x", rationale: "" }, "not-a-message"),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./decisions" from "src/memory/decisions.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/memory/decisions.ts`:

```ts
import { decisions, desc, eq } from "@scholarcrew/db";
import { type Actor, type Decision, DecisionInput, invalidInput, notFound } from "@scholarcrew/domain";
import { assertOwner, assertUser } from "../access";
import { type CoreDeps, ownedWhere, isUuid, one, requireUuid, toIso } from "../shared";

function toDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    summary: row.summary,
    rationale: row.rationale,
    decidedAt: toIso(row.decidedAt),
    sourceMessageId: row.sourceMessageId,
  };
}

export async function listDecisions(deps: CoreDeps, actor: Actor, ownerId: string): Promise<Decision[]> {
  assertOwner(actor, ownerId);
  const rows = await deps.db
    .select()
    .from(decisions)
    .where(eq(decisions.ownerId, ownerId))
    .orderBy(desc(decisions.decidedAt));
  return rows.map(toDecision);
}

/** `sourceMessageId` is the chat message of a `record_decision` card (08 H10 passes it, R2I-12). */
export async function recordDecision(
  deps: CoreDeps,
  actor: Actor,
  i: DecisionInput,
  sourceMessageId: string | null = null,
): Promise<Decision> {
  assertUser(actor);
  const parsed = DecisionInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the decision and try again", parsed.error.issues);
  if (sourceMessageId !== null && !isUuid(sourceMessageId)) throw invalidInput("Unknown source message");
  const row = one(
    await deps.db
      .insert(decisions)
      .values({
        ownerId: actor.userId,
        summary: parsed.data.summary,
        rationale: parsed.data.rationale,
        sourceMessageId,
        decidedAt: deps.clock.now(),
      })
      .returning(),
    "decisions insert",
  );
  return toDecision(row);
}

export async function deleteDecision(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Decision not found");
  const [row] = await deps.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
  if (!row) throw notFound("Decision not found");
  assertOwner(actor, row.ownerId);
  await deps.db.delete(decisions).where(ownedWhere(decisions, id, row.ownerId));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 8 files, 88 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/decisions.ts packages/core/src/memory/decisions.test.ts
git commit -m "feat(core): decisions log"
```

### F8: Sensitive facts and the memory module index

- [ ] **Step 1: Write the failing test**

`packages/core/src/memory/sensitive.test.ts`:

```ts
import { auditEvents, and, eq, familyTasks, sensitiveFacts } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps } from "../shared";
import {
  createFact,
  crewVisibleFacts,
  listSensitiveFacts,
  readSensitiveForMatcher,
  setSensitiveFact,
  shareIncomeRangeToStudent} from "./index";

describe("sensitive facts", () => {
  it("lists all eight kinds, off by default", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const list = await listSensitiveFacts(deps, actorOf(user));
    expect(list).toHaveLength(8);
    expect(list.every((s) => !s.enabled && !s.hasValue && s.displayValue === null)).toBe(true);
  });

  it("encrypts values at rest and summarizes them for the owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const summary = await setSensitiveFact(deps, actorOf(user), { kind: "income_range", enabled: true, value: "48_75k" });
    expect(summary).toEqual({
      kind: "income_range",
      enabled: true,
      hasValue: true,
      displayValue: "$48k–75k",
      sharedByParent: false,
    });
    const [row] = await deps.db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, user.id));
    expect(row?.ciphertext?.includes(Buffer.from("48_75k"))).toBe(false);
    expect(row?.iv).toHaveLength(12);
    expect(row?.tag).toHaveLength(16);
  });

  it("gives the matcher enabled values only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const me = actorOf(user);
    await setSensitiveFact(deps, me, { kind: "first_gen", enabled: true, value: null });
    await setSensitiveFact(deps, me, { kind: "income_range", enabled: true, value: "48_75k" });
    await setSensitiveFact(deps, me, { kind: "heritage", enabled: true, value: ["Mexican American"] });
    await setSensitiveFact(deps, me, { kind: "religion", enabled: false, value: ["Catholic"] });
    expect(await readSensitiveForMatcher(deps, SYSTEM, user.id)).toEqual({
      firstGen: true,
      incomeRange: "48_75k",
      heritage: ["Mexican American"],
      disability: false,
      religion: [],
      militaryFamily: false,
      fosterCare: false,
      noncitizenFilter: false,
    });
    const off = await setSensitiveFact(deps, me, { kind: "income_range", enabled: false, value: null });
    expect(off).toMatchObject({ enabled: false, hasValue: true });
    expect((await readSensitiveForMatcher(deps, SYSTEM, user.id)).incomeRange).toBeNull();
  });

  it("lets only the system read matcher values", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(readSensitiveForMatcher(deps, actorOf(user), user.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never puts sensitive values in crew-visible facts", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await setSensitiveFact(deps, actorOf(user), { kind: "heritage", enabled: true, value: ["Mexican American"] });
    await setSensitiveFact(deps, actorOf(user), { kind: "income_range", enabled: true, value: "under_30k" });
    await createFact(deps, actorOf(user), { key: "county", value: "Maple", visibility: "crew", source: "user_stated", sourceRef: null });
    const facts = await crewVisibleFacts(deps, SYSTEM, user.id, "crew");
    expect(facts.map((f) => f.key)).toEqual(["county"]);
    expect(JSON.stringify(facts)).not.toMatch(/Mexican American|under_30k/);
  });

  it("keeps summaries per owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    await setSensitiveFact(deps, actorOf(user), { kind: "first_gen", enabled: true, value: null });
    expect((await listSensitiveFacts(deps, actorOf(other))).some((s) => s.enabled)).toBe(false);
  });

  it("lets a parent in the family share an income range and completes the task", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(familyTasks).values({
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "share_income_range",
      title: "Share an income range",
    });
    await shareIncomeRangeToStudent(deps, actorOf(parent), { studentId: student.id, range: "30_48k" });
    const income = (await listSensitiveFacts(deps, actorOf(student))).find((s) => s.kind === "income_range");
    expect(income).toMatchObject({ enabled: false, sharedByParent: true, displayValue: "$30k–48k" });
    expect((await readSensitiveForMatcher(deps, SYSTEM, student.id)).incomeRange).toBeNull();
    const [task] = await deps.db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.familyId, family.id), eq(familyTasks.kind, "share_income_range")));
    expect(task?.status).toBe("done");
    expect(task?.completedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("refuses income sharing from outside the family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: otherStudent } = await factories.student(deps.db);
    const outsider = await factories.parent(deps.db);
    await expect(
      shareIncomeRangeToStudent(deps, actorOf(outsider), { studentId: student.id, range: "30_48k" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      shareIncomeRangeToStudent(deps, actorOf(otherStudent), { studentId: student.id, range: "30_48k" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates kind and value shapes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(
      setSensitiveFact(deps, actorOf(user), { kind: "first_gen", enabled: true, value: ["x"] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("private settings audit and parent offerings", () => {
  it("records no kind/value in the audit and preserves student choices", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await setSensitiveFact(deps, actorOf(student), { kind: "income_range", enabled: true, value: "48_75k" });
    await shareIncomeRangeToStudent(deps, actorOf(parent), { studentId: student.id, range: "under_30k" });
    expect((await readSensitiveForMatcher(deps, SYSTEM, student.id)).incomeRange).toBe("48_75k");
    const rows = await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "sensitive_facts_changed"));
    expect(rows).toHaveLength(2);
    for (const row of rows) { expect(row.entityId).toBe(student.id); expect(row.meta).toEqual({}); }
    expect(JSON.stringify(rows)).not.toMatch(/income_range|48_75k|under_30k/);
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/memory/sensitive.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/memory/sensitive.ts`:

```ts
import type { Keyring } from "../crypto";

import { type DbOrTx, and, eq, or, isNull, isNotNull, familyMembers, familyTasks, sensitiveFacts } from "@scholarcrew/db";
import {
  type Actor,
  INCOME_RANGE_LABELS,
  IncomeRange,
  NO_SENSITIVE,
  SENSITIVE_KINDS,
  SensitiveFactInput,
  type SensitiveFactSummary,
  type SensitiveFactValues,
  type SensitiveKind,
  ShareIncomeInput,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { decryptJson, encryptJson } from "../crypto";
import type { CoreDeps } from "../shared";

type SensitiveRow = typeof sensitiveFacts.$inferSelect;
type StoredValue = string | string[];

const VALUE_KINDS: SensitiveKind[] = ["income_range", "heritage", "religion"];

/**
 * Internal (onboarding uses it): upserts one sensitive fact. A new value is encrypted; yes/no kinds
 * never store one; a valued kind toggled without a value keeps its stored value.
 */
export async function writeSensitiveFact(
  db: DbOrTx,
  key: Keyring,
  ownerId: string,
  input: SensitiveFactInput,
  sharedByUserId: string | null,
  now: Date,
): Promise<void> {
  if (input.value !== null) {
    const sealed = encryptJson(key, input.value);
    const set = {
      enabled: input.enabled,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      tag: sealed.tag,
      keyId: sealed.keyId,
      sharedByUserId,
      updatedAt: now,
    };
    await db
      .insert(sensitiveFacts)
      .values({ ownerId, kind: input.kind, ...set })
      .onConflictDoUpdate({ target: [sensitiveFacts.ownerId, sensitiveFacts.kind], set });
    return;
  }
  if (!VALUE_KINDS.includes(input.kind)) {
    const set = { enabled: input.enabled, ciphertext: null, iv: null, tag: null, sharedByUserId: null, updatedAt: now };
    await db
      .insert(sensitiveFacts)
      .values({ ownerId, kind: input.kind, ...set })
      .onConflictDoUpdate({ target: [sensitiveFacts.ownerId, sensitiveFacts.kind], set });
    return;
  }
  await db
    .insert(sensitiveFacts)
    .values({ ownerId, kind: input.kind, enabled: input.enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: [sensitiveFacts.ownerId, sensitiveFacts.kind],
      set: { enabled: input.enabled, updatedAt: now },
    });
}

function readValue(key: Keyring, row: SensitiveRow): StoredValue | null {
  if (!row.ciphertext || !row.iv || !row.tag) return null;
  return decryptJson<StoredValue>(key, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId });
}

function displayValue(value: StoredValue): string {
  if (Array.isArray(value)) return value.join(", ");
  const range = IncomeRange.safeParse(value);
  return range.success ? INCOME_RANGE_LABELS[range.data] : value;
}

function summarize(key: Keyring, kind: SensitiveKind, row: SensitiveRow | undefined): SensitiveFactSummary {
  if (!row) return { kind, enabled: false, hasValue: false, displayValue: null, sharedByParent: false };
  const value = readValue(key, row);
  return {
    kind,
    enabled: row.enabled,
    hasValue: value !== null,
    displayValue: value === null ? null : displayValue(value),
    sharedByParent: row.sharedByUserId !== null,
  };
}

async function rowsFor(db: DbOrTx, ownerId: string): Promise<SensitiveRow[]> {
  return db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, ownerId));
}

/** Owner-only summaries for all eight kinds. */
export async function listSensitiveFacts(deps: CoreDeps, actor: Actor): Promise<SensitiveFactSummary[]> {
  assertUser(actor);
  const rows = await rowsFor(deps.db, actor.userId);
  return SENSITIVE_KINDS.map((kind) =>
    summarize(
      deps.config.keyring,
      kind,
      rows.find((r) => r.kind === kind),
    ),
  );
}

export async function setSensitiveFact(deps: CoreDeps, actor: Actor, i: SensitiveFactInput): Promise<SensitiveFactSummary> {
  assertUser(actor);
  const parsed = SensitiveFactInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the matching fact and try again", parsed.error.issues);
  await writeSensitiveFact(deps.db, deps.config.keyring, actor.userId, parsed.data, null, deps.clock.now());
  await recordAudit(deps, {
    actor,
    action: "sensitive_facts_changed",
    entityType: "user",
    entityId: actor.userId,
    meta: {},
  });
  const rows = await rowsFor(deps.db, actor.userId);
  return summarize(
    deps.config.keyring,
    parsed.data.kind,
    rows.find((r) => r.kind === parsed.data.kind),
  );
}

function listOf(value: StoredValue | null): string[] {
  return Array.isArray(value) ? value : [];
}

/** System only. Disabled kinds read as false / null / []. The result goes to the matcher, never to a model. */
export async function readSensitiveForMatcher(deps: CoreDeps, system: Actor, ownerId: string): Promise<SensitiveFactValues> {
  assertSystem(system);
  const out: SensitiveFactValues = { ...NO_SENSITIVE, heritage: [], religion: [] };
  for (const row of await rowsFor(deps.db, ownerId)) {
    if (!row.enabled) continue;
    const value = readValue(deps.config.keyring, row);
    switch (row.kind) {
      case "first_gen":
        out.firstGen = true;
        break;
      case "income_range": {
        const range = IncomeRange.safeParse(value);
        out.incomeRange = range.success ? range.data : null;
        break;
      }
      case "heritage":
        out.heritage = listOf(value);
        break;
      case "religion":
        out.religion = listOf(value);
        break;
      case "disability":
        out.disability = true;
        break;
      case "military_family":
        out.militaryFamily = true;
        break;
      case "foster_care":
        out.fosterCare = true;
        break;
      case "noncitizen_filter":
        out.noncitizenFilter = true;
        break;
    }
  }
  return out;
}

async function offerIncomeRange(tx: DbOrTx, key: Keyring, studentId: string, range: IncomeRange, parentId: string, now: Date): Promise<void> {
  const sealed = encryptJson(key, range);
  await tx.insert(sensitiveFacts).values({ ownerId: studentId, kind: "income_range", enabled: false, ...sealed, sharedByUserId: parentId, updatedAt: now })
    .onConflictDoUpdate({ target: [sensitiveFacts.ownerId, sensitiveFacts.kind],
      set: { ...sealed, sharedByUserId: parentId, updatedAt: now },
      setWhere: or(isNotNull(sensitiveFacts.sharedByUserId), isNull(sensitiveFacts.ciphertext)),
    });
}

/** A parent shares an income range into a student's matching. Both must be in the same family. */
export async function shareIncomeRangeToStudent(
  deps: CoreDeps,
  actor: Actor,
  i: { studentId: string; range: IncomeRange },
): Promise<void> {
  assertUser(actor);
  const parsed = ShareIncomeInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Choose an income range", parsed.error.issues);
  const { studentId, range } = parsed.data;
  const mine = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, actor.userId), eq(familyMembers.memberRole, "parent")));
  const theirs = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  const familyId = theirs.map((r) => r.familyId).find((id) => mine.some((m) => m.familyId === id));
  if (!familyId) throw notFound("Student not found");
  const now = deps.clock.now();
  const parentId = actor.userId;
  await deps.db.transaction(async (tx) => {
    await offerIncomeRange(tx, deps.config.keyring, studentId, range, parentId, now);
    await tx
      .update(familyTasks)
      .set({ status: "done", completedAt: now })
      .where(
        and(
          eq(familyTasks.familyId, familyId),
          eq(familyTasks.studentId, studentId),
          eq(familyTasks.assigneeId, parentId),
          eq(familyTasks.kind, "share_income_range"),
          eq(familyTasks.status, "todo"),
        ),
      );
  });
  await recordAudit(deps, {
    actor,
    action: "sensitive_facts_changed",
    entityType: "user",
    entityId: studentId,
    meta: {},
  });
}
```

`packages/core/src/memory/index.ts`:

```ts
export {
  confirmCandidate,
  createCandidate,
  createFact,
  crewVisibleFacts,
  forgetFact,
  listFacts,
  rejectCandidate,
  updateFact,
} from "./facts";
export { deleteDecision, listDecisions, recordDecision } from "./decisions";
export {
  listSensitiveFacts,
  readSensitiveForMatcher,
  setSensitiveFact,
  shareIncomeRangeToStudent,
} from "./sensitive";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 9 files, 98 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory
git commit -m "feat(core): encrypted sensitive facts, matcher read, parent income share"
```

### F9: Family membership and invites

- [ ] **Step 1: Write the failing test**

`packages/core/src/family/core.test.ts`:

```ts
import {
  eq,
  families,
  familyBudgets,
  familyInvites,
  familyTasks,
  notifications,
  shareSettings,
  users} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { Actor } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { canRead } from "../access";
import { type CoreDeps, createTestDeps, fixedClock } from "../shared";
import { revokeInvite, acceptInvite, getFamily, invite, leaveFamily, previewInvite, removeMember } from "./core";

async function inviteToken(
  deps: CoreDeps,
  from: Actor,
  email: string,
): Promise<string> {
  await invite(deps, from, { email });
  return tokenIn((await latestEmail(deps.db, email)).text);
}

describe("invite", () => {
  it("creates the family on a student's first invite with default share settings", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    await invite(deps, actorOf(student), { email: "Dana@Example.test" });
    const mail = await latestEmail(deps.db, "dana@example.test");
    expect(mail.subject).toBe("Test Student invited you to their family on ScholarCrew");
    expect(mail.text).toContain("http://localhost:3000/family/join?token=");
    const view = await getFamily(deps, actorOf(student));
    expect(view).toMatchObject({ name: "Test Student's family", myRole: "student" });
    expect(view?.members.map((m) => m.memberRole)).toEqual(["student"]);
    expect(view?.pendingInvites).toEqual([
      { id: expect.any(String), email: "dana@example.test", expiresAt: "2026-10-13T15:00:00.000Z" },
    ]);
    expect(await deps.db.select().from(shareSettings).where(eq(shareSettings.studentId, student.id))).toHaveLength(9);
  });

  it("doesn't let a parent without a family start one", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(invite(deps, actorOf(parent), { email: "kid@example.test" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("caps a family at 4 parents, counting pending invites", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parents = [await factories.parent(deps.db), await factories.parent(deps.db), await factories.parent(deps.db)];
    await factories.family(deps.db, { studentIds: [student.id], parentIds: parents.map((p) => p.id) });
    await invite(deps, actorOf(student), { email: "p4@example.test" });
    await expect(invite(deps, actorOf(student), { email: "p5@example.test" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("refuses a parent's invite even when they are already in the family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await expect(invite(deps, actorOf(parent), { email: "grandma@example.test" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("acceptInvite", () => {
  it("adds a new account as a parent member and sets its role", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    const view = await acceptInvite(deps, actorOf(dana), { token });
    expect(view.myRole).toBe("parent");
    expect(view.members).toHaveLength(2);
    expect(view.pendingInvites).toEqual([]);
    const [row] = await deps.db.select().from(users).where(eq(users.id, dana.id));
    expect(row?.role).toBe("parent");
    const [inv] = await deps.db.select().from(familyInvites);
    expect(inv?.acceptedById).toBe(dana.id);
  });

  it("rejects a different email or an expired link", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const eve = await factories.user(deps.db, { email: "eve@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await expect(acceptInvite(deps, actorOf(eve), { token })).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-13T15:00:01.000Z");
    await expect(acceptInvite(deps, actorOf(dana), { token })).rejects.toMatchObject({ code: "not_found" });
  });

  it("works once and refuses people already in a family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: otherStudent } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const busy = await factories.parent(deps.db, { email: "busy@example.test" });
    await factories.family(deps.db, { studentIds: [otherStudent.id], parentIds: [busy.id] });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await acceptInvite(deps, actorOf(dana), { token });
    await expect(acceptInvite(deps, actorOf(dana), { token })).rejects.toMatchObject({ code: "not_found" });
    const busyToken = await inviteToken(deps, actorOf(student), "busy@example.test");
    await expect(acceptInvite(deps, actorOf(busy), { token: busyToken })).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps the student role for someone who finished student onboarding", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: sibling } = await factories.student(deps.db, { email: "sib@example.test" });
    const token = await inviteToken(deps, actorOf(student), "sib@example.test");
    const view = await acceptInvite(deps, actorOf(sibling), { token });
    expect(view.myRole).toBe("parent");
    const [row] = await deps.db.select().from(users).where(eq(users.id, sibling.id));
    expect(row?.role).toBe("student");
  });

  it("refuses an invite body carrying a student role", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    await expect(invite(deps, actorOf(student), { email: "sib@example.test", memberRole: "student" } as unknown as import("@scholarcrew/domain").InviteInput)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("notifies the inviter and gives a joining parent the share tasks (R2I-7, R2I-15)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test", displayName: "Dana Ruiz" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    await acceptInvite(deps, actorOf(dana), { token });
    const [inv] = await deps.db.select().from(familyInvites);
    const toStudent = await deps.db.select().from(notifications).where(eq(notifications.userId, student.id));
    expect(toStudent).toEqual([
      expect.objectContaining({
        kind: "family",
        title: "Dana joined your family",
        body: "",
        link: "/family",
        dedupeKey: `family-joined:${inv?.id}`,
      }),
    ]);
    const tasks = await deps.db.select().from(familyTasks).where(eq(familyTasks.assigneeId, dana.id));
    expect(tasks.map((t) => [t.kind, t.studentId, t.title]).sort()).toEqual([
      ["share_budget", student.id, "Share a yearly budget for college"],
      ["share_income_range", student.id, "Share an income range for scholarship matching"],
    ]);
    const toDana = await deps.db.select().from(notifications).where(eq(notifications.userId, dana.id));
    expect(toDana.map((n) => n.title).sort()).toEqual([
      "New family task: Share a yearly budget for college",
      "New family task: Share an income range for scholarship matching",
    ]);
    expect(deps.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([]);
  });
});

describe("previewInvite", () => {
  it("shows the inviter's first name, role, and expiry, and hides used or expired invites", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    const token = await inviteToken(deps, actorOf(student), "dana@example.test");
    expect(await previewInvite(deps, token)).toEqual({
      inviterFirstName: "Test",
      memberRole: "parent",
      expiresAt: "2026-10-13T15:00:00.000Z",
    });
    await expect(previewInvite(deps, "not-a-real-token")).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-13T15:00:01.000Z");
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-06T15:00:00.000Z");
    await acceptInvite(deps, actorOf(dana), { token });
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("leaving and removing", () => {
  it("lets a student remove a parent, ending access at once", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await expect(removeMember(deps, actorOf(parent), student.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(true);
    await removeMember(deps, actorOf(student), parent.id);
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
  });

  it("leaving removes the member and deletes an empty family", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await leaveFamily(deps, actorOf(parent));
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    await leaveFamily(deps, actorOf(student));
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(shareSettings).where(eq(shareSettings.studentId, student.id))).toHaveLength(0);
    await expect(leaveFamily(deps, actorOf(student))).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns null for someone outside any family", async () => {
    const deps = createTestDeps();
    const outsider = await factories.parent(deps.db);
    expect(await getFamily(deps, actorOf(outsider))).toBeNull();
  });

  async function withBudgetAndTasks() {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const parent2 = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id, parent2.id] });
    await deps.db.insert(familyBudgets).values({ familyId: family.id, annualUsd: 4600, sharedById: parent.id });
    const task = (assigneeId: string, title: string) => ({
      familyId: family.id,
      assigneeId,
      studentId: student.id,
      kind: "custom" as const,
      title,
    });
    await deps.db.insert(familyTasks).values([task(parent.id, "Gather tax documents"), task(parent2.id, "Call the aid office")]);
    const left = async () => ({
      budgets: await deps.db.select().from(familyBudgets).where(eq(familyBudgets.familyId, family.id)),
      tasks: (await deps.db.select().from(familyTasks).where(eq(familyTasks.familyId, family.id))).map((t) => t.title),
    });
    return { deps, student, parent, parent2, family, left };
  }

  it("removing a parent deletes the budget they shared and their tasks (R2I-14)", async () => {
    const { deps, student, parent, left } = await withBudgetAndTasks();
    await removeMember(deps, actorOf(student), parent.id);
    expect(await left()).toEqual({ budgets: [], tasks: ["Call the aid office"] });
  });

  it("a parent leaving deletes the budget they shared and their tasks", async () => {
    const { deps, parent, family, left } = await withBudgetAndTasks();
    await leaveFamily(deps, actorOf(parent));
    expect(await left()).toEqual({ budgets: [], tasks: ["Call the aid office"] });
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(1);
  });

  it("the last student leaving deletes the family even with parents left", async () => {
    const { deps, student, parent, family } = await withBudgetAndTasks();
    await leaveFamily(deps, actorOf(student));
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(familyTasks)).toHaveLength(0);
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
  });
});

describe("revoking invitations", () => {
  it("lets only the student revoke a pending invite", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    const token = await inviteToken(deps, actorOf(student), "new@example.test");
    const [row] = await deps.db.select().from(familyInvites);
    if (!row) throw new Error("expected invite");
    await expect(revokeInvite(deps, actorOf(parent), row.id)).rejects.toMatchObject({ code: "not_found" });
    await revokeInvite(deps, actorOf(student), row.id);
    await expect(previewInvite(deps, token)).rejects.toMatchObject({ code: "not_found" });
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./core" from "src/family/core.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/family/core.ts`:

```ts
import {
  type DbOrTx,
  and,
  sql,
  asc,
  count,
  eq,
  families,
  familyBudgets,
  familyInvites,
  familyMembers,
  sensitiveFacts,
  familyTasks,
  gt,
  isNull,
  notifications,
  or,
  profiles,
  shareSettings,
  users} from "@scholarcrew/db";
import {
  AcceptInviteInput,
  type Actor,
  DEFAULT_SHARED,
  type FamilyMemberRole,
  type FamilyTaskKind,
  type FamilyView,
  InviteInput,
  type IsoDateTime,
  type Role,
  SHARE_CATEGORIES,
  conflict,
  forbidden,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, isUniqueConstraint, addDays, one, toIso } from "../shared";

export type Membership = { familyId: string; memberRole: FamilyMemberRole };
export type FamilyTaskRow = typeof familyTasks.$inferSelect;

const MAX_PARENTS = 4;
const INVITE_DAYS = 7;

/** R2I-3: what an invite says when the inviter hasn't set a name. Family tasks reuse it for a nameless assignee (R3V-14). */
export function unnamedInviter(role: Role): string {
  return role === "parent" ? "Your family member" : "Your student";
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

/**
 * R2I-15: a `family` bell entry, no email. It's the same row `notify` (F16) writes, inserted here so it
 * commits with the family change (family is built before notifications).
 */
async function familyNotice(db: DbOrTx, i: { userId: string; title: string; dedupeKey: string }, now: Date): Promise<void> {
  await db
    .insert(notifications)
    .values({ userId: i.userId, kind: "family", title: i.title.slice(0, 200), body: "", link: "/family", dedupeKey: i.dedupeKey, createdAt: now })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/**
 * Internal (createTask and acceptInvite use it). An aid-linked task is inserted once per (aidItemId,
 * assignee) and the existing row comes back after that (R2I-6). Only a real insert notifies the
 * assignee, `family-task:<taskId>` (R2I-15).
 */
export async function insertFamilyTask(
  db: DbOrTx,
  i: {
    familyId: string;
    assigneeId: string;
    studentId: string;
    kind: FamilyTaskKind;
    title: string;
    detail?: string;
    dueOn?: string | null;
    aidItemId?: string | null;
  },
  now: Date,
): Promise<{ row: FamilyTaskRow; inserted: boolean }> {
  const values = {
    familyId: i.familyId,
    assigneeId: i.assigneeId,
    studentId: i.studentId,
    kind: i.kind,
    title: i.title,
    detail: i.detail ?? "",
    dueOn: i.dueOn ?? null,
    aidItemId: i.aidItemId ?? null,
    createdAt: now,
  };
  const aidItemId = i.aidItemId ?? null;
  const announce = (row: FamilyTaskRow) =>
    familyNotice(db, { userId: row.assigneeId, title: `New family task: ${row.title}`, dedupeKey: `family-task:${row.id}` }, now);
  if (aidItemId === null) {
    const row = one(await db.insert(familyTasks).values(values).returning(), "family_tasks insert");
    await announce(row);
    return { row, inserted: true };
  }
  const [row] = await db
    .insert(familyTasks)
    .values(values)
    .onConflictDoNothing({ target: [familyTasks.aidItemId, familyTasks.assigneeId] })
    .returning();
  if (row) {
    await announce(row);
    return { row, inserted: true };
  }
  const existing = await db
    .select()
    .from(familyTasks)
    .where(and(eq(familyTasks.aidItemId, aidItemId), eq(familyTasks.assigneeId, i.assigneeId)));
  return { row: one(existing, "family_tasks select"), inserted: false };
}

/** One family per user. Internal; profile, billing, and account reuse it. */
export async function membershipOf(db: DbOrTx, userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ familyId: familyMembers.familyId, memberRole: familyMembers.memberRole })
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

async function addDefaultShares(db: DbOrTx, studentId: string, familyId: string): Promise<void> {
  await db
    .insert(shareSettings)
    .values(SHARE_CATEGORIES.map((category) => ({ studentId, familyId, category, enabled: DEFAULT_SHARED[category] })))
    .onConflictDoNothing();
}

async function parentMembers(db: DbOrTx, familyId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "parent")));
  return row?.n ?? 0;
}

async function pendingParentInvites(db: DbOrTx, familyId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.familyId, familyId),
        eq(familyInvites.memberRole, "parent"),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, now),
      ),
    );
  return row?.n ?? 0;
}

export async function familyView(deps: CoreDeps, familyId: string, myRole: FamilyMemberRole): Promise<FamilyView> {
  const family = one(await deps.db.select().from(families).where(eq(families.id, familyId)), "families select");
  const members = await deps.db
    .select({
      userId: familyMembers.userId,
      displayName: users.displayName,
      email: users.email,
      memberRole: familyMembers.memberRole,
      joinedAt: familyMembers.joinedAt,
    })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(asc(familyMembers.joinedAt));
  const invites = await deps.db
    .select({ id: familyInvites.id, email: familyInvites.email, expiresAt: familyInvites.expiresAt })
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.familyId, familyId),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, deps.clock.now()),
      ),
    )
    .orderBy(asc(familyInvites.createdAt));
  return {
    id: family.id,
    name: family.name,
    myRole,
    members: members.map((m) => ({ ...m, joinedAt: toIso(m.joinedAt) })),
    pendingInvites: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: toIso(i.expiresAt) })),
  };
}

export async function getFamily(deps: CoreDeps, actor: Actor): Promise<FamilyView | null> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  return membership ? familyView(deps, membership.familyId, membership.memberRole) : null;
}

async function startFamily(deps: CoreDeps, student: typeof users.$inferSelect, now: Date): Promise<Membership> {
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${student.id}))`);
    const existing = await membershipOf(tx, student.id);
    if (existing) return existing;
    const name = student.displayName ? `${student.displayName}'s family` : "Family";
    const family = one(
      await tx.insert(families).values({ name, createdById: student.id, createdAt: now }).returning(),
      "families insert",
    );
    await tx.insert(familyMembers).values({ familyId: family.id, userId: student.id, memberRole: "student", joinedAt: now });
    await addDefaultShares(tx, student.id, family.id);
    return { familyId: family.id, memberRole: "student" as const };
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error, "family_members_user_uq")) throw conflict("You're already in a family. Leave it before joining another." );
    throw error;
  });
}

/** Only the student invites. A student with no family creates one on the first invite. */
export async function invite(
  deps: CoreDeps,
  actor: Actor,
  i: InviteInput,
): Promise<void> {
  assertUser(actor);
  const parsed = InviteInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Enter a valid email address");
  const email = parsed.data.email.trim().toLowerCase();
  const memberRole = "parent" as const;
  const now = deps.clock.now();
  const me = one(await deps.db.select().from(users).where(eq(users.id, actor.userId)), "users select");
  if (me.email === email) throw invalidInput("You can't invite yourself");
  let membership = await membershipOf(deps.db, me.id);
  if (!membership) {
    if (me.role !== "student") throw forbidden("A student starts the family. Ask your student to invite you.");
    membership = await startFamily(deps, me, now);
  }
  if (membership.memberRole !== "student") throw forbidden("Ask your student to send the invite.");
  const familyId = membership.familyId;
  const already = await deps.db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(and(eq(familyMembers.familyId, familyId), eq(users.email, email)));
  if (already.length > 0) throw conflict("That person is already in your family");
  if (memberRole === "parent") {
    const used = (await parentMembers(deps.db, familyId)) + (await pendingParentInvites(deps.db, familyId, now));
    if (used >= MAX_PARENTS) throw conflict("A family can have up to 4 parents");
  }
  const token = randomToken();
  await deps.db.insert(familyInvites).values({
    familyId,
    email,
    memberRole,
    invitedById: me.id,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt: addDays(now, INVITE_DAYS),
  });
  const inviter = me.displayName || unnamedInviter(me.role);
  await deps.email.send({
    to: email,
    subject: `${inviter} invited you to their family on ScholarCrew`,
    text: [
      `${inviter} invited you to join their family on ScholarCrew.`,
      "",
      `${deps.config.appUrl}/family/join?token=${token}`,
      "",
      "The link works once and expires in 7 days. You'll only see what they choose to share.",
    ].join("\n"),
  });
  await recordAudit(deps, { actor, action: "family_invite_sent", entityType: "family", entityId: familyId, meta: { memberRole } });
}

export async function revokeInvite(deps: CoreDeps, actor: Actor, inviteId: string): Promise<void> {
  assertUser(actor);
  requireUuid(inviteId, "Invite not found");
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Invite not found");
  const removed = await deps.db.delete(familyInvites).where(and(eq(familyInvites.id, inviteId), eq(familyInvites.familyId, membership.familyId), isNull(familyInvites.acceptedAt))).returning();
  if (!removed.length) throw notFound("Invite not found");
  await recordAudit(deps, { actor, action: "family_invite_revoked", entityType: "family_invite", entityId: inviteId });
}

/**
 * D37: what /family/join shows before sign-in or accept. No actor: the token is the credential.
 * Expired, used, or unknown tokens are not_found. Never returns the invitee's email.
 */
export async function previewInvite(
  deps: CoreDeps,
  token: string,
): Promise<{ inviterFirstName: string; memberRole: FamilyMemberRole; expiresAt: IsoDateTime }> {
  const parsed = AcceptInviteInput.safeParse({ token });
  if (!parsed.success) throw notFound("This invite is invalid or has expired");
  const [row] = await deps.db
    .select({
      memberRole: familyInvites.memberRole,
      expiresAt: familyInvites.expiresAt,
      inviter: users.displayName,
      inviterRole: users.role,
    })
    .from(familyInvites)
    .innerJoin(users, eq(users.id, familyInvites.invitedById))
    .where(
      and(
        eq(familyInvites.tokenHash, sha256Hex(parsed.data.token)),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, deps.clock.now()),
      ),
    )
    .limit(1);
  if (!row) throw notFound("This invite is invalid or has expired");
  return {
    inviterFirstName: firstNameOf(row.inviter) || unnamedInviter(row.inviterRole),
    memberRole: row.memberRole,
    expiresAt: toIso(row.expiresAt),
  };
}

export async function acceptInvite(deps: CoreDeps, actor: Actor, i: AcceptInviteInput): Promise<FamilyView> {
  assertUser(actor);
  const parsed = AcceptInviteInput.safeParse(i);
  const invalid = () => notFound("This invite is invalid or has expired");
  if (!parsed.success) throw invalid();
  const now = deps.clock.now();
  const [inv] = await deps.db
    .select()
    .from(familyInvites)
    .where(
      and(
        eq(familyInvites.tokenHash, sha256Hex(parsed.data.token)),
        isNull(familyInvites.acceptedAt),
        gt(familyInvites.expiresAt, now),
      ),
    )
    .limit(1);
  if (!inv || inv.memberRole !== "parent") throw invalid();
  const [me] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!me || me.email !== inv.email) throw invalid();
  if (await membershipOf(deps.db, me.id)) throw conflict("You're already in a family. Leave it before joining another.");
  if (inv.memberRole === "parent" && (await parentMembers(deps.db, inv.familyId)) >= MAX_PARENTS) {
    throw conflict("A family can have up to 4 parents");
  }
  const [profile] = await deps.db.select().from(profiles).where(eq(profiles.userId, me.id)).limit(1);
  await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${me.id}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${inv.familyId}))`);
    if (await membershipOf(tx, me.id)) throw conflict("You're already in a family. Leave it before joining another.");
    if (await parentMembers(tx, inv.familyId) >= MAX_PARENTS) throw conflict("A family can have up to 4 parents");
    const claimed = await tx
      .update(familyInvites)
      .set({ acceptedAt: now, acceptedById: me.id })
      .where(and(eq(familyInvites.id, inv.id), isNull(familyInvites.acceptedAt)))
      .returning({ id: familyInvites.id });
    if (claimed.length === 0) throw invalid();
    await tx.insert(familyMembers).values({ familyId: inv.familyId, userId: me.id, memberRole: inv.memberRole, joinedAt: now });
    {
      if (me.role === "student" && !profile?.onboardingCompletedAt) {
        await tx.update(users).set({ role: "parent" }).where(eq(users.id, me.id));
      }
      // R2I-7 (FA-05): a joining parent gets the budget task once and an income-range task per student.
      const students = await tx
        .select({ userId: familyMembers.userId })
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, inv.familyId), eq(familyMembers.memberRole, "student")))
        .orderBy(asc(familyMembers.joinedAt), asc(familyMembers.userId));
      const task = { familyId: inv.familyId, assigneeId: me.id };
      const firstStudent = students[0];
      if (firstStudent) {
        await insertFamilyTask(
          tx,
          { ...task, studentId: firstStudent.userId, kind: "share_budget", title: "Share a yearly budget for college" },
          now,
        );
      }
      for (const s of students) {
        await insertFamilyTask(
          tx,
          { ...task, studentId: s.userId, kind: "share_income_range", title: "Share an income range for scholarship matching" },
          now,
        );
      }
    }
    await familyNotice(
      tx,
      {
        userId: inv.invitedById,
        title: `${firstNameOf(me.displayName) || "Your family member"} joined your family`,
        dedupeKey: `family-joined:${inv.id}`,
      },
      now,
    );
  }).catch((error: unknown) => {
    if (isUniqueConstraint(error, "family_members_user_uq")) throw conflict("You're already in a family. Leave it before joining another." );
    throw error;
  });
  await recordAudit(deps, {
    actor,
    action: "family_joined",
    entityType: "family",
    entityId: inv.familyId,
    meta: { memberRole: inv.memberRole },
  });
  return familyView(deps, inv.familyId, inv.memberRole);
}

/**
 * Internal: what a departing member leaves behind in one family (R2I-14). Their shared budget and the
 * tasks assigned to them go; a departing student also takes the tasks about them. When no student is
 * left, the family goes too (cascading to members, invites, tasks, and budgets).
 */
async function clearDeparted(tx: DbOrTx, familyId: string, userId: string, memberRole: FamilyMemberRole): Promise<void> {
  await tx.delete(familyInvites).where(and(eq(familyInvites.familyId, familyId), eq(familyInvites.invitedById, userId), isNull(familyInvites.acceptedAt)));
  await tx.delete(sensitiveFacts).where(and(eq(sensitiveFacts.kind, "income_range"), eq(sensitiveFacts.sharedByUserId, userId)));
  await tx.delete(familyBudgets).where(and(eq(familyBudgets.familyId, familyId), eq(familyBudgets.sharedById, userId)));
  await tx
    .delete(familyTasks)
    .where(
      and(
        eq(familyTasks.familyId, familyId),
        memberRole === "student"
          ? or(eq(familyTasks.assigneeId, userId), eq(familyTasks.studentId, userId))
          : eq(familyTasks.assigneeId, userId),
      ),
    );
  const [students] = await tx
    .select({ n: count() })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")));
  if ((students?.n ?? 0) === 0) await tx.delete(families).where(eq(families.id, familyId));
}

/** A student removes a parent. Access ends on the next request. */
export async function removeMember(deps: CoreDeps, actor: Actor, userId: string): Promise<void> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Member not found");
  await deps.db.transaction(async (tx) => {
    const removed = await tx
      .delete(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, membership.familyId),
          eq(familyMembers.userId, userId),
          eq(familyMembers.memberRole, "parent"),
        ),
      )
      .returning({ userId: familyMembers.userId });
    if (removed.length === 0) throw notFound("Member not found");
    await clearDeparted(tx, membership.familyId, userId, "parent");
  });
  await recordAudit(deps, {
    actor,
    action: "family_member_removed",
    entityType: "family",
    entityId: membership.familyId,
    meta: { userId },
  });
}

export async function leaveFamily(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) throw notFound("You're not in a family");
  const userId = actor.userId;
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(familyMembers)
      .where(and(eq(familyMembers.familyId, membership.familyId), eq(familyMembers.userId, userId)));
    await tx
      .delete(shareSettings)
      .where(and(eq(shareSettings.familyId, membership.familyId), eq(shareSettings.studentId, userId)));
    await clearDeparted(tx, membership.familyId, userId, membership.memberRole);
  });
  await recordAudit(deps, { actor, action: "family_left", entityType: "family", entityId: membership.familyId });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 10 files, 116 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/family/core.ts packages/core/src/family/core.test.ts
git commit -m "feat(core): family creation, invites, accept, remove, leave"
```

### F10: Share settings, family budget, family tasks, and the family index

- [ ] **Step 1: Write the failing test**

`packages/core/src/family/settings.test.ts`:

```ts
import { aidChecklistItems, eq, familyTasks, notifications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { DEFAULT_SHARED } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { canRead } from "../access";
import { shareIncomeRangeToStudent } from "../memory";
import { createTestDeps } from "../shared";
import {
  acceptInvite,
  createTask,
  getBudget,
  getShareSettings,
  invite,
  revokeInvite,
  listTasks,
  setBudget,
  updateShareSettings,
  updateTask} from "./index";

async function setup() {
  const deps = createTestDeps();
  const { user: student } = await factories.student(deps.db);
  const parent = await factories.parent(deps.db);
  const parent2 = await factories.parent(deps.db);
  const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id, parent2.id] });
  const outsider = await factories.parent(deps.db);
  return { deps, student, parent, parent2, family, outsider };
}

describe("share settings", () => {
  it("lets members read the student's settings with defaults", async () => {
    const { deps, student, parent, family, outsider } = await setup();
    const own = await getShareSettings(deps, actorOf(student), student.id);
    expect(own).toEqual({ studentId: student.id, familyId: family.id, categories: DEFAULT_SHARED });
    expect(await getShareSettings(deps, actorOf(parent), student.id)).toEqual(own);
    await expect(getShareSettings(deps, actorOf(outsider), student.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only the student edit them, and parents see the change on the next request", async () => {
    const { deps, student, parent } = await setup();
    const next = await updateShareSettings(deps, actorOf(student), { categories: { essays: true, costs: false } });
    expect(next.categories.essays).toBe(true);
    expect(next.categories.costs).toBe(false);
    expect(await canRead(deps, actorOf(parent), student.id, "essays")).toBe(true);
    expect(await canRead(deps, actorOf(parent), student.id, "costs")).toBe(false);
    await expect(updateShareSettings(deps, actorOf(parent), { categories: { chats: true } })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("family budget", () => {
  it("parents share it and members read it", async () => {
    const { deps, student, parent, outsider } = await setup();
    const budget = await setBudget(deps, actorOf(parent), { annualUsd: 4600 });
    expect(budget).toMatchObject({ annualUsd: 4600, sharedById: parent.id, updatedAt: "2026-10-06T15:00:00.000Z" });
    expect(await getBudget(deps, actorOf(student))).toEqual(budget);
    expect(await getBudget(deps, actorOf(outsider))).toBeNull();
    await expect(setBudget(deps, actorOf(student), { annualUsd: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setBudget(deps, actorOf(parent), { annualUsd: -5 })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("completes the parent's share_budget task", async () => {
    const { deps, student, parent, family } = await setup();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "share_budget",
      title: "Share a yearly budget",
    });
    await setBudget(deps, actorOf(parent), { annualUsd: 4600 });
    expect((await listTasks(deps, actorOf(parent)))[0]?.status).toBe("done");
  });
});

describe("family tasks", () => {
  it("createTask is system-only and checks the assignee", async () => {
    const { deps, student, parent, family, outsider } = await setup();
    const input = { familyId: family.id, assigneeId: parent.id, studentId: student.id, kind: "fafsa_contributor" as const, title: "Create your StudentAid.gov account" };
    await expect(createTask(deps, actorOf(student), input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createTask(deps, SYSTEM, { ...input, assigneeId: outsider.id })).rejects.toMatchObject({
      code: "invalid_input",
    });
    const task = await createTask(deps, SYSTEM, { ...input, dueOn: "2026-10-31" });
    expect(task).toMatchObject({ assigneeName: "Test Parent", status: "todo", detail: "", dueOn: "2026-10-31" });
  });

  it("lets the assignee or the student update a task", async () => {
    const { deps, student, parent, parent2, family, outsider } = await setup();
    const task = await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "review_costs",
      title: "Review costs",
    });
    await expect(updateTask(deps, actorOf(parent2), task.id, { status: "done" })).rejects.toMatchObject({ code: "not_found" });
    await expect(updateTask(deps, actorOf(outsider), task.id, { status: "done" })).rejects.toMatchObject({ code: "not_found" });
    const done = await updateTask(deps, actorOf(parent), task.id, { status: "done" });
    expect(done.completedAt).toBe("2026-10-06T15:00:00.000Z");
    const reopened = await updateTask(deps, actorOf(student), task.id, { status: "todo" });
    expect(reopened).toMatchObject({ status: "todo", completedAt: null });
  });

  it("lists family tasks to members only", async () => {
    const { deps, student, parent, parent2, family, outsider } = await setup();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "custom",
      title: "Gather tax documents",
    });
    expect(await listTasks(deps, actorOf(parent2))).toHaveLength(1);
    expect(await listTasks(deps, actorOf(outsider))).toEqual([]);
  });

  it("a joining parent's share tasks close when they share (R2I-7)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const dana = await factories.user(deps.db, { email: "dana@example.test" });
    await invite(deps, actorOf(student), { email: "dana@example.test" });
    await acceptInvite(deps, actorOf(dana), { token: tokenIn((await latestEmail(deps.db, "dana@example.test")).text) });
    const statusOf = async (kind: string) => (await listTasks(deps, actorOf(dana))).find((t) => t.kind === kind)?.status;
    expect((await listTasks(deps, actorOf(dana))).map((t) => t.kind).sort()).toEqual(["share_budget", "share_income_range"]);
    await setBudget(deps, actorOf(dana), { annualUsd: 4600 });
    expect(await statusOf("share_budget")).toBe("done");
    await shareIncomeRangeToStudent(deps, actorOf(dana), { studentId: student.id, range: "30_48k" });
    expect(await statusOf("share_income_range")).toBe("done");
  });

  it("createTask notifies the assignee once and links an aid item once (R2I-6, R2I-15)", async () => {
    const { deps, student, parent, family } = await setup();
    const [item] = await deps.db
      .insert(aidChecklistItems)
      .values({ ownerId: student.id, awardYear: "2027-28", program: "fafsa", key: "parent_fsa_id", title: "Create your StudentAid.gov account", assignee: "parent" })
      .returning();
    const input = {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "fafsa_contributor" as const,
      title: "Create your StudentAid.gov account",
      detail: "FAFSA 2027-28",
      aidItemId: item?.id,
    };
    const first = await createTask(deps, SYSTEM, input);
    const again = await createTask(deps, SYSTEM, input);
    expect(again.id).toBe(first.id);
    expect(await deps.db.select().from(familyTasks)).toHaveLength(1);
    const notes = await deps.db.select().from(notifications).where(eq(notifications.userId, parent.id));
    expect(notes.map((n) => [n.kind, n.title, n.link, n.dedupeKey])).toEqual([
      ["family", "New family task: Create your StudentAid.gov account", "/family", `family-task:${first.id}`],
    ]);
  });

  it("an aid-linked task reads and writes the aid item's status (R2I-6)", async () => {
    const { deps, student, parent, family } = await setup();
    const itemRow = (key: string) => ({
      ownerId: student.id,
      awardYear: "2027-28",
      program: "fafsa" as const,
      key,
      title: key,
      assignee: "parent" as const,
    });
    const [a, b] = await deps.db.insert(aidChecklistItems).values([itemRow("parent_fsa_id"), itemRow("parent_sign")]).returning();
    const base = { familyId: family.id, assigneeId: parent.id, studentId: student.id, kind: "fafsa_contributor" as const };
    const ta = await createTask(deps, SYSTEM, { ...base, title: "parent_fsa_id", aidItemId: a?.id });
    const tb = await createTask(deps, SYSTEM, { ...base, title: "parent_sign", aidItemId: b?.id });
    expect((await updateTask(deps, actorOf(parent), ta.id, { status: "done" })).status).toBe("done");
    const [itemA] = await deps.db.select().from(aidChecklistItems).where(eq(aidChecklistItems.id, a?.id ?? ""));
    expect(itemA).toMatchObject({ status: "done", completedAt: new Date("2026-10-06T15:00:00.000Z") });
    const [taskA] = await deps.db.select().from(familyTasks).where(eq(familyTasks.id, ta.id));
    expect(taskA?.status).toBe("todo");
    await deps.db.update(aidChecklistItems).set({ status: "done" }).where(eq(aidChecklistItems.id, b?.id ?? ""));
    const listed = await listTasks(deps, actorOf(student));
    expect(listed.find((t) => t.id === tb.id)?.status).toBe("done");
  });

  it("adds the college name to a CSS task only for viewers who may read colleges (R2I-5)", async () => {
    const { deps, student, parent, family } = await setup();
    const college = await factories.college(deps.db, { name: "Northgate University", cssProfileRequired: true });
    const [item] = await deps.db
      .insert(aidChecklistItems)
      .values({ ownerId: student.id, awardYear: "2027-28", program: "css", collegeId: college.id, key: "parent_css", title: "Fill in the parent section", assignee: "parent" })
      .returning();
    await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: parent.id,
      studentId: student.id,
      kind: "css_contributor",
      title: "Fill in the parent section",
      detail: "CSS Profile 2027-28",
      aidItemId: item?.id,
    });
    const titleFor = async (viewer: typeof parent) => (await listTasks(deps, actorOf(viewer)))[0]?.title;
    await updateShareSettings(deps, actorOf(student), { categories: { colleges: false } });
    expect(await titleFor(parent)).toBe("Fill in the parent section");
    expect(await titleFor(student)).toBe("Fill in the parent section (Northgate University)");
    await updateShareSettings(deps, actorOf(student), { categories: { colleges: true } });
    expect(await titleFor(parent)).toBe("Fill in the parent section (Northgate University)");
  });

  it("names a nameless assignee by role instead of leaving it empty (R3V-14)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const nameless = await factories.user(deps.db, { role: "parent", displayName: "  " });
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [nameless.id] });
    const task = await createTask(deps, SYSTEM, {
      familyId: family.id,
      assigneeId: nameless.id,
      studentId: student.id,
      kind: "custom",
      title: "Gather tax documents",
    });
    expect(task.assigneeName).toBe("Your family member");
    expect((await listTasks(deps, actorOf(student)))[0]?.assigneeName).toBe("Your family member");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/family/settings.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/family/settings.ts`:

```ts
import {
  type DbOrTx,
  aidChecklistItems,
  and,
  asc,
  colleges,
  eq,
  familyBudgets,
  familyMembers,
  familyTasks,
  shareSettings,
  users} from "@scholarcrew/db";
import {
  type Actor,
  DEFAULT_SHARED,
  type FamilyBudget,
  FamilyBudgetInput,
  type FamilyTask,
  type FamilyTaskKind,
  FamilyTaskPatch,
  SHARE_CATEGORIES,
  type ShareCategory,
  type ShareSettings,
  ShareSettingsInput,
  forbidden,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertSystem, assertUser, familyIdsFor, getShareGrants } from "../access";
import { recordAudit } from "../audit";
import { type CoreDeps, ownedWhere, isUuid, one, requireUuid, toIso, toIsoOrNull } from "../shared";
import { type FamilyTaskRow, insertFamilyTask, membershipOf, unnamedInviter } from "./core";

type TaskRow = FamilyTaskRow;

async function readShareSettings(db: DbOrTx, studentId: string, familyId: string): Promise<ShareSettings> {
  const rows = await db
    .select()
    .from(shareSettings)
    .where(and(eq(shareSettings.studentId, studentId), eq(shareSettings.familyId, familyId)));
  const categories = Object.fromEntries(
    SHARE_CATEGORIES.map((c) => [c, rows.find((r) => r.category === c)?.enabled ?? DEFAULT_SHARED[c]]),
  ) as Record<ShareCategory, boolean>;
  return { studentId, familyId, categories };
}

/** Any member of the student's family reads them. */
export async function getShareSettings(deps: CoreDeps, actor: Actor, studentId: string): Promise<ShareSettings> {
  assertUser(actor);
  requireUuid(studentId, "Share settings not found");
  const studentFamilies = await deps.db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, studentId), eq(familyMembers.memberRole, "student")));
  const mine = await familyIdsFor(deps, actor.userId);
  const familyId = studentFamilies.map((r) => r.familyId).find((id) => mine.includes(id));
  if (!familyId) throw notFound("Share settings not found");
  return readShareSettings(deps.db, studentId, familyId);
}

/** The student edits their own settings. */
export async function updateShareSettings(deps: CoreDeps, actor: Actor, i: ShareSettingsInput): Promise<ShareSettings> {
  assertUser(actor);
  const parsed = ShareSettingsInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the share settings", parsed.error.issues);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership || membership.memberRole !== "student") throw notFound("Share settings not found");
  const studentId = actor.userId;
  const changes = SHARE_CATEGORIES.filter((c) => parsed.data.categories[c] !== undefined);
  for (const category of changes) {
    const enabled = parsed.data.categories[category] === true;
    await deps.db
      .insert(shareSettings)
      .values({ studentId, familyId: membership.familyId, category, enabled })
      .onConflictDoUpdate({
        target: [shareSettings.studentId, shareSettings.familyId, shareSettings.category],
        set: { enabled },
      });
  }
  await recordAudit(deps, {
    actor,
    action: "share_settings_updated",
    entityType: "family",
    entityId: membership.familyId,
    meta: { categories: parsed.data.categories },
  });
  return readShareSettings(deps.db, studentId, membership.familyId);
}

function toBudget(row: typeof familyBudgets.$inferSelect): FamilyBudget {
  return { familyId: row.familyId, annualUsd: row.annualUsd, sharedById: row.sharedById, updatedAt: toIso(row.updatedAt) };
}

export async function getBudget(deps: CoreDeps, actor: Actor): Promise<FamilyBudget | null> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) return null;
  const [row] = await deps.db.select().from(familyBudgets).where(eq(familyBudgets.familyId, membership.familyId));
  return row ? toBudget(row) : null;
}

/** Parents share a yearly budget. Completes the parent's open share_budget tasks. */
export async function setBudget(deps: CoreDeps, actor: Actor, i: FamilyBudgetInput): Promise<FamilyBudget> {
  assertUser(actor);
  const parsed = FamilyBudgetInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Enter a yearly amount in whole dollars", parsed.error.issues);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) throw notFound("You're not in a family");
  if (membership.memberRole !== "parent") throw forbidden("Only a parent can share the family budget");
  const now = deps.clock.now();
  const set = { annualUsd: parsed.data.annualUsd, sharedById: actor.userId, updatedAt: now };
  const row = one(
    await deps.db
      .insert(familyBudgets)
      .values({ familyId: membership.familyId, ...set })
      .onConflictDoUpdate({ target: familyBudgets.familyId, set })
      .returning(),
    "family_budgets upsert",
  );
  await deps.db
    .update(familyTasks)
    .set({ status: "done", completedAt: now })
    .where(
      and(
        eq(familyTasks.familyId, membership.familyId),
        eq(familyTasks.assigneeId, actor.userId),
        eq(familyTasks.kind, "share_budget"),
        eq(familyTasks.status, "todo"),
      ),
    );
  await recordAudit(deps, { actor, action: "family_budget_shared", entityType: "family", entityId: membership.familyId });
  return toBudget(row);
}

/** The aid checklist item behind an aid-linked task. Its status is the task's status (R2I-6). */
type LinkedItem = { status: TaskRow["status"]; completedAt: Date | null };

function toTask(row: TaskRow, assigneeName: string, item: LinkedItem | null = null, title = row.title): FamilyTask {
  return {
    id: row.id,
    familyId: row.familyId,
    assigneeId: row.assigneeId,
    assigneeName,
    studentId: row.studentId,
    kind: row.kind,
    title,
    detail: row.detail,
    status: item ? item.status : row.status,
    dueOn: row.dueOn,
    createdAt: toIso(row.createdAt),
    completedAt: toIsoOrNull(item ? item.completedAt : row.completedAt),
  };
}

/** Tasks with their assignee name, linked aid item, and that item's college. */
function taskQuery(db: DbOrTx) {
  return db
    .select({
      task: familyTasks,
      assigneeDisplayName: users.displayName,
      assigneeRole: users.role,
      itemStatus: aidChecklistItems.status,
      itemCompletedAt: aidChecklistItems.completedAt,
      collegeName: colleges.name,
    })
    .from(familyTasks)
    .innerJoin(users, eq(users.id, familyTasks.assigneeId))
    .leftJoin(aidChecklistItems, eq(aidChecklistItems.id, familyTasks.aidItemId))
    .leftJoin(colleges, eq(colleges.id, aidChecklistItems.collegeId));
}

type TaskJoin = Awaited<ReturnType<typeof taskQuery>>[number];

/** R3V-14: a parent who joined from an invite may have no name yet; never show an empty tag. */
function assigneeNameOf(r: TaskJoin): string {
  return r.assigneeDisplayName.trim() || unnamedInviter(r.assigneeRole);
}

function linkedOf(r: TaskJoin): LinkedItem | null {
  return r.task.aidItemId !== null && r.itemStatus !== null ? { status: r.itemStatus, completedAt: r.itemCompletedAt } : null;
}

/**
 * R2I-5: CSS tasks store the plain step title. The college name is added at read time, only for the
 * task's student or a viewer whose share grants include `colleges`.
 */
async function presentTasks(deps: CoreDeps, viewerId: string, rows: TaskJoin[]): Promise<FamilyTask[]> {
  const grants = new Map<string, boolean>();
  const mayReadColleges = async (studentId: string): Promise<boolean> => {
    if (studentId === viewerId) return true;
    const known = grants.get(studentId);
    if (known !== undefined) return known;
    const allowed = (await getShareGrants(deps, studentId, viewerId)).includes("colleges");
    grants.set(studentId, allowed);
    return allowed;
  };
  const out: FamilyTask[] = [];
  for (const r of rows) {
    const named =
      r.task.kind === "css_contributor" && r.collegeName !== null && (await mayReadColleges(r.task.studentId))
        ? `${r.task.title} (${r.collegeName})`
        : r.task.title;
    out.push(toTask(r.task, assigneeNameOf(r), linkedOf(r), named));
  }
  return out;
}

export async function listTasks(deps: CoreDeps, actor: Actor): Promise<FamilyTask[]> {
  assertUser(actor);
  const membership = await membershipOf(deps.db, actor.userId);
  if (!membership) return [];
  const rows = await taskQuery(deps.db)
    .where(eq(familyTasks.familyId, membership.familyId))
    .orderBy(asc(familyTasks.createdAt), asc(familyTasks.id));
  return presentTasks(deps, actor.userId, rows);
}

/**
 * The assignee or the task's student changes its status. An aid-linked task writes its aid checklist
 * item instead of the task row, so /money and /family show one status (R2I-6).
 */
export async function updateTask(deps: CoreDeps, actor: Actor, id: string, p: FamilyTaskPatch): Promise<FamilyTask> {
  assertUser(actor);
  requireUuid(id, "Task not found");
  const parsed = FamilyTaskPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Choose a task status", parsed.error.issues);
  const [task] = await deps.db.select().from(familyTasks).where(eq(familyTasks.id, id));
  const membership = await membershipOf(deps.db, actor.userId);
  const allowed =
    task !== undefined &&
    membership?.familyId === task.familyId &&
    (task.assigneeId === actor.userId || task.studentId === actor.userId);
  if (!task || !allowed) throw notFound("Task not found");
  const set = { status: parsed.data.status, completedAt: parsed.data.status === "done" ? deps.clock.now() : null };
  if (task.aidItemId !== null) {
    await deps.db.update(aidChecklistItems).set(set).where(eq(aidChecklistItems.id, task.aidItemId));
  } else {
    await deps.db.update(familyTasks).set(set).where(eq(familyTasks.id, id));
  }
  const rows = await taskQuery(deps.db).where(eq(familyTasks.id, id));
  return one(await presentTasks(deps, actor.userId, rows), "family_tasks select");
}

/**
 * System only (aid checklists, offer confirmations). The assignee must be in the family. With an
 * `aidItemId`, a second call for the same item and assignee returns the existing task (R2I-6).
 * A new task notifies the assignee (R2I-15).
 */
export async function createTask(
  deps: CoreDeps,
  system: Actor,
  i: {
    familyId: string;
    assigneeId: string;
    studentId: string;
    kind: FamilyTaskKind;
    title: string;
    detail?: string;
    dueOn?: string | null;
    aidItemId?: string | null;
  },
): Promise<FamilyTask> {
  assertSystem(system);
  if (i.aidItemId != null && !isUuid(i.aidItemId)) throw invalidInput("Unknown aid checklist item");
  const [member] = await deps.db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(and(eq(familyMembers.familyId, i.familyId), eq(familyMembers.userId, i.assigneeId)));
  if (!member) throw invalidInput("The assignee isn't in that family");
  const { row } = await insertFamilyTask(deps.db, i, deps.clock.now());
  const joined = one(await taskQuery(deps.db).where(eq(familyTasks.id, row.id)), "family_tasks select");
  return toTask(joined.task, assigneeNameOf(joined), linkedOf(joined));
}
```

`packages/core/src/family/index.ts`:

```ts
export { revokeInvite, acceptInvite, getFamily, invite, leaveFamily, previewInvite, removeMember } from "./core";
export {
  createTask,
  getBudget,
  getShareSettings,
  listTasks,
  setBudget,
  updateShareSettings,
  updateTask,
} from "./settings";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 11 files, 128 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/family
git commit -m "feat(core): share settings, family budget, family tasks"
```

### F11: Billing plans, usage counters, crew allowance

- [ ] **Step 1: Write the failing test**

`packages/core/src/billing/plans.test.ts`:

```ts
import { crewJobs, subscriptions, usageCounters } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { addMinutes, createTestDeps, fixedClock } from "../shared";
import { assertCrewAllowance, getSubscription, getUsage, planFor, recordUsage } from "./plans";

describe("plans", () => {
  it("puts a new user on free with 20 crew requests", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    expect(await planFor(deps, user.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(user))).toEqual({
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
      managedByStripe: false,
      sponsor: null,
    });
    expect(await getUsage(deps, actorOf(user))).toEqual({ month: "2026-10", crewRequests: 0, limit: 20, costMicros: 0 });
  });

  it("covers students in a paying parent's family only", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(await planFor(deps, parent.id)).toBe("family");
    expect(await planFor(deps, student.id)).toBe("family");
    expect(await planFor(deps, other.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(student))).toMatchObject({ plan: "family", managedByStripe: false });
    expect(await getSubscription(deps, actorOf(parent))).toMatchObject({ plan: "family", managedByStripe: true });
    expect((await getUsage(deps, actorOf(student))).limit).toBe(300);
  });

  it("ignores past-due parent plans", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", status: "past_due" });
    expect(await planFor(deps, student.id)).toBe("free");
  });

  it("falls back to free when a season pass has ended", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: user.id,
      plan: "season_pass",
      status: "active",
      currentPeriodEnd: new Date("2026-05-31T23:59:59.000Z"),
    });
    expect(await planFor(deps, user.id)).toBe("free");
    expect(await getSubscription(deps, actorOf(user))).toMatchObject({ plan: "free", status: "expired" });
  });
});

describe("usage", () => {
  it("throws limit_reached at the monthly allowance", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 19 });
    await expect(assertCrewAllowance(deps, user.id)).resolves.toBeUndefined();
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 1200, crewRequest: true });
    await expect(assertCrewAllowance(deps, user.id)).rejects.toMatchObject({
      code: "limit_reached",
      details: { limit: 20, used: 20 },
    });
  });

  it("counts recent queued and working jobs toward the allowance (R2C-8)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const now = deps.clock.now();
    await deps.db.insert(usageCounters).values({ userId: user.id, month: "2026-10", crewRequests: 19 });
    const job = (kind: "crew_request" | "offer_parse" | "weekly_plan", createdAt: Date, status: "queued" | "working" | "ready" = "queued") => ({
      ownerId: user.id,
      usageMonth: "2026-10",
      kind,
      status,
      createdAt,
      updatedAt: createdAt,
    });
    await deps.db.insert(crewJobs).values([
      job("offer_parse", now),
      job("weekly_plan", now, "ready"),
      job("crew_request", addMinutes(now, -120)),
      job("crew_request", now, "ready"),
    ]);
    await expect(assertCrewAllowance(deps, user.id)).resolves.toBeUndefined();
    await deps.db.insert(crewJobs).values(job("weekly_plan", addMinutes(now, -5), "working"));
    await expect(assertCrewAllowance(deps, user.id)).rejects.toMatchObject({
      code: "limit_reached",
      details: { limit: 20, used: 20 },
    });
  });

  it("is system-only to record and adds up per month", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    await expect(recordUsage(deps, actorOf(user), { userId: user.id, costMicros: 1, crewRequest: true })).rejects.toMatchObject({
      code: "forbidden",
    });
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 1500, crewRequest: true });
    await recordUsage(deps, SYSTEM, { userId: user.id, costMicros: 500, crewRequest: false });
    expect(await getUsage(deps, actorOf(user))).toMatchObject({ crewRequests: 1, costMicros: 2000 });
    clock.set("2026-11-01T00:00:00.000Z");
    expect(await getUsage(deps, actorOf(user))).toMatchObject({ month: "2026-11", crewRequests: 0, costMicros: 0 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./plans" from "src/billing/plans.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/billing/plans.ts`:

```ts
import {
  type DbOrTx,
  and,
  count,
  crewJobs,
  desc,
  eq,
  familyMembers,
  gt,
  inArray,
  ne,
  sponsorCodes,
  sponsorRedemptions,
  sql,
  subscriptions,
  usageCounters,
  users} from "@scholarcrew/db";
import { type Actor, AppError, PLAN_LIMITS, type PlanId, type Subscription, type UsageSummary } from "@scholarcrew/domain";
import { assertSystem, assertUser, familyIdsFor } from "../access";
import { type CoreDeps, addMinutes, monthKey, nextMonthStartUtc, safeTimeZone, instantInZone, toIsoOrNull } from "../shared";

export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function ownSubscription(db: DbOrTx, userId: string): Promise<SubscriptionRow | undefined> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.ownerId, userId)).limit(1);
  return row;
}

export function isPaidAndLive(row: SubscriptionRow, now: Date): boolean {
  return row.plan !== "free" && row.status === "active" && (row.currentPeriodEnd === null || row.currentPeriodEnd > now);
}

/** The user's own live paid plan, else a live paid plan of a parent in the same family, else free. */
export async function planFor(deps: CoreDeps, userId: string): Promise<PlanId> {
  const now = deps.clock.now();
  const own = await ownSubscription(deps.db, userId);
  if (own && isPaidAndLive(own, now)) return own.plan;
  const familyIds = await familyIdsFor(deps, userId);
  if (familyIds.length === 0) return "free";
  const rows = await deps.db
    .select({ sub: subscriptions })
    .from(subscriptions)
    .innerJoin(familyMembers, eq(familyMembers.userId, subscriptions.ownerId))
    .where(
      and(
        inArray(familyMembers.familyId, familyIds),
        eq(familyMembers.memberRole, "parent"),
        ne(subscriptions.plan, "free"),
      ),
    );
  const live = rows.map((r) => r.sub).find((s) => isPaidAndLive(s, now));
  return live ? live.plan : "free";
}

async function sponsorName(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: sponsorCodes.sponsorName })
    .from(sponsorRedemptions)
    .innerJoin(sponsorCodes, eq(sponsorCodes.code, sponsorRedemptions.code))
    .where(eq(sponsorRedemptions.userId, userId))
    .orderBy(desc(sponsorRedemptions.redeemedAt))
    .limit(1);
  return row?.name ?? null;
}

export async function getSubscription(deps: CoreDeps, actor: Actor): Promise<Subscription> {
  assertUser(actor);
  const now = deps.clock.now();
  const own = await ownSubscription(deps.db, actor.userId);
  const managedByStripe = Boolean(own?.stripeCustomerId || own?.stripeSubscriptionId);
  if (own && isPaidAndLive(own, now)) {
    return {
      plan: own.plan,
      status: own.status,
      currentPeriodEnd: toIsoOrNull(own.currentPeriodEnd),
      managedByStripe,
      sponsor: managedByStripe ? null : await sponsorName(deps.db, actor.userId),
    };
  }
  const covered = await planFor(deps, actor.userId);
  if (covered !== "free") {
    return { plan: covered, status: "active", currentPeriodEnd: null, managedByStripe: false, sponsor: null };
  }
  if (own && own.plan !== "free") {
    return {
      plan: "free",
      status: own.status === "active" ? "expired" : own.status,
      currentPeriodEnd: toIsoOrNull(own.currentPeriodEnd),
      managedByStripe,
      sponsor: null,
    };
  }
  return { plan: "free", status: "active", currentPeriodEnd: null, managedByStripe, sponsor: null };
}

async function counterFor(db: DbOrTx, userId: string, month: string): Promise<{ crewRequests: number; costMicros: number }> {
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.month, month)));
  return { crewRequests: row?.crewRequests ?? 0, costMicros: row?.costMicros ?? 0 };
}

export async function getUsage(deps: CoreDeps, actor: Actor): Promise<UsageSummary> {
  assertUser(actor);
  const month = monthKey(deps.clock.now());
  const counter = await counterFor(deps.db, actor.userId, month);
  const plan = await planFor(deps, actor.userId);
  return { month, ...counter, limit: PLAN_LIMITS[plan].crewRequestsPerMonth };
}

const IN_FLIGHT_WINDOW_MINUTES = 60;

/**
 * Jobs that will bill when they finish: queued or working, created in the last hour (a stuck job stops
 * holding allowance after that). Offer parsing is excluded. Pending weekly plans reserve a slot too;
 * system plans release that reservation on completion without consuming a monthly request.
 */
async function inFlightCrewJobs(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(crewJobs)
    .where(
      and(
        eq(crewJobs.ownerId, userId),
        inArray(crewJobs.status, ["queued", "working"]),
        ne(crewJobs.kind, "offer_parse"),
        eq(crewJobs.usageMonth, monthKey(now)),
        gt(crewJobs.createdAt, addMinutes(now, -IN_FLIGHT_WINDOW_MINUTES)),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Throws limit_reached once this month's crew requests plus in-flight jobs reach the plan allowance
 * (R2C-8). Manual features don't call it.
 */
export async function assertCrewAllowance(deps: CoreDeps, userId: string, tx?: DbOrTx): Promise<void> {
  if (!tx) return deps.db.transaction((locked) => assertCrewAllowance(deps, userId, locked));
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"crew-allowance:" + userId}))`);
  const now = deps.clock.now();
  const month = monthKey(now);
  const { crewRequests } = await counterFor(tx, userId, month);
  const used = crewRequests + (await inFlightCrewJobs(tx, userId, now));
  const limit = PLAN_LIMITS[await planFor(deps, userId)].crewRequestsPerMonth;
  if (used >= limit) {
    const [user] = await tx.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId));
    const reset = instantInZone(nextMonthStartUtc(now), safeTimeZone(user?.timeZone ?? "UTC"));
    throw new AppError(
      "limit_reached",
      `You've used all ${limit} crew requests this month. Manual tools still work, and the count resets ${reset}.`,
      { limit, used },
    );
  }
}

export async function recordUsage(
  deps: CoreDeps,
  system: Actor,
  i: { userId: string; costMicros: number; crewRequest: boolean },
): Promise<void> {
  assertSystem(system);
  await addUsage(deps.db, { ...i, month: monthKey(deps.clock.now()) });
}

export async function addUsage(db: DbOrTx, i: { userId: string; month: string; costMicros: number; crewRequest: boolean }): Promise<void> {
  const month = i.month;
  const requests = i.crewRequest ? 1 : 0;
  const cost = Math.max(0, Math.round(i.costMicros));
  await db
    .insert(usageCounters)
    .values({ userId: i.userId, month, crewRequests: requests, costMicros: cost })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.month],
      set: {
        crewRequests: sql`${usageCounters.crewRequests} + ${requests}`,
        costMicros: sql`${usageCounters.costMicros} + ${cost}`,
      },
    });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 12 files, 135 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/billing/plans.ts packages/core/src/billing/plans.test.ts
git commit -m "feat(core): billing plans, family coverage, usage counters, crew allowance"
```

### F12: Stripe checkout, portal, webhook events, sponsor codes, and the billing index

- [ ] **Step 1: Write the failing test**

`packages/core/src/billing/stripe.test.ts`:

```ts
import { ownSubscription } from "./plans";
import { eq, sponsorCodes, subscriptions } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { type FakeStripeGateway, createTestDeps, fixedClock } from "../shared";
import {
  applyStripeEvent,
  createCheckout,
  createPortal,
  parseStripeWebhook,
  planFor,
  redeemSponsorCode,
  seasonPassEnd} from "./index";

let eventNumber = 0;
const event = (type: string, object: Record<string, unknown>) => ({ id: `evt_${++eventNumber}`, created: 1791298800, type, data: { object: { payment_status: "paid", ...object } } });

describe("checkout and portal", () => {
  it("creates a subscription checkout for Family and a payment for the season pass", async () => {
    const deps = createTestDeps();
    const fake = deps.stripe as FakeStripeGateway;
    const parent = await factories.parent(deps.db);
    expect(await createCheckout(deps, actorOf(parent), { plan: "family" })).toEqual({
      url: "https://checkout.stripe.test/session/1",
    });
    expect(fake.checkouts[0]).toEqual({
      customerEmail: parent.email,
      priceId: "price_family_test",
      mode: "subscription",
      successUrl: "http://localhost:3000/settings?billing=success",
      cancelUrl: "http://localhost:3000/settings?billing=cancel",
      clientReferenceId: parent.id,
    });
    await createCheckout(deps, actorOf(parent), { plan: "season_pass" });
    expect(fake.checkouts[1]).toMatchObject({ priceId: "price_season_test", mode: "payment" });
  });

  it("refuses checkout when already paid or when billing is off", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(createCheckout(createTestDeps({ stripe: null }), actorOf(parent), { plan: "family" })).rejects.toMatchObject({
      code: "internal",
    });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", status: "active" });
    await expect(createCheckout(deps, actorOf(parent), { plan: "family" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("opens the customer portal only for Stripe customers", async () => {
    const deps = createTestDeps();
    const fake = deps.stripe as FakeStripeGateway;
    const parent = await factories.parent(deps.db);
    await expect(createPortal(deps, actorOf(parent))).rejects.toMatchObject({ code: "invalid_input" });
    await deps.db.insert(subscriptions).values({ ownerId: parent.id, plan: "family", stripeCustomerId: "cus_1" });
    expect((await createPortal(deps, actorOf(parent))).url).toBe("https://billing.stripe.test/portal/1");
    expect(fake.portals[0]).toEqual({ customerId: "cus_1", returnUrl: "http://localhost:3000/settings" });
  });
});

describe("applyStripeEvent", () => {
  it("activates the Family plan from a completed subscription checkout", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: parent.id,
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    const [row] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id));
    expect(row).toMatchObject({ plan: "family", status: "active", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    expect(row).not.toHaveProperty("familyId");
    expect(await planFor(deps, parent.id)).toBe("family");
  });

  it("runs a season pass until May 31 of the season's second year", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", { client_reference_id: user.id, mode: "payment", customer: "cus_2" }),
    );
    const [row] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, user.id));
    expect(row?.currentPeriodEnd?.toISOString()).toBe("2027-05-31T23:59:59.000Z");
    expect(await planFor(deps, user.id)).toBe("season_pass");
    clock.set("2027-06-01T00:00:00.000Z");
    expect(await planFor(deps, user.id)).toBe("free");
    expect(seasonPassEnd(new Date("2027-06-15T00:00:00.000Z")).toISOString()).toBe("2028-05-31T23:59:59.000Z");
  });

  it("tracks subscription updates, failed payments, and cancellations", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    const status = async () =>
      (await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id)))[0];
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "past_due",
        items: { data: [{ current_period_end: 1793923200 }] },
      }),
    );
    expect(await status()).toMatchObject({ status: "past_due", currentPeriodEnd: new Date("2026-11-06T00:00:00.000Z") });
    expect(await planFor(deps, parent.id)).toBe("free");
    await applyStripeEvent(deps, SYSTEM, event("customer.subscription.updated", { id: "sub_1", status: "active" }));
    expect((await status())?.status).toBe("active");
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }),
    );
    expect((await status())?.status).toBe("past_due");
    await applyStripeEvent(deps, SYSTEM, event("customer.subscription.deleted", { id: "sub_1" }));
    expect((await status())?.status).toBe("canceled");
  });

  it("ignores unknown events and unknown users, and is system-only", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(deps, SYSTEM, event("customer.created", { id: "cus_9" }));
    await applyStripeEvent(
      deps,
      SYSTEM,
      event("checkout.session.completed", {
        client_reference_id: "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f",
        mode: "subscription",
      }),
    );
    expect(await deps.db.select().from(subscriptions)).toHaveLength(0);
    await expect(applyStripeEvent(deps, actorOf(parent), event("customer.created", {}))).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("parseStripeWebhook", () => {
  it("verifies the signature", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      created: 1791298800,
      object: "event",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1" } },
    });
    const header = new Stripe("sk_test_signing").webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    expect(parseStripeWebhook(payload, header, "whsec_test", "")).toEqual({
      id: "evt_1",
      created: 1791298800,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1" } },
    });
    let code: string | undefined;
    try {
      parseStripeWebhook(payload, "t=1,v1=bad", "whsec_test", "");
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("invalid_input");
  });
});

describe("redeemSponsorCode", () => {
  it("grants the sponsored plan to a student once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(sponsorCodes).values({
      code: "MAPLE-2026",
      sponsorName: "Maple ISD",
      plan: "family",
      seatsTotal: 2,
      expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    });
    expect(await redeemSponsorCode(deps, actorOf(user), " MAPLE-2026 ")).toMatchObject({
      plan: "family",
      sponsor: "Maple ISD",
      managedByStripe: false,
    });
    const [code] = await deps.db.select().from(sponsorCodes);
    expect(code?.seatsUsed).toBe(1);
    await expect(redeemSponsorCode(deps, actorOf(user), "MAPLE-2026")).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses full, expired, and unknown codes, and non-students", async () => {
    const deps = createTestDeps();
    const { user: a } = await factories.student(deps.db);
    const { user: b } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await deps.db.insert(sponsorCodes).values([
      { code: "ONE-SEAT", sponsorName: "Lions Club", plan: "family", seatsTotal: 1, expiresAt: new Date("2027-06-01T00:00:00.000Z") },
      { code: "OLD-CODE", sponsorName: "Lions Club", plan: "family", seatsTotal: 9, expiresAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    await redeemSponsorCode(deps, actorOf(a), "ONE-SEAT");
    await expect(redeemSponsorCode(deps, actorOf(b), "ONE-SEAT")).rejects.toMatchObject({ code: "limit_reached" });
    await expect(redeemSponsorCode(deps, actorOf(b), "OLD-CODE")).rejects.toMatchObject({ code: "not_found" });
    await expect(redeemSponsorCode(deps, actorOf(b), "NOPE-CODE")).rejects.toMatchObject({ code: "not_found" });
    await expect(redeemSponsorCode(deps, actorOf(parent), "ONE-SEAT")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("round 4 Stripe ordering and payment", () => {
  it("deduplicates ids, requires payment, and keeps canceled subscriptions canceled", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    const checkout = event("checkout.session.completed", { client_reference_id: parent.id, mode: "subscription", subscription: "sub_r4", customer: "cus_r4", payment_status: "unpaid" });
    await applyStripeEvent(deps, SYSTEM, checkout);
    expect((await ownSubscription(deps.db, parent.id))?.stripeSubscriptionId).not.toBe("sub_r4");
    const paid = { ...checkout, id: "evt_r4_paid", type: "checkout.session.async_payment_succeeded", data: { object: { ...checkout.data.object, payment_status: "paid" } } };
    await applyStripeEvent(deps, SYSTEM, paid);
    await applyStripeEvent(deps, SYSTEM, paid);
    await applyStripeEvent(deps, SYSTEM, { ...event("customer.subscription.deleted", { id: "sub_r4" }), created: paid.created + 10 });
    await applyStripeEvent(deps, SYSTEM, { ...event("customer.subscription.updated", { id: "sub_r4", status: "active" }), created: paid.created - 10 });
    await applyStripeEvent(deps, SYSTEM, { ...paid, id: "evt_r4_replay", created: paid.created + 20 });
    expect((await ownSubscription(deps.db, parent.id))?.status).toBe("canceled");
  });
  it("refuses checkout and sponsor replacement of a non-canceled Stripe subscription", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(subscriptions).values({ ownerId: user.id, status: "past_due", stripeSubscriptionId: "sub_due" });
    await expect(createCheckout(deps, actorOf(user), { plan: "family" })).rejects.toMatchObject({ code: "conflict" });
    await deps.db.insert(sponsorCodes).values({ code: "R4-CODE", sponsorName: "Test", plan: "family", seatsTotal: 1, expiresAt: new Date("2027-06-01") });
    await expect(redeemSponsorCode(deps, actorOf(user), "R4-CODE")).rejects.toMatchObject({ code: "conflict" });
  });
  it("cancels the first live subscription before granting a second or a pass", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await applyStripeEvent(deps, SYSTEM, event("checkout.session.completed", { client_reference_id: parent.id, mode: "subscription", subscription: "sub_first" }));
    await applyStripeEvent(deps, SYSTEM, event("checkout.session.completed", { client_reference_id: parent.id, mode: "subscription", subscription: "sub_second" }));
    await applyStripeEvent(deps, SYSTEM, event("checkout.session.completed", { client_reference_id: parent.id, mode: "payment" }));
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual(["sub_first", "sub_second"]);
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/billing/stripe.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/billing/stripe.ts`:

```ts
import { and, eq, lt, ne, or, isNull, stripeEvents, sponsorCodes, sponsorRedemptions, sql, subscriptions, users } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  CheckoutInput,
  type PlanId,
  SponsorCodeInput,
  type Subscription,
  type SubscriptionStatus,
  conflict,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import Stripe from "stripe";
import { assertRole, assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { type CoreDeps, type StripeGateway, currentSeason, isUuid, one, seasonStartYear } from "../shared";
import { getSubscription, isPaidAndLive, ownSubscription } from "./plans";

type StripeObject = Record<string, unknown>;

/** End of a season pass: May 31 (23:59:59 UTC) of the current season's second year, or the next one if that's past. */
export function seasonPassEnd(now: Date): Date {
  const start = seasonStartYear(currentSeason(now));
  const end = new Date(Date.UTC(start + 1, 4, 31, 23, 59, 59));
  return end > now ? end : new Date(Date.UTC(start + 2, 4, 31, 23, 59, 59));
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function rec(v: unknown): StripeObject | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as StripeObject) : null;
}

/** Stripe API 2025+ puts current_period_end on subscription items; older versions put it on the subscription. */
function periodEnd(o: StripeObject): Date | null {
  const direct = o.current_period_end;
  const items = rec(o.items);
  const data = items && Array.isArray(items.data) ? items.data : [];
  const first = rec(data[0]);
  const fromItem = first ? first.current_period_end : undefined;
  const seconds = typeof direct === "number" ? direct : typeof fromItem === "number" ? fromItem : null;
  return seconds === null ? null : new Date(seconds * 1000);
}

function mapStatus(status: string | null): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
}

function invoiceSubscriptionId(o: StripeObject): string | null {
  const direct = str(o.subscription);
  if (direct) return direct;
  const details = rec(rec(o.parent)?.subscription_details);
  return str(details?.subscription);
}

export async function createCheckout(deps: CoreDeps, actor: Actor, i: CheckoutInput): Promise<{ url: string }> {
  assertUser(actor);
  const parsed = CheckoutInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Choose a plan");
  if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
  const me = one(await deps.db.select().from(users).where(eq(users.id, actor.userId)), "users select");
  const own = await ownSubscription(deps.db, me.id);
  if ((own?.stripeSubscriptionId && own.status !== "canceled") || (own && isPaidAndLive(own, deps.clock.now()))) throw conflict("You already have a subscription. Manage it from Billing.");
  const family = parsed.data.plan === "family";
  return deps.stripe.createCheckoutSession({
    customerEmail: me.email,
    priceId: family ? deps.config.stripePriceFamily : deps.config.stripePriceSeason,
    mode: family ? "subscription" : "payment",
    successUrl: `${deps.config.appUrl}/settings?billing=success`,
    cancelUrl: `${deps.config.appUrl}/settings?billing=cancel`,
    clientReferenceId: me.id,
  }, { idempotencyKey: `checkout:${me.id}:${parsed.data.plan}:${Math.floor(deps.clock.now().getTime() / 60_000)}` });
}

export async function createPortal(deps: CoreDeps, actor: Actor): Promise<{ url: string }> {
  assertUser(actor);
  if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
  const own = await ownSubscription(deps.db, actor.userId);
  if (!own?.stripeCustomerId) throw invalidInput("There's no billing account to manage yet");
  return deps.stripe.createPortalSession({ customerId: own.stripeCustomerId, returnUrl: `${deps.config.appUrl}/settings` });
}

async function checkoutCompleted(deps: CoreDeps, system: Actor, o: StripeObject, now: Date, created: number): Promise<void> {
  const userId = str(o.client_reference_id);
  if (!userId || !isUuid(userId)) return;
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) return;
  const subscriptionId = str(o.subscription);
  if (user.status !== "active") {
    if (subscriptionId && !deps.stripe) throw new AppError("internal", "Billing isn't set up");
    if (subscriptionId && deps.stripe) await deps.stripe.cancelSubscription(subscriptionId);
    await recordAudit(deps, { actor: system, action: "subscription_refused", entityType: "user", entityId: userId });
    return;
  }
  if (o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return;
  const plan: PlanId = str(o.mode) === "payment" ? "season_pass" : "family";
  const own = await ownSubscription(deps.db, userId);
  if (subscriptionId && own?.stripeSubscriptionId === subscriptionId && own.status === "canceled") return;
  if (own?.stripeEventAt && own.stripeEventAt.getTime() > created * 1000) return;
  if (own?.stripeSubscriptionId && own.status !== "canceled" && own.stripeSubscriptionId !== subscriptionId) {
    if (!deps.stripe) throw new AppError("internal", "Billing isn't set up");
    await deps.stripe.cancelSubscription(own.stripeSubscriptionId);
    await recordAudit(deps, { actor: system, action: "subscription_replaced", entityType: "user", entityId: userId, meta: { plan } });
  }
  const set = { plan, status: "active" as const, stripeCustomerId: str(o.customer),
    stripeSubscriptionId: plan === "family" ? subscriptionId : null,
    currentPeriodEnd: plan === "season_pass" ? seasonPassEnd(new Date(created * 1000)) : null,
    stripeEventAt: new Date(created * 1000), updatedAt: now };
  await deps.db.insert(subscriptions).values({ ownerId: userId, createdAt: now, ...set }).onConflictDoUpdate({ target: subscriptions.ownerId, set });
  await recordAudit(deps, { actor: system, action: "subscription_started", entityType: "user", entityId: userId, meta: { plan } });
}

export async function applyStripeEvent(deps: CoreDeps, system: Actor, e: { id: string; type: string; created: number; data: { object: Record<string, unknown> } }): Promise<void> {
  assertSystem(system);
  await deps.db.transaction(async (tx) => {
    const claim = await tx.insert(stripeEvents).values({ id: e.id, type: e.type }).onConflictDoNothing().returning();
    if (!claim.length) return;
    const o = e.data.object;
    const now = deps.clock.now();
    const eventAt = new Date(e.created * 1000);
    // Transaction exposes the same query surface; scoped deps keep all audit/grant writes atomic.
    const scoped = { ...deps, db: tx as unknown as CoreDeps["db"] };
    const referenceOwner = str(o.client_reference_id);
    const providerId = e.type.startsWith("customer.subscription.") ? str(o.id) : invoiceSubscriptionId(o) ?? str(o.subscription);
    const [known] = providerId ? await tx.select({ ownerId: subscriptions.ownerId }).from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, providerId)).limit(1) : [];
    const ownerKey = referenceOwner ?? known?.ownerId;
    if (ownerKey) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"stripe-owner:" + ownerKey}))`);
    const ordered = or(isNull(subscriptions.stripeEventAt), sql`${subscriptions.stripeEventAt} <= ${eventAt}`)!;
    switch (e.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await checkoutCompleted(scoped, system, o, now, e.created); return;
      case "checkout.session.async_payment_failed":
        await recordAudit(scoped, { actor: system, action: "checkout_payment_failed", entityType: "stripe_event", entityId: e.id }); return;
      case "customer.subscription.updated": {
        const id = str(o.id); if (!id) return;
        const end = periodEnd(o);
        await tx.update(subscriptions).set({ status: mapStatus(str(o.status)), stripeEventAt: eventAt, updatedAt: now, ...(end ? { currentPeriodEnd: end } : {}) })
          .where(and(eq(subscriptions.stripeSubscriptionId, id), ne(subscriptions.status, "canceled"), ordered)); return;
      }
      case "customer.subscription.deleted": {
        const id = str(o.id); if (!id) return;
        await tx.update(subscriptions).set({ status: "canceled", stripeEventAt: eventAt, updatedAt: now }).where(and(eq(subscriptions.stripeSubscriptionId, id), ordered)); return;
      }
      case "invoice.payment_failed": {
        const id = invoiceSubscriptionId(o); if (!id) return;
        await tx.update(subscriptions).set({ status: "past_due", stripeEventAt: eventAt, updatedAt: now }).where(and(eq(subscriptions.stripeSubscriptionId, id), ne(subscriptions.status, "canceled"), ordered)); return;
      }
    }
  });
}

export function createStripeGateway(secretKey: string): StripeGateway {
  const stripe = new Stripe(secretKey);
  return {
    async createCheckoutSession(i, options) {
      const session = await stripe.checkout.sessions.create({
        mode: i.mode,
        line_items: [{ price: i.priceId, quantity: 1 }],
        customer_email: i.customerEmail,
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        client_reference_id: i.clientReferenceId,
        ...(i.mode === "payment" ? { customer_creation: "always" as const } : {}),
      }, options);
      if (!session.url) throw new AppError("internal", "Stripe returned no checkout URL");
      return { url: session.url };
    },
    async createPortalSession(i) {
      const session = await stripe.billingPortal.sessions.create({ customer: i.customerId, return_url: i.returnUrl });
      return { url: session.url };
    },
    async cancelSubscription(subscriptionId) {
      try {
        const current = await stripe.subscriptions.retrieve(subscriptionId);
        if (current.status === "canceled" || current.status === "incomplete_expired") return;
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") return;
        throw error;
      }
    },
  };
}

/** Verifies the Stripe-Signature header. A bad signature is invalid_input. */
export function parseStripeWebhook(
  rawBody: string,
  signature: string,
  secret: string,
  secretKey: string,
): { id: string; type: string; created: number; data: { object: Record<string, unknown> } } {
  // The client is only used for signature checks here, so a placeholder key is fine when billing is off.
  const stripe = new Stripe(secretKey || "sk_test_webhook_only");
  let parsed: Stripe.Event;
  try {
    parsed = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw invalidInput("Invalid Stripe signature");
  }
  return { id: parsed.id, type: parsed.type, created: parsed.created, data: { object: parsed.data.object as unknown as Record<string, unknown> } };
}

/** BI-05: a school or nonprofit code grants its plan to a student for the season. */
export async function redeemSponsorCode(deps: CoreDeps, actor: Actor, code: string): Promise<Subscription> {
  assertRole(actor, "student");
  const parsed = SponsorCodeInput.safeParse({ code: code.trim() });
  if (!parsed.success) throw invalidInput("Enter the code from your sponsor");
  const now = deps.clock.now();
  const userId = actor.userId;
  const [sponsor] = await deps.db.select().from(sponsorCodes).where(eq(sponsorCodes.code, parsed.data.code));
  if (!sponsor || sponsor.expiresAt <= now) throw notFound("That code isn't valid or has expired");
  const [used] = await deps.db
    .select()
    .from(sponsorRedemptions)
    .where(and(eq(sponsorRedemptions.code, sponsor.code), eq(sponsorRedemptions.userId, userId)));
  if (used) throw conflict("You've already used this code");
  const own = await ownSubscription(deps.db, userId);
  if (own?.stripeSubscriptionId && own.status !== "canceled") throw conflict("Cancel your current plan in Billing before using a sponsor code.");
  if (own && isPaidAndLive(own, now)) throw conflict("You already have a paid plan");
  await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .update(sponsorCodes)
      .set({ seatsUsed: sql`${sponsorCodes.seatsUsed} + 1` })
      .where(and(eq(sponsorCodes.code, sponsor.code), lt(sponsorCodes.seatsUsed, sponsorCodes.seatsTotal)))
      .returning({ code: sponsorCodes.code });
    if (claimed.length === 0) throw new AppError("limit_reached", "This code has no seats left");
    await tx.insert(sponsorRedemptions).values({ code: sponsor.code, userId, redeemedAt: now });
    const set = {
      plan: sponsor.plan,
      status: "active" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: seasonPassEnd(now),
      updatedAt: now,
    };
    await tx
      .insert(subscriptions)
      .values({ ownerId: userId, createdAt: now, ...set })
      .onConflictDoUpdate({ target: subscriptions.ownerId, set });
  });
  await recordAudit(deps, {
    actor,
    action: "sponsor_code_redeemed",
    entityType: "sponsor_code",
    entityId: sponsor.code,
  });
  return getSubscription(deps, actor);
}
```

`packages/core/src/billing/index.ts`:

```ts
export { addUsage, assertCrewAllowance, getSubscription, getUsage, planFor, recordUsage } from "./plans";
export {
  applyStripeEvent,
  createCheckout,
  createPortal,
  createStripeGateway,
  parseStripeWebhook,
  redeemSponsorCode,
  seasonPassEnd,
} from "./stripe";
export { createFakeStripeGateway } from "../shared";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test && pnpm --filter @scholarcrew/core typecheck`
Expected: PASS, 13 files, 148 tests; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/billing
git commit -m "feat(core): Stripe checkout, portal, webhook events, sponsor codes"
```

### F13: Profile, onboarding, age gate, autofill profile

- [ ] **Step 1: Write the failing test**

`packages/core/src/profile/profile.test.ts`:

```ts
import { activities, collegeList, crewJobs, eq, sensitiveFacts, sessions, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { OnboardingInput } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { getSessionUser } from "../auth";
import { sha256Hex } from "../crypto";
import { listFacts } from "../memory";
import { createTestDeps, fixedClock } from "../shared";
import { completeOnboarding, getAutofillProfile, getMe, getProfile, isUnderMinAge, updateProfile } from "./index";

function onboarding(o: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    displayName: "Maya",
    birthYear: 2009,
    classYear: 2027,
    highSchool: "Maple High School",
    state: "TX",
    county: "Maple",
    city: "Cedar Falls",
    gpaUnweighted: 3.72,
    intendedMajors: ["Mechanical engineering"],
    interests: ["Robotics", "Tutoring"],
    timeZone: "America/Chicago",
    collegeIds: [],
    sensitive: [],
    ...o,
  };
}

describe("getMe", () => {
  it("shows a new student who hasn't onboarded", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db, { email: "maya@example.test" });
    expect(await getMe(deps, actorOf(user))).toMatchObject({
      user: { email: "maya@example.test", role: "student" },
      profile: null,
      onboardingComplete: false,
      family: null,
      plan: "free",
    });
  });
});

describe("completeOnboarding", () => {
  it("writes the profile, facts, sensitive facts, starter list, and first jobs", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const college = await factories.college(deps.db);
    const me = await completeOnboarding(
      deps,
      actorOf(user),
      onboarding({
        collegeIds: [college.id, "999999"],
        sensitive: [{ kind: "first_gen", enabled: true, value: null }],
      }),
    );
    expect(me.onboardingComplete).toBe(true);
    expect(me.user).toMatchObject({ displayName: "Maya", birthYear: 2009 });
    expect(me.profile).toMatchObject({ gpaUnweighted: 3.72, county: "Maple", onboardingCompletedAt: "2026-10-06T15:00:00.000Z" });
    const facts = await listFacts(deps, actorOf(user), user.id);
    expect(facts.map((f) => f.key).sort()).toEqual([
      "city",
      "class_year",
      "county",
      "gpa_unweighted",
      "high_school",
      "intended_majors",
      "interests",
      "state",
    ]);
    expect(facts.every((f) => f.source === "user_stated")).toBe(true);
    const [sensitive] = await deps.db.select().from(sensitiveFacts).where(eq(sensitiveFacts.ownerId, user.id));
    expect(sensitive).toMatchObject({ kind: "first_gen", enabled: true });
    const list = await deps.db.select().from(collegeList).where(eq(collegeList.ownerId, user.id));
    expect(list.map((r) => [r.collegeId, r.fit, r.plan, r.season])).toEqual([[college.id, "target", "RD", "2026-27"]]);
    const [job] = await deps.db.select().from(crewJobs).where(eq(crewJobs.ownerId, user.id));
    expect(job).toMatchObject({ kind: "weekly_plan", status: "queued" });
    expect(deps.jobs.sent).toEqual([
      { name: "plan.weekly", payload: { jobId: job?.id, ownerId: user.id } },
      { name: "sweep.student", payload: { studentId: user.id } },
    ]);
  });

  it("runs once", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await completeOnboarding(deps, actorOf(user), onboarding());
    await expect(completeOnboarding(deps, actorOf(user), onboarding())).rejects.toMatchObject({ code: "conflict" });
  });

  it("blocks users under 13 and ends their sessions", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await deps.db.insert(sessions).values({
      userId: user.id,
      tokenHash: sha256Hex("session-token"),
      expiresAt: new Date("2026-11-05T15:00:00.000Z"),
    });
    await expect(completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2014 }))).rejects.toMatchObject({
      code: "forbidden",
      message: "ScholarCrew is for students 13 and older",
      details: { reason: "underage" },
    });
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.status).toBe("blocked_underage");
    expect(row?.deletedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await deps.db.select().from(sessions)).toHaveLength(0);
    expect(await getSessionUser(deps, "session-token")).toBeNull();
    expect(deps.jobs.sent).toEqual([]);
  });

  it("accepts a student who turns 13 this year", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    expect((await completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2013 }))).onboardingComplete).toBe(true);
  });

  it("reads the year in the student's zone, not UTC (R3V-13)", async () => {
    // 2027-01-01T03:00Z is Dec 31, 2026, 9 pm in Chicago: local year 2026, so a 2014 birth year is 12.
    const deps = createTestDeps({ clock: fixedClock("2027-01-01T03:00:00.000Z") });
    const user = await factories.user(deps.db);
    await expect(
      completeOnboarding(deps, actorOf(user), onboarding({ birthYear: 2014, timeZone: "America/Chicago" })),
    ).rejects.toMatchObject({ code: "forbidden", details: { reason: "underage" } });
    expect(isUnderMinAge(2014, "2026-12-31")).toBe(true);
    expect(isUnderMinAge(2014, "2027-01-01")).toBe(false);
    expect(isUnderMinAge(2013, "2026-10-06")).toBe(false);
  });

  it("is for students only and checks the time zone", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    const user = await factories.user(deps.db);
    await expect(completeOnboarding(deps, actorOf(parent), onboarding())).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      completeOnboarding(deps, actorOf(user), onboarding({ timeZone: "Mars/Olympus" })),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("profile", () => {
  it("updateProfile changes the profile and supersedes the matching facts", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    await completeOnboarding(deps, actorOf(user), onboarding());
    const profile = await updateProfile(deps, actorOf(user), { county: "Travis", gpaUnweighted: 3.9, displayName: "Maya R." });
    expect(profile).toMatchObject({ county: "Travis", gpaUnweighted: 3.9 });
    const counties = (await listFacts(deps, actorOf(user), user.id)).filter((f) => f.key === "county");
    expect(counties.map((f) => f.value)).toEqual(["Travis"]);
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row?.displayName).toBe("Maya R.");
  });

  it("getProfile is for the owner and system only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    expect((await getProfile(deps, SYSTEM, user.id)).gpaUnweighted).toBe(3.72);
    await expect(getProfile(deps, actorOf(other), user.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getAutofillProfile returns the profile and activities in order", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "maya@example.test" });
    await deps.db.insert(activities).values([
      { ownerId: user.id, position: 2, name: "Tutoring" },
      { ownerId: user.id, position: 1, name: "Robotics team", role: "Captain", hoursPerWeek: 6, grades: [10, 11] },
    ]);
    const autofill = await getAutofillProfile(deps, actorOf(user));
    expect(autofill).toMatchObject({ email: "maya@example.test", highSchool: "Maple High School", gpa: 3.72, state: "TX" });
    expect(autofill.activities.map((a) => a.name)).toEqual(["Robotics team", "Tutoring"]);
    expect(autofill.activities[0]).toMatchObject({ role: "Captain", hoursPerWeek: 6, grades: [10, 11] });
  });
});

describe("onboarding claim", () => {
  it("creates starter jobs only once under concurrent completion", async () => {
    const deps = createTestDeps();
    const user = await factories.user(deps.db);
    const results = await Promise.allSettled([completeOnboarding(deps, actorOf(user), onboarding()), completeOnboarding(deps, actorOf(user), onboarding())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure && failure.status === "rejected" ? failure.reason : null).toMatchObject({ code: "conflict" });
    expect(deps.jobs.sent.filter((job) => job.name === "plan.weekly")).toHaveLength(1);
    expect(deps.jobs.sent.filter((job) => job.name === "sweep.student")).toHaveLength(1);
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/profile/profile.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/profile/index.ts`:

```ts
import { isNull,  and,  type DbOrTx, activities, asc, collegeList, colleges, crewJobs, eq, inArray, profiles, sessions, users } from "@scholarcrew/db";
import {
  type Activity,
  type Actor,
  AppError,
  type AutofillProfile,
  type FactValue,
  type IsoDate,
  type MeResponse,
  OnboardingInput,
  type Profile,
  ProfilePatch,
  conflict,
  invalidInput,
  unauthenticated} from "@scholarcrew/domain";
import { assertOwner, assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { planFor } from "../billing";
import { membershipOf } from "../family/core";
import { writeConfirmedFact } from "../memory/facts";
import { writeSensitiveFact } from "../memory/sensitive";
import { type CoreDeps, monthKey, currentSeason, isValidTimeZone, one, requireUuid, toIso, toIsoOrNull, toUser, todayIn } from "../shared";

type ProfileRow = typeof profiles.$inferSelect;

const MIN_AGE = 13;

/**
 * ID-03, R3V-13: the rule is "the student's local year minus birth year is under 13". `today` is the
 * student's calendar date (`todayIn(now, timeZone)`), so Dec 31 evening in Chicago is still that year.
 * A birth year alone can't tell a 12-year-old from a 13-year-old in the same year; round 4 decides.
 */
export function isUnderMinAge(birthYear: number, today: IsoDate): boolean {
  return Number(today.slice(0, 4)) - birthYear < MIN_AGE;
}

const toGpa = (x100: number | null): number | null => (x100 === null ? null : x100 / 100);
const toX100 = (gpa: number | null): number | null => (gpa === null ? null : Math.round(gpa * 100));

function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.userId,
    classYear: row.classYear,
    highSchool: row.highSchool,
    state: row.state,
    county: row.county,
    city: row.city,
    gpaUnweighted: toGpa(row.gpaUnweightedX100),
    gpaWeighted: toGpa(row.gpaWeightedX100),
    intendedMajors: row.intendedMajors,
    interests: row.interests,
    onboardingCompletedAt: toIsoOrNull(row.onboardingCompletedAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    role: row.role,
    organization: row.organization,
    description: row.description,
    hoursPerWeek: row.hoursPerWeek,
    weeksPerYear: row.weeksPerYear,
    grades: row.grades,
    category: row.category,
  };
}

/** The profile row, created empty when it's missing (accounts made outside verifyMagicLink). */
async function profileRow(db: DbOrTx, userId: string): Promise<ProfileRow> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (row) return row;
  await db.insert(profiles).values({ userId }).onConflictDoNothing();
  return one(await db.select().from(profiles).where(eq(profiles.userId, userId)), "profiles select");
}

type FactFields = {
  classYear?: number | null;
  highSchool?: string;
  state?: string;
  county?: string;
  city?: string;
  gpaUnweighted?: number | null;
  intendedMajors?: string[];
  interests?: string[];
};

/** ON-01: each saved profile value becomes a user_stated fact. Empty values are skipped. */
function profileFacts(p: FactFields): Array<[string, FactValue]> {
  const out: Array<[string, FactValue]> = [];
  if (p.classYear !== undefined && p.classYear !== null) out.push(["class_year", p.classYear]);
  if (p.highSchool) out.push(["high_school", p.highSchool]);
  if (p.state) out.push(["state", p.state]);
  if (p.county) out.push(["county", p.county]);
  if (p.city) out.push(["city", p.city]);
  if (p.gpaUnweighted !== undefined && p.gpaUnweighted !== null) out.push(["gpa_unweighted", p.gpaUnweighted]);
  if (p.intendedMajors && p.intendedMajors.length > 0) out.push(["intended_majors", p.intendedMajors]);
  if (p.interests && p.interests.length > 0) out.push(["interests", p.interests]);
  return out;
}

async function writeProfileFacts(db: DbOrTx, ownerId: string, p: FactFields, sourceRef: string, now: Date): Promise<void> {
  for (const [key, value] of profileFacts(p)) {
    await writeConfirmedFact(db, ownerId, { key, value, source: "user_stated", sourceRef }, now);
  }
}

export async function getMe(deps: CoreDeps, actor: Actor): Promise<MeResponse> {
  assertUser(actor);
  const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || user.status !== "active") throw unauthenticated();
  const [profile] = await deps.db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const membership = await membershipOf(deps.db, user.id);
  return {
    user: toUser(user),
    profile: profile ? toProfile(profile) : null,
    // Only students go through onboarding; parents and admins never see it.
    onboardingComplete: user.role !== "student" || Boolean(profile?.onboardingCompletedAt),
    family: membership ? { id: membership.familyId, role: membership.memberRole } : null,
    plan: await planFor(deps, user.id),
  };
}

export async function getProfile(deps: CoreDeps, actor: Actor, userId: string): Promise<Profile> {
  requireUuid(userId, "Profile not found");
  assertOwner(actor, userId);
  return toProfile(await profileRow(deps.db, userId));
}

export async function updateProfile(deps: CoreDeps, actor: Actor, patch: ProfilePatch): Promise<Profile> {
  assertUser(actor);
  const parsed = ProfilePatch.safeParse(patch);
  if (!parsed.success) throw invalidInput("Check your profile and try again", parsed.error.issues);
  const p = parsed.data;
  if (p.timeZone !== undefined && !isValidTimeZone(p.timeZone)) throw invalidInput("Unknown time zone");
  const now = deps.clock.now();
  const userId = actor.userId;
  const row = await deps.db.transaction(async (tx) => {
    const userSet: { displayName?: string; timeZone?: string } = {};
    if (p.displayName !== undefined) userSet.displayName = p.displayName;
    if (p.timeZone !== undefined) userSet.timeZone = p.timeZone;
    if (Object.keys(userSet).length > 0) await tx.update(users).set(userSet).where(eq(users.id, userId));
    await profileRow(tx, userId);
    const updated = one(
      await tx
        .update(profiles)
        .set({
          classYear: p.classYear,
          highSchool: p.highSchool,
          state: p.state,
          county: p.county,
          city: p.city,
          gpaUnweightedX100: p.gpaUnweighted === undefined ? undefined : toX100(p.gpaUnweighted),
          gpaWeightedX100: p.gpaWeighted === undefined ? undefined : toX100(p.gpaWeighted),
          intendedMajors: p.intendedMajors,
          interests: p.interests,
          updatedAt: now,
        })
        .where(eq(profiles.userId, userId))
        .returning(),
      "profiles update",
    );
    await writeProfileFacts(tx, userId, p, "profile", now);
    return updated;
  });
  return toProfile(row);
}

/**
 * ID-03 age gate, then ON-01/03/04/06: profile, facts, sensitive opt-ins, starter college list
 * (unknown college ids are skipped), and the first weekly plan and sweep jobs.
 */
export async function completeOnboarding(deps: CoreDeps, actor: Actor, i: OnboardingInput): Promise<MeResponse> {
  assertRole(actor, "student");
  const parsed = OnboardingInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check your answers and try again", parsed.error.issues);
  const input = parsed.data;
  const now = deps.clock.now();
  const userId = actor.userId;
  // The zone check runs first: the age gate reads the year in the student's zone (R3V-13).
  if (!isValidTimeZone(input.timeZone)) throw invalidInput("Unknown time zone");
  if (isUnderMinAge(input.birthYear, todayIn(now, input.timeZone))) {
    // R2I-17: deletedAt starts the purge clock, so the whole account is gone within 7 days.
    await deps.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "blocked_underage", birthYear: input.birthYear, deletedAt: now })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
    await recordAudit(deps, { actor, action: "blocked_underage", entityType: "user", entityId: userId });
    // R3A-17: the reason tells this refusal apart from a CSRF or role 403, so 16 blocks only on it.
    throw new AppError("forbidden", "ScholarCrew is for students 13 and older", { reason: "underage" });
  }
  const existing = await profileRow(deps.db, userId);
  if (existing.onboardingCompletedAt) throw conflict("Onboarding is already complete");
  const season = currentSeason(now);
  const jobId = await deps.db.transaction(async (tx) => {
    const claimed = await tx.update(profiles).set({ onboardingCompletedAt: now }).where(and(eq(profiles.userId, userId), isNull(profiles.onboardingCompletedAt))).returning();
    if (!claimed.length) throw conflict("Onboarding is already complete");
    await tx
      .update(users)
      .set({ displayName: input.displayName, birthYear: input.birthYear, timeZone: input.timeZone })
      .where(eq(users.id, userId));
    await tx
      .update(profiles)
      .set({
        classYear: input.classYear,
        highSchool: input.highSchool,
        state: input.state,
        county: input.county,
        city: input.city,
        gpaUnweightedX100: toX100(input.gpaUnweighted),
        intendedMajors: input.intendedMajors,
        interests: input.interests,
        onboardingCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(profiles.userId, userId));
    await writeProfileFacts(tx, userId, input, "onboarding", now);
    for (const s of input.sensitive) {
      await writeSensitiveFact(tx, deps.config.keyring, userId, s, null, now);
    }
    const ids = [...new Set(input.collegeIds)];
    if (ids.length > 0) {
      const known = await tx.select({ id: colleges.id }).from(colleges).where(inArray(colleges.id, ids));
      if (known.length > 0) {
        await tx
          .insert(collegeList)
          .values(known.map((c) => ({ ownerId: userId, collegeId: c.id, fit: "target" as const, plan: "RD" as const, season, createdAt: now })))
          .onConflictDoNothing();
      }
    }
    const job = one(
      await tx
        .insert(crewJobs)
        .values({ ownerId: userId, usageMonth: monthKey(now), kind: "weekly_plan", status: "queued", createdAt: now, updatedAt: now })
        .returning({ id: crewJobs.id }),
      "crew_jobs insert",
    );
    return job.id;
  });
  await deps.jobs.enqueue("plan.weekly", { jobId, ownerId: userId });
  await deps.jobs.enqueue("sweep.student", { studentId: userId });
  await recordAudit(deps, { actor, action: "onboarding_completed", entityType: "user", entityId: userId });
  return getMe(deps, actor);
}

/** EX-01: values the extension may propose for a form. The student reviews each one. */
export async function getAutofillProfile(deps: CoreDeps, actor: Actor): Promise<AutofillProfile> {
  assertUser(actor);
  const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || user.status !== "active") throw unauthenticated();
  const profile = await profileRow(deps.db, user.id);
  const rows = await deps.db
    .select()
    .from(activities)
    .where(eq(activities.ownerId, user.id))
    .orderBy(asc(activities.position));
  return {
    displayName: user.displayName,
    email: user.email,
    highSchool: profile.highSchool,
    classYear: profile.classYear,
    city: profile.city,
    state: profile.state,
    gpa: toGpa(profile.gpaUnweightedX100),
    intendedMajors: profile.intendedMajors,
    activities: rows.map(toActivity),
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 14 files, 159 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/profile
git commit -m "feat(core): profile, onboarding with age gate, autofill profile"
```

### F14: Helper links

- [ ] **Step 1: Write the failing test**

`packages/core/src/helpers/helpers.test.ts`:

```ts
import { auditEvents, eq, helperLinks, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { actorOf } from "../../test/helpers";
import { canRead } from "../access";
import { sha256Hex } from "../crypto";
import { createTestDeps, fixedClock } from "../shared";
import { createHelperLink, listHelperLinks, resolveHelperToken, revokeHelperLink } from "./index";

const tokenOf = (url: string): string => url.slice(url.lastIndexOf("/") + 1);
const input = { label: "Ms. Ortiz", helperRole: "recommender" as const, scope: ["activities" as const, "stories" as const], expiresInDays: 30 };

describe("helper links", () => {
  it("creates a scoped link and stores only the token hash", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    expect(created.url).toMatch(/^http:\/\/localhost:3000\/h\/[A-Za-z0-9_-]{43}$/);
    expect(created.link).toMatchObject({
      label: "Ms. Ortiz",
      helperRole: "recommender",
      scope: ["activities", "stories"],
      expiresAt: "2026-11-05T15:00:00.000Z",
      revokedAt: null,
      lastUsedAt: null,
    });
    const [row] = await deps.db.select().from(helperLinks);
    expect(row?.tokenHash).toBe(sha256Hex(tokenOf(created.url)));
  });

  it("resolves a live token to a helper actor limited to its scope, and audits the use", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    const helper = await resolveHelperToken(deps, tokenOf(created.url));
    expect(helper).toEqual({ kind: "helper", helperLinkId: created.link.id, studentId: user.id, scope: ["activities", "stories"] });
    if (!helper) throw new Error("expected a helper actor");
    expect(await canRead(deps, helper, user.id, "activities")).toBe(true);
    expect(await canRead(deps, helper, user.id, "essays")).toBe(false);
    const [row] = await deps.db.select().from(helperLinks);
    expect(row?.lastUsedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "helper_link_used"))).toHaveLength(1);
  });

  it("refuses scopes outside HL-01 and expiries over 90 days", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    for (const scope of ["essays", "chats", "costs", "sensitive"]) {
      await expect(
        createHelperLink(deps, actorOf(user), { ...input, scope: [scope] as unknown as typeof input.scope }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(createHelperLink(deps, actorOf(user), { ...input, expiresInDays: 91 })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("lets only students create links", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await expect(createHelperLink(deps, actorOf(parent), input)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("stops working as soon as it's revoked", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    await revokeHelperLink(deps, actorOf(user), created.link.id);
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
    expect((await listHelperLinks(deps, actorOf(user)))[0]?.revokedAt).toBe("2026-10-06T15:00:00.000Z");
  });

  it("stops working after it expires", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    clock.set("2026-11-05T15:00:01.000Z");
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
  });

  it("keeps links private to their student", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const created = await createHelperLink(deps, actorOf(user), input);
    expect(await listHelperLinks(deps, actorOf(other))).toEqual([]);
    await expect(revokeHelperLink(deps, actorOf(other), created.link.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await resolveHelperToken(deps, "unknown-token")).toBeNull();
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await resolveHelperToken(deps, tokenOf(created.url))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/helpers/helpers.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/helpers/index.ts`:

```ts
import { and, desc, eq, gt, helperLinks, isNull, users } from "@scholarcrew/db";
import {
  type Actor,
  type HelperActor,
  type HelperLink,
  type HelperLinkCreated,
  HelperLinkInput,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, addDays, ownedWhere, one, requireUuid, toIso, toIsoOrNull } from "../shared";

function toLink(row: typeof helperLinks.$inferSelect): HelperLink {
  return {
    id: row.id,
    label: row.label,
    helperRole: row.helperRole,
    scope: row.scope,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIsoOrNull(row.revokedAt),
    lastUsedAt: toIsoOrNull(row.lastUsedAt),
  };
}

/** HL-01: read-only link with a HelperScope list (never essays, chats, costs, or sensitive) and at most 90 days. */
export async function createHelperLink(deps: CoreDeps, actor: Actor, i: HelperLinkInput): Promise<HelperLinkCreated> {
  assertRole(actor, "student");
  const parsed = HelperLinkInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the link settings", parsed.error.issues);
  const now = deps.clock.now();
  const token = randomToken();
  const scope = [...new Set(parsed.data.scope)];
  const row = one(
    await deps.db
      .insert(helperLinks)
      .values({
        studentId: actor.userId,
        label: parsed.data.label,
        helperRole: parsed.data.helperRole,
        scope,
        tokenHash: sha256Hex(token),
        createdAt: now,
        expiresAt: addDays(now, parsed.data.expiresInDays),
      })
      .returning(),
    "helper_links insert",
  );
  await recordAudit(deps, {
    actor,
    action: "helper_link_created",
    entityType: "helper_link",
    entityId: row.id,
    meta: { helperRole: row.helperRole, scope },
  });
  return { link: toLink(row), url: `${deps.config.appUrl}/h/${token}` };
}

export async function listHelperLinks(deps: CoreDeps, actor: Actor): Promise<HelperLink[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(helperLinks)
    .where(eq(helperLinks.studentId, actor.userId))
    .orderBy(desc(helperLinks.createdAt));
  return rows.map(toLink);
}

export async function revokeHelperLink(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Link not found");
  const [row] = await deps.db
    .select()
    .from(helperLinks)
    .where(and(eq(helperLinks.id, id), eq(helperLinks.studentId, actor.userId)));
  if (!row) throw notFound("Link not found");
  if (row.revokedAt === null) {
    await deps.db.update(helperLinks).set({ revokedAt: deps.clock.now() }).where(eq(helperLinks.id, id));
  }
  await recordAudit(deps, { actor, action: "helper_link_revoked", entityType: "helper_link", entityId: id });
}

/** A live, unrevoked link of an active student becomes a HelperActor. Anything else is null (the route returns 404). */
export async function resolveHelperToken(deps: CoreDeps, token: string): Promise<HelperActor | null> {
  if (!token) return null;
  const now = deps.clock.now();
  const [row] = await deps.db
    .select({ link: helperLinks, status: users.status })
    .from(helperLinks)
    .innerJoin(users, eq(users.id, helperLinks.studentId))
    .where(and(eq(helperLinks.tokenHash, sha256Hex(token)), isNull(helperLinks.revokedAt), gt(helperLinks.expiresAt, now)))
    .limit(1);
  if (!row || row.status !== "active") return null;
  await deps.db.update(helperLinks).set({ lastUsedAt: now }).where(eq(helperLinks.id, row.link.id));
  const actor: HelperActor = {
    kind: "helper",
    helperLinkId: row.link.id,
    studentId: row.link.studentId,
    scope: row.link.scope,
  };
  await recordAudit(deps, {
    actor,
    action: "helper_link_used",
    entityType: "helper_link",
    entityId: row.link.id,
    meta: { scope: row.link.scope },
  });
  return actor;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 15 files, 166 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/helpers
git commit -m "feat(core): scoped helper links, revoke, token resolution"
```

### F15: Extension API tokens

- [ ] **Step 1: Write the failing test**

`packages/core/src/apitokens/apitokens.test.ts`:

```ts
import { auditEvents, apiTokens, eq, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import type { ApiTokenScope } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { actorOf } from "../../test/helpers";
import { sha256Hex } from "../crypto";
import { fixedClock, createTestDeps } from "../shared";
import { createApiToken, listApiTokens, resolveApiToken, revokeApiToken } from "./index";

const input = { label: "Chrome on my laptop", scopes: ["autofill", "save_page"] as ApiTokenScope[] };

describe("api tokens", () => {
  it("shows the secret once and stores only its hash", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), input);
    expect(created.secret).toMatch(/^sct_[A-Za-z0-9_-]{43}$/);
    expect(created.token).toMatchObject({ label: "Chrome on my laptop", lastUsedAt: null, revokedAt: null });
    const [row] = await deps.db.select().from(apiTokens);
    expect(row?.tokenHash).toBe(sha256Hex(created.secret));
    const listed = await listApiTokens(deps, actorOf(user));
    expect(listed).toEqual([created.token]);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
  });

  it("resolves a live bearer to the user actor and scopes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    expect(await resolveApiToken(deps, created.secret)).toEqual({
      actor: { kind: "user", userId: user.id, role: "student" },
      scopes: ["autofill"],
    });
    const [row] = await deps.db.select().from(apiTokens);
    expect(row?.lastUsedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("returns null for revoked, unknown, or malformed tokens and inactive users", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const a = await createApiToken(deps, actorOf(user), input);
    await revokeApiToken(deps, actorOf(user), a.token.id);
    expect(await resolveApiToken(deps, a.secret)).toBeNull();
    expect(await resolveApiToken(deps, "sct_unknown")).toBeNull();
    expect(await resolveApiToken(deps, "Bearer abc")).toBeNull();
    const b = await createApiToken(deps, actorOf(user), input);
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await resolveApiToken(deps, b.secret)).toBeNull();
  });

  it("keeps tokens private to their owner", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const created = await createApiToken(deps, actorOf(user), input);
    expect(await listApiTokens(deps, actorOf(other))).toEqual([]);
    await expect(revokeApiToken(deps, actorOf(other), created.token.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates label and scopes", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(createApiToken(deps, actorOf(user), { ...input, label: "" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      createApiToken(deps, actorOf(user), { label: "x", scopes: ["admin"] as unknown as ApiTokenScope[] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("token expiry and role", () => {
  it("refuses a parent and expires a student token after 180 days", async () => {
    const clock = fixedClock("2026-10-06T15:00:00Z");
    const deps = createTestDeps({ clock });
    const parent = await factories.parent(deps.db);
    const { user } = await factories.student(deps.db);
    await expect(createApiToken(deps, actorOf(parent), { label: "Parent", scopes: ["autofill"] })).rejects.toMatchObject({ code: "forbidden" });
    const minted = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    expect(minted.token.expiresAt).toBe("2027-04-04T15:00:00.000Z");
    clock.set("2027-04-05T15:00:00Z");
    expect(await resolveApiToken(deps, minted.secret)).toBeNull();
    await revokeApiToken(deps, actorOf(user), minted.token.id);
    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.entityId, minted.token.id));
    expect(audit.map((row) => row.action).sort()).toEqual(["api_token_created", "api_token_revoked"]);
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/apitokens/apitokens.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/apitokens/index.ts`:

```ts
import { and, apiTokens, desc, eq, isNull, users } from "@scholarcrew/db";
import {
  type Actor,
  type ApiToken,
  type ApiTokenCreated,
  ApiTokenInput,
  type ApiTokenScope,
  type UserActor,
  invalidInput,
  notFound,
  userActor} from "@scholarcrew/domain";
import { assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, addDays, ownedWhere, one, requireUuid, toIso, toIsoOrNull } from "../shared";

const PREFIX = "sct_";
export const API_TOKEN_DAYS = 180;

function toToken(row: typeof apiTokens.$inferSelect): ApiToken {
  return {
    id: row.id,
    label: row.label,
    scopes: row.scopes,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
    lastUsedAt: toIsoOrNull(row.lastUsedAt),
    revokedAt: toIsoOrNull(row.revokedAt),
  };
}

/** The secret is returned once; only its sha256 is stored. */
export async function createApiToken(
  deps: CoreDeps,
  actor: Actor,
  i: { label: string; scopes: ApiTokenScope[] },
): Promise<ApiTokenCreated> {
  assertRole(actor, "student");
  const parsed = ApiTokenInput.safeParse(i);
  if (!parsed.success) throw invalidInput("Check the token label and scopes", parsed.error.issues);
  const secret = `${PREFIX}${randomToken()}`;
  const row = one(
    await deps.db
      .insert(apiTokens)
      .values({
        userId: actor.userId,
        tokenHash: sha256Hex(secret),
        scopes: [...new Set(parsed.data.scopes)],
        label: parsed.data.label,
        createdAt: deps.clock.now(),
        expiresAt: addDays(deps.clock.now(), API_TOKEN_DAYS),
      })
      .returning(),
    "api_tokens insert",
  );
  await recordAudit(deps, { actor, action: "api_token_created", entityType: "api_token", entityId: row.id });
  return { token: toToken(row), secret };
}

export async function listApiTokens(deps: CoreDeps, actor: Actor): Promise<ApiToken[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, actor.userId))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toToken);
}

export async function revokeApiToken(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Token not found");
  const updated = await deps.db
    .update(apiTokens)
    .set({ revokedAt: deps.clock.now() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, actor.userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  if (updated.length > 0) {
    await recordAudit(deps, { actor, action: "api_token_revoked", entityType: "api_token", entityId: id });
    return;
  }
  const [exists] = await deps.db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, actor.userId)));
  if (!exists) throw notFound("Token not found");
}

export async function resolveApiToken(
  deps: CoreDeps,
  bearer: string,
): Promise<{ actor: UserActor; scopes: ApiTokenScope[] } | null> {
  if (!bearer.startsWith(PREFIX)) return null;
  const [row] = await deps.db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, sha256Hex(bearer)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row || row.user.status !== "active" || row.token.expiresAt <= deps.clock.now()) return null;
  await deps.db.update(apiTokens).set({ lastUsedAt: deps.clock.now() }).where(eq(apiTokens.id, row.token.id));
  return { actor: userActor(row.user.id, row.user.role), scopes: row.token.scopes };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 16 files, 172 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/apitokens
git commit -m "feat(core): extension API tokens"
```

### F16: Notifications, preferences, email delivery with quiet hours

- [ ] **Step 1: Write the failing test**

`packages/core/src/notifications/notifications.test.ts`:

```ts
import { devOutbox, eq, isNotNull, notificationPrefs, notifications, users } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail } from "../../test/helpers";
import { type SmsSender, createTestDeps, fixedClock } from "../shared";
import {
  deliverEmail,
  deliverSms,
  getPrefs,
  listNotifications,
  markRead,
  notify,
  retractNotification,
  secondsUntilQuietEnd,
  updatePrefs} from "./index";

const note = (userId: string, o: { dedupeKey?: string; email?: boolean } = {}) => ({
  userId,
  kind: "deadline" as const,
  title: "Maple Community Award is due in 3 days",
  body: "Your draft is ready for one more read.",
  link: "/scholarships/maple-community-award",
  dedupeKey: `deadline:${userId}:maple:3`,
  ...o,
});

describe("notify", () => {
  it("inserts once per dedupe key", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await notify(deps, SYSTEM, note(user.id));
    expect(first).toMatchObject({ kind: "deadline", readAt: null, createdAt: "2026-10-06T15:00:00.000Z" });
    expect(await notify(deps, SYSTEM, note(user.id))).toBeNull();
    expect(await deps.db.select().from(notifications)).toHaveLength(1);
  });

  it("enqueues email only when asked and allowed", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id, { email: true }));
    expect(deps.jobs.sent).toEqual([{ name: "notify.email", payload: { notificationId: n?.id } }]);
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    await notify(deps, SYSTEM, note(user.id, { email: true, dedupeKey: "other" }));
    expect(deps.jobs.sent).toHaveLength(1);
  });

  it("is system-only and skips inactive users", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(notify(deps, actorOf(user), note(user.id))).rejects.toMatchObject({ code: "forbidden" });
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, user.id));
    expect(await notify(deps, SYSTEM, note(user.id))).toBeNull();
  });

  it("lists and marks read for the owner only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    expect(await listNotifications(deps, actorOf(other))).toEqual([]);
    await expect(markRead(deps, actorOf(other), n.id)).rejects.toMatchObject({ code: "not_found" });
    await markRead(deps, actorOf(user), n.id);
    expect((await listNotifications(deps, actorOf(user)))[0]?.readAt).toBe("2026-10-06T15:00:00.000Z");
  });
});

describe("preferences", () => {
  it("reads defaults, updates fields, and encrypts the phone number", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    expect(await getPrefs(deps, actorOf(user))).toEqual({
      digestDay: 0,
      digestHour: 16,
      emailEnabled: true,
      smsEnabled: false,
      phoneSet: false,
      quietStartHour: 21,
      quietEndHour: 7,
    });
    const next = await updatePrefs(deps, actorOf(user), { digestDay: 3, phone: "+15125550100", smsEnabled: true });
    expect(next).toMatchObject({ digestDay: 3, smsEnabled: true, phoneSet: true });
    const [row] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, user.id));
    expect(row?.phoneCiphertext?.includes(Buffer.from("5125550100"))).toBe(false);
    await expect(updatePrefs(deps, actorOf(user), { phone: null })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await updatePrefs(deps, actorOf(user), { smsEnabled: false, phone: null })).toMatchObject({ phoneSet: false });
  });

  it("refuses SMS without a phone number", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(updatePrefs(deps, actorOf(user), { smsEnabled: true })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("deliverEmail", () => {
  it("sends only the title, body, and link outside quiet hours, once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id, { email: true }));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await latestEmail(deps.db, user.email)).toEqual({
      subject: "Maple Community Award is due in 3 days",
      text: [
        "Your draft is ready for one more read.",
        "",
        "http://localhost:3000/scholarships/maple-community-award",
        "",
        "Change email settings: http://localhost:3000/settings",
      ].join("\n"),
    });
    const [row] = await deps.db.select().from(notifications);
    expect(row?.emailedAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox).where(eq(devOutbox.to, user.email))).toHaveLength(1);
  });

  it("waits until quiet hours end in the user's time zone", async () => {
    const clock = fixedClock("2026-10-07T03:30:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox)).toHaveLength(0);
    expect(deps.jobs.sent).toEqual([
      { name: "notify.email", payload: { notificationId: n.id }, opts: { startAfterSeconds: 30600 } },
    ]);
  });

  it("doesn't send when email is off", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(notificationPrefs).values({ userId: user.id, emailEnabled: false });
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await deliverEmail(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(devOutbox)).toHaveLength(0);
  });

  it("computes the wait for same-day and overnight quiet windows", () => {
    const tenAmChicago = new Date("2026-10-06T15:00:00.000Z");
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 9, 11)).toBe(3600);
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 21, 7)).toBe(0);
    expect(secondsUntilQuietEnd(tenAmChicago, "America/Chicago", 8, 8)).toBe(0);
  });
});

function fakeSms(fail = false): SmsSender & { sent: Array<{ to: string; text: string }> } {
  const sent: Array<{ to: string; text: string }> = [];
  return {
    sent,
    async send(m) {
      if (fail) throw Object.assign(new Error("twilio 400 0"), { status: 400 });
      sent.push(m);
    },
  };
}

async function textingStudent(deps: ReturnType<typeof createTestDeps>) {
  const { user } = await factories.student(deps.db);
  await updatePrefs(deps, actorOf(user), { phone: "+15125550100", smsEnabled: true });
  return user;
}

describe("SMS (R2I-9)", () => {
  it("notify enqueues a text only for an opted-in user", async () => {
    const deps = createTestDeps();
    const { user: quiet } = await factories.student(deps.db);
    await notify(deps, SYSTEM, { ...note(quiet.id), sms: true });
    expect(deps.jobs.sent).toEqual([]);
    const texter = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, { ...note(texter.id), sms: true });
    await notify(deps, SYSTEM, { ...note(texter.id), dedupeKey: "no-sms" });
    expect(deps.jobs.sent).toEqual([{ name: "notify.sms", payload: { notificationId: n?.id } }]);
  });

  it("deliverSms sends the title and link once, and nothing else", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, { ...note(user.id), sms: true });
    if (!n) throw new Error("expected a notification");
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sms.sent).toEqual([
      {
        to: "+15125550100",
        text: "ScholarCrew: Maple Community Award is due in 3 days http://localhost:3000/scholarships/maple-community-award Reply STOP to opt out.",
      },
    ]);
    expect(sms.sent[0]?.text).not.toContain("draft");
    const [row] = await deps.db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row?.smsSentAt?.toISOString()).toBe("2026-10-06T15:00:00.000Z");
    await expect(deliverSms(deps, actorOf(user), n.id, sms)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("shortens only the title, so the link and the opt-out line always fit (R3E-7)", async () => {
    const deps = createTestDeps();
    deps.config.appUrl = `https://${"a".repeat(32)}.test`; // 45 characters
    const user = await textingStudent(deps);
    const link = `/scholarships/${"s".repeat(80)}`;
    const n = await notify(deps, SYSTEM, { ...note(user.id), title: `${"N".repeat(184)} is due tomorrow`, link, sms: true });
    if (!n) throw new Error("expected a notification");
    expect(n.title).toHaveLength(200);
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    const text = sms.sent[0]?.text ?? "";
    expect(text.startsWith("ScholarCrew: NNN")).toBe(true);
    expect(text.endsWith(`${deps.config.appUrl}${link} Reply STOP to opt out.`)).toBe(true);
    expect(text).toContain("…");
    expect(text.length).toBeLessThanOrEqual(300);
  });

  it("skips missing rows, opted-out or phoneless users, and inactive accounts", async () => {
    const deps = createTestDeps();
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f", sms);
    const optedOut = await textingStudent(deps);
    await updatePrefs(deps, actorOf(optedOut), { smsEnabled: false });
    const { user: phoneless } = await factories.student(deps.db);
    await deps.db.insert(notificationPrefs).values({ userId: phoneless.id, smsEnabled: true });
    const gone = await textingStudent(deps);
    await deps.db.update(users).set({ status: "deleted" }).where(eq(users.id, gone.id));
    for (const u of [optedOut, phoneless]) {
      const n = await notify(deps, SYSTEM, { ...note(u.id), dedupeKey: `skip:${u.id}` });
      if (n) await deliverSms(deps, SYSTEM, n.id, sms);
    }
    const [goneRow] = await deps.db
      .insert(notifications)
      .values({ userId: gone.id, kind: "deadline", title: "t", body: "", dedupeKey: "gone" })
      .returning();
    await deliverSms(deps, SYSTEM, goneRow?.id ?? "", sms);
    expect(sms.sent).toEqual([]);
    expect(await deps.db.select().from(notifications).where(isNotNull(notifications.smsSentAt))).toEqual([]);
  });

  it("waits until quiet hours end", async () => {
    const clock = fixedClock("2026-10-07T03:30:00.000Z");
    const deps = createTestDeps({ clock });
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    const sms = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sms.sent).toEqual([]);
    expect(deps.jobs.sent).toEqual([
      { name: "notify.sms", payload: { notificationId: n.id }, opts: { startAfterSeconds: 30600 } },
    ]);
  });

  it("releases the claim when the sender fails, so the job retries", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await expect(deliverSms(deps, SYSTEM, n.id, fakeSms(true))).rejects.toThrow("twilio 400 0");
    const [row] = await deps.db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row?.smsSentAt).toBeNull();
    const retry = fakeSms();
    await deliverSms(deps, SYSTEM, n.id, retry);
    expect(retry.sent).toHaveLength(1);
  });
});

describe("retractNotification (R2I-16)", () => {
  it("is system-only and deletes the row so the dedupe key is free again", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected a notification");
    await expect(retractNotification(deps, actorOf(user), n.id)).rejects.toMatchObject({ code: "forbidden" });
    await retractNotification(deps, SYSTEM, n.id);
    expect(await deps.db.select().from(notifications)).toEqual([]);
    expect(await notify(deps, SYSTEM, note(user.id))).not.toBeNull();
  });
});

describe("DST quiet end", () => {
  it("targets 07:00 local on both transition nights", () => {
    const spring = new Date("2027-03-14T07:30:00Z");
    const fall = new Date("2027-11-07T06:30:00Z");
    expect(new Date(spring.getTime() + secondsUntilQuietEnd(spring, "America/Chicago", 21, 7) * 1000).toISOString()).toBe("2027-03-14T12:00:00.000Z");
    expect(new Date(fall.getTime() + secondsUntilQuietEnd(fall, "America/Chicago", 21, 7) * 1000).toISOString()).toBe("2027-11-07T13:00:00.000Z");
  });
});


describe("ambiguous notification sends", () => {
  it("keeps an email claim after a timeout so a retry sends once", async () => {
    let sends = 0;
    const deps = createTestDeps({ email: { async send() { sends += 1; throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); } } });
    const { user } = await factories.student(deps.db);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected notice");
    await deliverEmail(deps, SYSTEM, n.id);
    await deliverEmail(deps, SYSTEM, n.id);
    expect(sends).toBe(1);
  });
  it("keeps the SMS claim after an abort", async () => {
    const deps = createTestDeps();
    const user = await textingStudent(deps);
    const n = await notify(deps, SYSTEM, note(user.id));
    if (!n) throw new Error("expected notice");
    let sends = 0;
    const sms: SmsSender = { async send() { sends += 1; throw Object.assign(new Error("abort"), { name: "AbortError" }); } };
    await deliverSms(deps, SYSTEM, n.id, sms);
    await deliverSms(deps, SYSTEM, n.id, sms);
    expect(sends).toBe(1);
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/notifications/notifications.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/notifications/index.ts`:

```ts
import { type DbOrTx, and, desc, eq, isNull, notificationPrefs, notifications, users } from "@scholarcrew/db";
import {
  type Actor,
  AppError,
  type Notification,
  type NotificationKind,
  type NotificationPrefs,
  NotificationPrefsPatch,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { decrypt, encrypt } from "../crypto";
import { type CoreDeps, type SmsSender, isUuid, safeTimeZone, localTimeParts, requireUuid, toIso, toIsoOrNull } from "../shared";

const DEFAULT_PREFS: NotificationPrefs = {
  digestDay: 0,
  digestHour: 16,
  emailEnabled: true,
  smsEnabled: false,
  phoneSet: false,
  quietStartHour: 21,
  quietEndHour: 7,
};

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: toIso(row.createdAt),
    readAt: toIsoOrNull(row.readAt),
  };
}

async function loadPrefs(db: DbOrTx, userId: string): Promise<NotificationPrefs> {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  if (!row) return { ...DEFAULT_PREFS };
  return {
    digestDay: row.digestDay,
    digestHour: row.digestHour,
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    phoneSet: row.phoneCiphertext !== null,
    quietStartHour: row.quietStartHour,
    quietEndHour: row.quietEndHour,
  };
}

/** Seconds until the quiet window ends, or 0 when `now` is outside it. Windows may wrap midnight. */
export function secondsUntilQuietEnd(now: Date, timeZone: string, startHour: number, endHour: number): number {
  if (startHour === endHour) return 0;
  const { hour, minute, second } = localTimeParts(now, safeTimeZone(timeZone));
  const quiet = startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  if (!quiet) return 0;
  const zone = safeTimeZone(timeZone);
  const firstMinute = now.getTime() - (minute * 60 + second) * 1000 + 60_000;
  for (let instant = firstMinute; instant <= now.getTime() + 48 * 3_600_000; instant += 60_000) {
    const parts = localTimeParts(new Date(instant), zone);
    if (parts.hour === endHour && parts.minute === 0 && parts.second === 0) return Math.ceil((instant - now.getTime()) / 1000);
  }
  throw new Error("Quiet-hour end not found");
}

/**
 * System only. Returns null when dedupeKey already exists or the user isn't active.
 * Callers never put essay text or sensitive values in title or body.
 * `sms` (R2I-9) also queues a text when the user turned texts on and saved a phone number.
 */
export async function notify(
  deps: CoreDeps,
  system: Actor,
  i: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string;
    dedupeKey: string;
    email?: boolean;
    sms?: boolean;
  },
): Promise<Notification | null> {
  assertSystem(system);
  const [user] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, i.userId));
  if (!user || user.status !== "active") return null;
  const [row] = await deps.db
    .insert(notifications)
    .values({
      userId: i.userId,
      kind: i.kind,
      title: i.title.slice(0, 200),
      body: i.body.slice(0, 1000),
      link: i.link ?? "",
      dedupeKey: i.dedupeKey,
      createdAt: deps.clock.now(),
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
  const existing = row ? null : (await deps.db.select().from(notifications).where(and(eq(notifications.dedupeKey, i.dedupeKey), eq(notifications.userId, i.userId))).limit(1))[0];
  const target = row ?? existing;
  if (!target) return null;
  // Replaying delivery queues recovers an enqueue failure; send timestamps prevent duplicate delivery.
  if (i.email || i.sms) {
    const prefs = await loadPrefs(deps.db, i.userId);
    if (i.email && prefs.emailEnabled && !target.emailSentAt) await deps.jobs.enqueue("notify.email", { notificationId: target.id });
    if (i.sms && prefs.smsEnabled && prefs.phoneSet && !target.smsSentAt) await deps.jobs.enqueue("notify.sms", { notificationId: target.id });
  }
  return row ? toNotification(row) : null;
}

/** System only (R2I-16: the digest job removes its guard row after a failed send so the next run retries). */
export async function retractNotification(deps: CoreDeps, system: Actor, id: string): Promise<void> {
  assertSystem(system);
  if (!isUuid(id)) return;
  await deps.db.delete(notifications).where(eq(notifications.id, id));
}

export async function listNotifications(deps: CoreDeps, actor: Actor): Promise<Notification[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return rows.map(toNotification);
}

export async function markRead(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  requireUuid(id, "Notification not found");
  const [row] = await deps.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)));
  if (!row) throw notFound("Notification not found");
  if (row.readAt === null) {
    await deps.db.update(notifications).set({ readAt: deps.clock.now() }).where(eq(notifications.id, id));
  }
}

export async function getPrefs(deps: CoreDeps, actor: Actor): Promise<NotificationPrefs> {
  assertUser(actor);
  return loadPrefs(deps.db, actor.userId);
}

export async function updatePrefs(deps: CoreDeps, actor: Actor, p: NotificationPrefsPatch): Promise<NotificationPrefs> {
  assertUser(actor);
  const parsed = NotificationPrefsPatch.safeParse(p);
  if (!parsed.success) throw invalidInput("Check your notification settings", parsed.error.issues);
  const { phone, ...rest } = parsed.data;
  const current = await loadPrefs(deps.db, actor.userId);
  const phoneSet = phone === undefined ? current.phoneSet : phone !== null;
  if ((rest.smsEnabled ?? current.smsEnabled) && !phoneSet) {
    throw invalidInput("Add a phone number to turn on text reminders");
  }
  let phoneCols: Partial<Pick<typeof notificationPrefs.$inferInsert, "phoneCiphertext" | "phoneIv" | "phoneTag" | "phoneKeyId">> = {};
  if (phone === null) phoneCols = { phoneCiphertext: null, phoneIv: null, phoneTag: null };
  if (typeof phone === "string") {
    const sealed = encrypt(deps.config.keyring, Buffer.from(phone, "utf8"));
    phoneCols = { phoneCiphertext: sealed.ciphertext, phoneIv: sealed.iv, phoneTag: sealed.tag, phoneKeyId: sealed.keyId };
  }
  const set = { ...rest, ...phoneCols, updatedAt: deps.clock.now() };
  await deps.db
    .insert(notificationPrefs)
    .values({ userId: actor.userId, ...set })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set });
  return loadPrefs(deps.db, actor.userId);
}

/** System only (notify.email job). Respects email prefs and quiet hours in the user's time zone. */
export async function deliverEmail(deps: CoreDeps, system: Actor, notificationId: string): Promise<void> {
  assertSystem(system);
  if (!isUuid(notificationId)) return;
  const [row] = await deps.db
    .select({ n: notifications, email: users.email, timeZone: users.timeZone, status: users.status })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId));
  if (!row || row.n.emailedAt !== null || row.status !== "active") return;
  const prefs = await loadPrefs(deps.db, row.n.userId);
  if (!prefs.emailEnabled) return;
  const now = deps.clock.now();
  const wait = secondsUntilQuietEnd(now, row.timeZone, prefs.quietStartHour, prefs.quietEndHour);
  if (wait > 0) {
    await deps.jobs.enqueue("notify.email", { notificationId }, { startAfterSeconds: wait });
    return;
  }
  const appUrl = deps.config.appUrl;
  const link = row.n.link.startsWith("/") ? `${appUrl}${row.n.link}` : row.n.link;
  const text = [row.n.body, ...(link ? ["", link] : []), "", `Change email settings: ${appUrl}/settings`].join("\n");
  const claimed = await deps.db.update(notifications).set({ emailedAt: now }).where(and(eq(notifications.id, notificationId), isNull(notifications.emailedAt))).returning();
  if (!claimed.length) return;
  try { await deps.email.send({ to: row.email, subject: row.n.title, text }, { idempotencyKey: `notification-${notificationId}` }); }
  catch (error) {
    // A timeout may mean the provider accepted it. Keep that claim and avoid a duplicate.
    if (error instanceof AppError && typeof error.details === "object" && error.details !== null && "status" in error.details && Number(error.details.status) >= 400 && Number(error.details.status) < 500) {
      await deps.db.update(notifications).set({ emailedAt: null }).where(eq(notifications.id, notificationId));
    }
    else { console.error("email.maybe_sent", { notificationId }); return; }
    throw error;
  }
}

const SMS_MAX = 300;
const SMS_PREFIX = "ScholarCrew:";
const SMS_OPT_OUT = "Reply STOP to opt out.";

/**
 * System only (notify.sms job, R2I-9, NO-05). Texts only the title and link, outside quiet hours, once.
 * The send is claimed through smsSentAt first; a failed send releases the claim and rethrows so the
 * job retries only after a definite 4xx rejection. Ambiguous sends keep the claim. The phone number is decrypted here and never logged.
 */
export async function deliverSms(deps: CoreDeps, system: Actor, notificationId: string, sms: SmsSender): Promise<void> {
  assertSystem(system);
  if (!isUuid(notificationId)) return;
  const [row] = await deps.db
    .select({ n: notifications, timeZone: users.timeZone, status: users.status })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId));
  if (!row || row.n.smsSentAt !== null || row.status !== "active") return;
  const [prefs] = await deps.db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, row.n.userId));
  if (!prefs?.smsEnabled || !prefs.phoneCiphertext || !prefs.phoneIv || !prefs.phoneTag) return;
  const now = deps.clock.now();
  const wait = secondsUntilQuietEnd(now, row.timeZone, prefs.quietStartHour, prefs.quietEndHour);
  if (wait > 0) {
    await deps.jobs.enqueue("notify.sms", { notificationId }, { startAfterSeconds: wait });
    return;
  }
  const claimed = await deps.db
    .update(notifications)
    .set({ smsSentAt: now })
    .where(and(eq(notifications.id, notificationId), isNull(notifications.smsSentAt)))
    .returning({ id: notifications.id });
  if (claimed.length === 0) return;
  const to = decrypt(deps.config.keyring, {
    ciphertext: prefs.phoneCiphertext,
    iv: prefs.phoneIv,
    tag: prefs.phoneTag,
    keyId: prefs.phoneKeyId,
  }).toString("utf8");
  const link = row.n.link.startsWith("/") ? `${deps.config.appUrl}${row.n.link}` : row.n.link;
  // R3E-7: the prefix, link, and opt-out line are fixed; only the title is shortened to fit SMS_MAX.
  const tail = [link, SMS_OPT_OUT].filter(Boolean).join(" ");
  const room = SMS_MAX - SMS_PREFIX.length - tail.length - 2;
  const title = row.n.title.length > room ? `${row.n.title.slice(0, Math.max(0, room - 1))}…` : row.n.title;
  const text = `${SMS_PREFIX} ${title} ${tail}`;
  try {
    await sms.send({ to, text });
  } catch (e) {
    const status = typeof e === "object" && e !== null && "status" in e ? Number(e.status) : null;
    if (status !== null && status >= 400 && status < 500) {
      await deps.db.update(notifications).set({ smsSentAt: null }).where(eq(notifications.id, notificationId));
      throw e;
    }
    console.error("sms.maybe_sent", { notificationId });
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 17 files, 192 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/notifications
git commit -m "feat(core): notifications with dedupe, prefs, quiet-hours email delivery"
```

### F17: Encrypted documents and blobs

- [ ] **Step 1: Write the failing test**

`packages/core/src/documents/documents.test.ts`:

```ts
import { blobs, documents } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { MAX_UPLOAD_BYTES } from "@scholarcrew/domain";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { createTestDeps, fixedClock } from "../shared";
import {
  deleteDocument,
  getBlob,
  getDocument,
  listDocuments,
  putBlob,
  readDocumentBytes,
  uploadDocument} from "./index";

const pdf = Buffer.from("%PDF-1.7 transcript for Maya Rivera");
const upload = { kind: "transcript" as const, filename: "transcript.pdf", mime: "application/pdf", bytes: pdf };

describe("documents", () => {
  it("encrypts uploads at rest and reads them back for the owner and system", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    expect(meta).toMatchObject({
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      sizeBytes: pdf.length,
      parseStatus: "none",
      uploadedAt: "2026-10-06T15:00:00.000Z",
    });
    const [blob] = await deps.db.select().from(blobs);
    expect(blob?.ciphertext.includes(Buffer.from("Maya Rivera"))).toBe(false);
    expect((await readDocumentBytes(deps, actorOf(user), meta.id)).bytes.equals(pdf)).toBe(true);
    expect((await readDocumentBytes(deps, SYSTEM, meta.id)).bytes.equals(pdf)).toBe(true);
    expect(await getDocument(deps, actorOf(user), meta.id)).toEqual(meta);
  });

  it("hides documents from other users, parents, and admins", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const admin = await factories.admin(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    for (const actor of [actorOf(other), actorOf(parent), actorOf(admin)]) {
      await expect(getDocument(deps, actor, meta.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(readDocumentBytes(deps, actor, meta.id)).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("rejects unsupported types, empty files, and files over 10 MB", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const me = actorOf(user);
    await expect(uploadDocument(deps, me, { ...upload, mime: "application/zip" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(uploadDocument(deps, me, { ...upload, bytes: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(uploadDocument(deps, me, { ...upload, bytes: Buffer.alloc(MAX_UPLOAD_BYTES + 1) })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(await deps.db.select().from(documents)).toHaveLength(0);
    expect(await deps.db.select().from(blobs)).toHaveLength(0);
  });

  it("lists only the actor's own documents, newest first", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    const first = await uploadDocument(deps, actorOf(user), upload);
    clock.set("2026-10-07T15:00:00.000Z");
    const second = await uploadDocument(deps, actorOf(user), { ...upload, kind: "award_letter", filename: "letter.pdf" });
    await uploadDocument(deps, actorOf(other), upload);
    expect((await listDocuments(deps, actorOf(user))).map((d) => d.id)).toEqual([second.id, first.id]);
    expect(await listDocuments(deps, actorOf(parent))).toEqual([]);
    await expect(listDocuments(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("strips paths from file names", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const text = { kind: "essay" as const, mime: "text/plain", bytes: Buffer.from("My story") };
    expect((await uploadDocument(deps, actorOf(user), { ...text, filename: "../../etc/passwd.txt" })).filename).toBe(
      "passwd.txt",
    );
    expect((await uploadDocument(deps, actorOf(user), { ...text, filename: "  " })).filename).toBe("upload");
  });

  it("deletes the document and its blob for the owner only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const meta = await uploadDocument(deps, actorOf(user), upload);
    await expect(deleteDocument(deps, actorOf(other), meta.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteDocument(deps, actorOf(user), meta.id);
    await expect(getDocument(deps, actorOf(user), meta.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await deps.db.select().from(blobs)).toHaveLength(0);
  });

  it("round-trips blobs", async () => {
    const deps = createTestDeps();
    const id = await putBlob(deps, Buffer.from("export bytes"));
    expect((await getBlob(deps, id)).toString("utf8")).toBe("export bytes");
    await expect(getBlob(deps, "6f1c2a0e-9b7d-4c1e-8f00-1a2b3c4d5e6f")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("declared MIME verification", () => {
  it("refuses HTML as PNG and PDF as text", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(uploadDocument(deps, actorOf(user), { ...upload, mime: "image/png", bytes: Buffer.from("<html>evil</html>") })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(uploadDocument(deps, actorOf(user), { ...upload, mime: "text/plain" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/documents/documents.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/documents/index.ts`:

```ts
import type { Keyring } from "../crypto";

import { type DbOrTx, blobs, desc, documents, eq } from "@scholarcrew/db";
import {
  type Actor,
  type DocumentMeta,
  DocumentKind,
  MAX_UPLOAD_BYTES,
  UploadMime,
  invalidInput,
  notFound} from "@scholarcrew/domain";
import { assertOwner, assertUser } from "../access";
import { recordAudit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { type CoreDeps, one, requireUuid, toIso } from "../shared";

type DocumentRow = typeof documents.$inferSelect;

function toMeta(row: DocumentRow): DocumentMeta {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mime: UploadMime.parse(row.mime),
    sizeBytes: row.sizeBytes,
    parseStatus: row.parseStatus,
    uploadedAt: toIso(row.uploadedAt),
  };
}

function cleanFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const trimmed = base.trim().slice(0, 255);
  return trimmed.length > 0 ? trimmed : "upload";
}

export function sniffMime(bytes: Uint8Array): UploadMime | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes("\0") && !text.trimStart().startsWith("<")) return "text/plain";
  } catch { return null; }
  return null;
}

async function insertBlob(db: DbOrTx, key: Keyring, bytes: Buffer, now: Date): Promise<string> {
  const sealed = encrypt(key, bytes);
  const row = one(await db.insert(blobs).values({ ...sealed, createdAt: now }).returning({ id: blobs.id }), "blobs insert");
  return row.id;
}

/** Encrypts bytes with the app key into one blob row. */
export async function putBlob(deps: CoreDeps, bytes: Buffer): Promise<string> {
  return insertBlob(deps.db, deps.config.keyring, bytes, deps.clock.now());
}

export async function getBlob(deps: CoreDeps, blobId: string): Promise<Buffer> {
  requireUuid(blobId, "File not found");
  const [row] = await deps.db.select().from(blobs).where(eq(blobs.id, blobId));
  if (!row) throw notFound("File not found");
  return decrypt(deps.config.keyring, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId });
}

/** ON-02: PDF, text, PNG, or JPEG up to 10 MB, encrypted at rest. */
export async function uploadDocument(
  deps: CoreDeps,
  actor: Actor,
  i: { kind: DocumentKind; filename: string; mime: string; bytes: Buffer },
): Promise<DocumentMeta> {
  assertUser(actor);
  const kind = DocumentKind.safeParse(i.kind);
  if (!kind.success) throw invalidInput("Choose a document type");
  const mime = UploadMime.safeParse(i.mime);
  if (!mime.success) throw invalidInput("Upload a PDF, text file, PNG, or JPEG");
  if (i.bytes.length === 0) throw invalidInput("The file is empty");
  if (i.bytes.length > MAX_UPLOAD_BYTES) throw invalidInput("Files can be up to 10 MB");
  const sniffed = sniffMime(i.bytes);
  if (sniffed !== mime.data) throw invalidInput(`That file doesn't look like a ${mime.data}.`);
  const now = deps.clock.now();
  const ownerId = actor.userId;
  const row = await deps.db.transaction(async (tx) => {
    const blobId = await insertBlob(tx, deps.config.keyring, i.bytes, now);
    return one(
      await tx
        .insert(documents)
        .values({
          ownerId,
          kind: kind.data,
          filename: cleanFilename(i.filename),
          mime: sniffed,
          sizeBytes: i.bytes.length,
          blobId,
          uploadedAt: now,
        })
        .returning(),
      "documents insert",
    );
  });
  await recordAudit(deps, {
    actor,
    action: "document_uploaded",
    entityType: "document",
    entityId: row.id,
    meta: { kind: row.kind, sizeBytes: row.sizeBytes },
  });
  return toMeta(row);
}

async function loadDocument(deps: CoreDeps, actor: Actor, id: string): Promise<DocumentRow> {
  requireUuid(id, "Document not found");
  const [row] = await deps.db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw notFound("Document not found");
  assertOwner(actor, row.ownerId);
  return row;
}

export async function getDocument(deps: CoreDeps, actor: Actor, id: string): Promise<DocumentMeta> {
  return toMeta(await loadDocument(deps, actor, id));
}

/** The actor's own uploads, newest first. Documents are never shared with family or helpers. */
export async function listDocuments(deps: CoreDeps, actor: Actor): Promise<DocumentMeta[]> {
  assertUser(actor);
  const rows = await deps.db
    .select()
    .from(documents)
    .where(eq(documents.ownerId, actor.userId))
    .orderBy(desc(documents.uploadedAt));
  return rows.map(toMeta);
}

/** Owner or system (offer parsing). Parents, helpers, and admins get not_found. */
export async function readDocumentBytes(
  deps: CoreDeps,
  actor: Actor,
  id: string,
): Promise<{ meta: DocumentMeta; bytes: Buffer }> {
  const row = await loadDocument(deps, actor, id);
  return { meta: toMeta(row), bytes: await getBlob(deps, row.blobId) };
}

export async function deleteDocument(deps: CoreDeps, actor: Actor, id: string): Promise<void> {
  assertUser(actor);
  const row = await loadDocument(deps, actor, id);
  await deps.db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.id, row.id));
    const others = await tx.select({ id: documents.id }).from(documents).where(eq(documents.blobId, row.blobId));
    if (others.length === 0) await tx.delete(blobs).where(eq(blobs.id, row.blobId));
  });
  await recordAudit(deps, { actor, action: "document_deleted", entityType: "document", entityId: row.id });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 18 files, 200 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/documents
git commit -m "feat(core): encrypted document uploads and blobs"
```

### F18: Account export

- [ ] **Step 1: Write the failing test**

`packages/core/src/account/export.test.ts`:

```ts
import { activities, auditEvents, blobs, eq, essayVersions, familyTasks, notifications } from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import * as documentsModule from "../documents";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM, actorOf } from "../../test/helpers";
import { uploadDocument } from "../documents";
import { createFact } from "../memory";
import { createTestDeps, fixedClock } from "../shared";
import { buildExport, getExport, latestExport, requestExport } from "./export";

describe("account export", () => {
  it("queues an export and its job", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    expect(record).toMatchObject({ status: "queued", expiresAt: null, downloadUrl: null, createdAt: "2026-10-06T15:00:00.000Z" });
    expect(deps.jobs.sent).toEqual([{ name: "account.export", payload: { exportId: record.id } }]);
    expect(await deps.db.select().from(auditEvents).where(eq(auditEvents.action, "export_requested"))).toHaveLength(1);
  });

  it("builds one encrypted JSON + Markdown file of everything the student owns", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    await createFact(deps, actorOf(user), { key: "county", value: "Maple", visibility: "crew", source: "user_stated", sourceRef: null });
    await factories.story(deps.db, user.id, { title: "Library STEM night" });
    await factories.story(deps.db, other.id, { title: "Other kid story" });
    const essay = await factories.essay(deps.db, user.id, { title: "Why engineering", currentVersion: 2 });
    await deps.db.insert(essayVersions).values([
      { essayId: essay.id, version: 1, body: "An early attempt.", wordCount: 3, authorId: user.id },
      { essayId: essay.id, version: 2, body: "Second draft body.", wordCount: 3, authorId: user.id },
    ]);
    await deps.db.insert(activities).values({ ownerId: user.id, position: 1, name: "Robotics team", role: "Captain" });
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { record: ready, bytes } = await getExport(deps, actorOf(user), record.id);
    expect(ready).toMatchObject({
      status: "ready",
      expiresAt: "2026-10-07T15:00:00.000Z",
      downloadUrl: `/api/v1/account/exports/${record.id}`,
    });
    const text = bytes?.toString("utf8") ?? "";
    const file = JSON.parse(text) as {
      generatedAt: string;
      data: Record<string, Array<Record<string, unknown>>>;
      markdown: string;
    };
    expect(file.generatedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(file.data.memoryFacts).toHaveLength(1);
    expect(file.data.stories?.map((s) => s.title)).toEqual(["Library STEM night"]);
    expect(file.data.essayVersions).toHaveLength(2);
    expect(file.markdown).toContain("## Stories");
    expect(file.markdown).toContain("Library STEM night");
    expect(file.markdown).toContain("Second draft body.");
    expect(file.markdown).not.toContain("An early attempt.");
    expect(file.markdown).toContain("Robotics team");
    expect(file.markdown).toContain("county: Maple");
    expect(text).not.toContain("Other kid story");
    expect(text).not.toContain("tokenHash");
    const stored = await deps.db.select().from(blobs);
    expect(stored.some((b) => b.ciphertext.includes(Buffer.from("Library STEM night")))).toBe(false);
  });

  it("is visible only to its owner and expires after 24 hours", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await expect(getExport(deps, actorOf(other), record.id)).rejects.toMatchObject({ code: "not_found" });
    clock.set("2026-10-07T16:00:00.000Z");
    await expect(getExport(deps, actorOf(user), record.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("buildExport is system-only and runs once", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const record = await requestExport(deps, actorOf(user));
    await expect(buildExport(deps, actorOf(user), record.id, { lastAttempt: true })).rejects.toMatchObject({ code: "forbidden" });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    expect(await deps.db.select().from(blobs)).toHaveLength(1);
  });

  it("latestExport returns the owner's newest unexpired export", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user } = await factories.student(deps.db);
    const { user: other } = await factories.student(deps.db);
    expect(await latestExport(deps, actorOf(user))).toBeNull();
    const first = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, first.id, { lastAttempt: true });
    clock.set("2026-10-06T16:00:00.000Z");
    const second = await requestExport(deps, actorOf(user));
    const theirs = await requestExport(deps, actorOf(other));
    expect(await latestExport(deps, actorOf(user))).toMatchObject({ id: second.id, status: "queued" });
    expect((await latestExport(deps, actorOf(other)))?.id).toBe(theirs.id);
    await buildExport(deps, SYSTEM, second.id, { lastAttempt: true });
    expect(await latestExport(deps, actorOf(user))).toMatchObject({ id: second.id, status: "ready" });
    clock.set("2026-10-07T17:00:00.000Z");
    expect(await latestExport(deps, actorOf(user))).toBeNull();
    await expect(latestExport(deps, SYSTEM)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("lists uploaded files and notifies once when ready (R2I-18)", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await uploadDocument(deps, actorOf(user), {
      kind: "transcript",
      filename: "transcript.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-1.7 transcript"),
    });
    const record = await requestExport(deps, actorOf(user));
    const enqueueFailure = vi.spyOn(deps.jobs, "enqueue").mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(buildExport(deps, SYSTEM, record.id, { lastAttempt: true })).rejects.toThrow("queue unavailable");
    expect((await latestExport(deps, actorOf(user)))?.status).toBe("ready");
    enqueueFailure.mockRestore();
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { bytes } = await getExport(deps, actorOf(user), record.id);
    const file = JSON.parse(bytes?.toString("utf8") ?? "{}") as { markdown: string };
    expect(file.markdown).toContain("## Files you uploaded");
    expect(file.markdown).toContain("- transcript.pdf (transcript, 19 bytes)");
    expect(file.markdown).toContain("Download these from Settings → Documents.");
    const notes = await deps.db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(notes.map((n) => [n.kind, n.title, n.body, n.link, n.dedupeKey])).toEqual([
      ["system", "Your export is ready", "It's ready to download for 24 hours.", "/settings#data", `export:${record.id}`],
    ]);
    expect(deps.jobs.sent.filter((j) => j.name === "notify.email")).toEqual([
      { name: "notify.email", payload: { notificationId: notes[0]?.id } },
      { name: "notify.email", payload: { notificationId: notes[0]?.id } },
    ]);
  });

  it("adds sharing choices and family tasks, and dates facts in the student's zone (R3E-11, R3E-8)", async () => {
    // 02:00 UTC on Oct 7 is 9 pm on Oct 6 in Chicago.
    const deps = createTestDeps({ clock: fixedClock("2026-10-07T02:00:00.000Z") });
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await deps.db.insert(familyTasks).values([
      { familyId: family.id, assigneeId: parent.id, studentId: user.id, kind: "custom", title: "Gather tax documents", createdAt: deps.clock.now() },
      { familyId: family.id, assigneeId: user.id, studentId: user.id, kind: "custom", title: "Ask Dana about the budget", status: "done", createdAt: deps.clock.now() },
    ]);
    await createFact(deps, actorOf(user), { key: "county", value: "Maple", visibility: "crew", source: "user_stated", sourceRef: null });
    const record = await requestExport(deps, actorOf(user));
    await buildExport(deps, SYSTEM, record.id, { lastAttempt: true });
    const { bytes } = await getExport(deps, actorOf(user), record.id);
    const file = JSON.parse(bytes?.toString("utf8") ?? "{}") as {
      data: Record<string, Array<Record<string, unknown>>>;
      markdown: string;
    };
    expect(file.data.shareSettings).toHaveLength(9);
    expect(file.data.familyTasks?.map((t) => t.title).sort()).toEqual(["Ask Dana about the budget", "Gather tax documents"]);
    expect(file.markdown.startsWith("# ScholarCrew export")).toBe(true);
    expect(file.markdown).toContain("## Sharing with family");
    expect(file.markdown).toContain("- deadlines: on");
    expect(file.markdown).toContain("- essays: off");
    expect(file.markdown).toContain("## Family tasks");
    expect(file.markdown).toContain("- Gather tax documents (todo)");
    expect(file.markdown).toContain("- Ask Dana about the budget (done)");
    expect(file.markdown).toContain("county: Maple (user_stated, 2026-10-06)");
  });
});

describe("export retry and reuse", () => {
  it("reuses the queued request and marks failed only on the last attempt", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const first = await requestExport(deps, actorOf(user));
    const concurrent = await Promise.all([requestExport(deps, actorOf(user)), requestExport(deps, actorOf(user))]);
    expect(concurrent.map((row) => row.id)).toEqual([first.id, first.id]);
    const failure = vi.spyOn(documentsModule, "putBlob").mockRejectedValue(new Error("disk unavailable"));
    try {
      await expect(buildExport(deps, SYSTEM, first.id, { lastAttempt: false })).rejects.toThrow("disk unavailable");
      expect((await latestExport(deps, actorOf(user)))?.status).toBe("queued");
      await expect(buildExport(deps, SYSTEM, first.id, { lastAttempt: true })).rejects.toThrow("disk unavailable");
      const last = await latestExport(deps, actorOf(user));
      expect(last?.status).toBe("failed");
      expect(last?.expiresAt).toBe("2026-10-07T15:00:00.000Z");
    } finally { failure.mockRestore(); }
  });
});

```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./export" from "src/account/export.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/account/export.ts`:

```ts
import {
  actionReceipts,
  activities,
  aidChecklistItems,
  and,
  apiTokens,
  applicationItems,
  collegeList,
  conversations,
  costEstimates,
  crewJobs,
  decisions,
  desc,
  documents,
  eq,
  essayComments,
  essayVersions,
  essays,
  exportsTable,
  familyMembers,
  familyTasks,
  gt,
  helperLinks,
  inArray,
  isNull,
  memoryFacts,
  messages,
  notificationPrefs,
  notifications,
  offerLines,
  offers,
  or,
  planItems,
  profiles,
  recRequests,
  recommenders,
  scholarshipApplications,
  serviceLogs,
  shareSettings,
  sponsorRedemptions,
  stories,
  storyUses,
  sql,
  subscriptions,
  sweepRuns,
  testScores,
  usageCounters,
  users} from "@scholarcrew/db";
import { type Actor, type ExportRecord, type FactValue, SHARE_CATEGORIES, notFound, userActor } from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { getBlob, putBlob } from "../documents";
import { listSensitiveFacts } from "../memory";
import { valueText } from "../memory/facts";
import { notify } from "../notifications";
import { type CoreDeps, addDays, isUuid, one, requireUuid, toIso, toIsoOrNull, todayIn } from "../shared";

type ExportRow = typeof exportsTable.$inferSelect;
type Row = Record<string, unknown>;

/** Columns that never leave the database: token hashes, ciphertext, and internal blob pointers. */
const SECRET_FIELDS = new Set([
  "tokenHash",
  "ciphertext",
  "iv",
  "tag",
  "phoneCiphertext",
  "phoneIv",
  "phoneTag",
  "verificationTokenHash",
  "blobId",
]);

function clean(row: object): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (/hash$/i.test(key) || SECRET_FIELDS.has(key) || Buffer.isBuffer(value)) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

const cleanAll = (rows: object[]): Row[] => rows.map(clean);

function toRecord(row: ExportRow): ExportRecord {
  return {
    id: row.id,
    status: row.status,
    createdAt: toIso(row.createdAt),
    expiresAt: toIsoOrNull(row.expiresAt),
    downloadUrl: row.status === "ready" ? `/api/v1/account/exports/${row.id}` : null,
  };
}

export async function requestExport(deps: CoreDeps, actor: Actor): Promise<ExportRecord> {
  assertUser(actor);
  const { row, created } = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'export:' + actor.userId}))`);
    const [queued] = await tx.select().from(exportsTable).where(and(eq(exportsTable.userId, actor.userId), eq(exportsTable.status, "queued"))).limit(1);
    if (queued) return { row: queued, created: false };
    return { row: one(await tx.insert(exportsTable).values({ userId: actor.userId, createdAt: deps.clock.now() }).returning(), "exports insert"), created: true };
  });
  // Re-enqueue a reused request too: a previous enqueue may have failed after its row committed.
  await deps.jobs.enqueue("account.export", { exportId: row.id });
  if (created) await recordAudit(deps, { actor, action: "export_requested", entityType: "export", entityId: row.id });
  return toRecord(row);
}

type UserRow = typeof users.$inferSelect;

async function collect(deps: CoreDeps, user: UserRow) {
  const db = deps.db;
  const id = user.id;
  const factRows = await db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, id));
  const storyRows = await db.select().from(stories).where(eq(stories.ownerId, id));
  const essayRows = await db.select().from(essays).where(eq(essays.ownerId, id));
  const activityRows = await db.select().from(activities).where(eq(activities.ownerId, id));
  const conversationRows = await db.select().from(conversations).where(eq(conversations.ownerId, id));
  const offerRows = await db.select().from(offers).where(eq(offers.ownerId, id));
  const documentRows = await db.select().from(documents).where(eq(documents.ownerId, id));
  const essayIds = essayRows.map((r) => r.id);
  const storyIds = storyRows.map((r) => r.id);
  const conversationIds = conversationRows.map((r) => r.id);
  const offerIds = offerRows.map((r) => r.id);
  const versionRows =
    essayIds.length > 0 ? await db.select().from(essayVersions).where(inArray(essayVersions.essayId, essayIds)) : [];
  // R3E-11: the student's sharing choices, and family tasks about them or assigned to them.
  const shareRows = await db.select().from(shareSettings).where(eq(shareSettings.studentId, id));
  const taskRows = await db
    .select({ task: familyTasks, itemStatus: aidChecklistItems.status })
    .from(familyTasks)
    .leftJoin(aidChecklistItems, eq(aidChecklistItems.id, familyTasks.aidItemId))
    .where(or(eq(familyTasks.studentId, id), eq(familyTasks.assigneeId, id)));
  const data: Record<string, unknown> = {
    user: clean(user),
    profile: cleanAll(await db.select().from(profiles).where(eq(profiles.userId, id))),
    memoryFacts: cleanAll(factRows),
    sensitiveFacts: await listSensitiveFacts(deps, userActor(id, user.role)),
    decisions: cleanAll(await db.select().from(decisions).where(eq(decisions.ownerId, id))),
    stories: cleanAll(storyRows),
    storyUses: cleanAll(
      storyIds.length > 0 ? await db.select().from(storyUses).where(inArray(storyUses.storyId, storyIds)) : [],
    ),
    collegeList: cleanAll(await db.select().from(collegeList).where(eq(collegeList.ownerId, id))),
    applicationItems: cleanAll(await db.select().from(applicationItems).where(eq(applicationItems.ownerId, id))),
    recommenders: cleanAll(await db.select().from(recommenders).where(eq(recommenders.ownerId, id))),
    recRequests: cleanAll(await db.select().from(recRequests).where(eq(recRequests.ownerId, id))),
    scholarshipApplications: cleanAll(
      await db.select().from(scholarshipApplications).where(eq(scholarshipApplications.ownerId, id)),
    ),
    essays: cleanAll(essayRows),
    essayVersions: cleanAll(versionRows),
    essayComments: cleanAll(
      essayIds.length > 0 ? await db.select().from(essayComments).where(inArray(essayComments.essayId, essayIds)) : [],
    ),
    testScores: cleanAll(await db.select().from(testScores).where(eq(testScores.ownerId, id))),
    activities: cleanAll(activityRows),
    serviceLogs: cleanAll(await db.select().from(serviceLogs).where(eq(serviceLogs.ownerId, id))),
    costEstimates: cleanAll(await db.select().from(costEstimates).where(eq(costEstimates.ownerId, id))),
    documents: cleanAll(documentRows),
    offers: cleanAll(offerRows),
    offerLines: cleanAll(
      offerIds.length > 0 ? await db.select().from(offerLines).where(inArray(offerLines.offerId, offerIds)) : [],
    ),
    aidChecklistItems: cleanAll(await db.select().from(aidChecklistItems).where(eq(aidChecklistItems.ownerId, id))),
    sweepRuns: cleanAll(await db.select().from(sweepRuns).where(eq(sweepRuns.ownerId, id))),
    planItems: cleanAll(await db.select().from(planItems).where(eq(planItems.ownerId, id))),
    conversations: cleanAll(conversationRows),
    messages: cleanAll(
      conversationIds.length > 0
        ? await db.select().from(messages).where(inArray(messages.conversationId, conversationIds))
        : [],
    ),
    crewJobs: cleanAll(await db.select().from(crewJobs).where(eq(crewJobs.ownerId, id))),
    actionReceipts: cleanAll(await db.select().from(actionReceipts).where(eq(actionReceipts.ownerId, id))),
    notifications: cleanAll(await db.select().from(notifications).where(eq(notifications.userId, id))),
    notificationPrefs: cleanAll(await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, id))),
    subscriptions: cleanAll(await db.select().from(subscriptions).where(eq(subscriptions.ownerId, id))),
    usageCounters: cleanAll(await db.select().from(usageCounters).where(eq(usageCounters.userId, id))),
    helperLinks: cleanAll(await db.select().from(helperLinks).where(eq(helperLinks.studentId, id))),
    apiTokens: cleanAll(await db.select().from(apiTokens).where(eq(apiTokens.userId, id))),
    familyMembers: cleanAll(await db.select().from(familyMembers).where(eq(familyMembers.userId, id))),
    shareSettings: cleanAll(shareRows),
    familyTasks: cleanAll(taskRows.map((r) => r.task)),
    sponsorRedemptions: cleanAll(await db.select().from(sponsorRedemptions).where(eq(sponsorRedemptions.userId, id))),
  };
  return { data, factRows, storyRows, essayRows, versionRows, activityRows, documentRows, shareRows, taskRows };
}

function renderMarkdown(user: UserRow, generatedAt: string, c: Awaited<ReturnType<typeof collect>>): string {
  const lines: string[] = [`# ScholarCrew export for ${user.displayName || user.email}`, "", `Generated ${generatedAt}`];
  const facts = c.factRows.filter((f) => f.status === "confirmed" && f.supersededById === null);
  lines.push("", "## Profile facts", "");
  if (facts.length === 0) lines.push("None yet.");
  for (const f of facts) {
    // The export keeps ISO dates (it's a record and needs the year), on the student's calendar (R3E-8).
    lines.push(`- ${f.key}: ${valueText(f.value as FactValue)} (${f.source}, ${todayIn(f.createdAt, user.timeZone)})`);
  }
  lines.push("", "## Stories", "");
  if (c.storyRows.length === 0) lines.push("None yet.");
  for (const s of c.storyRows) {
    lines.push(`### ${s.title}`, "", s.moment);
    if (s.themes.length > 0) lines.push("", `Themes: ${s.themes.join(", ")}`);
    if (s.evidence) lines.push("", `Evidence: ${s.evidence}`);
    lines.push("");
  }
  lines.push("", "## Essays", "");
  if (c.essayRows.length === 0) lines.push("None yet.");
  for (const e of c.essayRows) {
    const latest = c.versionRows.filter((v) => v.essayId === e.id).sort((a, b) => b.version - a.version)[0];
    lines.push(`### ${e.title}`, "", `Prompt: ${e.prompt}`, "");
    if (latest) lines.push(`Version ${latest.version}, ${latest.wordCount} words:`, "", latest.body, "");
    else lines.push("No draft saved yet.", "");
  }
  lines.push("", "## Activities", "");
  if (c.activityRows.length === 0) lines.push("None yet.");
  for (const a of [...c.activityRows].sort((x, y) => x.position - y.position)) {
    const where = [a.role, a.organization].filter((s) => s.length > 0).join(", ");
    const detail = a.description ? `: ${a.description}` : "";
    lines.push(`${a.position}. ${a.name}${where ? ` (${where})` : ""}${detail} [${a.hoursPerWeek} h/week, ${a.weeksPerYear} weeks/year]`);
  }
  lines.push("", "## Sharing with family", "");
  if (c.shareRows.length === 0) lines.push("None yet.");
  const shareOrder = (r: (typeof c.shareRows)[number]) => SHARE_CATEGORIES.indexOf(r.category);
  for (const r of [...c.shareRows].sort((x, y) => shareOrder(x) - shareOrder(y))) {
    lines.push(`- ${r.category}: ${r.enabled ? "on" : "off"}`);
  }
  lines.push("", "## Family tasks", "");
  if (c.taskRows.length === 0) lines.push("None yet.");
  for (const r of [...c.taskRows].sort((x, y) => x.task.createdAt.getTime() - y.task.createdAt.getTime())) {
    // An aid-linked task's status lives on its aid checklist item (R2I-6).
    lines.push(`- ${r.task.title} (${r.itemStatus ?? r.task.status})`);
  }
  // R2I-18: file bytes stay out of the export (one blob, up to 10 MB per file); the list says where they are.
  lines.push("", "## Files you uploaded", "");
  if (c.documentRows.length === 0) lines.push("None yet.");
  for (const d of [...c.documentRows].sort((x, y) => x.uploadedAt.getTime() - y.uploadedAt.getTime())) {
    lines.push(`- ${d.filename} (${d.kind}, ${d.sizeBytes} bytes)`);
  }
  if (c.documentRows.length > 0) lines.push("", "Download these from Settings → Documents.");
  return `${lines.join("\n").trimEnd()}\n`;
}

/** System only (account.export job). One encrypted blob, ready for 24 hours. Notifies the owner once (R2I-18). */
export async function buildExport(deps: CoreDeps, system: Actor, exportId: string, o: { lastAttempt: boolean }): Promise<void> {
  assertSystem(system);
  if (!isUuid(exportId)) return;
  let ready: ExportRow | null = null;
  try {
    ready = await deps.db.transaction(async (tx) => {
      const [row] = await tx.select().from(exportsTable).where(eq(exportsTable.id, exportId)).for("update");
      if (!row || row.status === "failed") return null;
      if (row.status === "ready") return row.expiresAt && row.expiresAt > deps.clock.now() ? row : null;
      const [user] = await tx.select().from(users).where(eq(users.id, row.userId));
      if (!user || user.status !== "active") {
        await tx.update(exportsTable).set({ status: "failed" }).where(eq(exportsTable.id, exportId));
        return null;
      }
      const local = { ...deps, db: tx as CoreDeps["db"] };
      const now = deps.clock.now();
      const generatedAt = toIso(now);
      const collected = await collect(local, user);
      const file = { generatedAt, data: collected.data, markdown: renderMarkdown(user, generatedAt, collected) };
      const blobId = await putBlob(local, Buffer.from(JSON.stringify(file), "utf8"));
      const completed = one(await tx.update(exportsTable).set({ status: "ready", blobId, expiresAt: addDays(now, 1) }).where(eq(exportsTable.id, exportId)).returning(), "export ready");
      await recordAudit(local, { actor: system, action: "export_ready", entityType: "export", entityId: exportId });
      return completed;
    });
  } catch (error) {
    if (o.lastAttempt) {
      const [failed] = await deps.db.update(exportsTable).set({ status: "failed", expiresAt: addDays(deps.clock.now(), 1) }).where(and(eq(exportsTable.id, exportId), eq(exportsTable.status, "queued"))).returning();
      if (failed) await notify(deps, system, { userId: failed.userId, kind: "system", title: "Your export didn't finish", body: "Your export didn't finish. Request a new one from Settings.", link: "/settings#data", dedupeKey: `export-failed:${exportId}` });
    }
    throw error;
  }
  // A ready retry replays this idempotent notification; notification failure never downgrades the export.
  if (ready) await notify(deps, system, { userId: ready.userId, kind: "system", title: "Your export is ready", body: "It's ready to download for 24 hours.", link: "/settings#data", dedupeKey: `export:${exportId}`, email: true });
}

export async function getExport(
  deps: CoreDeps,
  actor: Actor,
  id: string,
): Promise<{ record: ExportRecord; bytes: Buffer | null }> {
  assertUser(actor);
  requireUuid(id, "Export not found");
  const [row] = await deps.db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, id), eq(exportsTable.userId, actor.userId)));
  if (!row) throw notFound("Export not found");
  if (row.expiresAt && row.expiresAt <= deps.clock.now()) throw notFound("This export has expired");
  const bytes = row.status === "ready" && row.blobId ? await getBlob(deps, row.blobId) : null;
  return { record: toRecord(row), bytes };
}

/** The actor's newest export that hasn't expired (any status), or null. Settings shows it. */
export async function latestExport(deps: CoreDeps, actor: Actor): Promise<ExportRecord | null> {
  assertUser(actor);
  const [row] = await deps.db
    .select()
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.userId, actor.userId),
        or(isNull(exportsTable.expiresAt), gt(exportsTable.expiresAt, deps.clock.now())),
      ),
    )
    .orderBy(desc(exportsTable.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 19 files, 208 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/account/export.ts packages/core/src/account/export.test.ts
git commit -m "feat(core): encrypted JSON and Markdown account export"
```

### F19: Account deletion, purges, and the account index

- [ ] **Step 1: Write the failing test**

`packages/core/src/account/delete.test.ts`:

```ts
import {
  and,
  auditEvents,
  blobs,
  conversations,
  crewJobs,
  documents,
  eq,
  exportsTable,
  families,
  familyInvites,
  familyTasks,
  magicLinks,
  memoryFacts,
  messages,
  rateLimits,
  sessions,
  subscriptions,
  users} from "@scholarcrew/db";
import { factories } from "@scholarcrew/db/testing";
import { describe, expect, it } from "vitest";
import { SYSTEM, actorOf, latestEmail, tokenIn } from "../../test/helpers";
import { createApiToken, resolveApiToken } from "../apitokens";
import { getSessionUser, requestMagicLink, verifyMagicLink } from "../auth";
import { sha256Hex } from "../crypto";
import { putBlob, readDocumentBytes, uploadDocument } from "../documents";
import { getFamily } from "../family";
import { createHelperLink, resolveHelperToken } from "../helpers";
import { createFact } from "../memory";
import { completeOnboarding, getMe } from "../profile";
import { type FakeStripeGateway, addDays, addMinutes, createTestDeps, fixedClock, one } from "../shared";
import { deleteAccount, purgeDeletedAccounts, purgeExpired } from "./index";

const pdf = { kind: "transcript" as const, filename: "t.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.7 x") };

describe("deleteAccount", () => {
  it("ends access at once, and the family goes with its only student", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [user.id], parentIds: [parent.id] });
    await deps.db.insert(sessions).values({ userId: user.id, tokenHash: sha256Hex("tok"), expiresAt: addDays(deps.clock.now(), 30) });
    const api = await createApiToken(deps, actorOf(user), { label: "Laptop", scopes: ["autofill"] });
    const link = await createHelperLink(deps, actorOf(user), {
      label: "Ms. Ortiz",
      helperRole: "recommender",
      scope: ["activities"],
      expiresInDays: 30,
    });
    await factories.conversation(deps.db, user.id, { room: "family", familyId: family.id });
    await deleteAccount(deps, actorOf(user));
    expect(await getSessionUser(deps, "tok")).toBeNull();
    expect(await resolveApiToken(deps, api.secret)).toBeNull();
    expect(await resolveHelperToken(deps, link.url.slice(link.url.lastIndexOf("/") + 1))).toBeNull();
    await expect(getMe(deps, actorOf(user))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(await getFamily(deps, actorOf(parent))).toBeNull();
    expect(await deps.db.select().from(families).where(eq(families.id, family.id))).toHaveLength(0);
    expect(await deps.db.select().from(conversations).where(eq(conversations.ownerId, user.id))).toHaveLength(0);
    const [row] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ status: "deleted", deletedAt: new Date("2026-10-06T15:00:00.000Z") });
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual([]);
  });

  it("removes a parent's family-room messages, the crew replies, jobs, tasks, and open invites (R2I-4)", async () => {
    const deps = createTestDeps();
    const { user: student } = await factories.student(deps.db);
    const parent = await factories.parent(deps.db);
    const family = await factories.family(deps.db, { studentIds: [student.id], parentIds: [parent.id] });
    const room = await factories.conversation(deps.db, student.id, { room: "family", familyId: family.id });
    const say = async (authorUserId: string | null, body: string) =>
      one(
        await deps.db
          .insert(messages)
          .values({ conversationId: room.id, authorKind: authorUserId ? "user" : "crew", authorUserId, body })
          .returning(),
        "messages insert",
      );
    const studentAsk = await say(student.id, "What's due this week?");
    const parentAsk = await say(parent.id, "How are things going?");
    const crewReply = await say(null, "Two essays and the FAFSA.");
    await deps.db.insert(crewJobs).values([
      { ownerId: student.id, usageMonth: "2026-10", kind: "crew_request", status: "ready", conversationId: room.id, requestMessageId: parentAsk.id, resultMessageId: crewReply.id },
      { ownerId: student.id, usageMonth: "2026-10", kind: "crew_request", status: "queued", conversationId: room.id, requestMessageId: studentAsk.id },
    ]);
    await deps.db.insert(familyTasks).values([
      { familyId: family.id, assigneeId: parent.id, studentId: student.id, kind: "share_budget", title: "Share a yearly budget for college" },
      { familyId: family.id, assigneeId: student.id, studentId: student.id, kind: "custom", title: "Ask about the FAFSA" },
    ]);
    await deps.db.insert(familyInvites).values({
      familyId: family.id,
      email: "grandma@example.test",
      memberRole: "parent",
      invitedById: parent.id,
      tokenHash: sha256Hex("open-invite"),
      expiresAt: addDays(deps.clock.now(), 7),
    });
    await deleteAccount(deps, actorOf(parent));
    const left = await deps.db.select().from(messages).where(eq(messages.conversationId, room.id));
    expect(left.map((m) => m.id)).toEqual([studentAsk.id]);
    expect((await deps.db.select().from(crewJobs)).map((j) => j.requestMessageId)).toEqual([studentAsk.id]);
    expect((await deps.db.select().from(familyTasks)).map((t) => t.title)).toEqual(["Ask about the FAFSA"]);
    expect(await deps.db.select().from(familyInvites)).toEqual([]);
    expect((await getFamily(deps, actorOf(student)))?.members.map((m) => m.userId)).toEqual([student.id]);
  });

  it("cancels an active Stripe subscription and records it in the audit log", async () => {
    const deps = createTestDeps();
    const parent = await factories.parent(deps.db);
    await deps.db.insert(subscriptions).values({
      ownerId: parent.id,
      plan: "family",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    const gateway = deps.stripe;
    deps.stripe = null;
    await expect(deleteAccount(deps, actorOf(parent))).rejects.toThrow("Stripe gateway required");
    expect((await deps.db.select().from(users).where(eq(users.id, parent.id)))[0]?.status).toBe("active");
    expect((await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id)))[0]?.status).toBe("active");
    deps.stripe = gateway;
    await deleteAccount(deps, actorOf(parent));
    expect((deps.stripe as FakeStripeGateway).canceled).toEqual(["sub_1"]);
    const [sub] = await deps.db.select().from(subscriptions).where(eq(subscriptions.ownerId, parent.id));
    expect(sub?.status).toBe("canceled");
    const audit = await deps.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "subscription_canceled"), eq(auditEvents.entityId, sub?.id ?? "")));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toEqual({ stripeSubscriptionId: "sub_1" });
  });

  it("can't be signed into again", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db, { email: "maya@example.test" });
    await deleteAccount(deps, actorOf(user));
    await requestMagicLink(deps, { email: "maya@example.test", ip: "203.0.113.9" });
    const token = tokenIn((await latestEmail(deps.db, "maya@example.test")).text);
    await expect(verifyMagicLink(deps, { token, userAgent: "" })).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("purges", () => {
  it("hard-deletes accounts 6 days after deletion, so the daily run finishes within 7, with their rows and blobs", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const { user: gone } = await factories.student(deps.db);
    const { user: kept } = await factories.student(deps.db);
    await createFact(deps, actorOf(gone), { key: "county", value: "Maple", visibility: "crew", source: "user_stated", sourceRef: null });
    await uploadDocument(deps, actorOf(gone), pdf);
    const keptDoc = await uploadDocument(deps, actorOf(kept), pdf);
    await deleteAccount(deps, actorOf(gone));
    clock.set("2026-10-11T15:00:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(0);
    clock.set("2026-10-12T15:01:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(1);
    expect(await deps.db.select().from(users).where(eq(users.id, gone.id))).toHaveLength(0);
    expect(await deps.db.select().from(memoryFacts).where(eq(memoryFacts.ownerId, gone.id))).toHaveLength(0);
    expect((await deps.db.select().from(documents)).map((d) => d.ownerId)).toEqual([kept.id]);
    expect(await deps.db.select().from(blobs)).toHaveLength(1);
    expect((await readDocumentBytes(deps, actorOf(kept), keptDoc.id)).bytes.toString()).toBe("%PDF-1.7 x");
  });

  it("purges a blocked under-13 account on the same schedule and keeps nothing (R2I-17)", async () => {
    const clock = fixedClock("2026-10-06T15:00:00.000Z");
    const deps = createTestDeps({ clock });
    const kid = await factories.user(deps.db, { email: "kid@example.test" });
    await requestMagicLink(deps, { email: "kid@example.test", ip: "203.0.113.9" });
    await expect(
      completeOnboarding(deps, actorOf(kid), {
        displayName: "Kid",
        birthYear: 2015,
        classYear: 2033,
        highSchool: "Maple Middle School",
        state: "TX",
        county: "Maple",
        city: "Cedar Falls",
        gpaUnweighted: null,
        intendedMajors: [],
        interests: [],
        timeZone: "America/Chicago",
        collegeIds: [],
        sensitive: [],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    clock.set("2026-10-11T15:00:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(0);
    clock.set("2026-10-12T15:01:00.000Z");
    expect(await purgeDeletedAccounts(deps, SYSTEM)).toBe(1);
    expect(await deps.db.select().from(users).where(eq(users.email, "kid@example.test"))).toHaveLength(0);
    expect(await deps.db.select().from(rateLimits).where(eq(rateLimits.key, "ml:email:kid@example.test"))).toEqual([]);
    expect(await deps.db.select().from(magicLinks).where(eq(magicLinks.email, "kid@example.test"))).toEqual([]);
  });

  it("removes old magic links, expired temporary chats, expired exports, and expired sessions", async () => {
    const deps = createTestDeps();
    const now = deps.clock.now();
    const { user } = await factories.student(deps.db);
    await deps.db.insert(magicLinks).values([
      { email: "a@example.test", tokenHash: "h1", createdAt: addDays(now, -2), expiresAt: addDays(now, -2) },
      { email: "b@example.test", tokenHash: "h2", createdAt: now, expiresAt: addMinutes(now, 15) },
    ]);
    await factories.conversation(deps.db, user.id, { room: "temporary", expiresAt: addMinutes(now, -60) });
    await factories.conversation(deps.db, user.id, { room: "temporary", expiresAt: addMinutes(now, 60) });
    await factories.conversation(deps.db, user.id, { room: "my_crew" });
    const oldBlob = await putBlob(deps, Buffer.from("old export"));
    const newBlob = await putBlob(deps, Buffer.from("new export"));
    await deps.db.insert(exportsTable).values([
      { userId: user.id, status: "ready", blobId: oldBlob, expiresAt: addMinutes(now, -60) },
      { userId: user.id, status: "ready", blobId: newBlob, expiresAt: addMinutes(now, 60) },
    ]);
    await deps.db.insert(sessions).values([
      { userId: user.id, tokenHash: "s1", expiresAt: addMinutes(now, -1) },
      { userId: user.id, tokenHash: "s2", expiresAt: addDays(now, 30) },
    ]);
    expect(await purgeExpired(deps, SYSTEM)).toEqual({ magicLinks: 1, temporaryChats: 1, exports: 1, sessions: 1 });
    expect((await deps.db.select().from(blobs)).map((b) => b.id)).toEqual([newBlob]);
    expect(await deps.db.select().from(conversations)).toHaveLength(2);
  });

  it("is system-only", async () => {
    const deps = createTestDeps();
    const { user } = await factories.student(deps.db);
    await expect(purgeDeletedAccounts(deps, actorOf(user))).rejects.toMatchObject({ code: "forbidden" });
    await expect(purgeExpired(deps, actorOf(user))).rejects.toMatchObject({ code: "forbidden" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @scholarcrew/core test`
Expected: FAIL with `Failed to resolve import "./index" from "src/account/delete.test.ts". Does the file exist?`

- [ ] **Step 3: Write the implementation**

`packages/core/src/account/delete.ts`:

```ts
import { randomUUID } from "node:crypto";
import {
  and,
  auditEvents,
  agentRuns,
  sensitiveFacts,
  catalogTasks,
  scholarships,
  stripeEvents,
  apiTokens,
  blobs,
  conversations,
  count,
  crewJobs,
  documents,
  eq,
  exportsTable,
  families,
  familyBudgets,
  familyInvites,
  familyMembers,
  familyTasks,
  helperLinks,
  inArray,
  isNotNull,
  isNull,
  lt,
  magicLinks,
  messages,
  or,
  rateLimits,
  sessions,
  shareSettings,
  sql,
  subscriptions,
  users} from "@scholarcrew/db";
import type { Actor } from "@scholarcrew/domain";
import { assertSystem, assertUser } from "../access";
import { recordAudit } from "../audit";
import { ownSubscription } from "../billing/plans";
import { type CoreDeps, addDays, addMinutes } from "../shared";

/** The purge runs daily (05 `account.purge`, 03:30 UTC), so 6 days here means gone within 7 (ID-05, R2I-17). */
const PURGE_AFTER_DAYS = 6;
const MAGIC_LINK_RETENTION_DAYS = 1;
/** Blobs younger than this may belong to an upload or export that hasn't committed its row yet. */
const ORPHAN_GRACE_MINUTES = 60;

/**
 * ID-05: cancels every non-canceled Stripe subscription first (so billing stops), then blocks the account at once
 * (status, sessions, API tokens, helper links) and removes it from its family: family-room conversations
 * it owns, its messages in other members' family rooms with the crew replies and jobs they started, its
 * family tasks, and the invites it sent that are still open (R2I-4). A family with no student left is
 * deleted. Rows are hard-deleted by purgeDeletedAccounts.
 */
export async function deleteAccount(deps: CoreDeps, actor: Actor): Promise<void> {
  assertUser(actor);
  const now = deps.clock.now();
  const userId = actor.userId;
  const own = await ownSubscription(deps.db, userId);
  const stripeSubscriptionId = own?.stripeSubscriptionId && own.status !== "canceled" ? own.stripeSubscriptionId : null;
  if (stripeSubscriptionId && !deps.stripe) throw new Error("Stripe gateway required to cancel subscription");
  if (stripeSubscriptionId && deps.stripe) await deps.stripe.cancelSubscription(stripeSubscriptionId);
  await deps.db.transaction(async (tx) => {
    await tx.update(users).set({ status: "deleted", deletedAt: now }).where(eq(users.id, userId));
    await tx.update(crewJobs).set({ status: "failed", error: "Account deleted", leaseToken: null, leaseExpiresAt: null, updatedAt: now }).where(and(eq(crewJobs.ownerId, userId), inArray(crewJobs.status, ["queued", "working"])));
    if (own && stripeSubscriptionId) {
      await tx.update(subscriptions).set({ status: "canceled", updatedAt: now }).where(eq(subscriptions.id, own.id));
    }
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
    await tx
      .update(helperLinks)
      .set({ revokedAt: now })
      .where(and(eq(helperLinks.studentId, userId), isNull(helperLinks.revokedAt)));
    const memberships = await tx
      .select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId));
    const familyIds = memberships.map((m) => m.familyId);
    if (familyIds.length > 0) {
      const authored = await tx
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(eq(messages.authorUserId, userId), inArray(conversations.familyId, familyIds)));
      const messageIds = authored.map((m) => m.id);
      if (messageIds.length > 0) {
        const jobs = await tx
          .select({ id: crewJobs.id, resultMessageId: crewJobs.resultMessageId })
          .from(crewJobs)
          .where(inArray(crewJobs.requestMessageId, messageIds));
        const replyIds = jobs.map((j) => j.resultMessageId).filter((id): id is string => id !== null);
        if (replyIds.length > 0) await tx.delete(messages).where(inArray(messages.id, replyIds));
        if (jobs.length > 0) await tx.delete(crewJobs).where(inArray(crewJobs.id, jobs.map((j) => j.id)));
        await tx.delete(messages).where(inArray(messages.id, messageIds));
      }
    }
    await tx.delete(familyTasks).where(or(eq(familyTasks.assigneeId, userId), eq(familyTasks.studentId, userId)));
    await tx.delete(familyInvites).where(and(eq(familyInvites.invitedById, userId), isNull(familyInvites.acceptedAt)));
    await tx.delete(conversations).where(and(eq(conversations.ownerId, userId), isNotNull(conversations.familyId)));
    await tx.delete(shareSettings).where(eq(shareSettings.studentId, userId));
    await tx.delete(familyBudgets).where(eq(familyBudgets.sharedById, userId));
    await tx.delete(familyMembers).where(eq(familyMembers.userId, userId));
    for (const familyId of familyIds) {
      const [students] = await tx
        .select({ n: count() })
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.memberRole, "student")));
      if ((students?.n ?? 0) === 0) await tx.delete(families).where(eq(families.id, familyId));
    }
  });
  if (own && stripeSubscriptionId) {
    await recordAudit(deps, {
      actor,
      action: "subscription_canceled",
      entityType: "subscription",
      entityId: own.id,
      meta: { stripeSubscriptionId },
    });
  }
  await recordAudit(deps, { actor, action: "account_deleted", entityType: "user", entityId: userId });
}

async function deleteOrphanBlobs(deps: CoreDeps, now: Date): Promise<number> {
  const cutoff = addMinutes(now, -ORPHAN_GRACE_MINUTES).toISOString();
  const removed = await deps.db
    .delete(blobs)
    .where(
      sql`${blobs.createdAt} < ${cutoff}::timestamptz
        and not exists (select 1 from ${documents} where ${documents.blobId} = ${blobs.id})
        and not exists (select 1 from ${exportsTable} where ${exportsTable.blobId} = ${blobs.id})`,
    )
    .returning({ id: blobs.id });
  return removed.length;
}

/**
 * System only (account.purge job). Deleted accounts and blocked under-13 accounts (the age gate sets
 * deletedAt) go 6 days after deletedAt; owned rows cascade from users. Nothing is kept (R2I-17): rows
 * keyed by the email (magic links, open invites, the sign-in rate-limit counter) go too, and
 * unreferenced blobs after.
 */
export async function purgeDeletedAccounts(deps: CoreDeps, system: Actor): Promise<number> {
  assertSystem(system);
  const now = deps.clock.now();
  const candidates = await deps.db.select().from(users).where(and(inArray(users.status, ["deleted", "blocked_underage"]), lt(users.deletedAt, addDays(now, -PURGE_AFTER_DAYS))));
  let purged = 0;
  for (const user of candidates) {
    const own = await ownSubscription(deps.db, user.id);
    if (own?.stripeSubscriptionId && own.status !== "canceled") {
      try {
        if (!deps.stripe) throw new Error("Billing gateway missing");
        await deps.stripe.cancelSubscription(own.stripeSubscriptionId);
      } catch { console.error("purge.stripe_cancel_failed", { userId: user.id }); continue; }
    }
    await deps.db.transaction(async (tx) => {
      const id = user.id;
      await tx.delete(auditEvents).where(and(or(eq(auditEvents.entityId, id), sql`${auditEvents.entityId} like ${id + ":%"}`), inArray(auditEvents.action, ["sensitive_facts_changed", "sensitive_fact_updated", "income_range_shared"])));
      const anonymousId = randomUUID();
      await tx.update(auditEvents).set({ actorId: anonymousId }).where(eq(auditEvents.actorId, id));
      await tx.update(auditEvents).set({ entityId: "anonymous", meta: {} }).where(or(eq(auditEvents.entityId, id), sql`${auditEvents.entityId} like ${id + ":%"}`));
      await tx.update(agentRuns).set({ userId: anonymousId }).where(eq(agentRuns.userId, id));
      await tx.update(messages).set({ authorUserId: null }).where(eq(messages.authorUserId, id));
      await tx.update(sensitiveFacts).set({ sharedByUserId: null }).where(eq(sensitiveFacts.sharedByUserId, id));
      await tx.update(catalogTasks).set({ createdById: null }).where(eq(catalogTasks.createdById, id));
      await tx.update(catalogTasks).set({ resolvedById: null }).where(eq(catalogTasks.resolvedById, id));
      await tx.delete(scholarships).where(and(eq(scholarships.submittedById, id), eq(scholarships.visibility, "submitter_only")));
      await tx.delete(catalogTasks).where(and(eq(catalogTasks.kind, "user_submission"), inArray(catalogTasks.status, ["open", "in_review"]), sql`${catalogTasks.payload}->>'submittedById' = ${id}`));
      await tx.execute(sql`update ${catalogTasks} set payload = payload || '{"submittedById":null,"notes":""}'::jsonb where payload->>'submittedById' = ${id}`);
      await tx.delete(magicLinks).where(eq(magicLinks.email, user.email));
      await tx.delete(familyInvites).where(eq(familyInvites.email, user.email));
      await tx.delete(rateLimits).where(eq(rateLimits.key, `ml:email:${user.email}`));
      await tx.delete(users).where(eq(users.id, id));
    });
    purged += 1;
  }
  await deps.db.delete(stripeEvents).where(lt(stripeEvents.receivedAt, addDays(now, -30)));
  await deleteOrphanBlobs(deps, now);
  return purged;
}

/** System only (maintenance.purge job). SE-07 retention. */
export async function purgeExpired(
  deps: CoreDeps,
  system: Actor,
): Promise<{ magicLinks: number; temporaryChats: number; exports: number; sessions: number }> {
  assertSystem(system);
  const now = deps.clock.now();
  const links = await deps.db
    .delete(magicLinks)
    .where(lt(magicLinks.createdAt, addDays(now, -MAGIC_LINK_RETENTION_DAYS)))
    .returning({ id: magicLinks.id });
  const chats = await deps.db
    .delete(conversations)
    .where(
      and(eq(conversations.room, "temporary"), isNotNull(conversations.expiresAt), lt(conversations.expiresAt, now)),
    )
    .returning({ id: conversations.id });
  const expired = await deps.db
    .delete(exportsTable)
    .where(or(and(isNotNull(exportsTable.expiresAt), lt(exportsTable.expiresAt, now)), and(inArray(exportsTable.status, ["queued", "failed"]), lt(exportsTable.createdAt, addDays(now, -1)))))
    .returning({ id: exportsTable.id, blobId: exportsTable.blobId });
  const blobIds = expired.map((e) => e.blobId).filter((id): id is string => id !== null);
  if (blobIds.length > 0) await deps.db.delete(blobs).where(inArray(blobs.id, blobIds));
  const oldSessions = await deps.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  return {
    magicLinks: links.length,
    temporaryChats: chats.length,
    exports: expired.length,
    sessions: oldSessions.length,
  };
}
```

`packages/core/src/account/index.ts`:

```ts
export { buildExport, getExport, latestExport, requestExport } from "./export";
export { deleteAccount, purgeDeletedAccounts, purgeExpired } from "./delete";
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @scholarcrew/core test`
Expected: PASS, 20 files, 216 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/account
git commit -m "feat(core): account deletion, 6-day purge (within 7), retention purges"
```

### F20: Gate

- [ ] **Step 1: Format, then run the gate**

Run: `pnpm format && pnpm --filter @scholarcrew/core typecheck && pnpm --filter @scholarcrew/core test && pnpm lint`
Expected: Biome applies only formatting and import-order fixes under `packages/core`; `tsc --noEmit` prints nothing; PASS, 20 files, 216 tests; `pnpm lint` reports no errors.

- [ ] **Step 2: Commit any formatting changes**

```bash
git add packages/core
git commit -m "chore(core): format identity modules"
```

Skip the commit when `git status --short packages/core` prints nothing.

## Success Criteria

- [ ] `pnpm --filter @scholarcrew/core typecheck` exits 0.
- [ ] `pnpm --filter @scholarcrew/core test` exits 0: 20 files, 216 tests.
- [ ] `pnpm lint` reports no errors.
- [ ] `grep -rn "process.env" packages/core/src packages/core/test` prints nothing (config arrives through `CoreDeps`).
- [ ] `grep -rln "@anthropic-ai/sdk" packages/core` prints nothing.
- [ ] Every `packages/core/src/<module>/index.ts` of this plan exports the section 9.4 names (plus the extras listed at the top of this file).

## Testing Requirements

Command: `pnpm --filter @scholarcrew/core test` (needs `docker compose up -d db` and the test database from plan 03). Expected: 20 files, 216 tests passing (counts reflect the complete embedded test blocks after round 4). The tests prove:

- Shared (R3E-8, R3E-10, R3V-7, R3V-9): `currentAwardYear` is `awardYearFor(currentSeason(now))` (Aug 1 rollover); `todayIn`, `calendarShort` ("Oct 15"), and `instantInZone` ("Oct 20, 2026, 8:00 PM CDT") are the one core copy; both email senders send a subject with newlines flattened to one space.

- Isolation (SE-01): every read and write of facts, decisions, sensitive facts, documents, exports, helper links, API tokens, notifications, profiles, and family objects returns `not_found` for other users, parents outside the share grant, and admins; the system actor passes only the functions marked system.
- Invite preview (FA-01, D37): `previewInvite` shows the inviter's first name, role, and expiry for a live token and `not_found` for unknown, expired, or used ones.
- Family share categories (FA-02, ID-04): parents get exactly the enabled categories, defaults are deadlines/colleges/costs/scholarships/activities (also for a category with no row, R2I-11), a change shows on the next call, and removal or leaving ends access.
- Family membership (FA-01, FA-05, R2I-3/7/14/15): an unnamed parent inviter reads "Your family member"; a joining parent gets one `share_budget` task and a `share_income_range` task per student, which `setBudget` and `shareIncomeRangeToStudent` close; the inviter gets a `family-joined:<inviteId>` bell entry and the assignee a `family-task:<taskId>` one (no email); removal or leaving deletes the departing member's budget and tasks, and the family goes when no student is left.
- Family tasks (FA-05, AID-01, R2I-5/6): an aid-linked task is created once per item and assignee, reads and writes the aid item's status, and a CSS task shows the college name only to the student or a parent granted `colleges`; a nameless assignee lists as "Your family member" or "Your student" (R3V-14).
- Helper scope (HL-01, HL-04): only HelperScope categories, max 90 days, the actor reads only its scope for its student, revoked or expired links resolve to null.
- Auth (ID-01, ID-02): magic links store only hashes, expire after 15 minutes, work once; unknown emails create a student with profile, free subscription, and prefs, or a parent when a live parent invite exists for the email (R2I-2); blocked and deleted accounts can't sign in; sessions last 30 days, `lastSeenAt` refreshes at most every 5 minutes, sign out deletes the session.
- Age gate (ID-03): under 13 this calendar year blocks the account, sets `deletedAt`, deletes sessions, and enqueues nothing; exactly 13 passes. The year is the student's local year through `isUnderMinAge(birthYear, todayIn(now, timeZone))`, so Dec 31 at 9 pm Central still counts as that year (R3V-13), and the refusal carries `details: { reason: "underage" }` (R3A-17).
- Onboarding (ON-01, ON-03, ON-04, ON-06): eight `user_stated` facts, sensitive opt-ins, starter list rows (target, RD, current season) with unknown ids skipped, one `weekly_plan` job, and `plan.weekly` + `sweep.student` in that order.
- Memory (ME-01..ME-04): edits supersede, forgetting deletes the whole chain, candidates expire in 30 days and are never listed or confirmed after, a confirmed fact retires live candidates for its key and an identical candidate is filed once (R2C-2, R2C-15), writes on the eight profile keys keep `profiles` in step and reject values the column can't hold (R2I-1), decisions keep their source message (R2I-12), sensitive-looking keys are refused, `crewVisibleFacts` filters by audience and status.
- Sensitive facts (ME-05, SE-02): ciphertext never contains the plaintext, the matcher gets enabled values only, values never appear in `crewVisibleFacts`, parent income shares need a shared family.
- Rate limits (SE-04): 5 per window per key, separate keys, window reset, atomic under 10 concurrent calls; magic links limited per IP and per email. A refusal carries `details.retryAfterSeconds` (the seconds left in the window) and says the real wait through `waitText` ("Try again in 10 minutes."), R3A-11.
- Notifications (NO-01, NO-03, NO-04, NO-05): dedupe returns null, email enqueue respects prefs, quiet hours re-enqueue with the exact wait, the email is only title, body, and link, phone numbers are encrypted; `notify({ sms })` queues `notify.sms` only for opted-in users with a phone, `deliverSms` texts only the title and link once, waits out quiet hours, skips every opted-out case, and releases its claim when the sender fails (R2I-9); a long title is shortened so the link and "Reply STOP to opt out." always fit in 300 characters (R3E-7); `retractNotification` is system only (R2I-16).
- Billing (BI-01..BI-05, CR-10): free 20 / family 300 limits, parent coverage, `limit_reached` with details, the allowance counts queued and working jobs from the last hour except offer parsing; weekly plans reserve a slot until completion (R2C-8), Stripe checkout modes and URLs, the four webhook event types, season pass end date, signature check, sponsor seats, no `subscriptions.familyId` (R2I-19).
- Documents and account (ON-02, ME-08, ID-05, SE-07): `listDocuments` returns only the actor's uploads, newest first; export JSON + Markdown with only the owner's rows and no secrets, the student's share settings and family tasks ("Sharing with family", "Family tasks", R3E-11), fact dates on the student's calendar (R3E-8), a "Files you uploaded" list, one `export:<exportId>` notification (R2I-18), 24-hour expiry, `latestExport` returns the owner's newest unexpired export or null; deletion cancels every non-canceled Stripe subscription (audited as `subscription_canceled`), blocks every credential at once, and removes a parent's family-room messages, the crew replies and jobs they started, their tasks, and open invites (R2I-4); purge 6 days after `deletedAt` (within 7 with the daily run) removes deleted and blocked under-13 accounts with their rows, email-keyed rows, and orphan blobs (R2I-17); retention purges count each kind.

Round 4 gates additionally verify canonical sensitive aliases and candidate values, private audit wording and protected student income choices, student-only invitation revocation, keyring rotation/length pins, Stripe duplicate/order/payment/replacement rules, token expiry and audit, driver log redaction, MIME verification, and DST quiet windows.

## Review Checklist

- [ ] Every service starts with an `access` check; denied reads throw `not_found`, role checks throw `forbidden`.
- [ ] No service writes student data on behalf of a parent; `shareIncomeRangeToStudent` writes only the `income_range` sensitive fact and the parent's own task, and `updateTask` on an aid-linked task writes only that parent step's status on the aid checklist item (R2I-6, the same write 08 `updateAidItem` allows).
- [ ] Sensitive values are read only in `memory/sensitive.ts`; nothing in `notifications`, `audit` meta, or `crewVisibleFacts` carries them.
- [ ] Every token (magic link, session, invite, helper link, API token) is stored as `sha256Hex` and compared by hash.
- [ ] Every time comparison uses `deps.clock.now()`; inserts that matter for expiry set their timestamps explicitly.
- [ ] `package.json` declares all 26 subpath exports, including plan 07 and 08 modules.
- [ ] `createTestDeps()` matches section 9.4: test DB, memory jobs, `fixedClock("2026-10-06T15:00:00.000Z")`, dev outbox email, the listed config, fake Stripe.
- [ ] `exportsTable` is imported by name; no binding named `exports` exists in core.
- [ ] Contract notes: `getMe` reports `onboardingComplete: true` for parents and admins because only students onboard (D10, accepted). ON-02: past essays are uploaded encrypted; the story interview is ES-08 (D9).
