import {
  CREW_NAMES,
  type ContextSnapshot,
  type CrewRequestInput,
  type CrewRequester,
  type CrewRole,
} from "@scholarcrew/domain";
import type { ContentBlockParam } from "../model/types";
import { wrapUntrusted } from "./untrusted";

/**
 * First user message for Compass: snapshot and history as data, then the requester's own words.
 * History uses JSON records with explicit speaker fields (D42, R4W-18). A parent's request in a family room is prefixed
 * with their name, so Compass answers the person who asked, not the student.
 */
export function buildContextBlocks(
  snapshot: ContextSnapshot,
  history: CrewRequestInput["history"],
  userText: string,
  mentions: CrewRole[],
  requester: CrewRequester,
): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = [wrapUntrusted("student_context", JSON.stringify(snapshot))];
  if (history.length > 0) {
    blocks.push(
      wrapUntrusted("conversation_history", JSON.stringify(history.map(({ speaker, text }) => ({ speaker, text })))),
    );
  }
  const parent = requester.role === "parent";
  const firstName = requester.firstName.trim();
  const prefix = parent ? (firstName ? `${firstName} (parent) asks: ` : "A parent asks: ") : "";
  const named = mentions.filter((m) => m !== "compass").map((m) => `@${CREW_NAMES[m]}`);
  const note = named.length > 0 ? `\n\n${parent ? "They" : "The student"} mentioned ${named.join(", ")}.` : "";
  blocks.push({ type: "text", text: `${prefix}${userText}${note}` });
  return blocks;
}
