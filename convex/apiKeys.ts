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

export const addKeySponsor = mutation({
  args: { recipientUserId: v.id("users") },
  handler: async (ctx, { recipientUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const recipient = await ctx.db.get(recipientUserId);
    if (!recipient) throw new Error("User not found");

    const recipientTokenIdentifier = recipient.tokenIdentifier;

    // Check if already sponsoring this recipient
    const existing = await ctx.db
      .query("keySponsors")
      .withIndex("by_recipient", (q) => q.eq("recipientTokenIdentifier", recipientTokenIdentifier))
      .first();
    if (existing && existing.sponsorTokenIdentifier === identity.tokenIdentifier) return;

    // Remove any existing sponsor for this recipient
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("keySponsors", {
      sponsorTokenIdentifier: identity.tokenIdentifier,
      recipientTokenIdentifier,
    });
  },
});

export const removeKeySponsor = mutation({
  args: { recipientUserId: v.id("users") },
  handler: async (ctx, { recipientUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const recipient = await ctx.db.get(recipientUserId);
    if (!recipient) return;

    const existing = await ctx.db
      .query("keySponsors")
      .withIndex("by_recipient", (q) => q.eq("recipientTokenIdentifier", recipient.tokenIdentifier))
      .first();
    if (existing && existing.sponsorTokenIdentifier === identity.tokenIdentifier) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getMySponsored = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const sponsorships = await ctx.db
      .query("keySponsors")
      .withIndex("by_sponsor", (q) => q.eq("sponsorTokenIdentifier", identity.tokenIdentifier))
      .take(50);

    const results = [];
    for (const s of sponsorships) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", s.recipientTokenIdentifier))
        .unique();
      results.push({
        _id: s._id,
        recipientTokenIdentifier: s.recipientTokenIdentifier,
        displayName: user?.preferredDisplayName ?? user?.displayName ?? "Unknown",
        userId: user?._id ?? null,
      });
    }
    return results;
  },
});

export const searchUsersForSponsor = query({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const searchLower = search.toLowerCase().trim();
    if (!searchLower) return [];

    // Scan users table (small enough to iterate)
    const allUsers = await ctx.db.query("users").take(200);
    return allUsers
      .filter((u) => {
        if (u.tokenIdentifier === identity.tokenIdentifier) return false;
        const name = (u.preferredDisplayName ?? u.displayName ?? "").toLowerCase();
        return name.includes(searchLower);
      })
      .slice(0, 10)
      .map((u) => ({
        _id: u._id,
        displayName: u.preferredDisplayName ?? u.displayName ?? "Unknown",
        tokenIdentifier: u.tokenIdentifier,
      }));
  },
});

export const getSponsorKeyForParticipant = query({
  args: { roomId: v.id("rooms"), participantUserId: v.string() },
  handler: async (ctx, { roomId, participantUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Verify the caller is in this room
    const caller = await ctx.db
      .query("participants")
      .withIndex("by_room_and_token_identifier", (q) =>
        q.eq("roomId", roomId).eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!caller) return null;

    // Find the target participant's tokenIdentifier
    const target = await ctx.db
      .query("participants")
      .withIndex("by_room_and_user_id", (q) =>
        q.eq("roomId", roomId).eq("userId", participantUserId)
      )
      .unique();
    if (!target?.tokenIdentifier) return null;

    // Check if anyone sponsors this user
    const sponsorship = await ctx.db
      .query("keySponsors")
      .withIndex("by_recipient", (q) => q.eq("recipientTokenIdentifier", target.tokenIdentifier!))
      .first();
    if (!sponsorship) return null;

    // Fetch the sponsor's API key
    const keyDoc = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", sponsorship.sponsorTokenIdentifier))
      .unique();

    return keyDoc?.encryptedKey ?? null;
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
