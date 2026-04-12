import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { prefetchPctxContext, isPctxServer } from "@/lib/pctx-prefetch";

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

    const messages = body.messages.slice(-historyLimit);

    // Pre-fetch PCTX memory from helper MCP (if configured)
    const helperMcpUrl = config?.helperMcpUrl;
    const pctxMemory = helperMcpUrl ? await prefetchPctxContext(helperMcpUrl) : null;
    const effectiveSystemPrompt = pctxMemory
      ? `${systemPrompt}\n\n${pctxMemory}`
      : systemPrompt;

    // Build MCP servers array — PCTX reads are pre-fetched, keep only writes
    const pctxToolConfig = {
      enabled: true as const,
      allowed_tools: ["pctx_update_context", "pctx_add_project", "pctx_add_relationship"],
    };

    const allMcpServers: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition[] = [];

    if (helperMcpUrl) {
      try {
        const parsed = new URL(helperMcpUrl);
        const token = parsed.searchParams.get("token");
        const server: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition = { type: "url", url: parsed.toString(), name: "claudiu-helper-context", tool_configuration: pctxToolConfig };
        if (token) server.authorization_token = token;
        allMcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    for (const s of config?.mcpServers ?? []) {
      if (!s.name.trim() || !s.url.trim()) continue;
      try {
        const parsed = new URL(s.url);
        const token = parsed.searchParams.get("token");
        const server: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition = { type: "url", url: parsed.toString(), name: s.name };
        if (token) server.authorization_token = token;
        if (isPctxServer(s.name)) server.tool_configuration = pctxToolConfig;
        allMcpServers.push(server);
      } catch {
        // Invalid URL — skip
      }
    }

    // Initialize SDK client
    const client = new Anthropic({ apiKey });

    const streamParams: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: [{ type: "text" as const, text: effectiveSystemPrompt }],
      messages,
      context_management: {
        edits: [{ type: "compact_20260112", trigger: { type: "input_tokens", value: 50000 } }],
      },
    };

    if (config?.temperature !== undefined) streamParams.temperature = config.temperature;
    if (config?.topP !== undefined) streamParams.top_p = config.topP;

    if (allMcpServers.length > 0) {
      streamParams.mcp_servers = allMcpServers;
    }

    const betas: string[] = ["pdfs-2024-09-25", "compact-2026-01-12"];
    if (allMcpServers.length > 0) betas.push("mcp-client-2025-04-04");

    // Always use beta API for context management + optional MCP
    const stream = client.beta.messages.stream(streamParams as any, {
      headers: { "anthropic-beta": betas.join(",") },
    });

    // Re-serialize SDK events as SSE for the client, logging usage eagerly
    let logged = false;
    const fireLog = (inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number) => {
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

    const encoder = new TextEncoder();
    let inputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            // Forward the event as SSE
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
          console.error("[claudiu/onboarding] Stream error:", err.message, err.stack);
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
