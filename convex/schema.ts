import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    roomCode: v.string(),
    createdAt: v.number(),
    ownerTokenIdentifier: v.optional(v.string()),
    lastActivityAt: v.optional(v.number()),
    retentionPolicy: v.optional(v.union(v.literal("persistent"), v.literal("guest_ttl_72h"))),
  }).index("by_code", ["roomCode"])
    .index("by_retention_policy_and_last_activity_at", ["retentionPolicy", "lastActivityAt"]),

  participants: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    tokenIdentifier: v.optional(v.string()),
    displayName: v.string(),
    claudeName: v.string(),
    systemPrompt: v.string(),
    isOnline: v.boolean(),
    color: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
  }).index("by_room", ["roomId"])
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_room_and_token_identifier", ["roomId", "tokenIdentifier"])
    .index("by_room_and_user_id", ["roomId", "userId"])
    .index("by_room_and_claude_name", ["roomId", "claudeName"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    fromUserId: v.string(),
    fromDisplayName: v.string(),
    type: v.union(v.literal("user"), v.literal("claude"), v.literal("system")),
    claudeName: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    content: v.string(),
    gifUrl: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.number(),
        })
      )
    ),
    mentions: v.array(v.string()),
    mentionDepth: v.optional(v.number()),
    isStreaming: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_room", ["roomId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["fromUserId"],
    }),

  users: defineTable({
    tokenIdentifier: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    isOnline: v.optional(v.boolean()),
  }).index("by_token", ["tokenIdentifier"])
    .index("by_username", ["username"]),

  friendRequests: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
  }).index("by_to_and_status", ["toId", "status"])
    .index("by_from_and_status", ["fromId", "status"])
    .index("by_from_and_to", ["fromId", "toId"]),

  roomInvites: defineTable({
    roomId: v.id("rooms"),
    fromId: v.id("users"),
    toId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
  }).index("by_to_and_status", ["toId", "status"])
    .index("by_room_and_to", ["roomId", "toId"])
    .index("by_room", ["roomId"]),

  typingIndicators: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    displayName: v.string(),
    typingAt: v.number(),
  }).index("by_room", ["roomId"])
    .index("by_room_and_user", ["roomId", "userId"]),

  apiKeys: defineTable({
    tokenIdentifier: v.string(),
    encryptedKey: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  gifFavorites: defineTable({
    tokenIdentifier: v.string(),
    gifId: v.string(),
    url: v.string(),
    previewUrl: v.string(),
    description: v.optional(v.string()),
    savedAt: v.number(),
  }).index("by_token", ["tokenIdentifier"])
    .index("by_token_and_gif_id", ["tokenIdentifier", "gifId"]),

  claudeMemories: defineTable({
    ownerUserId: v.string(),
    claudeName: v.string(),
    summary: v.string(),
    updatedAt: v.number(),
    lastAccessedAt: v.optional(v.number()),
    messageCount: v.number(),
  }).index("by_owner_and_claude_name", ["ownerUserId", "claudeName"])
    .index("by_last_accessed", ["lastAccessedAt"]),
});
