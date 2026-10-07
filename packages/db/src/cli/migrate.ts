import { runMigrations } from "../migrate";
import { testDatabaseUrl } from "../testing/env";

const target = process.argv.includes("--test") ? "test" : "dev";
const url = target === "test" ? testDatabaseUrl() : process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ level: "error", msg: "DATABASE_URL is not set", target }));
  process.exit(1);
}

await runMigrations(url);
console.log(JSON.stringify({ level: "info", msg: "migrations applied", target }));
