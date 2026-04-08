import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveApiKey = mutation({
  args: { encryptedKey: v.string() },
  handler: async (ctx, { encryptedKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { encryptedKey });
    } else {
      await ctx.db.insert("apiKeys", {
        tokenIdentifier: identity.tokenIdentifier,
        encryptedKey,
      });
    }
  },
});

export const deleteApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const hasApiKey = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    return existing !== null;
  },
});

export const getMyApiKey = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    return existing?.encryptedKey ?? null;
  },
});

export const getApiKeyForParticipant = query({
  args: { roomId: v.id("rooms"), participantUserId: v.string() },
  handler: async (ctx, { roomId, participantUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Verify the caller is a participant in this room
    const caller = await ctx.db
      .query("participants")
      .withIndex("by_room_and_token_identifier", (q) =>
        q.eq("roomId", roomId).eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!caller) return null;

    // Find the target participant to get their tokenIdentifier
    const target = await ctx.db
      .query("participants")
      .withIndex("by_room_and_user_id", (q) =>
        q.eq("roomId", roomId).eq("userId", participantUserId)
      )
      .unique();
    if (!target?.tokenIdentifier) return null;

    // Look up the target's API key
    const keyDoc = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", target.tokenIdentifier!))
      .unique();

    return keyDoc?.encryptedKey ?? null;
  },
});
