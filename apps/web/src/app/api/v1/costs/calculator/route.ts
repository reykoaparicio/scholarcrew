import { body, route } from "@/server/http";
import { setCalculatorResult } from "@scholarcrew/core/money";
import { CalculatorResultInput } from "@scholarcrew/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = route({ auth: "user" }, async ({ deps, actor, req }) =>
  setCalculatorResult(deps, actor, await body(req, CalculatorResultInput)),
);
