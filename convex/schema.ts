import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    roomCode: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["roomCode"]),

  participants: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    tokenIdentifier: v.optional(v.string()),
    displayName: v.string(),
    claudeName: v.string(),
    systemPrompt: v.string(),
    isOnline: v.boolean(),
  }).index("by_room", ["roomId"])
    .index("by_token_identifier", ["tokenIdentifier"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    fromUserId: v.string(),
    fromDisplayName: v.string(),
    type: v.union(v.literal("user"), v.literal("claude"), v.literal("system")),
    claudeName: v.optional(v.string()),
    ownerUserId: v.optional(v.string()),
    content: v.string(),
    mentions: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),

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
    .index("by_room_and_to", ["roomId", "toId"]),
});
