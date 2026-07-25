import { Show } from "solid-js";
import { Search, X, ChevronUp, ChevronDown } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";

export interface DetailSearchOverlayProps {
  showDetailSearch: boolean;
  detailSearchQuery: string;
  setDetailSearchQuery: (val: string) => void;
  detailMatchCase: boolean;
  setDetailMatchCase: (val: boolean) => void;
  detailWholeWord: boolean;
  setDetailWholeWord: (val: boolean) => void;
  detailUseRegex: boolean;
  setDetailUseRegex: (val: boolean) => void;
  activeMatchIndex: number;
  setActiveMatchIndex: (val: number) => void;
  matchesCount: number;
  navigateToMatch: (index: number) => void;
  onClose: () => void;
  searchInputRef?: (el: HTMLInputElement) => void;
}

export const DetailSearchOverlay = (props: DetailSearchOverlayProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.showDetailSearch}>
      <div
        id="detail-search-bar"
        class="absolute right-8 z-50 flex items-center gap-2 p-1.5 bg-surface/95 border border-border hover:border-border/80 rounded-xl shadow-xl glass animate-in slide-in-from-top-2 duration-150"
        style={{
          top: "calc(4.75rem + 8px)",
        }}
      >
        <div class="relative flex items-center">
          <Search class="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-text-secondary/60 pointer-events-none" />
          <input
            id="detail-search-input"
            ref={props.searchInputRef}
            type="text"
            value={props.detailSearchQuery}
            onInput={(e) => {
              props.setDetailSearchQuery(e.currentTarget.value);
              props.setActiveMatchIndex(0);
              props.navigateToMatch(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  props.navigateToMatch(props.activeMatchIndex - 1);
                } else {
                  props.navigateToMatch(props.activeMatchIndex + 1);
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                props.onClose();
              }
            }}
            placeholder={t("menu.find.findDetail")}
            class="w-[200px] bg-background/50 border border-border/60 focus:border-accent text-text-primary pl-8 pr-16 py-1.5 text-xs rounded-lg outline-none transition-all placeholder:text-text-secondary/40 h-[30px]"
          />

          {/* Match count and clear button */}
          <div class="absolute right-2 flex items-center gap-1.5 text-[0.625rem] text-text-secondary/60 select-none">
            <span>
              {props.matchesCount > 0
                ? `${props.activeMatchIndex + 1}/${props.matchesCount}`
                : "0/0"}
            </span>
            <Show when={props.detailSearchQuery.length > 0}>
              <button
                onClick={() => {
                  props.setDetailSearchQuery("");
                  props.setActiveMatchIndex(0);
                }}
                class="p-0.5 hover:text-text-primary transition-colors cursor-pointer"
              >
                <X class="w-3 h-3" />
              </button>
            </Show>
          </div>
        </div>

        {/* Navigation arrows */}
        <div class="flex items-center gap-0.5 border-l border-border/60 pl-1">
          <button
            onClick={() => props.navigateToMatch(props.activeMatchIndex - 1)}
            title={t("detailPane.search.previousMatch")}
            class="p-1 hover:bg-surface/80 hover:text-text-primary text-text-secondary/70 rounded transition-all cursor-pointer disabled:opacity-40"
            disabled={props.matchesCount === 0}
          >
            <ChevronUp class="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => props.navigateToMatch(props.activeMatchIndex + 1)}
            title={t("detailPane.search.nextMatch")}
            class="p-1 hover:bg-surface/80 hover:text-text-primary text-text-secondary/70 rounded transition-all cursor-pointer disabled:opacity-40"
            disabled={props.matchesCount === 0}
          >
            <ChevronDown class="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Modifiers */}
        <div class="flex items-center gap-1 border-l border-border/60 pl-1 select-none">
          {/* Case Sensitivity */}
          <button
            onClick={() => {
              props.setDetailMatchCase(!props.detailMatchCase);
              props.navigateToMatch(0);
            }}
            title={t("sidebar.matchCase")}
            class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
              props.detailMatchCase
                ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
            }`}
          >
            Aa
          </button>

          {/* Whole Word */}
          <button
            onClick={() => {
              props.setDetailWholeWord(!props.detailWholeWord);
              props.navigateToMatch(0);
            }}
            title={t("sidebar.wholeWord")}
            class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
              props.detailWholeWord
                ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
            }`}
          >
            \b
          </button>

          {/* Regex */}
          <button
            onClick={() => {
              props.setDetailUseRegex(!props.detailUseRegex);
              props.navigateToMatch(0);
            }}
            title={t("sidebar.useRegex")}
            class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
              props.detailUseRegex
                ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
            }`}
          >
            .*
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={props.onClose}
          title={t("detailPane.search.close")}
          class="p-1 hover:bg-surface/80 hover:text-red-400 text-text-secondary/60 rounded transition-all border-l border-border/60 pl-1.5 cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </Show>
  );
};
