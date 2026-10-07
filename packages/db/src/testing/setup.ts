import { runMigrations } from "../migrate";
import { testDatabaseUrl } from "./env";

/** Vitest globalSetup: migrates TEST_DATABASE_URL once per run. */
export async function setupTestDatabase(): Promise<void> {
  await runMigrations(testDatabaseUrl());
}

export default setupTestDatabase;
