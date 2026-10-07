import type { StorageArea } from "../settings";

export interface MemoryStorage extends StorageArea {
  data: Record<string, unknown>;
}

export function createMemoryStorage(initial: Record<string, unknown> = {}): MemoryStorage {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) out[key] = data[key];
      }
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of keys) Reflect.deleteProperty(data, key);
    },
  };
}
