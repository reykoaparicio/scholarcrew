import { BoardView } from "@/components/scholarships/BoardView";
import { NotShared } from "@/components/scholarships/NotShared";
import { SearchResults } from "@/components/scholarships/SearchResults";
import { loadViewer, readShared, todayIn } from "@/components/scholarships/viewer";
import { getBoard, searchScholarships } from "@scholarcrew/core/scholarships";

export const dynamic = "force-dynamic";

export default async function ScholarshipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="scholarships" />;
  const board = await readShared(() => getBoard(v.deps, v.actor, studentId));
  if (!board) return <NotShared studentName={v.studentName} what="scholarships" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  // R3V-2: like 18's directory, closed listings never show (07 G2 `openOn`); "today" is the student's calendar day.
  const openOn = todayIn(v.deps.clock.now(), v.timeZone);
  const results = q ? await searchScholarships(v.deps, v.actor, { q, page: 1, pageSize: 20, openOn }) : null;
  const savedIds = [...board.matched, ...board.working, ...board.submitted, ...board.won, ...board.lostOrSkipped].map(
    (c) => c.scholarship.id,
  );
  return (
    <>
      {results ? <SearchResults query={q} results={results} savedIds={savedIds} readOnly={v.isParent} /> : null}
      <BoardView board={board} readOnly={v.isParent} timeZone={v.timeZone} />
    </>
  );
}
