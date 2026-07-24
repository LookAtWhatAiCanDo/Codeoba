import { For, Show, createMemo } from "solid-js";
import { Layers, Activity, Archive, Trash2, Volume2 } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { SourceMetadata, ArchivalFilter } from "../../../types";

export interface SidebarFilterBarProps {
  showFilters: boolean;
  sources: SourceMetadata[];
  selectedSources: Set<string>;
  onToggleSource: (sourceId: string) => void;
  sourceCounts: Record<string, number>;
  archivalFilter: ArchivalFilter;
  onArchivalFilterChange: (filter: ArchivalFilter) => void;
  archivalCounts: Record<string, number>;
  pruneDeleted: boolean;
  width: number;
  fontSize?: number;
}

export const SidebarFilterBar = (props: SidebarFilterBarProps) => {
  const { t } = useI18n();

  const tabOptions = createMemo(() => {
    return props.pruneDeleted
      ? ([
          ArchivalFilter.All,
          ArchivalFilter.Active,
          ArchivalFilter.Archived,
          ArchivalFilter.ReadAloud,
        ] as const)
      : ([
          ArchivalFilter.All,
          ArchivalFilter.Active,
          ArchivalFilter.Archived,
          ArchivalFilter.Deleted,
          ArchivalFilter.ReadAloud,
        ] as const);
  });

  const gridClasses = createMemo(() => {
    const count = tabOptions().length;
    const currentFontSize = props.fontSize || 15;

    const lowerBreakpoint = currentFontSize * 24;
    const upperBreakpoint = currentFontSize * 38;

    if (props.width < lowerBreakpoint) {
      return "grid grid-cols-2";
    }
    if (props.width < upperBreakpoint) {
      return "grid grid-cols-3";
    }
    if (count === 4) {
      return "grid grid-cols-4";
    }
    return "grid grid-cols-5";
  });

  return (
    <Show when={props.showFilters}>
      <div class="p-3 bg-surface/50 border border-border/80 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Source checkboxes */}
        <div class="space-y-1.5">
          <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t("sidebar.agents")}
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <For each={props.sources}>
              {(src) => {
                const isChecked = createMemo(() => props.selectedSources.has(src.id));
                return (
                  <label
                    class={`flex items-center gap-2 px-2.5 py-1.5 border rounded-lg text-xs cursor-pointer transition-all ${
                      isChecked()
                        ? "bg-accent/10 border-accent/40 text-accent font-medium"
                        : "border-border/40 hover:bg-surface text-text-secondary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked()}
                      onChange={() => props.onToggleSource(src.id)}
                      class="hidden"
                    />
                    <span class="flex items-center gap-1">
                      {src.displayName}
                      <span class="text-[0.625rem] opacity-60 ml-0.5">
                        ({props.sourceCounts[src.id] || 0})
                      </span>
                    </span>
                  </label>
                );
              }}
            </For>
          </div>
        </div>

        {/* Archival segmented controls */}
        <div class="space-y-1.5">
          <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t("sidebar.statusFilter")}
          </div>
          <div class={`${gridClasses()} gap-1 bg-surface p-1 rounded-lg border border-border/60`}>
            <For each={tabOptions()}>
              {(tab) => (
                <button
                  onClick={() => {
                    if (props.archivalFilter === tab) {
                      props.onArchivalFilterChange(ArchivalFilter.All);
                    } else {
                      props.onArchivalFilterChange(tab);
                    }
                  }}
                  class={`flex-1 text-center py-1 text-xs rounded-md transition-all cursor-pointer ${
                    props.archivalFilter === tab
                      ? "bg-background text-accent border border-border font-medium shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span class="flex items-center justify-center gap-1.5">
                    <Show when={tab === ArchivalFilter.All}>
                      <Layers class="w-3.5 h-3.5 shrink-0" />
                    </Show>
                    <Show when={tab === ArchivalFilter.Active}>
                      <Activity class="w-3.5 h-3.5 shrink-0" />
                    </Show>
                    <Show when={tab === ArchivalFilter.Archived}>
                      <Archive class="w-3.5 h-3.5 shrink-0" />
                    </Show>
                    <Show when={tab === ArchivalFilter.Deleted}>
                      <Trash2 class="w-3.5 h-3.5 text-red-500 shrink-0" />
                    </Show>
                    <Show when={tab === ArchivalFilter.ReadAloud}>
                      <Volume2 class="w-3.5 h-3.5 shrink-0" />
                    </Show>
                    <span>
                      {
                        {
                          [ArchivalFilter.All]: t("sidebar.filterAll"),
                          [ArchivalFilter.Active]: t("sidebar.filterActive"),
                          [ArchivalFilter.Archived]: t("sidebar.filterArchived"),
                          [ArchivalFilter.Deleted]: t("sidebar.filterDeleted"),
                          [ArchivalFilter.ReadAloud]: t("sidebar.filterReadAloud"),
                        }[tab]
                      }
                    </span>
                    <span class="text-[0.625rem] opacity-60 ml-0.5">
                      ({props.archivalCounts[tab] || 0})
                    </span>
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
};
