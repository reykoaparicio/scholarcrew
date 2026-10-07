import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as catalog from "./catalog";
import * as family from "./family";
import * as identity from "./identity";
import * as memory from "./memory";

function onDeleteOf(table: PgTable, column: string): string | undefined {
  return getTableConfig(table).foreignKeys.find((fk) => fk.reference().columns[0]?.name === column)?.onDelete;
}

describe("identity, memory, family, and catalog tables", () => {
  it("use the section 8 SQL names", () => {
    const all = { ...identity, ...memory, ...family, ...catalog };
    const names = Object.fromEntries(Object.entries(all).map(([key, table]) => [key, getTableConfig(table).name]));
    expect(names).toEqual({
      users: "users",
      sessions: "sessions",
      magicLinks: "magic_links",
      apiTokens: "api_tokens",
      rateLimits: "rate_limits",
      auditEvents: "audit_events",
      devOutbox: "dev_outbox",
      profiles: "profiles",
      memoryFacts: "memory_facts",
      sensitiveFacts: "sensitive_facts",
      decisions: "decisions",
      stories: "stories",
      families: "families",
      familyMembers: "family_members",
      familyInvites: "family_invites",
      shareSettings: "share_settings",
      familyBudgets: "family_budgets",
      familyTasks: "family_tasks",
      helperLinks: "helper_links",
      scholarships: "scholarships",
      scholarshipSources: "scholarship_sources",
      colleges: "colleges",
      aidRules: "aid_rules",
      aidDeadlines: "aid_deadlines",
      catalogTasks: "catalog_tasks",
      catalogReports: "catalog_reports",
      recheckBatches: "recheck_batches",
    });
  });

  it("maps users to snake_case columns with the section 8 defaults", () => {
    const columns = getTableConfig(identity.users).columns;
    expect(columns.map((c) => c.name)).toEqual([
      "id",
      "email",
      "display_name",
      "role",
      "birth_year",
      "time_zone",
      "status",
      "created_at",
      "deleted_at",
    ]);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(byName.email?.isUnique).toBe(true);
    expect(byName.email?.notNull).toBe(true);
    expect(byName.birth_year?.notNull).toBe(false);
    expect(byName.role?.default).toBe("student");
    expect(byName.time_zone?.default).toBe("America/Chicago");
    expect(byName.status?.default).toBe("active");
  });

  it("keys sensitive facts on (owner_id, kind) and stores ciphertext as bytea", () => {
    const config = getTableConfig(memory.sensitiveFacts);
    expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(["owner_id", "kind"]);
    const types = Object.fromEntries(config.columns.map((c) => [c.name, c.getSQLType()]));
    expect(types).toMatchObject({ ciphertext: "bytea", iv: "bytea", tag: "bytea", kind: "sensitive_kind_enum" });
  });

  it("sets null on creator and submitter keys and cascades owner keys", () => {
    expect(onDeleteOf(family.families, "created_by_id")).toBe("set null");
    expect(onDeleteOf(catalog.scholarships, "submitted_by_id")).toBe("set null");
    expect(onDeleteOf(catalog.catalogReports, "reporter_id")).toBe("set null");
    expect(onDeleteOf(family.familyMembers, "family_id")).toBe("cascade");
    expect(onDeleteOf(family.familyMembers, "user_id")).toBe("cascade");
    expect(onDeleteOf(memory.memoryFacts, "owner_id")).toBe("cascade");
    expect(onDeleteOf(identity.sessions, "user_id")).toBe("cascade");
  });
});
