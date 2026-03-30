export type McpServer = { name: string; url: string };

export async function callClaude({
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
}: {
  apiKey: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  mcpServers?: McpServer[];
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  };

  if (mcpServers && mcpServers.length > 0) {
    body.mcp_servers = mcpServers.map((s) => ({
      type: "url",
      url: s.url,
      name: s.name,
    }));
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? `API error ${res.status}`);
  }

  return data.content?.[0]?.text ?? "…";
}
