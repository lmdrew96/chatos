export type McpServer = { name: string; url: string };

export type MessageContent = 
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

export async function callClaude({
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
  claudeName,
  signal,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  mcpServers?: McpServer[];
  claudeName?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const effectiveSystem = claudeName
    ? `${systemPrompt}\n\n---\nYou are ${claudeName}. Respond only as yourself in a single reply. Do not write dialogue or responses attributed to any other participant.`
    : systemPrompt;

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: effectiveSystem,
    messages,
  };

  if (mcpServers && mcpServers.length > 0) {
    body.mcp_servers = mcpServers.map((s) => ({
      type: "url",
      url: s.url,
      name: s.name,
    }));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  const betas = [];
  if (mcpServers && mcpServers.length > 0) {
    betas.push("mcp-client-2025-04-04");
  }
  // Enable PDF beta support
  betas.push("pdfs-2024-09-25");
  
  if (betas.length > 0) {
    headers["anthropic-beta"] = betas.join(",");
  }

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

  return data.content?.[0]?.text ?? "…";
}
