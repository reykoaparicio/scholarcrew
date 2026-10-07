import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI use policy · ScholarCrew",
  description:
    "How ScholarCrew uses AI: a coach, not a ghostwriter. Which model we use, what it sees, and where people review.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "coach",
    title: "A coach, not a ghostwriter",
    body: (
      <p>
        The crew is a coach, not a ghostwriter. Quill asks questions about your essay and comments on structure,
        clarity, and fit with the prompt, but it never writes or rewrites your essay. A check runs on every crew reply
        and blocks long passages that would read as ghostwriting.
      </p>
    ),
  },
  {
    id: "crew",
    title: "What the crew does",
    body: (
      <p>
        Compass, the coordinator, reads your request and asks the specialists it needs: Scout for scholarships, Atlas
        for admissions, Quill for essays, Aid for financial aid, Ledger for money, Prep for tests, and Impact for
        service hours. Each specialist has a narrow job and only the data that job needs. Nothing changes in your
        account until you click a button to apply a suggestion.
      </p>
    ),
  },
  {
    id: "models",
    title: "The models we use",
    body: (
      <>
        <p>
          The crew runs on Anthropic's Claude model, claude-opus-5-5, through Anthropic's API. We turn on Anthropic's
          server-side fallback: if that model is busy or unavailable, Anthropic may answer with another Claude model,
          and we record which model answered each request.
        </p>
        <p>We don't use your information to train AI models.</p>
      </>
    ),
  },
  {
    id: "sees",
    title: "What the AI sees, and what it never sees",
    body: (
      <ul>
        <li>Only what's needed for your request: the relevant parts of your profile, plan, and work.</li>
        <li>Sensitive facts are never sent to an AI model. Only the matcher, which is plain code, reads them.</li>
        <li>Another student's or another family's information is never included.</li>
        <li>Temporary chats load no memory and save nothing, and they're deleted after 24 hours.</li>
        <li>
          Web pages, PDFs, and documents are passed to the model as data to read, never as instructions to follow.
        </li>
      </ul>
    ),
  },
  {
    id: "math",
    title: "Money math is code",
    body: (
      <p>
        Gaps, offer comparisons, loan payments, word counts, and deadlines are calculated by code, not by the model. The
        public offer tool uses no AI at all.
      </p>
    ),
  },
  {
    id: "checks",
    title: "Checks on every reply",
    body: (
      <ul>
        <li>Integrity: blocks ghostwritten essay text.</li>
        <li>Sources: facts like deadlines and amounts must point to a source with a date.</li>
        <li>Privacy: family-room replies can't include what the student hasn't shared.</li>
        <li>Safety: if a message suggests someone may be in danger, the crew stops and shares crisis resources.</li>
      </ul>
    ),
  },
  {
    id: "unavailable",
    title: "When the AI is unavailable or says no",
    body: (
      <p>
        If the model can't answer, the request shows as failed and you can try again. Your plan, deadlines, the
        directory, and every calculation keep working without it. If the model declines a request, we show that plainly
        instead of guessing.
      </p>
    ),
  },
  {
    id: "catalog",
    title: "Human review of the scholarship catalog",
    body: (
      <ul>
        <li>
          An AI research step finds candidate scholarships and drafts each listing with a quote from the source page.
        </li>
        <li>
          Code checks every draft: quotes must appear on the page, deadlines can't be past, amounts must be sane, and
          scam signals are flagged.
        </li>
        <li>
          A person reviews every draft. Only an admin can publish, and publishing records who checked it and when.
        </li>
        <li>
          Published listings are re-checked against their sources, and changed ones are marked stale until a person
          looks again.
        </li>
      </ul>
    ),
  },
  {
    id: "limits",
    title: "AI can be wrong",
    body: (
      <p>
        Treat crew replies as a starting point. Check important details with the sponsor, college, or financial aid
        office, and report any listing that looks wrong.
      </p>
    ),
  },
];

export default function AiPolicyPage() {
  return (
    <LegalPage
      title="AI use policy"
      updated="October 6, 2026"
      intro="The short version: the crew coaches and never writes your essays, sensitive facts never reach a model, money math is code, and a person reviews every scholarship before it's published."
      sections={SECTIONS}
    />
  );
}
