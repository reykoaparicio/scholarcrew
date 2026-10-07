import type { Effort, SpecialistRole } from "@scholarcrew/domain";
import type { CrewDataPort } from "../context";
import type { ToolDef } from "../model/types";
import { SPECIALIST_PROMPTS } from "./prompts";
import { specialistTools } from "./tools";

export interface SpecialistDef {
  role: SpecialistRole;
  system: string;
  effort: Effort;
  tools(port: CrewDataPort, ownerId: string, audience: "crew" | "family"): ToolDef[];
}

function define(role: SpecialistRole): SpecialistDef {
  return {
    role,
    system: SPECIALIST_PROMPTS[role],
    effort: "medium",
    tools: (port, ownerId, audience) => specialistTools(role, port, ownerId, audience),
  };
}

export const SPECIALISTS: Record<SpecialistRole, SpecialistDef> = {
  scout: define("scout"),
  atlas: define("atlas"),
  quill: define("quill"),
  aid: define("aid"),
  ledger: define("ledger"),
  prep: define("prep"),
  impact: define("impact"),
};
