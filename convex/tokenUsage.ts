import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Anthropic pricing per million tokens
const COST_PER_MTOK: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
  "claude-opus-4-6": { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number {
  const pricing = COST_PER_MTOK[model] ?? COST_PER_MTOK["claude-sonnet-4-6"];
  // Input tokens from the API already exclude cached tokens, so:
  // total cost = uncached input + cache writes + cache reads + output
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWrite +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export const logUsage = mutation({
  args: {
    roomId: v.id("rooms"),
    claudeName: v.string(),
    ownerTokenIdentifier: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheCreationTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tokenUsage", args);
  },
});

export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // Only the admin can see usage stats
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) return null;

    const now = Date.now();
    const windows = {
      "24h": now - 24 * 60 * 60 * 1000,
      "7d": now - 7 * 24 * 60 * 60 * 1000,
      "30d": now - 30 * 24 * 60 * 60 * 1000,
    } as const;

    // Only fetch records from the admin's own API key(s)
    const allRecords = await ctx.db
      .query("tokenUsage")
      .withIndex("by_owner_and_timestamp", (q) =>
        q.eq("ownerTokenIdentifier", ownerToken!).gte("timestamp", windows["30d"])
      )
      .order("desc")
      .take(500);

    const truncated = allRecords.length === 500;

    const computeWindow = (cutoff: number) => {
      const records = allRecords.filter((r) => r.timestamp >= cutoff);
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheCreation = 0;
      let totalCacheRead = 0;
      let estimatedCost = 0;

      // Per-agent breakdown
      const byAgent: Record<string, { calls: number; input: number; output: number; cost: number }> = {};

      for (const r of records) {
        totalInput += r.inputTokens;
        totalOutput += r.outputTokens;
        totalCacheCreation += r.cacheCreationTokens ?? 0;
        totalCacheRead += r.cacheReadTokens ?? 0;
        const cost = estimateCost(
          r.model,
          r.inputTokens,
          r.outputTokens,
          r.cacheCreationTokens ?? 0,
          r.cacheReadTokens ?? 0,
        );
        estimatedCost += cost;

        if (!byAgent[r.claudeName]) {
          byAgent[r.claudeName] = { calls: 0, input: 0, output: 0, cost: 0 };
        }
        byAgent[r.claudeName].calls++;
        byAgent[r.claudeName].input += r.inputTokens;
        byAgent[r.claudeName].output += r.outputTokens;
        byAgent[r.claudeName].cost += cost;
      }

      return {
        callCount: records.length,
        totalInput,
        totalOutput,
        totalCacheCreation,
        totalCacheRead,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        byAgent,
      };
    };

    return {
      windows: {
        "24h": computeWindow(windows["24h"]),
        "7d": computeWindow(windows["7d"]),
        "30d": computeWindow(windows["30d"]),
      },
      truncated,
    };
  },
});

export const getRecentCalls = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) return null;

    const calls = await ctx.db
      .query("tokenUsage")
      .withIndex("by_owner_and_timestamp", (q) =>
        q.eq("ownerTokenIdentifier", ownerToken!)
      )
      .order("desc")
      .take(20);

    return Promise.all(
      calls.map(async (call) => {
        const room = await ctx.db.get(call.roomId);
        return {
          ...call,
          roomName: room?.title ?? room?.roomCode ?? null,
          estimatedCost: estimateCost(
            call.model,
            call.inputTokens,
            call.outputTokens,
            call.cacheCreationTokens ?? 0,
            call.cacheReadTokens ?? 0,
          ),
        };
      })
    );
  },
});
