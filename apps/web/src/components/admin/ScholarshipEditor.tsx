"use client";

import { instantLong } from "@/components/public/dates";
import { api, errorMessage } from "@/lib/api";
import {
  type CatalogStatus,
  type EligibilityRule,
  SCAM_FLAG_TEXT,
  type ScamFlag,
  type Scholarship,
  US_STATES,
} from "@scholarcrew/domain";
import { Badge, Button, Card, Select, TextArea, TextInput, Toggle } from "@scholarcrew/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EligibilityEditor } from "./EligibilityEditor";
import { RequirementsEditor } from "./RequirementsEditor";
import styles from "./admin.module.css";
import { ADMIN_TZ, CATALOG_STATUS_LABELS } from "./labels";
import {
  type ListingForm,
  emptyListingForm,
  emptyRequirementsForm,
  listingFormFrom,
  requirementsFormFrom,
  slugify,
  toUpsertInput,
} from "./listingForm";

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s, label: s }));
const SCAM_FLAGS = Object.keys(SCAM_FLAG_TEXT) as ScamFlag[];
const STATUS_DONE: Partial<Record<CatalogStatus, string>> = {
  published: "Published. The verified date is today.",
  retired: "Retired. It no longer appears anywhere.",
  flagged: "Flagged and hidden from students and the directory.",
};

/** AD-02: every ScholarshipUpsertInput field, the rule editor, and publish / retire / flag. */
export function ScholarshipEditor({ listing, defaultCycle }: { listing: Scholarship | null; defaultCycle: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Scholarship | null>(listing);
  const [form, setForm] = useState<ListingForm>(() =>
    listing ? listingFormFrom(listing) : emptyListingForm(defaultCycle),
  );
  const [req, setReq] = useState(() =>
    listing ? requirementsFormFrom(listing.requirements) : emptyRequirementsForm(),
  );
  const [rules, setRules] = useState<{ rules: EligibilityRule[]; errors: string[] }>({
    rules: listing?.eligibility ?? [],
    errors: [],
  });
  const [slugTouched, setSlugTouched] = useState(listing !== null);
  const [statusNote, setStatusNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<ListingForm>) => setForm((f) => ({ ...f, ...patch }));
  const setName = (name: string) => set(slugTouched ? { name } : { name, slug: slugify(name) });
  const toggleFlag = (flag: ScamFlag) =>
    set({
      scamFlags: form.scamFlags.includes(flag) ? form.scamFlags.filter((f) => f !== flag) : [...form.scamFlags, flag],
    });

  async function save() {
    setMessage(null);
    if (rules.errors.length > 0) {
      setErrors(rules.errors);
      return;
    }
    const built = toUpsertInput(current?.id ?? null, form, req, rules.rules);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      if (!current) {
        const created = await api<Scholarship>("/admin/scholarships", { body: built.input });
        router.replace(`/admin/scholarships/${created.id}`);
        return;
      }
      setCurrent(await api<Scholarship>(`/admin/scholarships/${current.id}`, { method: "PATCH", body: built.input }));
      setMessage("Saved.");
      router.refresh();
    } catch (e) {
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: CatalogStatus) {
    if (!current) return;
    setBusy(true);
    setErrors([]);
    setMessage(null);
    try {
      const updated = await api<Scholarship>(`/admin/scholarships/${current.id}/status`, {
        body: { status, note: statusNote.trim() },
      });
      setCurrent(updated);
      setMessage(STATUS_DONE[status] ?? "Status updated.");
      router.refresh();
    } catch (e) {
      setErrors([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      {errors.length > 0 ? (
        <div role="alert" className={styles.alert}>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? <output className={styles.ok}>{message}</output> : null}

      {current ? (
        <Card
          title="Status"
          aside={
            <Badge tone={current.status === "published" ? "good" : "neutral"}>
              {CATALOG_STATUS_LABELS[current.status]}
            </Badge>
          }
        >
          <p className={styles.sub}>
            {current.verifiedAt ? `Verified ${instantLong(current.verifiedAt, ADMIN_TZ)}.` : "Not verified yet."}{" "}
            Publishing records you and today's date. Retire and flag hide the listing everywhere.
          </p>
          <TextInput
            label="Note for the audit log"
            maxLength={1000}
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
          />
          <div className={styles.row}>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => setStatus("published")}>
              Publish
            </Button>
            <Button variant="line" size="sm" disabled={busy} onClick={() => setStatus("retired")}>
              Retire
            </Button>
            <Button variant="line" size="sm" disabled={busy} onClick={() => setStatus("flagged")}>
              Flag
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Listing">
        <div className={styles.formGrid}>
          <TextInput label="Name" value={form.name} onChange={(e) => setName(e.target.value)} />
          <TextInput
            label="Slug"
            hint="Lowercase words joined by dashes; used in the public URL"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set({ slug: e.target.value });
            }}
          />
          <TextInput label="Provider" value={form.provider} onChange={(e) => set({ provider: e.target.value })} />
          <TextInput label="Apply URL" type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          <TextInput
            label="Source URL"
            type="url"
            hint="The page we checked. Defaults to the apply URL."
            value={form.sourceUrl}
            onChange={(e) => set({ sourceUrl: e.target.value })}
          />
          <TextInput
            label="Deadline"
            type="date"
            value={form.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
          />
          <TextInput
            label="Minimum amount ($)"
            inputMode="numeric"
            value={form.amountMin}
            onChange={(e) => set({ amountMin: e.target.value })}
          />
          <TextInput
            label="Maximum amount ($)"
            inputMode="numeric"
            value={form.amountMax}
            onChange={(e) => set({ amountMax: e.target.value })}
          />
          <TextInput
            label="Cycle"
            hint="YYYY-YY, like 2026-27"
            value={form.cycle}
            onChange={(e) => set({ cycle: e.target.value })}
          />
          <TextInput
            label="Minutes to apply"
            inputMode="numeric"
            value={form.estMinutes}
            onChange={(e) => set({ estMinutes: e.target.value })}
          />
        </div>
        <Toggle label="Renewable" checked={form.renewable} onChange={(renewable) => set({ renewable })} />
        {form.renewable ? (
          <TextArea
            label="Renewal terms"
            rows={2}
            value={form.renewalTerms}
            onChange={(e) => set({ renewalTerms: e.target.value })}
          />
        ) : null}
      </Card>

      <Card title="Where">
        <Toggle label="National listing" checked={form.national} onChange={(national) => set({ national })} />
        {form.national ? null : (
          <div className={styles.formGrid}>
            <Select
              label="State"
              options={STATE_OPTIONS}
              value={form.state}
              onChange={(e) => set({ state: e.target.value })}
            />
            <TextInput
              label="Counties"
              hint="Separate with commas"
              value={form.counties}
              onChange={(e) => set({ counties: e.target.value })}
            />
            <TextInput
              label="Cities"
              hint="Separate with commas"
              value={form.cities}
              onChange={(e) => set({ cities: e.target.value })}
            />
          </div>
        )}
      </Card>

      <Card title="Who can apply">
        <EligibilityEditor initial={listing?.eligibility ?? []} onChange={setRules} />
      </Card>

      <Card title="Requirements">
        <RequirementsEditor value={req} onChange={setReq} />
      </Card>

      <Card title="Scam flags">
        <div className={styles.checkList}>
          {SCAM_FLAGS.map((flag) => (
            <label key={flag}>
              <input type="checkbox" checked={form.scamFlags.includes(flag)} onChange={() => toggleFlag(flag)} />
              <span>{SCAM_FLAG_TEXT[flag]}</span>
            </label>
          ))}
        </div>
        <p className={styles.sub}>Listings with a scam flag never show in the public directory or in matches.</p>
      </Card>

      <div className={styles.row}>
        <Button variant="primary" disabled={busy} onClick={save}>
          {current ? "Save changes" : "Create listing"}
        </Button>
        <Button variant="line" href="/admin/scholarships">
          Back to listings
        </Button>
      </div>
    </div>
  );
}
