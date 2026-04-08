"use client";

import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { registerServiceWorker, subscribeToPush } from "@/lib/pushSubscription";

export function PushSubscriptionManager() {
  const { isAuthenticated } = useConvexAuth();
  const saveSub = useMutation(api.pushSubscriptions.savePushSubscription);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window === "undefined") return;
    if (!("PushManager" in window)) return;

    let cancelled = false;

    (async () => {
      const reg = await registerServiceWorker();
      if (!reg || cancelled) return;

      const permission = await Notification.requestPermission();
      if (permission !== "granted" || cancelled) return;

      const sub = await subscribeToPush(
        reg,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      );
      if (!sub || cancelled) return;

      const keys = sub.toJSON().keys!;
      await saveSub({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh!,
        auth: keys.auth!,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, saveSub]);

  return null;
}
