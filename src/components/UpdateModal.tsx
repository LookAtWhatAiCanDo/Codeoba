import { Show, createMemo } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { X, Download, AlertCircle } from "lucide-solid";

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

  const releaseNotes = createMemo(() => {
    const manifest = props.updateManifest;
    if (!manifest) return "";
    const rawNotes = manifest.body || manifest.notes || manifest.rawJson?.notes || manifest.rawJson?.body || "";
    return rawNotes.trim();
  });

  return (
    <Show when={props.isOpen && props.updateManifest}>
      <div class="fixed inset-0 bg-black/75 z-[1000] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
        <div class="w-[600px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
          
          {/* Close button - only show if NOT currently installing an update */}
          <Show when={!props.isUpdating}>
            <button 
              onClick={props.onClose}
              class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              <X class="w-4 h-4" />
            </button>
          </Show>

          {/* Header info */}
          <div class="flex items-center gap-3">
            <div class="p-2.5 bg-accent/10 border border-accent/20 text-accent rounded-xl">
              <Show
                when={props.isUpdating}
                fallback={<RotateCwClean class="w-5 h-5" />}
              >
                <RotateCwClean class="w-5 h-5 animate-spin origin-center" />
              </Show>
            </div>
            <div>
              <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
                {t("updater.title")}
              </h3>
              <p class="text-sm text-text-secondary/90">{t("updater.description", { version: props.updateManifest.version })}</p>
            </div>
          </div>

          {/* Version Details */}
          <div class="bg-background/50 border border-border/40 rounded-xl p-4 space-y-2 text-sm">
            <div class="flex items-center justify-between font-semibold">
              <span class="text-text-secondary">Version:</span>
              <span class="text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full text-xs">
                v{props.updateManifest.version}
              </span>
            </div>
            
            <Show when={releaseNotes()}>
              <div class="border-t border-border/30 pt-3 space-y-2">
                <span class="text-text-secondary font-semibold">Release Notes:</span>
                <div class="max-h-64 overflow-y-auto bg-background/30 p-3 rounded-xl border border-border/20 text-left update-notes-container">
                  <MarkdownRenderer content={releaseNotes()} />
                </div>
              </div>
            </Show>
          </div>

          {/* Status & Progress Bar */}
          <Show when={props.isUpdating}>
            <div class="space-y-2">
              <div class="flex justify-between text-[10px] font-semibold text-text-secondary">
                <span>{t("updater.downloading", { progress: props.updateProgress })}</span>
                <span class="text-accent">{props.updateProgress}%</span>
              </div>
              <div class="w-full h-1.5 bg-background rounded-full overflow-hidden border border-border/40">
                <div 
                  class="h-full bg-accent transition-all duration-300 rounded-full"
                  style={{ width: `${props.updateProgress}%` }}
                />
              </div>
            </div>
          </Show>

          {/* Error Message */}
          <Show when={props.updateError}>
            <div class="bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[10px] text-red-400">
              <AlertCircle class="w-4 h-4 flex-shrink-0" />
              <span class="truncate flex-1">{t("updater.failed", { error: props.updateError || "" })}</span>
            </div>
          </Show>

          {/* Actions */}
          <div class="flex gap-3 w-full pt-1">
            <Show when={!props.isUpdating}>
              <button
                onClick={props.onClose}
                class="flex-1 py-2 border border-border bg-background hover:bg-surface rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {t("updater.later")}
              </button>
              <button
                onClick={props.onStartUpdate}
                class="flex-1 py-2 bg-accent hover:bg-accent/90 border border-accent/20 rounded-xl text-xs font-semibold text-background hover:text-background transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <Download class="w-3.5 h-3.5" />
                <span>{t("updater.updateBtn")}</span>
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
