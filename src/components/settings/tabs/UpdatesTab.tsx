import { Show } from "solid-js";
import { RefreshCw } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { Category } from "../types";

export interface UpdatesTabProps {
  activeCategory: Category;
  updaterActive: boolean;
  autoUpdateEnabled: boolean;
  onToggleAutoUpdate: (checked: boolean) => void;
  appVersion: string;
  checkingUpdates: boolean;
  updateCheckResult: string | null;
  updateCheckStatus?: "ok" | "error" | null;
  onCheckUpdates: () => void;
}

export const UpdatesTab = (props: UpdatesTabProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.activeCategory === "updates"}>
      {/* Updates Tab */}
      <div class="space-y-3">
        <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary mb-2">
          {t("settings.updates.title")}
        </h3>

        {/* Auto Update Check */}
        <Show
          when={props.updaterActive}
          fallback={
            <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 text-center text-xs text-text-secondary">
              {t("settings.updates.notActive")}
            </div>
          }
        >
          <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-xs font-bold text-text-primary font-sans">
                  {t("settings.updates.autoUpdate")}
                </h4>
                <p class="text-[0.625rem] text-text-secondary/70">
                  {t("settings.updates.autoUpdateDesc")}
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.autoUpdateEnabled}
                  onChange={(e) => props.onToggleAutoUpdate(e.currentTarget.checked)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-background peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-background" />
              </label>
            </div>
            <div class="flex items-center justify-between pt-1 text-[0.6875rem] border-t border-border/30">
              <span class="text-text-secondary">
                {t("settings.updates.version")}: v{props.appVersion}
              </span>
              <button
                onClick={props.onCheckUpdates}
                disabled={props.checkingUpdates}
                class="px-3 py-1.5 bg-background hover:bg-surface border border-border rounded-xl text-accent hover:text-accent-hover transition-colors text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 min-w-[120px]"
              >
                <Show
                  when={props.checkingUpdates}
                  fallback={<span>{t("settings.updates.checkUpdate")}</span>}
                >
                  <RefreshCw class="w-3.5 h-3.5 animate-spin" />
                  <span>{t("settings.updates.checking")}</span>
                </Show>
              </button>
            </div>
            <Show when={props.updateCheckResult}>
              <div
                class="text-[0.6875rem] font-semibold"
                classList={{
                  "text-red-400": props.updateCheckStatus === "error",
                  "text-emerald-400": props.updateCheckStatus !== "error",
                }}
              >
                {props.updateCheckResult}
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};
