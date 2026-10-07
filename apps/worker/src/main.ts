import { startWorker } from "./app";
import { buildWorkerDeps } from "./deps";
import { errorLabel, log } from "./log";

async function main(): Promise<void> {
  const built = buildWorkerDeps();
  const stop = await startWorker(built, built.boss, built.close);
  log("info", "worker.ready", { fakeModel: built.fakeModel });
  const shutdown = (signal: NodeJS.Signals): void => {
    stop(signal).then(
      () => process.exit(0),
      (e: unknown) => {
        log("error", "worker.stop_failed", { error: errorLabel(e) });
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((e: unknown) => {
  // Config and connection errors name the problem (for example "DATABASE_URL is not set"), never a secret.
  log("error", "worker.start_failed", { error: errorLabel(e), message: e instanceof Error ? e.message : "" });
  process.exit(1);
});
