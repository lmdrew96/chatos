import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";

async function resolveMe(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export const sendRoomInvite = mutation({
  args: { roomId: v.id("rooms"), toId: v.id("users") },
  handler: async (ctx, { roomId, toId }) => {
    const me = await resolveMe(ctx);
    if (!me) throw new Error("Not authenticated");

    // Deduplicate — don't send if a pending invite already exists.
    // Use collect() instead of unique() because prior accepted/declined invites
    // mean multiple rows can match the index, and unique() would throw.
    const existing = await ctx.db
      .query("roomInvites")
      .withIndex("by_room_and_to", (q) => q.eq("roomId", roomId).eq("toId", toId))
      .collect();
    if (existing.some((inv) => inv.status === "pending")) return;

    await ctx.db.insert("roomInvites", {
      roomId,
      fromId: me._id,
      toId,
      status: "pending",
    });

    // Push notification to invitee
    const recipient = await ctx.db.get(toId);
    if (recipient?.tokenIdentifier) {
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendPushForRoomInvite, {
        fromUserId: me._id,
        toTokenIdentifier: recipient.tokenIdentifier,
        roomId,
      });
    }
  },
});

export const respondToRoomInvite = mutation({
  args: { inviteId: v.id("roomInvites"), accept: v.boolean() },
  handler: async (ctx, { inviteId, accept }) => {
    const me = await resolveMe(ctx);
    if (!me) throw new Error("Not authenticated");

    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.toId !== me._id) throw new Error("Unauthorized");

    await ctx.db.patch(inviteId, { status: accept ? "accepted" : "declined" });
    return accept ? invite.roomId : null;
  },
});

export const getPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const me = await resolveMe(ctx);
    if (!me) return [];

    const invites = await ctx.db
      .query("roomInvites")
      .withIndex("by_to_and_status", (q) => q.eq("toId", me._id).eq("status", "pending"))
      .collect();

    return Promise.all(
      invites.map(async (inv) => {
        const [room, sender] = await Promise.all([
          ctx.db.get(inv.roomId),
          ctx.db.get(inv.fromId),
        ]);
        return {
          ...inv,
          room: { _id: room?._id, roomCode: room?.roomCode },
          sender: { _id: sender?._id, username: sender?.username, displayName: sender?.displayName },
        };
      })
    );
  },
});
