import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const GUEST_ROOM_TTL_MS = 72 * 60 * 60 * 1000;

function generateRoomCode(): string {
  const adjectives = ["chaos", "wild", "bold", "swift", "calm", "bright", "dark", "loud"];
  const noun = Math.floor(Math.random() * 90 + 10);
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adj}-${noun}`;
}

async function deleteRoomCascade(ctx: MutationCtx, roomId: Id<"rooms">) {
  while (true) {
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(100);
    if (participants.length === 0) break;
    for (const participant of participants) {
      await ctx.db.delete(participant._id);
    }
  }

  while (true) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(100);
    if (messages.length === 0) break;
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  }

  while (true) {
    const invites = await ctx.db
      .query("roomInvites")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(100);
    if (invites.length === 0) break;
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }
  }

  await ctx.db.delete(roomId);
}

export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const roomCode = generateRoomCode();
    const roomId = await ctx.db.insert("rooms", {
      roomCode,
      createdAt: now,
      ownerTokenIdentifier: identity?.tokenIdentifier,
      lastActivityAt: now,
      retentionPolicy: identity ? "persistent" : "guest_ttl_72h",
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
    const room = await ctx.db.get(roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (tokenIdentifier && !room.ownerTokenIdentifier && room.retentionPolicy !== "persistent") {
      const hasParticipants = await ctx.db
        .query("participants")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .first();

      if (!hasParticipants) {
        await ctx.db.patch(roomId, {
          ownerTokenIdentifier: tokenIdentifier,
          retentionPolicy: "persistent",
          lastActivityAt: Date.now(),
        });
      }
    }

    // Check if participant already exists (rejoin)
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_room_and_user_id", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();

    if (existing) {
      // If the system prompt changed, the old memory is stale — wipe it
      if (existing.systemPrompt !== systemPrompt) {
        const staleMemory = await ctx.db
          .query("claudeMemories")
          .withIndex("by_owner_and_claude_name", (q) =>
            q.eq("ownerUserId", userId).eq("claudeName", existing.claudeName)
          )
          .unique();
        if (staleMemory) await ctx.db.delete(staleMemory._id);
      }
      await ctx.db.patch(existing._id, { isOnline: true, displayName, claudeName, systemPrompt, tokenIdentifier });
      await ctx.db.patch(roomId, { lastActivityAt: Date.now() });
      return existing._id;
    }

    // Validate Claude name uniqueness in room
    const nameConflict = await ctx.db
      .query("participants")
      .withIndex("by_room_and_claude_name", (q) => q.eq("roomId", roomId).eq("claudeName", claudeName))
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

    await ctx.db.patch(roomId, { lastActivityAt: Date.now() });

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
      .withIndex("by_room_and_user_id", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();

    if (participant) {
      // Always stamp lastSeenAt so we know the last time the user was present.
      // Going online = they're seeing messages now; going offline = last moment they saw them.
      await ctx.db.patch(participant._id, { isOnline, lastSeenAt: Date.now() });
      if (isOnline) {
        await ctx.db.patch(roomId, { lastActivityAt: Date.now() });
      }
    }
  },
});

export const updateParticipantColor = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { roomId, userId, color }) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_room_and_user_id", (q) => q.eq("roomId", roomId).eq("userId", userId))
      .unique();
    if (participant) {
      await ctx.db.patch(participant._id, { color });
    }
  },
});

export const deleteRoom = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("You must be signed in to delete a room.");

    const room = await ctx.db.get(roomId);
    if (!room) return;

    if (room.ownerTokenIdentifier !== identity.tokenIdentifier) {
      throw new Error("Only the room owner can delete this room.");
    }

    await deleteRoomCascade(ctx, roomId);
  },
});

export const cleanupInactiveGuestRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - GUEST_ROOM_TTL_MS;
    const candidate = await ctx.db
      .query("rooms")
      .withIndex("by_retention_policy_and_last_activity_at", (q) =>
        q.eq("retentionPolicy", "guest_ttl_72h").lte("lastActivityAt", cutoff)
      )
      .first();

    if (!candidate) {
      return { deletedRoomId: null };
    }

    await deleteRoomCascade(ctx, candidate._id);
    await ctx.scheduler.runAfter(0, internal.rooms.cleanupInactiveGuestRooms, {});

    return { deletedRoomId: candidate._id };
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

export const getMyParticipantInRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("participants")
      .withIndex("by_room_and_token_identifier", (q) =>
        q.eq("roomId", roomId).eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

export const getClaudeMemoriesForOwner = query({
  args: { ownerUserId: v.string() },
  handler: async (ctx, { ownerUserId }) => {
    const memories = await ctx.db
      .query("claudeMemories")
      .withIndex("by_owner_and_claude_name", (q) => q.eq("ownerUserId", ownerUserId))
      .take(50);
    return Object.fromEntries(memories.map((m) => [m.claudeName, m]));
  },
});

export const upsertClaudeMemory = mutation({
  args: {
    ownerUserId: v.string(),
    claudeName: v.string(),
    summary: v.string(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("claudeMemories")
      .withIndex("by_owner_and_claude_name", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("claudeName", args.claudeName)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        updatedAt: now,
        lastAccessedAt: now,
        messageCount: args.messageCount,
      });
    } else {
      await ctx.db.insert("claudeMemories", { ...args, updatedAt: now, lastAccessedAt: now });
    }
  },
});

export const touchClaudeMemory = mutation({
  args: { ownerUserId: v.string(), claudeName: v.string() },
  handler: async (ctx, { ownerUserId, claudeName }) => {
    const existing = await ctx.db
      .query("claudeMemories")
      .withIndex("by_owner_and_claude_name", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("claudeName", claudeName)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastAccessedAt: Date.now() });
    }
  },
});

export const auditClaudeMemories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("claudeMemories")
      .withIndex("by_last_accessed", (q) => q.lte("lastAccessedAt", cutoff))
      .take(50);
    for (const m of stale) await ctx.db.delete(m._id);
    if (stale.length === 50) {
      await ctx.scheduler.runAfter(0, internal.rooms.auditClaudeMemories, {});
    }
    return { deleted: stale.length };
  },
});


