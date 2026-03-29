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
    displayName: v.string(),
    claudeName: v.string(),
    systemPrompt: v.string(),
    isOnline: v.boolean(),
  }).index("by_room", ["roomId"]),

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
});
