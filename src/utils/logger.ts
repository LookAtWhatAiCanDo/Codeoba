import { invoke } from "@tauri-apps/api/core";

export const logFE = (level: "info" | "warn" | "error" | "debug" | "trace", message: string) => {
  // Local browser console log
  if (level === "error") {
    console.error(`[FE-ERROR] ${message}`);
  } else if (level === "warn") {
    console.warn(`[FE-WARN] ${message}`);
  } else if (level === "debug") {
    console.debug(`[FE-DEBUG] ${message}`);
  } else if (level === "trace") {
    console.trace(`[FE-TRACE] ${message}`);
  } else {
    console.log(`[FE-INFO] ${message}`);
  }

  // Send to Tauri backend for terminal output with timestamps
  invoke("log_from_frontend", { level, message }).catch((err) => {
    console.error("Failed to send log to backend:", err);
  });
};
