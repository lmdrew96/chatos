import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const sendMessage = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.roomId, { lastActivityAt: Date.now() });
    return messageId;
  },
});

export const updateStreamingMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    isStreaming: v.optional(v.boolean()),
    mentions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { messageId, content, isStreaming, mentions }) => {
    const patch: { content: string; isStreaming?: boolean; mentions?: string[] } = { content };
    if (isStreaming !== undefined) patch.isStreaming = isStreaming;
    if (mentions !== undefined) patch.mentions = mentions;
    await ctx.db.patch(messageId, patch);
  },
});

export const searchUserMessages = query({
  args: { fromUserId: v.string(), searchQuery: v.string() },
  handler: async (ctx, { fromUserId, searchQuery }) => {
    return await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        q.search("content", searchQuery).eq("fromUserId", fromUserId)
      )
      .take(5);
  },
});

export const useMessages = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("asc")
      .collect();

    return await Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        attachments: msg.attachments
          ? await Promise.all(
              msg.attachments.map(async (a) => ({
                ...a,
                url: (await ctx.storage.getUrl(a.storageId)) ?? "",
              }))
            )
          : undefined,
      }))
    );
  },
});
