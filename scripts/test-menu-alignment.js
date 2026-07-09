import fs from "fs";
import { execSync, spawn } from "child_process";
import path from "path";
import os from "os";

const LOCALES = ["en", "ar", "de", "es", "fr", "it", "ja", "ko", "nl", "pt", "ru", "zh", "zh-TW"];

const LOCALE_NAMES = {
  en: "English",
  ar: "العربية",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  nl: "Nederlands",
  pt: "Português",
  ru: "Русский",
  zh: "简体中文",
  "zh-TW": "繁體中文"
};

function runAppleScript(script) {
  try {
    return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`).toString().trim();
  } catch (e) {
    throw new Error("AppleScript execution failed: " + e.message);
  }
}

function getVisualWidth(str) {
  let width = 0;
  for (const char of str) {
    const code = char.charCodeAt(0);
    // Visual CJK ranges (double width)
    if (
      (code >= 0x3000 && code <= 0x9FFF) || // CJK symbols & Ideographs
      (code >= 0xAC00 && code <= 0xD7AF) || // Hangul
      (code >= 0xFF00 && code <= 0xFFEF) || // Fullwidth
      (code >= 0x0600 && code <= 0x06FF)    // Arabic characters
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padVisual(str, targetWidth) {
  const w = getVisualWidth(str);
  const needed = Math.max(0, targetWidth - w);
  return str + " ".repeat(needed);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseBMP(filePath) {
  const buf = fs.readFileSync(filePath);
  const width = buf.readInt32LE(18);
  let height = buf.readInt32LE(22);
  const isTopDown = height < 0;
  height = Math.abs(height);
  const pixelOffset = buf.readInt32LE(10);
  const bpp = buf.readInt16LE(28);

  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
  const pixels = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    const rowOffset = isTopDown
      ? pixelOffset + y * rowSize
      : pixelOffset + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * (bpp / 8);
      const b = buf[idx];
      const g = buf[idx + 1];
      const r = buf[idx + 2];
      row.push([r, g, b]);
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}

async function runTestForLocale(lang, projectRoot) {
  let dict = {};
  let enDict = {};
  
  try {
    const enPath = path.join(projectRoot, "src/i18n/locales/en.json");
    enDict = JSON.parse(fs.readFileSync(enPath, "utf8"));
  } catch (e) {
    return { passed: false, error: "Failed to load en.json base dictionary: " + e.message };
  }

  if (lang !== "en") {
    try {
      const langPath = path.join(projectRoot, "src/i18n/locales", `${lang}.json`);
      if (fs.existsSync(langPath)) {
        dict = JSON.parse(fs.readFileSync(langPath, "utf8"));
      } else {
        dict = enDict;
      }
    } catch (e) {
      dict = enDict;
    }
  } else {
    dict = enDict;
  }

  const t = (key) => {
    let current = dict;
    for (const part of key.split(".")) {
      current = current?.[part];
    }
    if (current) return current;
    
    let enCurrent = enDict;
    for (const part of key.split(".")) {
      enCurrent = enCurrent?.[part];
    }
    return enCurrent || key;
  };

  // Resolve titles
  const goMenuTitle = t("menu.go.title");
  const dashboardMenuLabel = t("menu.go.dashboard");
  const homeActionName = t("menu.go.home");
  const endActionName = t("menu.go.end");
  const pageUpActionName = t("menu.go.pageUp");
  const pageDownActionName = t("menu.go.pageDown");
  const activePaneLabel = dashboardMenuLabel;

  // Clean existing instances
  try {
    execSync("killall codeoba 2>/dev/null || true");
    execSync("killall Codeoba 2>/dev/null || true");
  } catch (e) {}

  // Spawn binary
  const binaryPath = path.join(projectRoot, "src-tauri/target/debug/codeoba");
  let appProcess;
  
  if (fs.existsSync(binaryPath)) {
    appProcess = spawn(binaryPath, ["--lang", lang], { stdio: "ignore", detached: true });
  } else {
    appProcess = spawn("npm", ["run", "tauri", "dev", "--", "--lang", lang], { stdio: "ignore", detached: true });
  }

  // Poll until app is launched
  let launched = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const check = runAppleScript('tell application "System Events" to exists process "codeoba"');
      if (check === "true") {
        launched = true;
        break;
      }
    } catch (e) {}
    await sleep(250);
  }

  if (!launched) {
    if (appProcess) {
      try { process.kill(-appProcess.pid); } catch (e) { appProcess.kill(); }
    }
    return { passed: false, error: "Codeoba app failed to launch within 5 seconds." };
  }

  await sleep(1500);

  // Determine Go title for AppleScript click
  let activeMenuTitle = goMenuTitle;
  try {
    const checkMenuExists = runAppleScript(`
      tell application "System Events" to tell process "codeoba"
        exists menu bar item "${goMenuTitle}" of menu bar 1
      end tell
    `);
    if (checkMenuExists !== "true") {
      activeMenuTitle = "Go";
    }
  } catch (e) {
    activeMenuTitle = "Go";
  }

  const bmpPath = path.join(os.tmpdir(), "temp_menu.bmp");
  let boundsStr;
  
  try {
    boundsStr = runAppleScript(`
      tell application "System Events" to tell process "codeoba"
        set frontmost to true
        tell menu bar 1 to tell menu bar item "${activeMenuTitle}"
          click
          delay 0.5
          tell menu 1
            set {pos, sz} to {position, size}
            set x to item 1 of pos
            set y to item 2 of pos
            set w to item 1 of sz
            set h to item 2 of sz
            do shell script "screencapture -x -R " & x & "," & y & "," & w & "," & h & " -t bmp " & quoted form of "${bmpPath}"
            get {x, y, w, h}
          end tell
        end tell
      end tell
    `);
  } catch (e) {
    try { execSync("killall codeoba 2>/dev/null || true"); } catch (err) {}
    return { passed: false, error: "Failed to open menu and capture screenshot: " + e.message };
  }

  const parts = boundsStr.replace(/[{}]/g, "").split(",").map(s => Math.round(parseFloat(s.trim())));
  const [x, y, w, h] = parts;

  // Query menu item names
  let menuItemNames = [];
  try {
    const rawNames = runAppleScript(`
      tell application "System Events" to tell process "codeoba"
        tell menu bar 1 to tell menu bar item "${activeMenuTitle}" to tell menu 1
          set namesList to name of every menu item
          set oldDelims to AppleScript's text item delimiters
          set AppleScript's text item delimiters to "|||"
          set resStr to namesList as string
          set AppleScript's text item delimiters to oldDelims
          return resStr
        end tell
      end tell
    `);
    menuItemNames = rawNames.split("|||")
      .map(s => s.trim())
      .map(name => (name === "missing value" ? "" : name))
      .filter(name => name !== "");
  } catch (e) {
    // Ignore fallback
  }

  // Parse screenshot
  let width, height, pixels;
  try {
    const result = parseBMP(bmpPath);
    width = result.width;
    height = result.height;
    pixels = result.pixels;
  } catch (e) {
    if (fs.existsSync(bmpPath)) fs.unlinkSync(bmpPath);
    try { execSync("killall codeoba 2>/dev/null || true"); } catch (err) {}
    return { passed: false, error: "Failed to parse BMP file: " + e.message };
  }

  // Preserve BMP for troubleshooting on failure
  const destBmpPath = path.join(projectRoot, "docs", "temp_menu.bmp");
  try { fs.copyFileSync(bmpPath, destBmpPath); } catch (err) {}
  if (fs.existsSync(bmpPath)) fs.unlinkSync(bmpPath);

  // Scan text rows
  const textRows = [];
  const brightnessThreshold = 140;
  const borderMargin = 15;
  
  for (let rowIdx = 0; rowIdx < height; rowIdx++) {
    let brightCount = 0;
    for (let colIdx = borderMargin; colIdx < width - borderMargin; colIdx++) {
      const [r, g, b] = pixels[rowIdx][colIdx];
      if (r > brightnessThreshold && g > brightnessThreshold && b > brightnessThreshold) {
        brightCount++;
      }
    }
    if (brightCount >= 3) {
      textRows.push(rowIdx);
    }
  }

  // Group lines
  const lines = [];
  if (textRows.length > 0) {
    let currentLine = [textRows[0]];
    for (let i = 1; i < textRows.length; i++) {
      if (textRows[i] === textRows[i - 1] + 1) {
        currentLine.push(textRows[i]);
      } else {
        if (currentLine.length >= 4) {
          lines.push(currentLine);
        }
        currentLine = [textRows[i]];
      }
    }
    if (currentLine.length >= 4) {
      lines.push(currentLine);
    }
  }

  // Analyze X boundaries
  const results = [];
  for (const line of lines) {
    const xProfile = [];
    for (let colIdx = 0; colIdx < width; colIdx++) {
      let hasBright = false;
      for (const rowIdx of line) {
        const [r, g, b] = pixels[rowIdx][colIdx];
        if (r > brightnessThreshold && g > brightnessThreshold && b > brightnessThreshold) {
          hasBright = true;
          break;
        }
      }
      xProfile.push(hasBright ? 1 : 0);
    }

    const blocks = [];
    let inBlock = false;
    let blockEnd = -1;
    for (let colIdx = width - 1 - borderMargin; colIdx >= borderMargin; colIdx--) {
      if (xProfile[colIdx] === 1) {
        if (!inBlock) {
          inBlock = true;
          blockEnd = colIdx;
        }
      } else {
        if (inBlock) {
          blocks.push({ start: colIdx + 1, end: blockEnd });
          inBlock = false;
        }
      }
    }
    if (inBlock) {
      blocks.push({ start: borderMargin, end: blockEnd });
    }

    // Merge adjacent blocks (closer than 30px)
    const mergedBlocks = [];
    if (blocks.length > 0) {
      let current = blocks[0];
      for (let i = 1; i < blocks.length; i++) {
        const next = blocks[i];
        const gap = current.start - next.end;
        if (gap < 30) {
          current.start = next.start;
        } else {
          mergedBlocks.push(current);
          current = next;
        }
      }
      mergedBlocks.push(current);
    }

    results.push({ line, blocks: mergedBlocks });
  }

  // Filter target items
  const targetNames = new Set();
  const possiblePrefixes = [t("menu.go.dashboard"), t("menu.go.detail"), t("menu.go.sidebar")];
  for (const prefix of possiblePrefixes) {
    targetNames.add(`${prefix}: ${t("menu.go.home")}`);
    targetNames.add(`${prefix}: ${t("menu.go.end")}`);
    targetNames.add(`${prefix}: ${t("menu.go.pageUp")}`);
    targetNames.add(`${prefix}: ${t("menu.go.pageDown")}`);
  }
  targetNames.add(t("menu.go.sidebar"));
  targetNames.add(t("menu.go.detail"));
  targetNames.add(t("menu.go.selectHighlighted"));

  const alignedItems = [];
  const cleanStr = (s) => s.replace(/[\u200e\u200f]/g, "").replace(/\s+/g, "");
  const targetNamesClean = new Set([...targetNames].map(cleanStr));

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const rawName = menuItemNames[i] || `Item #${i + 1}`;
    const name = rawName.split("\t")[0].trim();
    const isTarget = targetNamesClean.has(cleanStr(name));
    
    if (isTarget) {
      if (res.blocks.length >= 1) {
        alignedItems.push({
          name,
          rightEdge: res.blocks[0].start
        });
      }
    }
  }

  // Escape menu
  try {
    runAppleScript('tell application "System Events" to key code 53');
  } catch (e) {}

  // Kill app
  try {
    execSync("killall codeoba 2>/dev/null || true");
    execSync("killall Codeoba 2>/dev/null || true");
  } catch (e) {}

  if (alignedItems.length === 0) {
    return { passed: false, error: "Could not detect aligned shortcut menu elements." };
  }

  // Clean troubleshooting BMP on success
  try {
    if (fs.existsSync(destBmpPath)) fs.unlinkSync(destBmpPath);
  } catch (err) {}

  const targetX = Math.max(...alignedItems.map(item => item.rightEdge));
  let testPassed = true;
  const isRTL = lang === "ar";
  const itemChecks = [];

  for (let i = 0; i < alignedItems.length; i++) {
    const item = alignedItems[i];
    const diff = targetX - item.rightEdge;
    const label = item.name;

    if (Math.abs(diff) <= 3) {
      itemChecks.push({ label, status: "Aligned", value: `${item.rightEdge}px` });
    } else {
      testPassed = false;
      const tabStopDiff = Math.round(diff / 24.0);
      const direction = tabStopDiff > 0 ? "more" : "less";
      itemChecks.push({ 
        label, 
        status: "Staggered", 
        value: `current: ${item.rightEdge}px, delta: ${diff}px. Needs ${Math.abs(tabStopDiff)} ${direction} \\t` 
      });
    }
  }

  return { passed: testPassed, targetX, checks: itemChecks, isRTL };
}

async function main() {
  console.log("=========================================");
  console.log("  Codeoba Native Menu Alignment Tester");
  console.log("=========================================\n");

  const projectRoot = process.cwd();
  
  // Resolve languages list to run
  let targetLocales = [];
  const arg = process.argv[2];
  if (arg && arg !== "all") {
    if (LOCALES.includes(arg)) {
      targetLocales = [arg];
    } else {
      console.error(`❌ Error: Unsupported language locale '${arg}'. Supported locales: ${LOCALES.join(", ")}`);
      process.exit(1);
    }
  } else {
    targetLocales = LOCALES;
  }

  console.log(`📋 Running alignment tests for: ${targetLocales.map(l => LOCALE_NAMES[l] || l).join(", ")}\n`);

  const summary = [];
  let allPassed = true;

  for (const lang of targetLocales) {
    const name = LOCALE_NAMES[lang] || lang;
    console.log(`🌐 Testing [${lang.toUpperCase()}] ${name}...`);
    
    const result = await runTestForLocale(lang, projectRoot);
    if (result.passed) {
      console.log(`  ✅ SUCCESS: Alignment validation passed! (Tab X bounds: ${result.targetX || "N/A"}px)`);
      if (result.isRTL) {
        console.log("     Note: macOS Cocoa ignores tab-stops in RTL. Layout verified successfully.");
      }
      summary.push({ lang, name, passed: true, note: result.isRTL ? "RTL Checked" : "Aligned" });
    } else {
      allPassed = false;
      console.error(`  ❌ FAILURE: ${result.error || "Alignment check failed"}`);
      if (result.checks) {
        result.checks.forEach(c => {
          console.error(`     - ${padVisual(c.label, 35)}: [${c.status}] ${c.value}`);
        });
      }
      summary.push({ lang, name, passed: false, note: result.error || "Staggered" });
    }
    console.log("");
    await sleep(1000); // short settle delay between runs
  }

  console.log("=========================================");
  console.log("        VERIFICATION SUMMARY REPORT");
  console.log("=========================================");
  summary.forEach(s => {
    const statusLabel = s.passed ? "✅ PASSED" : "❌ FAILED";
    console.log(`  ${padVisual(s.name, 20)} (${padVisual(s.lang, 5)}): ${padVisual(statusLabel, 10)} (${s.note})`);
  });
  console.log("=========================================\n");

  process.exit(allPassed ? 0 : 1);
}

main();
