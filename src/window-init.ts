import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { logFE } from "./utils/logger";

(async () => {
  const appWindow = getCurrentWindow();

  // Check if reset was requested via command-line arguments
  try {
    const resetRequested = await invoke<boolean>("check_reset_window");
    if (resetRequested) {
      localStorage.removeItem("codeoba-window-initialized");
      localStorage.removeItem("codeoba-sidebar-width");
      localStorage.removeItem("codeoba-sidebar-collapsed");
      localStorage.removeItem("codeoba-window-width");
      localStorage.removeItem("codeoba-window-height");
      localStorage.removeItem("codeoba-window-x");
      localStorage.removeItem("codeoba-window-y");
      logFE("info", "Reset window geometry and size requested via CLI option.");
    }
  } catch (err) {
    logFE("error", `Failed to check CLI reset window state: ${err}`);
  }

  // Check if window bounds are stored in localStorage
  const savedWidth = localStorage.getItem("codeoba-window-width");
  const savedHeight = localStorage.getItem("codeoba-window-height");
  const savedX = localStorage.getItem("codeoba-window-x");
  const savedY = localStorage.getItem("codeoba-window-y");

  if (savedWidth && savedHeight && savedX && savedY) {
    try {
      const width = parseFloat(savedWidth);
      const height = parseFloat(savedHeight);
      const x = parseFloat(savedX);
      const y = parseFloat(savedY);

      await appWindow.setSize(new LogicalSize(width, height));
      await appWindow.setPosition(new LogicalPosition(x, y));
      logFE(
        "info",
        `Restored window geometry from localStorage: ${width}x${height} at (${x}, ${y}).`
      );
    } catch (err) {
      logFE("error", `Failed to restore window size and position: ${err}`);
    }
  } else {
    // Check first launch window initialization
    const initialized = localStorage.getItem("codeoba-window-initialized");
    if (!initialized) {
      try {
        const width = Math.round(window.screen.width * 0.75);
        const height = Math.round(window.screen.height * 0.75);

        await appWindow.setSize(new LogicalSize(width, height));
        await appWindow.center();
        localStorage.setItem("codeoba-window-initialized", "true");
        logFE("info", `First launch window resize triggered: ${width}x${height} and centered.`);

        // Store initial geometry in localStorage
        const scaleFactor = await appWindow.scaleFactor();
        const pSize = await appWindow.innerSize();
        const lSize = pSize.toLogical(scaleFactor);
        const pPos = await appWindow.innerPosition();
        const lPos = pPos.toLogical(scaleFactor);

        localStorage.setItem("codeoba-window-width", String(lSize.width));
        localStorage.setItem("codeoba-window-height", String(lSize.height));
        localStorage.setItem("codeoba-window-x", String(lPos.x));
        localStorage.setItem("codeoba-window-y", String(lPos.y));
      } catch (err) {
        logFE("error", `Failed to perform first-launch window resizing: ${err}`);
      }
    }
  }

  // Show the window now that sizing, positioning, and theme are applied
  try {
    await appWindow.show();
    logFE("info", "App window shown after initialization.");
  } catch (err) {
    logFE("error", `Failed to show app window: ${err}`);
  }

  // Setup window geometry listeners to persist state on resize/move.
  // onResized/onMoved fire many times per drag; debounce so we write to localStorage once the
  // window settles instead of on every frame. A single writer captures both size and position.
  try {
    let geometrySaveTimer: ReturnType<typeof setTimeout> | undefined;
    const persistGeometry = () => {
      if (geometrySaveTimer !== undefined) {
        clearTimeout(geometrySaveTimer);
      }
      geometrySaveTimer = setTimeout(async () => {
        try {
          const scaleFactor = await appWindow.scaleFactor();
          const lSize = (await appWindow.innerSize()).toLogical(scaleFactor);
          const lPos = (await appWindow.innerPosition()).toLogical(scaleFactor);
          localStorage.setItem("codeoba-window-width", String(lSize.width));
          localStorage.setItem("codeoba-window-height", String(lSize.height));
          localStorage.setItem("codeoba-window-x", String(lPos.x));
          localStorage.setItem("codeoba-window-y", String(lPos.y));
        } catch (e) {
          console.error("Failed to persist window geometry:", e);
        }
      }, 200);
    };

    await appWindow.onResized(persistGeometry);
    await appWindow.onMoved(persistGeometry);
  } catch (err) {
    console.error("Failed to setup window geometry listeners:", err);
  }

  // Global event listener to intercept any external link clicks (a tag hrefs starting with http/https/mailto/tel)
  // and open them in the default external system browser, preventing webview navigation.
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href) {
        if (
          href.startsWith("http:") ||
          href.startsWith("https:") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ) {
          e.preventDefault();
          logFE("info", `Global Link Interceptor: Intercepted click to external URL: ${href}`);
          import("@tauri-apps/plugin-opener")
            .then(({ openUrl }) => {
              openUrl(href).catch((err) => {
                logFE("error", `Global Link Interceptor: Failed to open external link: ${err}`);
              });
            })
            .catch((err) => {
              logFE(
                "error",
                `Global Link Interceptor: Failed to load @tauri-apps/plugin-opener: ${err}`
              );
            });
        }
      }
    }
  });

  // Suppress the browser's default right-click menu (Reload/Back/Inspect/…) for a native-app feel,
  // but leave it intact where it's actually useful: editable fields (cut/copy/paste) and any
  // selected text (copy). Blanket-suppressing it broke cut/copy/paste in inputs.
  document.addEventListener("contextmenu", (e) => {
    const target = e.target;
    const isEditable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    const hasSelection = !!window.getSelection()?.toString();
    if (!isEditable && !hasSelection) {
      e.preventDefault();
    }
  });

  // Hook up skeleton window controls for Windows/Linux during startup
  try {
    const bindControls = () => {
      const minBtn = document.querySelector(".sk-win-min");
      const maxBtn = document.querySelector(".sk-win-max");
      const closeBtn = document.querySelector(".sk-win-close");

      if (minBtn && !minBtn.hasAttribute("data-bound")) {
        minBtn.setAttribute("data-bound", "true");
        minBtn.addEventListener("click", () => {
          appWindow.minimize().catch((err: any) => console.error("Skeleton minimize failed:", err));
        });
      }

      if (maxBtn && !maxBtn.hasAttribute("data-bound")) {
        maxBtn.setAttribute("data-bound", "true");
        maxBtn.addEventListener("click", async () => {
          try {
            if (await appWindow.isMaximized()) {
              await appWindow.unmaximize();
            } else {
              await appWindow.maximize();
            }
          } catch (err: any) {
            console.error("Skeleton maximize toggle failed:", err);
          }
        });
      }

      if (closeBtn && !closeBtn.hasAttribute("data-bound")) {
        closeBtn.setAttribute("data-bound", "true");
        closeBtn.addEventListener("click", () => {
          appWindow.close().catch((err: any) => console.error("Skeleton close failed:", err));
        });
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindControls);
    } else {
      bindControls();
    }
  } catch (err: any) {
    logFE("error", `Failed to bind skeleton window controls: ${err.message || err}`);
  }
})();
