"use client";

import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SignInButton } from "@clerk/nextjs";
import { useState, useRef, useEffect } from "react";

export function InviteButton({ roomId }: { roomId: Id<"rooms"> }) {
  const { isAuthenticated } = useConvexAuth();
  const friends = useQuery(api.friends.getFriends);
  const sendInvite = useMutation(api.invites.sendRoomInvite);

  const [open, setOpen] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [errorId, setErrorId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleInvite = async (toId: Id<"users">) => {
    setErrorId(null);
    try {
      await sendInvite({ roomId, toId });
      setInvitedIds((prev) => new Set(prev).add(toId));
    } catch (err) {
      console.error("[InviteButton] sendRoomInvite failed:", err);
      setErrorId(toId);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: open ? "rgba(139,189,185,0.15)" : "rgba(139,189,185,0.08)",
          color: "var(--sage-teal)",
          border: "1px solid rgba(139,189,185,0.15)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="4.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 10c0-2 1.5-3 3.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9 7v4M7 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        Invite
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-[calc(100vw-2rem)] sm:w-64 max-w-[280px] rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Invite friends
            </p>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {!isAuthenticated ? (
              <div className="px-4 py-4 flex flex-col items-center gap-3 text-center">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Sign in to invite friends
                </p>
                <SignInButton mode="modal">
                  <button
                    className="px-4 py-2 rounded-lg text-xs font-bold"
                    style={{ background: "var(--amber)", color: "var(--deep-dark)" }}
                  >
                    Sign in
                  </button>
                </SignInButton>
              </div>
            ) : (friends?.length ?? 0) === 0 ? (
              <p className="px-4 py-4 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                No friends yet.{" "}
                <a href="/friends" className="underline" style={{ color: "var(--sage-teal)" }}>
                  Add some →
                </a>
              </p>
            ) : (
              friends!.map((f) => (
                <div
                  key={f._id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--fg)" }}>
                      {f.displayName ?? f.username}
                    </p>
                    {f.username && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        @{f.username}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleInvite(f._id)}
                    disabled={invitedIds.has(f._id)}
                    className="ml-3 px-2.5 py-1 rounded-md text-xs font-medium shrink-0 transition-all"
                    style={{
                      background: invitedIds.has(f._id)
                        ? "rgba(151,209,129,0.1)"
                        : errorId === f._id
                        ? "rgba(255,100,100,0.1)"
                        : "rgba(223,166,73,0.15)",
                      color: invitedIds.has(f._id)
                        ? "var(--soft-green)"
                        : errorId === f._id
                        ? "#FF9090"
                        : "var(--amber)",
                      cursor: invitedIds.has(f._id) ? "default" : "pointer",
                    }}
                  >
                    {invitedIds.has(f._id) ? "Invited ✓" : errorId === f._id ? "Failed — retry?" : "Invite"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
