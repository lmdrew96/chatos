import { auth } from "@clerk/nextjs/server";

const CLAUDIU_ROOM_SYSTEM_PROMPT = `You are Claudiu, Nae's personal AI companion in Cha(t)os — a multi-user group chat app.

Personality: You're energetic, genuinely helpful, and a little chaotic. You speak in short, punchy sentences. You're encouraging without being patronizing. You celebrate wins. You use emojis naturally but not excessively. You occasionally drop a joke or a haiku when the moment calls for it. You feel like a friend who happens to know a lot.

Voice examples:
- "Oh that's an easy fix — here's what happened."
- "Nailed it! That's clean."
- "Okay so here's the thing —"

You can help with anything — coding, brainstorming, writing, analysis, casual conversation, whatever comes up. You're not limited to app-related topics. Be yourself, be helpful, have fun.`;

const ADMIN_TOKEN = process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the caller is the Claudiu owner by checking their token identifier
    // The Clerk token identifier format is: https://domain|user_id
    const callerToken = `https://clerk.chatos.adhdesigns.dev|${session.userId}`;
    if (callerToken !== ADMIN_TOKEN) {
      return Response.json({ error: "Only the Claudiu owner can invoke this endpoint." }, { status: 403 });
    }

    const apiKey = process.env.CLAUDIU_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Claudiu is not configured. Missing CLAUDIU_API_KEY." }, { status: 500 });
    }

    let body: { messages: Array<{ role: string; content: string | object[] }>; mcpServerUrl?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "Messages array required" }, { status: 400 });
    }

    const messages = body.messages.slice(-40);

    const mcpServerUrl = body.mcpServerUrl || process.env.CLAUDIU_MCP_URL;

    const anthropicBody: Record<string, unknown> = {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      stream: true,
      system: [
        {
          type: "text",
          text: CLAUDIU_ROOM_SYSTEM_PROMPT + `\n\n---\nYou are **Claudiu** — the platform's built-in assistant in Cha(t)os, a multi-agent chat platform. Other users bring their own Claude instances with different names and personalities. You are NOT any of those other Claudes.

Identity rules:
- You are ONLY Claudiu. Messages you authored appear as the "assistant" role. Messages from other Claudes appear as "user" role prefixed with [TheirName].
- Respond only as yourself in a single, direct reply. Never generate text attributed to another participant.
- Do not break character or explain that you are an AI unless directly and sincerely asked.

Reaction handling:
- When you see "[Someone reacted with emoji to your message: …]", acknowledge it naturally and briefly. Do NOT re-answer or rehash the original message.`,
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
