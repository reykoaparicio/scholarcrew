"use client";

import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { timeZoneLabel } from "@/lib/time";
import type { NotificationPrefs, NotificationPrefsPatch } from "@scholarcrew/domain";
import { Badge, Button, Card, Icon, Select, StatusPill, TextInput, Toggle } from "@scholarcrew/ui";
import { useState } from "react";
import styles from "./settings.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** E.164, the same rule as NotificationPrefsPatch.phone. */
const PHONE = /^\+[1-9]\d{7,14}$/;

export function hourLabel(h: number): string {
  const suffix = h < 12 ? "a.m." : "p.m.";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }));

/**
 * NO-04: digest day and hour, email on or off, quiet hours. The one email switch is `emailEnabled`, which gates
 * every email (digest, deadline reminders, new matches), so it's labeled that way, and the reminders row reads
 * Off, "In the app only", while it's off (R2I-8). NO-05 (R3): a mobile number and opt-in 1-day SMS reminders,
 * which stay off until a number is saved and wait out quiet hours (R2I-9). Each change saves right away.
 */
export function NotificationsCard({ prefs, timeZone }: { prefs: NotificationPrefs; timeZone: string }) {
  const [current, setCurrent] = useState(prefs);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);

  async function save(patch: NotificationPrefsPatch): Promise<boolean> {
    const before = current;
    const { phone: _phone, ...shown } = patch;
    setCurrent({ ...current, ...shown });
    setError(null);
    try {
      setCurrent(await api<NotificationPrefs>("/notification-prefs", { method: "PATCH", body: patch }));
      return true;
    } catch (e) {
      setCurrent(before);
      setError(errorMessage(e));
      return false;
    }
  }

  async function savePhone() {
    const value = phone.trim();
    if (!PHONE.test(value)) {
      setPhoneError("Use the format +15125550123");
      return;
    }
    setPhoneError(undefined);
    if (await save({ phone: value })) setPhone("");
  }

  return (
    <Card title="Notifications" aside={<Icon name="bell" />}>
      <p className={styles.setL}>Weekly digest day</p>
      <div className={styles.days}>
        {DAYS.map((day, n) => (
          <button
            key={day}
            type="button"
            className={cx(styles.day, current.digestDay === n && styles.dayOn)}
            aria-pressed={current.digestDay === n}
            onClick={() => void save({ digestDay: n })}
          >
            {day}
          </button>
        ))}
      </div>
      <Select
        label="Digest time"
        options={HOURS}
        value={String(current.digestHour)}
        onChange={(e) => void save({ digestHour: Number(e.target.value) })}
      />
      <Toggle
        checked={current.emailEnabled}
        label="Email me (digest, deadline reminders, new matches)"
        detail="The digest is skipped when there's nothing new"
        onChange={(emailEnabled) => void save({ emailEnabled })}
      />
      <div className={styles.trow}>
        <span className={styles.tl}>
          Deadline reminders
          <span className={styles.sub2}>{current.emailEnabled ? "7, 3, and 1 day before" : "In the app only"}</span>
        </span>
        {current.emailEnabled ? <StatusPill status="on" /> : <Badge tone="neutral">Off</Badge>}
      </div>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          void savePhone();
        }}
      >
        <TextInput
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={current.phoneSet ? "Saved · enter a new number to change it" : "+15125550123"}
          value={phone}
          maxLength={16}
          error={phoneError}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button variant="line" size="sm" type="submit" disabled={phone.trim() === ""}>
          Save number
        </Button>
      </form>
      <Toggle
        checked={current.smsEnabled}
        label="Text me 1-day reminders"
        detail={current.phoneSet ? "Only the day before a deadline, never in quiet hours" : "Add a phone number first"}
        disabled={!current.phoneSet}
        onChange={(smsEnabled) => void save({ smsEnabled })}
      />
      <p className={styles.muted}>Texts wait until your quiet hours end.</p>
      <p className={styles.setL}>Quiet hours</p>
      <div className={styles.times}>
        <Select
          label="Quiet hours start"
          options={HOURS}
          value={String(current.quietStartHour)}
          onChange={(e) => void save({ quietStartHour: Number(e.target.value) })}
        />
        <span>to</span>
        <Select
          label="Quiet hours end"
          options={HOURS}
          value={String(current.quietEndHour)}
          onChange={(e) => void save({ quietEndHour: Number(e.target.value) })}
        />
        <span className={styles.muted}>{timeZoneLabel(timeZone)}</span>
      </div>
      <p className={styles.muted}>Emails never include sensitive facts or essays.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
