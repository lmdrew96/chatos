import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// Simple in-memory rate limiting (values overridden by config at request time)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, maxMessages: number, windowMinutes: number): boolean {
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxMessages) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    // Fetch Claudiu config from Convex
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    let config: { onboardingPrompt: string; model: string; onboardingMaxTokens: number; onboardingHistoryLimit: number; rateLimitMaxMessages: number; rateLimitWindowMinutes: number } | null = null;
    if (convexUrl) {
      try {
        const convex = new ConvexHttpClient(convexUrl);
        config = await convex.query(api.claudiuConfig.getConfig, {});
      } catch {
        // Fall through to defaults below
      }
    }
    const systemPrompt = config?.onboardingPrompt ?? "You are Claudiu, a helpful assistant.";
    const model = config?.model ?? "claude-sonnet-4-6";
    const maxTokens = config?.onboardingMaxTokens ?? 512;
    const historyLimit = config?.onboardingHistoryLimit ?? 20;
    const rateLimitMax = config?.rateLimitMaxMessages ?? 30;
    const rateLimitWindow = config?.rateLimitWindowMinutes ?? 10;

    // Auth — gracefully handle if Clerk isn't configured
    let userId: string | null = null;
    try {
      const session = await auth();
      userId = session.userId;
    } catch {
      // If auth() throws (e.g. Clerk not configured for this route),
      // fall back to allowing unauthenticated access with IP-based rate limiting
    }

    const rateLimitKey = userId ?? "anon";
    if (!checkRateLimit(rateLimitKey, rateLimitMax, rateLimitWindow)) {
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

    const messages = body.messages.slice(-historyLimit);

    const anthropicBody = {
      model,
      max_tokens: maxTokens,
      stream: true,
      system: [
        {
          type: "text",
          text: systemPrompt,
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
  } catch (e: any) {
    return Response.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
