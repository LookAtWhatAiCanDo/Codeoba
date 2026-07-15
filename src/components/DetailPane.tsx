import { createSignal, createMemo, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderOpen,
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
  MoreVertical,
  Pin,
  AlertCircle,
  Edit,
  X,
  ChevronUp,
  Trash2,
} from "lucide-solid";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useSpeech } from "../utils/useSpeech";
import { useI18n } from "../i18n/i18n";
import { logFE } from "../utils/logger";
import { getStatusBadge } from "../utils/sessionStatus";
import { parseAssistantMessage, MessageToolPart } from "../utils/messageParser";
import {
  formatDateWithSetting,
  formatNumberWithSetting,
  formatTimeWithSetting,
} from "../utils/format";
import { Turn, Session } from "../types";
import { checkTextMatch, highlightContainer } from "../utils/highlighter";
import { useContextMenuPosition } from "../utils/contextMenu";

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
  fontSize?: number;
  onFontSizeChange?: (val: number) => void;
}

export const DetailPane = (props: DetailPaneProps) => {
  const { t, locale } = useI18n();
  const speech = useSpeech();
  const [copiedPath, setCopiedPath] = createSignal(false);
  const [copiedWorkspace, setCopiedWorkspace] = createSignal(false);
  const [copiedTitle, setCopiedTitle] = createSignal(false);
  const [scrollPercent, setScrollPercent] = createSignal(0);
  const [activeTurnIdx, setActiveTurnIdx] = createSignal(0);
  const [showActionsDropdown, setShowActionsDropdown] = createSignal(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = createSignal(false);
  const [showSessionDropdown, setShowSessionDropdown] = createSignal(false);
  const [workspaceAction, setWorkspaceAction] = createSignal<"copy" | "show">(
    (localStorage.getItem("codeoba-workspace-action") as "copy" | "show") || "copy"
  );
  const [sessionAction, setSessionAction] = createSignal<"copy" | "show">(
    (localStorage.getItem("codeoba-session-action") as "copy" | "show") || "copy"
  );
  const [isJumping, setIsJumping] = createSignal(false);
  const [scrollLock, setScrollLock] = createSignal(true);

  const [showDetailSearch, setShowDetailSearch] = createSignal(false);
  const [detailSearchQuery, setDetailSearchQuery] = createSignal("");
  const [detailMatchCase, setDetailMatchCase] = createSignal(false);
  const [detailWholeWord, setDetailWholeWord] = createSignal(false);
  const [detailUseRegex, setDetailUseRegex] = createSignal(false);
  const [activeMatchIndex, setActiveMatchIndex] = createSignal(0);
  const [activeLightboxImage, setActiveLightboxImage] = createSignal<{
    path?: string;
    src: string;
  } | null>(null);

  let detailSearchInputRef: HTMLInputElement | undefined;

  const activeSearchQuery = createMemo(() => {
    if (showDetailSearch()) {
      return detailSearchQuery();
    }
    return props.searchQuery || "";
  });

  const activeMatchCase = createMemo(() => {
    if (showDetailSearch()) {
      return detailMatchCase();
    }
    return props.matchCase || false;
  });

  const activeWholeWord = createMemo(() => {
    if (showDetailSearch()) {
      return detailWholeWord();
    }
    return props.wholeWord || false;
  });

  const activeUseRegex = createMemo(() => {
    if (showDetailSearch()) {
      return detailUseRegex();
    }
    return props.useRegex || false;
  });

  interface SearchMatch {
    turnIndex: number;
    turnId: string;
    text: string;
  }

  const searchMatches = createMemo(() => {
    const q = detailSearchQuery();
    const session = props.session;
    if (!session || !q || q.trim() === "") return [];

    const mc = detailMatchCase();
    const ww = detailWholeWord();
    const rx = detailUseRegex();

    let regex: RegExp;
    try {
      const flags = mc ? "g" : "gi";
      let pattern = q;
      if (!rx) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      if (ww) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return [];
    }

    const matchesList: SearchMatch[] = [];
    session.turns.forEach((turn, turnIndex) => {
      const turnId = turn.turnId || String(turnIndex);

      // Find all matches in userMessage
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(turn.userMessage)) !== null) {
        if (match[0] === "") {
          regex.lastIndex++;
          continue;
        }
        matchesList.push({
          turnIndex,
          turnId,
          text: match[0],
        });
      }

      // Find all matches in assistantMessage
      regex.lastIndex = 0;
      while ((match = regex.exec(turn.assistantMessage)) !== null) {
        if (match[0] === "") {
          regex.lastIndex++;
          continue;
        }
        matchesList.push({
          turnIndex,
          turnId,
          text: match[0],
        });
      }
    });

    return matchesList;
  });

  const navigateToMatch = (index: number) => {
    const matchesList = searchMatches();
    if (matchesList.length === 0) return;

    let targetIndex = index;
    if (targetIndex >= matchesList.length) {
      targetIndex = 0;
    } else if (targetIndex < 0) {
      targetIndex = matchesList.length - 1;
    }
    setActiveMatchIndex(targetIndex);

    const match = matchesList[targetIndex];

    setIsJumping(true);

    setTimeout(() => {
      const el = document.getElementById(match.turnId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        // Correct offset shifts via direct scrollTop setting to override any browser-level layout expansion limits
        setTimeout(() => {
          if (scrollContainerRef) {
            scrollContainerRef.scrollTop =
              el.offsetTop - scrollContainerRef.clientHeight / 2 + el.offsetHeight / 2;
          }
        }, 250);

        setTimeout(() => {
          setIsJumping(false);
          const allMarks = scrollContainerRef?.querySelectorAll("mark");
          if (allMarks) {
            allMarks.forEach((m) => {
              m.className = "bg-yellow-500/30 text-text-primary rounded px-0.5";
            });

            const turnEl = document.getElementById(match.turnId);
            if (turnEl) {
              const turnMarks = turnEl.querySelectorAll("mark");
              let matchIndexInTurn = 0;
              for (let i = 0; i < targetIndex; i++) {
                if (matchesList[i].turnId === match.turnId) {
                  matchIndexInTurn++;
                }
              }

              const activeMark = turnMarks[matchIndexInTurn];
              if (activeMark) {
                activeMark.className =
                  "bg-accent text-white font-semibold rounded px-0.5 ring-2 ring-accent/50";
                activeMark.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }
        }, 800);
      }
    }, 150);
  };

  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    text: string;
    type: "user" | "assistant" | "tool" | "image";
    extra?: string;
    imagePath?: string;
    imageSrc?: string;
  } | null>(null);

  const menuPosition = useContextMenuPosition(contextMenu);

  const handleContextMenu = (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => {
    e.preventDefault();
    e.stopPropagation();
    const selected = window.getSelection()?.toString() || "";
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text: selected ? selected : text,
      type,
      extra: selected ? "selected-text" : undefined,
    });
  };

  const handleImageContextMenu = (e: MouseEvent, path?: string, src?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const selected = window.getSelection()?.toString() || "";
    if (selected) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selected,
        type: "image",
        extra: "selected-text",
        imagePath: path,
        imageSrc: src,
      });
    } else {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: path || "",
        type: "image",
        extra: src,
      });
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const compactionCount = createMemo(() => {
    if (!props.session) return 0;
    return props.session.turns.filter((t) => t.extraData?.isCompaction === "true").length;
  });

  const dateMilestones = createMemo(() => {
    if (!props.session) return [];
    const milestones: { label: string; index: number; turnId: string }[] = [];
    const turns = props.session.turns;
    if (turns.length === 0) return [];

    const isDifferentDay = (t1: number, t2: number) => {
      const d1 = new Date(t1);
      const d2 = new Date(t2);
      return (
        d1.getDate() !== d2.getDate() ||
        d1.getMonth() !== d2.getMonth() ||
        d1.getFullYear() !== d2.getFullYear()
      );
    };

    const formatMilestoneLabel = (timeMs: number, forceDate: boolean) => {
      const d = new Date(timeMs);
      if (forceDate) {
        return d.toLocaleDateString(locale() || "en", { month: "short", day: "numeric" });
      }
      return d.toLocaleTimeString(locale() || "en", { hour: "numeric", minute: "2-digit" });
    };

    let firstTime = turns[0].timestamp;
    if (firstTime < 20000000000) firstTime *= 1000;
    let lastTime = turns[turns.length - 1].timestamp;
    if (lastTime < 20000000000) lastTime *= 1000;

    // Ensure milestones are separated by at least 2 minutes in time to avoid duplicate labels for rapid turns
    const targetGapMin = 2;

    milestones.push({
      label: formatMilestoneLabel(firstTime, true),
      index: 0,
      turnId: turns[0].turnId,
    });

    let lastMilestoneTime = firstTime;
    let lastMilestoneIndex = 0;

    for (let i = 1; i < turns.length; i++) {
      let turnTime = turns[i].timestamp;
      if (turnTime < 20000000000) turnTime *= 1000;

      const diffMin = (turnTime - lastMilestoneTime) / (1000 * 60);
      const diffDay = isDifferentDay(turnTime, lastMilestoneTime);

      const pct = (i / (turns.length - 1)) * 100;
      const lastPct = (lastMilestoneIndex / (turns.length - 1)) * 100;
      const diffPct = pct - lastPct;

      // Add milestone if day changes, or if >= targetGapMin gap AND at least 5% vertical separation
      if (diffDay || (diffMin >= targetGapMin && diffPct >= 5)) {
        milestones.push({
          label: formatMilestoneLabel(turnTime, diffDay),
          index: i,
          turnId: turns[i].turnId,
        });
        lastMilestoneTime = turnTime;
        lastMilestoneIndex = i;
      }
    }

    // Guarantee the latest turn is represented as the final milestone
    if (turns.length > 1 && lastMilestoneIndex !== turns.length - 1) {
      const lastIndex = turns.length - 1;
      let lastTurnTime = turns[lastIndex].timestamp;
      if (lastTurnTime < 20000000000) lastTurnTime *= 1000;

      const lastPct = (lastMilestoneIndex / (turns.length - 1)) * 100;
      const diffPct = 100 - lastPct;

      if (diffPct >= 4) {
        // Space is sufficient, push it as a new final milestone
        milestones.push({
          label: formatMilestoneLabel(
            lastTurnTime,
            isDifferentDay(lastTurnTime, lastMilestoneTime)
          ),
          index: lastIndex,
          turnId: turns[lastIndex].turnId,
        });
      } else {
        // Space is too tight, replace the last milestone to point to the final turn instead of overlapping
        const lastM = milestones[milestones.length - 1];
        if (lastM) {
          lastM.label = formatMilestoneLabel(
            lastTurnTime,
            isDifferentDay(lastTurnTime, lastMilestoneTime - 60000)
          );
          lastM.index = lastIndex;
          lastM.turnId = turns[lastIndex].turnId;
        }
      }
    }

    return milestones;
  });

  const activeMilestone = createMemo(() => {
    const milestones = dateMilestones();
    const activeIdx = activeTurnIdx();

    let activeM = milestones[0] || null;
    for (let i = 0; i < milestones.length; i++) {
      if (milestones[i].index <= activeIdx) {
        activeM = milestones[i];
      } else {
        break;
      }
    }
    return activeM;
  });

  let scrollContainerRef: HTMLDivElement | undefined;
  let scrollInnerRef: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    if (scrollContainerRef) {
      scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef || !props.session) return;

    const scrollTop = scrollContainerRef.scrollTop;
    const scrollHeight = scrollContainerRef.scrollHeight;
    const clientHeight = scrollContainerRef.clientHeight;

    const pct = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
    const children = scrollInnerRef ? scrollInnerRef.children : scrollContainerRef.children;

    // Scroll Lock detection (only check if not in the middle of a milestone jump)
    if (!isJumping()) {
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 30;
      if (isAtBottom) {
        if (!scrollLock()) {
          setScrollLock(true);
          logFE("info", `Scroll Lock: acquired (scrolled to bottom)`);
        }
      } else {
        if (scrollLock()) {
          setScrollLock(false);
          logFE("info", `Scroll Lock: released (scrolled up)`);
        }
      }
    }
    const total = props.session.turns.length - 1;
    let visualPercent = pct;

    if (total > 0 && children.length > 0) {
      let activeChildIndex = 0;
      let activeChildOffset = 0;
      let activeChildHeight = 1;

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const turnIdAttr = child.getAttribute("data-turn-id");
        if (turnIdAttr) {
          const idxAttr = child.getAttribute("data-turn-index");
          if (idxAttr !== null) {
            const idx = parseInt(idxAttr, 10);
            const top = child.offsetTop;
            const height = child.offsetHeight;

            if (top + height > scrollTop) {
              activeChildIndex = idx;
              activeChildOffset = top;
              activeChildHeight = height;
              break;
            }
          }
        }
      }

      const elapsed = scrollTop - activeChildOffset;
      const fraction = Math.max(0, Math.min(1, elapsed / activeChildHeight));
      const visualIndex = Math.min(total, activeChildIndex + fraction);
      visualPercent = (visualIndex / total) * 100;
    }

    setScrollPercent(visualPercent);

    let foundIdx = 0;
    const debugInfo: string[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const turnIdAttr = child.getAttribute("data-turn-id");
      if (turnIdAttr) {
        const offsetTop = child.offsetTop;
        const offsetHeight = child.offsetHeight;
        const idxAttr = child.getAttribute("data-turn-index");
        debugInfo.push(
          `[${idxAttr}]: id=${turnIdAttr}, offsetTop=${offsetTop}, offsetHeight=${offsetHeight}`
        );
        if (offsetTop + offsetHeight > scrollTop + 40) {
          if (idxAttr !== null) {
            foundIdx = parseInt(idxAttr, 10);
            break;
          }
        }
      }
    }
    //logFE("info", `handleScroll: scrollTop=${scrollTop}, scrollPercent=${visualPercent.toFixed(1)}, foundIdx=${foundIdx}, details: ${debugInfo.join(" | ")}`);
    setActiveTurnIdx(foundIdx);
  };

  const closeDropdowns = () => {
    setShowActionsDropdown(false);
    setShowWorkspaceDropdown(false);
    setShowSessionDropdown(false);
  };

  let handleTriggerSearch: () => void;
  let handleKeyDown: (e: KeyboardEvent) => void;
  let handleDeeplink: (e: any) => void;

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("click", closeDropdowns);

    handleTriggerSearch = () => {
      setShowDetailSearch(true);
      setTimeout(() => {
        detailSearchInputRef?.focus();
        detailSearchInputRef?.select();
      }, 50);
    };
    window.addEventListener("trigger-detail-search", handleTriggerSearch);

    handleKeyDown = (e: KeyboardEvent) => {
      const isScrollKey =
        (e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown") &&
        !e.shiftKey;

      if (isScrollKey) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isTyping =
          activeTag === "input" ||
          activeTag === "textarea" ||
          document.activeElement?.getAttribute("contenteditable") === "true";

        if (!isTyping && scrollContainerRef) {
          e.preventDefault();
          if (e.key === "Home") {
            scrollContainerRef.scrollTop = 0;
            logFE("info", "DetailPane: scrolled to top via key");
          } else if (e.key === "End") {
            scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
            logFE("info", "DetailPane: scrolled to bottom via key");
          } else if (e.key === "PageUp") {
            scrollContainerRef.scrollTop -= scrollContainerRef.clientHeight * 0.85;
            logFE("info", "DetailPane: scrolled page up via key");
          } else if (e.key === "PageDown") {
            scrollContainerRef.scrollTop += scrollContainerRef.clientHeight * 0.85;
            logFE("info", "DetailPane: scrolled page down via key");
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    handleDeeplink = (evt: any) => {
      const { sessionId, turnIndex } = evt.detail;
      if (!props.session || props.session.id !== sessionId) return;

      const turn = props.session.turns[turnIndex];
      if (!turn) return;

      const turnKey = turn.turnId || String(turnIndex);
      setTimeout(() => {
        const el = document.getElementById(turnKey);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });

          // Flash highlight the assistant bubble briefly to draw focus!
          const assistantBubble = el.querySelector(".bg-accent\\/5, .bg-accent-light\\/10");
          if (assistantBubble) {
            assistantBubble.classList.add(
              "ring-2",
              "ring-accent",
              "ring-offset-2",
              "ring-offset-background",
              "transition-all",
              "duration-1000"
            );
            setTimeout(() => {
              assistantBubble.classList.remove(
                "ring-2",
                "ring-accent",
                "ring-offset-2",
                "ring-offset-background"
              );
            }, 2500);
          }
        }
      }, 250);
    };
    window.addEventListener("deeplink-turn", handleDeeplink);

    // Set up ResizeObserver on the inner wrapper to maintain scroll lock during mounts
    if (scrollInnerRef) {
      const ro = new ResizeObserver(() => {
        if (scrollLock()) {
          scrollToBottom();
        }
      });
      ro.observe(scrollInnerRef);
      onCleanup(() => ro.disconnect());
    }
  });

  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("click", closeDropdowns);
    if (handleTriggerSearch) {
      window.removeEventListener("trigger-detail-search", handleTriggerSearch);
    }
    if (handleKeyDown) {
      window.removeEventListener("keydown", handleKeyDown);
    }
    if (handleDeeplink) {
      window.removeEventListener("deeplink-turn", handleDeeplink);
    }
  });

  // Reset pagination, search state, and scroll to bottom when session changes
  createEffect(() => {
    const id = props.session?.id;
    if (id) {
      setScrollPercent(0);
      setActiveTurnIdx(0);
      setShowDetailSearch(false);
      setDetailSearchQuery("");
      setActiveMatchIndex(0);
      setScrollLock(true); // Lock scroll to bottom for the new session

      // Perform initial scroll lock scroll
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  });

  // Extract folder name from CWD as "Workspace"
  const getWorkspaceName = () => {
    return props.session?.workspaceName || t("common.localWorkspace");
  };

  const statusBadge = (status: string) => getStatusBadge(status, t);

  const handleCopyPath = () => {
    if (props.session) {
      props.onCopyPath(props.session.filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleCopyWorkspacePath = () => {
    if (props.session && props.session.cwd) {
      navigator.clipboard.writeText(props.session.cwd);
      setCopiedWorkspace(true);
      setTimeout(() => setCopiedWorkspace(false), 2000);
    }
  };

  const handleCopyTitle = () => {
    if (props.session) {
      const titleText = props.session.threadName || t("detailPane.noSelection");
      navigator.clipboard.writeText(titleText);
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 2000);
    }
  };

  const formatFullDate = (timestampMs: number) => {
    let time = timestampMs;
    if (time < 20000000000) {
      time *= 1000;
    }
    const dateObj = new Date(time);
    const dateStr = formatDateWithSetting(dateObj, props.dateFormat || "system", locale());
    const timeStr = formatTimeWithSetting(
      dateObj,
      props.timeFormat || "system",
      props.showSeconds || false,
      locale()
    );
    return `${dateStr}, ${timeStr}`;
  };

  const handlePaneClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, textarea, button, select, a, [role='button']")) {
      const container = document.getElementById("detail-pane-scroll-container");
      if (container) {
        container.focus();
      }
    }
  };

  return (
    <div
      onClick={handlePaneClick}
      class="flex-grow h-full flex flex-col bg-background/95 min-w-0 relative transition-all duration-200 focus-within:z-[51] group"
    >
      {/* Focus Highlight Border Overlay */}
      <div class="pointer-events-none absolute inset-0 border-2 border-transparent group-focus-within:border-accent/35 z-[100] transition-all duration-200" />
      <Show
        when={!props.isLoading}
        fallback={
          <div class="flex-grow h-full flex flex-col bg-background/95 min-w-0 animate-pulse">
            {/* Header Skeleton */}
            <div
              class="px-6 border-b border-border/60 flex items-center justify-between flex-shrink-0"
              style={{ height: "4.75rem" }}
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

              <For each={[1, 2]}>
                {(_i) => (
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
                )}
              </For>
            </div>
          </div>
        }
      >
        <Show
          when={props.session}
          fallback={
            <div class="flex-grow h-full flex flex-col items-center justify-center bg-background/95 text-text-secondary select-none">
              <MessageSquare class="w-16 h-16 mb-4 text-border animate-pulse" />
              <p class="text-[0.9375rem] font-medium tracking-wide">
                {t("detailPane.selectSession")}
              </p>
            </div>
          }
        >
          {/* Top Header / Action Bar */}
          <div
            class="border-b border-border/60 flex items-center justify-between glass flex-shrink-0 transition-all duration-200 px-6 relative z-50"
            style={{
              height: "4.75rem",
            }}
          >
            <div class="min-w-0 flex flex-col gap-0.5 pt-2">
              <div class="flex items-center gap-1.5 text-xs text-text-secondary/80">
                <span class="hover:text-text-primary transition-colors cursor-default">
                  {getWorkspaceName()}
                </span>
                <span class="text-border">/</span>
                <div class="flex items-center gap-1.5 min-w-0">
                  <span
                    onClick={handleCopyTitle}
                    class={`truncate font-medium transition-all cursor-pointer hover:text-accent select-none ${copiedTitle() ? "text-emerald-400 font-semibold" : "text-text-primary"}`}
                    title={
                      copiedTitle() ? t("detailPane.titleCopied") : t("detailPane.clickToCopyTitle")
                    }
                  >
                    {props.session!.threadName || t("detailPane.noSelection")}
                  </span>
                  <Show when={copiedTitle()}>
                    <span class="text-[0.5625rem] font-bold text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded border border-emerald-400/20 animate-in fade-in zoom-in-95 duration-150 select-none">
                      {t("common.copied")}
                    </span>
                  </Show>
                </div>
                <Show when={props.session!.status}>
                  <div
                    class={`flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[0.5625rem] font-bold select-none leading-none ${statusBadge(props.session!.status!).class}`}
                  >
                    {statusBadge(props.session!.status!).icon()}
                    <span>{statusBadge(props.session!.status!).label}</span>
                  </div>
                </Show>
                <Show when={props.session!.isDeleted}>
                  <div class="flex items-center gap-1 px-1.5 py-0.5 border border-red-500/30 bg-red-500/10 text-red-500 rounded-md text-[0.5625rem] font-bold select-none leading-none">
                    <Trash2 class="w-3 h-3 text-red-500" />
                    <span>{t("sidebar.badgeDeleted") || "Deleted"}</span>
                  </div>
                </Show>
                <Show when={compactionCount() > 0}>
                  <span class="px-2 py-0.5 bg-accent/15 border border-accent/30 text-accent rounded-full text-[0.5625rem] font-bold select-none leading-none pt-[3px] pb-[3px]">
                    {t("dashboard.totalCompactions")}: {compactionCount()}
                  </span>
                </Show>
              </div>

              <Show when={props.session!.cwd}>
                <div dir="ltr" class="flex items-center gap-1.5 text-[0.6875rem] text-left">
                  <Folder
                    class={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${copiedWorkspace() ? "text-emerald-400" : "text-text-secondary/60"}`}
                  />
                  <span
                    onClick={handleCopyWorkspacePath}
                    class={`truncate transition-colors cursor-pointer hover:text-accent select-none ${copiedWorkspace() ? "text-emerald-400 font-medium" : "text-text-secondary/60"}`}
                    title={
                      copiedWorkspace()
                        ? t("detailPane.workspacePathCopied")
                        : t("detailPane.copyWorkspacePath")
                    }
                  >
                    {props.session!.cwd}
                  </span>
                  <Show when={copiedWorkspace()}>
                    <span class="text-[0.5625rem] font-bold text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded border border-emerald-400/20 animate-in fade-in zoom-in-95 duration-150 select-none">
                      {t("common.copied")}
                    </span>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="flex items-center gap-2">
              <Show when={props.session!.cwd}>
                <div class="relative flex items-center bg-surface border border-border/80 rounded-xl hover:border-border/60 transition-all select-none">
                  <button
                    onClick={async () => {
                      if (workspaceAction() === "copy") {
                        handleCopyWorkspacePath();
                      } else {
                        try {
                          await invoke("reveal_in_folder", { path: props.session!.cwd! });
                        } catch (e) {
                          console.error("Failed to reveal workspace path:", e);
                        }
                      }
                    }}
                    title={
                      workspaceAction() === "copy"
                        ? t("detailPane.copyWorkspacePath")
                        : navigator.userAgent.includes("Mac")
                          ? t("detailPane.showWorkspaceInFinder")
                          : t("detailPane.showWorkspaceInFolder")
                    }
                    class="pl-3 pr-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  >
                    <Show when={workspaceAction() === "copy"}>
                      <Show when={copiedWorkspace()} fallback={<Copy class="w-3.5 h-3.5" />}>
                        <Check class="w-3.5 h-3.5 text-emerald-400" />
                      </Show>
                      <span>{t("detailPane.copyWorkspacePath")}</span>
                    </Show>
                    <Show when={workspaceAction() === "show"}>
                      <FolderOpen class="w-3.5 h-3.5" />
                      <span>
                        {navigator.userAgent.includes("Mac")
                          ? t("detailPane.showWorkspaceInFinder")
                          : t("detailPane.showWorkspaceInFolder")}
                      </span>
                    </Show>
                  </button>
                  <div class="w-[1px] h-3 bg-border/80 self-center" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowWorkspaceDropdown(!showWorkspaceDropdown());
                      setShowSessionDropdown(false);
                      setShowActionsDropdown(false);
                    }}
                    class="px-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <ChevronDown class="w-3 h-3" />
                  </button>

                  <Show when={showWorkspaceDropdown()}>
                    <div class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl w-52 py-1 z-[9999] text-left flex flex-col animate-in fade-in slide-in-from-top-1 duration-100">
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                        onClick={() => {
                          setWorkspaceAction("copy");
                          localStorage.setItem("codeoba-workspace-action", "copy");
                          setShowWorkspaceDropdown(false);
                        }}
                      >
                        <div class="flex items-center gap-2 whitespace-nowrap">
                          <Copy class="w-3.5 h-3.5" />
                          <span>{t("detailPane.copyWorkspacePath")}</span>
                        </div>
                        <Show when={workspaceAction() === "copy"}>
                          <Check class="w-3 h-3 text-text-secondary" />
                        </Show>
                      </button>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                        onClick={() => {
                          setWorkspaceAction("show");
                          localStorage.setItem("codeoba-workspace-action", "show");
                          setShowWorkspaceDropdown(false);
                        }}
                      >
                        <div class="flex items-center gap-2 whitespace-nowrap">
                          <FolderOpen class="w-3.5 h-3.5" />
                          <span>
                            {navigator.userAgent.includes("Mac")
                              ? t("detailPane.showWorkspaceInFinder")
                              : t("detailPane.showWorkspaceInFolder")}
                          </span>
                        </div>
                        <Show when={workspaceAction() === "show"}>
                          <Check class="w-3 h-3 text-text-secondary" />
                        </Show>
                      </button>
                    </div>
                  </Show>
                </div>
              </Show>

              <div class="relative flex items-center bg-surface border border-border/80 rounded-xl hover:border-border/60 transition-all select-none">
                <button
                  onClick={async () => {
                    if (sessionAction() === "copy") {
                      handleCopyPath();
                    } else {
                      try {
                        await invoke("reveal_in_folder", { path: props.session!.filePath });
                      } catch (e) {
                        console.error("Failed to reveal session path:", e);
                      }
                    }
                  }}
                  title={
                    sessionAction() === "copy"
                      ? t("detailPane.copySessionPath")
                      : navigator.userAgent.includes("Mac")
                        ? t("detailPane.showSessionInFinder")
                        : t("detailPane.showSessionInFolder")
                  }
                  class="pl-3 pr-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                >
                  <Show when={sessionAction() === "copy"}>
                    <Show when={copiedPath()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{t("detailPane.copySessionPath")}</span>
                  </Show>
                  <Show when={sessionAction() === "show"}>
                    <FolderOpen class="w-3.5 h-3.5" />
                    <span>
                      {navigator.userAgent.includes("Mac")
                        ? t("detailPane.showSessionInFinder")
                        : t("detailPane.showSessionInFolder")}
                    </span>
                  </Show>
                </button>
                <div class="w-[1px] h-3 bg-border/80 self-center" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSessionDropdown(!showSessionDropdown());
                    setShowWorkspaceDropdown(false);
                    setShowActionsDropdown(false);
                  }}
                  class="px-2 py-2 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center cursor-pointer"
                >
                  <ChevronDown class="w-3 h-3" />
                </button>

                <Show when={showSessionDropdown()}>
                  <div class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl w-52 py-1 z-[9999] text-left flex flex-col animate-in fade-in slide-in-from-top-1 duration-100">
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                      onClick={() => {
                        setSessionAction("copy");
                        localStorage.setItem("codeoba-session-action", "copy");
                        setShowSessionDropdown(false);
                      }}
                    >
                      <div class="flex items-center gap-2 whitespace-nowrap">
                        <Copy class="w-3.5 h-3.5" />
                        <span>{t("detailPane.copySessionPath")}</span>
                      </div>
                      <Show when={sessionAction() === "copy"}>
                        <Check class="w-3 h-3 text-text-secondary" />
                      </Show>
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-colors flex items-center justify-between cursor-pointer"
                      onClick={() => {
                        setSessionAction("show");
                        localStorage.setItem("codeoba-session-action", "show");
                        setShowSessionDropdown(false);
                      }}
                    >
                      <div class="flex items-center gap-2 whitespace-nowrap">
                        <FolderOpen class="w-3.5 h-3.5" />
                        <span>
                          {navigator.userAgent.includes("Mac")
                            ? t("detailPane.showSessionInFinder")
                            : t("detailPane.showSessionInFolder")}
                        </span>
                      </div>
                      <Show when={sessionAction() === "show"}>
                        <Check class="w-3 h-3 text-text-secondary" />
                      </Show>
                    </button>
                  </div>
                </Show>
              </div>

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
                    <Show
                      when={props.onTogglePinSession && props.pinnedSessionIds && props.session}
                    >
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

                    {/* Copy Session Title */}
                    <Show when={props.session}>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          handleCopyTitle();
                          setShowActionsDropdown(false);
                        }}
                      >
                        <Copy class="w-3.5 h-3.5" />
                        <span>{t("detailPane.copyTitle")}</span>
                      </button>
                    </Show>

                    {/* Assign Group Submenu Header */}
                    <Show
                      when={
                        props.groups &&
                        props.groups.length > 0 &&
                        props.onAssignSessionToGroup &&
                        props.session
                      }
                    >
                      <div class="border-t border-border/60 my-1" />
                      <div class="px-3 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-text-secondary/55">
                        {t("groups.filterByGroup") || "Groups"}
                      </div>
                      <div class="max-h-36 overflow-y-auto">
                        <For
                          each={[...(props.groups || [])].sort((a, b) =>
                            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                          )}
                        >
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
                                  isAssigned()
                                    ? "text-accent font-semibold"
                                    : "text-text-secondary hover:text-text-primary"
                                }`}
                                onClick={async () => {
                                  setShowActionsDropdown(false);
                                  if (isAssigned()) {
                                    if (props.onRemoveSessionFromGroup) {
                                      await props.onRemoveSessionFromGroup(
                                        props.session!.id,
                                        g.name
                                      );
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

          {/* Floating Search Bar */}
          <Show when={showDetailSearch()}>
            <div
              id="detail-search-bar"
              class="absolute right-8 z-30 flex items-center gap-2 p-1.5 bg-surface/95 border border-border hover:border-border/80 rounded-xl shadow-xl glass animate-in slide-in-from-top-2 duration-150"
              style={{
                top: "calc(4.75rem + 8px)",
              }}
            >
              <div class="relative flex items-center">
                <Search class="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-text-secondary/60 pointer-events-none" />
                <input
                  id="detail-search-input"
                  ref={detailSearchInputRef}
                  type="text"
                  value={detailSearchQuery()}
                  onInput={(e) => {
                    setDetailSearchQuery(e.currentTarget.value);
                    setActiveMatchIndex(0);
                    navigateToMatch(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.shiftKey) {
                        navigateToMatch(activeMatchIndex() - 1);
                      } else {
                        navigateToMatch(activeMatchIndex() + 1);
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowDetailSearch(false);
                    }
                  }}
                  placeholder="Find in session..."
                  class="w-[200px] bg-background/50 border border-border/60 focus:border-accent text-text-primary pl-8 pr-16 py-1.5 text-xs rounded-lg outline-none transition-all placeholder:text-text-secondary/40 h-[30px]"
                />

                {/* Match count and clear button */}
                <div class="absolute right-2 flex items-center gap-1.5 text-[0.625rem] text-text-secondary/60 select-none">
                  <span>
                    {searchMatches().length > 0
                      ? `${activeMatchIndex() + 1}/${searchMatches().length}`
                      : "0/0"}
                  </span>
                  <Show when={detailSearchQuery().length > 0}>
                    <button
                      onClick={() => {
                        setDetailSearchQuery("");
                        setActiveMatchIndex(0);
                      }}
                      class="p-0.5 hover:text-text-primary transition-colors cursor-pointer"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </Show>
                </div>
              </div>

              {/* Navigation arrows */}
              <div class="flex items-center gap-0.5 border-l border-border/60 pl-1">
                <button
                  onClick={() => navigateToMatch(activeMatchIndex() - 1)}
                  title="Previous Match (Shift+Enter)"
                  class="p-1 hover:bg-surface/80 hover:text-text-primary text-text-secondary/70 rounded transition-all cursor-pointer disabled:opacity-40"
                  disabled={searchMatches().length === 0}
                >
                  <ChevronUp class="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigateToMatch(activeMatchIndex() + 1)}
                  title="Next Match (Enter)"
                  class="p-1 hover:bg-surface/80 hover:text-text-primary text-text-secondary/70 rounded transition-all cursor-pointer disabled:opacity-40"
                  disabled={searchMatches().length === 0}
                >
                  <ChevronDown class="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Search Modifiers */}
              <div class="flex items-center gap-1 border-l border-border/60 pl-1 select-none">
                {/* Case Sensitivity */}
                <button
                  onClick={() => {
                    setDetailMatchCase(!detailMatchCase());
                    navigateToMatch(0);
                  }}
                  title={t("sidebar.matchCase")}
                  class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
                    detailMatchCase()
                      ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                      : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
                  }`}
                >
                  Aa
                </button>

                {/* Whole Word */}
                <button
                  onClick={() => {
                    setDetailWholeWord(!detailWholeWord());
                    navigateToMatch(0);
                  }}
                  title={t("sidebar.wholeWord")}
                  class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
                    detailWholeWord()
                      ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                      : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
                  }`}
                >
                  \b
                </button>

                {/* Regex */}
                <button
                  onClick={() => {
                    setDetailUseRegex(!detailUseRegex());
                    navigateToMatch(0);
                  }}
                  title={t("sidebar.useRegex")}
                  class={`w-5 h-5 text-[0.5625rem] font-bold rounded flex items-center justify-center border transition-all cursor-pointer ${
                    detailUseRegex()
                      ? "bg-accent/15 border-accent/30 text-accent font-extrabold"
                      : "bg-transparent border-transparent text-text-secondary/50 hover:text-text-primary hover:bg-surface/80"
                  }`}
                >
                  .*
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowDetailSearch(false)}
                title="Close (Esc)"
                class="p-1 hover:bg-surface/80 hover:text-red-400 text-text-secondary/60 rounded transition-all border-l border-border/60 pl-1.5 cursor-pointer"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </Show>

          {/* Main Conversation Turns Scrollable Area */}
          <div
            id="detail-pane-scroll-container"
            tabindex="-1"
            ref={scrollContainerRef}
            class="flex-grow overflow-y-auto pl-8 pr-36 py-6 space-y-6 scroll-smooth outline-none relative"
            onScroll={handleScroll}
          >
            <div ref={scrollInnerRef} class="space-y-6 flex flex-col">
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
                  <span>
                    {formatFullDate(props.session!.turns[0]?.timestamp || props.session!.timestamp)}
                  </span>
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
                    <h3 class="text-xs font-bold uppercase tracking-wider">
                      {t("detailPane.aiSummaryTitle")}
                    </h3>
                  </div>
                  <p class="text-[0.8125rem] text-text-secondary leading-relaxed whitespace-pre-wrap select-text">
                    {props.session!.summary}
                  </p>
                </div>
              </Show>

              {/* Render Virtualized Conversation Bubbles */}
              <For each={props.session!.turns}>
                {(turn, index) => {
                  return (
                    <VirtualTurn
                      turn={turn}
                      actualIndex={index()}
                      formatFullDate={formatFullDate}
                      sourceId={props.session!.sourceId}
                      sessionId={props.session!.id}
                      searchQuery={activeSearchQuery()}
                      matchCase={activeMatchCase()}
                      wholeWord={activeWholeWord()}
                      useRegex={activeUseRegex()}
                      numberFormat={props.numberFormat}
                      onContextMenu={handleContextMenu}
                      onImageClick={setActiveLightboxImage}
                      onImageContextMenu={handleImageContextMenu}
                      isActiveSpeechTurn={
                        speech.isPlaying() &&
                        speech.activeSessionId() === props.session!.id &&
                        speech.activeTurnIndex() === index()
                      }
                    />
                  );
                }}
              </For>
            </div>
          </div>

          {/* Vertical Date Timeline Overlay */}
          <Show
            when={props.session && props.session.turns.length > 0 && dateMilestones().length > 1}
          >
            <div class="absolute right-8 top-24 bottom-10 w-24 flex flex-row items-stretch justify-end z-40 pointer-events-none select-none">
              <div class="relative w-full h-full">
                {/* Vertical Track Line */}
                <div class="absolute right-[3px] top-0 bottom-0 w-[1px] bg-border/20 rounded-full" />
                {/* Active Track Highlight */}
                <div
                  class="absolute right-[3px] top-0 w-[1px] bg-accent rounded-full transition-all duration-150"
                  style={{ height: `${scrollPercent()}%` }}
                />

                <For each={dateMilestones()}>
                  {(milestone) => {
                    const pct = () => {
                      const total = props.session!.turns.length;
                      if (total <= 1) return 0;
                      return (milestone.index / (total - 1)) * 100;
                    };
                    const isActive = () => activeMilestone()?.turnId === milestone.turnId;

                    return (
                      <div
                        class="absolute right-0 flex items-center gap-2 transform -translate-y-1/2 cursor-pointer group pointer-events-auto py-1.5 px-3 hover:bg-accent/10 hover:border hover:border-accent/20 rounded-md transition-all duration-150"
                        style={{ top: `${pct()}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          logFE("info", `Timeline: clicked milestone index ${milestone.index}`);
                          const el = document.getElementById(milestone.turnId);
                          if (el) {
                            setIsJumping(true);
                            setTimeout(() => {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });

                              // Perform direct scrollTop adjustments to correct layout shifts from slow rendering
                              setTimeout(() => {
                                if (scrollContainerRef) {
                                  scrollContainerRef.scrollTop = el.offsetTop;
                                }
                              }, 250);
                              setTimeout(() => {
                                if (scrollContainerRef) {
                                  scrollContainerRef.scrollTop = el.offsetTop;
                                }
                              }, 500);
                              setTimeout(() => {
                                setIsJumping(false);
                              }, 800);
                            }, 150); // Give 150ms for SolidJS DOM rendering & height cache updates to settle
                          }
                        }}
                      >
                        <span
                          class={`text-[0.5625rem] font-mono font-bold tracking-wider transition-all duration-150 uppercase whitespace-nowrap bg-background/80 px-1 py-0.5 rounded shadow-sm ${
                            isActive()
                              ? "text-accent font-extrabold scale-105 border border-accent/25"
                              : "text-text-secondary/60 group-hover:text-accent"
                          }`}
                        >
                          {milestone.label}
                        </span>
                        <div
                          class={`rounded-full border border-background transition-all duration-150 flex-shrink-0 ${
                            isActive()
                              ? "w-2.5 h-2.5 bg-accent scale-110 shadow-sm shadow-accent/50"
                              : "w-1.5 h-1.5 bg-border/40 group-hover:bg-accent group-hover:scale-125"
                          }`}
                        />
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>

      {/* Context Menu Overlay */}
      <Portal>
        <Show when={contextMenu()}>
          {(context) => {
            const [copied, setCopied] = createSignal(false);

            const handleCopyText = async () => {
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

            const handleCopyImage = async () => {
              try {
                const src = context().imageSrc || context().extra;
                if (!src) return;
                const response = await fetch(src);
                const blob = await response.blob();
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [blob.type]: blob,
                  }),
                ]);
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                  setContextMenu(null);
                }, 800);
              } catch (err) {
                console.error("Failed to copy image:", err);
              }
            };

            const handleShowInFolder = async () => {
              try {
                const path = context().imagePath || context().text;
                if (!path) return;
                await invoke("reveal_image_in_folder", { path });
                setContextMenu(null);
              } catch (err) {
                console.error("Failed to reveal file:", err);
              }
            };

            const getLabel = () => {
              if (context().type === "user" || context().type === "assistant") {
                return t("detailPane.copyMessageText");
              }
              return t("detailPane.copyToolOutput");
            };

            const isImage = () => context().type === "image";
            const isSelection = () => context().extra === "selected-text";

            return (
              <div
                ref={menuPosition.ref}
                class="fixed bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[10001] select-none transition-opacity duration-75 text-xs text-text-primary"
                style={{
                  top: `${menuPosition.pos().top}px`,
                  left: `${menuPosition.pos().left}px`,
                  opacity: menuPosition.pos().visible ? 1 : 0,
                  "pointer-events": menuPosition.pos().visible ? "auto" : "none",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Show when={isSelection()}>
                  {/* Text Selection Actions */}
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={handleCopyText}
                  >
                    <Show when={copied()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{copied() ? t("common.copied") : t("detailPane.copySelection")}</span>
                  </button>

                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={() => {
                      invoke("open_external_url", {
                        url: `https://www.google.com/search?q=${encodeURIComponent(context().text)}`,
                      });
                      setContextMenu(null);
                    }}
                  >
                    <Search class="w-3.5 h-3.5" />
                    <span>{t("detailPane.searchWithGoogle")}</span>
                  </button>

                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={() => {
                      invoke("open_external_url", {
                        url: `https://translate.google.com/?sl=auto&text=${encodeURIComponent(context().text)}`,
                      });
                      setContextMenu(null);
                    }}
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                    <span>{t("detailPane.translateSelection")}</span>
                  </button>

                  {/* Append Image Operations if selection is inside an image */}
                  <Show when={isImage()}>
                    <div class="h-[1px] bg-border/20 my-1" />

                    <button
                      class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                      onClick={handleCopyImage}
                    >
                      <Show when={copied()} fallback={<Copy class="w-3.5 h-3.5" />}>
                        <Check class="w-3.5 h-3.5 text-emerald-400" />
                      </Show>
                      <span>{copied() ? t("common.copied") : t("detailPane.copyImage")}</span>
                    </button>

                    <Show when={context().imagePath}>
                      <button
                        class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                        onClick={handleShowInFolder}
                      >
                        <Folder class="w-3.5 h-3.5" />
                        <span>
                          {navigator.userAgent.includes("Mac")
                            ? t("detailPane.showInFinder")
                            : t("detailPane.showInFolder")}
                        </span>
                      </button>
                    </Show>
                  </Show>
                </Show>

                <Show when={isImage() && !isSelection()}>
                  {/* Pure Image Actions */}
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={handleCopyImage}
                  >
                    <Show when={copied()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{copied() ? t("common.copied") : t("detailPane.copyImage")}</span>
                  </button>

                  <Show when={context().text}>
                    <button
                      class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                      onClick={handleShowInFolder}
                    >
                      <Folder class="w-3.5 h-3.5" />
                      <span>
                        {navigator.userAgent.includes("Mac")
                          ? t("detailPane.showInFinder")
                          : t("detailPane.showInFolder")}
                      </span>
                    </button>
                  </Show>
                </Show>

                <Show when={!isImage() && !isSelection()}>
                  {/* Standard Bubble Text Actions */}
                  <button
                    class="w-full text-left px-3 py-2 hover:bg-accent/10 hover:text-accent transition-all flex items-center gap-2 cursor-pointer font-medium text-text-primary"
                    onClick={handleCopyText}
                  >
                    <Show when={copied()} fallback={<Copy class="w-3.5 h-3.5" />}>
                      <Check class="w-3.5 h-3.5 text-emerald-400" />
                    </Show>
                    <span>{copied() ? t("common.copied") : getLabel()}</span>
                  </button>
                </Show>
              </div>
            );
          }}
        </Show>
      </Portal>

      {/* Fullscreen Lightbox Overlay */}
      <Portal>
        <Show when={activeLightboxImage()}>
          {(src) => (
            <div
              class="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
              onClick={() => setActiveLightboxImage(null)}
            >
              {/* Close button */}
              <button
                class="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 p-2.5 rounded-full transition-all cursor-pointer"
                onClick={() => setActiveLightboxImage(null)}
              >
                <X class="w-6 h-6" />
              </button>

              {/* Fullscreen Image */}
              <img
                src={src().src}
                class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/10 animate-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => handleImageContextMenu(e, src().path, src().src)}
              />
            </div>
          )}
        </Show>
      </Portal>
    </div>
  );
};

interface VirtualTurnProps {
  turn: Turn;
  actualIndex: number;
  formatFullDate: (timestamp: number) => string;
  sourceId: string;
  sessionId: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  numberFormat?: string;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
  onImageClick: (img: { path?: string; src: string }) => void;
  onImageContextMenu: (e: MouseEvent, path?: string, src?: string) => void;
  isActiveSpeechTurn?: boolean;
}

const VirtualTurn = (props: VirtualTurnProps) => {
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
          onContextMenu={(e) => props.onContextMenu(e, "user", props.turn.userMessage)}
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
          class={`w-full p-5 rounded-2xl shadow-sm transition-all duration-300 ${
            props.isActiveSpeechTurn
              ? "bg-accent/5 border-2 border-accent shadow-md shadow-accent/15"
              : "bg-accent-light/10 border border-accent/20"
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

const AssistantMessageRenderer = (props: {
  message: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  onContextMenu: (e: MouseEvent, type: "user" | "assistant" | "tool", text: string) => void;
  sessionId?: string;
  turnIndex?: number;
}) => {
  const parts = createMemo(() => parseAssistantMessage(props.message));

  const groupedParts = createMemo(() => {
    const list = parts();
    const result: Array<
      { type: "text"; content: string } | { type: "toolGroup"; tools: MessageToolPart[] }
    > = [];
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
                  sessionId={props.sessionId}
                  turnIndex={props.turnIndex}
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
    const content = props.tool.content.toLowerCase();

    const isError =
      content.includes("error:") ||
      content.includes("failed with") ||
      content.includes("exit code:") ||
      content.includes("invalid tool call");
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
