import { auth } from "@clerk/nextjs/server";

const TIMEOUT_MS = 8000;

type McpTool = { name: string; description?: string };

/**
 * Discover available tools from an MCP server via JSON-RPC (streamable HTTP transport).
 * Sends initialize + tools/list and returns the tool list.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { url: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.url?.trim()) {
      return Response.json({ error: "URL required" }, { status: 400 });
    }

    // Parse URL and extract auth token if present
    let mcpUrl: string;
    let authToken: string | null = null;
    try {
      const parsed = new URL(body.url.trim());
      authToken = parsed.searchParams.get("token");
      mcpUrl = parsed.toString();
    } catch {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      // Step 1: Initialize the MCP session
      const initRes = await fetch(mcpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "chatos-tool-discovery", version: "1.0" },
          },
        }),
        signal: controller.signal,
      });

      if (!initRes.ok) {
        return Response.json(
          { tools: [], error: `MCP server returned ${initRes.status} on initialize` },
          { status: 200 },
        );
      }

      // Extract session ID from response if present (for session-based transports)
      const sessionId = initRes.headers.get("mcp-session-id");
      const toolHeaders = { ...headers };
      if (sessionId) {
        toolHeaders["mcp-session-id"] = sessionId;
      }

      // Step 2: List tools
      const toolsRes = await fetch(mcpUrl, {
        method: "POST",
        headers: toolHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });

      if (!toolsRes.ok) {
        return Response.json(
          { tools: [], error: `MCP server returned ${toolsRes.status} on tools/list` },
          { status: 200 },
        );
      }

      const toolsData = await toolsRes.json();
      const tools: McpTool[] = (toolsData.result?.tools ?? []).map(
        (t: { name: string; description?: string }) => ({
          name: t.name,
          description: t.description ?? "",
        }),
      );

      return Response.json({ tools });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      return Response.json(
        { tools: [], error: "MCP server did not respond in time" },
        { status: 200 },
      );
    }
    return Response.json(
      { tools: [], error: e.message ?? "Failed to discover tools" },
      { status: 200 },
    );
  }
}
