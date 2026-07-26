import { Show, createMemo } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { X, Download, AlertTriangle } from "lucide-solid";
import { BaseModal } from "./common/BaseModal";

const RotateCwClean = (props: { class?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class={props.class}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.72 2.78L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

interface UpdateModalProps {
  isOpen: boolean;
  updateManifest: any;
  isUpdating: boolean;
  updateProgress: number;
  updateError: string | null;
  onClose: () => void;
  onStartUpdate: () => void;
}

export const UpdateModal = (props: UpdateModalProps) => {
  const { t } = useI18n();

  const releaseNotesClean = createMemo(() => {
    if (!props.updateManifest?.body) return "";
    let rawNotes = props.updateManifest.body as string;
    rawNotes = rawNotes.replace(/See the assets to download the payload\s*/gi, "");
    return rawNotes.trim();
  });

  return (
    <BaseModal
      isOpen={Boolean(props.isOpen && props.updateManifest)}
      onClose={props.onClose}
      closeOnEsc={!props.isUpdating}
      closeOnBackdropClick={!props.isUpdating}
      backdropClass="fixed inset-0 bg-black/75 z-[1000] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md"
      class="w-[600px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200"
    >
      {/* Close button - only show if NOT currently installing an update */}
      <Show when={!props.isUpdating}>
        <button
          onClick={() => props.onClose()}
          class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </Show>

      {/* Header info */}
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
          <Show when={props.isUpdating} fallback={<RotateCwClean class="w-5 h-5" />}>
            <RotateCwClean class="w-5 h-5 animate-spin" />
          </Show>
        </div>
        <div>
          <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
            {props.isUpdating ? t("updater.downloadingTitle") : t("updater.availableTitle")}
          </h3>
          <p class="text-xs text-text-secondary">
            {t("updater.versionLabel", { version: props.updateManifest?.version || "" })}
          </p>
        </div>
      </div>

      {/* Main Body */}
      <Show
        when={!props.isUpdating}
        fallback={
          <div class="space-y-4 py-2">
            <div class="space-y-2">
              <div class="flex justify-between text-xs font-semibold">
                <span class="text-text-primary">{t("updater.installingProgress")}</span>
                <span class="text-accent">{props.updateProgress}%</span>
              </div>
              <div class="w-full h-2 bg-background border border-border/50 rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent transition-all duration-300 rounded-full"
                  style={{ width: `${props.updateProgress}%` }}
                />
              </div>
            </div>
            <p class="text-xs text-text-secondary/70 text-center animate-pulse">
              {t("updater.doNotClose")}
            </p>
          </div>
        }
      >
        {/* Release Notes */}
        <Show when={releaseNotesClean()}>
          <div class="space-y-1.5">
            <span class="text-[0.6875rem] font-bold text-text-secondary/80 uppercase tracking-wider">
              {t("updater.releaseNotes")}
            </span>
            <div class="max-h-48 overflow-y-auto bg-background/50 border border-border/60 rounded-xl p-3.5 text-xs text-text-secondary font-mono leading-relaxed whitespace-pre-wrap select-text custom-scrollbar">
              {releaseNotesClean()}
            </div>
          </div>
        </Show>

        <Show when={!releaseNotesClean()}>
          <p class="text-xs text-text-secondary py-2">{t("updater.noReleaseNotes")}</p>
        </Show>
      </Show>

      {/* Error Callout */}
      <Show when={props.updateError}>
        <div class="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2">
          <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div class="break-words max-w-full">
            <span class="font-semibold">{t("updater.updateErrorTitle")}: </span>
            <span>{props.updateError}</span>
          </div>
        </div>
      </Show>

      {/* Actions */}
      <div class="flex justify-end gap-3 pt-2">
        <Show when={!props.isUpdating}>
          <button
            onClick={() => props.onClose()}
            class="px-4 py-2 bg-background hover:bg-surface border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            {t("updater.remindMeLater")}
          </button>
          <button
            onClick={() => props.onStartUpdate()}
            class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{t("updater.updateBtn")}</span>
          </button>
        </Show>
      </div>
    </BaseModal>
  );
};
