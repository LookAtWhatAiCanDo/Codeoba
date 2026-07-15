import { createMemo, createSignal, createEffect } from "solid-js";
import { Marked } from "marked";
import Prism from "prismjs";
import { logFE } from "../utils/logger";
import { useI18n } from "../i18n/i18n";

// Import Prism syntax theme and supported languages
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";

import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import { highlightContainer } from "../utils/highlighter";
import { invoke } from "@tauri-apps/api/core";

interface MarkdownRendererProps {
  content: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export const MarkdownRenderer = (props: MarkdownRendererProps) => {
  const { t } = useI18n();
  let containerRef: HTMLDivElement | undefined;
  const [isExpanded, setIsExpanded] = createSignal(false);

  // Collapse if content changes (reset state)
  createEffect(() => {
    // Access props.content to track dependency
    props.content;
    setIsExpanded(false);
  });

  const isTooLarge = createMemo(() => props.content.length > 50000);

  // Sync parse markdown
  const displayContent = createMemo(() => {
    if (!isTooLarge() || isExpanded()) return props.content;
    return props.content.slice(0, 50000) + `\n\n\n*(${t("common.showFullContent")} - Truncated)*`;
  });

  // Initialize marked parser (runs once)
  const parser = new Marked({
    breaks: true,
    gfm: true,
  });

  parser.use({
    renderer: {
      image(hrefOrToken: any, title?: string | null, text?: string): string {
        let href = "";
        let t = "";
        let ttl = "";
        if (hrefOrToken && typeof hrefOrToken === "object") {
          href = hrefOrToken.href || "";
          t = hrefOrToken.text || "";
          ttl = hrefOrToken.title || "";
        } else {
          href = hrefOrToken || "";
          ttl = title || "";
          t = text || "";
        }
        const isLocal = href.startsWith("file:") || href.startsWith("/") || href.startsWith("~");
        if (isLocal) {
          return `<img class="lazy-local-image" data-src="${href}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="max-width: 100%; max-height: 500px; border-radius: 8px; opacity: 0.5; transition: opacity 0.3s; display: block; margin: 8px 0;" alt="${t}" title="${ttl}" />`;
        }
        return `<img src="${href}" title="${ttl}" alt="${t}" style="max-width: 100%; border-radius: 8px; display: block; margin: 8px 0;" />`;
      },
    },
  });

  const htmlContent = createMemo(() => {
    try {
      const parseStart = performance.now();
      const html = parser.parse(displayContent()) as string;
      const parseElapsed = performance.now() - parseStart;

      // Only log heavy parse operations to avoid flooding
      if (parseElapsed > 5) {
        logFE(
          "info",
          `Heavy Markdown parsed in ${parseElapsed.toFixed(1)}ms (content length: ${displayContent().length})`
        );
      }
      return DOMPurify.sanitize(html, {
        ALLOWED_URI_REGEXP:
          /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    } catch (e) {
      logFE("error", `Markdown parse error: ${e}`);
      return DOMPurify.sanitize(displayContent(), {
        ALLOWED_URI_REGEXP:
          /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    }
  });

  // Apply Prism syntax highlighting on htmlContent change
  createEffect(() => {
    htmlContent(); // Read dependency to trigger effect
    if (!containerRef) return;

    const highlightStart = performance.now();
    const codeBlocks = containerRef.querySelectorAll("pre code");

    if (codeBlocks.length === 0) {
      if ((window as any).sessionSelectionStart) {
        const totalElapsed = performance.now() - (window as any).sessionSelectionStart;
        logFE("debug", `TOTAL SESSION LOAD TIME: ${totalElapsed.toFixed(1)}ms`);
        (window as any).sessionSelectionStart = null;
      }
      return;
    }

    logFE(
      "debug",
      `Found ${codeBlocks.length} code blocks to highlight (content length: ${displayContent().length})`
    );

    let processed = 0;
    codeBlocks.forEach((block, idx) => {
      // Highlight asynchronously via setTimeout to yield back to browser
      setTimeout(() => {
        try {
          Prism.highlightElement(block as HTMLElement);
        } catch (e) {
          logFE("error", `Prism highlight error: ${e}`);
        }
        processed++;

        if (processed === codeBlocks.length) {
          const highlightElapsed = performance.now() - highlightStart;
          if ((window as any).sessionSelectionStart) {
            const totalElapsed = performance.now() - (window as any).sessionSelectionStart;
            logFE(
              "debug",
              `TOTAL SESSION LOAD TIME: ${totalElapsed.toFixed(0)}ms (click to highlight finished, highlighted ${codeBlocks.length} blocks in ${highlightElapsed.toFixed(0)}ms)`
            );
            (window as any).sessionSelectionStart = null;
          } else {
            logFE(
              "debug",
              `Asynchronously finished highlighting ${codeBlocks.length} code blocks in ${highlightElapsed.toFixed(0)}ms`
            );
          }
        }
      }, idx * 4); // Stagger highlighting slightly (4ms per block) to avoid frame drops
    });
  });

  // Apply text search highlights (Component 2)
  createEffect(() => {
    htmlContent();
    const query = props.searchQuery;
    const mc = props.matchCase;
    const ww = props.wholeWord;
    const rx = props.useRegex;

    setTimeout(() => {
      if (containerRef) {
        highlightContainer(containerRef, query || "", mc || false, ww || false, rx || false);
      }
    }, 50);
  });

  // Load local images asynchronously
  createEffect(() => {
    htmlContent(); // trigger on html change
    if (!containerRef) return;

    // Use a small delay to ensure DOM is updated
    setTimeout(() => {
      if (!containerRef) return;
      const lazyImages = containerRef.querySelectorAll("img.lazy-local-image");
      lazyImages.forEach(async (imgEl) => {
        const img = imgEl as HTMLImageElement;
        const rawSrc = img.getAttribute("data-src");
        if (rawSrc && (!img.src || img.src.startsWith("data:image/gif"))) {
          try {
            let cleanPath = rawSrc;
            if (cleanPath.startsWith("file://")) {
              cleanPath = cleanPath.substring(7);
            }
            const base64Data = await invoke<string>("read_session_image", { path: cleanPath });
            img.src = base64Data;
            img.style.opacity = "1";
          } catch (err) {
            logFE("error", `Failed to load local markdown image ${rawSrc}: ${err}`);
            img.style.display = "none";
          }
        }
      });
    }, 50);
  });

  const handleLinkClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href) {
        // Intercept local paths, file scheme or tilde indicators
        if (href.startsWith("file:") || href.startsWith("/") || href.startsWith("~")) {
          e.preventDefault();
          logFE("info", `MarkdownRenderer: Intercepted local file click: ${href}`);
          const event = new CustomEvent("open-local-file", {
            detail: { href },
          });
          window.dispatchEvent(event);
        } else if (
          href.startsWith("http:") ||
          href.startsWith("https:") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ) {
          e.preventDefault();
          logFE("info", `MarkdownRenderer: Intercepted external link click: ${href}`);
          openUrl(href).catch((err) => {
            logFE("error", `Failed to open external link: ${err}`);
          });
        }
      }
    }
  };

  return (
    <div class="flex flex-col gap-3 w-full">
      <div
        ref={containerRef}
        onClick={handleLinkClick}
        class="markdown-body text-text-primary overflow-x-hidden break-words font-sans"
        innerHTML={htmlContent()}
      />
      {isTooLarge() && !isExpanded() && (
        <button
          onClick={() => setIsExpanded(true)}
          class="self-start mt-1 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-xs font-semibold rounded-xl text-accent hover:text-accent transition-all cursor-pointer shadow-sm hover:shadow-md"
        >
          {t("common.showFullContent")} ({(props.content.length / 1024).toFixed(1)} KB total)
        </button>
      )}
    </div>
  );
};
