import { For, Show } from "solid-js";
import { Clock, X } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";

export interface SearchHistoryOverlayProps {
  showHistoryDropdown: boolean;
  searchHistory: string[];
  activeHistoryIndex: number;
  onSelectHistoryItem: (item: string) => void;
  onRemoveFromHistory: (e: MouseEvent, item: string) => void;
  onClearHistory: () => void;
  dropdownRef?: (el: HTMLDivElement) => void;
}

export const SearchHistoryOverlay = (props: SearchHistoryOverlayProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.showHistoryDropdown && props.searchHistory.length > 0}>
      <div
        ref={props.dropdownRef}
        onMouseDown={(e) => e.preventDefault()}
        class="absolute left-0 right-0 top-full mt-1.5 bg-surface border border-border rounded-xl shadow-xl z-[9999] py-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100"
      >
        <div class="px-3 py-1 flex items-center justify-between text-[0.625rem] font-bold uppercase tracking-wider text-text-secondary/50 border-b border-border/40 mb-1">
          <span>{t("sidebar.recentSearches")}</span>
          <button
            onClick={props.onClearHistory}
            class="hover:text-red-400 transition-colors cursor-pointer font-normal normal-case text-[0.625rem]"
          >
            {t("common.clearAll")}
          </button>
        </div>
        <For each={props.searchHistory}>
          {(item, idx) => (
            <div
              onClick={() => props.onSelectHistoryItem(item)}
              class={`px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                props.activeHistoryIndex === idx()
                  ? "bg-accent/15 text-accent font-medium"
                  : "hover:bg-surface-light text-text-primary"
              }`}
            >
              <div class="flex items-center gap-2 min-w-0">
                <Clock class="w-3 h-3 text-text-secondary/50 flex-shrink-0" />
                <span class="truncate">{item}</span>
              </div>
              <button
                onClick={(e) => props.onRemoveFromHistory(e, item)}
                class="text-text-secondary/40 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                title={t("common.delete")}
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};
