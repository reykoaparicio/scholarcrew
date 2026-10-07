import type { Db } from "../client";
import { seedAid } from "./aid";
import { seedCatalog } from "./catalog";
import { removeSeedPeople, seedPeople } from "./people";
import { seedRecords } from "./records";

export { SEED_EMAILS } from "./people";
export { SEED_TOKENS } from "./util";

/**
 * Loads the fictional sample data from design/mockups/source into a dev database: Jordan (student), Dana (parent),
 * an admin, six colleges, the mockup scholarships, and Jordan's records for the week of Oct 5, 2026, plus sample
 * aid rules and deadlines that are marked unverified (R2P-1).
 * Nothing here is real. Safe to run again: it deletes the seed users (their rows cascade) and upserts catalog rows.
 */
export async function seedDev(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await removeSeedPeople(tx);
    const people = await seedPeople(tx);
    const catalog = await seedCatalog(tx, people);
    await seedAid(tx);
    await seedRecords(tx, people, catalog);
  });
}
