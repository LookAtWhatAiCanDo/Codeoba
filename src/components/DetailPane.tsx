import { createSignal, createMemo, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { 
  Folder, 
  Copy, 
  Check, 
  Clock, 
  ExternalLink,
  MessageSquare,
  Cpu,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Terminal,
  Search,
  FileText,
  HelpCircle,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Pin,
  AlertCircle,
  Edit
} from "lucide-solid";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useI18n } from "../i18n/i18n";
import { logFE } from "../utils/logger";
import { parseAssistantMessage, MessageToolPart } from "../utils/messageParser";
import { formatDateWithSetting, formatNumberWithSetting, formatTimeWithSetting } from "../utils/format";
import { Turn, Session } from "../types";
import { checkTextMatch, highlightContainer } from "../utils/highlighter";

interface DetailPaneProps {
  session: Session | null;
  onCopyPath: (path: string) => void;
  loadTime: string | null;
  isLoading: boolean;
  sidebarCollapsed?: boolean;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  dateFormat?: string;
  timeFormat?: string;
  showSeconds?: boolean;
  numberFormat?: string;
  groups?: any[];
  pinnedSessionIds?: Set<string>;
  onTogglePinSession?: (sessionId: string) => void;
  onAssignSessionToGroup?: (sessionId: string, groupName: string) => Promise<void>;
  onRemoveSessionFromGroup?: (sessionId: string, groupName: string) => Promise<void>;
}

export const DetailPane = (props: DetailPaneProps) => {
  const { t, locale } = useI18n();
  const [copiedPath, setCopiedPath] = createSignal(false);
  const [copiedSession, setCopiedSession] = createSignal(false);
  const [visibleTurns, setVisibleTurns] = createSignal(10);
  const [showActionsDropdown, setShowActionsDropdown] = createSignal(false);

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    text: string;
    type: "user" | "assistant" | "tool";
  } | null>(null);

  const handleContextMenu = (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text,
      type
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const compactionCount = createMemo(() => {
    if (!props.session) return 0;
    return props.session.turns.filter(t => t.extraData?.isCompaction === "true").length;
  });

  let scrollContainerRef: HTMLDivElement | undefined;
  const visibilitySetters = new Map<Element, (v: boolean) => void>();
  const heightCache = new Map<string, number>();
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("click", () => setShowActionsDropdown(false));
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const setter = visibilitySetters.get(entry.target);
        if (setter) {
          setter(entry.isIntersecting);
        }
      });
    }, {
      rootMargin: "500px 0px" // Render turns 500px above/below viewport to prevent flickers
    });
  });

  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("click", () => setShowActionsDropdown(false));
    if (observer) {
      observer.disconnect();
    }
  });

  const registerElement = (el: HTMLElement, setVisible: (v: boolean) => void, _turnId: string) => {
    visibilitySetters.set(el, setVisible);
    if (observer) {
      observer.observe(el);
    }
  };

  const unregisterElement = (el: HTMLElement) => {
    visibilitySetters.delete(el);
    if (observer) {
      observer.unobserve(el);
    }
  };

  const getCachedHeight = (turnId: string) => heightCache.get(turnId);
  const setCachedHeight = (turnId: string, h: number) => heightCache.set(turnId, h);

  // Reset pagination and scroll to bottom when session changes
  createEffect(() => {
    const id = props.session?.id;
    if (id) {
      setVisibleTurns(10);
      
      // Auto-scroll to bottom of conversation turns
      setTimeout(() => {
        if (scrollContainerRef) {
          scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
          logFE("info", `Auto-scrolled session detail scrollbar to bottom`);
        }
      }, 50);
    }
  });

  // Extract folder name from CWD as "Workspace"
  const getWorkspaceName = () => {
    return props.session?.workspaceName || "Local Workspace";
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "awaiting_review":
        return t("sidebar.statusAwaitingReview");
      case "executing":
        return t("sidebar.statusExecuting");
      case "completed":
        return t("sidebar.statusCompleted");
      case "discussion":
      default:
        return t("sidebar.statusDiscussion");
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "awaiting_review":
        return "bg-amber-500/10 border-amber-500/30 text-amber-500";
      case "executing":
        return "bg-purple-500/10 border-purple-500/30 text-purple-500";
      case "completed":
        return "bg-emerald-500/10 border-emerald-500/30 text-emerald-500";
      case "discussion":
      default:
        return "bg-blue-500/10 border-blue-500/20 text-blue-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "awaiting_review":
        return <HelpCircle class="w-3 h-3 flex-shrink-0" />;
      case "executing":
        return <Loader2 class="w-3 h-3 flex-shrink-0 animate-spin" />;
      case "completed":
        return <CheckCircle2 class="w-3 h-3 flex-shrink-0" />;
      case "discussion":
      default:
        return <MessageSquare class="w-3 h-3 flex-shrink-0" />;
    }
  };

  const handleCopyPath = () => {
    if (props.session) {
      props.onCopyPath(props.session.filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleCopyFullSession = () => {
    if (props.session) {
      const formatted = props.session.turns.map(turn => {
        return `### User\n\n${turn.userMessage}\n\n### Assistant\n\n${turn.assistantMessage}\n`;
      }).join("\n---\n\n");
      
      navigator.clipboard.writeText(formatted);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 2000);
    }
  };

  const formatFullDate = (timestampMs: number) => {
    let time = timestampMs;
    if (time < 20000000000) {
      time *= 1000;
    }
    const dateObj = new Date(time);
    const dateStr = formatDateWithSetting(dateObj, props.dateFormat || "system", locale());
    const timeStr = formatTimeWithSetting(dateObj, props.timeFormat || "system", props.showSeconds || false, locale());
    return `${dateStr}, ${timeStr}`;
  };

  const slicedTurns = createMemo(() => {
    if (!props.session) return [];
    return props.session.turns.slice(-visibleTurns());
  });

  return (
    <div class="flex-grow h-full flex flex-col bg-background/95 min-w-0">
      <Show 
        when={!props.isLoading} 
        fallback={
          <div class="flex-grow h-full flex flex-col bg-background/95 min-w-0 animate-pulse">
            {/* Header Skeleton */}
            <div 
              class="px-6 border-b border-border/60 flex items-center justify-between flex-shrink-0"
              style={{ height: "var(--sk-header-height, 76px)" }}
            >
              <div class="flex flex-col gap-2">
                <div class="h-3.5 w-40 bg-surface rounded" />
                <div class="h-2.5 w-60 bg-surface rounded" />
              </div>
            </div>
            
            {/* Messages Scroll Area Skeleton */}
            <div class="flex-grow px-8 py-6 space-y-6 overflow-y-auto">
              <div class="p-4 bg-surface/30 border border-border/40 rounded-2xl flex gap-6">
                <div class="h-4 w-24 bg-surface rounded" />
                <div class="h-4 w-32 bg-surface rounded" />
                <div class="h-4 w-20 bg-surface rounded" />
              </div>

              {[1, 2].map((_i) => (
                <div class="space-y-4">
                  <div class="flex flex-col items-start max-w-2xl">
                    <div class="h-3 w-16 bg-surface rounded mb-2 ml-3" />
                    <div class="w-96 h-12 bg-surface border border-border/50 rounded-2xl" />
                  </div>
                  <div class="flex flex-col items-start max-w-3xl pl-6">
                    <div class="h-3 w-20 bg-surface rounded mb-2 ml-3" />
                    <div class="w-full h-32 bg-surface/50 border border-border/30 rounded-2xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <Show 
          when={props.session} 
          fallback={
            <div class="flex-grow h-full flex flex-col items-center justify-center bg-background/95 text-text-secondary select-none">
              <MessageSquare class="w-16 h-16 mb-4 text-border animate-pulse" />
              <p class="text-[15px] font-medium tracking-wide">{t("detailPane.selectSession")}</p>
            </div>
          }
        >
          {/* Top Header / Action Bar */}
          <div 
            class="border-b border-border/60 flex items-center justify-between glass flex-shrink-0 transition-all duration-200 px-6"
            style={{ 
              height: "var(--sk-header-height, 76px)"
            }}
          >
            <div class="min-w-0 flex flex-col gap-0.5 pt-2">
              <div class="flex items-center gap-1.5 text-xs text-text-secondary/80">
                <span class="hover:text-text-primary transition-colors cursor-default">
                  {getWorkspaceName()}
                </span>
                <span class="text-border">/</span>
                <span class="truncate font-medium text-text-primary max-w-[240px] cursor-default">
                  {props.session!.threadName || t("detailPane.noSelection")}
                </span>
                <Show when={props.session!.status}>
                  <div class={`flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[9px] font-bold select-none leading-none ${getStatusStyle(props.session!.status!)}`}>
                    {getStatusIcon(props.session!.status!)}
                    <span>{getStatusLabel(props.session!.status!)}</span>
                  </div>
                </Show>
                <Show when={compactionCount() > 0}>
                  <span class="px-2 py-0.5 bg-accent/15 border border-accent/30 text-accent rounded-full text-[9px] font-bold select-none leading-none pt-[3px] pb-[3px]">
                    {t("dashboard.totalCompactions")}: {compactionCount()}
                  </span>
                </Show>
              </div>
              
              <Show when={props.session!.cwd}>
                <div dir="ltr" class="flex items-center gap-1.5 text-[11px] text-text-secondary/60 text-left">
                  <Folder class="w-3.5 h-3.5 flex-shrink-0" />
                  <span class="truncate hover:text-text-primary transition-colors" title={props.session!.cwd!}>
                    {props.session!.cwd}
                  </span>
                </div>
              </Show>
            </div>

            <div class="flex items-center gap-2">
              <button
                onClick={handleCopyPath}
                title={t("detailPane.copyPath")}
                class="p-2 bg-surface hover:bg-surface/80 border border-border/80 rounded-xl text-text-secondary hover:text-text-primary transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              >
                <Show when={copiedPath()} fallback={<ExternalLink class="w-3.5 h-3.5" />}>
                  <Check class="w-3.5 h-3.5 text-emerald-400" />
                </Show>
                <span>{t("detailPane.copyPathLabel")}</span>
              </button>

              <button
                onClick={handleCopyFullSession}
                title={t("detailPane.copyCwd")}
                class="p-2 bg-surface hover:bg-surface/80 border border-border/80 rounded-xl text-text-secondary hover:text-text-primary transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              >
                <Show when={copiedSession()} fallback={<Copy class="w-3.5 h-3.5" />}>
                  <Check class="w-3.5 h-3.5 text-emerald-400" />
                </Show>
                <span>{t("detailPane.copyCwdLabel")}</span>
              </button>

              <div class="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActionsDropdown(!showActionsDropdown());
                  }}
                  title="More actions"
                  class="p-2 bg-surface hover:bg-surface/80 border border-border/80 rounded-xl text-text-secondary hover:text-text-primary transition-all flex items-center justify-center cursor-pointer"
                >
                  <MoreVertical class="w-3.5 h-3.5" />
                </button>
                
                <Show when={showActionsDropdown()}>
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    class="absolute right-0 mt-2 bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[9999] select-none text-left flex flex-col"
                  >
                    {/* Pin/Unpin */}
                    <Show when={props.onTogglePinSession && props.pinnedSessionIds && props.session}>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          props.onTogglePinSession!(props.session!.id);
                          setShowActionsDropdown(false);
                        }}
                      >
                        <Pin class="w-3.5 h-3.5" />
                        <span>
                          {props.pinnedSessionIds!.has(props.session!.id)
                            ? t("groups.unpinConversation") || "Unpin Conversation"
                            : t("groups.pinConversation") || "Pin Conversation"}
                        </span>
                      </button>
                    </Show>

                    {/* Open Session File */}
                    <Show when={props.session}>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={async () => {
                          setShowActionsDropdown(false);
                          try {
                            await invoke("open_file_externally", {
                              rawPath: props.session!.filePath,
                              sessionCwd: props.session!.cwd || null
                            });
                          } catch (e) {
                            console.error("Failed to open file externally", e);
                          }
                        }}
                      >
                        <HelpCircle class="w-3.5 h-3.5" />
                        <span>{t("groups.openSessionFile") || "Open Session File"}</span>
                      </button>
                    </Show>

                    {/* Copy Session ID */}
                    <Show when={props.session}>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(props.session!.id);
                          setShowActionsDropdown(false);
                        }}
                      >
                        <Copy class="w-3.5 h-3.5" />
                        <span>{t("groups.copySessionId") || "Copy Session ID"}</span>
                      </button>
                    </Show>

                    {/* Copy File Path */}
                    <Show when={props.session}>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(props.session!.filePath);
                          setShowActionsDropdown(false);
                        }}
                      >
                        <Copy class="w-3.5 h-3.5" />
                        <span>{t("detailPane.copyPathLabel") || "Copy Path"}</span>
                      </button>
                    </Show>

                    {/* Assign Group Submenu Header */}
                    <Show when={props.groups && props.groups.length > 0 && props.onAssignSessionToGroup && props.session}>
                      <div class="border-t border-border/60 my-1"></div>
                      <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary/55">
                        {t("groups.filterByGroup") || "Groups"}
                      </div>
                      <div class="max-h-36 overflow-y-auto">
                        <For each={props.groups}>
                          {(g) => {
                            const isAssigned = () => {
                              const ids = Array.isArray(g.sessionIds) 
                                ? g.sessionIds 
                                : Array.from(g.sessionIds || []);
                              return ids.includes(props.session!.id);
                            };
                            
                            return (
                              <button
                                class={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 transition-all flex items-center justify-between cursor-pointer ${
                                  isAssigned() ? "text-accent font-semibold" : "text-text-secondary hover:text-text-primary"
                                }`}
                                onClick={async () => {
                                  setShowActionsDropdown(false);
                                  if (isAssigned()) {
                                    if (props.onRemoveSessionFromGroup) {
                                      await props.onRemoveSessionFromGroup(props.session!.id, g.name);
                                    }
                                  } else {
                                    await props.onAssignSessionToGroup!(props.session!.id, g.name);
                                  }
                                }}
                              >
                                <span class="truncate pr-2">{g.name}</span>
                                <Show when={isAssigned()}>
                                  <Check class="w-3 h-3 text-accent flex-shrink-0" />
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>
          </div>

          {/* Main Conversation Turns Scrollable Area */}
          <div 
            ref={scrollContainerRef}
            class="flex-grow overflow-y-auto px-8 py-6 space-y-6 scroll-smooth"
          >
            {/* Session Metadata Panel */}
            <div class="p-4 bg-surface/30 border border-border/40 rounded-2xl flex flex-wrap gap-y-3 gap-x-6 text-xs text-text-secondary/70">
              <div class="flex items-center gap-1.5">
                <Bookmark class="w-3.5 h-3.5 text-accent" />
                <span class="font-semibold text-text-primary">{t("settings.sources.tab")}:</span>
                <span class="capitalize">{props.session!.sourceId}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <Clock class="w-3.5 h-3.5 text-accent" />
                <span class="font-semibold text-text-primary">{t("detailPane.startedOn")}:</span>
                <span>{formatFullDate(props.session!.timestamp)}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <Cpu class="w-3.5 h-3.5 text-accent" />
                <span class="font-semibold text-text-primary">{t("dashboard.totalTurns")}:</span>
                <span>{props.session!.turns.length}</span>
              </div>
              <Show when={props.loadTime}>
                <div class="flex items-center gap-1.5">
                  <Clock class="w-3.5 h-3.5 text-accent animate-pulse" />
                  <span class="font-semibold text-text-primary">{t("dashboard.duration")}:</span>
                  <span class="font-mono text-accent">{props.loadTime}</span>
                </div>
              </Show>
            </div>

            {/* AI Summary Card (Component 2) */}
            <Show when={props.session!.summary}>
              <div class="p-5 bg-accent/5 border border-accent/20 rounded-2xl space-y-2 animate-in fade-in duration-300">
                <div class="flex items-center gap-2 text-accent">
                  <Cpu class="w-4 h-4" />
                  <h3 class="text-xs font-bold uppercase tracking-wider">{t("detailPane.aiSummaryTitle")}</h3>
                </div>
                <p class="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap select-text">
                  {props.session!.summary}
                </p>
              </div>
            </Show>

            {/* Pagination Trigger */}
            <Show when={props.session!.turns.length > visibleTurns()}>
              <div class="flex justify-center pb-4 border-b border-border/40 gap-3">
                <button
                  onClick={() => setVisibleTurns(prev => Math.min(props.session!.turns.length, prev + 20))}
                  class="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-xs font-semibold rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer shadow-sm"
                >
                  Load 20 older messages ({props.session!.turns.length - visibleTurns()} remaining)
                </button>
                <button
                  onClick={() => setVisibleTurns(props.session!.turns.length)}
                  class="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-xs font-semibold rounded-xl text-text-secondary hover:text-text-primary transition-all cursor-pointer shadow-sm shadow-accent/5 capitalize"
                >
                  {t("sidebar.filterAll")}
                </button>
              </div>
            </Show>

            {/* Render Virtualized Conversation Bubbles */}
            <For each={slicedTurns()}>
              {(turn, index) => {
                const actualIndex = createMemo(() => props.session!.turns.length - visibleTurns() + index());
                return (
                  <VirtualTurn
                    turn={turn}
                    actualIndex={actualIndex()}
                    formatFullDate={formatFullDate}
                    sourceId={props.session!.sourceId}
                    registerElement={registerElement}
                    unregisterElement={unregisterElement}
                    getCachedHeight={getCachedHeight}
                    setCachedHeight={setCachedHeight}
                    searchQuery={props.searchQuery}
                    matchCase={props.matchCase}
                    wholeWord={props.wholeWord}
                    useRegex={props.useRegex}
                    numberFormat={props.numberFormat}
                    onContextMenu={handleContextMenu}
                  />
                );
              }}
            </For>
          </div>
        </Show>
      </Show>

      {/* Context Menu Overlay */}
      <Show when={contextMenu()}>
        {(context) => {
          const [copied, setCopied] = createSignal(false);
          
          const handleCopy = async () => {
            try {
              await navigator.clipboard.writeText(context().text);
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
                setContextMenu(null);
              }, 800);
            } catch (err) {
              console.error("Failed to copy context text:", err);
            }
          };

          const getLabel = () => {
            if (context().type === "user" || context().type === "assistant") {
              return t("detailPane.copyMessageText");
            }
            return t("detailPane.copyToolOutput");
          };

          return (
            <div
              class="fixed bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[9999] select-none"
              style={{
                top: `${Math.min(window.innerHeight - 80, context().y)}px`,
                left: `${Math.min(window.innerWidth - 240, context().x)}px`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                class="w-full text-left px-3 py-2 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer font-medium"
                onClick={handleCopy}
              >
                <Show when={copied()} fallback={<Copy class="w-3.5 h-3.5" />}>
                  <Check class="w-3.5 h-3.5 text-emerald-400" />
                </Show>
                <span>{copied() ? "Copied!" : getLabel()}</span>
              </button>
            </div>
          );
        }}
      </Show>
    </div>
  );
};

interface VirtualTurnProps {
  turn: Turn;
  actualIndex: number;
  formatFullDate: (timestamp: number) => string;
  sourceId: string;
  registerElement: (el: HTMLElement, setVisible: (v: boolean) => void, turnId: string) => void;
  unregisterElement: (el: HTMLElement) => void;
  getCachedHeight: (turnId: string) => number | undefined;
  setCachedHeight: (turnId: string, h: number) => void;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  numberFormat?: string;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
}

const VirtualTurn = (props: VirtualTurnProps) => {
  const { t } = useI18n();
  let elementRef: HTMLDivElement | undefined;
  const [isVisible, setIsVisible] = createSignal(false);
  const turnKey = createMemo(() => props.turn.turnId || String(props.actualIndex));

  createEffect(() => {
    const el = elementRef;
    if (el) {
      props.registerElement(el, setIsVisible, turnKey());
      onCleanup(() => {
        props.unregisterElement(el);
      });
    }
  });

  // Track height of this turn when it goes offscreen
  createEffect(() => {
    const visible = isVisible();
    const el = elementRef;
    if (!visible && el) {
      const cached = props.getCachedHeight(turnKey());
      if (cached) {
        el.style.height = `${cached}px`;
      }
    } else if (visible && el) {
      el.style.height = "auto";
      
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const h = entry.target.getBoundingClientRect().height;
          if (h > 0) {
            props.setCachedHeight(turnKey(), h);
          }
        }
      });
      ro.observe(el);
      onCleanup(() => ro.disconnect());
    }
  });

  return (
    <div 
      ref={elementRef}
      data-turn-id={turnKey()}
      class="space-y-4"
      style={props.actualIndex >= 2 ? {
        "content-visibility": "auto",
        "contain-intrinsic-size": "auto 200px"
      } : undefined}
    >
      <Show 
        when={isVisible()} 
        fallback={
          // Empty skeleton shell while virtualized out to minimize memory
          <div class="w-full py-6 flex items-center justify-center text-text-secondary/20">
            <div class="flex gap-1.5">
              <div class="w-2 h-2 rounded-full bg-current animate-pulse" />
              <div class="w-2 h-2 rounded-full bg-current animate-pulse delay-75" />
              <div class="w-2 h-2 rounded-full bg-current animate-pulse delay-150" />
            </div>
          </div>
        }
      >
        {/* User message block */}
        <div class="flex flex-col items-start max-w-4xl animate-in fade-in duration-200">
          <div class="flex items-center gap-2 mb-1.5 pl-3">
            <div class="w-2 h-2 rounded-full bg-accent" />
            <span class="text-[12px] font-semibold text-text-primary tracking-wide">
              {t("common.user")}
            </span>
            <span class="text-[10px] text-text-secondary/50">
              {props.formatFullDate(props.turn.timestamp)}
            </span>
          </div>
          <div 
            onContextMenu={(e) => props.onContextMenu(e, "user", props.turn.userMessage)}
            class="w-full bg-surface border border-border/50 p-4 rounded-2xl text-[14.5px] leading-relaxed text-text-primary/90 font-sans shadow-sm"
          >
            <UserMessageRenderer 
              message={props.turn.userMessage} 
              searchQuery={props.searchQuery} 
              matchCase={props.matchCase} 
              wholeWord={props.wholeWord} 
              useRegex={props.useRegex} 
            />
          </div>
        </div>

        {/* Assistant message block */}
        <div class="flex flex-col items-start max-w-4xl pl-2 md:pl-6 animate-in fade-in duration-200">
          <div class="flex items-center justify-between w-full mb-1.5 pl-3 pr-2">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-emerald-400" />
              <span class="text-[12px] font-semibold text-text-primary tracking-wide">
                {t("common.assistant")}
              </span>
              <span class="text-[10px] text-text-secondary/50">
                {props.formatFullDate(props.turn.timestamp)}
              </span>
            </div>
            <Show when={props.turn.inputTokens || props.turn.outputTokens}>
              <div class="flex items-center gap-1.5 text-[10px] text-text-secondary/50 font-mono">
                {props.turn.inputTokens && <span>in: {formatNumberWithSetting(props.turn.inputTokens, props.numberFormat || "system")}</span>}
                {props.turn.inputTokens && props.turn.outputTokens && <span>•</span>}
                {props.turn.outputTokens && <span>out: {formatNumberWithSetting(props.turn.outputTokens, props.numberFormat || "system")}</span>}
              </div>
            </Show>
          </div>
          <div class="w-full bg-accent-light/10 border border-accent/20 p-5 rounded-2xl shadow-sm">
            <AssistantMessageRenderer 
              message={props.turn.assistantMessage} 
              searchQuery={props.searchQuery} 
              matchCase={props.matchCase}
              wholeWord={props.wholeWord}
              useRegex={props.useRegex}
              onContextMenu={props.onContextMenu}
            />
          </div>
        </div>
      </Show>
    </div>
  );
};

const UserMessageRenderer = (props: {
  message: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}) => {
  let ref: HTMLDivElement | undefined;

  createEffect(() => {
    const text = props.message;
    const q = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;

    if (ref) {
      ref.textContent = text;
      highlightContainer(ref, q || "", mc || false, ww || false, rx || false);
    }
  });

  return <div ref={ref} class="whitespace-pre-wrap select-text" />;
};

const AssistantMessageRenderer = (props: { 
  message: string; 
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
}) => {
  const parts = createMemo(() => parseAssistantMessage(props.message));
  
  const groupedParts = createMemo(() => {
    const list = parts();
    const result: Array<{ type: "text"; content: string } | { type: "toolGroup"; tools: MessageToolPart[] }> = [];
    let currentToolGroup: MessageToolPart[] = [];
    
    for (const part of list) {
      if (part.type === "tool") {
        currentToolGroup.push(part);
      } else {
        if (currentToolGroup.length > 0) {
          result.push({ type: "toolGroup", tools: currentToolGroup });
          currentToolGroup = [];
        }
        result.push(part);
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
              <div onContextMenu={(e) => props.onContextMenu(e, "assistant", part.content)}>
                <MarkdownRenderer 
                  content={part.content} 
                  searchQuery={props.searchQuery}
                  matchCase={props.matchCase}
                  wholeWord={props.wholeWord}
                  useRegex={props.useRegex}
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

const WorkedForBlock = (props: { 
  tools: MessageToolPart[]; 
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
}) => {
  const matchesSearch = createMemo(() => {
    const q = props.searchQuery;
    if (!q || q.trim() === "") return false;
    return props.tools.some(tool => 
      checkTextMatch(tool.header, q, props.matchCase || false, props.wholeWord || false, props.useRegex || false) || 
      checkTextMatch(tool.content, q, props.matchCase || false, props.wholeWord || false, props.useRegex || false)
    );
  });

  const [isExpanded, setIsExpanded] = createSignal(false);

  createEffect(() => {
    if (matchesSearch()) {
      setIsExpanded(true);
    }
  });

  const title = createMemo(() => {
    return `Worked (${props.tools.length} tool execution${props.tools.length > 1 ? 's' : ''})`;
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

const ToolOutputBlock = (props: {
  tool: MessageToolPart;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  startExpanded: boolean;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
}) => {
  const matchesSearch = createMemo(() => {
    const q = props.searchQuery;
    if (!q || q.trim() === "") return false;
    return (
      checkTextMatch(props.tool.header, q, props.matchCase || false, props.wholeWord || false, props.useRegex || false) ||
      checkTextMatch(props.tool.content, q, props.matchCase || false, props.wholeWord || false, props.useRegex || false)
    );
  });

  const [isOpen, setIsOpen] = createSignal(props.startExpanded || matchesSearch());

  createEffect(() => {
    if (matchesSearch()) {
      setIsOpen(true);
    }
  });

  const getToolMeta = () => {
    const type = props.tool.toolType.toLowerCase();
    const content = props.tool.content.toLowerCase();
    
    const isError = content.includes("error:") || content.includes("failed with") || content.includes("exit code:") || content.includes("invalid tool call");
    const isEdit = type.includes("edit") || type.includes("write") || type.includes("replace") || type.includes("create");
    const isRead = type.includes("view") || type.includes("read") || type.includes("list");
    const isSearch = type.includes("search") || type.includes("find") || type.includes("grep");
    const isCommand = type.includes("command") || type.includes("shell") || type.includes("terminal");
    
    if (isError) {
      return {
        icon: <AlertCircle class="w-3.5 h-3.5 text-red-400" />,
        colorClass: "text-red-400 hover:text-red-300",
        preBorder: "border-red-500/20 bg-red-500/5 text-red-200/90"
      };
    }
    if (isEdit) {
      return {
        icon: <Edit class="w-3.5 h-3.5 text-amber-400" />,
        colorClass: "text-amber-400 hover:text-amber-300",
        preBorder: "border-amber-500/20 bg-amber-500/5 text-amber-200/90"
      };
    }
    if (isRead) {
      return {
        icon: <FileText class="w-3.5 h-3.5 text-emerald-400" />,
        colorClass: "text-emerald-400 hover:text-emerald-300",
        preBorder: "border-emerald-500/20 bg-emerald-500/5 text-emerald-200/90"
      };
    }
    if (isSearch) {
      return {
        icon: <Search class="w-3.5 h-3.5 text-purple-400" />,
        colorClass: "text-purple-400 hover:text-purple-300",
        preBorder: "border-purple-500/20 bg-purple-500/5 text-purple-200/90"
      };
    }
    if (isCommand) {
      return {
        icon: <Terminal class="w-3.5 h-3.5 text-sky-400" />,
        colorClass: "text-sky-400 hover:text-sky-300",
        preBorder: "border-sky-500/20 bg-sky-500/5 text-sky-200/90"
      };
    }
    return {
      icon: <Cpu class="w-3.5 h-3.5 text-text-secondary/70" />,
      colorClass: "text-text-secondary hover:text-text-primary",
      preBorder: "border-border/60 bg-background/50 text-text-primary/80"
    };
  };

  const meta = createMemo(() => getToolMeta());

  let headerRef: HTMLSpanElement | undefined;
  let codeRef: HTMLElement | undefined;

  createEffect(() => {
    const q = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;

    if (headerRef) {
      headerRef.textContent = props.tool.header;
      highlightContainer(headerRef, q || "", mc || false, ww || false, rx || false);
    }
  });

  createEffect(() => {
    const q = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;
    const opened = isOpen();
    const text = props.tool.content;

    if (opened && codeRef) {
      codeRef.textContent = text;
      highlightContainer(codeRef, q || "", mc || false, ww || false, rx || false);
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
        <span ref={headerRef} class="hover:underline" />
      </button>

      <Show when={isOpen()}>
        <div class="ml-4 pl-1">
          <pre 
            onContextMenu={(e) => props.onContextMenu(e, "tool", props.tool.content)}
            dir="ltr" 
            class={`border rounded-xl p-3 text-[11px] leading-relaxed overflow-x-auto font-mono max-h-96 scrollbar shadow-inner text-left ${meta().preBorder}`}
          >
            <code ref={codeRef} />
          </pre>
        </div>
      </Show>
    </div>
  );
};
