import { For, Show } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { Layers } from "lucide-solid";

interface SourceDetectedModalProps {
  isOpen: boolean;
  detectedSources: Record<string, boolean>;
  onToggleSource: (sourceId: string) => void;
  onIgnoreAll: () => void;
  onSave: () => void;
  getSourceDisplayNameById: (id: string) => string;
}

export const SourceDetectedModal = (props: SourceDetectedModalProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/75 z-[69] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
        <div class="w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
          {/* Header info */}
          <div class="flex items-center gap-3">
            <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
              <Layers class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
                {t("settings.sources.detectedMultiPromptTitle")}
              </h3>
              <span class="text-[0.5625rem] font-mono bg-accent/15 border border-accent/20 rounded text-accent px-1.5 py-0.5 font-semibold">
                {t("settings.sources.detectedMultiPromptBadge")}
              </span>
            </div>
          </div>

          {/* Description Details */}
          <div class="text-xs leading-relaxed text-text-secondary">
            {t("settings.sources.detectedMultiPromptMessage")}
          </div>

          {/* Detected sources checkboxes list */}
          <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            <For each={Object.entries(props.detectedSources)}>
              {([sourceId, allowed]) => (
                <label class="relative flex items-center justify-between p-3 rounded-xl bg-background/30 hover:bg-background/60 border border-border/40 hover:border-accent/30 transition-all cursor-pointer select-none">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                      <Layers class="w-4 h-4" />
                    </div>
                    <span class="text-xs font-semibold text-text-primary">
                      {props.getSourceDisplayNameById(sourceId)}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowed}
                    onChange={() => props.onToggleSource(sourceId)}
                    class="w-4.5 h-4.5 rounded border-border/80 text-accent focus:ring-accent accent-accent transition-all cursor-pointer"
                  />
                </label>
              )}
            </For>
          </div>

          {/* Reassurance Callouts */}
          <div class="flex flex-col gap-1.5 p-3 rounded-xl bg-background/50 border border-border/40 text-[0.625rem] text-text-secondary leading-relaxed">
            <div>{t("settings.sources.detectedMultiPromptFootnotePrivate")}</div>
            <div>{t("settings.sources.detectedMultiPromptFootnoteEmpty")}</div>
          </div>

          {/* Actions */}
          <div class="flex gap-3 w-full pt-1">
            <button
              onClick={props.onIgnoreAll}
              class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              {t("settings.sources.detectedMultiPromptDenyAll")}
            </button>
            <button
              onClick={props.onSave}
              class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
            >
              <span>{t("settings.sources.detectedMultiPromptAllowSelected")}</span>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
