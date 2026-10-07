import { instantShort, safeHref } from "@/lib/format";
import type { ReceiptItem } from "@scholarcrew/domain";
import { Icon } from "@scholarcrew/ui";
import styles from "./crew.module.css";

/** CR-04: "What the team used", with verified dates for catalog items. */
export function Receipt({ items, timeZone }: { items: ReceiptItem[]; timeZone: string }) {
  if (items.length === 0) return null;
  return (
    <details className={styles.receipt} open>
      <summary className={styles.receiptTitle}>
        <span>What the team used</span>
        <Icon name="chev" />
      </summary>
      <ul>
        {items.map((item) => (
          <li key={`${item.kind}:${item.label}:${item.refId ?? ""}`}>
            <span>
              {item.verifiedAt ? `${item.label}, verified ${instantShort(item.verifiedAt, timeZone)}` : item.label}
            </span>
            {safeHref(item.sourceUrl) ? (
              <>
                {" · "}
                <a href={safeHref(item.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
                  source
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
