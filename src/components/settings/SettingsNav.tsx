import {
  Settings,
  SlidersHorizontal,
  Globe,
  Volume2,
  Palette,
  Layers,
  FolderMinus,
  Shield,
  RefreshCw,
} from "lucide-solid";
import { useI18n } from "../../i18n/i18n";
import { Category } from "./types";

export interface SettingsNavProps {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
}

export const SettingsNav = (props: SettingsNavProps) => {
  const { t } = useI18n();

  return (
    <div class="w-[200px] border-r border-border/60 flex flex-col p-4 pt-6 gap-6 flex-shrink-0">
      <div class="flex items-center gap-2 px-2">
        <Settings class="w-4 h-4 text-accent" />
        <span class="font-bold text-text-primary tracking-wide">{t("settings.title")}</span>
      </div>

      <div class="flex flex-col gap-1">
        <button
          onClick={() => props.onSelectCategory("general")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "general"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          <span>{t("settings.general.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("regional")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "regional"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <Globe class="w-3.5 h-3.5" />
          <span>{t("settings.regional.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("read-aloud")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "read-aloud"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <Volume2 class="w-3.5 h-3.5" />
          <span>{t("settings.readAloud.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("theme")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "theme"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <Palette class="w-3.5 h-3.5" />
          <span>{t("settings.theme.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("sources")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "sources"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <Layers class="w-3.5 h-3.5" />
          <span>{t("settings.agents.tab")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("exclusions")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "exclusions"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <FolderMinus class="w-3.5 h-3.5" />
          <span>{t("settings.exclusions.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("permissions")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "permissions"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <Shield class="w-3.5 h-3.5" />
          <span>{t("settings.permissions.title")}</span>
        </button>

        <button
          onClick={() => props.onSelectCategory("updates")}
          class={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-left ${
            props.activeCategory === "updates"
              ? "bg-accent-light/20 text-accent border border-accent/20"
              : "text-text-secondary hover:text-text-primary border border-transparent"
          }`}
        >
          <RefreshCw class="w-3.5 h-3.5" />
          <span>{t("settings.updates.title")}</span>
        </button>
      </div>
    </div>
  );
};
