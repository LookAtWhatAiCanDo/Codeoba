import { Show } from "solid-js";
import { Search, X, Filter } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { SearchHistoryOverlay } from "./SearchHistoryOverlay";
import { useSearchHistory } from "../hooks/useSearchHistory";

export interface SidebarSearchControlsProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean | ((prev: boolean) => boolean)) => void;
  selectedSources: Set<string>;
  historyHook: ReturnType<typeof useSearchHistory>;
}

export const SidebarSearchControls = (props: SidebarSearchControlsProps) => {
  const { t } = useI18n();

  return (
    <div ref={props.historyHook.setSearchBarRef} class="relative w-full">
      <div class="relative flex items-center">
        <Search class="absolute left-3 top-3 w-4 h-4 text-text-secondary pointer-events-none" />
        <input
          type="text"
          value={props.searchQuery}
          onFocus={() => {
            props.historyHook.setJustFocused(true);
            props.historyHook.setActiveHistoryIndex(-1);
            if (props.historyHook.searchHistory().length > 0) {
              props.historyHook.setShowHistoryDropdown(true);
            }
            setTimeout(() => {
              props.historyHook.setJustFocused(false);
            }, 200);
          }}
          onClick={() => {
            if (
              !props.historyHook.showHistoryDropdown() &&
              props.historyHook.searchHistory().length > 0
            ) {
              props.historyHook.setShowHistoryDropdown(true);
            }
          }}
          onInput={(e) => {
            props.onSearchChange(e.currentTarget.value);
            props.historyHook.setActiveHistoryIndex(-1);
            if (props.historyHook.searchHistory().length > 0) {
              props.historyHook.setShowHistoryDropdown(true);
            }
          }}
          onKeyDown={(e) => {
            if (props.historyHook.showHistoryDropdown()) {
              const history = props.historyHook.searchHistory();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                const nextIdx = props.historyHook.activeHistoryIndex() + 1;
                if (nextIdx < history.length) {
                  props.historyHook.setActiveHistoryIndex(nextIdx);
                  props.onSearchChange(history[nextIdx]);
                }
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                const prevIdx = props.historyHook.activeHistoryIndex() - 1;
                if (prevIdx >= 0) {
                  props.historyHook.setActiveHistoryIndex(prevIdx);
                  props.onSearchChange(history[prevIdx]);
                } else if (prevIdx === -1) {
                  props.historyHook.setActiveHistoryIndex(-1);
                }
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                const activeIdx = props.historyHook.activeHistoryIndex();
                if (activeIdx >= 0 && activeIdx < history.length) {
                  props.onSearchChange(history[activeIdx]);
                }
                props.historyHook.addSearchToHistory(props.searchQuery);
                props.historyHook.setShowHistoryDropdown(false);
                return;
              }
              if (e.key === "Escape" || e.key === "Tab") {
                e.stopPropagation();
                props.historyHook.setShowHistoryDropdown(false);
                return;
              }
            } else if (e.key === "Enter") {
              props.historyHook.addSearchToHistory(props.searchQuery);
            }
          }}
          placeholder={t("sidebar.searchPlaceholder")}
          class="w-full bg-surface border border-border focus:border-accent text-text-primary pl-9 pr-14 py-2 text-sm rounded-xl outline-none transition-all placeholder:text-text-secondary/50"
        />
        <Show when={props.searchQuery}>
          <button
            onClick={() => props.onSearchChange("")}
            class="absolute right-9 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </Show>
        <button
          onClick={() => props.setShowFilters((prev) => !prev)}
          title={t("sidebar.filters")}
          class={`absolute right-2.5 p-1 rounded-lg transition-colors cursor-pointer ${
            props.showFilters || props.selectedSources.size > 0
              ? "text-accent bg-accent/10"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Filter class="w-4 h-4" />
        </button>
      </div>

      <SearchHistoryOverlay
        showHistoryDropdown={props.historyHook.showHistoryDropdown()}
        searchHistory={props.historyHook.searchHistory()}
        activeHistoryIndex={props.historyHook.activeHistoryIndex()}
        onSelectHistoryItem={props.historyHook.selectHistoryItem}
        onRemoveFromHistory={props.historyHook.removeFromHistory}
        onClearHistory={props.historyHook.clearHistory}
        dropdownRef={props.historyHook.setDropdownRef}
      />
    </div>
  );
};
