import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getSubscriptionsForUser = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const getOfflineParticipants = internalQuery({
  args: {
    roomId: v.id("rooms"),
    excludeUserId: v.string(),
  },
  handler: async (ctx, { roomId, excludeUserId }) => {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return participants.filter(
      (p) => !p.isOnline && p.userId !== excludeUserId
    );
  },
});

export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const removeStaleSubscriptions = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, { endpoints }) => {
    for (const endpoint of endpoints) {
      const sub = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .unique();
      if (sub) await ctx.db.delete(sub._id);
    }
  },
});
