import { body, extensionPreflight, json, requireScope, route } from "@/server/http";
import { submitLocalScholarship } from "@scholarcrew/core/scholarships";
import { SavePageInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LocalSubmissionInput.notes allows 1000 characters; a page selection may be up to 2000.
const MAX_NOTES = 1000;

// EX-02: the page becomes a local scholarship submission (SC-07), visible only to the student until reviewed.
// The core also puts it on the student's board as `planned` in the same transaction (R2C-12), so no second call.
export const POST = route(
  { auth: "bearer", cors: "extension", rate: { key: "scholarships.local", limit: 10, windowSeconds: 86_400 } },
  async (ctx) => {
    requireScope(ctx, "save_page");
    const page = await body(ctx.req, SavePageInput);
    const summary = await submitLocalScholarship(ctx.deps, ctx.actor, {
      url: page.url,
      name: page.title,
      notes: page.selectedText.slice(0, MAX_NOTES),
    });
    return json(summary, 201);
  },
);

export const OPTIONS = extensionPreflight;
