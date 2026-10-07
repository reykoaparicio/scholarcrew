import { HelperUnavailable } from "@/components/public/HelperSheet";

export default function HelperLinkNotFound() {
  return (
    <HelperUnavailable title="This link has expired or was turned off">
      Helper links stop working when they expire or when the student turns them off. Ask the student to send you a new
      one.
    </HelperUnavailable>
  );
}
