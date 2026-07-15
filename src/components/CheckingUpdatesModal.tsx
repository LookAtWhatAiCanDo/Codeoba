import { Show } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { X, CheckCircle, AlertTriangle } from "lucide-solid";

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

interface CheckingUpdatesModalProps {
  isOpen: boolean;
  status: "checking" | "upToDate" | "error";
  errorMsg: string | null;
  onClose: () => void;
}

export const CheckingUpdatesModal = (props: CheckingUpdatesModalProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/75 z-[1100] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-md">
        <div class="w-[420px] bg-surface border border-border/80 p-6 rounded-2xl flex flex-col items-center gap-5 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center">
          {/* Close button */}
          <button
            onClick={() => props.onClose()}
            class="absolute top-4 right-4 p-1.5 bg-background hover:bg-surface border border-border/60 rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>

          {/* Status Icon */}
          <div class="mt-4 flex justify-center">
            <Show when={props.status === "checking"}>
              <div class="p-4 bg-accent/10 border border-accent/20 text-accent rounded-full animate-spin">
                <RotateCwClean class="w-8 h-8" />
              </div>
            </Show>
            <Show when={props.status === "upToDate"}>
              <div class="p-4 bg-green-500/10 border border-green-500/20 text-green-500 rounded-full">
                <CheckCircle class="w-8 h-8" />
              </div>
            </Show>
            <Show when={props.status === "error"}>
              <div class="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full">
                <AlertTriangle class="w-8 h-8" />
              </div>
            </Show>
          </div>

          {/* Title & Message */}
          <div class="space-y-2 w-full">
            <h3 class="text-sm font-bold text-text-primary uppercase tracking-wider">
              {t("settings.updates.checkUpdate")}
            </h3>
            <div class="text-sm text-text-secondary break-words max-h-32 overflow-y-auto px-2">
              <Show when={props.status === "checking"}>{t("settings.updates.checking")}</Show>
              <Show when={props.status === "upToDate"}>{t("settings.updates.upToDate")}</Show>
              <Show when={props.status === "error"}>
                {props.errorMsg || t("settings.updates.error", { error: "Unknown error" })}
              </Show>
            </div>
          </div>

          {/* Action button */}
          <div class="w-full pt-2">
            <button
              onClick={() => props.onClose()}
              class="w-full py-2 bg-background hover:bg-surface border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-all cursor-pointer"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
