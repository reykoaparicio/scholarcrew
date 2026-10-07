import { getTestDb, resetDb } from "@scholarcrew/db/testing";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await resetDb(getTestDb());
});
