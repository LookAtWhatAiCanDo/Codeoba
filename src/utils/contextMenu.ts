import { createSignal, onCleanup, createEffect, Accessor } from "solid-js";

interface Coords {
  x: number;
  y: number;
}

export function useContextMenuPosition(contextAccessor: Accessor<Coords | null>) {
  const [pos, setPos] = createSignal({ top: 0, left: 0, visible: false });
  let observer: ResizeObserver | undefined;

  const ref = (el: HTMLDivElement | undefined) => {
    if (!el) {
      if (observer) {
        observer.disconnect();
        observer = undefined;
      }
      return;
    }

    const updatePosition = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width || 224;
      const h = rect.height || 50;
      const ctx = contextAccessor();
      if (!ctx) return;

      let top = ctx.y;
      if (ctx.y + h > window.innerHeight) {
        top = ctx.y - h;
      }
      if (top < 0) {
        top = 0;
      }

      let left = ctx.x;
      if (ctx.x + w > window.innerWidth) {
        left = ctx.x - w;
      }
      if (left < 0) {
        left = ctx.x;
      }
      if (left + w > window.innerWidth) {
        left = Math.max(0, window.innerWidth - w);
      }

      setPos({ top, left, visible: true });
    };

    requestAnimationFrame(updatePosition);

    if (observer) {
      observer.disconnect();
    }

    observer = new ResizeObserver(() => {
      updatePosition();
    });
    observer.observe(el);
  };

  createEffect(() => {
    if (!contextAccessor()) {
      setPos({ top: 0, left: 0, visible: false });
    }
  });

  onCleanup(() => {
    if (observer) {
      observer.disconnect();
      observer = undefined;
    }
  });

  return { ref, pos };
}
