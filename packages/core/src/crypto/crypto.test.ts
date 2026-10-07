import { blobs, eq } from "@scholarcrew/db";
import { describe, expect, it } from "vitest";
import { SYSTEM } from "../../test/helpers";
import { createTestDeps } from "../shared";
import {
  assertProductionKeyring,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  parseKeyring,
  randomToken,
  reencryptAll,
  sha256Hex,
} from "./index";

const KEY = parseKeyring({ ENCRYPTION_KEY: "07".repeat(32) });

describe("AES-256-GCM", () => {
  it("round-trips bytes with a 12-byte iv and 16-byte tag", () => {
    const sealed = encrypt(KEY, Buffer.from("first-gen student"));
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(sealed.ciphertext.includes(Buffer.from("first-gen"))).toBe(false);
    expect(decrypt(KEY, sealed).toString("utf8")).toBe("first-gen student");
  });

  it("uses a fresh iv each time", () => {
    const a = encrypt(KEY, Buffer.from("same"));
    const b = encrypt(KEY, Buffer.from("same"));
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it("rejects a tampered tag or the wrong key", () => {
    const sealed = encrypt(KEY, Buffer.from("secret"));
    const badTag = Buffer.from(sealed.tag);
    badTag[0] = (badTag[0] ?? 0) ^ 1;
    expect(() => decrypt(KEY, { ...sealed, tag: badTag })).toThrow();
    expect(() => decrypt(parseKeyring({ ENCRYPTION_KEY: "08".repeat(32) }), sealed)).toThrow();
  });

  it("refuses keys that aren't 32 bytes", () => {
    expect(() => parseKeyring({ ENCRYPTION_KEY: "00".repeat(16) })).toThrow(/32 bytes/);
  });

  it("round-trips JSON values", () => {
    expect(decryptJson(KEY, encryptJson(KEY, ["Mexican American"]))).toEqual(["Mexican American"]);
  });
});

describe("tokens and hashes", () => {
  it("makes base64url tokens of the requested size", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(token);
  });

  it("hashes with sha256 hex", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("key rotation and sealed lengths", () => {
  it("decrypts old ciphertext after rotation and pins the GCM tag length", () => {
    const old = parseKeyring({ ENCRYPTION_KEYS: `1:${"07".repeat(32)}` });
    const next = parseKeyring({ ENCRYPTION_KEYS: `2:${"08".repeat(32)},1:${"07".repeat(32)}` });
    const sealed = encrypt(old, Buffer.from("private"));
    expect(decrypt(next, sealed).toString()).toBe("private");
    expect(encrypt(next, Buffer.from("private")).keyId).toBe(2);
    expect(() => decrypt(next, { ...sealed, tag: Buffer.alloc(4) })).toThrow();
    expect(() => decrypt(next, { ...sealed, iv: Buffer.alloc(4) })).toThrow();
  });
  it("rejects production placeholders", () => {
    expect(() => assertProductionKeyring(KEY)).toThrow(/placeholder/);
  });
});

describe("reencryptAll", () => {
  it("moves stored ciphertext to the primary key without changing plaintext", async () => {
    const deps = createTestDeps();
    const sealed = encrypt(deps.config.keyring, Buffer.from("old private bytes"));
    const [row] = await deps.db.insert(blobs).values(sealed).returning();
    if (!row) throw new Error("expected blob");
    deps.config.keyring = parseKeyring({ ENCRYPTION_KEYS: `2:${"08".repeat(32)},1:${"07".repeat(32)}` });
    expect(await reencryptAll(deps, SYSTEM, { batch: 100 })).toBe(1);
    const [updated] = await deps.db.select().from(blobs).where(eq(blobs.id, row.id));
    if (!updated) throw new Error("expected blob");
    expect(updated.keyId).toBe(2);
    expect(decrypt(deps.config.keyring, updated).toString()).toBe("old private bytes");
    expect(await reencryptAll(deps, SYSTEM, { batch: 100 })).toBe(0);
  });
});
