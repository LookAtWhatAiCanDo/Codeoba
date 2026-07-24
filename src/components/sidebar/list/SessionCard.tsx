import { createMemo, For, Show } from "solid-js";
import { Pin, Archive, Clock, MessageSquare, Cpu, Bolt, Trash2, Volume2 } from "lucide-solid";
import { useI18n } from "../../../i18n/i18n";
import { useSpeech } from "../../../utils/useSpeech";
import { getStatusBadge, ActiveSpinner } from "../../../utils/sessionStatus";
import { Session } from "../../../types";
import { ConversationGroup } from "../groups/groupTreeUtils";
import {
  getSessionComputeTimeMs,
  getSessionTokensCount,
  formatSpeed,
  formatDuration,
  getSessionModels,
} from "../../../utils/sessionMetrics";

export interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  isHighlighted?: boolean;
  isLoading: boolean;
  onSelect: (session: Session) => void;
  snippet: string;
  sessionTimesText: string;
  score?: number;
  getSourceStyle: (sourceId: string) => string;
  getSourceLabel: (sourceId: string) => string;
  groups: ConversationGroup[];
  isPinned: boolean;
  isReadAloudActive: boolean;
  onContextMenu: (e: MouseEvent, session: Session) => void;
  onTogglePin?: (sessionId: string) => void;
}

export const SessionCard = (props: SessionCardProps) => {
  const { t } = useI18n();
  const speech = useSpeech();
  const title = createMemo(() => props.session.threadName || "Untitled Session");
  const models = createMemo(() => getSessionModels(props.session));
  const durationMs = createMemo(() => getSessionComputeTimeMs(props.session));
  const tokensCount = createMemo(() => getSessionTokensCount(props.session));
  const speedText = createMemo(() => formatSpeed(tokensCount(), durationMs()));
  const formattedDuration = createMemo(() => formatDuration(durationMs()));
  const turnsCount = createMemo(() => props.session.turns.length);
  const formattedTokens = createMemo(() => {
    const t = tokensCount();
    if (t >= 1000000) {
      return `${(t / 1000000).toFixed(1)}M`;
    }
    if (t >= 1000) {
      return `${(t / 1000).toFixed(1)}k`;
    }
    return String(t);
  });

  const sessionGroups = () => props.groups.filter((g) => g.sessionIds?.includes(props.session.id));

  const statusBadge = () => {
    const status = props.session.status;
    return status ? getStatusBadge(status, t) : null;
  };

  return (
    <div
      id={`session-card-${props.session.id}`}
      onClick={() => props.onSelect(props.session)}
      onContextMenu={(e) => props.onContextMenu(e, props.session)}
      draggable={true}
      on:dragstart={(e) => {
        (window as any).activeDraggedSessionId = props.session.id;
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", props.session.id);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      style={
        {
          "-webkit-user-drag": "element",
          "user-drag": "element",
        } as any
      }
      class={`p-4 flex flex-col gap-2.5 cursor-grab active:cursor-grabbing select-none transition-all border rounded-xl group ${
        props.isSelected
          ? "bg-accent-light/20 border-accent ring-2 ring-accent/30 shadow-md shadow-accent/20"
          : props.isHighlighted
            ? "bg-accent-light/10 border-accent/70 ring-2 ring-accent/20 shadow-md shadow-accent/10"
            : "bg-surface/50 border-border hover:bg-surface/80 hover:border-border/80"
      }`}
    >
      {/* Title & Badge & Actions */}
      <div class="flex items-start justify-between gap-3 w-full">
        {/* Title & Time Group (Left side) */}
        <div class="flex flex-col min-w-0 flex-1 gap-0.5">
          <span
            class={`text-[0.84375rem] font-semibold leading-snug break-all line-clamp-2 ${
              props.isSelected ? "text-accent" : "text-text-primary/95"
            }`}
          >
            {title()}
          </span>
          <span class="text-[0.625rem] text-text-secondary/50 font-normal">
            {props.sessionTimesText}
          </span>
        </div>

        {/* Action Controls Group (Right side) */}
        <div class="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          <Show when={props.isLoading}>
            <ActiveSpinner class="w-3.5 h-3.5 text-accent" />
          </Show>
          <Show
            when={props.isReadAloudActive}
            fallback={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  speech.toggleReadAloud(props.session.id, {
                    sourceId: props.session.sourceId,
                    filePath: props.session.filePath,
                  });
                }}
                class="text-text-secondary/35 hover:text-accent transition-all p-0.5 cursor-pointer rounded hover:bg-surface/60 flex items-center justify-center"
                title={t("readAloud.readSessionAloud")}
              >
                <Volume2 class="w-3.5 h-3.5" />
              </button>
            }
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                speech.toggleReadAloud(props.session.id, {
                  sourceId: props.session.sourceId,
                  filePath: props.session.filePath,
                });
              }}
              class="text-accent hover:text-text-secondary transition-colors p-0.5 cursor-pointer rounded hover:bg-accent-light/10 flex items-center justify-center animate-pulse"
              title={t("readAloud.stopReading")}
            >
              <Volume2 class="w-3.5 h-3.5" />
            </button>
          </Show>
          <Show
            when={props.isPinned}
            fallback={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (props.onTogglePin) props.onTogglePin(props.session.id);
                }}
                class="text-text-secondary/35 hover:text-accent transition-all p-0.5 cursor-pointer rounded hover:bg-surface/60 flex items-center justify-center"
                title={t("groups.pinConversation")}
              >
                <Pin class="w-3.5 h-3.5" />
              </button>
            }
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (props.onTogglePin) props.onTogglePin(props.session.id);
              }}
              class="text-accent hover:text-text-secondary transition-colors p-0.5 cursor-pointer rounded hover:bg-accent-light/10 flex items-center justify-center"
              title={t("groups.unpinConversation")}
            >
              <Pin class="w-3.5 h-3.5" />
            </button>
          </Show>
          <Show when={props.session.isArchived}>
            <Archive class="w-3.5 h-3.5 text-text-secondary" />
          </Show>
          <Show when={props.session.isDeleted}>
            <span title={t("sidebar.badgeDeleted")}>
              <Trash2 class="w-3.5 h-3.5 text-red-500" />
            </span>
          </Show>
        </div>
      </div>

      {/* Models & Speed */}
      <Show when={models().length > 0}>
        <div class="flex items-center justify-between gap-2 text-[0.65625rem]">
          <span
            class="text-accent/80 font-medium truncate max-w-[200px]"
            title={models().join(", ")}
          >
            {models().join(", ")}
          </span>
          <Show when={durationMs() > 0}>
            <div class="flex items-center gap-0.5 text-accent font-semibold flex-shrink-0">
              <Bolt class="w-3 h-3" />
              <span>{speedText()}</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Snippet preview */}
      <p class="text-xs text-text-secondary/70 line-clamp-2 break-all leading-normal">
        {props.snippet}
      </p>

      {/* Group Tag Badges */}
      <Show when={sessionGroups().length > 0}>
        <div class="flex flex-wrap gap-1 mt-1">
          <For each={sessionGroups()}>
            {(group) => (
              <span class="px-1.5 py-0.5 bg-accent-light/10 border border-accent/20 text-accent rounded text-[0.5625rem] uppercase font-bold">
                {group.name}
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Footer Metadata */}
      <div class="flex flex-wrap items-center text-[0.65625rem] mt-2 text-text-secondary/60 gap-y-1.5 gap-x-2 w-full">
        <span
          class={`px-1.5 py-0.5 border rounded text-[0.59375rem] uppercase font-bold flex-shrink-0 ${props.getSourceStyle(props.session.sourceId)}`}
        >
          {props.getSourceLabel(props.session.sourceId)}
        </span>
        <Show when={statusBadge()}>
          <div
            class={`flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[0.5625rem] font-bold flex-shrink-0 ${statusBadge()?.class}`}
          >
            {statusBadge()?.icon()}
            <span>{statusBadge()?.label}</span>
          </div>
        </Show>

        {/* Right Side: Stats */}
        <div class="flex items-center gap-2 ml-auto text-text-secondary/50 flex-wrap">
          <div class="flex items-center gap-0.5">
            <Clock class="w-3 h-3" />
            <span>{formattedDuration()}</span>
          </div>
          <div class="flex items-center gap-0.5">
            <MessageSquare class="w-3 h-3" />
            <span>{turnsCount()}</span>
          </div>
          <div class="flex items-center gap-0.5">
            <Cpu class="w-3 h-3" />
            <span>{formattedTokens()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
