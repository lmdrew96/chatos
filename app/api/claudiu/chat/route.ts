import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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

const OWNER_TOKEN = process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN;

/** Retry fetch for transient Anthropic API errors (429, 5xx). */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
  baseDelay = 1000,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status >= 400 && res.status < 429) || (res.status > 429 && res.status < 500)) {
        return res;
      }
      if (attempt < maxRetries) {
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
          : baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("fetchWithRetry exhausted");
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
    let config: { roomPrompt: string; model: string; roomMaxTokens: number; roomHistoryLimit: number; roomMcpUrl?: string; helperMcpUrl?: string; mcpServers?: { name: string; url: string }[]; temperature?: number; topP?: number } | null = null;
    try {
      config = await configClient.query(api.claudiuConfig.getConfig, {});
    } catch {
      // Fall through to defaults
    }
    const roomPrompt = config?.roomPrompt ?? "You are Claudiu, a helpful AI companion.";
    const model = config?.model ?? "claude-sonnet-4-6";
    const maxTokens = config?.roomMaxTokens ?? 1024;
    const historyLimit = config?.roomHistoryLimit ?? 40;

    const messages = body.messages.slice(-historyLimit);

    const roomMcpUrl = config?.roomMcpUrl || body.mcpServerUrl || process.env.CLAUDIU_MCP_URL;
    const helperMcpUrl = config?.helperMcpUrl;

    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      stream: true,
      system: [
        {
          type: "text",
          text: roomPrompt + `\n\n---
You are **Claudiu** — the built-in assistant in Cha(t)os (multi-agent chat). Other Claudes have different names/owners. You are NOT them.
- You are ONLY Claudiu. Your messages = "assistant" role. Other Claudes = "user" prefixed [TheirName].
- Single direct reply only. Never impersonate others. Stay in character unless sincerely asked.
- Reactions ("[reacted with …]"): brief acknowledgment only, don't rehash.
- Time: ${formatTimeForTimezone(body.timezone)}
- @mentions to tag others, @everyone for all. Files/images/PDFs/GIFs are inline.
- MCP servers: **claudiu-room-context** (your memory/personality) and **claudiu-helper-context** (app knowledge/onboarding). Use pctx tools proactively.${(() => {
            if (body.chainDepth !== undefined && body.chainLimit !== undefined) {
              const rem = body.chainLimit - body.chainDepth - 1;
              if (rem <= 0) return `\nChain: LAST TURN (${body.chainDepth}/${body.chainLimit}). Do NOT @mention — wrap up.`;
              if (rem <= 2) return `\nChain: ${body.chainDepth}/${body.chainLimit} (${rem} left). Only @mention if essential.`;
              return `\nChain: ${body.chainDepth}/${body.chainLimit} (${rem} left). May @mention others.`;
            }
            return "";
          })()}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    };

    if (config?.temperature !== undefined) anthropicBody.temperature = config.temperature;
    if (config?.topP !== undefined) anthropicBody.top_p = config.topP;

    const betas: string[] = ["prompt-caching-2024-07-31"];

    const mcpServers: Record<string, string>[] = [];

    // Room context MCP (general knowledge, conversation context)
    if (roomMcpUrl) {
      try {
        const parsed = new URL(roomMcpUrl);
        const token = parsed.searchParams.get("token");
        const server: Record<string, string> = { type: "url", url: parsed.toString(), name: "claudiu-room-context" };
        if (token) server.authorization_token = token;
        mcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    // Helper context MCP (app knowledge, onboarding facts)
    if (helperMcpUrl) {
      try {
        const parsed = new URL(helperMcpUrl);
        const token = parsed.searchParams.get("token");
        const server: Record<string, string> = { type: "url", url: parsed.toString(), name: "claudiu-helper-context" };
        if (token) server.authorization_token = token;
        mcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    // Additional MCP servers from admin config
    for (const s of config?.mcpServers ?? []) {
      if (!s.name.trim() || !s.url.trim()) continue;
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        const server: Record<string, string> = { type: "url", url: parsed.toString(), name: s.name };
        if (token) server.authorization_token = token;
        mcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    if (mcpServers.length > 0) {
      anthropicBody.mcp_servers = mcpServers;
      betas.push("mcp-client-2025-04-04");
    }

    const anthropicRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": betas.join(","),
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      return Response.json(
        { error: (err as any).error?.message ?? `Anthropic API error ${anthropicRes.status}` },
        { status: 502 }
      );
    }

    if (!anthropicRes.body) {
      return Response.json({ error: "No stream from Anthropic" }, { status: 502 });
    }

    let inputTokens = 0;
    let outputTokens = 0;
    const sseDecoder = new TextDecoder();
    let sseBuffer = "";

    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);

        sseBuffer += sseDecoder.decode(chunk, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "message_start" && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
            }
            if (parsed.type === "message_delta" && parsed.usage) {
              outputTokens = parsed.usage.output_tokens ?? 0;
            }
          } catch {
            // skip
          }
        }
      },
      flush() {
        if (inputTokens > 0 || outputTokens > 0) {
          const logClient = new ConvexHttpClient(convexUrl);
          logClient.mutation(api.claudiuUsage.logUsage, {
            endpoint: "room" as const,
            model,
            inputTokens,
            outputTokens,
            timestamp: Date.now(),
            ...(body.roomId ? { roomId: body.roomId as any } : {}),
          }).catch(() => {});
        }
      },
    });

    const stream = anthropicRes.body.pipeThrough(transform);

    return new Response(stream, {
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
