import { For, Show } from "solid-js";
import { Trash2, AlertTriangle } from "lucide-solid";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../../i18n/i18n";
import { SourceMetadata } from "../../../types";
import { Category } from "../types";

export interface SourcesTabProps {
  activeCategory: Category;
  sources: SourceMetadata[];
  getSourceDecision: (sourceId: string) => "allow" | "deny" | "ask";
  onToggleSourceDecision: (sourceId: string, decision: "allow" | "deny" | "ask") => void;
  deletingSourceId: string | null;
  setDeletingSourceId: (id: string | null) => void;
  onDeleteSourceData: (sourceId: string) => void;
}

export const SourcesTab = (props: SourcesTabProps) => {
  const { t } = useI18n();

  const getDeletingSourceDisplayName = () => {
    const id = props.deletingSourceId;
    if (!id) return "";
    const found = props.sources?.find((s) => s.id === id);
    return found ? found.displayName : id;
  };

  return (
    <>
      <Show when={props.activeCategory === "sources"}>
        {/* Sources & Adapters Tab */}
        <div class="space-y-3">
          <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">
            {t("settings.agents.title")}
          </h3>

          <div class="space-y-3">
            <For each={props.sources}>
              {(src) => {
                const dec = props.getSourceDecision(src.id);
                return (
                  <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="text-xs font-bold text-text-primary">{src.displayName}</h4>
                        <Show when={src.productUrl && !src.isAvailable}>
                          <button
                            onClick={() => openUrl(src.productUrl!)}
                            class="text-[0.625rem] text-accent hover:text-accent/80 hover:underline transition-all cursor-pointer font-medium"
                            title={t("settings.agents.getInstaller")}
                          >
                            {t("settings.agents.getInstaller")}
                          </button>
                        </Show>
                      </div>
                      <p class="text-[0.625rem] text-text-secondary/70 truncate">
                        {t("settings.agents.status")}:{" "}
                        {src.isAvailable
                          ? t("settings.agents.available")
                          : t("settings.agents.notInstalled")}
                      </p>
                    </div>

                    <div class="flex items-center gap-2">
                      {/* Segmented controls for allow/deny/ask */}
                      <div class="flex bg-background p-0.5 rounded-lg border border-border/50 text-[0.625rem] font-semibold text-text-primary">
                        <For each={["allow", "deny", "ask"] as const}>
                          {(option) => (
                            <button
                              onClick={() => props.onToggleSourceDecision(src.id, option)}
                              class={`px-2 py-1 rounded transition-all cursor-pointer ${
                                dec === option
                                  ? "bg-surface text-accent font-bold"
                                  : "text-text-secondary hover:text-text-primary"
                              }`}
                            >
                              {
                                {
                                  allow: t("settings.agents.allow"),
                                  deny: t("settings.agents.deny"),
                                  ask: t("settings.agents.ask"),
                                }[option]
                              }
                            </button>
                          )}
                        </For>
                      </div>

                      {/* Trash button to delete source cache */}
                      <button
                        onClick={() => props.setDeletingSourceId(src.id)}
                        title={t("settings.agents.deleteDataTooltip")}
                        class="p-2 bg-background hover:bg-red-500/10 border border-border hover:border-red-500/20 rounded-xl text-text-secondary hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Delete Data Confirmation Scrim overlay */}
      <Show when={props.deletingSourceId !== null}>
        <div class="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div class="w-[400px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col items-center gap-4 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <AlertTriangle class="w-12 h-12 text-red-500 animate-pulse" />
            <h3 class="text-base font-bold text-red-500 uppercase tracking-wide">
              {t("settings.agents.deleteData")}?
            </h3>
            <p class="text-xs text-text-secondary/80 leading-relaxed">
              {t("settings.agents.confirmDeleteSource", {
                source: getDeletingSourceDisplayName(),
              })}
            </p>
            <div class="flex gap-3 w-full pt-2">
              <button
                onClick={() => props.setDeletingSourceId(null)}
                class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => props.onDeleteSourceData(props.deletingSourceId!)}
                class="flex-1 py-2 bg-red-500 hover:bg-red-600 border border-red-600 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer shadow-md"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};
