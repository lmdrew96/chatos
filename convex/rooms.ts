import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function generateRoomCode(): string {
  const adjectives = ["chaos", "wild", "bold", "swift", "calm", "bright", "dark", "loud"];
  const noun = Math.floor(Math.random() * 90 + 10);
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adj}-${noun}`;
}

export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const roomCode = generateRoomCode();
    const roomId = await ctx.db.insert("rooms", {
      roomCode,
      createdAt: Date.now(),
    });
    return { roomId, roomCode };
  },
});

export const getRoomByCode = query({
  args: { roomCode: v.string() },
  handler: async (ctx, { roomCode }) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("roomCode", roomCode))
      .unique();
  },
});

export const getRoomById = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    return await ctx.db.get(roomId);
  },
});

export const joinRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    displayName: v.string(),
    claudeName: v.string(),
    systemPrompt: v.string(),
  },
  handler: async (ctx, { roomId, userId, displayName, claudeName, systemPrompt }) => {
    const identity = await ctx.auth.getUserIdentity();
    const tokenIdentifier = identity?.tokenIdentifier;

    // Check if participant already exists (rejoin)
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { isOnline: true, displayName, claudeName, systemPrompt, tokenIdentifier });
      return existing._id;
    }

    // Validate Claude name uniqueness in room
    const nameConflict = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .filter((q) => q.eq(q.field("claudeName"), claudeName))
      .unique();

    if (nameConflict) {
      throw new Error(`Claude name "${claudeName}" is already taken in this room.`);
    }

    const participantId = await ctx.db.insert("participants", {
      roomId,
      userId,
      tokenIdentifier,
      displayName,
      claudeName,
      systemPrompt,
      isOnline: true,
    });

    return participantId;
  },
});

export const setOnlineStatus = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    isOnline: v.boolean(),
  },
  handler: async (ctx, { roomId, userId, isOnline }) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .unique();

    if (participant) {
      await ctx.db.patch(participant._id, { isOnline });
    }
  },
});

export const useParticipants = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    return await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
  },
});
