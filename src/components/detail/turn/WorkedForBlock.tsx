import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { ChevronDown, ChevronRight, Cpu } from "lucide-solid";
import { MessageToolPart } from "../../../utils/messageParser";
import { checkTextMatch } from "../../../utils/highlighter";
import { ToolOutputBlock } from "./ToolOutputBlock";

export interface WorkedForBlockProps {
  tools: MessageToolPart[];
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  onContextMenu: (
    e: MouseEvent,
    type: "user" | "assistant" | "tool",
    text: string,
    sessionId?: string,
    turnIndex?: number
  ) => void;
}

export const WorkedForBlock = (props: WorkedForBlockProps) => {
  const matchesSearch = createMemo(() => {
    const q = props.searchQuery;
    if (!q || q.trim() === "") return false;
    return props.tools.some(
      (tool) =>
        checkTextMatch(
          tool.header,
          q,
          props.matchCase || false,
          props.wholeWord || false,
          props.useRegex || false
        ) ||
        checkTextMatch(
          tool.content,
          q,
          props.matchCase || false,
          props.wholeWord || false,
          props.useRegex || false
        )
    );
  });

  const [isExpanded, setIsExpanded] = createSignal(false);

  createEffect(() => {
    if (matchesSearch()) {
      setIsExpanded(true);
    }
  });

  const title = createMemo(() => {
    return `Worked (${props.tools.length} tool execution${props.tools.length > 1 ? "s" : ""})`;
  });

  return (
    <div class="border border-border/40 rounded-2xl overflow-hidden bg-background/40 my-3">
      {/* Level 1: Chevron-toggle header */}
      <button
        onClick={() => setIsExpanded(!isExpanded())}
        class="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface/50 transition-all text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer select-none"
      >
        <Show when={isExpanded()} fallback={<ChevronRight class="w-3.5 h-3.5" />}>
          <ChevronDown class="w-3.5 h-3.5" />
        </Show>
        <Cpu class="w-3.5 h-3.5 text-accent/80" />
        <span>{title()}</span>
      </button>

      {/* Level 2 & 3 content */}
      <Show when={isExpanded()}>
        <div class="px-4 pb-4 pt-1 space-y-3 relative">
          {/* Thread connector line */}
          <div class="absolute left-6 top-0 bottom-4 w-[1px] bg-border/50 opacity-50" />

          <div class="space-y-3 pl-6">
            <For each={props.tools}>
              {(tool) => (
                <ToolOutputBlock
                  tool={tool}
                  searchQuery={props.searchQuery}
                  matchCase={props.matchCase}
                  wholeWord={props.wholeWord}
                  useRegex={props.useRegex}
                  startExpanded={matchesSearch()}
                  onContextMenu={props.onContextMenu}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};
