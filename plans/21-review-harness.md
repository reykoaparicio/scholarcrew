# Plan 21: Review harness (Agent U)

This file defines how plan files are written, how they're reviewed before any code exists, and how each plan is audited after it's built. It owns no source files.

## 1. Plan file format

Every numbered plan file (`01`–`20`) has these sections, in this order:

1. **Title:** `# Plan NN: <Subsystem> (Agent <Letter>)`, then one paragraph saying what the subsystem is for and which feature IDs from `docs/product/features.md` it implements.
2. **Files:** exact paths under `Create:`, `Modify:` (with line ranges when the file already exists), and `Test:`. Every path must be owned by this plan in `00-overview.md` section 5.
3. **Tasks:** `### <Letter><n>: <Task name>`. Every task follows the TDD cycle with checkbox steps:
   - Step 1: write the failing test (complete test code).
   - Step 2: run it and see it fail (exact command and the expected failure message).
   - Step 3: write the implementation (complete code for every file touched).
   - Step 4: run it and see it pass (exact command and expected result).
   - Step 5: commit (exact `git add` paths and message).

   Config-only tasks (package.json, tsconfig) replace steps 1–2 with "run `pnpm install` and see the package link", but still end with a passing command and a commit.
4. **Success Criteria:** the gate, as commands that exit 0. Always includes the package's `typecheck` and `test`, and `pnpm lint`.
5. **Testing Requirements:** what the tests prove, the exact command, and the expected outcome.
6. **Review Checklist:** what a reviewer must confirm for this plan specifically.

## 2. Rules for drafters

- **Exclusive ownership.** Only create or modify files your plan owns in `00-overview.md` section 5. If you need something from a file you don't own, import it through the contract in section 9. If the contract lacks it, write the gap in your final report instead of adding the file.
- **Contracts are fixed.** Export exactly the names and signatures in `00-overview.md` section 9. You may add extra internal helpers; you may not rename, drop, or change contract signatures.
- **Domain types come from `@scholarcrew/domain`** (`plans/02-domain.md` has the full code). Never redefine a domain type locally.
- **Complete code.** Every step that changes code shows all of it. No "TBD", "TODO", "implement later", "add error handling", "similar to Task N", "etc." in code, or ellipses standing in for code. If two tasks need the same code, repeat it.
- **Tests prove behavior.** Authorization (owner, family share, helper scope, admin), edge cases (empty, zero, null, limits, expiry, duplicates, idempotency), and every acceptance criterion your plan implements. Use the DB test helpers and factories from `@scholarcrew/db/testing` for anything that touches Postgres, and `createTestDeps()` from `@scholarcrew/core/shared` for services.
- **Commands are exact.** `pnpm --filter <package> test`, `pnpm --filter <package> typecheck`, `pnpm lint`. Expected output is stated ("PASS, 12 tests" or "FAIL with `Cannot find module './x'`").
- **No secrets, no network in tests.** Model calls use `createScriptedModelClient`; Stripe uses a fake `StripeGateway`; email uses `devOutboxEmailSender`; HTTP fetches use injected fakes.
- **Prose is short and plain.** Contractions are fine. No filler, no marketing words, no em-dash chains. Code carries the detail.
- **Large files:** write the plan file in parts if needed (create it, then append sections), but the final file must be one complete document.
- **Report back** (under 200 words): the plan file path, the task list (IDs and names), the feature IDs covered, and any contract gaps or deviations with the exact name involved.

## 3. Review rounds (before execution)

Run 5 rounds. Each round launches 2 or 3 read-only reviewers, each assigned a set of plan files. Reviewers compare plan files against `00-overview.md`, `02-domain.md`, `docs/product/features.md`, and each other, and report concrete defects only.

| Round | Focus |
|---|---|
| 1 | Data flow: table and column names match section 8; domain schema names and fields match 02; function names and signatures match section 9; imports point at exported names. |
| 2 | Data flow end to end: trace each API route (section 10) from route handler → core service → db → domain object → page component, and each job from enqueue → worker → agents/catalog → core → notification. |
| 3 | Output and format: response shapes, status codes, error codes, JSON field names, date/money formatting, null handling, defaults, SSE format. |
| 4 | Edge cases and security: missing data, zero values, expiry, duplicates, idempotency, authorization on every service, family share categories, helper scopes, sensitive facts never reaching a model, rate limits, CSRF origin checks. |
| 5 | Completeness and integration: every feature ID in features.md has at least one task; every file in section 5 is created by its owner; no placeholders; gates are runnable; plans compose in the phase order of section 7. |

A defect report has `planFile`, `detail` (what's wrong, with the task ID or quoted line), and `severity` (high: would break the build or a contract; medium: wrong behavior; low: unclear). After each round, the owning plan file is patched in place. Stop early after 2 consecutive rounds with no high or medium defects.

## 4. Execution loop (after approval)

Plans run in the phase order of `00-overview.md` section 7. Plans in the same phase may run in parallel because they own disjoint files.

For each plan file:

1. Implement every task in order (fresh context: only this plan file, `00-overview.md`, `02-domain.md`, and git history).
2. Run `pnpm format` (Biome fixes import order and formatting), then the gate from the plan's Success Criteria. If it fails, fix and re-run. Don't move on with a red gate.
3. Commit.
4. Adversarial audit:
   - **Bug Hunter** reads the diff and the plan file and lists bugs, missed requirements, regressions, and security problems with evidence (10 points per confirmed bug).
   - **Defender** tries to disprove each finding with evidence (10 points per disproven finding).
   - **Referee** reads both and outputs the confirmed list.
5. Fix only confirmed bugs, re-run the gate, commit.
6. Mark the plan `done` in `00-overview.md` section 15.

When a phase finishes, the integrator runs `pnpm install` once, commits `pnpm-lock.yaml`, and runs the applicable milestone checks in `00-overview.md` section 13. The full suite is run after phase 10; earlier phases cannot build pages or run tests whose owners have not created them.

## 5. Final verification

After plan 20:

```bash
pnpm install
docker compose up -d db && pnpm db:wait && pnpm db:migrate && pnpm db:migrate:test
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @scholarcrew/web build
pnpm e2e
```

All must exit 0. Then run the model evals once against the real API (`pnpm evals`, plan 19) and attach the generated report (`evals/reports/<timestamp>.md`, git-ignored) to the release notes. Evals don't gate the build, but a failing safety eval (ghostwriting, cross-family leakage, sensitive facts in prompts) blocks release.

## Success Criteria

- [ ] Every plan file 01–20 contains the six sections in section 1.
- [ ] A placeholder scan of embedded implementation/test blocks finds no unfinished code. Review-checklist commands that themselves search for placeholder words are excluded.
- [ ] Review rounds recorded in `plans/review-log.md` with findings and fixes per round.

## Review Checklist

- [ ] The ownership table in `00-overview.md` section 6 matches section 5.
- [ ] The dependency graph has no cycles and matches what each plan imports.
