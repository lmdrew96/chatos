import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const TYPING_TIMEOUT_MS = 3000;

export const setTyping = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, { roomId, userId, displayName }) => {
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room_and_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { typingAt: Date.now(), displayName });
    } else {
      await ctx.db.insert("typingIndicators", {
        roomId,
        userId,
        displayName,
        typingAt: Date.now(),
      });
    }
  },
});

export const clearTyping = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, { roomId, userId }) => {
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room_and_user", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getTyping = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const all = await ctx.db
      .query("typingIndicators")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(20);

    const now = Date.now();
    return all
      .filter((t) => now - t.typingAt < TYPING_TIMEOUT_MS)
      .map((t) => ({ userId: t.userId, displayName: t.displayName }));
  },
});
