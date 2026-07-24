import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { useI18n } from "../../../i18n/i18n";
import { logFE } from "../../../utils/logger";
import { formatNumberWithSetting } from "../../../utils/format";
import { Turn } from "../../../types";
import { AssistantMessageRenderer } from "./AssistantMessageRenderer";

export interface VirtualTurnProps {
  turn: Turn;
  actualIndex: number;
  formatFullDate: (timestamp: number) => string;
  sourceId: string;
  sessionId: string;
  filePath: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  numberFormat?: string;
  onContextMenu: (
    e: MouseEvent,
    type: "user" | "assistant" | "tool",
    text: string,
    sessionId?: string,
    turnIndex?: number
  ) => void;
  onImageClick: (img: { path?: string; src: string }) => void;
  onImageContextMenu: (e: MouseEvent, path?: string, src?: string) => void;
  isActiveSpeechTurn?: boolean;
}

export const VirtualTurn = (props: VirtualTurnProps) => {
  const { t } = useI18n();
  const turnKey = createMemo(() => props.turn.turnId || String(props.actualIndex));

  return (
    <div
      id={turnKey()}
      data-turn-id={turnKey()}
      data-turn-index={props.actualIndex}
      class="space-y-4 animate-in fade-in duration-200"
    >
      {/* User message block */}
      <div class="flex flex-col items-start w-full animate-in fade-in duration-200">
        <div class="flex items-center gap-2 mb-1.5 pl-3">
          <div class="w-2 h-2 rounded-full bg-accent" />
          <span class="text-[0.75rem] font-semibold text-text-primary tracking-wide">
            {t("common.user")}
          </span>
          <span class="text-[0.625rem] text-text-secondary/50">
            {props.formatFullDate(props.turn.timestamp)}
          </span>
        </div>
        <div
          onContextMenu={(e) =>
            props.onContextMenu(
              e,
              "user",
              props.turn.userMessage,
              props.sessionId,
              props.actualIndex
            )
          }
          class="w-full bg-surface border border-border/50 p-4 rounded-2xl shadow-sm"
        >
          <Show
            when={props.turn.userMessage === "[Compacted Request]"}
            fallback={
              <div class="space-y-3">
                <MarkdownRenderer
                  content={props.turn.userMessage}
                  searchQuery={props.searchQuery}
                  matchCase={props.matchCase}
                  wholeWord={props.wholeWord}
                  useRegex={props.useRegex}
                  sessionId={props.sessionId}
                  turnIndex={props.actualIndex}
                  sourceId={props.sourceId}
                  filePath={props.filePath}
                />
                <Show when={props.turn.images && props.turn.images.length > 0}>
                  <div class="flex flex-wrap gap-2.5 mt-3 pt-3 border-t border-border/30">
                    <For each={props.turn.images}>
                      {(image) => {
                        const [src, setSrc] = createSignal<string>("");

                        createEffect(() => {
                          const base64 = image.base64;
                          const mediaType = image.mediaType;
                          const path = image.path;

                          if (base64 && mediaType) {
                            setSrc(`data:${mediaType};base64,${base64}`);
                          } else if (path) {
                            invoke<string>("read_session_image", { path })
                              .then((base64Data) => {
                                setSrc(base64Data);
                              })
                              .catch((err) => {
                                logFE("error", `Failed to load turn image: ${err}`);
                              });
                          }
                        });

                        return (
                          <Show when={src()}>
                            <div class="relative group max-w-[200px] rounded-xl overflow-hidden border border-border/50 bg-background/50 hover:shadow-md transition-all duration-200">
                              <img
                                src={src()}
                                class="max-h-40 max-w-full object-contain cursor-zoom-in hover:scale-[1.02] transition-all duration-200"
                                onClick={() => props.onImageClick({ path: image.path, src: src() })}
                                onContextMenu={(e) =>
                                  props.onImageContextMenu(e, image.path, src())
                                }
                              />
                            </div>
                          </Show>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="flex items-center gap-2 text-text-secondary/60 italic text-[0.875rem] select-none">
              <svg class="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                />
              </svg>
              <span>{t("detailPane.compactedRequest")}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* Assistant message block */}
      <div class="flex flex-col items-start w-full pl-2 md:pl-6 animate-in fade-in duration-200">
        <div class="flex items-center justify-between w-full mb-1.5 pl-3 pr-2">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-emerald-400" />
            <span class="text-[0.75rem] font-semibold text-text-primary tracking-wide">
              {t("common.assistant")}
            </span>
            <span class="text-[0.625rem] text-text-secondary/50">
              {props.formatFullDate(props.turn.timestamp)}
            </span>
          </div>
          <Show when={props.turn.inputTokens || props.turn.outputTokens}>
            <div class="flex items-center gap-1.5 text-[0.625rem] text-text-secondary/50 font-mono">
              {props.turn.inputTokens && (
                <span>
                  in:{" "}
                  {formatNumberWithSetting(props.turn.inputTokens, props.numberFormat || "system")}
                </span>
              )}
              {props.turn.inputTokens && props.turn.outputTokens && <span>•</span>}
              {props.turn.outputTokens && (
                <span>
                  out:{" "}
                  {formatNumberWithSetting(props.turn.outputTokens, props.numberFormat || "system")}
                </span>
              )}
            </div>
          </Show>
        </div>
        <div
          class={`w-full p-5 rounded-2xl shadow-sm transition-all duration-300 relative after:absolute after:inset-0 after:rounded-2xl after:pointer-events-none after:z-[11] ${
            props.isActiveSpeechTurn
              ? "bg-accent/5 shadow-md shadow-accent/15 after:border-2 after:border-accent"
              : "bg-accent-light/10 after:border after:border-accent/20"
          }`}
        >
          <Show
            when={props.turn.assistantMessage === "[Compacted Response]"}
            fallback={
              <AssistantMessageRenderer
                message={props.turn.assistantMessage}
                searchQuery={props.searchQuery}
                matchCase={props.matchCase}
                wholeWord={props.wholeWord}
                useRegex={props.useRegex}
                onContextMenu={props.onContextMenu}
                sessionId={props.sessionId}
                turnIndex={props.actualIndex}
                sourceId={props.sourceId}
                filePath={props.filePath}
              />
            }
          >
            <div class="flex items-center gap-2 text-text-secondary/60 italic text-[0.875rem] select-none">
              <svg class="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <span>{t("detailPane.compactedResponse")}</span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
