import { createMemo, createSignal, createEffect, onCleanup } from "solid-js";
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
import { useSpeech, splitIntoLogicalBlocks, sanitizeBlockForSpeech } from "../utils/useSpeech";

const massageMermaidCode = (code: string): string => {
  const lines = code.split(/\r?\n/);

  // Step 1: Replace graph declaration with flowchart & wrap unquoted subgraph titles
  const processedLines = lines.map((line) => {
    const graphMatch = line.match(/^(\s*)graph\s+([A-Za-z]+)\s*$/);
    if (graphMatch) {
      return `${graphMatch[1]}flowchart ${graphMatch[2].toUpperCase()}`;
    }
    const simpleGraphMatch = line.match(/^(\s*)graph\s*$/);
    if (simpleGraphMatch) {
      return `${simpleGraphMatch[1]}flowchart`;
    }

    const match = line.match(/^(\s*)subgraph\s+([^"\[\]\r\n]+)$/i);
    if (match) {
      const indent = match[1];
      const title = match[2].trim();
      if (title && !title.startsWith('"') && !title.endsWith('"')) {
        return `${indent}subgraph "${title}"`;
      }
    }
    return line;
  });

  // Step 2: Detect subgraphs with only isolated nodes and inject "direction LR"
  interface SubgraphInfo {
    headerIndex: number;
    nodes: string[];
    indent: string;
    hasExplicitDirection?: boolean;
    endIndex: number;
  }
  const subgraphs: SubgraphInfo[] = [];
  const currentStack: SubgraphInfo[] = [];

  // Collect all connection lines and find all node IDs that are part of connections
  const connectedNodes = new Set<string>();

  processedLines.forEach((line) => {
    if (
      line.includes("-->") ||
      line.includes("---") ||
      line.includes("==>") ||
      line.includes("-.->")
    ) {
      const words = line.match(/[a-zA-Z0-9_-]+/g);
      if (words) {
        words.forEach((word) => {
          const lower = word.toLowerCase();
          if (
            lower !== "graph" &&
            lower !== "subgraph" &&
            lower !== "end" &&
            lower !== "direction" &&
            lower !== "td" &&
            lower !== "lr" &&
            lower !== "flowchart"
          ) {
            connectedNodes.add(word);
          }
        });
      }
    }
  });

  // Parse lines to associate nodes with subgraphs
  processedLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("subgraph ")) {
      const match = line.match(/^(\s*)subgraph/i);
      const indent = match ? match[1] : "";
      const info: SubgraphInfo = {
        headerIndex: index,
        nodes: [],
        indent,
        endIndex: -1,
      };
      subgraphs.push(info);
      currentStack.push(info);
    } else if (trimmed.toLowerCase() === "end") {
      const top = currentStack.pop();
      if (top) {
        top.endIndex = index;
      }
    } else if (currentStack.length > 0) {
      if (trimmed.toLowerCase().startsWith("direction ")) {
        currentStack[currentStack.length - 1].hasExplicitDirection = true;
      } else {
        const nodeMatch = line.match(/^\s*([a-zA-Z0-9_-]+)\s*(?:\[|\(|\{|\(\(|>|\[\")/);
        if (nodeMatch) {
          const nodeId = nodeMatch[1];
          currentStack[currentStack.length - 1].nodes.push(nodeId);
        }
      }
    }
  });

  // For each subgraph, check if all of its declared nodes are isolated
  for (let i = subgraphs.length - 1; i >= 0; i--) {
    const sg = subgraphs[i];
    if (sg.nodes.length > 0) {
      const allIsolated = sg.nodes.every((nodeId) => !connectedNodes.has(nodeId));
      if (allIsolated && !sg.hasExplicitDirection && sg.endIndex !== -1) {
        const indent = sg.indent + "    ";

        // 1. Inject invisible links right before the "end" statement
        const invisibleLinks: string[] = [];
        for (let j = 0; j < sg.nodes.length - 1; j++) {
          invisibleLinks.push(`${indent}${sg.nodes[j]} ~~~ ${sg.nodes[j + 1]}`);
        }
        if (invisibleLinks.length > 0) {
          processedLines.splice(sg.endIndex, 0, ...invisibleLinks);
        }

        // 2. Inject "direction LR" right after the subgraph header
        processedLines.splice(sg.headerIndex + 1, 0, `${indent}direction LR`);
      }
    }
  }

  return processedLines.join("\n");
};

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
  startBlockIndex?: number;
}

const wrapBrContent = (el: HTMLElement) => {
  if (el.querySelector(".br-content-wrap") || el.classList.contains("br-content-wrap")) return;

  const childNodes = Array.from(el.childNodes);
  let currentGroup: Node[] = [];
  const groups: Node[][] = [];

  for (const node of childNodes) {
    if (node.nodeType === 1 && (node as Element).tagName.toLowerCase() === "br") {
      groups.push(currentGroup);
      currentGroup = [];
    } else {
      currentGroup.push(node);
    }
  }
  groups.push(currentGroup);

  if (groups.length <= 1) return;

  el.innerHTML = "";

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const hasText = group.some((n) => n.nodeType === 3 && (n.textContent?.trim().length ?? 0) > 0);
    const hasElement = group.some((n) => n.nodeType === 1);

    if (group.length > 0 && (hasText || hasElement)) {
      const wrapper = document.createElement("span");
      wrapper.className = "br-content-wrap inline-block w-full relative";
      for (const node of group) {
        wrapper.appendChild(node);
      }
      el.appendChild(wrapper);
    }

    if (i < groups.length - 1) {
      el.appendChild(document.createElement("br"));
    }
  }
};

const wrapLiInlineContent = (li: HTMLElement) => {
  if (li.querySelector(".li-content-wrap") || li.querySelector(".br-content-wrap")) return;

  const childNodes = Array.from(li.childNodes);
  const inlineNodes: Node[] = [];

  for (const node of childNodes) {
    if (
      node.nodeType === 1 && // Node.ELEMENT_NODE
      /^(p|ul|ol|blockquote|div|h[1-6])$/i.test((node as Element).tagName)
    ) {
      break;
    }
    inlineNodes.push(node);
  }

  const hasText = inlineNodes.some(
    (n) => n.nodeType === 3 && (n.textContent?.trim().length ?? 0) > 0 // Node.TEXT_NODE
  );
  const hasInlineElement = inlineNodes.some(
    (n) =>
      n.nodeType === 1 && // Node.ELEMENT_NODE
      !/^(p|ul|ol|blockquote|div|h[1-6])$/i.test((n as Element).tagName)
  );

  if (inlineNodes.length > 0 && (hasText || hasInlineElement)) {
    const wrapper = document.createElement("span");
    wrapper.className = "li-content-wrap inline-block w-full relative";
    li.insertBefore(wrapper, inlineNodes[0]!);
    for (const node of inlineNodes) {
      wrapper.appendChild(node);
    }
  }
};

export const MarkdownRenderer = (props: MarkdownRendererProps) => {
  const { t } = useI18n();
  const speech = useSpeech();
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null);
  const [isExpanded, setIsExpanded] = createSignal(false);

  const numBlocks = createMemo(() => {
    if (props.startBlockIndex === undefined) return 100000;
    const blocks = splitIntoLogicalBlocks(props.content);
    let count = 0;
    for (const rawBlock of blocks) {
      if (/^[-*_]{3,}$/.test(rawBlock)) continue;
      const sanitized = sanitizeBlockForSpeech(rawBlock);
      if (sanitized && /\p{L}|\p{N}/u.test(sanitized)) {
        count++;
      }
    }
    return count;
  });

  // Listen to custom toggle-mermaid-raw events to swap raw/diagram formats from the parent context menu
  createEffect(() => {
    const handleToggleEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { wrapper, container: targetContainer } = customEvent.detail;
      const myContainer = container();
      if (myContainer && wrapper && targetContainer && myContainer.contains(wrapper)) {
        toggleMermaidRaw(wrapper, targetContainer);
      }
    };
    window.addEventListener("toggle-mermaid-raw", handleToggleEvent);
    onCleanup(() => {
      window.removeEventListener("toggle-mermaid-raw", handleToggleEvent);
    });
  });

  const toggleMermaidRaw = async (wrapper: HTMLElement, container: HTMLElement) => {
    logFE("info", "toggleMermaidRaw: started");
    const showRaw = wrapper.getAttribute("data-show-raw") === "true";
    logFE("info", `toggleMermaidRaw: showRaw = ${showRaw}`);
    const encodedCode = container.getAttribute("data-code");
    if (!encodedCode) {
      logFE("warn", "toggleMermaidRaw: data-code is missing");
      return;
    }
    const codeText = decodeURIComponent(encodedCode);
    logFE("info", `toggleMermaidRaw: decoded code length = ${codeText.length}`);

    if (showRaw) {
      // Switch back to diagram
      wrapper.setAttribute("data-show-raw", "false");
      // Restore loading spinner first
      container.innerHTML = `
        <div class="flex items-center gap-2 text-text-secondary text-xs animate-pulse">
          <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          ${t("detailPane.mermaidRendering")}
        </div>
      `;
      // Render diagram
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        const getComputedColor = (varName: string, fallback: string): string => {
          const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
          return value || fallback;
        };

        const surfaceColor = getComputedColor("--surface", "#16181f");
        const textColor = getComputedColor("--text-primary", "#f3f4f6");
        const secondaryTextColor = getComputedColor("--text-secondary", "#9ca3af");
        const borderColor = getComputedColor("--border", "#242733");
        const backgroundColor = getComputedColor("--background", "#0d0e12");

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            fontFamily: "var(--font-sans)",
            background: backgroundColor,
            primaryColor: surfaceColor,
            primaryTextColor: textColor,
            primaryBorderColor: borderColor,
            lineColor: secondaryTextColor,
            secondaryColor: backgroundColor,
            tertiaryColor: surfaceColor,
            nodeBorder: borderColor,
            mainBkg: surfaceColor,
            noteBkgColor: surfaceColor,
            noteTextColor: textColor,
            noteBorderColor: borderColor,
            actorBkg: surfaceColor,
            actorBorder: borderColor,
            actorTextColor: textColor,
            actorLineColor: secondaryTextColor,
            signalColor: textColor,
            signalTextColor: textColor,
            labelBoxBorderColor: borderColor,
            labelBoxBkgColor: surfaceColor,
            labelTextColor: textColor,
            loopTextColor: textColor,
          },
          securityLevel: "loose",
        });

        logFE("info", "toggleMermaidRaw: calling mermaid.render...");
        const uniqueId = `mermaid-svg-${Math.random().toString(36).substring(2, 11)}`;
        const massagedCode = massageMermaidCode(codeText);
        const { svg, bindFunctions } = await mermaid.render(uniqueId, massagedCode);
        logFE("info", "toggleMermaidRaw: mermaid.render completed");
        container.innerHTML = svg;
        if (bindFunctions) {
          bindFunctions(container);
        }
        logFE("info", "toggleMermaidRaw: diagram SVG updated");
      } catch (error) {
        logFE("error", `Failed to render Mermaid diagram: ${error}`);
        container.innerHTML = `
          <div class="mermaid-error-container border border-red-500/20 bg-red-500/10 text-red-400 p-4 rounded-xl text-sm flex flex-col gap-2 font-mono w-full text-left">
            <div class="font-semibold flex items-center gap-1.5">
              <svg class="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              ${t("detailPane.mermaidFailed")}
            </div>
            <div class="text-xs max-h-32 overflow-auto bg-black/10 p-2 rounded border border-white/5 whitespace-pre-wrap">${error instanceof Error ? error.message : String(error)}</div>
            <details class="mt-1">
              <summary class="cursor-pointer text-xs underline select-none hover:text-red-300 transition-colors">${t("detailPane.mermaidShowOriginal")}</summary>
              <pre class="bg-black/30 p-2 mt-2 rounded border border-white/10 text-xs overflow-x-auto text-text-secondary"><code>${codeText}</code></pre>
            </details>
          </div>
        `;
      }
    } else {
      // Switch to raw code
      logFE("info", "toggleMermaidRaw: switching to raw code");
      wrapper.setAttribute("data-show-raw", "true");
      container.innerHTML = `
        <pre class="bg-black/30 p-3 rounded border border-border/40 text-xs overflow-x-auto text-text-secondary w-full font-mono text-left select-text"><code>${codeText}</code></pre>
      `;
      logFE("info", "toggleMermaidRaw: raw code HTML updated");
    }
    logFE("info", "toggleMermaidRaw: finished successfully");
  };

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
      code(codeOrToken: any, language?: string): string {
        let text = "";
        let lang = "";
        if (codeOrToken && typeof codeOrToken === "object") {
          text = codeOrToken.text || "";
          lang = codeOrToken.lang || "";
        } else {
          text = codeOrToken || "";
          lang = language || "";
        }

        if (lang === "mermaid") {
          return `<div class="mermaid-diagram-wrapper my-4 overflow-x-auto w-full max-w-full flex justify-center bg-surface/30 border border-border/40 rounded-xl p-4 shadow-sm">
            <div class="mermaid-diagram-container w-full" data-code="${encodeURIComponent(text)}">
              <div class="flex items-center gap-2 text-text-secondary text-xs animate-pulse">
                <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                ${t("detailPane.mermaidRendering")}
              </div>
            </div>
          </div>`;
        }

        return `<pre><code class="language-${lang || "none"}">${text}</code></pre>`;
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

  // Render Mermaid diagrams on htmlContent change
  createEffect(() => {
    htmlContent(); // Read dependency to trigger effect
    const containerRef = container();
    if (!containerRef) return;

    const mermaidBlocks = containerRef.querySelectorAll(".mermaid-diagram-container");
    if (mermaidBlocks.length === 0) return;

    // Load mermaid dynamically only when needed to prevent bundle size issues/Tauri custom protocol flooding on startup
    import("mermaid")
      .then((mermaidModule) => {
        const mermaid = mermaidModule.default;

        // Resolve computed theme colors from the DOM since Mermaid's color parser
        // doesn't support raw 'var(--...)' strings and requires real color codes (hex, HSL, or RGB)
        const getComputedColor = (varName: string, fallback: string): string => {
          const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
          return value || fallback;
        };

        const surfaceColor = getComputedColor("--surface", "#16181f");
        const textColor = getComputedColor("--text-primary", "#f3f4f6");
        const secondaryTextColor = getComputedColor("--text-secondary", "#9ca3af");
        const borderColor = getComputedColor("--border", "#242733");
        const backgroundColor = getComputedColor("--background", "#0d0e12");

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            fontFamily: "var(--font-sans)",
            background: backgroundColor,
            primaryColor: surfaceColor,
            primaryTextColor: textColor,
            primaryBorderColor: borderColor,
            lineColor: secondaryTextColor,
            secondaryColor: backgroundColor,
            tertiaryColor: surfaceColor,
            nodeBorder: borderColor,
            mainBkg: surfaceColor,
            noteBkgColor: surfaceColor,
            noteTextColor: textColor,
            noteBorderColor: borderColor,
            actorBkg: surfaceColor,
            actorBorder: borderColor,
            actorTextColor: textColor,
            actorLineColor: secondaryTextColor,
            signalColor: textColor,
            signalTextColor: textColor,
            labelBoxBorderColor: borderColor,
            labelBoxBkgColor: surfaceColor,
            labelTextColor: textColor,
            loopTextColor: textColor,
          },
          securityLevel: "loose",
        });

        mermaidBlocks.forEach((blockEl, idx) => {
          const block = blockEl as HTMLElement;
          const encodedCode = block.getAttribute("data-code");
          if (!encodedCode) return;

          const codeText = decodeURIComponent(encodedCode);

          // Render asynchronously to avoid blocking the main UI thread
          setTimeout(async () => {
            try {
              // Generate a clean, unique ID for mermaid rendering
              // Mermaid ids must start with a letter and contain only alphanumeric/hyphen/underscore
              const uniqueId = `mermaid-svg-${Math.random().toString(36).substring(2, 11)}`;
              const massagedCode = massageMermaidCode(codeText);
              const { svg, bindFunctions } = await mermaid.render(uniqueId, massagedCode);

              block.innerHTML = svg;
              if (bindFunctions) {
                bindFunctions(block);
              }
            } catch (error) {
              logFE("error", `Failed to render Mermaid diagram: ${error}`);
              block.innerHTML = `
                <div class="mermaid-error-container border border-red-500/20 bg-red-500/10 text-red-400 p-4 rounded-xl text-sm flex flex-col gap-2 font-mono w-full text-left">
                  <div class="font-semibold flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    ${t("detailPane.mermaidFailed")}
                  </div>
                  <div class="text-xs max-h-32 overflow-auto bg-black/10 p-2 rounded border border-white/5 whitespace-pre-wrap">${error instanceof Error ? error.message : String(error)}</div>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-xs underline select-none hover:text-red-300 transition-colors">${t("detailPane.mermaidShowOriginal")}</summary>
                    <pre class="bg-black/30 p-2 mt-2 rounded border border-white/10 text-xs overflow-x-auto text-text-secondary"><code>${codeText}</code></pre>
                  </details>
                </div>
              `;
            }
          }, idx * 15); // Stagger rendering slightly to keep UI fluid
        });
      })
      .catch((err) => {
        logFE("error", `Failed to dynamically load mermaid: ${err}`);
        mermaidBlocks.forEach((blockEl) => {
          const block = blockEl as HTMLElement;
          const encodedCode = block.getAttribute("data-code");
          const codeText = encodedCode ? decodeURIComponent(encodedCode) : "";
          block.innerHTML = `
            <div class="mermaid-error-container border border-red-500/20 bg-red-500/10 text-red-400 p-4 rounded-xl text-sm flex flex-col gap-2 font-mono w-full text-left">
              <div class="font-semibold flex items-center gap-1.5">
                <svg class="w-4 h-4 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Failed to load Mermaid parser
              </div>
              <div class="text-xs max-h-32 overflow-auto bg-black/10 p-2 rounded border border-white/5 whitespace-pre-wrap">${err instanceof Error ? err.message : String(err)}</div>
              ${
                codeText
                  ? `
              <details class="mt-1">
                <summary class="cursor-pointer text-xs underline select-none hover:text-red-300 transition-colors">${t("detailPane.mermaidShowOriginal")}</summary>
                <pre class="bg-black/30 p-2 mt-2 rounded border border-white/10 text-xs overflow-x-auto text-text-secondary"><code>${codeText}</code></pre>
              </details>
              `
                  : ""
              }
            </div>
          `;
        });
      });
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

    // Check if user clicked inside a rendered Mermaid diagram to enlarge it
    const mermaidContainer = target.closest(".mermaid-diagram-container") as HTMLElement | null;
    const mermaidWrapper = target.closest(".mermaid-diagram-wrapper") as HTMLElement | null;
    if (
      mermaidContainer &&
      mermaidWrapper &&
      mermaidWrapper.getAttribute("data-show-raw") !== "true" &&
      !target.closest(".mermaid-error-container")
    ) {
      const svgEl = mermaidContainer.querySelector("svg");
      if (svgEl) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const svgString = new XMLSerializer().serializeToString(svgEl);
          const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
          const event = new CustomEvent("open-image-lightbox", {
            detail: { src: svgDataUrl },
          });
          window.dispatchEvent(event);
        } catch (err) {
          logFE("error", `Failed to generate data URL for Mermaid diagram lightbox: ${err}`);
        }
        return;
      }
    }

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

      // Wrap content separated by <br> in p and li elements to allow precise line-by-line highlighting
      const brElements = containerRef.querySelectorAll("p, li, blockquote");
      brElements.forEach((el) => wrapBrContent(el as HTMLElement));

      // Wrap inline content of list items to allow precise highlighting and play button alignment
      const liElements = containerRef.querySelectorAll("li");
      liElements.forEach((li) => wrapLiInlineContent(li as HTMLElement));

      const elements = Array.from(
        containerRef.querySelectorAll(
          "p, .li-content-wrap, .br-content-wrap, li, blockquote, h1, h2, h3, h4, h5, h6"
        )
      );
      let narrativeElements = elements.filter((el) => !el.closest("pre") && !el.closest("code"));

      // Discard parent elements that have a wrapped child to ensure we target the innermost element
      narrativeElements = narrativeElements.filter((el) => {
        if (el.querySelector(".br-content-wrap") || el.querySelector(".li-content-wrap")) {
          return false;
        }
        if (el.tagName.toLowerCase() === "p" && el.closest("li")) {
          const parentLi = el.closest("li");
          if (parentLi) {
            const liText = parentLi.textContent?.trim() || "";
            const pText = el.textContent?.trim() || "";
            if (liText === pText) {
              return false; // Filter out if duplicate of parent
            }
          }
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
        btn.setAttribute("title", t("readAloud.playFromHere"));

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

    if (currentItem.blockIndex === undefined) {
      return;
    }

    if (props.startBlockIndex !== undefined) {
      const relIdx = currentItem.blockIndex - props.startBlockIndex;
      if (relIdx < 0 || relIdx >= numBlocks()) {
        return;
      }
    }

    const targetBlockIndex =
      props.startBlockIndex !== undefined
        ? currentItem.blockIndex - props.startBlockIndex
        : currentItem.blockIndex;

    // Wrap content separated by <br> in p and li elements to allow precise line-by-line highlighting
    const brElements = containerRef.querySelectorAll("p, li, blockquote");
    brElements.forEach((el) => wrapBrContent(el as HTMLElement));

    // Wrap inline content of list items to allow precise highlighting
    const liElements = containerRef.querySelectorAll("li");
    liElements.forEach((li) => wrapLiInlineContent(li as HTMLElement));

    // Select text block elements in document order
    const elements = Array.from(
      containerRef.querySelectorAll(
        "p, .li-content-wrap, .br-content-wrap, li, blockquote, h1, h2, h3, h4, h5, h6"
      )
    );
    let narrativeElements = elements.filter((el) => !el.closest("pre") && !el.closest("code"));

    // Discard parent elements that have a wrapped child to ensure we target the innermost element
    narrativeElements = narrativeElements.filter((el) => {
      if (el.querySelector(".br-content-wrap") || el.querySelector(".li-content-wrap")) {
        return false;
      }
      // Keep p elements if they are nested inside li, because we can target them individually using minimum-length matching.
      // But if the parent li has no other text content besides this p, we can filter it to prevent double-matching.
      if (el.tagName.toLowerCase() === "p" && el.closest("li")) {
        const parentLi = el.closest("li");
        if (parentLi) {
          const liText = parentLi.textContent?.trim() || "";
          const pText = el.textContent?.trim() || "";
          if (liText === pText) {
            return false; // Filter out if duplicate of parent
          }
        }
      }
      return true;
    });

    let targetEl: HTMLElement | null = null;

    // Try text-similarity matching first (highly robust against off-by-one formatting/tag gaps)
    const cleanSpeakText = currentItem.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (cleanSpeakText) {
      logFE("info", `TTS HIGHLIGHT scan for speakText: "${cleanSpeakText}"`);
      const matches = narrativeElements
        .map((el, i) => {
          let rawElText = el.textContent?.toLowerCase() || "";
          // Normalize angle brackets in the same way as speech text to ensure matching
          rawElText = rawElText.replace(/</g, " less than ").replace(/>/g, " greater than ");
          const cleanElText = rawElText.replace(/[^\p{L}\p{N}]/gu, "") || "";
          logFE("info", `  Element ${i} (${el.tagName}): "${cleanElText.substring(0, 60)}..."`);
          const isMatch =
            cleanElText.length > 0 &&
            (cleanElText.includes(cleanSpeakText) || cleanSpeakText.includes(cleanElText));
          return { el: el as HTMLElement, i, cleanElText, isMatch };
        })
        .filter((m) => m.isMatch);

      if (matches.length > 0) {
        // Sort matches to find the best candidate:
        // 1. Prefer smaller text length difference to match the innermost/most specific element
        // 2. Prefer the element closest to the blockIndex position
        matches.sort((a, b) => {
          const lenDiffA = Math.abs(a.cleanElText.length - cleanSpeakText.length);
          const lenDiffB = Math.abs(b.cleanElText.length - cleanSpeakText.length);
          if (lenDiffA !== lenDiffB) {
            return lenDiffA - lenDiffB;
          }
          const distA = Math.abs(a.i - (targetBlockIndex ?? 0));
          const distB = Math.abs(b.i - (targetBlockIndex ?? 0));
          return distA - distB;
        });
        targetEl = matches[0]!.el;
      }
    }

    // Fallback to positional index matching
    if (
      !targetEl &&
      targetBlockIndex !== undefined &&
      targetBlockIndex < narrativeElements.length
    ) {
      targetEl = narrativeElements[targetBlockIndex] as HTMLElement;
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
