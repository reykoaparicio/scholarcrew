import { test as base } from "@playwright/test";
import { type AdminState, signInAdminState } from "./admin";

/**
 * `adminState` is worker-scoped: the seeded admin uses one magic link per Playwright worker, however many
 * specs and retries need an admin, so plan 06's 5-per-15-minutes email limit can't turn one failure into several.
 */
export const test = base.extend<Record<never, never>, { adminState: AdminState }>({
  adminState: [
    async ({ browser }, use) => {
      await use(await signInAdminState(browser));
    },
    { scope: "worker" },
  ],
});
