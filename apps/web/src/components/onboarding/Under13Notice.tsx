import { Button, Card } from "@scholarcrew/ui";
import styles from "./onboarding.module.css";

/** ID-03: the plain explanation after the server deactivates an under-13 account. */
export function Under13Notice() {
  return (
    <Card padding="lg">
      <div className={styles.blocked}>
        <h1>ScholarCrew is for students 13 and older</h1>
        <p>
          Because the birth year you entered means you're under 13, we've turned off this account and signed you out.
          Nothing else from setup was saved.
        </p>
        <p>
          If you typed the wrong year, ask a parent, guardian, or school counselor to contact us about this account.
        </p>
        <Button variant="line" href="/">
          Back to the home page
        </Button>
      </div>
    </Card>
  );
}
