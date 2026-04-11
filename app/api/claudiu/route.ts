import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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
    let config: { onboardingPrompt: string; model: string; onboardingMaxTokens: number; onboardingHistoryLimit: number; rateLimitMaxMessages: number; rateLimitWindowMinutes: number; helperMcpUrl?: string; mcpServers?: { name: string; url: string }[]; temperature?: number; topP?: number } | null = null;
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

    const messagesCopy = body.messages.slice(-historyLimit).map((m) => ({ ...m }));

    // Cache the conversation history prefix for active chats
    if (messagesCopy.length >= 4) {
      (messagesCopy[messagesCopy.length - 3] as any).cache_control = { type: "ephemeral" };
    }

    const anthropicBody: Record<string, unknown> = {
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
      messages: messagesCopy,
    };

    if (config?.temperature !== undefined) anthropicBody.temperature = config.temperature;
    if (config?.topP !== undefined) anthropicBody.top_p = config.topP;

    const betas: string[] = ["prompt-caching-2024-07-31"];

    const allMcpServers: Record<string, string>[] = [];

    const helperMcpUrl = config?.helperMcpUrl;
    if (helperMcpUrl) {
      try {
        const parsed = new URL(helperMcpUrl);
        const token = parsed.searchParams.get("token");
        const server: Record<string, string> = { type: "url", url: parsed.toString(), name: "claudiu-helper-context" };
        if (token) server.authorization_token = token;
        allMcpServers.push(server);
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
        allMcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    if (allMcpServers.length > 0) {
      anthropicBody.mcp_servers = allMcpServers;
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

    // Stream SSE through to the client, intercepting token usage
    if (!anthropicRes.body) {
      return Response.json({ error: "No stream from Anthropic" }, { status: 502 });
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let logged = false;
    const sseDecoder = new TextDecoder();
    let sseBuffer = "";

    const fireLog = () => {
      if (logged || !convexUrl) return;
      if (inputTokens <= 0 && outputTokens <= 0) return;
      logged = true;
      const logClient = new ConvexHttpClient(convexUrl);
      logClient.mutation(api.claudiuUsage.logUsage, {
        endpoint: "onboarding" as const,
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens: cacheCreationTokens || undefined,
        cacheReadTokens: cacheReadTokens || undefined,
        timestamp: Date.now(),
      }).catch(() => {});
    };

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
              cacheCreationTokens = parsed.message.usage.cache_creation_input_tokens ?? 0;
              cacheReadTokens = parsed.message.usage.cache_read_input_tokens ?? 0;
            }
            if (parsed.type === "message_delta" && parsed.usage) {
              outputTokens = parsed.usage.output_tokens ?? 0;
              fireLog();
            }
          } catch {
            // skip
          }
        }
      },
      flush() {
        fireLog();
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
