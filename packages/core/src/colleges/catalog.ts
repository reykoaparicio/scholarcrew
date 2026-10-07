import { and, asc, colleges, count, eq, ilike } from "@scholarcrew/db";
import {
  type Actor,
  type College,
  type CollegeQuery,
  type CollegeSummary,
  type Page,
  notFound,
} from "@scholarcrew/domain";
import type { SQL } from "drizzle-orm";
import { escapeLike, requireUser } from "../scholarships/common";
import type { CoreDeps } from "../shared";
import { toCollege, toCollegeSummary } from "./mappers";

function assertSignedInOrSystem(actor: Actor): void {
  if (actor.kind !== "system") requireUser(actor);
}

export async function searchColleges(deps: CoreDeps, actor: Actor, q: CollegeQuery): Promise<Page<CollegeSummary>> {
  assertSignedInOrSystem(actor);
  const conds: SQL[] = [];
  const text = q.q?.trim();
  if (text) conds.push(ilike(colleges.name, `%${escapeLike(text)}%`));
  if (q.state) conds.push(eq(colleges.state, q.state.toUpperCase()));
  if (q.control) conds.push(eq(colleges.control, q.control));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const [total] = await deps.db.select({ n: count() }).from(colleges).where(where);
  const rows = await deps.db
    .select()
    .from(colleges)
    .where(where)
    .orderBy(asc(colleges.name), asc(colleges.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(toCollegeSummary), page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

export async function getCollege(deps: CoreDeps, actor: Actor, id: string): Promise<College> {
  assertSignedInOrSystem(actor);
  const [row] = await deps.db.select().from(colleges).where(eq(colleges.id, id));
  if (!row) throw notFound("College not found");
  return toCollege(row);
}
