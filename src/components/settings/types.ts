import { SourceMetadata } from "../../types";

export type Category =
  | "general"
  | "regional"
  | "read-aloud"
  | "theme"
  | "sources"
  | "exclusions"
  | "permissions"
  | "updates";

export interface ThemeOption {
  id: string;
  nameKey: string;
  color: string;
}

export const DARK_THEMES: ThemeOption[] = [
  { id: "obsidian", nameKey: "themeObsidian", color: "bg-[#0d0e12] border-slate-700" },
  { id: "nordic-frost", nameKey: "themeNordicFrost", color: "bg-[#0b1116] border-sky-950" },
  { id: "emerald-forest", nameKey: "themeEmeraldForest", color: "bg-[#09110f] border-emerald-950" },
  { id: "sunset-copper", nameKey: "themeSunsetCopper", color: "bg-[#130f0d] border-amber-950" },
  { id: "royal-amethyst", nameKey: "themeRoyalAmethyst", color: "bg-[#100d18] border-purple-950" },
  { id: "dracula", nameKey: "themeDracula", color: "bg-[#1e1e2e] border-pink-950" },
  { id: "cyberpunk-neon", nameKey: "themeCyberpunk", color: "bg-[#080710] border-pink-700" },
  { id: "monochrome-slate", nameKey: "themeMonochrome", color: "bg-[#0f172a] border-slate-700" },
  {
    id: "custom",
    nameKey: "themeCustom",
    color: "bg-linear-to-r from-red-500 via-green-500 to-blue-500 border-white/20",
  },
];

export const LIGHT_THEMES: ThemeOption[] = [
  { id: "obsidian-light", nameKey: "themeQuartz", color: "bg-[#f8fafc] border-slate-300" },
  { id: "nordic-light", nameKey: "themeGlacier", color: "bg-[#f0f4f8] border-blue-200" },
  { id: "emerald-light", nameKey: "themeMint", color: "bg-[#f0fdf4] border-green-200" },
  { id: "sunset-light", nameKey: "themeAmber", color: "bg-[#fffbeb] border-amber-200" },
  { id: "royal-light", nameKey: "themeLavender", color: "bg-[#faf5ff] border-purple-200" },
  { id: "dracula-light", nameKey: "themePastel", color: "bg-[#fff0f6] border-pink-200" },
  { id: "cyberpunk-light", nameKey: "themeNeon", color: "bg-[#fdf4ff] border-pink-300" },
  { id: "monochrome-light", nameKey: "themePaper", color: "bg-[#ffffff] border-slate-200" },
  {
    id: "custom",
    nameKey: "themeCustom",
    color: "bg-linear-to-r from-red-500 via-green-500 to-blue-500 border-white/20",
  },
];

export interface CustomThemeColor {
  h: number;
  s: number;
  l: number;
}

export interface CustomThemeConfig {
  bg: CustomThemeColor;
  surface: CustomThemeColor;
  accent1: CustomThemeColor;
  accent2: CustomThemeColor;
}

export interface GeneralSettings {
  dateFormat: string;
  timeFormat: string;
  showSeconds: boolean;
  numberFormat?: string;
  excludedPaths: string;
  indexSubagents: boolean;
  fontSize: number;
  parserMode?: string;
  cacheEnabled?: boolean;
  pruneDeleted?: boolean;
}

export interface ThemeSettings {
  theme: string;
  appearance: string;
  customTheme?: CustomThemeConfig;
}

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  generalSettings: GeneralSettings;
  onUpdateGeneralSetting: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K]
  ) => void;
  themeSettings: ThemeSettings;
  onUpdateThemeSetting: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  sources: SourceMetadata[];
  onRefreshSources: () => void;
  onUpdateAvailable?: (update: any) => void;
  onCheckUpdates?: () => void;
}
