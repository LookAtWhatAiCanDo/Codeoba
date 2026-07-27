#!/usr/bin/env node
/**
 * Fails when a t("...") key referenced in source has no definition in en.json.
 *
 * Missing keys are invisible to tsc/eslint/tests because t() falls back to
 * returning the key string at runtime, so the UI silently renders text like
 * "updater.availableTitle" (see commit c507348, which renamed UpdateModal's
 * keys without touching any locale file and shipped a fully broken dialog).
 *
 * Scanned:
 *   - src/**\/*.ts, *.tsx        (frontend useI18n t())
 *   - src-tauri/src/menu.rs      (Rust menu t(), reads the same locale JSONs)
 *
 * Only string-literal keys are checked. Dynamic keys such as
 * t(`dashboard.${dim}`) cannot be statically resolved and are skipped.
 * en.json is the source of truth; other locales fall back to English for
 * missing keys, so they are not checked here (npm run translate keeps them
 * in sync).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EN_PATH = path.join(ROOT, "src/i18n/locales/en.json");

function collectFiles(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function keyExists(dict, dottedKey) {
  let current = dict;
  for (const part of dottedKey.split(".")) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  // A t() call must land on a string leaf, not an intermediate section object.
  return typeof current === "string";
}

const en = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));

const files = [
  ...collectFiles(path.join(ROOT, "src"), [".ts", ".tsx"]),
  path.join(ROOT, "src-tauri/src/menu.rs"),
];

// \Wt( or start-of-line t( with a single string-literal first argument.
// The word boundary keeps split("...")/insert("...") etc. from matching.
const CALL_RE = /\bt\(\s*(["'])([^"'\n]+)\1/g;
const DYNAMIC_RE = /\bt\(\s*`[^`\n]*\$\{/g;

const missing = [];
let checked = 0;
let dynamic = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  dynamic += (text.match(DYNAMIC_RE) || []).length;

  for (const match of text.matchAll(CALL_RE)) {
    const key = match[2];
    checked++;
    if (!keyExists(en, key)) {
      const line = text.slice(0, match.index).split("\n").length;
      missing.push(`${rel}:${line}  t("${key}")`);
    }
  }
}

if (missing.length > 0) {
  console.error(`❌ ${missing.length} t() key(s) missing from src/i18n/locales/en.json:\n`);
  for (const entry of missing) {
    console.error(`  ${entry}`);
  }
  console.error("\nAdd the key(s) to en.json (then run `npm run translate` for other locales).");
  process.exit(1);
}

console.log(
  `✅ i18n keys OK: ${checked} literal t() call(s) resolved against en.json` +
    (dynamic > 0 ? ` (${dynamic} dynamic key(s) skipped)` : "")
);
