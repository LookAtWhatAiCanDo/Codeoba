import { Show } from "solid-js";
import { useI18n } from "../../../i18n/i18n";

export interface DeleteGroupModalProps {
  deletingGroupName: string | null;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void>;
}

export const DeleteGroupModal = (props: DeleteGroupModalProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.deletingGroupName}>
      {(groupName) => (
        <div class="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-surface border border-border rounded-xl p-4 shadow-2xl space-y-4 max-w-xs text-center animate-in fade-in zoom-in-95 duration-150">
            <div class="text-sm font-semibold text-text-primary">{t("groups.deleteGroup")}</div>
            <p class="text-xs text-text-secondary leading-normal">
              {t("groups.deleteGroupConfirm", { name: groupName() })}
            </p>
            <div class="flex gap-2 justify-center">
              <button
                onClick={props.onCancel}
                class="px-4 py-1.5 border border-border hover:bg-surface-light text-text-secondary text-xs rounded-lg cursor-pointer transition-all"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={async () => {
                  await props.onConfirm(groupName());
                  props.onCancel();
                }}
                class="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg font-semibold cursor-pointer transition-all"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
