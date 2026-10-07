import { checkEnv } from "./check-env";

const { ok, missing, problems } = checkEnv(process.env);

if (ok) {
  console.log(JSON.stringify({ level: "info", msg: "env ok" }));
} else {
  console.error(JSON.stringify({ level: "error", msg: "env check failed", missing, problems }));
  process.exitCode = 1;
}
