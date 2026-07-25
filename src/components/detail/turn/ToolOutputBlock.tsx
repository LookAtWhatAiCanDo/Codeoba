import { createSignal, createMemo, createEffect, Show } from "solid-js";
import { AlertCircle, Edit, FileText, Search, Terminal, Cpu } from "lucide-solid";
import { MessageToolPart } from "../../../utils/messageParser";
import { checkTextMatch, highlightContainer } from "../../../utils/highlighter";

export interface ToolOutputBlockProps {
  tool: MessageToolPart;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  startExpanded: boolean;
  onContextMenu: (
    e: MouseEvent,
    type: "user" | "assistant" | "tool",
    text: string,
    sessionId?: string,
    turnIndex?: number
  ) => void;
}

export const ToolOutputBlock = (props: ToolOutputBlockProps) => {
  const matchesSearch = createMemo(() => {
    const q = props.searchQuery;
    if (!q || q.trim() === "") return false;
    return (
      checkTextMatch(
        props.tool.header,
        q,
        props.matchCase || false,
        props.wholeWord || false,
        props.useRegex || false
      ) ||
      checkTextMatch(
        props.tool.content,
        q,
        props.matchCase || false,
        props.wholeWord || false,
        props.useRegex || false
      )
    );
  });

  const [isOpen, setIsOpen] = createSignal(false);

  createEffect(() => {
    if (props.startExpanded || matchesSearch()) {
      setIsOpen(true);
    }
  });

  const getToolMeta = () => {
    const type = props.tool.toolType.toLowerCase();
    const isError = /error:|failed with|exit code:|invalid tool call/i.test(props.tool.content);
    const isEdit =
      type.includes("edit") ||
      type.includes("write") ||
      type.includes("replace") ||
      type.includes("create");
    const isRead = type.includes("view") || type.includes("read") || type.includes("list");
    const isSearch = type.includes("search") || type.includes("find") || type.includes("grep");
    const isCommand =
      type.includes("command") || type.includes("shell") || type.includes("terminal");

    if (isError) {
      return {
        icon: <AlertCircle class="w-3.5 h-3.5 text-red-400" />,
        colorClass: "text-red-400 hover:text-red-300",
        preBorder: "border-red-500/20 bg-red-500/5 text-red-200/90",
      };
    }
    if (isEdit) {
      return {
        icon: <Edit class="w-3.5 h-3.5 text-amber-400" />,
        colorClass: "text-amber-400 hover:text-amber-300",
        preBorder: "border-amber-500/20 bg-amber-500/5 text-amber-200/90",
      };
    }
    if (isRead) {
      return {
        icon: <FileText class="w-3.5 h-3.5 text-emerald-400" />,
        colorClass: "text-emerald-400 hover:text-emerald-300",
        preBorder: "border-emerald-500/20 bg-emerald-500/5 text-emerald-200/90",
      };
    }
    if (isSearch) {
      return {
        icon: <Search class="w-3.5 h-3.5 text-purple-400" />,
        colorClass: "text-purple-400 hover:text-purple-300",
        preBorder: "border-purple-500/20 bg-purple-500/5 text-purple-200/90",
      };
    }
    if (isCommand) {
      return {
        icon: <Terminal class="w-3.5 h-3.5 text-sky-400" />,
        colorClass: "text-sky-400 hover:text-sky-300",
        preBorder: "border-sky-500/20 bg-sky-500/5 text-sky-200/90",
      };
    }
    return {
      icon: <Cpu class="w-3.5 h-3.5 text-text-secondary/70" />,
      colorClass: "text-text-secondary hover:text-text-primary",
      preBorder: "border-border/60 bg-background/50 text-text-primary/80",
    };
  };

  const meta = createMemo(() => getToolMeta());

  const [headerRef, setHeaderRef] = createSignal<HTMLSpanElement | null>(null);
  const [codeRef, setCodeRef] = createSignal<HTMLElement | null>(null);

  createEffect(() => {
    const el = headerRef();
    const q = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;

    if (el) {
      el.textContent = props.tool.header;
      highlightContainer(el, q || "", mc || false, ww || false, rx || false);
    }
  });

  createEffect(() => {
    const el = codeRef();
    const q = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;
    const opened = isOpen();
    const text = props.tool.content;

    if (opened && el) {
      el.textContent = text;
      highlightContainer(el, q || "", mc || false, ww || false, rx || false);
    }
  });

  return (
    <div class="space-y-1.5">
      {/* Level 2: Tool header */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        class={`flex items-center gap-2 transition-all text-xs font-semibold cursor-pointer select-none text-left ${meta().colorClass}`}
      >
        <span class="opacity-60">{isOpen() ? "▼" : "▶"}</span>
        {meta().icon}
        <span ref={setHeaderRef} class="hover:underline" />
      </button>

      <Show when={isOpen()}>
        <div class="ml-4 pl-1">
          <pre
            onContextMenu={(e) => props.onContextMenu(e, "tool", props.tool.content)}
            dir="ltr"
            class={`border rounded-xl p-3 text-[0.6875rem] leading-relaxed overflow-x-auto font-mono max-h-96 scrollbar shadow-inner text-left ${meta().preBorder}`}
          >
            <code ref={setCodeRef} />
          </pre>
        </div>
      </Show>
    </div>
  );
};
