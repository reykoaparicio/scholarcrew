import { resetDepsForTests } from "@/server/deps";
import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
  resetDepsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
