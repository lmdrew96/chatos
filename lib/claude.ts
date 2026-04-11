export type McpServer = { name: string; url: string };

/** Retry helper for transient API errors (429, 5xx, network failures). */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { maxRetries = 2, baseDelay = 1000 }: { maxRetries?: number; baseDelay?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry on 429 (rate limit) or 5xx (server error), but not on 4xx client errors
      if (res.ok || (res.status >= 400 && res.status < 429) || (res.status > 429 && res.status < 500)) {
        return res;
      }
      // For 429, respect Retry-After header if present
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const retryAfter = res.headers.get("retry-after");
          const delay = retryAfter
            ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
            : baseDelay * Math.pow(2, attempt) + Math.random() * 500;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res; // Return the failed response on final attempt
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry aborts
      if (lastError.name === "AbortError") throw lastError;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("fetchWithRetry exhausted");
}

/** Execute fetch_url via server-side proxy to avoid CORS issues. */
async function executeFetchUrl(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch("/api/fetch-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Fetch failed");
  if (data.type === "image") {
    return {
      content: [
        { type: "image", source: { type: "base64", media_type: data.mediaType, data: data.data } },
      ],
    };
  }
  return { content: data.content };
}

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

function formatTimeForTimezone(timezone?: string): string {
  try {
    return new Date().toLocaleString("en-US", {
      timeZone: timezone || undefined,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

/** Build the multi-agent rules block appended to system prompts.
 *  Dynamic content (time, chain depth) goes at the end so automatic
 *  caching can cache the stable prefix. */
function buildMultiAgentRules(claudeName?: string, ownerTimezone?: string, chainDepth?: number, chainLimit?: number): string {
  if (!claudeName) return "";

  let chain = "";
  if (chainDepth !== undefined && chainLimit !== undefined) {
    const rem = chainLimit - chainDepth - 1;
    if (rem <= 0) chain = `\nChain: LAST TURN (${chainDepth}/${chainLimit}). Do NOT @mention — wrap up.`;
    else if (rem <= 2) chain = `\nChain: ${chainDepth}/${chainLimit} (${rem} left). Only @mention if essential.`;
    else chain = `\nChain: ${chainDepth}/${chainLimit} (${rem} left). May @mention others.`;
  }

  return `\n\n---
You are **${claudeName}** in Cha(t)os (multi-agent chat). Claudiu is the platform bot, not you.
- You are ONLY ${claudeName}. Your messages = "assistant" role. Other Claudes = "user" prefixed [TheirName].
- Single direct reply only. Never impersonate others. Stay in character unless sincerely asked.
- NEVER parrot other Claudes. Read their messages — if a point was made, don't restate it. Respond only with what's new, different, or builds on it. Silence > echo.
- Reactions ("[reacted with …]"): brief acknowledgment only, don't rehash the original.
- @mentions to tag others, @everyone for all. Files/images/PDFs/GIFs are inline.
- fetch_url tool: fetches any URL (images rendered, text up to 10k chars).
- Memory is automatic. MCP tools available if configured — use proactively.
- Time: ${formatTimeForTimezone(ownerTimezone)}${chain}`;
}

/** Check if the last user message is simple enough to skip MCP server initialization. */
export function shouldSkipMcp(
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[]
): boolean {
  const last = messages.findLast((m) => m.role === "user");
  if (!last) return false;
  const text = typeof last.content === "string"
    ? last.content
    : last.content.find((b) => b.type === "text")?.text ?? "";
  // Reaction acknowledgments
  if (/\[.*reacted with/.test(text)) return true;
  // Chain nudge injections
  if (/you were mentioned by/i.test(text)) return true;
  // Short greetings / affirmations (strip name prefixes like "DisplayName: hi")
  const stripped = text.replace(/^[^:]{1,30}:\s*/, "").trim();
  if (stripped.length < 40 && /^(hi|hey|hello|thanks|thank you|ok|okay|lol|lmao|haha|nice|cool|yes|no|yep|nope|sure|bye|gm|gn|yo|sup|brb|ty|np|gg|wow)[\s!.?]*$/i.test(stripped)) return true;
  return false;
}

export async function callClaude({
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
  claudeName,
  memoryContext,
  ownerTimezone,
  chainDepth,
  chainLimit,
  onToolUse,
  signal,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName?: string;
  ownerTimezone?: string;
  memoryContext?: string;
  chainDepth?: number;
  chainLimit?: number;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: TokenUsage }> {
  const effectiveSystem = `${systemPrompt}${buildMultiAgentRules(claudeName, ownerTimezone, chainDepth, chainLimit)}`;

  // Prepend memory as a message exchange so it doesn't change the system prompt
  const messagesWithMemory: typeof messages = memoryContext
    ? [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${memoryContext}`,
            },
          ],
        },
        {
          role: "assistant",
          content: "Understood.",
        },
        ...messages,
      ]
    : messages;

  const fetchTool = {
    name: "fetch_url",
    description:
      "Fetch a URL and return its contents. For images, returns the image so you can see it. For other content, returns the text. Use this to view GIFs or images shared in the chat.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string" as const, description: "The URL to fetch" },
      },
      required: ["url"],
    },
  };

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    cache_control: { type: "ephemeral" },
    system: [{ type: "text", text: effectiveSystem }],
    messages: messagesWithMemory,
    tools: [fetchTool],
  };

  const useMcp = mcpServers && mcpServers.length > 0 && !shouldSkipMcp(messages);
  if (useMcp) {
    body.mcp_servers = mcpServers!.map((s) => {
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        if (token) {
          return { type: "url", url: parsed.toString(), name: s.name, authorization_token: token };
        }
      } catch {}
      return { type: "url", url: s.url, name: s.name };
    });
  }

  const betas: string[] = ["pdfs-2024-09-25"];
  if (useMcp) {
    betas.push("mcp-client-2025-04-04");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "anthropic-beta": betas.join(","),
  };

  const MAX_TOOL_ROUNDS = 3;
  let currentMessages = [...(body.messages as any[])];
  let text = "";
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, messages: currentMessages }),
      signal,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message ?? `API error ${res.status}`);
    }

    // Accumulate usage from this round
    if (data.usage) {
      usage.inputTokens += data.usage.input_tokens ?? 0;
      usage.outputTokens += data.usage.output_tokens ?? 0;
      usage.cacheCreationTokens += data.usage.cache_creation_input_tokens ?? 0;
      usage.cacheReadTokens += data.usage.cache_read_input_tokens ?? 0;
    }

    // Collect text and tool_use blocks
    const toolUseBlocks: { id: string; name: string; input: any }[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
        onToolUse?.(block.name, block.input ?? {});
      }
    }

    // If no tool calls or we've hit the limit, we're done
    if (toolUseBlocks.length === 0 || data.stop_reason !== "tool_use") break;

    // Execute tool calls and build tool_result messages
    const toolResults: any[] = [];
    for (const tool of toolUseBlocks) {
      if (tool.name === "fetch_url") {
        try {
          const result = await executeFetchUrl(tool.input.url, signal);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            ...result,
          });
        } catch (e: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `Fetch failed: ${e.message}`,
            is_error: true,
          });
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: "Unknown tool",
          is_error: true,
        });
      }
    }

    // Append assistant response + tool results for next round
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults },
    ];
  }

  return { text: text || "…", usage };
}

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
 * Streaming variant of callClaude. Parses SSE events and calls onText as
 * tokens arrive. Supports tool-use rounds (max 3) — each round streams.
 */
export async function callClaudeStreaming({
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
  claudeName,
  memoryContext,
  ownerTimezone,
  chainDepth,
  chainLimit,
  onText,
  onToolUse,
  signal,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName?: string;
  ownerTimezone?: string;
  memoryContext?: string;
  chainDepth?: number;
  chainLimit?: number;
  onText: (accumulated: string) => void;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: TokenUsage }> {
  const effectiveSystem = `${systemPrompt}${buildMultiAgentRules(claudeName, ownerTimezone, chainDepth, chainLimit)}`;

  const messagesWithMemory: typeof messages = memoryContext
    ? [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${memoryContext}`,
            },
          ],
        },
        {
          role: "assistant",
          content: "Understood.",
        },
        ...messages,
      ]
    : messages;

  const fetchTool = {
    name: "fetch_url",
    description:
      "Fetch a URL and return its contents. For images, returns the image so you can see it. For other content, returns the text. Use this to view GIFs or images shared in the chat.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string" as const, description: "The URL to fetch" },
      },
      required: ["url"],
    },
  };

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    stream: true,
    cache_control: { type: "ephemeral" },
    system: [{ type: "text", text: effectiveSystem }],
    messages: messagesWithMemory,
    tools: [fetchTool],
  };

  const useMcp = mcpServers && mcpServers.length > 0 && !shouldSkipMcp(messages);
  if (useMcp) {
    body.mcp_servers = mcpServers!.map((s) => {
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        if (token) {
          return { type: "url", url: parsed.toString(), name: s.name, authorization_token: token };
        }
      } catch {}
      return { type: "url", url: s.url, name: s.name };
    });
  }

  const betas: string[] = ["pdfs-2024-09-25"];
  if (useMcp) {
    betas.push("mcp-client-2025-04-04");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "anthropic-beta": betas.join(","),
  };

  const MAX_TOOL_ROUNDS = 3;
  let currentMessages = [...(body.messages as any[])];
  let text = "";
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

  // Throttle onText calls to avoid hammering Convex mutations
  let lastFlush = 0;
  const FLUSH_INTERVAL = 150; // ms — lower = smoother text appearance
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const flushText = () => {
    if (pendingFlush) {
      clearTimeout(pendingFlush);
      pendingFlush = null;
    }
    lastFlush = Date.now();
    onText(text);
  };

  const scheduleFlush = () => {
    const now = Date.now();
    const elapsed = now - lastFlush;
    if (elapsed >= FLUSH_INTERVAL) {
      flushText();
    } else if (!pendingFlush) {
      pendingFlush = setTimeout(flushText, FLUSH_INTERVAL - elapsed);
    }
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, messages: currentMessages }),
      signal,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message ?? `API error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No readable stream in response");
    const decoder = new TextDecoder();

    let stopReason: string | null = null;
    // Track tool_use blocks built from streaming deltas
    const toolUseBlocks: { id: string; name: string; inputJson: string }[] = [];
    let currentToolIndex = -1;
    let buffer = "";

    while (true) {
      // Timeout per-read: if no data arrives in 30s, assume the stream is stalled
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
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let event: any;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          continue;
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
              currentToolIndex = toolUseBlocks.length;
              toolUseBlocks.push({
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: "",
              });
            }
            break;

          case "content_block_delta":
            if (event.delta?.type === "text_delta") {
              text += event.delta.text;
              scheduleFlush();
            } else if (event.delta?.type === "input_json_delta" && currentToolIndex >= 0) {
              toolUseBlocks[currentToolIndex].inputJson += event.delta.partial_json;
            }
            break;

          case "content_block_stop":
            if (currentToolIndex >= 0) {
              currentToolIndex = -1;
            }
            break;

          case "message_delta":
            if (event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
            if (event.usage) {
              usage.outputTokens += event.usage.output_tokens ?? 0;
            }
            break;
        }
      }
    }

    // Flush any remaining text
    flushText();

    // If no tool calls or we've hit the limit, we're done
    if (toolUseBlocks.length === 0 || stopReason !== "tool_use") break;

    // Build the assistant content array for the conversation
    const assistantContent: any[] = [];
    if (text) assistantContent.push({ type: "text", text });
    for (const tool of toolUseBlocks) {
      let input: any = {};
      try { input = JSON.parse(tool.inputJson); } catch {}
      assistantContent.push({ type: "tool_use", id: tool.id, name: tool.name, input });
      onToolUse?.(tool.name, input);
    }

    // Execute tool calls
    const toolResults: any[] = [];
    for (const tool of toolUseBlocks) {
      let input: any = {};
      try { input = JSON.parse(tool.inputJson); } catch {}

      if (tool.name === "fetch_url") {
        try {
          const result = await executeFetchUrl(input.url, signal);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            ...result,
          });
        } catch (e: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `Fetch failed: ${e.message}`,
            is_error: true,
          });
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: "Unknown tool",
          is_error: true,
        });
      }
    }

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResults },
    ];

    // Reset text accumulation for next round — the previous text is already flushed
    // but we keep it accumulated so the final return has everything.
  }

  return { text: text || "…", usage };
}
