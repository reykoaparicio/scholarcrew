import { Card, Eyebrow, Icon, Who } from "@scholarcrew/ui";
import type { OnboardingDraft } from "./model";
import styles from "./onboarding.module.css";

export function UsesPanel() {
  const lines: Array<[string, string]> = [
    ["Only by the matcher.", "That's plain code that compares your answers to each scholarship's rules."],
    ["Never sent to AI.", "Your crew can't read these, and they never show up in chat."],
    ["Never shown to family, schools, or helpers.", "Match reasons in the family room leave them out."],
    ["Encrypted and never guessed.", "Nothing here is inferred from what you write."],
  ];
  return (
    <Card title="How these are used" aside={<Icon name="lock" />}>
      {lines.map(([lead, rest]) => (
        <p key={lead} className={styles.tline}>
          <Icon name="check" />
          <span>
            <b>{lead}</b> {rest}
          </span>
        </p>
      ))}
      <p className={styles.hint}>Change or delete any of these later in Memory.</p>
    </Card>
  );
}

export function SoFarPanel({ draft }: { draft: OnboardingDraft }) {
  const rows: Array<[string, string]> = [
    ["School", [draft.highSchool, draft.classYear ? `class of ${draft.classYear}` : ""].filter(Boolean).join(" · ")],
    ["Lives in", [draft.county ? `${draft.county} County` : "", draft.state].filter(Boolean).join(", ")],
    ["GPA", draft.gpa ? `${draft.gpa} unweighted` : "Not added"],
    ["Majors", draft.majors.trim() || "Not added"],
    ["Interests", draft.interests.trim() || "Not added"],
  ];
  return (
    <Card title="What you've told us so far">
      {rows.map(([k, v]) => (
        <div key={k} className={styles.kv}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      <p className={styles.hint}>Each is saved as something you said. Fix anything in Memory.</p>
    </Card>
  );
}

export function WhenYouFinish() {
  return (
    <Card>
      <Eyebrow>When you finish</Eyebrow>
      <p className={styles.small}>
        <Who role="scout" /> runs your first scholarship sweep and <Who role="compass" /> plans your first week. It
        takes a few minutes, and it keeps going if you close the tab.
      </p>
    </Card>
  );
}
