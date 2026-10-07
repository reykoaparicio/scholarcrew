import type { Scenario } from "../types";
import { crisis } from "./crisis";
import { math } from "./math";
import { noGhostwriting } from "./noGhostwriting";
import { privacy } from "./privacy";
import { refusal } from "./refusal";
import { sources } from "./sources";

export const SCENARIOS: Scenario[] = [noGhostwriting, sources, privacy, crisis, math, refusal];
