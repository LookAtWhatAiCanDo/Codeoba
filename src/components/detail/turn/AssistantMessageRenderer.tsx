import { createMemo, For } from "solid-js";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { parseAssistantMessage, MessageToolPart } from "../../../utils/messageParser";
import { useI18n } from "../../../i18n/i18n";
import { splitIntoLogicalBlocks, sanitizeBlockForSpeech } from "../../../utils/useSpeech";
import { WorkedForBlock } from "./WorkedForBlock";

export interface AssistantMessageRendererProps {
  message: string;
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
  sessionId?: string;
  turnIndex?: number;
  sourceId?: string;
  filePath?: string;
}

export const AssistantMessageRenderer = (props: AssistantMessageRendererProps) => {
  const { t } = useI18n();
  const parts = createMemo(() => parseAssistantMessage(props.message));

  const groupedParts = createMemo(() => {
    const list = parts();
    const result: Array<
      | { type: "text"; content: string; startBlockIndex: number }
      | { type: "toolGroup"; tools: MessageToolPart[] }
    > = [];
    let currentToolGroup: MessageToolPart[] = [];
    let currentBlockCount = 0;

    const getBlockCount = (text: string) => {
      const blocks = splitIntoLogicalBlocks(text, t);
      let count = 0;
      for (const rawBlock of blocks) {
        if (/^[-*_]{3,}$/.test(rawBlock)) continue;
        const sanitized = sanitizeBlockForSpeech(rawBlock);
        if (sanitized && /\p{L}|\p{N}/u.test(sanitized)) {
          count++;
        }
      }
      return count;
    };

    for (const part of list) {
      if (part.type === "tool") {
        currentToolGroup.push(part);
      } else {
        if (currentToolGroup.length > 0) {
          result.push({ type: "toolGroup", tools: currentToolGroup });
          currentToolGroup = [];
        }
        const blockCount = getBlockCount(part.content);
        result.push({
          type: "text",
          content: part.content,
          startBlockIndex: currentBlockCount,
        });
        currentBlockCount += blockCount;
      }
    }

    if (currentToolGroup.length > 0) {
      result.push({ type: "toolGroup", tools: currentToolGroup });
    }

    return result;
  });

  return (
    <div class="space-y-4">
      <For each={groupedParts()}>
        {(part) => {
          if (part.type === "text") {
            return (
              <div
                onContextMenu={(e) =>
                  props.onContextMenu(
                    e,
                    "assistant",
                    part.content,
                    props.sessionId,
                    props.turnIndex
                  )
                }
              >
                <MarkdownRenderer
                  content={part.content}
                  searchQuery={props.searchQuery}
                  matchCase={props.matchCase}
                  wholeWord={props.wholeWord}
                  useRegex={props.useRegex}
                  sessionId={props.sessionId}
                  turnIndex={props.turnIndex}
                  sourceId={props.sourceId}
                  filePath={props.filePath}
                  startBlockIndex={part.startBlockIndex}
                />
              </div>
            );
          } else {
            return (
              <WorkedForBlock
                tools={part.tools}
                searchQuery={props.searchQuery}
                matchCase={props.matchCase}
                wholeWord={props.wholeWord}
                useRegex={props.useRegex}
                onContextMenu={props.onContextMenu}
              />
            );
          }
        }}
      </For>
    </div>
  );
};
