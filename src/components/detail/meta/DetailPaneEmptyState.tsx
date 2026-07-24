import { MessageSquare } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";

export const DetailPaneEmptyState = () => {
  const { t } = useI18n();

  return (
    <div class="flex-grow h-full flex flex-col items-center justify-center bg-background/95 text-text-secondary select-none">
      <MessageSquare class="w-16 h-16 mb-4 text-border animate-pulse" />
      <p class="text-[0.9375rem] font-medium tracking-wide">{t("detailPane.selectSession")}</p>
    </div>
  );
};
