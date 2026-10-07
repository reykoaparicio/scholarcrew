import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { EXPECTED_ENUMS, EXPECTED_TABLES } from "./expected";
import * as schema from "./index";

const TABLES = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));
const SET_NULL_USER_KEYS = new Set([
  "families.created_by_id",
  "scholarships.submitted_by_id",
  "catalog_reports.reporter_id",
]);

describe("schema index", () => {
  it("exports every section 8 table once", () => {
    expect(EXPECTED_TABLES).toHaveLength(60);
    expect(EXPECTED_ENUMS).toHaveLength(49);
    expect(TABLES.map((table) => getTableConfig(table).name).sort()).toEqual(EXPECTED_TABLES);
    expect(getTableConfig(schema.exportsTable).name).toBe("exports");
    expect("exports" in schema).toBe(false);
  });

  it("cascades every foreign key to users except the three set-null keys", () => {
    const seen: string[] = [];
    for (const table of TABLES) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        if (ref.foreignTable !== schema.users) continue;
        const key = `${config.name}.${ref.columns[0]?.name}`;
        seen.push(key);
        expect(fk.onDelete, key).toBe(SET_NULL_USER_KEYS.has(key) ? "set null" : "cascade");
      }
    }
    expect(seen).toHaveLength(42);
  });

  it("makes the aid checklist key unique with nulls not distinct", () => {
    const [constraint] = getTableConfig(schema.aidChecklistItems).uniqueConstraints;
    expect(constraint?.nullsNotDistinct).toBe(true);
    expect(constraint?.columns.map((c) => c.name)).toEqual(["owner_id", "award_year", "program", "key", "college_id"]);
  });

  it("keeps story uses unique per story and essay and cascades from both", () => {
    const config = getTableConfig(schema.storyUses);
    expect(config.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual(["story_id", "essay_id"]);
    const actions = config.foreignKeys
      .map((fk) => `${getTableConfig(fk.reference().foreignTable).name}:${fk.onDelete}`)
      .sort();
    expect(actions).toEqual(["essays:cascade", "stories:cascade"]);
  });

  it("stores the recommendation note as text not null default '' (D38)", () => {
    const columns = getTableConfig(schema.recRequests).columns;
    const message = columns.find((c) => c.name === "message");
    expect(message?.getSQLType()).toBe("text");
    expect(message?.notNull).toBe(true);
    expect(message?.default).toBe("");
    expect(columns.map((c) => c.name)).toEqual([
      "id",
      "owner_id",
      "recommender_id",
      "college_list_id",
      "scholarship_application_id",
      "helper_link_id",
      "message",
      "status",
      "requested_at",
      "updated_at",
    ]);
  });

  it("marks generated plan items with bool not null default false (R2C-4)", () => {
    const generated = getTableConfig(schema.planItems).columns.find((c) => c.name === "generated");
    expect(generated?.getSQLType()).toBe("boolean");
    expect(generated?.notNull).toBe(true);
    expect(generated?.default).toBe(false);
  });

  it("links family tasks to an aid checklist item, cascading, one per assignee (R2I-6)", () => {
    const config = getTableConfig(schema.familyTasks);
    const aidItem = config.columns.find((c) => c.name === "aid_item_id");
    expect(aidItem?.getSQLType()).toBe("uuid");
    expect(aidItem?.notNull).toBe(false);
    const fk = config.foreignKeys.find((f) => f.reference().columns[0]?.name === "aid_item_id");
    expect(fk && getTableConfig(fk.reference().foreignTable).name).toBe("aid_checklist_items");
    expect(fk?.onDelete).toBe("cascade");
    const uq = config.uniqueConstraints.find((u) => u.name === "family_tasks_aid_item_assignee_uq");
    expect(uq?.columns.map((c) => c.name)).toEqual(["aid_item_id", "assignee_id"]);
    expect(uq?.nullsNotDistinct).toBe(false);
  });

  it("adds a nullable sms_sent_at timestamp to notifications (R2I-9)", () => {
    const smsSentAt = getTableConfig(schema.notifications).columns.find((c) => c.name === "sms_sent_at");
    expect(smsSentAt?.getSQLType()).toBe("timestamp with time zone");
    expect(smsSentAt?.notNull).toBe(false);
  });

  it("has no family_id on subscriptions (R2I-19)", () => {
    expect(getTableConfig(schema.subscriptions).columns.map((c) => c.name)).not.toContain("family_id");
  });
});

describe("round 4 schema invariants", () => {
  it("defines lease, encryption, token expiry, Stripe ordering, and share-provenance columns", () => {
    for (const [table, columns] of [
      [schema.crewJobs, ["attempt", "lease_token", "lease_expires_at", "usage_month"]],
      [schema.apiTokens, ["expires_at"]],
      [schema.messages, ["shared_categories"]],
      [schema.subscriptions, ["stripe_event_at"]],
      [schema.stripeEvents, ["id", "type", "received_at"]],
      [schema.sensitiveFacts, ["key_id"]],
      [schema.blobs, ["key_id"]],
      [schema.notificationPrefs, ["phone_key_id"]],
    ] as const) {
      const names = getTableConfig(table).columns.map((column) => column.name);
      for (const name of columns) expect(names).toContain(name);
    }
    expect(schema.crewJobs.usageMonth.notNull).toBe(true);
    expect(schema.apiTokens.expiresAt.notNull).toBe(true);
    expect(schema.crewJobs.attempt.default).toBe(0);
    expect(schema.sensitiveFacts.keyId.default).toBe(1);
    expect(schema.blobs.keyId.default).toBe(1);
    expect(schema.notificationPrefs.phoneKeyId.default).toBe(1);
  });
  it("enforces current facts, one family, active colleges, and open recheck uniqueness", () => {
    for (const [table, name, partial] of [
      [schema.familyMembers, "family_members_user_uq", false],
      [schema.memoryFacts, "memory_facts_current_uq", true],
      [schema.collegeList, "college_list_owner_college_active_uq", true],
      [schema.catalogTasks, "catalog_tasks_open_recheck_uq", true],
    ] as const) {
      const index = getTableConfig(table).indexes.find((entry) => entry.config.name === name);
      expect(index?.config.unique).toBe(true);
      expect(Boolean(index?.config.where)).toBe(partial);
    }
    expect(getTableConfig(schema.collegeList).uniqueConstraints.map((entry) => entry.name)).not.toContain(
      "college_list_owner_college_season_uq",
    );
  });
  it("nulls recommendation targets when their applications disappear", () => {
    const fks = getTableConfig(schema.recRequests).foreignKeys;
    for (const name of ["college_list_id", "scholarship_application_id"]) {
      expect(fks.find((fk) => fk.reference().columns[0]?.name === name)?.onDelete).toBe("set null");
    }
  });
});
