// Failed writes remain usable in this session, but never count as durable saves.
export function createStorage(getPersistentStorage) {
  const memory = new Map();
  const pending = new Set();
  return {
    available: true,
    getItem(key) {
      if (pending.has(key)) return memory.get(key) ?? null;
      try {
        const value = getPersistentStorage().getItem(key);
        if (value !== null) memory.set(key, value);
        return value;
      } catch {
        this.available = false;
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      const serialized = String(value);
      memory.set(key, serialized);
      try {
        getPersistentStorage().setItem(key, serialized);
        pending.delete(key);
        this.available = pending.size === 0;
      } catch {
        pending.add(key);
        this.available = false;
        throw new Error('Persistent storage unavailable');
      }
    },
  };
}

export const storage = createStorage(() => window.localStorage);
