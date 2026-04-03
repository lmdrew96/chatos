import Anthropic from "@anthropic-ai/sdk";

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
  const effectiveSystem = `${systemPrompt}${
    memoryContext ? `\n\n## Memory from previous conversations\n${memoryContext}` : ""
  }${
    claudeName
      ? `\n\n---\nYou are ${claudeName}. Respond only as yourself in a single reply. Do not write dialogue or responses attributed to any other participant.`
      : ""
  }`;

  const betas: string[] = [];
  if (mcpServers && mcpServers.length > 0) {
    betas.push("mcp-client-2025-04-04");
  }
  betas.push("pdfs-2024-09-25");
  betas.push("prompt-caching-2024-07-31");

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const requestParams = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text" as const,
        text: effectiveSystem,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
    ...(mcpServers && mcpServers.length > 0
      ? {
          mcp_servers: mcpServers.map((s) => ({
            type: "url",
            url: s.url,
            name: s.name,
          })),
        }
      : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = (client.messages as any).stream(requestParams, {
    headers: { "anthropic-beta": betas.join(",") },
    signal,
  });

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    ) {
      onToolUse?.(event.content_block.name, {});
    }
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      text += event.delta.text;
    }
  }

  return text || "…";
}
