import { createSignal, Accessor } from "solid-js";
import { logFE } from "../../../utils/logger";
import { Session } from "../../../types";

export const useDetailScroll = (
  session: Accessor<Session | null>,
  isJumping: Accessor<boolean>
) => {
  const [scrollPercent, setScrollPercent] = createSignal(0);
  const [activeTurnIdx, setActiveTurnIdx] = createSignal(0);
  const [scrollLock, setScrollLock] = createSignal(true);

  let scrollContainerRef: HTMLDivElement | undefined;
  let scrollInnerRef: HTMLDivElement | undefined;
  let activeResizeObserver: ResizeObserver | undefined;
  let lastBottomScrollHeight = 0;
  let justMounted = true;

  const setScrollContainerRef = (el: HTMLDivElement | undefined) => {
    scrollContainerRef = el;
  };

  const getScrollContainerRef = () => scrollContainerRef;

  const handleScrollInnerMount = (el: HTMLDivElement | null) => {
    if (el) {
      scrollInnerRef = el;
      if (activeResizeObserver) {
        activeResizeObserver.disconnect();
      }
      const ro = new ResizeObserver(() => {
        if (scrollLock()) {
          scrollToBottom();
        }
      });
      ro.observe(el);
      activeResizeObserver = ro;
    } else {
      if (activeResizeObserver) {
        activeResizeObserver.disconnect();
        activeResizeObserver = undefined;
      }
      scrollInnerRef = undefined;
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef) {
      scrollContainerRef.scrollTop = scrollContainerRef.scrollHeight;
      lastBottomScrollHeight = scrollContainerRef.scrollHeight;
    }
  };

  const resetMountedState = () => {
    justMounted = true;
    lastBottomScrollHeight = 0;
  };

  const handleScroll = () => {
    const s = session();
    if (!scrollContainerRef || !s) return;

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
        lastBottomScrollHeight = scrollHeight;
        justMounted = false;
      } else if (!justMounted) {
        if (scrollHeight === lastBottomScrollHeight) {
          if (scrollLock()) {
            setScrollLock(false);
            logFE("info", `Scroll Lock: released (scrolled up)`);
          }
        }
      }
    }
    const total = s.turns.length - 1;
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
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const turnIdAttr = child.getAttribute("data-turn-id");
      if (turnIdAttr) {
        const offsetTop = child.offsetTop;
        const offsetHeight = child.offsetHeight;
        const idxAttr = child.getAttribute("data-turn-index");
        if (offsetTop + offsetHeight > scrollTop + 40) {
          if (idxAttr !== null) {
            foundIdx = parseInt(idxAttr, 10);
            break;
          }
        }
      }
    }
    setActiveTurnIdx(foundIdx);
  };

  const cleanupScrollObserver = () => {
    if (activeResizeObserver) {
      activeResizeObserver.disconnect();
      activeResizeObserver = undefined;
    }
  };

  return {
    scrollPercent,
    setScrollPercent,
    activeTurnIdx,
    setActiveTurnIdx,
    scrollLock,
    setScrollLock,
    setScrollContainerRef,
    getScrollContainerRef,
    handleScrollInnerMount,
    scrollToBottom,
    handleScroll,
    resetMountedState,
    cleanupScrollObserver,
  };
};
