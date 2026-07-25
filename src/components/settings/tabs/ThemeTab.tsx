import { createSignal, createMemo, For, Show } from "solid-js";
import { Shuffle } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { Category, DARK_THEMES, LIGHT_THEMES, CustomThemeConfig, CustomThemeColor } from "../types";

export interface ThemeTabProps {
  activeCategory: Category;
  theme: string;
  onThemeChange: (theme: string) => void;
  appearance: string;
  onAppearanceChange: (val: string) => void;
  customTheme?: CustomThemeConfig;
  onCustomThemeChange?: (val: any) => void;
}

const THEME_NAME_TRANSLATION_KEYS: Record<string, string> = {
  themeObsidian: "settings.general.themeObsidian",
  themeNordicFrost: "settings.general.themeNordicFrost",
  themeEmeraldForest: "settings.general.themeEmeraldForest",
  themeSunsetCopper: "settings.general.themeSunsetCopper",
  themeRoyalAmethyst: "settings.general.themeRoyalAmethyst",
  themeDracula: "settings.general.themeDracula",
  themeCyberpunk: "settings.general.themeCyberpunk",
  themeMonochrome: "settings.general.themeMonochrome",
  themeCustom: "settings.general.themeCustom",
  themeQuartz: "settings.general.themeQuartz",
  themeGlacier: "settings.general.themeGlacier",
  themeMint: "settings.general.themeMint",
  themeAmber: "settings.general.themeAmber",
  themeLavender: "settings.general.themeLavender",
  themePastel: "settings.general.themePastel",
  themeNeon: "settings.general.themeNeon",
  themePaper: "settings.general.themePaper",
};

const getThemeName = (t: (key: string) => string, nameKey: string): string => {
  const fullKey = THEME_NAME_TRANSLATION_KEYS[nameKey];
  return fullKey ? t(fullKey) : nameKey;
};

export const ThemeTab = (props: ThemeTabProps) => {
  const { t } = useI18n();

  const systemIsDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const currentMode = () =>
    props.appearance === "system" ? (systemIsDark() ? "dark" : "light") : props.appearance;
  const activeThemesList = () => (currentMode() === "dark" ? DARK_THEMES : LIGHT_THEMES);

  // Custom Theme HSL Adjusters
  const [activeColorIndex, setActiveColorIndex] = createSignal<string>("bg");

  const activeColorHsl = createMemo<CustomThemeColor>(() => {
    const key = activeColorIndex();
    if (!props.customTheme) return { h: 0, s: 0, l: 0 };
    return (
      (props.customTheme as any)[key] || {
        h: 0,
        s: 0,
        l: 0,
      }
    );
  });

  const handleSliderChange = (part: "h" | "s" | "l", val: number) => {
    if (!props.customTheme || !props.onCustomThemeChange) return;
    const isDarkMode = currentMode() === "dark";
    const keyPrefix = isDarkMode ? "dark" : "light";
    const key = activeColorIndex();
    const currentHSL = { ...activeColorHsl(), [part]: val };
    const updatedCustom = {
      ...props.customTheme,
      [key]: currentHSL,
    };

    localStorage.setItem(`codeoba-custom-${keyPrefix}-${key}-${part}`, String(val));
    props.onCustomThemeChange(updatedCustom);
  };

  const handleRollTheme = () => {
    if (!props.onCustomThemeChange) return;

    const isDarkMode = currentMode() === "dark";

    const bgH = Math.floor(Math.random() * 360);
    let h1 = (bgH + 90 + Math.floor(Math.random() * 180)) % 360;
    let h2 = (h1 + 60 + Math.floor(Math.random() * 120)) % 360;

    let bgS, bgL, surfaceL, accent1S, accent1L, accent2S, accent2L;

    if (isDarkMode) {
      bgS = 10 + Math.floor(Math.random() * 15);
      bgL = 5 + Math.floor(Math.random() * 5);
      surfaceL = 8 + Math.floor(Math.random() * 6);
      accent1S = 70 + Math.floor(Math.random() * 25);
      accent1L = 50 + Math.floor(Math.random() * 15);
      accent2S = 65 + Math.floor(Math.random() * 25);
      accent2L = 55 + Math.floor(Math.random() * 15);
    } else {
      bgS = 15 + Math.floor(Math.random() * 25);
      bgL = 94 + Math.floor(Math.random() * 5);
      surfaceL = 88 + Math.floor(Math.random() * 6);
      accent1S = 60 + Math.floor(Math.random() * 30);
      accent1L = 35 + Math.floor(Math.random() * 15);
      accent2S = 55 + Math.floor(Math.random() * 30);
      accent2L = 40 + Math.floor(Math.random() * 15);
    }

    const newCustom = {
      bg: { h: bgH, s: bgS, l: bgL },
      surface: { h: bgH, s: bgS, l: surfaceL },
      accent1: { h: h1, s: accent1S, l: accent1L },
      accent2: { h: h2, s: accent2S, l: accent2L },
    };

    const keyPrefix = isDarkMode ? "dark" : "light";
    Object.entries(newCustom).forEach(([colorKey, colorVal]) => {
      localStorage.setItem(`codeoba-custom-${keyPrefix}-${colorKey}-h`, String(colorVal.h));
      localStorage.setItem(`codeoba-custom-${keyPrefix}-${colorKey}-s`, String(colorVal.s));
      localStorage.setItem(`codeoba-custom-${keyPrefix}-${colorKey}-l`, String(colorVal.l));
    });

    props.onCustomThemeChange(newCustom);
  };

  return (
    <Show when={props.activeCategory === "theme"}>
      {/* Theme Settings Tab */}
      <div class="space-y-3 animate-in fade-in duration-200">
        <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">
          {t("settings.theme.title")}
        </h3>

        {/* Appearance Mode Selection */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between">
          <div>
            <h4 class="text-xs font-bold text-text-primary">{t("settings.general.appearance")}</h4>
            <p class="text-[0.625rem] text-text-secondary/70">
              {t("settings.general.appearanceDesc")}
            </p>
          </div>
          <select
            value={props.appearance}
            onChange={(e) => props.onAppearanceChange(e.currentTarget.value)}
            class="bg-background border border-border/80 rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium cursor-pointer"
          >
            <option value="dark">{t("settings.general.appearanceDark")}</option>
            <option value="light">{t("settings.general.appearanceLight")}</option>
            <option value="system">{t("settings.general.appearanceSystem")}</option>
          </select>
        </div>

        {/* Theme Selector Dot Bar */}
        <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 space-y-2">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-xs font-bold text-text-primary">{t("settings.general.theme")}</h4>
              <p class="text-[0.625rem] text-text-secondary/70">
                {t("settings.general.themeDesc")}
              </p>
            </div>
            <span class="text-xs font-semibold text-accent">
              {props.theme === "custom"
                ? t("settings.general.themeCustom")
                : getThemeName(
                    t,
                    activeThemesList().find((tTheme) => tTheme.id === props.theme)?.nameKey ||
                      props.theme
                  )}
            </span>
          </div>
          <div class="flex items-center gap-2 pt-1 flex-wrap">
            <For each={activeThemesList()}>
              {(themeItem) => (
                <button
                  onClick={() => props.onThemeChange(themeItem.id)}
                  title={
                    themeItem.id === "custom"
                      ? t("settings.general.themeCustom")
                      : t("settings.general.themeSwitchTo", {
                          name: getThemeName(t, themeItem.nameKey),
                        })
                  }
                  class={`w-5 h-5 rounded-full border cursor-pointer hover:scale-110 hover:shadow-md transition-all duration-150 ${themeItem.color} ${
                    props.theme === themeItem.id
                      ? "scale-105 ring-2 ring-accent ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                />
              )}
            </For>
          </div>
        </div>

        {/* Custom HSL Theme Editor */}
        <Show when={props.theme === "custom"}>
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 space-y-4 animate-in fade-in duration-200">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-xs font-bold text-text-primary">
                  {t("settings.general.customThemeTitle")}
                </h4>
                <p class="text-[0.625rem] text-text-secondary/70">
                  {t("settings.general.customThemeDesc")}
                </p>
              </div>
              <button
                onClick={handleRollTheme}
                title={t("settings.general.customThemeRollTooltip")}
                class="p-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 rounded-xl text-accent transition-all cursor-pointer flex items-center justify-center"
              >
                <Shuffle class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="grid grid-cols-4 gap-2">
              <For
                each={[
                  {
                    key: "bg",
                    label: t("settings.general.customThemeBg"),
                    color: props.customTheme?.bg,
                  },
                  {
                    key: "surface",
                    label: t("settings.general.customThemeSurface"),
                    color: props.customTheme?.surface,
                  },
                  {
                    key: "accent1",
                    label: t("settings.general.customThemeAccent1"),
                    color: props.customTheme?.accent1,
                  },
                  {
                    key: "accent2",
                    label: t("settings.general.customThemeAccent2"),
                    color: props.customTheme?.accent2,
                  },
                ]}
              >
                {(item) => (
                  <button
                    onClick={() => setActiveColorIndex(item.key)}
                    class={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${
                      activeColorIndex() === item.key
                        ? "bg-accent/10 border-accent/40 text-accent font-semibold"
                        : "bg-background/40 border-border/30 text-text-secondary hover:text-text-primary hover:border-border/60"
                    }`}
                  >
                    <span class="text-[0.5rem] uppercase tracking-wider mb-1.5 font-bold truncate max-w-full">
                      {item.label}
                    </span>
                    <div
                      class="w-5 h-5 rounded-full border border-border/80"
                      style={{
                        "background-color": `hsl(${item.color?.h}, ${item.color?.s}%, ${item.color?.l}%)`,
                      }}
                    />
                  </button>
                )}
              </For>
            </div>

            {/* Sliders for the active HSL setting */}
            <div class="bg-background/30 border border-border/40 rounded-xl p-3 space-y-3">
              <div class="flex items-center justify-between text-[0.625rem] font-semibold text-text-secondary">
                <span class="font-bold text-text-primary">
                  {activeColorIndex() === "bg"
                    ? t("settings.general.customThemeBg")
                    : activeColorIndex() === "surface"
                      ? t("settings.general.customThemeSurface")
                      : activeColorIndex() === "accent1"
                        ? t("settings.general.customThemeAccent1")
                        : t("settings.general.customThemeAccent2")}
                </span>
                <span class="font-mono">
                  hsl({activeColorHsl().h}, {activeColorHsl().s}%, {activeColorHsl().l}%)
                </span>
              </div>

              <div class="space-y-2">
                {/* Hue Slider */}
                <div class="flex items-center gap-3">
                  <span class="text-[0.625rem] w-20 font-semibold text-text-secondary">
                    {t("settings.general.customThemeHue")}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={activeColorHsl().h}
                    onInput={(e) => handleSliderChange("h", parseInt(e.currentTarget.value))}
                    class="flex-grow h-1 bg-background rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <span class="text-[0.625rem] w-6 font-mono text-right text-text-secondary">
                    {activeColorHsl().h}°
                  </span>
                </div>

                {/* Saturation Slider */}
                <div class="flex items-center gap-3">
                  <span class="text-[0.625rem] w-20 font-semibold text-text-secondary">
                    {t("settings.general.customThemeSat")}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={activeColorHsl().s}
                    onInput={(e) => handleSliderChange("s", parseInt(e.currentTarget.value))}
                    class="flex-grow h-1 bg-background rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <span class="text-[0.625rem] w-6 font-mono text-right text-text-secondary">
                    {activeColorHsl().s}%
                  </span>
                </div>

                {/* Lightness Slider */}
                <div class="flex items-center gap-3">
                  <span class="text-[0.625rem] w-20 font-semibold text-text-secondary">
                    {t("settings.general.customThemeLight")}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={activeColorHsl().l}
                    onInput={(e) => handleSliderChange("l", parseInt(e.currentTarget.value))}
                    class="flex-grow h-1 bg-background rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <span class="text-[0.625rem] w-6 font-mono text-right text-text-secondary">
                    {activeColorHsl().l}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
};
