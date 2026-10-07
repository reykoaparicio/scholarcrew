import { sql } from "drizzle-orm";
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** bytea over Buffer. postgres-js sends Buffers as bytea and parses bytea back into Buffers. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** timestamptz, read as a Date. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const uuidPk = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () => ts("created_at").notNull().defaultNow();
export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const emptyTextArray = () => sql`'{}'::text[]`;
export const emptyIntArray = () => sql`'{}'::integer[]`;
export const emptyJsonArray = () => sql`'[]'::jsonb`;
export const emptyJsonObject = () => sql`'{}'::jsonb`;
