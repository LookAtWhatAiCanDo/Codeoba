import { Show } from "solid-js";
import { Bookmark, Clock, Cpu } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { Session } from "../../../types";

export interface SessionMetadataPanelProps {
  session: Session;
  loadTime: string | null;
  formatFullDate: (timestamp: number) => string;
}

export const SessionMetadataPanel = (props: SessionMetadataPanelProps) => {
  const { t } = useI18n();

  return (
    <div class="p-4 bg-surface/30 border border-border/40 rounded-2xl flex flex-wrap gap-y-3 gap-x-6 text-xs text-text-secondary/70">
      <div class="flex items-center gap-1.5">
        <Bookmark class="w-3.5 h-3.5 text-accent" />
        <span class="font-semibold text-text-primary">{t("settings.agents.tab")}:</span>
        <span class="capitalize">{props.session.sourceId}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <Clock class="w-3.5 h-3.5 text-accent" />
        <span class="font-semibold text-text-primary">{t("detailPane.startedOn")}:</span>
        <span>
          {props.formatFullDate(props.session.turns[0]?.timestamp || props.session.timestamp)}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <Cpu class="w-3.5 h-3.5 text-accent" />
        <span class="font-semibold text-text-primary">{t("dashboard.totalTurns")}:</span>
        <span>{props.session.turns.length}</span>
      </div>
      <Show when={props.loadTime}>
        <div class="flex items-center gap-1.5">
          <Clock class="w-3.5 h-3.5 text-accent animate-pulse" />
          <span class="font-semibold text-text-primary">{t("dashboard.duration")}:</span>
          <span class="font-mono text-accent">{props.loadTime}</span>
        </div>
      </Show>
    </div>
  );
};
