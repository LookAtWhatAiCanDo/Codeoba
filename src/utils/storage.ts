/**
 * Consolidated LocalStorage helpers providing safe fallback, type parsing, and zero redundant reads.
 */

export function getStorageString(key: string, fallback: string = ""): string {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function getStorageBool(key: string, fallback: boolean = false): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return val === "true";
  } catch {
    return fallback;
  }
}

export function getStorageFloat(key: string, fallback: number = 1.0): number {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function getStorageJson<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
