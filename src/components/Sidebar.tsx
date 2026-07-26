import { createSignal, createMemo, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { useI18n } from "../i18n/i18n";
import { getSourceDisplayName, getSourceStyle } from "../utils/sourceLabels";

import { formatDateWithSetting, formatTimeWithSetting } from "../utils/format";
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Layers,
  Activity,
  Archive,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-solid";
import { Session, SearchResult, SourceMetadata, ArchivalFilter } from "../types";
import { useContextMenuPosition } from "../utils/contextMenu";
import { useSpeech } from "../utils/useSpeech";
import { ActiveSpinner } from "../utils/sessionStatus";
import {
  GroupTask,
  ConversationGroup,
  GroupTreeNode,
  buildGroupTree,
} from "./sidebar/groups/groupTreeUtils";
import { GroupTreeItem } from "./sidebar/groups/GroupTreeItem";
import { DeleteGroupModal } from "./sidebar/groups/DeleteGroupModal";
import { SessionCard } from "./sidebar/list/SessionCard";
import { SidebarSearchControls } from "./sidebar/search/SidebarSearchControls";
import { SidebarFilterBar } from "./sidebar/filters/SidebarFilterBar";
import { SidebarContextMenu } from "./sidebar/overlays/SidebarContextMenu";
import { useSearchHistory } from "./sidebar/hooks/useSearchHistory";
import { getSessionComputeTimeMs, getSessionTokensCount } from "../utils/sessionMetrics";

export {
  getSessionComputeTimeMs,
  getSessionTokensCount,
  formatSpeed,
  formatDuration,
  getSessionModels,
} from "../utils/sessionMetrics";

export type { GroupTask, ConversationGroup, GroupTreeNode };
export { buildGroupTree, GroupTreeItem, SessionCard };

interface ListItem {
  session: Session;
  matchedTurns?: number[];
  score?: number;
}

export interface SidebarProps {
  sessions: Session[];
  searchResults: SearchResult[] | null;
  isSearchLoading?: boolean;
  selectedSessionId: string | null;
  loadingSessionId: string | null;
  onSelectSession: (session: Session) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchCase: boolean;
  onMatchCaseToggle: () => void;
  wholeWord: boolean;
  onWholeWordToggle: () => void;
  useRegex: boolean;
  onRegexToggle: () => void;
  multiline: boolean;
  onMultilineToggle: () => void;
  selectedSources: Set<string>;
  onToggleSource: (sourceId: string) => void;
  archivalFilter: ArchivalFilter;
  onArchivalFilterChange: (filter: ArchivalFilter) => void;
  pruneDeleted: boolean;
  sources: SourceMetadata[];
  indexingProgress: {
    step: string;
    progress: number;
    currentSource: string;
  } | null;
  width: number;
  fontSize?: number;
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

export const Sidebar = (props: SidebarProps) => {
  const { t, locale } = useI18n();
  const speech = useSpeech();
  const [showFilters, setShowFilters] = createSignal(false);

  const historyHook = useSearchHistory(props.onSearchChange);

  // Resize Pointer Dragging
  const [isResizing, setIsResizing] = createSignal(false);
  let startX = 0;
  let startWidth = 0;

  const handlePointerDown = (e: PointerEvent) => {
    setIsResizing(true);
    startX = e.clientX;
    startWidth = props.width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!isResizing()) return;
      const delta = moveEv.clientX - startX;
      const newWidth = Math.max(220, Math.min(600, startWidth + delta));
      props.onWidthChange(newWidth);
    };

    const handlePointerUp = (upEv: PointerEvent) => {
      setIsResizing(false);
      try {
        (upEv.target as HTMLElement).releasePointerCapture(upEv.pointerId);
      } catch (err) {
        // ignore
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Group Height Calculation
  const groupsHeight = createMemo(() => {
    const totalGroups = props.groups.length + 1; // +1 for [No Group]
    return Math.min(220, Math.max(80, totalGroups * 28 + 12));
  });

  // Source Helpers
  const getSourceLabel = (sourceId: string): string =>
    getSourceDisplayName(props.sources, sourceId);

  // Sorting
  const [sortBy, setSortBy] = createSignal<string>("updated");
  const [sortAscending, setSortAscending] = createSignal<boolean>(false);

  const effectiveSortBy = createMemo(() => {
    if (props.searchResults === null && sortBy() === "relevance") {
      return "updated";
    }
    return sortBy();
  });

  createEffect((prevIsSearching?: boolean) => {
    const isSearching = props.searchResults !== null;
    if (prevIsSearching === false && isSearching) {
      if (sortBy() === "updated") {
        setSortBy("relevance");
      }
    } else if (prevIsSearching === true && !isSearching) {
      if (sortBy() === "relevance") {
        setSortBy("updated");
      }
    }
    return isSearching;
  });

  const availableDimensions = createMemo(() => {
    if (props.searchResults !== null) {
      return ["relevance", "updated", "tokens", "speed", "turns", "duration"];
    }
    return ["updated", "tokens", "speed", "turns", "duration"];
  });

  // Formatting Date / Relative Time
  const formatRelativeTime = (timestamp: number): string => {
    let ts = timestamp;
    if (ts < 20000000000) ts *= 1000;
    const now = Date.now();
    const diffMs = now - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("sidebar.justNow");
    if (diffMins < 60) return t("sidebar.minsAgo", { count: diffMins });
    if (diffHours < 24) return t("sidebar.hoursAgo", { count: diffHours });
    if (diffDays === 1) return t("sidebar.yesterday");
    if (diffDays < 7) return t("sidebar.daysAgo", { count: diffDays });

    const dateObj = new Date(ts);
    return formatDateWithSetting(dateObj, props.dateFormat || "system", locale());
  };

  const formatSessionTimes = (startTimestamp: number, updatedTimestamp: number): string => {
    let tStart = startTimestamp;
    let tEnd = updatedTimestamp;
    if (tStart < 20000000000) tStart *= 1000;
    if (tEnd < 20000000000) tEnd *= 1000;

    if (Math.abs(tEnd - tStart) < 5000) {
      return formatRelativeTime(updatedTimestamp);
    }

    const startObj = new Date(tStart);
    const endObj = new Date(tEnd);

    const startTimeStr = formatTimeWithSetting(
      startObj,
      props.timeFormat,
      props.showSeconds,
      locale()
    );
    const endTimeStr = formatTimeWithSetting(endObj, props.timeFormat, props.showSeconds, locale());

    const now = Date.now();
    const nowObj = new Date(now);

    const isSameDay =
      startObj.getDate() === endObj.getDate() &&
      startObj.getMonth() === endObj.getMonth() &&
      startObj.getFullYear() === endObj.getFullYear();

    if (isSameDay) {
      const isToday =
        startObj.getDate() === nowObj.getDate() &&
        startObj.getMonth() === nowObj.getMonth() &&
        startObj.getFullYear() === nowObj.getFullYear();

      if (isToday) {
        return `${startTimeStr} ➜ ${endTimeStr}`;
      }

      const yesterday = new Date(now - 86400000);
      const isYesterday =
        startObj.getDate() === yesterday.getDate() &&
        startObj.getMonth() === yesterday.getMonth() &&
        startObj.getFullYear() === yesterday.getFullYear();

      if (isYesterday) {
        return `${t("sidebar.yesterday")}, ${startTimeStr} ➜ ${endTimeStr}`;
      }

      const dateStr = formatDateWithSetting(startObj, props.dateFormat || "system", locale());
      return `${dateStr}, ${startTimeStr} ➜ ${endTimeStr}`;
    } else {
      return `${formatRelativeTime(startTimestamp)} ➜ ${formatRelativeTime(updatedTimestamp)}`;
    }
  };

  const getSessionSnippet = (session: Session, matchedTurns?: number[]) => {
    if (matchedTurns && matchedTurns.length > 0 && session.turns) {
      const idx = matchedTurns[0];
      const turn = session.turns[idx];
      if (turn) {
        return (
          turn.userMessage.substring(0, 100).replace(/\s+/g, " ") ||
          turn.assistantMessage.substring(0, 100).replace(/\s+/g, " ")
        );
      }
    }
    if (session.snippet) {
      return session.snippet;
    }
    if (session.turns && session.turns.length > 0) {
      const lastTurn = session.turns[session.turns.length - 1];
      if (lastTurn) {
        return (
          lastTurn.userMessage.substring(0, 100).replace(/\s+/g, " ") ||
          lastTurn.assistantMessage.substring(0, 100).replace(/\s+/g, " ")
        );
      }
    }
    return t("sidebar.noMessages");
  };

  const [showGroups, setShowGroups] = createSignal(false);
  const [isAddingGroup, setIsAddingGroup] = createSignal(false);
  const [renamingGroupPath, setRenamingGroupPath] = createSignal<string | null>(null);
  const [deletingGroupName, setDeletingGroupName] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    type: "session" | "group";
    targetSession?: Session;
    targetGroupNode?: GroupTreeNode;
  } | null>(null);

  const menuPosition = useContextMenuPosition(contextMenu);

  const handleContextMenu = (
    e: MouseEvent,
    type: "session" | "group",
    targetSession?: Session,
    targetGroupNode?: GroupTreeNode
  ) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("close-all-menus"));
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      targetSession,
      targetGroupNode,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("close-context-menus", closeContextMenu);
    window.addEventListener("close-all-menus", closeContextMenu);
  });
  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("close-context-menus", closeContextMenu);
    window.removeEventListener("close-all-menus", closeContextMenu);
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

  const matchingSessions = createMemo(() => {
    let sessions =
      props.searchResults !== null ? props.searchResults.map((r) => r.session) : props.sessions;

    if (props.selectedSources.size > 0) {
      sessions = sessions.filter((s) => props.selectedSources.has(s.sourceId));
    }
    return sessions;
  });

  const searchedAndGroupedSessions = createMemo(() => {
    let sessions =
      props.searchResults !== null ? props.searchResults.map((r) => r.session) : props.sessions;
    const ids = activeGroupSessionIds();
    if (ids) {
      if (props.activeGroupFilter === "_none_") {
        sessions = sessions.filter((s) => !ids.has(s.id));
      } else {
        sessions = sessions.filter((s) => ids.has(s.id));
      }
    }
    return sessions;
  });

  const unassignedSessions = createMemo(() => {
    return matchingSessions().filter(
      (s) => !props.groups.some((g) => g.sessionIds?.includes(s.id))
    );
  });

  const unassignedActiveCount = createMemo(() => {
    return unassignedSessions().filter((s) => !s.isArchived && !s.isDeleted).length;
  });

  const unassignedArchivedCount = createMemo(() => {
    return unassignedSessions().filter((s) => s.isArchived && !s.isDeleted).length;
  });

  const unassignedDeletedCount = createMemo(() => {
    return unassignedSessions().filter((s) => s.isDeleted).length;
  });

  const sourceCounts = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const src of props.sources) {
      counts[src.id] = 0;
    }
    for (const s of searchedAndGroupedSessions()) {
      if (props.archivalFilter === ArchivalFilter.Active && (s.isArchived || s.isDeleted)) continue;
      if (props.archivalFilter === ArchivalFilter.Archived && (!s.isArchived || s.isDeleted))
        continue;
      if (props.archivalFilter === ArchivalFilter.Deleted && !s.isDeleted) continue;
      if (counts[s.sourceId] !== undefined) {
        counts[s.sourceId]++;
      }
    }
    return counts;
  });

  const archivalCounts = createMemo(() => {
    let active = 0;
    let archived = 0;
    let deleted = 0;
    let readAloud = 0;
    for (const s of searchedAndGroupedSessions()) {
      if (props.selectedSources.size > 0 && !props.selectedSources.has(s.sourceId)) {
        continue;
      }
      if (speech.isReadAloudActive(s.id)) {
        readAloud++;
      }
      if (s.isDeleted) {
        deleted++;
      } else if (s.isArchived) {
        archived++;
      } else {
        active++;
      }
    }
    return {
      all: active + archived + deleted,
      active,
      archived,
      deleted,
      "read-aloud": readAloud,
    };
  });

  const itemCache = new Map<string, ListItem>();

  const stableItem = (session: Session, matchedTurns?: number[], score?: number): ListItem => {
    const cached = itemCache.get(session.id);
    if (
      cached &&
      cached.session === session &&
      cached.matchedTurns === matchedTurns &&
      cached.score === score
    ) {
      return cached;
    }
    const item: ListItem = { session, matchedTurns, score };
    itemCache.set(session.id, item);
    return item;
  };

  const listItems = createMemo(() => {
    let items: ListItem[] = [];

    if (props.searchResults !== null) {
      items = props.searchResults
        .filter((r) => {
          if (props.selectedSources.size > 0 && !props.selectedSources.has(r.session.sourceId)) {
            return false;
          }
          if (
            props.archivalFilter === ArchivalFilter.Active &&
            (r.session.isArchived || r.session.isDeleted)
          )
            return false;
          if (
            props.archivalFilter === ArchivalFilter.Archived &&
            (!r.session.isArchived || r.session.isDeleted)
          )
            return false;
          if (props.archivalFilter === ArchivalFilter.Deleted && !r.session.isDeleted) return false;
          if (
            props.archivalFilter === ArchivalFilter.ReadAloud &&
            !speech.isReadAloudActive(r.session.id)
          )
            return false;
          return true;
        })
        .map((r) => stableItem(r.session, r.matchedTurnIndexes, r.score));
    } else {
      items = props.sessions
        .filter((s) => {
          if (props.selectedSources.size > 0 && !props.selectedSources.has(s.sourceId)) {
            return false;
          }
          if (props.archivalFilter === ArchivalFilter.Active && (s.isArchived || s.isDeleted))
            return false;
          if (props.archivalFilter === ArchivalFilter.Archived && (!s.isArchived || s.isDeleted))
            return false;
          if (props.archivalFilter === ArchivalFilter.Deleted && !s.isDeleted) return false;
          if (props.archivalFilter === ArchivalFilter.ReadAloud && !speech.isReadAloudActive(s.id))
            return false;
          return true;
        })
        .map((s) => stableItem(s));
    }

    const ids = activeGroupSessionIds();
    if (ids) {
      if (props.activeGroupFilter === "_none_") {
        items = items.filter((item) => !ids.has(item.session.id));
      } else {
        items = items.filter((item) => ids.has(item.session.id));
      }
    }

    if (itemCache.size > items.length) {
      const live = new Set(items.map((i) => i.session.id));
      for (const id of itemCache.keys()) {
        if (!live.has(id)) itemCache.delete(id);
      }
    }

    const pinned = props.pinnedSessionIds;
    const currentEffectiveSort = effectiveSortBy();
    const isAscending = sortAscending();

    items.sort((a, b) => {
      const aPinned = pinned.has(a.session.id);
      const bPinned = pinned.has(b.session.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      let comparison = 0;

      if (currentEffectiveSort === "relevance") {
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        if (scoreA !== scoreB) {
          comparison = scoreA - scoreB;
        } else {
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

  // Virtualized session list: only the visible rows (plus a small overscan) are in the DOM,
  // so a corpus of thousands of sessions no longer builds thousands of cards. Rows are
  // variable height (title wraps to 2 lines, optional snippet), so heights are measured at
  // runtime (`measureElement`) rather than assumed. `estimateSize` is only the pre-measure
  // guess. Keyed by session id so a re-sort/filter reuses rows instead of remounting.
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | null>(null);
  const virtualizer = createVirtualizer({
    get count() {
      return listItems().length;
    },
    getScrollElement: () => scrollEl(),
    estimateSize: (index) => {
      const item = listItems()[index];
      if (!item) return 192;
      const snippetText = getSessionSnippet(item.session, item.matchedTurns);
      const titleText = item.session.threadName || "";
      const titleLines = Math.min(Math.max(1, Math.ceil(titleText.length / 35)), 2);
      let height = 150 + (titleLines - 1) * 20;
      if (snippetText && snippetText.trim().length > 0) {
        const charLen = snippetText.length;
        const snippetLines = Math.min(Math.max(1, Math.ceil(charLen / 40)), 2);
        height += 16 + snippetLines * 18;
      }
      return height;
    },
    overscan: 8,
    getItemKey: (index) => listItems()[index]?.session.id ?? index,
  });

  const clearSizeCache = () => {
    try {
      const v = virtualizer as any;
      if (v && v.itemSizeCache && typeof v.itemSizeCache.clear === "function") {
        v.itemSizeCache.clear();
      }
    } catch {
      // ignore
    }
  };

  createEffect(() => {
    // Track search query, search results, and list items
    listItems();
    props.searchQuery;
    props.searchResults;

    clearSizeCache();
    virtualizer.measure();
  });

  // Keyboard Navigation
  const [highlightedIndex, setHighlightedIndex] = createSignal<number>(-1);

  createEffect(() => {
    const curSelId = props.selectedSessionId;
    if (curSelId) {
      const items = listItems();
      const curIndex = items.findIndex((item) => item.session.id === curSelId);
      if (curIndex >= 0) {
        setHighlightedIndex(curIndex);
      }
    } else {
      setHighlightedIndex(-1);
    }
  });

  const scrollIndexIntoView = (index: number) => {
    const items = listItems();
    if (index >= 0 && index < items.length) {
      // The target row may be virtualized out of the DOM, so ask the virtualizer to bring
      // it into view (it scrolls the container and renders it) rather than looking it up.
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  };

  const handleSidebarKeyDown = (e: KeyboardEvent) => {
    const items = listItems();
    if (items.length === 0) return;

    const isMac = navigator.userAgent.includes("Mac");
    const hasAlt = e.altKey;
    const hasCtrl = e.ctrlKey;
    const hasShift = e.shiftKey;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const isDown = e.key === "ArrowDown";
      const hasMeta = e.metaKey;

      if (isMac && hasMeta) {
        e.preventDefault();
        const targetIndex = isDown ? items.length - 1 : 0;
        if (items.length > 0) {
          props.onSelectSession(items[targetIndex].session);
          setHighlightedIndex(targetIndex);
          scrollIndexIntoView(targetIndex);
        }
        return;
      }

      if (isMac && hasAlt) {
        e.preventDefault();
        const curSelId = props.selectedSessionId;
        const curIndex = items.findIndex((item) => item.session.id === curSelId);
        let targetIndex = curIndex;
        if (isDown) {
          targetIndex = Math.min(items.length - 1, curIndex + 8);
        } else {
          const startIdx = curIndex === -1 ? 0 : curIndex;
          targetIndex = Math.max(0, startIdx - 8);
        }
        if (targetIndex >= 0 && targetIndex < items.length) {
          props.onSelectSession(items[targetIndex].session);
          setHighlightedIndex(targetIndex);
          scrollIndexIntoView(targetIndex);
        }
        return;
      }

      let isSelectAction = false;
      let isHighlightAction = false;

      if (isMac) {
        if (hasCtrl && hasShift) {
          isHighlightAction = true;
        } else if (hasAlt || (!hasCtrl && !hasShift && !hasMeta)) {
          isSelectAction = true;
        }
      } else {
        if (hasCtrl) {
          isHighlightAction = true;
        } else if (hasAlt || (!hasCtrl && !hasShift && !hasMeta)) {
          isSelectAction = true;
        }
      }

      e.preventDefault();

      if (isSelectAction) {
        const curSelId = props.selectedSessionId;
        const curIndex = items.findIndex((item) => item.session.id === curSelId);
        let targetIndex = curIndex;
        if (isDown) {
          targetIndex = Math.min(items.length - 1, curIndex + 1);
        } else {
          const startIdx = curIndex === -1 ? 0 : curIndex;
          targetIndex = Math.max(0, startIdx - 1);
        }
        if (targetIndex >= 0 && targetIndex < items.length) {
          props.onSelectSession(items[targetIndex].session);
          setHighlightedIndex(targetIndex);
          scrollIndexIntoView(targetIndex);
        }
      } else if (isHighlightAction) {
        let targetIndex = highlightedIndex();
        if (isDown) {
          targetIndex = Math.min(items.length - 1, targetIndex + 1);
        } else {
          targetIndex = Math.max(0, targetIndex - 1);
        }
        setHighlightedIndex(targetIndex);
        scrollIndexIntoView(targetIndex);
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      if (items.length > 0) {
        props.onSelectSession(items[0].session);
        setHighlightedIndex(0);
        scrollIndexIntoView(0);
      }
    } else if (e.key === "End") {
      e.preventDefault();
      if (items.length > 0) {
        const lastIdx = items.length - 1;
        props.onSelectSession(items[lastIdx].session);
        setHighlightedIndex(lastIdx);
        scrollIndexIntoView(lastIdx);
      }
    } else if (e.key === "PageUp") {
      e.preventDefault();
      if (items.length > 0) {
        const curSelId = props.selectedSessionId;
        const curIndex = items.findIndex((item) => item.session.id === curSelId);
        const startIdx = curIndex === -1 ? 0 : curIndex;
        const prevIdx = Math.max(0, startIdx - 8);
        props.onSelectSession(items[prevIdx].session);
        setHighlightedIndex(prevIdx);
        scrollIndexIntoView(prevIdx);
      }
    } else if (e.key === "PageDown") {
      e.preventDefault();
      if (items.length > 0) {
        const curSelId = props.selectedSessionId;
        const curIndex = items.findIndex((item) => item.session.id === curSelId);
        const nextIdx = Math.min(items.length - 1, curIndex + 8);
        props.onSelectSession(items[nextIdx].session);
        setHighlightedIndex(nextIdx);
        scrollIndexIntoView(nextIdx);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      if (highlightedIndex() >= 0 && highlightedIndex() < items.length) {
        e.preventDefault();
        props.onSelectSession(items[highlightedIndex()].session);
      }
    }
  };

  onMount(() => {
    const handleHighlightNext = () => {
      const items = listItems();
      if (items.length === 0) return;
      const nextIndex = Math.min(items.length - 1, highlightedIndex() + 1);
      setHighlightedIndex(nextIndex);
      scrollIndexIntoView(nextIndex);
    };

    const handleHighlightPrev = () => {
      const items = listItems();
      if (items.length === 0) return;
      const prevIndex = Math.max(0, highlightedIndex() - 1);
      setHighlightedIndex(prevIndex);
      scrollIndexIntoView(prevIndex);
    };

    const handleSelectHighlighted = () => {
      const items = listItems();
      if (items.length === 0) return;
      if (highlightedIndex() >= 0 && highlightedIndex() < items.length) {
        props.onSelectSession(items[highlightedIndex()].session);
      }
    };

    window.addEventListener("menu-highlight-next", handleHighlightNext);
    window.addEventListener("menu-highlight-prev", handleHighlightPrev);
    window.addEventListener("menu-select-highlighted", handleSelectHighlighted);

    onCleanup(() => {
      window.removeEventListener("menu-highlight-next", handleHighlightNext);
      window.removeEventListener("menu-highlight-prev", handleHighlightPrev);
      window.removeEventListener("menu-select-highlighted", handleSelectHighlighted);
    });
  });

  const handleSidebarClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, textarea, button, select, a, [role='button']")) {
      const container = document.getElementById("sidebar-scroll-container");
      if (container) {
        container.focus();
      }
    }
  };

  return (
    <aside
      onClick={handleSidebarClick}
      class="border-r border-border h-full flex flex-col overflow-hidden bg-background select-none relative transition-all duration-200 focus-within:z-[51] group"
      style={{
        width: props.collapsed ? "0px" : `${props.width}px`,
        "min-width": props.collapsed ? "0px" : `${props.width}px`,
        "max-width": props.collapsed ? "0px" : `${props.width}px`,
        display: props.collapsed ? "none" : "flex",
        "padding-top": "0px",
      }}
    >
      {/* Focus Highlight Border Overlay */}
      <div class="pointer-events-none absolute inset-0 border-2 border-transparent group-focus-within:border-accent/35 z-[100] transition-all duration-200" />

      {/* Drag Handle */}
      <div
        onPointerDown={handlePointerDown}
        class="absolute right-0 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-50 select-none"
        style={{
          top: "0px",
          height: "100%",
          "touch-action": "none",
        }}
      />

      {/* Sticky Header Section */}
      <div class="p-4 space-y-3 flex-shrink-0">
        <SidebarSearchControls
          searchQuery={props.searchQuery}
          onSearchChange={props.onSearchChange}
          showFilters={showFilters()}
          setShowFilters={setShowFilters}
          selectedSources={props.selectedSources}
          historyHook={historyHook}
        />

        <SidebarFilterBar
          showFilters={showFilters()}
          sources={props.sources}
          selectedSources={props.selectedSources}
          onToggleSource={props.onToggleSource}
          sourceCounts={sourceCounts()}
          archivalFilter={props.archivalFilter}
          onArchivalFilterChange={props.onArchivalFilterChange}
          archivalCounts={archivalCounts()}
          pruneDeleted={props.pruneDeleted}
          width={props.width}
          fontSize={props.fontSize}
        />

        {/* Group Filters section */}
        <div class="flex flex-col border border-border/80 rounded-xl bg-surface/30 p-2.5 gap-2 flex-shrink-0">
          <div class="flex items-center justify-between">
            <button
              onClick={() => {
                const nextShow = !showGroups();
                setShowGroups(nextShow);
                if (!nextShow) {
                  setIsAddingGroup(false);
                }
              }}
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

          <Show when={showGroups()}>
            <div
              style={{
                height: `${groupsHeight()}px`,
                "max-height": `${groupsHeight()}px`,
              }}
              class="flex flex-col gap-1 mt-1 overflow-y-auto scrollbar"
            >
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
                  <Folder
                    class={`w-4 h-4 flex-shrink-0 ${props.activeGroupFilter === "_none_" ? "text-accent" : "text-text-secondary/70"}`}
                  />
                  <span class="text-xs">{t("groups.noGroup")}</span>
                </div>
                <div class="flex items-center gap-1.5 text-[0.625rem] font-bold">
                  <span
                    class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                      props.archivalFilter === "all"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary"
                    }`}
                    title={t("sidebar.filterAll")}
                  >
                    <Layers class="w-2.5 h-2.5" />
                    {unassignedSessions().length}
                  </span>

                  <span
                    class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                      props.archivalFilter === ArchivalFilter.Active
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                    }`}
                    title={t("sidebar.filterActive")}
                  >
                    <Activity class="w-2.5 h-2.5" />
                    {unassignedActiveCount()}
                  </span>

                  <span
                    class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                      props.archivalFilter === "archived"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                    }`}
                    title={t("sidebar.filterArchived")}
                  >
                    <Archive class="w-2.5 h-2.5" />
                    {unassignedArchivedCount()}
                  </span>

                  <span
                    class={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-all ${
                      props.archivalFilter === "deleted"
                        ? "bg-accent/10 border-accent/20 text-accent font-semibold"
                        : "bg-surface-light border-border/40 text-text-secondary/60"
                    }`}
                    title={t("sidebar.filterDeleted")}
                  >
                    <Trash2 class="w-2.5 h-2.5" />
                    {unassignedDeletedCount()}
                  </span>
                </div>
              </div>

              <For each={buildGroupTree(props.groups, props.pinnedSessionIds, matchingSessions())}>
                {(rootNode) => (
                  <GroupTreeItem
                    node={rootNode}
                    depth={0}
                    activeGroupFilter={props.activeGroupFilter}
                    archivalFilter={props.archivalFilter}
                    onSelect={props.onActiveGroupFilterChange}
                    onContextMenu={(e, node) => handleContextMenu(e, "group", undefined, node)}
                    renamingGroupPath={renamingGroupPath()}
                    setRenamingGroupPath={setRenamingGroupPath}
                    onRenameGroup={props.onRenameGroup}
                    onAssignSessionToGroup={props.onAssignSessionToGroup}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Sort By Header */}
      <div class="px-4 py-2 border-b border-border bg-surface/10 flex flex-col gap-1.5 flex-shrink-0">
        <span class="text-[0.625rem] font-semibold text-text-secondary/70 uppercase tracking-wider">
          {t("sidebar.sortBy")}
        </span>
        <div class="flex flex-wrap gap-1">
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
                  class={`px-2 py-0.5 border rounded-lg text-[0.65625rem] cursor-pointer transition-all flex items-center gap-0.5 ${
                    isSelected()
                      ? "bg-accent/15 border-accent text-accent font-semibold shadow-xs"
                      : "border-border/40 hover:bg-surface text-text-secondary/80 hover:text-text-primary"
                  }`}
                >
                  <span>
                    {
                      {
                        relevance: t("sidebar.sortRelevance"),
                        updated: t("sidebar.sortUpdated"),
                        tokens: t("sidebar.sortTokens"),
                        speed: t("sidebar.sortSpeed"),
                        turns: t("sidebar.sortTurns"),
                        duration: t("sidebar.sortDuration"),
                      }[dimension]
                    }
                  </span>
                  <Show when={isSelected()}>
                    <Show
                      when={sortAscending()}
                      fallback={<ArrowDown class="w-2.5 h-2.5 flex-shrink-0" />}
                    >
                      <ArrowUp class="w-2.5 h-2.5 flex-shrink-0" />
                    </Show>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Sessions List Area (virtualized). px-3 + pb-3 only: NO padding-top — the
          virtualizer anchors item offsets to the sizer's top, so a top pad would shift
          everything out of alignment. The top gap is recreated by each row's pt-2.5.

          The ref publishes the scroll element only AFTER it is attached to the live
          document. A bare `ref={setScrollEl}` fires while the node still belongs to
          Solid's inert <template> contents document, whose `defaultView` is null. The
          virtualizer reads `ownerDocument.defaultView` exactly once — on the first
          scrollElement identity change — to set its `targetWindow`; a null there makes
          `observeElementRect` return early, so no ResizeObserver is ever attached,
          `scrollRect` stays {0,0}, and the computed range is empty (zero rows render).
          Deferring to onMount makes that first identity change happen after the node is
          adopted into the real document and laid out. */}
      <div
        id="sidebar-scroll-container"
        ref={(el) => onMount(() => setScrollEl(el))}
        tabindex="-1"
        onKeyDown={handleSidebarKeyDown}
        class="flex-grow overflow-y-auto min-h-0 px-3 pb-3 outline-none"
      >
        <Show
          when={!props.isSearchLoading}
          fallback={
            <div class="flex flex-col items-center justify-center p-12 text-center text-text-secondary gap-3 my-auto">
              <ActiveSpinner class="w-6 h-6 text-accent" />
              <div class="text-sm font-medium text-text-primary/80">{t("sidebar.searching")}</div>
            </div>
          }
        >
          <Show
            when={listItems().length > 0}
            fallback={
              <div class="p-8 text-center text-text-secondary text-sm">
                {t("groups.noMatchingSessions")}
              </div>
            }
          >
            {/* Sizer: total scroll height; rows are absolutely positioned within it. */}
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              <For each={virtualizer.getVirtualItems()}>
                {(virtualRow) => {
                  const item = createMemo(() => listItems()[virtualRow.index]);
                  const session = createMemo(() => item()?.session);
                  const isSelected = createMemo(() => props.selectedSessionId === session()?.id);
                  const isHighlighted = createMemo(() => highlightedIndex() === virtualRow.index);
                  const snippet = createMemo(() =>
                    session() ? getSessionSnippet(session()!, item()?.matchedTurns) : ""
                  );
                  const sessionTimesText = createMemo(() => {
                    const s = session();
                    return s ? formatSessionTimes(s.timestamp, s.updatedAt) : "";
                  });

                  let rowEl: HTMLDivElement | undefined;

                  createEffect(() => {
                    // Track snippet & item changes so elements updated in-place by Solid's <For>
                    // re-measure after DOM updates flush.
                    snippet();
                    item();
                    if (rowEl && rowEl.isConnected) {
                      queueMicrotask(() => {
                        if (rowEl && rowEl.isConnected) {
                          virtualizer.measureElement(rowEl);
                        }
                      });
                    }
                  });

                  return (
                    <Show when={session()}>
                      <div
                        data-index={virtualRow.index}
                        // Measure only once the row is actually in the document. A manual
                        // measureElement() call (no ResizeObserver entry) falls through to
                        // `offsetHeight`, which is 0 for a detached node — and a row's FIRST
                        // measurement is not cache-guarded, so a 0 gets written to
                        // itemSizeCache and collapses every following row's offset, which
                        // shows up as cards overlapping. onMount guarantees post-insertion,
                        // and isConnected covers a row unmounted by fast scrolling before
                        // the effect flushes. Re-measures afterwards come from the
                        // virtualizer's own ResizeObserver, which guards isConnected itself.
                        ref={(el) => {
                          rowEl = el;
                          onMount(() => {
                            if (!el.isConnected) return;
                            requestAnimationFrame(() => {
                              if (el.isConnected) {
                                virtualizer.measureElement(el);
                              }
                            });
                          });
                        }}
                        // pt-2.5 recreates the old inter-card gap (measured into the row height).
                        class="pt-2.5"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <SessionCard
                          session={session()!}
                          isPinned={props.pinnedSessionIds.has(session()!.id)}
                          isReadAloudActive={speech.isReadAloudActive(session()!.id)}
                          isSelected={isSelected()}
                          isHighlighted={isHighlighted()}
                          isLoading={props.loadingSessionId === session()!.id}
                          onSelect={props.onSelectSession}
                          snippet={snippet()}
                          sessionTimesText={sessionTimesText()}
                          score={item()?.score}
                          getSourceStyle={getSourceStyle}
                          getSourceLabel={getSourceLabel}
                          groups={props.groups}
                          onContextMenu={(e, s) => handleContextMenu(e, "session", s)}
                          onTogglePin={props.onTogglePinSession}
                        />
                      </div>
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <SidebarContextMenu
        contextMenu={contextMenu()}
        menuPosition={menuPosition}
        onClose={closeContextMenu}
        pinnedSessionIds={props.pinnedSessionIds}
        onTogglePinSession={props.onTogglePinSession}
        groups={props.groups}
        onAddGroup={props.onAddGroup}
        onAssignSessionToGroup={props.onAssignSessionToGroup}
        onRemoveSessionFromGroup={props.onRemoveSessionFromGroup}
        onToggleGroupPin={props.onToggleGroupPin}
        setRenamingGroupPath={setRenamingGroupPath}
        setDeletingGroupName={setDeletingGroupName}
      />

      <DeleteGroupModal
        deletingGroupName={deletingGroupName()}
        onCancel={() => setDeletingGroupName(null)}
        onConfirm={props.onDeleteGroup}
      />
    </aside>
  );
};
