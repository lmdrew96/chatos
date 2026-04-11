import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const updatePresence = mutation({
  args: { isOnline: v.boolean() },
  handler: async (ctx, { isOnline }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (user) await ctx.db.patch(user._id, { isOnline });
  },
});

export const upsertUser = mutation({
  args: {
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, { username, displayName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { username, displayName });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      username,
      displayName,
    });
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const hasApiKey = apiKey !== null;

    // Existing users who already have an API key but no onboardingCompleted field
    // are treated as completed (grandfathered in)
    const completed = user?.onboardingCompleted === true || (!user?.onboardingCompleted && hasApiKey);

    return { completed, hasApiKey };
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, { onboardingCompleted: true });
    }
  },
});

export const resetOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, { onboardingCompleted: false });
    }
  },
});

export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, { timezone });
    }
  },
});

export const getTimezoneByTokenIdentifier = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    return user?.timezone ?? null;
  },
});

export const saveJoinPreferences = mutation({
  args: {
    preferredDisplayName: v.string(),
    preferredClaudeName: v.string(),
  },
  handler: async (ctx, { preferredDisplayName, preferredClaudeName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;

    const displayLower = preferredDisplayName.toLowerCase();
    const claudeLower = preferredClaudeName.toLowerCase();

    // Reserved names
    const RESERVED_CLAUDE_NAMES = ["claudiu", "everyone"];
    if (RESERVED_CLAUDE_NAMES.includes(claudeLower)) {
      throw new Error(`The Claude name "${preferredClaudeName}" is reserved.`);
    }

    // Check display name uniqueness (case-insensitive)
    if (preferredDisplayName) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_preferredDisplayNameLower", (q) => q.eq("preferredDisplayNameLower", displayLower))
        .first();
      if (existing && existing._id !== user._id) {
        throw new Error(`The name "${preferredDisplayName}" is already taken.`);
      }
    }

    // Check Claude name uniqueness (case-insensitive)
    if (preferredClaudeName) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_preferredClaudeNameLower", (q) => q.eq("preferredClaudeNameLower", claudeLower))
        .first();
      if (existing && existing._id !== user._id) {
        throw new Error(`The Claude name "${preferredClaudeName}" is already taken.`);
      }
    }

    await ctx.db.patch(user._id, {
      preferredDisplayName,
      preferredClaudeName,
      preferredDisplayNameLower: displayLower,
      preferredClaudeNameLower: claudeLower,
    });
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!user) return null;
    // Return only public-safe fields
    return { _id: user._id, username: user.username, displayName: user.displayName };
  },
});
