import { StoryBank } from "@/components/essays/StoryBank";
import { NotShared } from "@/components/scholarships/NotShared";
import shared from "@/components/scholarships/shared.module.css";
import { loadViewer, readShared } from "@/components/scholarships/viewer";
import { listStories } from "@scholarcrew/core/essays";
import { listServiceLogs } from "@scholarcrew/core/impact";

export const dynamic = "force-dynamic";

export default async function StoryBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v = await loadViewer();
  const studentId = v.studentId;
  if (!studentId) return <NotShared studentName="" what="stories" />;
  const stories = await readShared(() => listStories(v.deps, v.actor, studentId));
  if (!stories) return <NotShared studentName={v.studentName} what="stories" />;
  const sp = await searchParams;
  let prefill: { title: string; moment: string } | null = null;
  if (!v.isParent && typeof sp.fromLog === "string") {
    const log = (await listServiceLogs(v.deps, v.actor, v.actor.userId)).find((l) => l.id === sp.fromLog);
    if (log?.reflection)
      prefill = { title: `${log.organization}: ${log.activity}`.slice(0, 120), moment: log.reflection };
  }
  return (
    <>
      <div className={shared.head}>
        <div>
          <h1>Story Bank</h1>
          <p className={shared.sub}>Moments in your own words, ready to reuse. Quill suggests them; you decide.</p>
        </div>
      </div>
      <StoryBank stories={stories} readOnly={v.isParent} prefill={prefill} />
    </>
  );
}
