"use client";

import { api, errorMessage } from "@/lib/api";
import type { Story } from "@scholarcrew/domain";
import { Button, Card, EmptyState, Tag, TextArea, TextInput } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import shared from "../scholarships/shared.module.css";
import styles from "./essays.module.css";

type Draft = { title: string; moment: string; themes: string[]; evidence: string; summary: string };
const EMPTY: Draft = { title: "", moment: "", themes: [], evidence: "", summary: "" };

const INTERVIEW_ASK = "@Quill interview me for a new Story Bank story";
/** Same cap as a crew message (the composer's maxLength). */
const MAX_ASK = 4000;

/** ES-08: Quill asks up to 5 questions in My Crew; the student's own answers become the moment they save here. */
function StoryInterview() {
  const [pasted, setPasted] = useState("");
  const extra = pasted.trim();
  const ask = (extra ? `${INTERVIEW_ASK}. Here's a past essay to start from:\n\n${extra}` : INTERVIEW_ASK).slice(
    0,
    MAX_ASK,
  );
  return (
    <Card title="Capture a new story with Quill">
      <p className={styles.meta}>
        Quill asks up to 5 questions in chat. Your answers, in your words, become the story's moment; Quill doesn't
        write it. When you're done, add the story here.
      </p>
      <TextArea
        label="Paste a past essay (optional)"
        hint="Quill uses it to ask better questions. It isn't saved as a story."
        rows={4}
        maxLength={MAX_ASK}
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <Button variant="soft" icon="chat" href={`/crew?prefill=${encodeURIComponent(ask)}`}>
        Start a story interview
      </Button>
    </Card>
  );
}

function StoryForm({ editing, initial, onDone }: { editing: Story | null; initial: Draft; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [theme, setTheme] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addTheme() {
    const t = theme.trim().toLowerCase().slice(0, 40);
    if (!t || draft.themes.includes(t) || draft.themes.length >= 8) return setTheme("");
    setDraft({ ...draft, themes: [...draft.themes, t] });
    setTheme("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.moment.trim())
      return setError("A story needs a title and the moment in your words.");
    setSaving(true);
    setError(null);
    const body = { ...draft, title: draft.title.trim(), moment: draft.moment.trim() };
    try {
      if (editing) await api<Story>(`/stories/${editing.id}`, { method: "PATCH", body });
      else await api<Story>("/stories", { body });
      setDraft(EMPTY);
      onDone();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={editing ? "Edit story" : "Add a story"}>
      <form aria-label={editing ? "Edit story" : "New story"} className={shared.form} onSubmit={save}>
        <TextInput
          label="Title"
          maxLength={120}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <TextArea
          label="The moment, in your words"
          hint="What happened, as you'd tell a friend. Quill never writes this part."
          rows={5}
          maxLength={4000}
          value={draft.moment}
          onChange={(e) => setDraft({ ...draft, moment: e.target.value })}
        />
        <div className={styles.tags}>
          {draft.themes.map((t) => (
            <Tag key={t}>
              {t}{" "}
              <button
                type="button"
                aria-label={`Remove theme ${t}`}
                onClick={() => setDraft({ ...draft, themes: draft.themes.filter((x) => x !== t) })}
              >
                ×
              </button>
            </Tag>
          ))}
        </div>
        <TextInput
          label="Add a theme"
          value={theme}
          maxLength={40}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTheme();
            }
          }}
        />
        <Button variant="line" size="sm" icon="plus" onClick={addTheme}>
          Add theme
        </Button>
        <TextArea
          label="Evidence (optional)"
          rows={2}
          maxLength={2000}
          value={draft.evidence}
          onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
        />
        <TextInput
          label="One-line summary (optional)"
          maxLength={400}
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={shared.actions}>
          <Button variant="primary" type="submit" disabled={saving}>
            Save story
          </Button>
          {editing ? (
            <Button variant="line" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/** ES-05: create, edit, archive; ES-07: each story lists where it was used; ES-08: start a Quill interview. */
export function StoryBank({
  stories,
  readOnly,
  prefill,
}: {
  stories: Story[];
  readOnly: boolean;
  prefill: { title: string; moment: string } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = stories.filter((s) => s.archivedAt === null);

  async function archive(id: string) {
    setError(null);
    try {
      await api(`/stories/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const initial: Draft = editing
    ? {
        title: editing.title,
        moment: editing.moment,
        themes: editing.themes,
        evidence: editing.evidence,
        summary: editing.summary,
      }
    : prefill
      ? { ...EMPTY, ...prefill }
      : EMPTY;

  return (
    <div className={styles.bank}>
      <Card title="Your stories">
        {active.length === 0 ? (
          <EmptyState title="No stories yet" icon="bookmark">
            A story is one moment you lived, in your own words. You can reuse it across essays.
          </EmptyState>
        ) : null}
        <div className={styles.stories}>
          {active.map((s) => (
            <article key={s.id} aria-label={s.title}>
              <p className={styles.storyTitle}>{s.title}</p>
              {s.summary ? <p className={styles.meta}>{s.summary}</p> : null}
              <p>{s.moment}</p>
              <div className={styles.tags}>
                {s.themes.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              {s.evidence ? <p className={styles.meta}>{`Evidence: ${s.evidence}`}</p> : null}
              <p className={styles.meta}>
                {s.uses.length === 0 ? "Not used yet" : `Used in ${s.uses.map((u) => u.essayTitle).join(", ")}`}
              </p>
              {readOnly ? null : (
                <div className={shared.actions}>
                  <Button variant="line" size="sm" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <Button variant="line" size="sm" onClick={() => void archive(s.id)}>
                    Archive
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      {readOnly ? null : (
        <StoryForm key={editing?.id ?? "new"} editing={editing} initial={initial} onDone={() => setEditing(null)} />
      )}
      {readOnly ? null : <StoryInterview />}
    </div>
  );
}
