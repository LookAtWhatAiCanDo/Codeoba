import { Show } from "solid-js";
import { Cpu } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";

export interface SessionSummaryCardProps {
  summary?: string | null;
}

export const SessionSummaryCard = (props: SessionSummaryCardProps) => {
  const { t } = useI18n();

  return (
    <Show when={props.summary}>
      <div class="p-5 bg-accent/5 border border-accent/20 rounded-2xl space-y-2 animate-in fade-in duration-300">
        <div class="flex items-center gap-2 text-accent">
          <Cpu class="w-4 h-4" />
          <h3 class="text-xs font-bold uppercase tracking-wider">
            {t("detailPane.aiSummaryTitle")}
          </h3>
        </div>
        <p class="text-[0.8125rem] text-text-secondary leading-relaxed whitespace-pre-wrap select-text">
          {props.summary}
        </p>
      </div>
    </Show>
  );
};
