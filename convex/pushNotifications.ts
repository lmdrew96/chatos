"use node";

import { ActionCtx, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import webpush from "web-push";

const sendPushToUser = async (
  ctx: ActionCtx,
  args: {
    recipientTokenIdentifier: string;
    title: string;
    body: string;
    url?: string;
    tag?: string;
  }
) => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const subscriptions = await ctx.runQuery(
    internal.pushNotificationsHelpers.getSubscriptionsForUser,
    { tokenIdentifier: args.recipientTokenIdentifier }
  );

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: args.title,
    body: args.body,
    url: args.url ?? "/dashboard",
    tag: args.tag,
  });

  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
        console.error(`Push failed for ${sub.endpoint}:`, err.statusCode);
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await ctx.runMutation(
      internal.pushNotificationsHelpers.removeStaleSubscriptions,
      { endpoints: staleEndpoints }
    );
  }
};

export const sendPushForMessage = internalAction({
  args: {
    roomId: v.id("rooms"),
    senderUserId: v.string(),
    senderDisplayName: v.string(),
    contentPreview: v.string(),
    mentions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const offlineParticipants = await ctx.runQuery(
      internal.pushNotificationsHelpers.getOfflineParticipants,
      { roomId: args.roomId, excludeUserId: args.senderUserId }
    );

    for (const participant of offlineParticipants) {
      if (!participant.tokenIdentifier) continue;

      const isMentioned = args.mentions.includes(participant.userId);
      const title = isMentioned
        ? `${args.senderDisplayName} mentioned you`
        : `${args.senderDisplayName} in Cha(t)os`;

      await sendPushToUser(ctx, {
        recipientTokenIdentifier: participant.tokenIdentifier,
        title,
        body: args.contentPreview,
        url: `/room/${args.roomId}`,
        tag: `room-${args.roomId}`,
      });
    }
  },
});

export const sendPushForFriendRequest = internalAction({
  args: {
    fromUserId: v.id("users"),
    toTokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const sender = await ctx.runQuery(
      internal.pushNotificationsHelpers.getUserById,
      { userId: args.fromUserId }
    );
    const senderName = sender?.displayName ?? sender?.username ?? "Someone";

    await sendPushToUser(ctx, {
      recipientTokenIdentifier: args.toTokenIdentifier,
      title: "New friend request",
      body: `${senderName} wants to be friends`,
      url: "/friends",
      tag: "friend-request",
    });
  },
});

export const sendPushForRoomInvite = internalAction({
  args: {
    fromUserId: v.id("users"),
    toTokenIdentifier: v.string(),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const sender = await ctx.runQuery(
      internal.pushNotificationsHelpers.getUserById,
      { userId: args.fromUserId }
    );
    const senderName = sender?.displayName ?? sender?.username ?? "Someone";

    await sendPushToUser(ctx, {
      recipientTokenIdentifier: args.toTokenIdentifier,
      title: "Room invite",
      body: `${senderName} invited you to a room`,
      url: `/join/${args.roomId}`,
      tag: `invite-${args.roomId}`,
    });
  },
});
