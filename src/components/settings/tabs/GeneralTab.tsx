import { For, Show } from "solid-js";
import { useI18n, LOCALES, LOCALE_NAMES, Locale } from "../../../i18n/i18n";
import { Category } from "../types";

export interface GeneralTabProps {
  activeCategory: Category;
  cacheEnabled: boolean;
  onToggleCache: (checked: boolean) => void;
  pruneDeleted: boolean;
  onTogglePruneDeleted: (checked: boolean) => void;
  fontSize: number;
  onFontSizeChange: (val: number) => void;
  parserMode: string;
  onParserModeChange: (mode: string) => void;
  dateFormat: string;
  onDateFormatChange: (val: string) => void;
  timeFormat: string;
  onTimeFormatChange: (val: string) => void;
  showSeconds: boolean;
  onShowSecondsChange: (val: boolean) => void;
  numberFormat?: string;
  onNumberFormatChange: (val: string) => void;
  excludedPaths: string;
  onExcludedPathsChange: (val: string) => void;
  indexSubagents: boolean;
  onIndexSubagentsChange: (val: boolean) => void;
}

export const GeneralTab = (props: GeneralTabProps) => {
  const { locale, setLocale, t } = useI18n();

  return (
    <>
      <Show when={props.activeCategory === "general"}>
        {/* General Settings Tab */}
        <div class="space-y-3">
          <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t("settings.general.title")}
          </h3>

          {/* Persistent cache switch */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">{t("settings.general.cache")}</h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.cacheDesc")}
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={props.cacheEnabled}
                onChange={(e) => props.onToggleCache(e.currentTarget.checked)}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-background" />
            </label>
          </div>

          {/* Prune deleted sessions switch */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.pruneDeleted")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.pruneDeletedDesc")}
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={props.pruneDeleted}
                onChange={(e) => props.onTogglePruneDeleted(e.currentTarget.checked)}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-background" />
            </label>
          </div>

          {/* Font Size controls */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">{t("settings.general.fontSize")}</h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.fontSizeDesc")}
              </p>
            </div>
            <div class="flex items-center gap-2 select-none">
              <button
                onClick={() => props.onFontSizeChange(Math.max(10, props.fontSize - 1))}
                class="px-2 py-1 bg-background hover:bg-surface border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                -
              </button>
              <span
                onDblClick={() => props.onFontSizeChange(15)}
                class="text-xs font-mono min-w-[32px] text-center text-text-secondary cursor-pointer hover:text-text-primary select-none"
                title={t("detailPane.resetFontSize")}
              >
                {props.fontSize}px
              </span>
              <button
                onClick={() => props.onFontSizeChange(Math.min(24, props.fontSize + 1))}
                class="px-2 py-1 bg-background hover:bg-surface border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Log Parsing Mode */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 space-y-3">
            <div>
              <h4 class="text-xs font-bold text-text-primary">{t("settings.general.logMode")}</h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.logModeDesc")}
              </p>
            </div>
            <div class="flex bg-background p-1 rounded-lg border border-border/60">
              <button
                onClick={() => props.onParserModeChange("standard")}
                class={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  props.parserMode === "standard"
                    ? "bg-surface text-accent border border-border/80 shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t("settings.general.modeStandard")}
              </button>
              <button
                onClick={() => props.onParserModeChange("summarizing")}
                class={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  props.parserMode === "summarizing"
                    ? "bg-surface text-accent border border-border/80 shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t("settings.general.modeCompact")}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.activeCategory === "regional"}>
        {/* Region & Language Settings Tab */}
        <div class="space-y-3 animate-in fade-in duration-200">
          <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t("settings.regional.title")}
          </h3>

          {/* Language Selector */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary font-sans">
                {t("settings.general.language")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.languageDesc")}
              </p>
            </div>
            <select
              value={locale()}
              onChange={(e) => setLocale(e.currentTarget.value as Locale)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer"
            >
              <For each={LOCALES}>
                {(lang) => <option value={lang}>{LOCALE_NAMES[lang]}</option>}
              </For>
            </select>
          </div>

          {/* Date Format Selector */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.dateFormat")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.dateFormatDesc")}
              </p>
            </div>
            <select
              value={props.dateFormat}
              onChange={(e) => props.onDateFormatChange(e.currentTarget.value)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer"
            >
              <option value="system">
                {t("settings.general.matchLanguage", { lang: LOCALE_NAMES[locale()] })}
              </option>
              <option value="iso">{t("settings.general.dateFormatISO")}</option>
              <option value="us">{t("settings.general.dateFormatUS")}</option>
              <option value="eu">{t("settings.general.dateFormatEU")}</option>
            </select>
          </div>

          {/* Time Format Selector */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.timeFormat")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.timeFormatDesc")}
              </p>
            </div>
            <select
              value={props.timeFormat}
              onChange={(e) => props.onTimeFormatChange(e.currentTarget.value)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer"
            >
              <option value="system">
                {t("settings.general.matchLanguage", { lang: LOCALE_NAMES[locale()] })}
              </option>
              <option value="12">{t("settings.general.timeFormat12")}</option>
              <option value="24">{t("settings.general.timeFormat24")}</option>
            </select>
          </div>

          {/* Show Seconds Switch */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.showSeconds")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.showSecondsDesc")}
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={props.showSeconds}
                onChange={(e) => props.onShowSecondsChange(e.currentTarget.checked)}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-background" />
            </label>
          </div>

          {/* Number Format Selector */}
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.numberFormat")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.numberFormatDesc")}
              </p>
            </div>
            <select
              value={props.numberFormat || "system"}
              onChange={(e) => props.onNumberFormatChange(e.currentTarget.value)}
              class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer"
            >
              <option value="system">
                {t("settings.general.matchLanguage", { lang: LOCALE_NAMES[locale()] })}
              </option>
              <option value="us">{t("settings.general.numberFormatUS")}</option>
              <option value="eu">{t("settings.general.numberFormatEU")}</option>
              <option value="fr">{t("settings.general.numberFormatFR")}</option>
            </select>
          </div>
        </div>
      </Show>

      <Show when={props.activeCategory === "exclusions"}>
        {/* Exclusions Tab */}
        <div class="space-y-3">
          <div class="border-b border-border/30 pb-2 mb-2 flex-shrink-0">
            <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary">
              {t("settings.exclusions.title")}
            </h3>
          </div>

          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex flex-col gap-3">
            <div>
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.general.excludedPaths")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.excludedPathsDesc")}
              </p>
            </div>
            <textarea
              value={props.excludedPaths}
              onInput={(e) => props.onExcludedPathsChange(e.currentTarget.value)}
              placeholder="e.g. node_modules, dist, temp, .git"
              class="w-full bg-background border border-border/80 rounded-xl p-3 text-xs text-text-primary focus:outline-none focus:border-accent font-mono resize-none h-32 placeholder:text-text-secondary/30 leading-normal"
            />
          </div>

          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between transition-all duration-200">
            <div class="flex-1 pr-4">
              <h4 class="text-xs font-bold text-text-primary">
                {t("settings.exclusions.indexSubagents")}
              </h4>
              <p class="text-[0.625rem] text-text-secondary/70 mt-1 leading-normal">
                {t("settings.exclusions.indexSubagentsDesc")}
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={props.indexSubagents}
                onChange={(e) => props.onIndexSubagentsChange(e.currentTarget.checked)}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-background" />
            </label>
          </div>
        </div>
      </Show>
    </>
  );
};
