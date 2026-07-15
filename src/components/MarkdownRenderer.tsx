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
import { useSpeech } from "../utils/useSpeech";

interface MarkdownRendererProps {
  content: string;
  searchQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  sessionId?: string;
  turnIndex?: number;
  sourceId?: string;
  filePath?: string;
}

export const MarkdownRenderer = (props: MarkdownRendererProps) => {
  const { t } = useI18n();
  const speech = useSpeech();
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null);
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
          /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
      });
    } catch (e) {
      logFE("error", `Markdown parse error: ${e}`);
      return DOMPurify.sanitize(displayContent(), {
        ALLOWED_URI_REGEXP:
          /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
      });
    }
  });

  // Apply Prism syntax highlighting on htmlContent change
  createEffect(() => {
    htmlContent(); // Read dependency to trigger effect
    const containerRef = container();
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
    const containerRef = container();

    setTimeout(() => {
      if (containerRef) {
        highlightContainer(containerRef, query || "", mc || false, ww || false, rx || false);
      }
    }, 50);
  });

  // Load local images asynchronously
  createEffect(() => {
    htmlContent(); // trigger on html change
    const containerRef = container();
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

  // Inject hover play buttons for each speakable text block
  createEffect(() => {
    htmlContent(); // Read dependency to trigger effect
    const containerRef = container();
    if (!containerRef || !props.sessionId || props.turnIndex === undefined) return;

    // Use a small delay to ensure DOM is updated
    setTimeout(() => {
      if (!containerRef) return;

      const elements = Array.from(
        containerRef.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6")
      );
      let narrativeElements = elements.filter((el) => !el.closest("pre") && !el.closest("code"));

      // Filter out child paragraphs that are nested inside list items to avoid duplicate play buttons
      narrativeElements = narrativeElements.filter((el) => {
        if (el.tagName.toLowerCase() === "p" && el.closest("li")) {
          return false;
        }
        return true;
      });

      narrativeElements.forEach((el) => {
        const htmlEl = el as HTMLElement;

        // Skip elements with no speakable text content
        if (!htmlEl.textContent || !/\p{L}|\p{N}/u.test(htmlEl.textContent)) return;
        if (htmlEl.querySelector(".read-aloud-play-btn")) return; // already added

        // Add parent hover context classes
        htmlEl.classList.add("group-play-block");

        // Create the hover play button element
        const btn = document.createElement("button");
        btn.className = "read-aloud-play-btn";
        btn.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
        btn.setAttribute("title", t("readAloud.playFromHere") || "Read Aloud from here");

        // Calculate offset to fix horizontal position relative to root markdown-body container
        const alignPlayButton = () => {
          const rectEl = htmlEl.getBoundingClientRect();
          const rectContainer = containerRef.getBoundingClientRect();
          if (rectEl.width === 0 || rectContainer.width === 0) return; // not laid out yet
          const isRtl = getComputedStyle(containerRef).direction === "rtl";
          if (isRtl) {
            const offsetRight = rectContainer.right - rectEl.right;
            btn.style.right = `${-26 - offsetRight}px`;
            btn.style.left = "auto";
          } else {
            const offsetLeft = rectEl.left - rectContainer.left;
            btn.style.left = `${-26 - offsetLeft}px`;
            btn.style.right = "auto";
          }
        };

        // Align initially
        alignPlayButton();

        // Re-align on hover to guarantee correctness under any dynamic layout changes
        htmlEl.addEventListener("mouseenter", alignPlayButton);

        btn.onclick = (e) => {
          e.stopPropagation();
          const sid = props.sessionId;
          const tid = props.turnIndex;
          const text = htmlEl.textContent || "";
          if (sid !== undefined && tid !== undefined) {
            speech.playFromHere(sid, tid, text, {
              sourceId: props.sourceId || "",
              filePath: props.filePath || "",
            });
          }
        };

        // Insert at the beginning of the element
        htmlEl.insertBefore(btn, htmlEl.firstChild);
      });
    }, 100);
  });

  // Apply speech-active block highlighting
  createEffect(() => {
    const idx = speech.currentSentenceIndex();
    const isPlaying = speech.isPlaying();
    const containerRef = container();

    // Clear any previous speech highlights in this container
    if (containerRef) {
      const highlighted = containerRef.querySelectorAll(".speech-highlight");
      highlighted.forEach((el) => {
        el.classList.remove("speech-highlight");
      });
    }

    if (!isPlaying || !containerRef || !props.sessionId || props.turnIndex === undefined) {
      return;
    }

    const list = speech.sentences();
    if (idx < 0 || idx >= list.length) return;
    const currentItem = list[idx]!;

    if (currentItem.sessionId !== props.sessionId || currentItem.turnIndex !== props.turnIndex) {
      return;
    }

    // Select text block elements in document order
    const elements = Array.from(
      containerRef.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6")
    );
    let narrativeElements = elements.filter((el) => !el.closest("pre") && !el.closest("code"));

    // Filter out child paragraphs that are nested inside list items to avoid duplicate highlighting targets
    narrativeElements = narrativeElements.filter((el) => {
      if (el.tagName.toLowerCase() === "p" && el.closest("li")) {
        return false;
      }
      return true;
    });

    let targetEl: HTMLElement | null = null;

    // Try text-similarity matching first (highly robust against off-by-one formatting/tag gaps)
    const cleanSpeakText = currentItem.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (cleanSpeakText) {
      targetEl =
        (narrativeElements.find((el) => {
          const cleanElText = el.textContent?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") || "";
          return (
            cleanElText.length > 0 &&
            (cleanElText.includes(cleanSpeakText) || cleanSpeakText.includes(cleanElText))
          );
        }) as HTMLElement) || null;
    }

    // Fallback to positional index matching
    if (
      !targetEl &&
      currentItem.blockIndex !== undefined &&
      currentItem.blockIndex < narrativeElements.length
    ) {
      targetEl = narrativeElements[currentItem.blockIndex] as HTMLElement;
    }

    if (targetEl) {
      targetEl.classList.add("speech-highlight");
    }
  });

  return (
    <div class="flex flex-col gap-3 w-full">
      <div
        ref={setContainer}
        onClick={handleLinkClick}
        class="markdown-body text-text-primary break-words font-sans relative"
        // Safe: htmlContent() is pre-sanitized by DOMPurify in htmlContent memo
        // eslint-disable-next-line solid/no-innerhtml
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
