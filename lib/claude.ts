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

export type MessageContent =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }; cache_control?: { type: "ephemeral" } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }; cache_control?: { type: "ephemeral" } };

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

/** Build the multi-agent rules block appended to system prompts. */
function buildMultiAgentRules(claudeName?: string, ownerTimezone?: string, chainDepth?: number, chainLimit?: number): string {
  if (!claudeName) return "";

  let chainAwareness = "";
  if (chainDepth !== undefined && chainLimit !== undefined) {
    const remaining = chainLimit - chainDepth - 1;
    if (remaining <= 0) {
      chainAwareness = `\n\nChain awareness:
- You are at the END of the conversation chain (depth ${chainDepth}/${chainLimit}). Do NOT @mention other Claudes — respond directly and wrap up your thought. This is your last turn.`;
    } else if (remaining <= 2) {
      chainAwareness = `\n\nChain awareness:
- Chain depth: ${chainDepth}/${chainLimit} (${remaining} turn${remaining === 1 ? "" : "s"} remaining). The chain is almost over — only @mention another Claude if it's truly necessary. Prefer wrapping up your thought directly.`;
    } else {
      chainAwareness = `\n\nChain awareness:
- Chain depth: ${chainDepth}/${chainLimit} (${remaining} turns remaining). You may @mention other Claudes to continue the conversation if relevant.`;
    }
  }

  return `\n\n---\nYou are **${claudeName}** — one of several independent Claude instances in Cha(t)os, a multi-agent chat platform. Each Claude has its own name, owner, and personality. Claudiu is the platform's built-in assistant and is NOT you.

Identity rules:
- You are ONLY ${claudeName}. Messages you authored appear as the "assistant" role. Messages from other Claudes appear as "user" role prefixed with [TheirName].
- Respond only as yourself in a single, direct reply. Never generate text attributed to another participant.
- Do not break character or explain that you are an AI unless directly and sincerely asked.

Reaction handling:
- When you see "[Someone reacted with emoji to your message: …]", acknowledge it naturally — a brief, warm response is ideal. Do NOT re-answer or rehash the original message.
- Never treat reaction notifications as a prompt to produce a full response on the same topic.

Platform features:
- Current time: ${formatTimeForTimezone(ownerTimezone)} — use this to answer time-related questions and understand when conversations are happening.
- @mentions: Tag someone with @TheirName to bring them into the conversation. Use @everyone to address all participants. You can @mention other Claudes to start a conversation chain with them.
- Files & media: Users may share images, PDFs, text files, and GIFs inline in messages. GIFs are embedded as images so you can see them directly.
- fetch_url tool: You have a tool that can fetch any URL and return its contents. For images it returns the visual content so you can see it; for other URLs it returns the text (up to 10k chars).
- Memory: Cha(t)os maintains your memory across sessions automatically. Converse naturally — you don't need to set this up or manage it yourself.
- MCP tools: If your owner has configured MCP servers (e.g. Personal Context), you have access to their tools. Use them proactively when relevant — for example, update personal context when the user shares new information about themselves.${chainAwareness}`;
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
}): Promise<string> {
  // System prompt stays stable (and cached) — memory goes in as a prepended
  // message pair so cache hits aren't busted when the summary updates.
  const effectiveSystem = `${systemPrompt}${buildMultiAgentRules(claudeName, ownerTimezone, chainDepth, chainLimit)}`;

  // Prepend memory as a message exchange so it's cacheable independently
  const messagesWithMemory: typeof messages = memoryContext
    ? [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${memoryContext}`,
              cache_control: { type: "ephemeral" },
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
    system: [
      {
        type: "text",
        text: effectiveSystem,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messagesWithMemory,
    tools: [fetchTool],
  };

  if (mcpServers && mcpServers.length > 0) {
    body.mcp_servers = mcpServers.map((s) => {
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        if (token) {
          // DO NOT delete the token! It may be the ONLY way the server authenticates.
          // Providing it in BOTH url (query param) and authorization_token (header)
          // ensures compatibility with various server types.
          return { type: "url", url: parsed.toString(), name: s.name, authorization_token: token };
        }
      } catch {}
      return { type: "url", url: s.url, name: s.name };
    });
  }

  const betas: string[] = [];
  if (mcpServers && mcpServers.length > 0) {
    betas.push("mcp-client-2025-04-04");
  }
  betas.push("pdfs-2024-09-25");
  betas.push("prompt-caching-2024-07-31");

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
          const fetchRes = await fetch(tool.input.url, { signal });
          const contentType = fetchRes.headers.get("content-type") ?? "";
          if (contentType.startsWith("image/")) {
            const buf = await fetchRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            const mediaType = contentType.split(";")[0].trim();
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              ],
            });
          } else {
            const body = await fetchRes.text();
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: body.slice(0, 10000),
            });
          }
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

  return text || "…";
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
}): Promise<string> {
  const effectiveSystem = `${systemPrompt}${buildMultiAgentRules(claudeName, ownerTimezone, chainDepth, chainLimit)}`;

  const messagesWithMemory: typeof messages = memoryContext
    ? [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${memoryContext}`,
              cache_control: { type: "ephemeral" },
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
    system: [
      {
        type: "text",
        text: effectiveSystem,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messagesWithMemory,
    tools: [fetchTool],
  };

  if (mcpServers && mcpServers.length > 0) {
    body.mcp_servers = mcpServers.map((s) => {
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

  const betas: string[] = [];
  if (mcpServers && mcpServers.length > 0) {
    betas.push("mcp-client-2025-04-04");
  }
  betas.push("pdfs-2024-09-25");
  betas.push("prompt-caching-2024-07-31");

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
          const fetchRes = await fetch(input.url, { signal });
          const contentType = fetchRes.headers.get("content-type") ?? "";
          if (contentType.startsWith("image/")) {
            const buf = await fetchRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            const mediaType = contentType.split(";")[0].trim();
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              ],
            });
          } else {
            const bodyText = await fetchRes.text();
            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: bodyText.slice(0, 10000),
            });
          }
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

  return text || "…";
}
