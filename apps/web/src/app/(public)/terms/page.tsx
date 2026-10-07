import { LegalPage, type LegalSection } from "@/components/public/LegalPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of use · ScholarCrew",
  description:
    "The rules for using ScholarCrew: accounts, your content, academic integrity, plans, and acceptable use.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "using",
    title: "Using ScholarCrew",
    body: (
      <p>
        By creating an account or using the public pages, you agree to these terms. If you don't agree, don't use
        ScholarCrew. If you're under 18, read these with a parent or guardian.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    body: (
      <ul>
        <li>You must be 13 or older. One person per account; parents use their own accounts.</li>
        <li>You sign in with a one-time email link. Keep your email account secure, because it's your key.</li>
        <li>Sign out on shared computers.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <p>
        You own what you write and upload. You give us permission to store and process it only to run ScholarCrew for
        you and the people you choose to share with. When you delete something, we stop using it.
      </p>
    ),
  },
  {
    id: "integrity",
    title: "Academic integrity",
    body: (
      <ul>
        <li>You write every essay. Quill asks questions and leaves comments; it never writes essays for you.</li>
        <li>Don't submit text the crew wrote as your own work, and don't ask the crew to write it.</li>
        <li>Nothing is submitted for you. You send every application, form, and essay yourself.</li>
      </ul>
    ),
  },
  {
    id: "guidance",
    title: "Guidance, not guarantees",
    body: (
      <p>
        Scholarship listings carry a source and the date we last checked them, but sponsors change details. Always
        confirm deadlines and rules on the sponsor's own page. Cost and offer math are estimates from the numbers you
        give us. ScholarCrew isn't financial, legal, or admissions advice, and there's no guaranteed money.
      </p>
    ),
  },
  {
    id: "plans",
    title: "Plans and payments",
    body: (
      <ul>
        <li>
          The Free plan includes a monthly number of crew requests. Paid plans add more requests and family features.
        </li>
        <li>Prices shown today are test prices and may change before launch. We'll show the price before you pay.</li>
        <li>Payments go through Stripe. A Family plan renews monthly until you cancel; a Season pass doesn't renew.</li>
        <li>Paying for a plan never unlocks anyone else's private data.</li>
      </ul>
    ),
  },
  {
    id: "acceptable",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Don't scrape the site, overload it, or get around rate limits.</li>
        <li>Don't use someone else's account, helper link, or invite.</li>
        <li>Don't post other people's private information, or anything illegal, hateful, or harassing.</li>
        <li>Don't use ScholarCrew to send spam or to run scholarship scams.</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "Family and helper links",
    body: (
      <p>
        Students control what family members and helpers see. Invites and helper links are for the person they were sent
        to. Students can remove a parent or turn off a helper link at any time.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Ending your account",
    body: (
      <p>
        You can delete your account at any time from Settings. We may suspend an account that breaks these terms or puts
        other users at risk, and we'll tell you why when we can.
      </p>
    ),
  },
  {
    id: "limits",
    title: "Disclaimers and limits",
    body: (
      <p>
        We work hard to keep ScholarCrew accurate and available, but we provide it as is. To the extent the law allows,
        we aren't responsible for missed deadlines, award decisions, or costs that differ from our estimates.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: <p>We'll post changes here and email you before changes that matter. Questions: help@scholarcrew.example.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 6, 2026"
      intro="The short version: be 13 or older, write your own work, check details with each sponsor, and don't misuse the site."
      sections={SECTIONS}
    />
  );
}
