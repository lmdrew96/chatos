"use client";

import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

export function NotificationBell() {
  const { isAuthenticated } = useConvexAuth();
  const incomingRequests = useQuery(api.friends.getIncomingRequests);
  const pendingInvites = useQuery(api.invites.getPendingInvites);
  const respondToRequest = useMutation(api.friends.respondToFriendRequest);
  const respondToInvite = useMutation(api.invites.respondToRoomInvite);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isAuthenticated) return null;

  const requestCount = incomingRequests?.length ?? 0;
  const inviteCount = pendingInvites?.length ?? 0;
  const totalCount = requestCount + inviteCount;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
        style={{
          color: open ? "var(--amber)" : "var(--text-muted)",
          background: open ? "rgba(223,166,73,0.08)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = "var(--fg)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5A4.5 4.5 0 0 0 3.5 6v2.5L2 10h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 13a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        {totalCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
            style={{ background: "var(--amber)", color: "var(--deep-dark)" }}
          >
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-xl overflow-hidden z-50"
          style={{
            background: "#1a1530",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Notifications
            </span>
            <button
              onClick={() => { setOpen(false); router.push("/friends"); }}
              className="text-xs transition-colors"
              style={{ color: "var(--sage-teal)" }}
            >
              See all
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* Friend requests */}
            {requestCount > 0 && (
              <div>
                <p
                  className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Friend Requests
                </p>
                {incomingRequests!.map((r) => (
                  <div
                    key={r._id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                        {r.sender.displayName ?? r.sender.username}
                      </p>
                      {r.sender.username && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          @{r.sender.username}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => respondToRequest({ requestId: r._id, accept: true })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{ background: "rgba(151,209,129,0.15)", color: "var(--soft-green)" }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respondToRequest({ requestId: r._id, accept: false })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                        style={{ background: "var(--border-subtle)", color: "var(--text-muted)" }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Room invites */}
            {inviteCount > 0 && (
              <div>
                <p
                  className="px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Room Invites
                </p>
                {pendingInvites!.map((inv) => (
                  <div
                    key={inv._id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                        {inv.sender.displayName ?? inv.sender.username} invited you
                      </p>
                      <p className="text-xs font-mono" style={{ color: "var(--sage-teal)" }}>
                        {inv.room.roomCode}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          await respondToInvite({ inviteId: inv._id, accept: true });
                          setOpen(false);
                          router.push(`/join/${inv.roomId}`);
                        }}
                        className="px-2.5 py-1 rounded-md text-xs font-medium"
                        style={{ background: "rgba(223,166,73,0.15)", color: "var(--amber)" }}
                      >
                        Join
                      </button>
                      <button
                        onClick={() => respondToInvite({ inviteId: inv._id, accept: false })}
                        className="px-2.5 py-1 rounded-md text-xs font-medium"
                        style={{ background: "var(--border-subtle)", color: "var(--text-muted)" }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalCount === 0 && (
              <p
                className="px-4 py-6 text-sm text-center"
                style={{ color: "var(--text-dim)" }}
              >
                No new notifications
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
