"use client";

import type { CrewRole } from "@scholarcrew/domain";
import { Card, Chip, Icon } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./week.module.css";

const CHIPS: Array<{ role: CrewRole; text: string }> = [
  { role: "scout", text: "@Scout local scholarships" },
  { role: "ledger", text: "@Ledger what if I win my open applications?" },
  { role: "aid", text: "@Aid what does my family need to do?" },
];

/** WK-06: submitting opens Crew and sends the message; chips prefill the composer. */
export function AskBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <Card className={styles.askCard}>
      <form
        className={styles.askbar}
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (q) router.push(`/crew?prefill=${encodeURIComponent(q)}`);
        }}
      >
        <Icon name="chat" />
        <input
          className={styles.askInput}
          aria-label="Ask your crew"
          placeholder={'Ask your crew anything, like "Can I still apply Early Action?"'}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={styles.askSend}>
          Ask
        </button>
      </form>
      <div className={styles.chips}>
        {CHIPS.map((c) => (
          <Chip key={c.text} dot={c.role} onClick={() => router.push(`/crew?prefill=${encodeURIComponent(c.text)}`)}>
            {c.text}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
