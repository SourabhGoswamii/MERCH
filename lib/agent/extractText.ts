/*
 * AIMessage.content can be a plain string or an array of content blocks
 * (LangChain v1: text | tool_call | tool_use | ...). Anything that wants
 * a human-readable string from an AI message content field should use
 * this. It walks the blocks, keeps only the text parts, and skips
 * tool_call / tool_use / image / reasoning blocks.
 */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
        continue;
      }
      if (!block || typeof block !== "object") continue;

      const b = block as Record<string, unknown>;
      if (typeof b.text === "string") {
        parts.push(b.text);
        continue;
      }
      if (typeof b.content === "string") {
        parts.push(b.content);
      }
    }
    return parts.join("\n").trim();
  }

  if (content && typeof content === "object") {
    const b = content as Record<string, unknown>;
    if (typeof b.text === "string") return b.text;
    if (typeof b.content === "string") return b.content;
  }

  return "";
}
