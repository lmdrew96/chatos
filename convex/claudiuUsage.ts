import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Anthropic pricing per million tokens (update when pricing changes)
const COST_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_MTOK[model] ?? COST_PER_MTOK["claude-sonnet-4-6"];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export const logUsage = mutation({
  args: {
    endpoint: v.union(v.literal("onboarding"), v.literal("room")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("claudiuUsage", args);
  },
});

export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) return null;

    const now = Date.now();
    const windows = {
      "24h": now - 24 * 60 * 60 * 1000,
      "7d": now - 7 * 24 * 60 * 60 * 1000,
      "30d": now - 30 * 24 * 60 * 60 * 1000,
    } as const;

    // Fetch up to 500 records for the widest window
    const allRecords = await ctx.db
      .query("claudiuUsage")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", windows["30d"]))
      .order("desc")
      .take(500);

    const truncated = allRecords.length === 500;

    const computeWindow = (cutoff: number) => {
      const records = allRecords.filter((r) => r.timestamp >= cutoff);
      let totalInput = 0;
      let totalOutput = 0;
      let estimatedCost = 0;
      let onboarding = 0;
      let room = 0;

      for (const r of records) {
        totalInput += r.inputTokens;
        totalOutput += r.outputTokens;
        estimatedCost += estimateCost(r.model, r.inputTokens, r.outputTokens);
        if (r.endpoint === "onboarding") onboarding++;
        else room++;
      }

      return {
        messageCount: records.length,
        totalInput,
        totalOutput,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        onboarding,
        room,
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

    return await ctx.db
      .query("claudiuUsage")
      .withIndex("by_timestamp")
      .order("desc")
      .take(20);
  },
});
