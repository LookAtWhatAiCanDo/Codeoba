import { For, Show } from "solid-js";
import { useI18n } from "../../../i18n/i18n";
import { Category } from "../types";

export interface PermissionEntry {
  path: string;
  preview: string;
  external: string;
}

export interface PermissionsTabProps {
  activeCategory: Category;
  permissions: PermissionEntry[];
  onResetPermission: (path: string, type: "preview" | "external" | "all") => void;
  onClearAllPermissions: () => void;
}

export const PermissionsTab = (props: PermissionsTabProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.activeCategory === "permissions"}>
      {/* Path Permissions Tab */}
      <div class="space-y-3">
        <div class="flex items-center justify-between border-b border-border/30 pb-2 mb-2 flex-shrink-0">
          <h3 class="text-sm font-bold uppercase tracking-wider text-text-secondary">
            {t("settings.permissions.title")}
          </h3>
          <Show when={props.permissions.length > 0}>
            <button
              onClick={props.onClearAllPermissions}
              class="px-2.5 py-1.5 bg-background hover:bg-red-500/10 border border-border hover:border-red-500/20 rounded-xl text-red-400 transition-all text-xs font-semibold cursor-pointer"
            >
              {t("settings.permissions.clearAll")}
            </button>
          </Show>
        </div>

        <Show
          when={props.permissions.length > 0}
          fallback={
            <div class="flex-grow flex flex-col items-center justify-center p-8 text-text-secondary select-none text-xs">
              {t("settings.permissions.noPermissions")}
            </div>
          }
        >
          <div class="space-y-3">
            <For each={props.permissions}>
              {(p) => (
                <div class="bg-surface/30 border border-border/50 rounded-2xl py-3 px-4 space-y-3">
                  <div class="space-y-1">
                    <div
                      class="text-xs font-mono font-bold text-text-primary truncate"
                      title={p.path}
                    >
                      {p.path}
                    </div>
                    <div class="flex gap-4 text-[0.625rem] text-text-secondary/70">
                      <span>
                        {t("fileViewer.title")}:{" "}
                        <span class={p.preview === "allow" ? "text-accent font-semibold" : ""}>
                          {p.preview}
                        </span>
                      </span>
                      <span>
                        {t("settings.permissions.external")}:{" "}
                        <span class={p.external === "allow" ? "text-accent font-semibold" : ""}>
                          {p.external}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div class="flex gap-2 justify-end border-t border-border/20 pt-2.5 text-[0.65625rem]">
                    <Show when={p.preview !== "ask"}>
                      <button
                        onClick={() => props.onResetPermission(p.path, "preview")}
                        class="px-2.5 py-1.5 bg-background hover:bg-surface border border-border rounded-xl text-text-primary transition-all font-semibold cursor-pointer"
                      >
                        {t("settings.permissions.resetPreview")}
                      </button>
                    </Show>
                    <Show when={p.external !== "ask"}>
                      <button
                        onClick={() => props.onResetPermission(p.path, "external")}
                        class="px-2.5 py-1.5 bg-background hover:bg-surface border border-border rounded-xl text-text-primary transition-all font-semibold cursor-pointer"
                      >
                        {t("settings.permissions.resetExternal")}
                      </button>
                    </Show>
                    <button
                      onClick={() => props.onResetPermission(p.path, "all")}
                      class="px-2.5 py-1.5 bg-background hover:bg-red-500/10 border border-border hover:border-red-500/20 rounded-xl text-red-400 transition-all font-semibold cursor-pointer shadow-red-500/5 shadow"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};
