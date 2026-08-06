// Persistência local namespacada por caso: `sip:<casoId>:`.

const prefix = (casoId: string) => `sip:${casoId}:`;

function read<T>(casoId: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefix(casoId) + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(casoId: string, key: string, value: unknown): void {
  try {
    localStorage.setItem(prefix(casoId) + key, JSON.stringify(value));
  } catch {
    // armazenamento indisponível — ignora
  }
}

// ---------- sessão desbloqueada ----------
export function isUnlocked(casoId: string): boolean {
  return read(casoId, "unlocked", false);
}

export function setUnlocked(casoId: string, value: boolean): void {
  write(casoId, "unlocked", value);
}

// ---------- reset ----------
export function resetAll(casoId: string): void {
  try {
    const p = prefix(casoId);
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(p)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignora
  }
}
