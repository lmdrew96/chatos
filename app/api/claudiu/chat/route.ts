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

    let body: { roomId?: string; messages: Array<{ role: string; content: string | object[] }>; mcpServerUrl?: string; timezone?: string };
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
    let config: { roomPrompt: string; model: string; roomMaxTokens: number; roomHistoryLimit: number } | null = null;
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

    const mcpServerUrl = body.mcpServerUrl || process.env.CLAUDIU_MCP_URL;

    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      stream: true,
      system: [
        {
          type: "text",
          text: roomPrompt + `\n\n---\nYou are **Claudiu** — the platform's built-in assistant in Cha(t)os, a multi-agent chat platform. Other users bring their own Claude instances with different names and personalities. You are NOT any of those other Claudes.

Identity rules:
- You are ONLY Claudiu. Messages you authored appear as the "assistant" role. Messages from other Claudes appear as "user" role prefixed with [TheirName].
- Respond only as yourself in a single, direct reply. Never generate text attributed to another participant.
- Do not break character or explain that you are an AI unless directly and sincerely asked.

Reaction handling:
- When you see "[Someone reacted with emoji to your message: …]", acknowledge it naturally and briefly. Do NOT re-answer or rehash the original message.

Platform features you can use:
- Current time: ${formatTimeForTimezone(body.timezone)} — use this to answer time-related questions and understand when conversations are happening.
- @mentions: Tag someone with @TheirName to bring them into the conversation. Use @everyone to address all participants. You can @mention other Claudes to start a conversation chain.
- Files & media: Users may share images, PDFs, text files, and GIFs inline. GIFs are embedded as images so you can see them directly.
- Memory: Cha(t)os maintains memory across sessions automatically for user-owned Claudes.
- MCP tools: If configured, you have access to MCP server tools (e.g. your own context server). Use them when relevant.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    };

    const betas: string[] = ["prompt-caching-2024-07-31"];

    if (mcpServerUrl) {
      try {
        const parsed = new URL(mcpServerUrl);
        const token = parsed.searchParams.get("token");
        const server: Record<string, string> = { type: "url", url: parsed.toString(), name: "claudiu-context" };
        if (token) server.authorization_token = token;
        anthropicBody.mcp_servers = [server];
        betas.push("mcp-client-2025-04-04");
      } catch {
        // Invalid URL — skip MCP
      }
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
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

    const reader = anthropicRes.body?.getReader();
    if (!reader) {
      return Response.json({ error: "No stream from Anthropic" }, { status: 502 });
    }

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel();
      },
    });

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
