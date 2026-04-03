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
      ? `\n\n---\nYou are ${claudeName}. Respond only as yourself in a single reply. Do not write dialogue or responses attributed to any other participant.`
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? `API error ${res.status}`);
  }

  let text = "";
  for (const block of data.content ?? []) {
    if (block.type === "tool_use") {
      onToolUse?.(block.name, block.input ?? {});
    } else if (block.type === "text") {
      text += block.text;
    }
  }

  return text || "…";
}
