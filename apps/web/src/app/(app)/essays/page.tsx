import { NewEssayForm } from "@/components/essays/NewEssayForm";
import { type EssayStats, limitBadge } from "@/components/essays/text";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { getCollegeList } from "@scholarcrew/core/colleges";
import { listEssays } from "@scholarcrew/core/essays";
import { getBoard } from "@scholarcrew/core/scholarships";
import type { Board, Essay, EssayStatus, EssayTarget } from "@scholarcrew/domain";
import { limitState } from "@scholarcrew/engines";
import { Badge, Button, Card, EmptyState, Table } from "@scholarcrew/ui";

export const dynamic = "force-dynamic";

const STATUS: Record<EssayStatus, { tone: "neutral" | "navy" | "good"; label: string }> = {
  drafting: { tone: "neutral", label: "Drafting" },
  ready: { tone: "navy", label: "Ready" },
  submitted: { tone: "good", label: "Submitted" },
};

const TARGET_LABEL: Record<EssayTarget, string> = {
  college: "A college",
  scholarship: "A scholarship",
  general: "General",
};

/** D34: `latestWordCount` (words in the current version) comes with the list, so this page reads no essay bodies. */
function lengthStats(e: Essay): EssayStats | null {
  const count = e.latestWordCount;
  if (count === null) return null;
  return {
    count,
    limit: e.wordLimit,
    unit: "words",
    state: limitState(count, e.wordLimit),
    label: e.wordLimit === null ? `${count} words` : `${count} / ${e.wordLimit} words`,
  };
}

/** Saved scholarships (flagged listings left out) for the "For" column and the new-essay picker. */
function boardScholarships(b: Board | null): Array<{ id: string; name: string }> {
  if (!b) return [];
  return [...b.matched, ...b.working, ...b.submitted, ...b.won, ...b.lostOrSkipped].map((c) => ({
    id: c.scholarship.id,
    name: c.scholarship.name,
  }));
}

export default async function EssaysPage() {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="essays" />;
  const essays = await readShared(() => listEssays(v.deps, v.actor, studentId));
  if (!essays) return <NotShared studentName={v.studentName} what="essays" />;
  const [list, board] = await Promise.all([
    readShared(() => getCollegeList(v.deps, v.actor, studentId)),
    readShared(() => getBoard(v.deps, v.actor, studentId)),
  ]);
  const colleges = (list ?? []).map((e) => ({ id: e.collegeId, name: e.college.name }));
  const scholarships = boardScholarships(board);
  const collegeName = new Map(colleges.map((c) => [c.id, c.name]));
  const scholarshipName = new Map(scholarships.map((s) => [s.id, s.name]));
  const targetName = (e: Essay): string =>
    (e.targetCollegeId ? collegeName.get(e.targetCollegeId) : undefined) ??
    (e.targetScholarshipId ? scholarshipName.get(e.targetScholarshipId) : undefined) ??
    TARGET_LABEL[e.targetType];
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Essays</h1>
          <p className={shared.sub}>{`${essays.length} drafts · Quill coaches, you write`}</p>
        </div>
        <div className={shared.actions}>
          <Button variant="line" icon="bookmark" href="/essays/stories">
            Story Bank
          </Button>
          {v.isParent ? null : (
            <Button variant="primary" icon="plus" href="#new-essay">
              New essay
            </Button>
          )}
        </div>
      </div>
      <Card>
        {essays.length === 0 ? (
          <EmptyState title="No essays yet" icon="pen">
            {v.isParent
              ? "Essays your student starts show up here."
              : "Start one below, from a scholarship's essay prompt, or from a college supplement."}
          </EmptyState>
        ) : (
          <Table
            caption="Your essays"
            rowKey={(e) => e.id}
            rows={essays}
            columns={[
              { key: "title", header: "Essay", render: (e) => <a href={`/essays/${e.id}`}>{e.title}</a> },
              { key: "target", header: "For", render: (e) => targetName(e) },
              {
                key: "words",
                header: "Length",
                align: "right",
                render: (e) => {
                  const stats = lengthStats(e);
                  if (!stats) return "No draft yet";
                  const badge = limitBadge(stats);
                  return (
                    <>
                      {stats.label} {badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null}
                    </>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                render: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>,
              },
            ]}
          />
        )}
      </Card>
      {v.isParent ? null : <NewEssayForm colleges={colleges} scholarships={scholarships} />}
    </>
  );
}
