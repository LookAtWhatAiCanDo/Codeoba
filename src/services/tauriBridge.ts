import { invoke } from "@tauri-apps/api/core";
import { logFE } from "../utils/logger";
import { getLocalizedAppError } from "../utils/errorHelper";

/**
 * Open a local file or directory in the system file manager (Finder / File Explorer).
 */
export async function revealInFolder(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    await invoke("reveal_in_folder", { path });
    return true;
  } catch (err) {
    logFE("error", `Failed to reveal path in folder (${path}): ${err}`);
    return false;
  }
}

/**
 * Safely invoke a Tauri backend command with unified error logging and localized error payload resolution.
 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  t?: (key: string, params?: Record<string, string | number>) => string
): Promise<[T | null, string | null]> {
  try {
    const result = await invoke<T>(command, args);
    return [result, null];
  } catch (err: any) {
    const localizedErr = t ? getLocalizedAppError(err, t) : String(err?.message || err);
    logFE("error", `IPC Command '${command}' failed: ${localizedErr}`);
    return [null, localizedErr];
  }
}
