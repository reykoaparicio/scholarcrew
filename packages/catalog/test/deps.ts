import { getTestDb } from "@scholarcrew/db/testing";
import {
  createFakeBatchGateway,
  createFakeExtractModel,
  createFakeFetchPage,
  createFakeResearcher,
} from "../src/testing";
import type { CatalogDeps } from "../src/types";

export const NOW = new Date("2026-10-06T15:00:00.000Z");
const DAY_MS = 86_400_000;

export function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

/** CatalogDeps over the test database with inert fakes. Override what a test needs. */
export function testDeps(o: Partial<CatalogDeps> = {}): CatalogDeps {
  return {
    db: getTestDb(),
    model: createFakeExtractModel([]),
    fetchPage: createFakeFetchPage({}),
    anthropicBatches: createFakeBatchGateway(),
    researcher: createFakeResearcher([]),
    now: () => NOW,
    allowedDomains: [],
    ...o,
  };
}
