import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · ScholarCrew",
  description:
    "What ScholarCrew collects, how it's used, who can see it, and how long we keep it. We never sell student data.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "covers",
    title: "Who we are and what this covers",
    body: (
      <p>
        ScholarCrew is a website that helps high school students and their families plan scholarships, essays,
        applications, and the cost of college. This policy covers the website, the public scholarship directory, the
        offer tool, helper links, and the browser extension.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          Account: your email address, display name, birth year, and time zone, plus a mobile number if you turn on text
          reminders. There's no password.
        </li>
        <li>Profile: school, state, county, city, class year, GPA, intended majors, and interests.</li>
        <li>
          Your work: stories, essay drafts, activities, service hours, test scores, your college list, cost estimates,
          and award letter lines.
        </li>
        <li>Documents you upload, like award letters and transcripts. Files are encrypted before we store them.</li>
        <li>Crew chats and the decisions you ask the crew to remember.</li>
        <li>Usage and security records: how many crew requests you make, sign-ins, and an audit log of key changes.</li>
      </ul>
    ),
  },
  {
    id: "sensitive",
    title: "Sensitive facts",
    body: (
      <>
        <p>
          Some scholarships ask about first-generation status, income range, heritage, disability, religion, military
          family, foster care, or citizenship. These facts are off by default. You turn each one on yourself.
        </p>
        <ul>
          <li>They're encrypted with AES-256-GCM.</li>
          <li>
            Only the scholarship matcher reads them, to check eligibility rules. They're never sent to an AI model.
          </li>
          <li>
            Matches that use these details are visible only to you. Family members and models never see their names or
            reasons.
          </li>
          <li>You can turn any of them off at any time, and the matcher stops using them right away.</li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use your information",
    body: (
      <p>
        We use it to run the features you ask for: matching scholarships, planning your week, coaching essays, comparing
        offers, reminders, and email. We use security records to stop abuse, like rate limits on sign-in links. We don't
        use your information for advertising, and we don't build profiles to sell.
      </p>
    ),
  },
  {
    id: "never",
    title: "What we never do",
    body: (
      <ul>
        <li>We never sell student data, to colleges, lenders, advertisers, or anyone else.</li>
        <li>We don't take referral fees from lenders, and we don't run sweepstakes or "guaranteed money" offers.</li>
        <li>We don't use third-party analytics, ad trackers, or session recording on any page.</li>
        <li>We never ask for your passwords to other sites, like StudentAid.gov or a college portal.</li>
      </ul>
    ),
  },
  {
    id: "who",
    title: "Who can see your information",
    body: (
      <ul>
        <li>You.</li>
        <li>
          Family members you invite, one category at a time. Deadlines, colleges, costs, scholarships, and activities
          are shared by default; essays, chats, stories, and sensitive facts stay private unless you share them. You can
          change this any time.
        </li>
        <li>
          Helpers you send a link to, like a teacher writing a recommendation. A helper link is read-only, shows only
          the categories you pick, never includes essays, chats, costs, or sensitive facts, lasts at most 90 days, and
          stops working the moment you turn it off.
        </li>
        <li>
          Service providers that run parts of ScholarCrew for us, and only for that: our hosting and database provider,
          Anthropic (the AI model), Stripe (payments), Resend (email), and Twilio (text messages).
        </li>
        <li>If you turn on text reminders, we send your phone number and the reminder to Twilio to deliver it.</li>
        <li>Our staff, only to keep the service running and secure, or when the law requires it.</li>
      </ul>
    ),
  },
  {
    id: "minors",
    title: "Ages 13 and up",
    body: (
      <p>
        You must be 13 or older to use ScholarCrew. We ask for your birth year when you set up your account. If you'd be
        under 13 this year, we can't open an account, and we deactivate it and delete what was entered. If you're under
        13, we delete the account and everything in it within 7 days. Students aged 13 to 17 choose whether to invite a
        parent; parents see only what the student shares.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Temporary chats: deleted after 24 hours.</li>
        <li>Sign-in links: expire after 15 minutes and are deleted after 1 day.</li>
        <li>Data exports: the download is deleted after 24 hours.</li>
        <li>Deleted accounts: sign-ins stop at once, and your data is purged within 7 days.</li>
        <li>Facts the crew suggests but you haven't confirmed: removed after 30 days.</li>
        <li>Sessions: you stay signed in for up to 30 days.</li>
        <li>
          Family invites expire after 7 days; supervisor confirmation links after 14 days; helper links after at most 90
          days.
        </li>
        <li>Everything else: until you delete it or delete your account.</li>
      </ul>
    ),
  },
  {
    id: "controls",
    title: "Your controls",
    body: (
      <ul>
        <li>See, edit, or forget anything the crew remembers about you, on the Memory page.</li>
        <li>Download everything you own as JSON and Markdown from Settings.</li>
        <li>Delete your account from Settings.</li>
        <li>Change family sharing per category, and turn off helper links, at any time.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Sign-in uses one-time email links instead of passwords. Sensitive facts and uploaded files are encrypted. We
        limit how often sign-in links, crew requests, uploads, and public tools can be used, and we log admin edits,
        sharing changes, exports, deletions, and helper-link use.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We'll post changes on this page and email you before any change that affects how your information is used.
        Questions: privacy@scholarcrew.example.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 6, 2026"
      intro="The short version: we collect what the crew needs to help you, we never sell it, sensitive facts are off unless you turn them on, and you can export or delete everything."
      sections={SECTIONS}
    />
  );
}
