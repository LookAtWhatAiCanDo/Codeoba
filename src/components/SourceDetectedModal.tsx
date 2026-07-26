import { For } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { Layers } from "lucide-solid";
import { BaseModal } from "./common/BaseModal";

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
    <BaseModal
      isOpen={props.isOpen}
      onClose={props.onIgnoreAll}
      backdropClass="fixed inset-0 bg-black/75 z-[69] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md"
      class="w-[520px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200"
    >
      {/* Header info */}
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
          <Layers class="w-5 h-5" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
            {t("settings.agents.detectedMultiPromptTitle")}
          </h3>
          <span class="text-[0.5625rem] font-mono bg-accent/15 border border-accent/20 rounded text-accent px-1.5 py-0.5 font-semibold">
            {t("settings.agents.detectedMultiPromptBadge")}
          </span>
        </div>
      </div>

      {/* Description Details */}
      <div class="text-xs leading-relaxed text-text-secondary">
        {t("settings.agents.detectedMultiPromptMessage")}
      </div>

      {/* Options Toggles Container */}
      <div class="bg-background/50 border border-border/40 rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
        <For each={Object.entries(props.detectedSources)}>
          {([sourceId, enabled]) => (
            <label class="flex items-center justify-between p-2 rounded-lg hover:bg-surface/50 transition-colors cursor-pointer text-xs">
              <span class="font-medium text-text-primary">
                {props.getSourceDisplayNameById(sourceId)}
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => props.onToggleSource(sourceId)}
                class="accent-accent w-4 h-4 rounded cursor-pointer"
              />
            </label>
          )}
        </For>
      </div>

      {/* Action Buttons */}
      <div class="flex gap-3 pt-2">
        <button
          onClick={() => props.onIgnoreAll()}
          class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
        >
          {t("settings.agents.detectedMultiPromptDenyAll")}
        </button>
        <button
          onClick={() => props.onSave()}
          class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
        >
          <span>{t("settings.agents.detectedMultiPromptAllowSelected")}</span>
        </button>
      </div>
    </BaseModal>
  );
};
