import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";

async function resolveMe(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export const getFriendsWithPresence = query({
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

    const friendIds = [
      ...sent.map((r) => r.toId),
      ...received.map((r) => r.fromId),
    ];

    return Promise.all(
      friendIds.map(async (id) => {
        const user = await ctx.db.get(id);
        return {
          _id: user!._id,
          username: user?.username,
          displayName: user?.displayName,
          isOnline: user?.isOnline ?? false,
        };
      })
    );
  },
});

export const getMyRooms = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const tokenIdentifier = identity.tokenIdentifier;

    const myParticipants = await ctx.db
      .query("participants")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier)
      )
      .take(20);

    return Promise.all(
      myParticipants.map(async (p) => {
        const room = await ctx.db.get(p.roomId);
        if (!room) return null;

        const allParticipants = await ctx.db
          .query("participants")
          .withIndex("by_room", (q) => q.eq("roomId", p.roomId))
          .take(50);

        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_room", (q) => q.eq("roomId", p.roomId))
          .order("desc")
          .first();

        const retentionPolicy = room.retentionPolicy
          ?? (room.ownerTokenIdentifier ? "persistent" : "guest_ttl_72h");

        return {
          roomId: p.roomId,
          roomCode: room.roomCode,
          retentionPolicy,
          lastActivityAt: room.lastActivityAt ?? room.createdAt,
          canDelete: room.ownerTokenIdentifier === tokenIdentifier,
          participantCount: allParticipants.length,
          userId: p.userId,
          displayName: p.displayName,
          claudeName: p.claudeName,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                fromDisplayName: lastMessage.fromDisplayName,
                createdAt: lastMessage.createdAt,
                type: lastMessage.type,
              }
            : null,
        };
      })
    ).then((rooms) => rooms.filter(Boolean));
  },
});
