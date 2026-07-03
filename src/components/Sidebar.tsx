import { createSignal, createMemo, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { formatDateWithSetting, formatTimeWithSetting } from "../utils/format";
import { 
  Search, 
  Sparkles, 
  SlidersHorizontal, 
  Pin, 
  Archive, 
  Loader2,
  Clock,
  MessageSquare,
  Cpu,
  Bolt,
  X,
  HelpCircle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
  Folder
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { Session, SearchResult, SourceMetadata } from "../types";

export interface GroupTask {
  id: string;
  title: string;
  isCompleted: boolean;
  associatedSessionId: string | null;
}

export interface ConversationGroup {
  name: string;
  description: string;
  status: string;
  sessionIds: string[];
  tasks: GroupTask[];
  pastWorkSummary: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GroupTreeNode {
  segment: string;
  fullName: string;
  children: GroupTreeNode[];
  isPinned: boolean;
  directSessionCount: number;
  recursiveSessionCount: number;
  containsPinnedSessions: boolean;
}

export function buildGroupTree(
  groups: ConversationGroup[],
  pinnedSessionIds: Set<string>
): GroupTreeNode[] {
  const rootNodes: GroupTreeNode[] = [];

  for (const group of groups) {
    const parts = group.name.split("/");
    let currentLevel = rootNodes;
    let currentFullName = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentFullName = currentFullName === "" ? part : `${currentFullName}/${part}`;

      let node = currentLevel.find(n => n.segment.toLowerCase() === part.toLowerCase());
      if (!node) {
        node = {
          segment: part,
          fullName: currentFullName,
          children: [],
          isPinned: false,
          directSessionCount: 0,
          recursiveSessionCount: 0,
          containsPinnedSessions: false
        };
        currentLevel.push(node);
      }

      if (i === parts.length - 1) {
        node.isPinned = group.isPinned;
        node.directSessionCount = group.sessionIds?.length || 0;
        node.containsPinnedSessions = (group.sessionIds || []).some(id => pinnedSessionIds.has(id));
      }
      currentLevel = node.children;
    }
  }

  function finalizeNode(node: GroupTreeNode): [number, boolean] {
    let childSessionsCount = 0;
    let childHasPinnedSessions = false;

    for (const child of node.children) {
      const [cCount, cPinned] = finalizeNode(child);
      childSessionsCount += cCount;
      if (cPinned) {
        childHasPinnedSessions = true;
      }
    }

    node.recursiveSessionCount = node.directSessionCount + childSessionsCount;
    node.containsPinnedSessions = node.containsPinnedSessions || childHasPinnedSessions;

    node.children.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.segment.toLowerCase().localeCompare(b.segment.toLowerCase());
    });

    return [node.recursiveSessionCount, node.containsPinnedSessions];
  }

  for (const root of rootNodes) {
    finalizeNode(root);
  }

  rootNodes.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return a.segment.toLowerCase().localeCompare(b.segment.toLowerCase());
  });

  return rootNodes;
}


interface SidebarProps {
  sessions: Session[];
  searchResults: SearchResult[] | null;
  selectedSessionId: string | null;
  loadingSessionId: string | null;
  onSelectSession: (session: Session) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSemantic: boolean;
  onSemanticToggle: () => void;
  selectedSources: Set<string>;
  onToggleSource: (sourceId: string) => void;
  archivalFilter: "all" | "active" | "archived";
  onArchivalFilterChange: (filter: "all" | "active" | "archived") => void;
  sources: SourceMetadata[];
  indexingProgress: {
    step: string;
    progress: number;
    currentSource: string;
  } | null;
  width: number;
  onWidthChange: (w: number) => void;
  collapsed?: boolean;
  appVersion?: string;
  dateFormat: string;
  timeFormat: string;
  showSeconds: boolean;
  numberFormat: string;
  groups: ConversationGroup[];
  activeGroupFilter: string | null;
  onActiveGroupFilterChange: (filter: string | null) => void;
  onAddGroup: (name: string) => Promise<boolean>;
  onRenameGroup: (oldName: string, newName: string) => Promise<boolean>;
  onDeleteGroup: (name: string) => Promise<void>;
  onToggleGroupPin: (name: string, pinned: boolean) => Promise<void>;
  onAssignSessionToGroup: (sessionId: string, groupName: string) => Promise<void>;
  onRemoveSessionFromGroup: (sessionId: string, groupName: string) => Promise<void>;
  pinnedSessionIds: Set<string>;
  onTogglePinSession: (sessionId: string) => void;
}

export const getSessionComputeTimeMs = (session: Session): number => {
  let totalMs = 0;
  for (const turn of session.turns) {
    const extra = turn.extraData;
    const msStr = extra ? extra["computeTimeMs"] : null;
    const ms = msStr ? parseInt(msStr, 10) : null;
    if (ms !== null && !isNaN(ms) && ms > 0) {
      totalMs += Math.min(900000, ms);
    } else if (turn.assistantMessage && turn.assistantMessage.length > 0) {
      const estMs = Math.round((turn.assistantMessage.length / 120.0) * 1000.0);
      totalMs += Math.max(2000, Math.min(60000, estMs));
    }
  }
  return totalMs;
};

export const getSessionTokensCount = (session: Session): number => {
  let total = 0;
  let hasRealTokens = false;
  for (const turn of session.turns) {
    if ((turn.inputTokens !== undefined && turn.inputTokens !== null) || 
        (turn.outputTokens !== undefined && turn.outputTokens !== null)) {
      hasRealTokens = true;
      total += (turn.inputTokens || 0) + (turn.outputTokens || 0);
    }
  }
  if (hasRealTokens) return total;
  
  let charCount = 0;
  for (const turn of session.turns) {
    charCount += (turn.userMessage || "").length + (turn.assistantMessage || "").length;
  }
  return Math.round(charCount / 4);
};

export const formatSpeed = (tokens: number, ms: number): string => {
  if (ms <= 0) return "0.0 t/s";
  const tps = (tokens * 1000.0) / ms;
  return `${tps.toFixed(1)} t/s`;
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

export const getSessionModels = (session: Session): string[] => {
  const models: string[] = [];
  for (const turn of session.turns) {
    const extra = turn.extraData;
    const m = extra ? extra["model"] : null;
    if (m && !models.includes(m)) {
      models.push(m);
    }
  }
  return models;
};

export const Sidebar = (props: SidebarProps) => {
  const { t, locale } = useI18n();
  const [showFilters, setShowFilters] = createSignal(false);

  const [sortBy, setSortBy] = createSignal<"relevance" | "updated" | "tokens" | "speed" | "turns" | "duration">(
    (localStorage.getItem("codeoba-sidebar-sort-by") as any) || "updated"
  );
  const [sortAscending, setSortAscending] = createSignal<boolean>(
    localStorage.getItem("codeoba-sidebar-sort-ascending") === "true"
  );

  // Sync to localStorage
  createEffect(() => {
    localStorage.setItem("codeoba-sidebar-sort-by", sortBy());
  });
  createEffect(() => {
    localStorage.setItem("codeoba-sidebar-sort-ascending", sortAscending() ? "true" : "false");
  });

  const availableDimensions = createMemo(() => {
    if (props.searchQuery.trim().length > 0) {
      return ["relevance", "updated", "tokens", "speed", "turns", "duration"] as const;
    } else {
      return ["updated", "tokens", "speed", "turns", "duration"] as const;
    }
  });

  const effectiveSortBy = createMemo(() => {
    const activeSort = sortBy();
    if (activeSort === "relevance" && props.searchQuery.trim().length === 0) {
      return "updated";
    }
    return activeSort;
  });

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = props.width;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      props.onWidthChange(newWidth);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to format source tags
  const getSourceStyle = (sourceId: string) => {
    switch (sourceId.toLowerCase()) {
      case "claude":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "antigravity":
        return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      case "cursor":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "copilot":
        return "bg-pink-500/10 text-pink-400 border-pink-500/20";
      case "codex":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const getSourceLabel = (sourceId: string) => {
    const found = props.sources.find(s => s.id === sourceId);
    return found ? found.displayName : sourceId;
  };

  // Helper to format timestamps to relative/absolute datetime strings
  const formatRelativeTime = (timestampMs: number) => {
    let time = timestampMs;
    const now = Date.now();
    
    if (time < 20000000000) {
      time *= 1000;
    }

    const dateObj = new Date(time);
    const timeStr = formatTimeWithSetting(dateObj, props.timeFormat, props.showSeconds, locale());

    // Check if it's today
    const nowObj = new Date(now);
    const isToday = dateObj.getDate() === nowObj.getDate() &&
                    dateObj.getMonth() === nowObj.getMonth() &&
                    dateObj.getFullYear() === nowObj.getFullYear();

    if (isToday) {
      return timeStr;
    }

    // Check if it's yesterday
    const yesterday = new Date(now - 86400000);
    const isYesterday = dateObj.getDate() === yesterday.getDate() &&
                        dateObj.getMonth() === yesterday.getMonth() &&
                        dateObj.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return `${t("sidebar.yesterday") || "Yesterday"}, ${timeStr}`;
    }

    // Otherwise, show full date and time according to settings
    const dateStr = formatDateWithSetting(dateObj, props.dateFormat || "system", locale());

    return `${dateStr}, ${timeStr}`;
  };

  const formatSessionTimes = (startTimestamp: number, updatedTimestamp: number) => {
    let tStart = startTimestamp;
    let tEnd = updatedTimestamp;
    
    if (tStart < 20000000000) tStart *= 1000;
    if (tEnd < 20000000000) tEnd *= 1000;

    // If they are virtually the same (within 5 seconds), just show the end time
    if (Math.abs(tEnd - tStart) < 5000) {
      return formatRelativeTime(updatedTimestamp);
    }

    const startObj = new Date(tStart);
    const endObj = new Date(tEnd);
    
    const startTimeStr = formatTimeWithSetting(startObj, props.timeFormat, props.showSeconds, locale());
    const endTimeStr = formatTimeWithSetting(endObj, props.timeFormat, props.showSeconds, locale());

    const now = Date.now();
    const nowObj = new Date(now);

    const isSameDay = startObj.getDate() === endObj.getDate() &&
                      startObj.getMonth() === endObj.getMonth() &&
                      startObj.getFullYear() === endObj.getFullYear();

    if (isSameDay) {
      // Check if it's today
      const isToday = startObj.getDate() === nowObj.getDate() &&
                      startObj.getMonth() === nowObj.getMonth() &&
                      startObj.getFullYear() === nowObj.getFullYear();

      if (isToday) {
        return `${startTimeStr} ➜ ${endTimeStr}`;
      }

      // Check if it's yesterday
      const yesterday = new Date(now - 86400000);
      const isYesterday = startObj.getDate() === yesterday.getDate() &&
                          startObj.getMonth() === yesterday.getMonth() &&
                          startObj.getFullYear() === yesterday.getFullYear();

      if (isYesterday) {
        return `${t("sidebar.yesterday") || "Yesterday"}, ${startTimeStr} ➜ ${endTimeStr}`;
      }

      // Older date
      const dateStr = formatDateWithSetting(startObj, props.dateFormat || "system", locale());
      return `${dateStr}, ${startTimeStr} ➜ ${endTimeStr}`;
    } else {
      // Different days
      return `${formatRelativeTime(startTimestamp)} ➜ ${formatRelativeTime(updatedTimestamp)}`;
    }
  };

  // Extract a text snippet from a session's turns
  const getSessionSnippet = (session: Session, matchedTurns?: number[]) => {
    if (matchedTurns && matchedTurns.length > 0 && session.turns) {
      const idx = matchedTurns[0];
      const turn = session.turns[idx];
      if (turn) {
        return turn.userMessage.substring(0, 100).replace(/\s+/g, " ") || 
               turn.assistantMessage.substring(0, 100).replace(/\s+/g, " ");
      }
    }
    if (session.snippet) {
      return session.snippet;
    }
    if (session.turns && session.turns.length > 0) {
      const lastTurn = session.turns[session.turns.length - 1];
      if (lastTurn) {
        return lastTurn.userMessage.substring(0, 100).replace(/\s+/g, " ") || 
               lastTurn.assistantMessage.substring(0, 100).replace(/\s+/g, " ");
      }
    }
    return t("sidebar.noMessages");
  };

  const [showGroups, setShowGroups] = createSignal(true);
  const [isAddingGroup, setIsAddingGroup] = createSignal(false);
  const [newGroupName, setNewGroupName] = createSignal("");
  const [renamingGroupPath, setRenamingGroupPath] = createSignal<string | null>(null);
  const [deletingGroupName, setDeletingGroupName] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    type: "session" | "group";
    targetSession?: Session;
    targetGroupNode?: GroupTreeNode;
  } | null>(null);

  const handleContextMenu = (e: MouseEvent, type: "session" | "group", targetSession?: Session, targetGroupNode?: GroupTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      targetSession,
      targetGroupNode
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
  });
  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
  });

  const activeGroupSessionIds = createMemo(() => {
    if (!props.activeGroupFilter) return null;
    if (props.activeGroupFilter === "_none_") {
      const assigned = new Set<string>();
      for (const g of props.groups) {
        if (g.sessionIds) {
          for (const id of g.sessionIds) {
            assigned.add(id);
          }
        }
      }
      return assigned;
    }
    const ids = new Set<string>();
    const target = props.activeGroupFilter.toLowerCase();
    const prefix = `${target}/`;
    for (const g of props.groups) {
      const gName = g.name.toLowerCase();
      if (gName === target || gName.startsWith(prefix)) {
        if (g.sessionIds) {
          for (const id of g.sessionIds) {
            ids.add(id);
          }
        }
      }
    }
    return ids;
  });

  // Determine what to display based on search results and filters
  const listItems = createMemo(() => {
    let items: { session: Session; matchedTurns?: number[]; score?: number }[] = [];

    if (props.searchResults !== null) {
      items = props.searchResults.map(r => ({
        session: r.session,
        matchedTurns: r.matchedTurnIndexes,
        score: r.score
      }));
    } else {
      items = props.sessions
        .filter(s => {
          // Source filter
          if (props.selectedSources.size > 0 && !props.selectedSources.has(s.sourceId)) {
            return false;
          }
          // Archival filter
          if (props.archivalFilter === "active" && s.isArchived) return false;
          if (props.archivalFilter === "archived" && !s.isArchived) return false;
          return true;
        })
        .map(s => ({
          session: s,
          matchedTurns: undefined,
          score: undefined
        }));
    }

    // Filter by group on the frontend
    const ids = activeGroupSessionIds();
    if (ids) {
      if (props.activeGroupFilter === "_none_") {
        items = items.filter(item => !ids.has(item.session.id));
      } else {
        items = items.filter(item => ids.has(item.session.id));
      }
    }

    // Ensure all items reflect the correct pin state from props.pinnedSessionIds
    for (const item of items) {
      item.session.isPinned = props.pinnedSessionIds.has(item.session.id);
    }

    // Now sort the items
    const currentEffectiveSort = effectiveSortBy();
    const isAscending = sortAscending();

    items.sort((a, b) => {
      // Pinned items always go to the top
      if (a.session.isPinned && !b.session.isPinned) return -1;
      if (!a.session.isPinned && b.session.isPinned) return 1;

      // Within pinned / non-pinned items, sort by the chosen dimension
      let comparison = 0;

      if (currentEffectiveSort === "relevance") {
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        if (scoreA !== scoreB) {
          comparison = scoreA - scoreB;
        } else {
          // tie breaker
          comparison = a.session.updatedAt - b.session.updatedAt;
        }
      } else if (currentEffectiveSort === "updated") {
        comparison = a.session.updatedAt - b.session.updatedAt;
      } else if (currentEffectiveSort === "tokens") {
        const tokensA = getSessionTokensCount(a.session);
        const tokensB = getSessionTokensCount(b.session);
        comparison = tokensA - tokensB;
      } else if (currentEffectiveSort === "speed") {
        const speedA = (() => {
          const t = getSessionTokensCount(a.session);
          const ms = getSessionComputeTimeMs(a.session);
          return ms > 0 ? (t * 1000.0) / ms : 0.0;
        })();
        const speedB = (() => {
          const t = getSessionTokensCount(b.session);
          const ms = getSessionComputeTimeMs(b.session);
          return ms > 0 ? (t * 1000.0) / ms : 0.0;
        })();
        comparison = speedA - speedB;
      } else if (currentEffectiveSort === "turns") {
        comparison = a.session.turns.length - b.session.turns.length;
      } else if (currentEffectiveSort === "duration") {
        comparison = getSessionComputeTimeMs(a.session) - getSessionComputeTimeMs(b.session);
      }

      return isAscending ? comparison : -comparison;
    });

    return items;
  });

  return (
    <aside 
      class="border-r border-border h-full flex flex-col overflow-hidden bg-background select-none relative"
      style={{
        width: props.collapsed ? "0px" : `${props.width}px`,
        "min-width": props.collapsed ? "0px" : `${props.width}px`,
        "max-width": props.collapsed ? "0px" : `${props.width}px`,
        display: props.collapsed ? "none" : "flex",
        "padding-top": "0px"
      }}
    >
      {/* Drag Handle */}
      <div 
        onMouseDown={handleMouseDown}
        class="absolute right-0 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-50 select-none"
        style={{
          top: "0px",
          height: "100%"
        }}
      />
      {/* Sticky Header Section */}
      <div class="p-4 border-b border-border space-y-3 flex-shrink-0">
        <div class="flex items-center justify-between">
          <span class="text-[18px] font-semibold text-text-primary tracking-wide">
            {t("sidebar.title")}
          </span>
        </div>

        {/* Search Bar Group */}
        <div class="flex gap-2">
          <div class="relative flex-grow">
            <Search class="absolute left-3 top-2.5 w-4 h-4 text-text-secondary rtl:left-auto rtl:right-3" />
            <input
              type="text"
              value={props.searchQuery}
              onInput={(e) => props.onSearchChange(e.currentTarget.value)}
              placeholder={t("sidebar.searchPlaceholder")}
               class="w-full bg-surface border border-border hover:border-border/80 focus:border-accent text-text-primary pl-9 pr-9 py-2 text-sm rounded-xl outline-none transition-all placeholder:text-text-secondary/60"
            />
            <Show when={props.searchQuery.length > 0}>
              <button
                onClick={() => props.onSearchChange("")}
                title={t("common.clear")}
                class="absolute right-3 top-2.5 text-text-secondary hover:text-text-primary transition-colors cursor-pointer rtl:right-auto rtl:left-3"
              >
                <X class="w-4 h-4" />
              </button>
            </Show>
          </div>
          <button
            onClick={() => props.onSemanticToggle()}
            title={props.isSemantic ? t("sidebar.semanticEnabled") : t("sidebar.lexicalEnabled")}
            class={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer ${
              props.isSemantic 
                ? "bg-accent/15 border-accent text-accent shadow-sm shadow-accent/20" 
                : "bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border/80"
            }`}
          >
            <Sparkles class="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters())}
            title={t("sidebar.filters")}
            class={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer ${
              showFilters() 
                ? "bg-surface border-accent text-accent" 
                : "bg-surface border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            <SlidersHorizontal class="w-4 h-4" />
          </button>
        </div>

        {/* Collapsible Filter panel */}
        <Show when={showFilters()}>
          <div class="p-3 bg-surface/50 border border-border/80 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Source checkboxes */}
            <div class="space-y-1.5">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {t("sidebar.sources")}
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <For each={props.sources}>
                  {(src) => {
                    const isChecked = createMemo(() => props.selectedSources.has(src.id));
                    return (
                      <label 
                        class={`flex items-center gap-2 px-2.5 py-1.5 border rounded-lg text-xs cursor-pointer transition-all ${
                          isChecked() 
                            ? "bg-accent/10 border-accent/40 text-accent font-medium" 
                            : "border-border/40 hover:bg-surface text-text-secondary"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked()}
                          onChange={() => props.onToggleSource(src.id)}
                          class="hidden"
                        />
                        <span>{src.displayName}</span>
                      </label>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Archival segmented controls */}
            <div class="space-y-1.5">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {t("sidebar.statusFilter")}
              </div>
              <div class="flex bg-surface p-1 rounded-lg border border-border/60">
                <For each={["all", "active", "archived"] as const}>
                  {(tab) => (
                    <button
                      onClick={() => props.onArchivalFilterChange(tab)}
                      class={`flex-1 text-center py-1 text-xs rounded-md transition-all capitalize cursor-pointer ${
                        props.archivalFilter === tab 
                          ? "bg-background text-accent border border-border font-medium shadow-sm" 
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {t(`sidebar.filter${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Sort by controls */}
            <div class="space-y-1.5 pt-1.5 border-t border-border/40">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {t("sidebar.sortBy")}
              </div>
              <div class="flex flex-wrap gap-1.5">
                <For each={availableDimensions()}>
                  {(dimension) => {
                    const isSelected = createMemo(() => effectiveSortBy() === dimension);
                    return (
                      <button
                        onClick={() => {
                          if (sortBy() === dimension) {
                            setSortAscending(!sortAscending());
                          } else {
                            setSortBy(dimension);
                            setSortAscending(false);
                          }
                        }}
                        class={`px-2.5 py-1.5 border rounded-lg text-xs cursor-pointer transition-all flex items-center gap-1 ${
                          isSelected() 
                            ? "bg-accent/10 border-accent/40 text-accent font-medium" 
                            : "border-border/40 hover:bg-surface text-text-secondary"
                        }`}
                      >
                        <span>{t(`sidebar.sort${dimension.charAt(0).toUpperCase() + dimension.slice(1)}`)}</span>
                        <Show when={isSelected()}>
                          <Show when={sortAscending()} fallback={<ArrowDown class="w-3 h-3 flex-shrink-0" />}>
                            <ArrowUp class="w-3 h-3 flex-shrink-0" />
                          </Show>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Group Filters section */}
        <div class="flex flex-col border border-border/80 rounded-xl bg-surface/30 p-2.5 gap-2 flex-shrink-0">
          <div class="flex items-center justify-between">
            <button
              onClick={() => setShowGroups(!showGroups())}
              class="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary uppercase tracking-wider cursor-pointer"
            >
              <Show when={showGroups()} fallback={<ChevronRight class="w-3.5 h-3.5" />}>
                <ChevronDown class="w-3.5 h-3.5" />
              </Show>
              <span>{t("groups.filterByGroup")}</span>
            </button>
            <button
              onClick={() => {
                const nextAdding = !isAddingGroup();
                setIsAddingGroup(nextAdding);
                if (nextAdding) {
                  setNewGroupName("");
                  setShowGroups(true);
                }
              }}
              title={t("groups.addGroup")}
              class={`p-1 rounded transition-all cursor-pointer ${
                isAddingGroup() 
                  ? "bg-accent/20 text-accent font-semibold" 
                  : "hover:bg-accent/15 text-accent"
              }`}
            >
              <Folder class="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Inline Add Group box */}
          <Show when={isAddingGroup()}>
            <div class="flex items-center gap-1.5 p-1.5 bg-surface border border-border/80 rounded-lg animate-in fade-in duration-150 w-full">
              <div class="relative flex items-center flex-grow bg-background rounded-md border border-border/60 px-2 py-1 min-w-0">
                <input
                  type="text"
                  placeholder={t("groups.tagInputPlaceholder")}
                  value={newGroupName()}
                  onInput={(e) => setNewGroupName(e.currentTarget.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const trimmed = newGroupName().trim().replace(/\\/g, "/");
                      if (trimmed) {
                        await props.onAddGroup(trimmed);
                        setNewGroupName("");
                        setIsAddingGroup(false);
                        setShowGroups(true);
                      }
                    } else if (e.key === "Escape") {
                      setIsAddingGroup(false);
                      setNewGroupName("");
                    }
                  }}
                  class="w-full bg-transparent border-none text-xs text-text-primary outline-none pr-5"
                  autofocus
                />
                <Show when={newGroupName().length > 0}>
                  <button
                    onClick={() => setNewGroupName("")}
                    class="absolute right-1.5 text-text-secondary hover:text-text-primary cursor-pointer p-0.5"
                  >
                    <X class="w-3.5 h-3.5" />
                  </button>
                </Show>
              </div>
              <button
                disabled={!newGroupName().trim()}
                onClick={async () => {
                  const trimmed = newGroupName().trim().replace(/\\/g, "/");
                  if (trimmed) {
                    await props.onAddGroup(trimmed);
                    setNewGroupName("");
                    setIsAddingGroup(false);
                    setShowGroups(true);
                  }
                }}
                class={`p-1.5 rounded-md transition-all border flex-shrink-0 ${
                  newGroupName().trim()
                    ? "bg-accent hover:bg-accent-light text-white border-accent cursor-pointer shadow-sm"
                    : "bg-surface-light text-text-secondary/30 border-border/40 cursor-not-allowed opacity-50"
                }`}
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </Show>
          
          <Show when={showGroups()}>
            <div class="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
              {/* Unassigned / [No Group] Filter */}
              <div
                class={`w-full flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer transition-all border ${
                  props.activeGroupFilter === "_none_"
                    ? "bg-accent/15 border-accent/30 text-accent font-semibold shadow-sm"
                    : "border-transparent text-text-secondary hover:bg-surface/60 hover:text-text-primary"
                }`}
                onClick={() => {
                  if (props.activeGroupFilter === "_none_") {
                    props.onActiveGroupFilterChange(null);
                  } else {
                    props.onActiveGroupFilterChange("_none_");
                  }
                }}
              >
                <div class="flex items-center gap-1.5">
                  <div class="w-4 h-4" />
                  <Folder class={`w-4 h-4 flex-shrink-0 ${props.activeGroupFilter === "_none_" ? "text-accent" : "text-text-secondary/70"}`} />
                  <span class="text-xs">{t("groups.noGroup")}</span>
                </div>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-light border border-border/40 text-accent">
                  {props.sessions.filter(s => !props.groups.some(g => g.sessionIds?.includes(s.id))).length}
                </span>
              </div>
              
              {/* Recursive Group Tree Nodes */}
              <For each={buildGroupTree(props.groups, props.pinnedSessionIds)}>
                {rootNode => (
                  <GroupTreeItem
                    node={rootNode}
                    depth={0}
                    activeGroupFilter={props.activeGroupFilter}
                    onSelect={props.onActiveGroupFilterChange}
                    onContextMenu={(e, node) => handleContextMenu(e, "group", undefined, node)}
                    renamingGroupPath={renamingGroupPath()}
                    setRenamingGroupPath={setRenamingGroupPath}
                    onRenameGroup={props.onRenameGroup}
                    onAssignSessionToGroup={props.onAssignSessionToGroup}
                  />
                )}
              </For>
              
              <Show when={props.groups.length === 0}>
                <div class="text-center text-text-secondary/60 text-xs py-2">
                  {t("groups.noGroupsDefined")}
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      {/* Indexing Progress Indicator */}
      <Show when={props.indexingProgress}>
        <div class="px-4 py-3 bg-accent/5 border-b border-border/40 space-y-1.5 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div class="flex items-center justify-between text-[11px] font-medium">
            <span class="text-accent uppercase tracking-wider font-semibold animate-pulse">
              {props.indexingProgress!.step === "complete" ? "Finished" : "Indexing"}
            </span>
            <span class="text-text-secondary truncate max-w-[180px]">
              {props.indexingProgress!.currentSource}
            </span>
            <span class="font-mono text-accent">
              {Math.round(props.indexingProgress!.progress * 100)}%
            </span>
          </div>
          <div class="h-1.5 w-full bg-border/40 rounded-full overflow-hidden">
            <div 
              class="h-full bg-accent transition-all duration-300 ease-out" 
              style={{ width: `${props.indexingProgress!.progress * 100}%` }}
            />
          </div>
        </div>
      </Show>

      {/* Sessions List Area */}
      <div class="flex-grow overflow-y-auto min-h-0 p-3 flex flex-col gap-2.5">
        <Show 
          when={listItems().length > 0} 
          fallback={
            <div class="p-8 text-center text-text-secondary text-sm">
              {t("groups.noMatchingSessions")}
            </div>
          }
        >
          <For each={listItems()}>
            {({ session, matchedTurns, score }) => {
              const isSelected = createMemo(() => props.selectedSessionId === session.id);
              const snippet = createMemo(() => getSessionSnippet(session, matchedTurns));
              const sessionTimesText = createMemo(() => formatSessionTimes(session.timestamp, session.updatedAt));
              
              return (
                <SessionCard
                  session={session}
                  isSelected={isSelected()}
                  isLoading={props.loadingSessionId === session.id}
                  onSelect={props.onSelectSession}
                  snippet={snippet()}
                  sessionTimesText={sessionTimesText()}
                  score={score}
                  getSourceStyle={getSourceStyle}
                  getSourceLabel={getSourceLabel}
                  groups={props.groups}
                  onContextMenu={(e, s) => handleContextMenu(e, "session", s)}
                />
              );
            }}
          </For>
        </Show>
      </div>

      {/* Context Menu Overlay */}
      <Show when={contextMenu()}>
        {(context) => {
          const handleOverlayClick = (e: MouseEvent) => {
            // Keep menu open if clicking inside the input search container
            e.stopPropagation();
          };

          return (
            <div
              class="fixed bg-surface border border-border rounded-xl shadow-xl w-56 py-1.5 z-[9999] select-none"
              style={{
                top: `${Math.min(window.innerHeight - 300, context().y)}px`,
                left: `${Math.min(window.innerWidth - 240, context().x)}px`
              }}
              onClick={handleOverlayClick}
            >
              <Show when={context().type === "session" && context().targetSession}>
                {(session) => {
                  const [tagInput, setTagInput] = createSignal("");
                  
                  return (
                    <>
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          props.onTogglePinSession(session().id);
                          setContextMenu(null);
                        }}
                      >
                        <Pin class="w-3.5 h-3.5" />
                        <span>{session().isPinned ? t("groups.unpinConversation") : t("groups.pinConversation")}</span>
                      </button>
                      
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={async () => {
                          setContextMenu(null);
                          try {
                            await invoke("open_file_externally", {
                              rawPath: session().filePath,
                              sessionCwd: session().cwd || null
                            });
                          } catch (e) {
                            console.error("Failed to open file externally", e);
                          }
                        }}
                      >
                        <HelpCircle class="w-3.5 h-3.5" />
                        <span>{t("groups.openSessionFile")}</span>
                      </button>
                      
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(session().id);
                          setContextMenu(null);
                        }}
                      >
                        <Clock class="w-3.5 h-3.5" />
                        <span>{t("groups.copySessionId")}</span>
                      </button>
                      
                      <div class="border-t border-border my-1" />
                      <div class="px-3 py-1 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                        {t("groups.groupsTagsHeader")}
                      </div>
                      
                      {/* Tag input */}
                      <div class="px-2 py-1">
                        <input
                          type="text"
                          placeholder={t("groups.tagInputPlaceholder")}
                          value={tagInput()}
                          onInput={(e) => setTagInput(e.currentTarget.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const trimmed = tagInput().trim().replace(/\\/g, "/");
                              if (trimmed) {
                                const exists = props.groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
                                if (!exists) {
                                  await props.onAddGroup(trimmed);
                                }
                                await props.onAssignSessionToGroup(session().id, trimmed);
                                setTagInput("");
                              }
                            }
                          }}
                          class="w-full bg-background border border-border hover:border-border/80 focus:border-accent text-text-primary text-[11px] px-2 py-1 rounded outline-none"
                        />
                      </div>
                      
                      {/* Tags list */}
                      <div class="max-h-36 overflow-y-auto px-1 py-0.5">
                        <For each={[...props.groups].filter(g => g.name.toLowerCase().includes(tagInput().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))}>
                          {(group) => {
                            const inGroup = () => group.sessionIds?.includes(session().id);
                            return (
                              <button
                                class="w-full text-left px-2 py-1 text-xs hover:bg-accent/10 hover:text-accent text-text-primary rounded transition-all flex items-center justify-between cursor-pointer"
                                onClick={async () => {
                                  if (inGroup()) {
                                    await props.onRemoveSessionFromGroup(session().id, group.name);
                                  } else {
                                    await props.onAssignSessionToGroup(session().id, group.name);
                                  }
                                }}
                              >
                                <span class="truncate max-w-[150px]">{group.name}</span>
                                <Show when={inGroup()}>
                                  <X class="w-3.5 h-3.5 text-accent hover:text-red-400 transition-colors" />
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                        <Show when={props.groups.length === 0 && !tagInput()}>
                          <div class="text-[10px] text-text-secondary/70 text-center py-1">{t("groups.noTagsAvailable")}</div>
                        </Show>
                      </div>
                    </>
                  );
                }}
              </Show>
              
              <Show when={context().type === "group" && context().targetGroupNode}>
                {(node) => (
                  <>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        props.onToggleGroupPin(node().fullName, !node().isPinned);
                        setContextMenu(null);
                      }}
                    >
                      <Pin class="w-3.5 h-3.5" />
                      <span>{node().isPinned ? t("groups.unpinGroup") : t("groups.pinGroup")}</span>
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/10 hover:text-accent text-text-primary transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        setRenamingGroupPath(node().fullName);
                        setContextMenu(null);
                      }}
                    >
                      <HelpCircle class="w-3.5 h-3.5" />
                      <span>{t("groups.renameGroup")}</span>
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/15 hover:text-red-400 text-red-500 transition-all flex items-center gap-2 cursor-pointer"
                      onClick={() => {
                        setDeletingGroupName(node().fullName);
                        setContextMenu(null);
                      }}
                    >
                      <X class="w-3.5 h-3.5" />
                      <span>{t("groups.deleteGroup")}</span>
                    </button>
                  </>
                )}
              </Show>
            </div>
          );
        }}
      </Show>

      {/* Delete Group Modal Overlay */}
      <Show when={deletingGroupName()}>
        {(groupName) => (
          <div class="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-surface border border-border rounded-xl p-4 shadow-2xl space-y-4 max-w-xs text-center animate-in fade-in zoom-in-95 duration-150">
              <div class="text-sm font-semibold text-text-primary">
                {t("groups.deleteGroup")}
              </div>
              <p class="text-xs text-text-secondary leading-normal">
                {t("groups.deleteGroupConfirm", { name: groupName() })}
              </p>
              <div class="flex gap-2 justify-center">
                <button
                  onClick={() => setDeletingGroupName(null)}
                  class="px-4 py-1.5 border border-border hover:bg-surface-light text-text-secondary text-xs rounded-lg cursor-pointer transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={async () => {
                    await props.onDeleteGroup(groupName());
                    setDeletingGroupName(null);
                  }}
                  class="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg font-semibold cursor-pointer transition-all"
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </aside>
  );
};

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: (session: Session) => void;
  snippet: string;
  sessionTimesText: string;
  score?: number;
  getSourceStyle: (sourceId: string) => string;
  getSourceLabel: (sourceId: string) => string;
  groups: ConversationGroup[];
  onContextMenu: (e: MouseEvent, session: Session) => void;
}

const SessionCard = (props: SessionCardProps) => {
  const { t } = useI18n();
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
  
  const sessionGroups = () => props.groups.filter(g => g.sessionIds?.includes(props.session.id));

  const getStatusBadge = () => {
    const status = props.session.status;
    if (!status) return null;
    
    switch (status) {
      case "awaiting_review":
        return {
          label: t("sidebar.statusAwaitingReview"),
          class: "bg-amber-500/10 border-amber-500/30 text-amber-500",
          icon: () => <HelpCircle class="w-3 h-3 flex-shrink-0" />
        };
      case "executing":
        return {
          label: t("sidebar.statusExecuting"),
          class: "bg-purple-500/10 border-purple-500/30 text-purple-500",
          icon: () => <Loader2 class="w-3 h-3 flex-shrink-0 animate-spin" />
        };
      case "completed":
        return {
          label: t("sidebar.statusCompleted"),
          class: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
          icon: () => <CheckCircle2 class="w-3 h-3 flex-shrink-0" />
        };
      case "discussion":
      default:
        return {
          label: t("sidebar.statusDiscussion"),
          class: "bg-blue-500/10 border-blue-500/20 text-blue-500",
          icon: () => <MessageSquare class="w-3 h-3 flex-shrink-0" />
        };
    }
  };

  return (
    <div
      onClick={() => props.onSelect(props.session)}
      onContextMenu={(e) => props.onContextMenu(e, props.session)}
      draggable={true}
      on:dragstart={(e) => {
        (window as any).activeDraggedSessionId = props.session.id;
        console.log("[DND] JSX dragstart on session:", props.session.id);
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", props.session.id);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      style={{
        "-webkit-user-drag": "element",
        "user-drag": "element"
      } as any}
      class={`p-4 flex flex-col gap-2.5 cursor-grab active:cursor-grabbing select-none transition-all border rounded-xl ${
        props.isSelected 
          ? "bg-accent-light/15 border-accent shadow-sm shadow-accent/15" 
          : "bg-surface/50 border-border hover:bg-surface/80 hover:border-border/80"
      }`}
    >
      {/* Title & Badge */}
      <div class="flex items-start justify-between gap-2">
        <span class={`text-[13.5px] font-semibold leading-snug break-all line-clamp-2 ${
          props.isSelected ? "text-accent" : "text-text-primary/95"
        }`}>
          {title()}
        </span>
        <div class="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          <span class="text-[10px] text-text-secondary/50 font-normal mr-1">{props.sessionTimesText}</span>
          <Show when={props.isLoading}>
            <Loader2 class="w-3.5 h-3.5 text-accent animate-spin" />
          </Show>
          <Show when={props.session.isPinned}>
            <Pin class="w-3.5 h-3.5 text-accent animate-pulse" />
          </Show>
          <Show when={props.session.isArchived}>
            <Archive class="w-3.5 h-3.5 text-text-secondary" />
          </Show>
        </div>
      </div>

      {/* Models & Speed */}
      <Show when={models().length > 0}>
        <div class="flex items-center justify-between gap-2 text-[10.5px]">
          <span class="text-accent/80 font-medium truncate max-w-[200px]" title={models().join(", ")}>
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
            {group => (
              <span class="px-1.5 py-0.5 bg-accent-light/10 border border-accent/20 text-accent rounded text-[9px] uppercase font-bold">
                {group.name}
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Footer Metadata */}
      <div class="flex items-center justify-between text-[10.5px] mt-0.5 text-text-secondary/60 gap-2">
        {/* Left Side: Source & CWD */}
        <div class="flex items-center gap-1.5 min-w-0">
          <span class={`px-1.5 py-0.5 border rounded text-[9.5px] uppercase font-bold flex-shrink-0 ${props.getSourceStyle(props.session.sourceId)}`}>
            {props.getSourceLabel(props.session.sourceId)}
          </span>
          <Show when={getStatusBadge()}>
            <div class={`flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[9px] font-bold ${getStatusBadge()?.class}`}>
              {getStatusBadge()?.icon()}
              <span>{getStatusBadge()?.label}</span>
            </div>
          </Show>
        </div>
        
        {/* Right Side: Stats */}
        <div class="flex items-center gap-2 flex-shrink-0 text-text-secondary/50">
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

interface GroupTreeItemProps {
  node: GroupTreeNode;
  depth: number;
  activeGroupFilter: string | null;
  onSelect: (filter: string | null) => void;
  onContextMenu: (e: MouseEvent, node: GroupTreeNode) => void;
  renamingGroupPath: string | null;
  setRenamingGroupPath: (path: string | null) => void;
  onRenameGroup: (oldName: string, newName: string) => Promise<boolean>;
  onAssignSessionToGroup: (sessionId: string, groupName: string) => Promise<void>;
}

export const GroupTreeItem = (props: GroupTreeItemProps) => {
  const [isExpanded, setIsExpanded] = createSignal(true);
  const [tempName, setTempName] = createSignal(props.node.segment);
  const [isDragOver, setIsDragOver] = createSignal(false);
  const isSelected = () => props.activeGroupFilter !== null && props.activeGroupFilter.toLowerCase() === props.node.fullName.toLowerCase();
  
  return (
    <div class="w-full flex flex-col">
      <Show
        when={props.renamingGroupPath === props.node.fullName}
        fallback={
          <div
            class={`w-full flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer transition-all border ${
              isDragOver()
                ? "bg-accent border-accent text-white font-bold shadow-md scale-[1.02]"
                : isSelected()
                ? "bg-accent/15 border-accent/30 text-accent font-semibold shadow-sm"
                : "border-transparent text-text-secondary hover:bg-surface/60 hover:text-text-primary"
            }`}
            data-group-name={props.node.fullName}
            style={{
              "padding-left": `${props.depth * 12 + 8}px`
            }}
            onClick={() => {
              if (isSelected()) {
                props.onSelect(null);
              } else {
                props.onSelect(props.node.fullName);
              }
            }}
            onContextMenu={(e) => props.onContextMenu(e, props.node)}
            on:dragover={(e) => {
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
              }
            }}
            on:dragenter={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            on:dragleave={() => {
              setIsDragOver(false);
            }}
            on:drop={async (e) => {
              e.preventDefault();
              setIsDragOver(false);
              const sessionId = (window as any).activeDraggedSessionId || (e.dataTransfer ? e.dataTransfer.getData("text/plain") : null);
              console.log("[DND JSX] drop event triggered. Session ID:", sessionId, "Target Group:", props.node.fullName);
              if (sessionId) {
                try {
                  await props.onAssignSessionToGroup(sessionId, props.node.fullName);
                  console.log("[DND JSX] onAssignSessionToGroup completed successfully!");
                } catch (err) {
                  console.error("[DND JSX] Failed to assign session:", err);
                }
              }
              (window as any).activeDraggedSessionId = null;
            }}
          >
            <div class="flex items-center gap-1.5 min-w-0 pointer-events-none">
              <Show
                when={props.node.children.length > 0}
                fallback={<div class="w-4 h-4" />}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded());
                  }}
                  class={`p-0.5 rounded cursor-pointer transition-colors pointer-events-auto ${
                    isDragOver() ? "text-white/80 hover:text-white" : "hover:text-text-primary text-text-secondary/60"
                  }`}
                >
                  <Show when={isExpanded()} fallback={<ChevronRight class="w-3.5 h-3.5" />}>
                    <ChevronDown class="w-3.5 h-3.5" />
                  </Show>
                </button>
              </Show>
              <Folder class={`w-4 h-4 flex-shrink-0 transition-colors ${
                isDragOver() ? "text-white" : isSelected() ? "text-accent" : "text-text-secondary/70"
              }`} />
              <span class={`text-xs truncate ${isDragOver() ? "text-white" : ""}`}>{props.node.segment}</span>
            </div>
            
            <div class="flex items-center gap-1.5 flex-shrink-0 pointer-events-none">
              <Show when={props.node.isPinned}>
                <Pin class={`w-3 h-3 animate-pulse ${isDragOver() ? "text-white" : "text-accent"}`} />
              </Show>
              <Show when={!props.node.isPinned && props.node.containsPinnedSessions}>
                <div class={`w-1.5 h-1.5 rounded-full ${isDragOver() ? "bg-white" : "bg-accent"}`} />
              </Show>
              <span class={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-all ${
                isDragOver()
                  ? "bg-white/20 border-white/30 text-white"
                  : "bg-surface-light border-border/40 text-accent"
              }`}>
                {props.node.recursiveSessionCount}
              </span>
            </div>
          </div>
        }
      >
        <div 
          class="flex items-center gap-1.5 w-full px-2 py-1 bg-surface border border-border rounded-lg"
          style={{
            "margin-left": `${props.depth * 12 + 8}px`,
            "width": `calc(100% - ${props.depth * 12 + 8}px)`
          }}
        >
          <Folder class="w-4 h-4 text-accent flex-shrink-0" />
          <input
            type="text"
            value={tempName()}
            onInput={(e) => setTempName(e.currentTarget.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                const trimmed = tempName().trim().replace(/\\/g, "/");
                if (trimmed && trimmed !== props.node.segment) {
                  const parts = props.node.fullName.split("/");
                  parts[parts.length - 1] = trimmed;
                  const newFullName = parts.join("/");
                  await props.onRenameGroup(props.node.fullName, newFullName);
                }
                props.setRenamingGroupPath(null);
              } else if (e.key === "Escape") {
                props.setRenamingGroupPath(null);
                setTempName(props.node.segment);
              }
            }}
            class="flex-grow bg-transparent border-none text-xs text-text-primary outline-none"
            autofocus
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            disabled={!tempName().trim() || tempName().trim() === props.node.segment}
            onClick={async () => {
              const trimmed = tempName().trim().replace(/\\/g, "/");
              if (trimmed && trimmed !== props.node.segment) {
                const parts = props.node.fullName.split("/");
                parts[parts.length - 1] = trimmed;
                const newFullName = parts.join("/");
                await props.onRenameGroup(props.node.fullName, newFullName);
              }
              props.setRenamingGroupPath(null);
            }}
            class={`p-0.5 flex-shrink-0 transition-all ${
              tempName().trim() && tempName().trim() !== props.node.segment
                ? "text-accent hover:text-accent-light cursor-pointer"
                : "text-text-secondary/30 cursor-not-allowed opacity-50"
            }`}
          >
            <CheckCircle2 class="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              props.setRenamingGroupPath(null);
              setTempName(props.node.segment);
            }}
            class="text-text-secondary hover:text-text-primary p-0.5 cursor-pointer flex-shrink-0"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </Show>
      
      <Show when={props.node.children.length > 0 && isExpanded()}>
        <div class="flex flex-col">
          <For each={props.node.children}>
            {child => (
              <GroupTreeItem
                node={child}
                depth={props.depth + 1}
                activeGroupFilter={props.activeGroupFilter}
                onSelect={props.onSelect}
                onContextMenu={props.onContextMenu}
                renamingGroupPath={props.renamingGroupPath}
                setRenamingGroupPath={props.setRenamingGroupPath}
                onRenameGroup={props.onRenameGroup}
                onAssignSessionToGroup={props.onAssignSessionToGroup}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

