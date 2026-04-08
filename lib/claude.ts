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
          content: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${memoryContext}`,
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
