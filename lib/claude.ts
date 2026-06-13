export type McpServer = { name: string; url: string; allowedTools?: string[] };

export type MessageContent =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }; cache_control?: { type: "ephemeral" } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }; cache_control?: { type: "ephemeral" } };

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

/** Token estimation for history budget trimming (~4 chars/token). */
export function estimateTokens(
  content: string | MessageContent[]
): number {
  if (typeof content === "string") return Math.ceil(content.length / 4);
  return content.reduce((acc, block) => {
    if (block.type === "text") return acc + Math.ceil(block.text.length / 4);
    if (block.type === "image") return acc + 1000;
    if (block.type === "document") return acc + 2000;
    return acc;
  }, 0);
}

/**
 * Call Claude through the server-side proxy (/api/claude).
 * API key never reaches the browser — the server fetches it from Convex.
 * The proxy owns context-management compaction, media-stripping, and prompt
 * caching; this is the only live call path (the old browser-direct raw-fetch
 * variants were retired — see ChaosPatch fe25fb9f).
 */
export async function callClaudeProxy({
  roomId,
  participantUserId,
  ownerTokenIdentifier,
  systemPrompt,
  messages,
  mcpServers,
  claudeName,
  memoryContext,
  timezone,
  chainDepth,
  chainLimit,
  onText,
  onToolUse,
  signal,
}: {
  roomId: string;
  participantUserId: string;
  ownerTokenIdentifier?: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName: string;
  memoryContext?: string;
  timezone?: string;
  chainDepth?: number;
  chainLimit?: number;
  onText: (accumulated: string) => void;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: TokenUsage; usedSponsor?: boolean }> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId,
      participantUserId,
      ownerTokenIdentifier,
      messages,
      systemPrompt,
      claudeName,
      mcpServers,
      memoryContext,
      timezone,
      chainDepth,
      chainLimit,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Proxy error ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No readable stream from proxy");
  const decoder = new TextDecoder();

  let text = "";
  let buffer = "";
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

  // Throttle onText calls
  let lastFlush = 0;
  const FLUSH_INTERVAL = 150;
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const flushText = () => {
    if (pendingFlush) { clearTimeout(pendingFlush); pendingFlush = null; }
    lastFlush = Date.now();
    onText(text);
  };

  const scheduleFlush = () => {
    const elapsed = Date.now() - lastFlush;
    if (elapsed >= FLUSH_INTERVAL) { flushText(); }
    else if (!pendingFlush) { pendingFlush = setTimeout(flushText, FLUSH_INTERVAL - elapsed); }
  };

  const usedSponsor = res.headers.get("X-Used-Sponsor") === "true";

  while (true) {
    const readResult = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Stream read timeout — no data received for 30s")), 30000)
      ),
    ]);
    const { done, value } = readResult;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      let event: any;
      try { event = JSON.parse(jsonStr); } catch { continue; }

      if (event.type === "error") {
        throw new Error(event.error?.message ?? "Proxy stream error");
      }

      switch (event.type) {
        case "message_start":
          if (event.message?.usage) {
            usage.inputTokens += event.message.usage.input_tokens ?? 0;
            usage.cacheCreationTokens += event.message.usage.cache_creation_input_tokens ?? 0;
            usage.cacheReadTokens += event.message.usage.cache_read_input_tokens ?? 0;
          }
          break;

        case "content_block_start":
          if (event.content_block?.type === "tool_use") {
            onToolUse?.(event.content_block.name, {});
          }
          break;

        case "content_block_delta":
          if (event.delta?.type === "text_delta") {
            text += event.delta.text;
            scheduleFlush();
          }
          break;

        case "message_delta":
          if (event.usage) {
            usage.outputTokens += event.usage.output_tokens ?? 0;
          }
          break;
      }
    }
  }

  flushText();

  return { text: text || "…", usage, ...(usedSponsor ? { usedSponsor: true } : {}) };
}
