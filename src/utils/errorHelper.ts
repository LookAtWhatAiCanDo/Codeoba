// App error codes.
// IMPORTANT: These codes must remain synchronized with the ones defined in the Rust backend at:
// `src-tauri/src/commands.rs`

// Authentication & Licensing (1000 - 1009)
export const ERR_TOKEN_MISSING = 1001;
export const ERR_LICENSE_INACTIVE = 1002;

// Network & Server Connections (1010 - 1029)
export const ERR_CLIENT_BUILD = 1011;
export const ERR_MANIFEST_FETCH_CONNECTION = 1012;
export const ERR_MANIFEST_SERVER_ERROR = 1013;
export const ERR_MANIFEST_PARSE = 1014;
export const ERR_WASM_DOWNLOAD_CONNECTION = 1015;
export const ERR_WASM_SERVER_ERROR = 1016;
export const ERR_WASM_READ_BODY = 1017;

// Cryptography & Integrity (1030 - 1049)
export const ERR_INTEGRITY_FAILED = 1031;
export const ERR_SIGNATURE_FAILED = 1032;

// Local Filesystem & Storage (1050 - 1069)
export const ERR_DIR_CREATE = 1051;
export const ERR_FILE_WRITE = 1052;
export const ERR_MANIFEST_SERIALIZE = 1053;
export const ERR_MANIFEST_WRITE = 1054;

// General/Session Errors (2000 - 2099)
export const ERR_SOURCE_NOT_FOUND = 2001;
export const ERR_SESSION_READ_LOCK = 2002;

// Search & Index Errors (2100 - 2199)
export const ERR_ONNX_NOT_FOUND = 2101;
export const ERR_EMBEDDER_CREATION = 2102;
export const ERR_EMBEDDINGS_GENERATION = 2103;
export const ERR_INDEX_REBUILD_FAILED = 2104;

// File Preview & Permissions (2200 - 2299)
export const ERR_FILE_TOO_LARGE = 2201;
export const ERR_BINARY_FILE_PREVIEW = 2202;
export const ERR_PERMISSION_DENIED = 2203;
export const ERR_EXTERNAL_CONFIRMATION_REQUIRED = 2204;
export const ERR_METADATA_READ = 2205;
export const ERR_FILE_READ_FAILED = 2206;
export const ERR_EXTERNAL_OPEN_FAILED = 2207;

// Group Management Errors (2300 - 2399)
export const ERR_GROUP_LOCK = 2301;
export const ERR_GROUP_DB_ERROR = 2302;

// Auth Server Errors (2400 - 2499)
export const ERR_AUTH_SERVER_START = 2401;

// Generic Fallbacks
export const ERR_GENERIC = 2999;

/**
 * Extracts the numeric error code from a backend error payload or number.
 * 
 * @param err The error payload returned from the backend (number or object)
 * @returns The parsed numeric error code
 */
export const getAppErrorCode = (err: any): number => {
  if (err && typeof err === "object" && "code" in err) {
    return Number(err.code);
  }
  return typeof err === "number" ? err : ERR_GENERIC;
};

/**
 * Maps structured backend error codes to localized translation keys.
 * 
 * @param err The error code or object returned from the backend (Tauri's invoke promise rejection)
 * @param t The translation function from the localization provider
 * @returns The localized error string to display in the UI
 */
export const getLocalizedAppError = (err: any, t: (key: string, params?: Record<string, string | number>) => string): string => {
  if (!err) return "";
  
  if (typeof err === "string") {
    // If it's a raw string error from legacy backend code or system, return it directly.
    return err;
  }

  const isObj = err && typeof err === "object";
  const code = getAppErrorCode(err);
  const status = isObj && "status" in err ? err.status : undefined;
  const message = isObj && "message" in err ? err.message : undefined;

  const params = {
    status: status !== undefined ? String(status) : "",
    message: message !== undefined ? String(message) : "",
    error: message !== undefined ? String(message) : "",
    reason: message !== undefined ? String(message) : ""
  };

  switch (code) {
    // Authentication & Licensing (1000 - 1009)
    case ERR_TOKEN_MISSING:
      return t("settings.subscription.errors.tokenMissing", params);
    case ERR_LICENSE_INACTIVE:
      return t("settings.subscription.errors.licenseInactive", params);

    // Network & Server Connections (1010 - 1029)
    case ERR_CLIENT_BUILD:
      return t("settings.subscription.errors.clientBuildFailed", params);
    case ERR_MANIFEST_FETCH_CONNECTION:
      return t("settings.subscription.errors.manifestFetchFailed", params);
    case ERR_MANIFEST_SERVER_ERROR:
      return t("settings.subscription.errors.manifestServerError", params);
    case ERR_MANIFEST_PARSE:
      return t("settings.subscription.errors.manifestParseFailed", params);
    case ERR_WASM_DOWNLOAD_CONNECTION:
      return t("settings.subscription.errors.wasmDownloadFailed", params);
    case ERR_WASM_SERVER_ERROR:
      return t("settings.subscription.errors.wasmServerError", params);
    case ERR_WASM_READ_BODY:
      return t("settings.subscription.errors.wasmReadBodyFailed", params);

    // Cryptography & Integrity (1030 - 1049)
    case ERR_INTEGRITY_FAILED:
      return t("settings.subscription.errors.integrityFailed", params);
    case ERR_SIGNATURE_FAILED:
      return t("settings.subscription.errors.signatureFailed", params);

    // Local Filesystem & Storage (1050 - 1069)
    case ERR_DIR_CREATE:
      return t("settings.subscription.errors.dirCreateFailed", params);
    case ERR_FILE_WRITE:
      return t("settings.subscription.errors.fileWriteFailed", params);
    case ERR_MANIFEST_SERIALIZE:
      return t("settings.subscription.errors.manifestSerializeFailed", params);
    case ERR_MANIFEST_WRITE:
      return t("settings.subscription.errors.manifestWriteFailed", params);

    // General/Session Errors (2000 - 2099)
    case ERR_SOURCE_NOT_FOUND:
      return t("errors.sourceNotFound", params);
    case ERR_SESSION_READ_LOCK:
      return t("errors.sessionReadLock", params);

    // Search & Index Errors (2100 - 2199)
    case ERR_ONNX_NOT_FOUND:
      return t("errors.onnxNotFound", params);
    case ERR_EMBEDDER_CREATION:
      return t("errors.embedderCreation", params);
    case ERR_EMBEDDINGS_GENERATION:
      return t("errors.embeddingsGeneration", params);
    case ERR_INDEX_REBUILD_FAILED:
      return t("errors.indexRebuildFailed", params);

    // File Preview & Permissions (2200 - 2299)
    case ERR_FILE_TOO_LARGE:
      return t("errors.fileTooLarge", params);
    case ERR_BINARY_FILE_PREVIEW:
      return t("errors.binaryFilePreview", params);
    case ERR_PERMISSION_DENIED:
      return t("errors.permissionDenied", params);
    case ERR_EXTERNAL_CONFIRMATION_REQUIRED:
      return t("errors.confirmationRequired", params);
    case ERR_METADATA_READ:
      return t("errors.metadataRead", params);
    case ERR_FILE_READ_FAILED:
      return t("errors.fileReadFailed", params);
    case ERR_EXTERNAL_OPEN_FAILED:
      return t("errors.externalOpenFailed", params);

    // Group Management Errors (2300 - 2399)
    case ERR_GROUP_LOCK:
      return t("errors.groupLock", params);
    case ERR_GROUP_DB_ERROR:
      return t("errors.groupDbError", params);

    // Auth Server Errors (2400 - 2499)
    case ERR_AUTH_SERVER_START:
      return t("errors.authServerStart", params);

    case ERR_GENERIC:
    default:
      return message || t("errors.generic", params);
  }
};
