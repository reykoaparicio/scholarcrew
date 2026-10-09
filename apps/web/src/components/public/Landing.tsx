import { CREW_NAMES, type CrewRole, PLAN_LIMITS } from "@scholarcrew/domain";
import { Button, CrewDot, Eyebrow, Icon, type IconName } from "@scholarcrew/ui";
import styles from "./landing.module.css";

const CREW: Array<{ role: CrewRole; text: string }> = [
  { role: "compass", text: "Plans your week and pulls the crew together" },
  { role: "scout", text: "Finds scholarships you fit and checks each source" },
  { role: "atlas", text: "College lists, deadlines, and requirements" },
  { role: "quill", text: "Essay coach. Asks questions; you write every word" },
  { role: "aid", text: "FAFSA, CSS Profile, and award letters" },
  { role: "ledger", text: "The money math, done by code, not guesses" },
  { role: "prep", text: "ACT and SAT plans, and whether a retake pays" },
  { role: "impact", text: "Service hours and activity descriptions" },
];

const RULES: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "lock", title: "We never sell your data", text: "Not to colleges, lenders, or advertisers" },
  { icon: "dollar", title: "No lender referral fees", text: "We don't get paid when you borrow" },
  { icon: "alert", title: "No sweepstakes", text: 'No "enter to win" and no "guaranteed money"' },
  { icon: "pen", title: "You write every essay", text: "Quill coaches; it never writes for you" },
];

const STEPS = [
  {
    title: "Tell us the basics",
    text: "School, county, grades, interests. Sensitive facts stay off unless you turn them on.",
  },
  {
    title: "Scout finds matches",
    text: "Local and state scholarships, each checked against its source. Scams filtered out.",
  },
  { title: "Compass plans your week", text: "A short list with time estimates, built around your real deadlines." },
  { title: "See the real cost", text: "Ledger shows each school's gap after grants and scholarships." },
];

const PRICES = [
  {
    name: "Free",
    amount: "$0",
    per: "",
    featured: false,
    items: [
      "Matches and your board",
      "Calendar and Story Bank",
      `${PLAN_LIMITS.free.crewRequestsPerMonth} crew requests a month`,
    ],
    cta: "Start free",
  },
  {
    name: "Family plan",
    amount: "$12",
    per: " / month",
    featured: true,
    items: [
      "1 student, up to 2 parents",
      `${PLAN_LIMITS.family.crewRequestsPerMonth} crew requests a month`,
      "Family room, award letters",
    ],
    cta: "Try the Family plan",
  },
  {
    name: "Season pass",
    amount: "$79",
    per: " once",
    featured: false,
    items: [
      "August through May",
      `${PLAN_LIMITS.season_pass.crewRequestsPerMonth} crew requests a month`,
      "Doesn't renew on its own",
    ],
    cta: "Get the season pass",
  },
];

export function Landing() {
  return (
    <div className={styles.land}>
      <section className={styles.hero}>
        <div>
          <Eyebrow>For high school students and the parents helping them</Eyebrow>
          <h1 className={styles.title}>A crew of specialists for paying for college</h1>
          <p className={styles.lead}>
            Find local scholarships you actually qualify for, write your own essays with a coach who asks good
            questions, and see what each college will really cost you.
          </p>
          <div className={styles.ctaRow}>
            <Button variant="primary" iconEnd="arrow" href="/sign-in">
              Start free
            </Button>
            <Button variant="line" href="/directory">
              Browse scholarships by state
            </Button>
          </div>
          <p className={styles.fine}>Free for students · no credit card · for ages 13 and up</p>
        </div>
        <div className={styles.crewCard}>
          <div className={styles.cardHead}>
            <h2 className={styles.h3}>Meet your crew</h2>
            <span className={styles.muted}>Each one sticks to its job</span>
          </div>
          <ul className={styles.crewGrid}>
            {CREW.map((c) => (
              <li key={c.role}>
                <b>
                  <CrewDot role={c.role} />
                  {CREW_NAMES[c.role]}
                </b>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.rules} aria-label="Product rules">
        {RULES.map((r) => (
          <div key={r.title}>
            <Icon name={r.icon} />
            <div>
              <b>{r.title}</b>
              <span>{r.text}</span>
            </div>
          </div>
        ))}
      </section>

      <div className={styles.bottom}>
        <section id="how" aria-labelledby="how-h">
          <div className={styles.secHead}>
            <h2 id="how-h">How it works</h2>
            <span className={styles.muted}>About 6 minutes to set up</span>
          </div>
          <ol className={styles.how}>
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <b>
                  <span className={styles.n}>{i + 1}</span>
                  {s.title}
                </b>
                {s.text}
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" aria-labelledby="pricing-h">
          <div className={styles.secHead}>
            <h2 id="pricing-h">Pricing</h2>
            <span className={styles.testp}>Test prices · not final</span>
          </div>
          <div className={styles.prices}>
            {PRICES.map((p) => (
              <div key={p.name} className={p.featured ? `${styles.price} ${styles.feat}` : styles.price}>
                <h3>{p.name}</h3>
                <div className={styles.amt}>
                  {p.amount}
                  {p.per ? <small>{p.per}</small> : null}
                </div>
                <ul>
                  {p.items.map((item) => (
                    <li key={item}>
                      <Icon name="check" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button variant={p.featured ? "primary" : "line"} href="/sign-in" className={styles.planCta}>
                  {p.cta}
                </Button>
              </div>
            ))}
          </div>
          <p className={styles.fine}>
            Paying for a plan never unlocks anyone else's private data. Students choose what their family sees.
          </p>
        </section>
      </div>
    </div>
  );
}
