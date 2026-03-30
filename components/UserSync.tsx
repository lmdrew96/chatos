"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);
  const updatePresence = useMutation(api.users.updatePresence);

  // Sync Clerk profile to Convex
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    upsertUser({
      username: user.username ?? undefined,
      displayName: user.fullName ?? user.firstName ?? undefined,
    });
  }, [isAuthenticated, user, upsertUser]);

  // Global online presence
  useEffect(() => {
    if (!isAuthenticated) return;
    updatePresence({ isOnline: true });

    const handleUnload = () => updatePresence({ isOnline: false });
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      updatePresence({ isOnline: false });
    };
  }, [isAuthenticated, updatePresence]);

  return null;
}
