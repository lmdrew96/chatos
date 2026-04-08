import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    roomId: v.id("rooms"),
    emoji: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { messageId, roomId, emoji, userId }) => {
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_and_emoji_and_user", (q) =>
        q.eq("messageId", messageId).eq("emoji", emoji).eq("userId", userId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { action: "removed" as const };
    }

    await ctx.db.insert("reactions", {
      messageId,
      roomId,
      userId,
      emoji,
    });
    return { action: "added" as const };
  },
});

export const getReactionsForRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    return await ctx.db
      .query("reactions")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
  },
});
