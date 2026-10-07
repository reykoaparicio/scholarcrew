import { createDb } from "../client";
import { SEED_EMAILS, seedDev } from "../seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ level: "error", msg: "DATABASE_URL is not set" }));
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error(JSON.stringify({ level: "error", msg: "Refusing to seed with NODE_ENV=production" }));
  process.exit(1);
}

const { db, close } = createDb(url, { max: 1 });
try {
  await seedDev(db);
  console.log(
    JSON.stringify({ level: "info", msg: "seeded fictional sample data", users: Object.values(SEED_EMAILS) }),
  );
} finally {
  await close();
}
