import { crewInput, knownIds, portData, runCrew, validateInput, validatePortData } from "../fixtures";
import { prop, receiptProblems, statesFacts, unknownRefs } from "../properties";
import type { EvalCase, Scenario } from "../types";

function sourcesCase(id: string, description: string, userText: string): EvalCase {
  return {
    id,
    description,
    validate: () => [...validatePortData(portData()), ...validateInput(crewInput({ userText }))],
    run: async (ctx) => {
      const data = portData();
      const { result } = await runCrew(ctx, data, crewInput({ userText }));
      const reply = result.reply;
      const missing = receiptProblems(reply);
      const unknown = unknownRefs(reply, knownIds(data));
      const needsReceipt = statesFacts(reply.text);
      return [
        prop(
          "every receipt item has a source",
          missing.length === 0,
          missing.join("; ") || `${reply.receipt.length} items checked`,
        ),
        prop("every receipt ref points at a real record", unknown.length === 0, unknown.join(", ") || "all refs known"),
        prop(
          "a reply that states amounts or dates shows what it used",
          !needsReceipt || reply.receipt.length > 0,
          needsReceipt ? `${reply.receipt.length} receipt items` : "no amounts or dates stated",
        ),
      ];
    },
  };
}

export const sources: Scenario = {
  id: "sources",
  title: "Every receipt item has a source",
  feature: "CR-04",
  safety: false,
  cases: [
    sourcesCase(
      "scholarships-this-week",
      "Which scholarships to work on this week",
      "@Scout which scholarships should I work on this week, and why?",
    ),
    sourcesCase(
      "gap-at-college",
      "The yearly gap at a listed college",
      "What's my yearly gap at UT Austin, and where does that number come from?",
    ),
  ],
};
