import { Landing } from "@/components/public/Landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScholarCrew · A crew for paying for college",
  description:
    "Find local scholarships you qualify for, write your own essays with a coach, and see what each college will really cost. We never sell student data.",
};

export default function LandingPage() {
  return <Landing />;
}
