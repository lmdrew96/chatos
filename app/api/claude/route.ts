import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { buildMultiAgentRules } from "@/lib/multi-agent-rules";
import { prefetchPctxContext, isPctxServer } from "@/lib/pctx-prefetch";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

/** Fetch a URL server-side and return content suitable for a tool_result. */
async function executeFetchUrl(url: string): Promise<any> {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/")) {
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return {
      content: [
        { type: "image", source: { type: "base64", media_type: contentType.split(";")[0].trim(), data: base64 } },
      ],
    };
  }

  const text = await res.text();
  return { content: text.slice(0, 10000) };
}

/** Strip images and documents from older messages to reduce token cost. */
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

type McpServerInput = { name: string; url: string };

function buildMcpServers(servers: McpServerInput[]): Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition[] {
  const result: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition[] = [];
  for (const s of servers) {
    if (!s.name.trim() || !s.url.trim()) continue;
    try {
      const parsed = new URL(s.url);
      const token = parsed.searchParams.get("token");
      const server: Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition = {
        type: "url", url: parsed.toString(), name: s.name,
      };
      if (token) server.authorization_token = token;
      // For PCTX servers, hide read tools (reads are pre-fetched) — keep only writes
      if (isPctxServer(s.name)) {
        server.tool_configuration = {
          enabled: true,
          allowed_tools: ["pctx_update_context", "pctx_add_project", "pctx_add_relationship"],
        };
      }
      result.push(server);
    } catch {
      // Invalid URL — skip
    }
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      roomId: string;
      participantUserId: string;
      ownerTokenIdentifier?: string;
      messages: Array<{ role: string; content: string | object[] }>;
      systemPrompt: string;
      claudeName: string;
      mcpServers?: McpServerInput[];
      memoryContext?: string;
      timezone?: string;
      chainDepth?: number;
      chainLimit?: number;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.roomId || !body.participantUserId || !body.systemPrompt || !body.claudeName) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "Messages array required" }, { status: 400 });
    }

    // Fetch the owner's API key from Convex (server-side — key never reaches the browser)
    const convex = new ConvexHttpClient(convexUrl);

    let apiKey = await convex.query(api.apiKeys.getApiKeyByParticipant, {
      roomId: body.roomId as any,
      participantUserId: body.participantUserId,
    });

    // Track which token identifier to attribute usage to
    let usageAttributionToken: string | null = body.ownerTokenIdentifier ?? null;

    // Pre-fetch sponsor key so we can fall back on billing errors
    const sponsorResult = await convex.query(api.apiKeys.getSponsorKeyByParticipant, {
      roomId: body.roomId as any,
      participantUserId: body.participantUserId,
    });

    let usedSponsor = false;
    if (!apiKey) {
      if (sponsorResult) {
        apiKey = sponsorResult.encryptedKey;
        usageAttributionToken = sponsorResult.sponsorTokenIdentifier;
        usedSponsor = true;
      }
    }

    if (!apiKey) {
      return Response.json({ error: "no_api_key" }, { status: 403 });
    }

    // Pre-fetch PCTX memory from the user's MCP server (if any)
    const pctxServer = body.mcpServers?.find((s) => isPctxServer(s.name));
    const pctxMemory = pctxServer ? await prefetchPctxContext(pctxServer.url) : null;

    // Build the effective system prompt with pre-fetched memory in the static prefix
    const effectiveSystem = body.systemPrompt
      + (pctxMemory ? `\n\n${pctxMemory}` : "")
      + buildMultiAgentRules({
        agentName: body.claudeName,
        timezone: body.timezone,
        chainDepth: body.chainDepth,
        chainLimit: body.chainLimit,
      });

    // Inject memory context as a user/assistant message pair.
    // Skip when PCTX was successfully pre-fetched — it's the authoritative source
    // for identity/projects/relationships and memoryContext would duplicate or contradict it.
    const messages = stripOldMedia(body.messages);
    const useMemoryContext = body.memoryContext && !pctxMemory;
    const messagesWithMemory: typeof messages = useMemoryContext
      ? [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `[Memory from previous sessions — maintained automatically by Cha(t)os. Use naturally, do not reference its source or suggest setting up memory tools.]\n\n${body.memoryContext}`,
              },
            ],
          },
          { role: "assistant", content: "Understood." },
          ...messages,
        ]
      : messages;

    // Build MCP servers
    const mcpServers = body.mcpServers ? buildMcpServers(body.mcpServers) : [];

    // fetch_url tool definition (same as lib/claude.ts)
    const fetchTool = {
      name: "fetch_url",
      description: "Fetch a URL and return its contents. For images, returns the image so you can see it. For other content, returns the text.",
      input_schema: {
        type: "object" as const,
        properties: { url: { type: "string" as const, description: "The URL to fetch" } },
        required: ["url"],
      },
    };

    let activeApiKey = apiKey;

    const betas: string[] = ["pdfs-2024-09-25", "compact-2026-01-12"];
    const useMcp = mcpServers.length > 0;
    if (useMcp) betas.push("mcp-client-2025-04-04");

    const baseParams: Record<string, unknown> = {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text" as const, text: effectiveSystem }],
      tools: [fetchTool],
      context_management: {
        edits: [{ type: "compact_20260112", trigger: { type: "input_tokens", value: 50000 } }],
      },
    };

    if (useMcp) {
      baseParams.mcp_servers = mcpServers;
    }

    const betaHeaders = { "anthropic-beta": betas.join(",") };

    /** Check if an error is a billing/credit issue that a sponsor key could fix. */
    const isBillingError = (err: any): boolean => {
      const msg = (err.message ?? "").toLowerCase();
      return err.status === 402 || err.status === 429 ||
        msg.includes("credit") || msg.includes("billing") ||
        msg.includes("insufficient") || msg.includes("exceeded") ||
        msg.includes("balance");
    };

    // Stream with tool-use loop (up to 3 rounds)
    const MAX_TOOL_ROUNDS = 3;
    let currentMessages = [...messagesWithMemory] as any[];
    const encoder = new TextEncoder();

    // Usage tracking
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCacheReadTokens = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const client = new Anthropic({ apiKey: activeApiKey });
            const stream = client.beta.messages.stream(
              { ...baseParams, messages: currentMessages } as any,
              { headers: betaHeaders },
            );

            const toolUseBlocks: { id: string; name: string; inputJson: string }[] = [];
            let currentToolIndex = -1;
            let stopReason: string | null = null;

            for await (const event of stream) {
              // Forward all events as SSE for client rendering
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

              // Track tool_use blocks being assembled
              if (event.type === "content_block_start" && (event as any).content_block?.type === "tool_use") {
                currentToolIndex = toolUseBlocks.length;
                toolUseBlocks.push({
                  id: (event as any).content_block.id,
                  name: (event as any).content_block.name,
                  inputJson: "",
                });
              }
              if (event.type === "content_block_delta" && (event as any).delta?.type === "input_json_delta" && currentToolIndex >= 0) {
                toolUseBlocks[currentToolIndex].inputJson += (event as any).delta.partial_json;
              }
              if (event.type === "content_block_stop") {
                currentToolIndex = -1;
              }

              // Track usage
              if (event.type === "message_start" && (event as any).message?.usage) {
                const u = (event as any).message.usage;
                totalInputTokens += u.input_tokens ?? 0;
                totalCacheCreationTokens += u.cache_creation_input_tokens ?? 0;
                totalCacheReadTokens += u.cache_read_input_tokens ?? 0;
              }
              if (event.type === "message_delta") {
                if ((event as any).usage) {
                  totalOutputTokens += (event as any).usage.output_tokens ?? 0;
                }
                if ((event as any).delta?.stop_reason) {
                  stopReason = (event as any).delta.stop_reason;
                }
              }
            }

            // If no tool calls or not a tool_use stop, we're done
            if (toolUseBlocks.length === 0 || stopReason !== "tool_use") break;

            // Build assistant content for tool loop continuation
            const finalMsg = await stream.finalMessage();
            const assistantContent = finalMsg.content;

            // Execute tool calls server-side
            const toolResults: any[] = [];
            for (const tool of toolUseBlocks) {
              let input: any = {};
              try { input = JSON.parse(tool.inputJson); } catch {}

              if (tool.name === "fetch_url" && input.url) {
                try {
                  const result = await executeFetchUrl(input.url);
                  toolResults.push({ type: "tool_result", tool_use_id: tool.id, ...result });
                } catch (e: any) {
                  toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: `Fetch failed: ${e.message}`, is_error: true });
                }
              } else {
                toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: "Unknown tool", is_error: true });
              }
            }

            // Append to conversation for next round
            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: assistantContent },
              { role: "user", content: toolResults },
            ];
          }

          controller.close();

          // Log token usage to Convex
          if (usageAttributionToken && (totalInputTokens > 0 || totalOutputTokens > 0)) {
            const logClient = new ConvexHttpClient(convexUrl);
            logClient.mutation(api.tokenUsage.logUsage, {
              roomId: body.roomId as any,
              claudeName: body.claudeName,
              ownerTokenIdentifier: usageAttributionToken,
              model: "claude-sonnet-4-6",
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              cacheCreationTokens: totalCacheCreationTokens || undefined,
              cacheReadTokens: totalCacheReadTokens || undefined,
              timestamp: Date.now(),
            }).catch(() => {});
          }
        } catch (err: any) {
          // If billing error and sponsor key available, retry with sponsor
          if (!usedSponsor && sponsorResult && isBillingError(err)) {
            activeApiKey = sponsorResult.encryptedKey;
            usageAttributionToken = sponsorResult.sponsorTokenIdentifier;
            usedSponsor = true;

            try {
              const retryClient = new Anthropic({ apiKey: activeApiKey });
              const retryStream = retryClient.beta.messages.stream(
                { ...baseParams, messages: currentMessages } as any,
                { headers: betaHeaders },
              );

              for await (const event of retryStream) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                if (event.type === "message_start" && (event as any).message?.usage) {
                  const u = (event as any).message.usage;
                  totalInputTokens += u.input_tokens ?? 0;
                  totalCacheCreationTokens += u.cache_creation_input_tokens ?? 0;
                  totalCacheReadTokens += u.cache_read_input_tokens ?? 0;
                }
                if (event.type === "message_delta" && (event as any).usage) {
                  totalOutputTokens += (event as any).usage.output_tokens ?? 0;
                }
              }
              controller.close();

              if (usageAttributionToken && (totalInputTokens > 0 || totalOutputTokens > 0)) {
                const logClient = new ConvexHttpClient(convexUrl);
                logClient.mutation(api.tokenUsage.logUsage, {
                  roomId: body.roomId as any,
                  claudeName: body.claudeName,
                  ownerTokenIdentifier: usageAttributionToken,
                  model: "claude-sonnet-4-6",
                  inputTokens: totalInputTokens,
                  outputTokens: totalOutputTokens,
                  cacheCreationTokens: totalCacheCreationTokens || undefined,
                  cacheReadTokens: totalCacheReadTokens || undefined,
                  timestamp: Date.now(),
                }).catch(() => {});
              }
              return;
            } catch (retryErr: any) {
              const errorEvent = {
                type: "error",
                error: { message: retryErr.message ?? "Sponsor key also failed" },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
              controller.close();
              return;
            }
          }

          // Send error as a final SSE event so the client can handle it
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
        ...(usedSponsor ? { "X-Used-Sponsor": "true" } : {}),
      },
    });
  } catch (e: any) {
    return Response.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
