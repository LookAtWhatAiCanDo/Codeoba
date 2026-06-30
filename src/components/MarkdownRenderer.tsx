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

interface MarkdownRendererProps {
  content: string;
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

  const htmlContent = createMemo(() => {
    try {
      const parseStart = performance.now();
      const html = parser.parse(displayContent()) as string;
      const parseElapsed = performance.now() - parseStart;
      
      // Only log heavy parse operations to avoid flooding
      if (parseElapsed > 5) {
        logFE("info", `Heavy Markdown parsed in ${parseElapsed.toFixed(1)}ms (content length: ${displayContent().length})`);
      }
      return html;
    } catch (e) {
      logFE("error", `Markdown parse error: ${e}`);
      return displayContent();
    }
  });

  // Apply Prism syntax highlighting on htmlContent change
  createEffect(() => {
    htmlContent(); // Read dependency to trigger effect
    if (!containerRef) return;

    const highlightStart = performance.now();
    const codeBlocks = containerRef.querySelectorAll("pre code");

    if (codeBlocks.length === 0) {
      // If there are no code blocks, we are done rendering this content.
      // Check if we should log the total session load time
      if ((window as any).sessionSelectionStart) {
        const totalElapsed = performance.now() - (window as any).sessionSelectionStart;
        logFE("info", `TOTAL SESSION LOAD TIME: ${totalElapsed.toFixed(1)}ms`);
        (window as any).sessionSelectionStart = null;
      }
      return;
    }

    logFE("info", `Found ${codeBlocks.length} code blocks to highlight (content length: ${displayContent().length})`);

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

        // Log completion metrics once all blocks are finished
        if (processed === codeBlocks.length) {
          const highlightElapsed = performance.now() - highlightStart;
          
          if ((window as any).sessionSelectionStart) {
            const totalElapsed = performance.now() - (window as any).sessionSelectionStart;
            logFE(
              "info",
              `TOTAL SESSION LOAD TIME: ${totalElapsed.toFixed(0)}ms (click to highlight finished, highlighted ${codeBlocks.length} blocks in ${highlightElapsed.toFixed(0)}ms)`
            );
            (window as any).sessionSelectionStart = null;
          } else {
            logFE(
              "info",
              `Asynchronously finished highlighting ${codeBlocks.length} code blocks in ${highlightElapsed.toFixed(0)}ms`
            );
          }
        }
      }, idx * 4); // Stagger highlighting slightly (4ms per block) to avoid frame drops
    });
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
            detail: { href }
          });
          window.dispatchEvent(event);
        } else if (href.startsWith("http:") || href.startsWith("https:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
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
        class="markdown-body text-text-primary overflow-x-hidden break-words font-sans text-[15px]"
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
