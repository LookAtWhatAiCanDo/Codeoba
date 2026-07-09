import { createSignal, createContext, useContext, JSX, onMount, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// Statically import all translations
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";
import zhTW from "./locales/zh-TW.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import ko from "./locales/ko.json";
import nl from "./locales/nl.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";

export const LOCALES = ["en", "ar", "de", "es", "fr", "it", "ja", "ko", "nl", "pt", "ru", "zh", "zh-TW"] as const;
export type Locale = typeof LOCALES[number];

export const LOCALE_NAMES: Record<Locale, string> = {
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

const DICTIONARIES: Record<Locale, any> = {
  en, ar, de, es, fr, it, ja, ko, nl, pt, ru, zh, "zh-TW": zhTW
};

function detectSystemLanguage(): Locale {
  const sysLang = navigator.language.toLowerCase();
  if (sysLang.startsWith("zh-tw") || sysLang.startsWith("zh-hk") || sysLang.startsWith("zh-hant")) {
    return "zh-TW";
  }
  if (sysLang.startsWith("zh")) {
    return "zh";
  }
  const prefix = sysLang.split("-")[0] as any;
  if (LOCALES.includes(prefix)) {
    return prefix;
  }
  return "en";
}

interface I18nContextProps {
  locale: () => Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextProps>();

export function I18nProvider(props: { children: JSX.Element }) {
  const [locale, _setLocale] = createSignal<Locale>("en");

  // Read saved locale or auto-detect on startup
  onMount(async () => {
    try {
      const overridden = await invoke<string | null>("get_language_override");
      if (overridden && LOCALES.includes(overridden as any)) {
        _setLocale(overridden as Locale);
        localStorage.setItem("codeoba-language", overridden);
        return;
      }
    } catch (e) {
      console.error("Failed to fetch language override:", e);
    }

    const saved = localStorage.getItem("codeoba-language") as Locale;
    if (saved && LOCALES.includes(saved)) {
      _setLocale(saved);
    } else {
      const detected = detectSystemLanguage();
      _setLocale(detected);
      localStorage.setItem("codeoba-language", detected);
    }
  });

  // Keep dir and lang tags on html in sync dynamically
  createEffect(() => {
    const current = locale();
    document.documentElement.setAttribute("lang", current);
    if (current === "ar") {
      document.documentElement.setAttribute("dir", "rtl");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
    }
    localStorage.setItem("codeoba-language", current);

    // Save language to backend fallback config and reload menu bar in real-time
    invoke("save_language_setting", { lang: current }).catch(err => {
      console.error("Failed to save language setting to backend:", err);
    });
  });

  const setLocale = (l: Locale) => {
    if (LOCALES.includes(l)) {
      _setLocale(l);
    }
  };

  const getNestedValue = (obj: any, path: string): string => {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current == null) return path;
      current = current[part];
    }
    return typeof current === "string" ? current : path;
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = DICTIONARIES[locale()] || en;
    let val = getNestedValue(dict, key);
    
    // Fallback to English dictionary if key is missing in active locale
    if (val === key && locale() !== "en") {
      val = getNestedValue(en, key);
    }

    if (val === key) return key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`{${k}}`, "g"), String(v));
      }
    }
    return val;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {props.children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
