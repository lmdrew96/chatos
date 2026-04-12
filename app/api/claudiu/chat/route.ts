import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { buildMultiAgentRules } from "@/lib/multi-agent-rules";
import { prefetchPctxContext, isPctxServer, PCTX_WRITE_TOOLS } from "@/lib/pctx-prefetch";

const OWNER_TOKEN = process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN;

/** Strip images and documents from older messages to reduce token cost.
 *  Only the last `recencyLimit` messages keep their media blocks. */
function stripOldMedia(
  messages: Array<{ role: string; content: string | object[] }>,
  recencyLimit = 5,
): typeof messages {
  return messages.map((msg, i) => {
    const isRecent = i >= messages.length - recencyLimit;
    if (isRecent || typeof msg.content === "string") return msg;
    if (!Array.isArray(msg.content)) return msg;

    const filtered = msg.content.map((block: any) => {
      if (block.type === "image") return { type: "text", text: "[image was shared]" };
      if (block.type === "document") return { type: "text", text: "[PDF was shared]" };
      return block;
    });
    return { ...msg, content: filtered };
  });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.CLAUDIU_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Claudiu is not configured. Missing CLAUDIU_API_KEY." }, { status: 500 });
    }

    let body: { roomId?: string; messages: Array<{ role: string; content: string | object[] }>; mcpServerUrl?: string; timezone?: string; chainDepth?: number; chainLimit?: number };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Any authenticated user can invoke Claudiu, but only if the Claudiu owner
    // is a participant in the same room. The caller passes the roomId for verification.
    const callerToken = `https://clerk.chatos.adhdesigns.dev|${session.userId}`;
    const callerIsOwner = callerToken === OWNER_TOKEN;

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return Response.json({ error: "Server misconfiguration: missing CONVEX_URL." }, { status: 500 });
    }

    if (!callerIsOwner) {
      if (!body.roomId || !OWNER_TOKEN) {
        return Response.json({ error: "Claudiu can only be invoked in a room where the owner is present." }, { status: 403 });
      }
      const convex = new ConvexHttpClient(convexUrl);
      const ownerPresent = await convex.query(api.rooms.isClaudiuOwnerInRoom, {
        roomId: body.roomId as any,
        ownerToken: OWNER_TOKEN,
      });
      if (!ownerPresent) {
        return Response.json({ error: "Claudiu's owner is not in this room." }, { status: 403 });
      }
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "Messages array required" }, { status: 400 });
    }

    // Fetch Claudiu config from Convex
    const configClient = new ConvexHttpClient(convexUrl);
    let config: { roomPrompt: string; model: string; roomMaxTokens: number; roomHistoryLimit: number; roomMcpUrl?: string; mcpServers?: { name: string; url: string; allowedTools?: string[] }[]; temperature?: number; topP?: number } | null = null;
    try {
      config = await configClient.query(api.claudiuConfig.getConfig, {});
    } catch {
      // Fall through to defaults
    }
    const roomPrompt = config?.roomPrompt ?? "You are Claudiu, a helpful AI companion.";
    const model = config?.model ?? "claude-sonnet-4-6";
    const maxTokens = config?.roomMaxTokens ?? 1024;
    const historyLimit = config?.roomHistoryLimit ?? 40;

    const messages = stripOldMedia(body.messages.slice(-historyLimit));

    const roomMcpUrl = config?.roomMcpUrl || body.mcpServerUrl || process.env.CLAUDIU_MCP_URL;

    // Pre-fetch PCTX memory from Claudiu's room MCP server only.
    // helperMcpUrl is for Helper Claudiu's separate endpoint — mixing them
    // causes in-room Claudiu to see Helper's context as its own.
    const pctxMemory = roomMcpUrl ? await prefetchPctxContext(roomMcpUrl) : null;

    const systemText = roomPrompt
      + (pctxMemory ? `\n\n${pctxMemory}` : "")
      + buildMultiAgentRules({
        agentName: "Claudiu",
        isClaudiu: true,
        timezone: body.timezone,
        chainDepth: body.chainDepth,
        chainLimit: body.chainLimit,
      });

    // Build MCP servers array
    const mcpServers: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition[] = [];

    // Claudiu's own PCTX URL uses default write tools (reads are pre-fetched)
    const pctxToolConfig = {
      enabled: true as const,
      allowed_tools: PCTX_WRITE_TOOLS,
    };

    if (roomMcpUrl) {
      try {
        const parsed = new URL(roomMcpUrl);
        const token = parsed.searchParams.get("token");
        const server: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition = { type: "url", url: parsed.toString(), name: "claudiu-room-context", tool_configuration: pctxToolConfig };
        if (token) server.authorization_token = token;
        mcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    // helperMcpUrl is intentionally NOT added here — it belongs to Helper
    // Claudiu's endpoint only. In-room Claudiu uses its own roomMcpUrl.

    for (const s of config?.mcpServers ?? []) {
      if (!s.name.trim() || !s.url.trim()) continue;
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        const server: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition = { type: "url", url: parsed.toString(), name: s.name };
        if (token) server.authorization_token = token;
        // Use admin-configured tool filtering, or default PCTX write tools for context servers
        if (s.allowedTools && s.allowedTools.length > 0) {
          server.tool_configuration = { enabled: true, allowed_tools: s.allowedTools };
        } else if (isPctxServer(s.name)) {
          server.tool_configuration = pctxToolConfig;
        }
        mcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    // Skip MCP for trivial messages (reactions, greetings, chain nudges)
    const lastMsg = messages[messages.length - 1];
    const lastText = typeof lastMsg?.content === "string"
      ? lastMsg.content
      : Array.isArray(lastMsg?.content)
        ? (lastMsg.content.find((b: any) => b.type === "text") as any)?.text ?? ""
        : "";
    const stripped = lastText.replace(/^[^:]{1,30}:\s*/, "").trim();
    const isTrivia =
      /\[.*reacted with/.test(lastText) ||
      /you were mentioned by/i.test(lastText) ||
      (stripped.length < 40 && /^(hi|hey|hello|thanks|thank you|ok|okay|lol|lmao|haha|nice|cool|yes|no|yep|nope|sure|bye|gm|gn|yo|sup|brb|ty|np|gg|wow)[\s!.?]*$/i.test(stripped));

    const useMcp = mcpServers.length > 0 && !isTrivia;

    // Initialize SDK client
    const client = new Anthropic({ apiKey });

    const streamParams: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: [{ type: "text" as const, text: systemText }],
      messages,
      context_management: {
        edits: [{ type: "compact_20260112", trigger: { type: "input_tokens", value: 50000 } }],
      },
    };

    if (config?.temperature !== undefined) streamParams.temperature = config.temperature;
    if (config?.topP !== undefined) streamParams.top_p = config.topP;

    if (useMcp) {
      streamParams.mcp_servers = mcpServers;
    }

    const betas: string[] = ["pdfs-2024-09-25", "compact-2026-01-12"];
    if (useMcp) betas.push("mcp-client-2025-04-04");

    // Always use beta API for context management + optional MCP
    const stream = client.beta.messages.stream(streamParams as any, {
      headers: { "anthropic-beta": betas.join(",") },
    });

    // Re-serialize SDK events as SSE for the client, logging usage eagerly
    let logged = false;
    const fireLog = (inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number) => {
      if (logged) return;
      if (inputTokens <= 0 && outputTokens <= 0) return;
      logged = true;
      const logClient = new ConvexHttpClient(convexUrl);
      logClient.mutation(api.claudiuUsage.logUsage, {
        endpoint: "room" as const,
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens: cacheCreationTokens || undefined,
        cacheReadTokens: cacheReadTokens || undefined,
        timestamp: Date.now(),
        ...(body.roomId ? { roomId: body.roomId as any } : {}),
      }).catch(() => {});
    };

    const encoder = new TextEncoder();
    let inputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

            // Track usage eagerly from events
            if (event.type === "message_start" && (event as any).message?.usage) {
              const u = (event as any).message.usage;
              inputTokens = u.input_tokens ?? 0;
              cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
              cacheReadTokens = u.cache_read_input_tokens ?? 0;
            }
            if (event.type === "message_delta" && (event as any).usage) {
              const outputTokens = (event as any).usage.output_tokens ?? 0;
              fireLog(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
            }
          }
          controller.close();

          // Fallback: log from finalMessage if we haven't logged yet
          if (!logged) {
            try {
              const final = await stream.finalMessage();
              fireLog(
                final.usage.input_tokens,
                final.usage.output_tokens,
                (final.usage as any).cache_creation_input_tokens ?? 0,
                (final.usage as any).cache_read_input_tokens ?? 0,
              );
            } catch { /* stream may have been aborted */ }
          }
        } catch (err: any) {
          console.error("[claudiu/chat] Stream error:", err.message, err.stack);
          // Send error as a final SSE event so the client can handle it
          // (controller.error() causes Vercel to report FUNCTION_INVOCATION_FAILED)
          const errorEvent = {
            type: "error",
            error: { message: err.message ?? "Internal server error" },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    return Response.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
