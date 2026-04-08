import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveFavorite = mutation({
  args: {
    tenorId: v.string(),
    url: v.string(),
    previewUrl: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("gifFavorites")
      .withIndex("by_token_and_tenor_id", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier).eq("tenorId", args.tenorId)
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("gifFavorites", {
      tokenIdentifier: identity.tokenIdentifier,
      ...args,
      savedAt: Date.now(),
    });
  },
});

export const removeFavorite = mutation({
  args: { tenorId: v.string() },
  handler: async (ctx, { tenorId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("gifFavorites")
      .withIndex("by_token_and_tenor_id", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier).eq("tenorId", tenorId)
      )
      .unique();

    if (existing) await ctx.db.delete(existing._id);
  },
});

export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("gifFavorites")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .take(100);
  },
});
