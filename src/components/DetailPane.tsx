import { createSignal, createEffect, on, untrack, onMount, onCleanup, For, Show } from "solid-js";
import { useI18n } from "../i18n/i18n";
import { useSpeech } from "../utils/useSpeech";
import { useContextMenuPosition } from "../utils/contextMenu";
import { Session, SourceMetadata } from "../types";
import { formatDateWithSetting, formatTimeWithSetting } from "../utils/format";

// Sub-component and Hook imports
import { DetailHeader } from "./detail/header/DetailHeader";
import { VirtualTurn } from "./detail/turn/VirtualTurn";
import { DetailSearchOverlay } from "./detail/overlays/DetailSearchOverlay";
import { DateTimelineOverlay, DateMilestone } from "./detail/overlays/DateTimelineOverlay";
import { DetailContextMenu, ContextMenuState } from "./detail/overlays/DetailContextMenu";
import { LightboxOverlay, LightboxImage } from "./detail/overlays/LightboxOverlay";
import { getSourceDisplayName } from "../utils/sourceLabels";
import { SessionMetadataPanel } from "./detail/meta/SessionMetadataPanel";
import { SessionSummaryCard } from "./detail/meta/SessionSummaryCard";
import { DetailSkeleton } from "./detail/meta/DetailSkeleton";
import { DetailPaneEmptyState } from "./detail/meta/DetailPaneEmptyState";

import { useDetailSearch } from "./detail/hooks/useDetailSearch";
import { useDateMilestones } from "./detail/hooks/useDateMilestones";
import { useDetailScroll } from "./detail/hooks/useDetailScroll";

// Deeplink jump timings: first re-center mid smooth-scroll, second once it has settled
const DEEPLINK_RECENTER_MS = 250;
const DEEPLINK_SETTLE_MS = 500;
// Total run of the .deeplink-flash animation in App.css (0.42s x 3 iterations)
const DEEPLINK_FLASH_MS = 1260;

export interface DetailPaneProps {
  session: Session | null;
  sources: SourceMetadata[];
  onCopyPath: (path: string) => void;
  loadTime: string | null;
  isLoading: boolean;
  activeDeeplink?: {
    sessionId: string;
    turnIndex: number;
    clickedText?: string;
    speaker?: "user" | "assistant";
  } | null;
  onClearDeeplink?: () => void;
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
  const { locale } = useI18n();
  const speech = useSpeech();
  const [isJumping, setIsJumping] = createSignal(false);
  const [activeLightboxImage, setActiveLightboxImage] = createSignal<LightboxImage | null>(null);

  let detailSearchInputRef: HTMLInputElement | undefined;

  // Domain state hooks
  const searchHook = useDetailSearch(
    () => props.session,
    () => props.searchQuery,
    () => props.matchCase,
    () => props.wholeWord,
    () => props.useRegex
  );

  const scrollHook = useDetailScroll(() => props.session, isJumping);

  const milestoneHook = useDateMilestones(
    () => props.session,
    scrollHook.activeTurnIdx,
    () => props.dateFormat,
    () => props.timeFormat,
    () => props.showSeconds,
    locale
  );

  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);
  const menuPosition = useContextMenuPosition(contextMenu);

  // Lightbox window event handler
  createEffect(() => {
    const handleOpenLightbox = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { src, path } = customEvent.detail;
      if (src) {
        setActiveLightboxImage({ src, path });
      }
    };
    window.addEventListener("open-image-lightbox", handleOpenLightbox);
    onCleanup(() => {
      window.removeEventListener("open-image-lightbox", handleOpenLightbox);
    });
  });

  const handleContextMenu = (
    e: MouseEvent,
    type: "user" | "assistant" | "tool",
    text: string,
    sessionId?: string,
    turnIndex?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("close-all-menus"));
    const selected = window.getSelection()?.toString() || "";

    const targetEl = (e.target as HTMLElement).closest(
      "p, li, blockquote, h1, h2, h3, h4, h5, h6"
    ) as HTMLElement | null;
    const clickedText = targetEl ? targetEl.textContent || "" : "";

    const target = e.target as HTMLElement;
    const mermaidWrapper = target.closest(".mermaid-diagram-wrapper") as HTMLElement | null;
    const mermaidContainer = mermaidWrapper?.querySelector(
      ".mermaid-diagram-container"
    ) as HTMLElement | null;

    const isMermaidError = !!(
      mermaidContainer?.querySelector(".mermaid-error-container") ||
      target.closest(".mermaid-error-container")
    );
    const showMermaidMenu = mermaidWrapper && mermaidContainer && !isMermaidError;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text: selected ? selected : text,
      type,
      extra: selected ? "selected-text" : undefined,
      sessionId,
      turnIndex,
      clickedText,
      mermaidWrapper: showMermaidMenu ? mermaidWrapper : undefined,
      mermaidContainer: showMermaidMenu ? mermaidContainer : undefined,
    });
  };

  const handleImageContextMenu = (e: MouseEvent, path?: string, src?: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("close-all-menus"));
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

  const handleCloseAllMenus = () => {
    closeContextMenu();
  };

  let handleTriggerSearch: () => void;
  let handleKeyDown: (e: KeyboardEvent) => void;

  onMount(() => {
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("close-context-menus", closeContextMenu);
    window.addEventListener("close-all-menus", handleCloseAllMenus);

    handleTriggerSearch = () => {
      searchHook.setShowDetailSearch(true);
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
          activeTag === "select" ||
          document.activeElement?.getAttribute("contenteditable") === "true";

        if (!isTyping) {
          e.preventDefault();
          const scrollContainer = document.getElementById("detail-pane-scroll-container");
          if (scrollContainer) {
            if (e.key === "Home") scrollContainer.scrollTop = 0;
            else if (e.key === "End") scrollContainer.scrollTop = scrollContainer.scrollHeight;
            else if (e.key === "PageUp")
              scrollContainer.scrollTop -= scrollContainer.clientHeight * 0.9;
            else if (e.key === "PageDown")
              scrollContainer.scrollTop += scrollContainer.clientHeight * 0.9;
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener("click", closeContextMenu);
    window.removeEventListener("close-context-menus", closeContextMenu);
    window.removeEventListener("close-all-menus", handleCloseAllMenus);
    if (handleTriggerSearch) {
      window.removeEventListener("trigger-detail-search", handleTriggerSearch);
    }
    if (handleKeyDown) {
      window.removeEventListener("keydown", handleKeyDown);
    }
    scrollHook.cleanupScrollObserver();
  });

  // Default resting position for a freshly opened session: pinned to the newest turn
  const lockToBottom = () => {
    scrollHook.setScrollLock(true);
    scrollHook.resetMountedState();
    scrollHook.scrollToBottom();
  };

  // Centers an element inside the scroll container. Uses rect deltas rather than offsetTop
  // because the message bubbles are positioned, so offsetTop is bubble- not container-relative.
  const centerInScrollContainer = (el: Element) => {
    const container = scrollHook.getScrollContainerRef();
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    container.scrollTop +=
      elRect.top - containerRect.top - (container.clientHeight - elRect.height) / 2;
  };

  const normalizeForMatch = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  // Finds the paragraph-level block inside a turn that holds the spoken sentence, preferring
  // the bubble belonging to the speaker the sentence came from.
  const findDeeplinkTarget = (
    turnEl: HTMLElement,
    clickedText?: string,
    speaker?: "user" | "assistant"
  ): Element => {
    const bubble = speaker ? turnEl.querySelector(`[data-speaker="${speaker}"]`) : null;
    const scope = bubble || turnEl;

    if (clickedText) {
      const cleanClicked = normalizeForMatch(clickedText);
      if (cleanClicked) {
        const blocks = Array.from(
          scope.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6")
        );
        const matchingEl = blocks.find((block) => {
          const cleanBlockText = normalizeForMatch(block.textContent || "");
          return (
            cleanBlockText.length > 0 &&
            (cleanBlockText.includes(cleanClicked) || cleanClicked.includes(cleanBlockText))
          );
        });
        if (matchingEl) return matchingEl;
      }
    }

    return bubble || turnEl;
  };

  // Flashes the arrived-at block amber a few times. Kept in sync with the
  // .deeplink-flash animation in App.css (0.42s x 3).
  const flashDeeplinkTarget = (el: Element) => {
    el.classList.remove("deeplink-flash");
    // Force a reflow so re-syncing to the same block restarts the animation
    void (el as HTMLElement).offsetWidth;
    el.classList.add("deeplink-flash");
    setTimeout(() => el.classList.remove("deeplink-flash"), DEEPLINK_FLASH_MS);
  };

  // Reset pagination, search state, and scroll to bottom when session changes or reloads.
  // Deliberately keyed on the session alone: reading props.activeDeeplink reactively here
  // would re-run this (and re-pin to the bottom) the moment a deeplink jump clears itself.
  createEffect(
    on(
      () => props.session,
      (session) => {
        if (!session) return;

        scrollHook.setScrollPercent(0);
        scrollHook.setActiveTurnIdx(0);
        searchHook.setShowDetailSearch(false);
        searchHook.setDetailSearchQuery("");
        searchHook.setActiveMatchIndex(0);

        // Only lock scroll to bottom on session change if there is no active deeplink scroll
        if (!untrack(() => props.activeDeeplink)) {
          lockToBottom();
        }
      }
    )
  );

  // Reactively execute pending deeplinks once target session has loaded
  createEffect(() => {
    const deeplink = props.activeDeeplink;
    if (!deeplink) return;

    const session = props.session;
    if (!session || session.id !== deeplink.sessionId) return;

    const turn = session.turns[deeplink.turnIndex];
    if (!turn) {
      // Nothing to jump to: clear so a stale deeplink cannot suppress bottom-locking later,
      // and fall back to the normal session-open position.
      props.onClearDeeplink?.();
      lockToBottom();
      return;
    }

    const turnKey = turn.turnId || String(deeplink.turnIndex);
    // Release the bottom lock and suppress scroll-lock reacquisition while the jump settles
    scrollHook.setScrollLock(false);
    setIsJumping(true);

    const findTurnEl = () =>
      (document.getElementById(turnKey) ||
        document.querySelector(`[data-turn-index="${deeplink.turnIndex}"]`)) as HTMLElement | null;

    const jump = (turnEl: HTMLElement) => {
      const target = findDeeplinkTarget(turnEl, deeplink.clickedText, deeplink.speaker);

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      // Re-center after late layout shifts (images, lazily rendered markdown)
      setTimeout(() => centerInScrollContainer(target), DEEPLINK_RECENTER_MS);
      setTimeout(() => {
        // Final correction has landed, so the block is now parked where the user can see it flash
        centerInScrollContainer(target);
        flashDeeplinkTarget(target);
      }, DEEPLINK_SETTLE_MS);
      setTimeout(() => setIsJumping(false), DEEPLINK_SETTLE_MS + 300);

      props.onClearDeeplink?.();
    };

    setTimeout(() => {
      const turnEl = findTurnEl();
      if (turnEl) {
        jump(turnEl);
        return;
      }
      // Turn markup not committed yet: retry once, then give up and clear the deeplink
      setTimeout(() => {
        const retryEl = findTurnEl();
        if (retryEl) {
          jump(retryEl);
        } else {
          setIsJumping(false);
          props.onClearDeeplink?.();
          lockToBottom();
        }
      }, 400);
    }, 150);
  });

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

  const handleMilestoneClick = (milestone: DateMilestone) => {
    const el = document.getElementById(milestone.turnId);
    if (el) {
      setIsJumping(true);
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        const container = scrollHook.getScrollContainerRef();
        setTimeout(() => {
          if (container) container.scrollTop = el.offsetTop;
        }, 250);
        setTimeout(() => {
          if (container) container.scrollTop = el.offsetTop;
        }, 500);
        setTimeout(() => {
          setIsJumping(false);
        }, 800);
      }, 150);
    }
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
      <Show when={!props.isLoading} fallback={<DetailSkeleton />}>
        <Show when={props.session} fallback={<DetailPaneEmptyState />}>
          {/* Top Header / Action Bar */}
          <DetailHeader
            session={props.session!}
            onCopyPath={props.onCopyPath}
            groups={props.groups}
            pinnedSessionIds={props.pinnedSessionIds}
            onTogglePinSession={props.onTogglePinSession}
            onAssignSessionToGroup={props.onAssignSessionToGroup}
            onRemoveSessionFromGroup={props.onRemoveSessionFromGroup}
          />

          {/* Floating Search Bar */}
          <DetailSearchOverlay
            showDetailSearch={searchHook.showDetailSearch()}
            detailSearchQuery={searchHook.detailSearchQuery()}
            setDetailSearchQuery={searchHook.setDetailSearchQuery}
            detailMatchCase={searchHook.detailMatchCase()}
            setDetailMatchCase={searchHook.setDetailMatchCase}
            detailWholeWord={searchHook.detailWholeWord()}
            setDetailWholeWord={searchHook.setDetailWholeWord}
            detailUseRegex={searchHook.detailUseRegex()}
            setDetailUseRegex={searchHook.setDetailUseRegex}
            activeMatchIndex={searchHook.activeMatchIndex()}
            setActiveMatchIndex={searchHook.setActiveMatchIndex}
            matchesCount={searchHook.searchMatches().length}
            navigateToMatch={(index) =>
              searchHook.navigateToMatch(index, scrollHook.getScrollContainerRef(), setIsJumping)
            }
            onClose={() => searchHook.setShowDetailSearch(false)}
            searchInputRef={(el) => (detailSearchInputRef = el)}
          />

          {/* Main Conversation Turns Scrollable Area */}
          <div
            id="detail-pane-scroll-container"
            tabindex="-1"
            ref={scrollHook.setScrollContainerRef}
            class="flex-grow overflow-y-auto pl-8 pr-36 py-6 space-y-6 outline-none relative"
            onScroll={scrollHook.handleScroll}
          >
            <div ref={scrollHook.handleScrollInnerMount} class="space-y-6 flex flex-col">
              {/* Session Metadata Panel */}
              <SessionMetadataPanel
                session={props.session!}
                sourceLabel={getSourceDisplayName(props.sources, props.session!.sourceId)}
                loadTime={props.loadTime}
                formatFullDate={formatFullDate}
              />

              {/* AI Summary Card */}
              <SessionSummaryCard summary={props.session!.summary} />

              {/* Render Virtualized Conversation Bubbles */}
              <For each={props.session!.turns}>
                {(turn, index) => (
                  <VirtualTurn
                    turn={turn}
                    actualIndex={index()}
                    formatFullDate={formatFullDate}
                    sourceId={props.session!.sourceId}
                    sessionId={props.session!.id}
                    filePath={props.session!.filePath}
                    searchQuery={searchHook.activeSearchQuery()}
                    matchCase={searchHook.activeMatchCase()}
                    wholeWord={searchHook.activeWholeWord()}
                    useRegex={searchHook.activeUseRegex()}
                    numberFormat={props.numberFormat}
                    onContextMenu={handleContextMenu}
                    onImageClick={setActiveLightboxImage}
                    onImageContextMenu={handleImageContextMenu}
                    isActiveSpeechTurn={
                      speech.isPlaying() &&
                      speech.activeSessionId() === props.session!.id &&
                      speech.activeTurnIndex() === index()
                    }
                    activeSpeechSpeaker={speech.activeSpeaker()}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Vertical Date Timeline Overlay */}
          <DateTimelineOverlay
            session={props.session}
            dateMilestones={milestoneHook.dateMilestones()}
            activeMilestone={milestoneHook.activeMilestone()}
            scrollPercent={scrollHook.scrollPercent()}
            onMilestoneClick={handleMilestoneClick}
          />

          {/* Context Menu Overlay */}
          <DetailContextMenu
            contextMenu={contextMenu()}
            setContextMenu={setContextMenu}
            menuPosition={menuPosition}
            session={props.session}
          />

          {/* Fullscreen Lightbox Overlay */}
          <LightboxOverlay
            activeLightboxImage={activeLightboxImage()}
            onClose={() => setActiveLightboxImage(null)}
            onImageContextMenu={handleImageContextMenu}
          />
        </Show>
      </Show>
    </div>
  );
};
