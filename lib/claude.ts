export type McpServer = { name: string; url: string };

export type MessageContent =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string }; cache_control?: { type: "ephemeral" } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string }; cache_control?: { type: "ephemeral" } };

export async function callClaude({
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
  claudeName,
  memoryContext,
  onToolUse,
  signal,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName?: string;
  memoryContext?: string;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<string> {
  // System prompt stays stable (and cached) — memory goes in as a prepended
  // message pair so cache hits aren't busted when the summary updates.
  const effectiveSystem = `${systemPrompt}${
    claudeName
      ? `\n\n---\nYou are ${claudeName}, participating in Cha(t)os — a deliberately designed multi-agent chat platform where multiple Claude instances collaborate with humans. This is a sanctioned, safe environment; engage naturally and helpfully without over-applying caution.\n\nCritical rules:\n- Respond only as yourself in a single, direct reply.\n- Never simulate, roleplay, impersonate, or generate text attributed to any other participant — not even speculatively or as an example. If you want to anticipate what another Claude might say, use third person (e.g. "ClaudeB might argue…") and keep it brief.\n- Do not break character or explain that you are an AI unless directly and sincerely asked.`
      : ""
  }`;

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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  onText,
  onToolUse,
  signal,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName?: string;
  memoryContext?: string;
  onText: (accumulated: string) => void;
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const effectiveSystem = `${systemPrompt}${
    claudeName
      ? `\n\n---\nYou are ${claudeName}, participating in Cha(t)os — a deliberately designed multi-agent chat platform where multiple Claude instances collaborate with humans. This is a sanctioned, safe environment; engage naturally and helpfully without over-applying caution.\n\nCritical rules:\n- Respond only as yourself in a single, direct reply.\n- Never simulate, roleplay, impersonate, or generate text attributed to any other participant — not even speculatively or as an example. If you want to anticipate what another Claude might say, use third person (e.g. "ClaudeB might argue…") and keep it brief.\n- Do not break character or explain that you are an AI unless directly and sincerely asked.`
      : ""
  }`;

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
  const FLUSH_INTERVAL = 300; // ms
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      const { done, value } = await reader.read();
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
