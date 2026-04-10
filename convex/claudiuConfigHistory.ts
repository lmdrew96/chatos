import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) return [];

    return await ctx.db
      .query("claudiuConfigHistory")
      .withIndex("by_savedAt")
      .order("desc")
      .take(50);
  },
});

export const restoreVersion = mutation({
  args: { version: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) {
      throw new Error("Only the Claudiu admin can restore config");
    }

    const historyEntry = await ctx.db
      .query("claudiuConfigHistory")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .first();

    if (!historyEntry) throw new Error("Version not found");

    const existing = await ctx.db.query("claudiuConfig").order("desc").first();
    if (!existing) throw new Error("No config to restore to");

    // Snapshot current state before restoring (reuses the same history logic)
    const latestVersion = await ctx.db
      .query("claudiuConfigHistory")
      .withIndex("by_version")
      .order("desc")
      .first();
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    await ctx.db.insert("claudiuConfigHistory", {
      version: nextVersion,
      snapshot: {
        onboardingPrompt: existing.onboardingPrompt,
        roomPrompt: existing.roomPrompt,
        model: existing.model,
        onboardingMaxTokens: existing.onboardingMaxTokens,
        roomMaxTokens: existing.roomMaxTokens,
        onboardingHistoryLimit: existing.onboardingHistoryLimit,
        roomHistoryLimit: existing.roomHistoryLimit,
        rateLimitMaxMessages: existing.rateLimitMaxMessages,
        rateLimitWindowMinutes: existing.rateLimitWindowMinutes,
        helperMcpUrl: existing.helperMcpUrl,
        roomMcpUrl: existing.roomMcpUrl,
        mcpServers: existing.mcpServers,
        temperature: existing.temperature,
        topP: existing.topP,
      },
      savedAt: Date.now(),
    });

    // Apply the historical snapshot
    const { snapshot } = historyEntry;
    await ctx.db.patch(existing._id, {
      ...snapshot,
      updatedAt: Date.now(),
    });

    return existing._id;
  },
});
