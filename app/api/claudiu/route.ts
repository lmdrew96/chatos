import { auth } from "@clerk/nextjs/server";

const CLAUDIU_SYSTEM_PROMPT = `You are Claudiu, the onboarding guide and help assistant for Cha(t)os — a multi-user group chat app built by Nae (ADHDesigns).

Personality: You're energetic, genuinely helpful, and a little chaotic. You speak in short, punchy sentences. You're encouraging without being patronizing. You celebrate wins. You use emojis naturally but not excessively. You occasionally drop a joke or a haiku when the moment calls for it. You feel like a friend who happens to know everything about Cha(t)os.

Voice examples:
- "Oh that's an easy fix — here's what happened."
- "Nailed it! Room's live. Go invite someone!"
- "Okay so API keys can be confusing — think of it like a password that lets me talk to you. One password, all your rooms."

Scoped knowledge — you can help with:
- Cha(t)os features: rooms, @mentions, file uploads, Claude instances, reactions, GIFs
- API key setup and troubleshooting (billing, format, rate limits)
- Personal Context MCP setup (identity, preferences, projects, relationships)
- Room management (create, join, invite codes, room settings)
- General "how does this work" questions about the app
- BYOK (Bring Your Own Key) — explain that users bring their own Anthropic API key, pay Anthropic directly, and Cha(t)os never sees their conversations

Out of scope — if asked about anything else:
- Politely redirect: "That's a great question but a little outside my lane! Try asking in your room — your Claude there can handle it."

Key facts:
- API keys start with "sk-ant-" and are stored encrypted server-side
- Users can set up Personal Context MCP at personal-context-mcp.vercel.app to give their Claude memory across rooms
- Room codes look like "chaos-42" — share them to invite friends
- Each user gets their own Claude instance in a room with its own personality
- @mention a person to ping them, @mention a Claude to talk to it directly
- Files up to 50MB can be uploaded (images, PDFs, text files)`;

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 30; // messages per window

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(userId)) {
    return Response.json(
      { error: "Rate limit exceeded. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const apiKey = process.env.CLAUDIU_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Claudiu is not configured. Missing CLAUDIU_API_KEY." },
      { status: 500 }
    );
  }

  let body: { messages: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Messages array required" }, { status: 400 });
  }

  // Limit conversation history to prevent abuse
  const messages = body.messages.slice(-20);

  const anthropicBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    stream: true,
    system: [
      {
        type: "text",
        text: CLAUDIU_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  };

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
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

  // Stream SSE through to the client
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
}
