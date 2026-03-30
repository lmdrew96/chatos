import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MutationCtx, QueryCtx } from "./_generated/server";

async function resolveMe(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export const sendFriendRequest = mutation({
  args: { toId: v.id("users") },
  handler: async (ctx, { toId }) => {
    const me = await resolveMe(ctx);
    if (!me) throw new Error("Not authenticated");
    if (me._id === toId) throw new Error("Cannot add yourself");

    const existing = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_and_to", (q) => q.eq("fromId", me._id).eq("toId", toId))
      .unique();
    if (existing) throw new Error("Friend request already sent");

    // If they already sent us one, auto-accept it
    const reverse = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_and_to", (q) => q.eq("fromId", toId).eq("toId", me._id))
      .unique();
    if (reverse?.status === "accepted") throw new Error("Already friends");
    if (reverse?.status === "pending") {
      await ctx.db.patch(reverse._id, { status: "accepted" });
      return;
    }

    await ctx.db.insert("friendRequests", { fromId: me._id, toId, status: "pending" });
  },
});

export const respondToFriendRequest = mutation({
  args: { requestId: v.id("friendRequests"), accept: v.boolean() },
  handler: async (ctx, { requestId, accept }) => {
    const me = await resolveMe(ctx);
    if (!me) throw new Error("Not authenticated");

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");
    if (request.toId !== me._id) throw new Error("Unauthorized");

    await ctx.db.patch(requestId, { status: accept ? "accepted" : "declined" });
  },
});

export const cancelFriendRequest = mutation({
  args: { requestId: v.id("friendRequests") },
  handler: async (ctx, { requestId }) => {
    const me = await resolveMe(ctx);
    if (!me) throw new Error("Not authenticated");

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");
    if (request.fromId !== me._id) throw new Error("Unauthorized");

    await ctx.db.delete(requestId);
  },
});

export const getIncomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await resolveMe(ctx);
    if (!me) return [];

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_to_and_status", (q) => q.eq("toId", me._id).eq("status", "pending"))
      .collect();

    return Promise.all(
      requests.map(async (r) => {
        const sender = await ctx.db.get(r.fromId);
        return {
          ...r,
          sender: { _id: sender?._id, username: sender?.username, displayName: sender?.displayName },
        };
      })
    );
  },
});

export const getOutgoingRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await resolveMe(ctx);
    if (!me) return [];

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_and_status", (q) => q.eq("fromId", me._id).eq("status", "pending"))
      .collect();

    return Promise.all(
      requests.map(async (r) => {
        const target = await ctx.db.get(r.toId);
        return {
          ...r,
          target: { _id: target?._id, username: target?.username, displayName: target?.displayName },
        };
      })
    );
  },
});

export const getFriends = query({
  args: {},
  handler: async (ctx) => {
    const me = await resolveMe(ctx);
    if (!me) return [];

    const [sent, received] = await Promise.all([
      ctx.db
        .query("friendRequests")
        .withIndex("by_from_and_status", (q) => q.eq("fromId", me._id).eq("status", "accepted"))
        .collect(),
      ctx.db
        .query("friendRequests")
        .withIndex("by_to_and_status", (q) => q.eq("toId", me._id).eq("status", "accepted"))
        .collect(),
    ]);

    const [sentFriends, receivedFriends] = await Promise.all([
      Promise.all(
        sent.map(async (r) => {
          const user = await ctx.db.get(r.toId);
          return { requestId: r._id, _id: user!._id, username: user?.username, displayName: user?.displayName };
        })
      ),
      Promise.all(
        received.map(async (r) => {
          const user = await ctx.db.get(r.fromId);
          return { requestId: r._id, _id: user!._id, username: user?.username, displayName: user?.displayName };
        })
      ),
    ]);

    return [...sentFriends, ...receivedFriends];
  },
});
