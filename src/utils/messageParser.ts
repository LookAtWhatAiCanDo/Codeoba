export interface MessageTextPart {
  type: "text";
  content: string;
}

export interface MessageToolPart {
  type: "tool";
  toolType: string;
  header: string;
  content: string;
  timestamp: number;
}
export type MessagePart = MessageTextPart | MessageToolPart;

function unescapeToolTags(text: string): string {
  return text.replace(/\\\[\\\[\\\[TOOL/g, "[[[TOOL").replace(/\\\[\\\[\\\[\/TOOL/g, "[[[/TOOL");
}

function isEscaped(text: string, index: number): boolean {
  let count = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === "\\") {
    count++;
    i--;
  }
  return count % 2 !== 0;
}

export function parseAssistantMessage(message: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let currentIndex = 0;

  while (currentIndex < message.length) {
    let startIdx = message.indexOf("[[[TOOL:", currentIndex);
    while (startIdx !== -1 && isEscaped(message, startIdx)) {
      startIdx = message.indexOf("[[[TOOL:", startIdx + 8);
    }

    if (startIdx === -1) {
      const remaining = message.substring(currentIndex);
      if (remaining.length > 0) {
        parts.push({
          type: "text",
          content: unescapeToolTags(remaining),
        });
      }
      break;
    }

    // Add preceding text if any
    if (startIdx > currentIndex) {
      const preceding = message.substring(currentIndex, startIdx);
      if (preceding.length > 0) {
        parts.push({
          type: "text",
          content: unescapeToolTags(preceding),
        });
      }
    }

    const headerEndIdx = message.indexOf("]]]", startIdx);
    if (headerEndIdx === -1) {
      parts.push({
        type: "text",
        content: unescapeToolTags(message.substring(startIdx)),
      });
      break;
    }

    const headerContent = message.substring(startIdx + 8, headerEndIdx);
    const partsOfHeader = headerContent.split("|");
    const toolType = partsOfHeader[0] || "";
    const header = partsOfHeader[1] || "";
    const timestamp = parseInt(partsOfHeader[2] || "0", 10) || 0;

    let endIdx = message.indexOf("[[[/TOOL]]]", headerEndIdx + 3);
    while (endIdx !== -1 && isEscaped(message, endIdx)) {
      endIdx = message.indexOf("[[[/TOOL]]]", endIdx + 11);
    }

    if (endIdx === -1) {
      // Unclosed tool tag: treat prefix as text and search for subsequent tags
      const tagStart = message.substring(startIdx, startIdx + 8);
      parts.push({
        type: "text",
        content: unescapeToolTags(tagStart),
      });
      currentIndex = startIdx + 8;
      continue;
    }

    const content = message.substring(headerEndIdx + 3, endIdx);
    parts.push({
      type: "tool",
      toolType: unescapeToolTags(toolType),
      header: unescapeToolTags(header),
      content: unescapeToolTags(content),
      timestamp,
    });

    currentIndex = endIdx + 11;
  }

  return parts;
}
