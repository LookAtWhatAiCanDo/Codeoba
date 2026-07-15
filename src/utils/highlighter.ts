/**
 * Reusable utility helpers for search term text highlighting
 */

export function checkTextMatch(
  text: string,
  query: string,
  matchCase: boolean,
  wholeWord: boolean,
  useRegex: boolean
): boolean {
  if (!query || query.trim() === "") return false;
  try {
    const flags = matchCase ? "" : "i";
    let pattern = query;
    if (!useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const regex = new RegExp(pattern, flags);
    return regex.test(text);
  } catch (e) {
    return false;
  }
}

export function highlightContainer(
  container: HTMLElement,
  query: string,
  matchCase: boolean,
  wholeWord: boolean,
  useRegex: boolean
) {
  if (!query || query.trim() === "") {
    removeHighlights(container);
    return;
  }

  // Remove existing highlights first to start fresh
  removeHighlights(container);

  // Build the matching regex
  let regex: RegExp;
  try {
    const flags = matchCase ? "g" : "gi";
    let pattern = query;
    if (!useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    regex = new RegExp(pattern, flags);
  } catch (e) {
    return;
  }

  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        parent &&
        (parent.tagName === "SCRIPT" ||
          parent.tagName === "STYLE" ||
          parent.tagName === "MARK" ||
          parent.closest("pre")) // Skip inside raw pre formatting or raw code blocks if managed separately
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodesToReplace: Text[] = [];
  let currentNode = walk.nextNode();
  while (currentNode) {
    nodesToReplace.push(currentNode as Text);
    currentNode = walk.nextNode();
  }

  for (const node of nodesToReplace) {
    const text = node.nodeValue || "";
    // Reset regex lastIndex to be safe
    regex.lastIndex = 0;

    if (regex.test(text)) {
      const parent = node.parentElement;
      if (!parent) continue;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match[0] === "") {
          regex.lastIndex++;
          continue;
        }

        // Add preceding text
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }

        // Add highlighted mark element
        const mark = document.createElement("mark");
        mark.className = "bg-yellow-500/30 text-text-primary rounded px-0.5";
        mark.textContent = match[0];
        fragment.appendChild(mark);

        lastIndex = regex.lastIndex;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      try {
        parent.replaceChild(fragment, node);
      } catch (e) {
        // Handle race conditions or dynamic dom modifications
      }
    }
  }
}

export function removeHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll("mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      const textNode = document.createTextNode(mark.textContent || "");
      parent.replaceChild(textNode, mark);
      parent.normalize();
    }
  });
}
