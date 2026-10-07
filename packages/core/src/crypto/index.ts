import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, blobs, eq, isNotNull, ne, notificationPrefs, sensitiveFacts } from "@scholarcrew/db";
import { type Actor, AppError } from "@scholarcrew/domain";
import { assertSystem } from "../access";
import type { CoreDeps } from "../shared";

export type Keyring = { primary: { id: number; key: Buffer }; byId: Map<number, Buffer> };
export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyId: number };

export function parseKeyring(env: { ENCRYPTION_KEYS?: string; ENCRYPTION_KEY?: string }): Keyring {
  const entries = (env.ENCRYPTION_KEYS || `1:${env.ENCRYPTION_KEY ?? ""}`).split(",");
  const byId = new Map<number, Buffer>();
  let primary: Keyring["primary"] | undefined;
  for (const entry of entries) {
    const match = /^(\d+):([a-fA-F0-9]{64})$/.exec(entry.trim());
    if (!match) throw new AppError("internal", "Encryption key must be 32 bytes of hex with a key id");
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1 || id > 32767 || byId.has(id))
      throw new AppError("internal", "Invalid or duplicate encryption key id");
    const key = Buffer.from(match[2] ?? "", "hex");
    byId.set(id, key);
    primary ??= { id, key };
  }
  if (!primary) throw new AppError("internal", "An encryption key is required");
  return { primary, byId };
}
export function assertProductionKeyring(keyring: Keyring): void {
  for (const key of keyring.byId.values()) {
    if (key.every((byte) => byte === key[0]) || key.toString("hex") === "0123456789abcdef".repeat(4)) {
      throw new AppError("internal", "Replace the placeholder encryption key in production");
    }
  }
}
export function encrypt(keyring: Keyring, plaintext: Buffer): Sealed {
  const { id: keyId, key } = keyring.primary;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyId };
}
export function decrypt(keyring: Keyring, parts: Sealed): Buffer {
  const key = keyring.byId.get(parts.keyId);
  if (!key || parts.iv.length !== 12 || parts.tag.length !== 16)
    throw new AppError("internal", "Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, parts.iv, { authTagLength: 16 });
  decipher.setAuthTag(parts.tag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
}
export function encryptJson(keyring: Keyring, value: unknown): Sealed {
  return encrypt(keyring, Buffer.from(JSON.stringify(value), "utf8"));
}
export function decryptJson<T>(keyring: Keyring, parts: Sealed): T {
  return JSON.parse(decrypt(keyring, parts).toString("utf8")) as T;
}

export async function reencryptAll(deps: CoreDeps, system: Actor, o: { batch: number }): Promise<number> {
  assertSystem(system);
  if (!Number.isInteger(o.batch) || o.batch < 1 || o.batch > 1000)
    throw new AppError("invalid_input", "Batch must be 1–1000");
  const primary = deps.config.keyring.primary.id;
  let changed = 0;
  await deps.db.transaction(async (tx) => {
    const facts = await tx
      .select()
      .from(sensitiveFacts)
      .where(and(ne(sensitiveFacts.keyId, primary), isNotNull(sensitiveFacts.ciphertext)))
      .limit(o.batch);
    for (const row of facts) {
      if (!row.ciphertext || !row.iv || !row.tag) throw new AppError("internal", "Incomplete encrypted fact");
      const sealed = encrypt(
        deps.config.keyring,
        decrypt(deps.config.keyring, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyId: row.keyId }),
      );
      changed += (
        await tx
          .update(sensitiveFacts)
          .set(sealed)
          .where(
            and(
              eq(sensitiveFacts.ownerId, row.ownerId),
              eq(sensitiveFacts.kind, row.kind),
              eq(sensitiveFacts.keyId, row.keyId),
            ),
          )
          .returning()
      ).length;
    }
    const files = await tx
      .select()
      .from(blobs)
      .where(ne(blobs.keyId, primary))
      .limit(Math.max(0, o.batch - changed));
    for (const row of files)
      changed += (
        await tx
          .update(blobs)
          .set(encrypt(deps.config.keyring, decrypt(deps.config.keyring, row)))
          .where(and(eq(blobs.id, row.id), eq(blobs.keyId, row.keyId)))
          .returning()
      ).length;
    const phones = await tx
      .select()
      .from(notificationPrefs)
      .where(and(ne(notificationPrefs.phoneKeyId, primary), isNotNull(notificationPrefs.phoneCiphertext)))
      .limit(Math.max(0, o.batch - changed));
    for (const row of phones) {
      if (!row.phoneCiphertext || !row.phoneIv || !row.phoneTag)
        throw new AppError("internal", "Incomplete encrypted phone");
      const sealed = encrypt(
        deps.config.keyring,
        decrypt(deps.config.keyring, {
          ciphertext: row.phoneCiphertext,
          iv: row.phoneIv,
          tag: row.phoneTag,
          keyId: row.phoneKeyId,
        }),
      );
      changed += (
        await tx
          .update(notificationPrefs)
          .set({
            phoneCiphertext: sealed.ciphertext,
            phoneIv: sealed.iv,
            phoneTag: sealed.tag,
            phoneKeyId: sealed.keyId,
          })
          .where(and(eq(notificationPrefs.userId, row.userId), eq(notificationPrefs.phoneKeyId, row.phoneKeyId)))
          .returning()
      ).length;
    }
  });
  return changed;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
