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
  userActor,
} from "@scholarcrew/domain";
import { assertRole, assertUser } from "../access";
import { recordAudit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { type CoreDeps, addDays, one, ownedWhere, requireUuid, toIso, toIsoOrNull } from "../shared";

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
