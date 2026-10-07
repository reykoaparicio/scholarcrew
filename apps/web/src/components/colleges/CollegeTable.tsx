"use client";

import { cx } from "@/lib/cx";
import { dateShort, usd } from "@/lib/format";
import type { CollegeListEntry } from "@scholarcrew/domain";
import { Button, Icon, Progress, Table } from "@scholarcrew/ui";
import { useState } from "react";
import { AddCollegeModal } from "./AddCollegeModal";
import { CONTROL_LABEL, FIT_LABEL, PLAN_LABEL, checklistLabel, outsidePolicyView, testPolicyLabel } from "./colleges";
import styles from "./colleges.module.css";

/** Mockup 05 table. The school name opens the detail drawer page. */
export function CollegeTable({ entries, selectedId }: { entries: CollegeListEntry[]; selectedId?: string }) {
  return (
    <Table
      caption="Your college list"
      rows={entries}
      rowKey={(e) => e.id}
      selectedKey={selectedId}
      columns={[
        {
          key: "school",
          header: "School",
          render: (e) => (
            <>
              <a className={styles.school} href={`/colleges/${e.id}`}>
                {e.college.name}
              </a>
              <div className={styles.sub}>{`${FIT_LABEL[e.fit]} · ${CONTROL_LABEL[e.college.control]}`}</div>
            </>
          ),
        },
        {
          key: "deadline",
          header: "Deadline",
          render: (e) => (
            <>
              <div>{e.deadline ? dateShort(e.deadline) : "Rolling"}</div>
              <div className={styles.sub}>{PLAN_LABEL[e.plan]}</div>
            </>
          ),
        },
        {
          key: "checklist",
          header: "Checklist",
          render: (e) => (
            <div className={styles.meter}>
              <Progress
                value={e.itemsTotal === 0 ? 0 : e.itemsDone / e.itemsTotal}
                label={`${e.college.name} checklist`}
              />
              <span>{checklistLabel(e.itemsDone, e.itemsTotal)}</span>
            </div>
          ),
        },
        { key: "tests", header: "Tests", render: (e) => testPolicyLabel(e.testPolicy, null) },
        {
          key: "gap",
          header: "Gap / yr",
          align: "right",
          render: (e) => (e.gapUsd === null ? "Not estimated" : usd(e.gapUsd)),
        },
        {
          key: "outside",
          header: "Outside scholarships",
          render: (e) => {
            const view = outsidePolicyView(e.outsidePolicy);
            return (
              <span className={cx(styles.policy, styles[view.tone])}>
                <Icon name={view.icon} />
                {view.text}
              </span>
            );
          },
        },
      ]}
    />
  );
}

export function AddCollegeButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="line" icon="plus" onClick={() => setOpen(true)}>
        Add a school
      </Button>
      <AddCollegeModal open={open} count={count} onClose={() => setOpen(false)} />
    </>
  );
}
