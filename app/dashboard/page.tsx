"use client";

import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FloatingOrb } from "@/components/FloatingOrb";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function enterRoom(
  router: ReturnType<typeof useRouter>,
  roomId: string,
  userId: string,
  displayName: string,
  claudeName: string,
) {
  sessionStorage.setItem("userId", userId);
  sessionStorage.setItem("displayName", displayName);
  sessionStorage.setItem("claudeName", claudeName);
  try {
    const servers = localStorage.getItem("chatos:mcpServers") ?? "[]";
    sessionStorage.setItem("chatos:mcpServers", servers);
  } catch {
    // localStorage unavailable
  }
  router.push(`/room/${roomId}`);
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const friends = useQuery(api.dashboard.getFriendsWithPresence);
  const rooms = useQuery(api.dashboard.getMyRooms);
  const createRoom = useMutation(api.rooms.createRoom);
  const deleteRoom = useMutation(api.rooms.deleteRoom);
  const router = useRouter();
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const handleCreateRoom = async () => {
    setCreatingRoom(true);
    try {
      const { roomId } = await createRoom({});
      router.push(`/join/${roomId}`);
    } finally {
      setCreatingRoom(false);
    }
  };

  if (isLoading) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
        <div className="min-h-screen flex items-center justify-center">
          <div
            className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(223,166,73,0.2)", borderTopColor: "var(--amber)" }}
          />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "var(--bg)" }}
      >
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.4) 0%, transparent 70%)",
          }}
        />
        <FloatingOrb
          className="w-[320px] h-[320px] opacity-[0.07]"
          style={{ background: "var(--amber)", top: "-8%", right: "-6%" }}
          delay={0}
        />
        <FloatingOrb
          className="w-48 h-48 opacity-[0.05]"
          style={{ background: "var(--purple)", bottom: "10%", left: "-4%" }}
          delay={6}
        />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "var(--font-super-bakery)" }}>
            Dashboard
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Sign in to view your friends and chat history.
          </p>
          <SignInButton mode="modal">
            <button
              className="px-6 py-3 rounded-xl font-bold text-sm"
              style={{
                background: "var(--amber)",
                color: "var(--deep-dark)",
                fontFamily: "var(--font-super-bakery)",
                boxShadow: "0 0 30px rgba(223,166,73,0.2)",
              }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  const onlineFriends = friends?.filter((f) => f.isOnline) ?? [];
  const offlineFriends = friends?.filter((f) => !f.isOnline) ?? [];

  return (
    <main className="relative min-h-screen px-4 pb-8 overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />
      {/* Grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.018]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "120px",
        }}
      />
      <FloatingOrb
        className="w-[360px] h-[360px] opacity-[0.06]"
        style={{ background: "var(--amber)", top: "-8%", right: "-6%" }}
        delay={0}
      />
      <FloatingOrb
        className="w-56 h-56 opacity-[0.05]"
        style={{ background: "var(--mauve)", bottom: "10%", left: "-4%" }}
        delay={7}
      />

      <div className="relative z-10 max-w-2xl mx-auto page-topbar-offset">
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                Friends
                {friends && friends.length > 0 && <span style={{ color: "var(--text-dim)" }}> · {friends.length}</span>}
              </h2>
              {onlineFriends.length > 0 && <span className="text-xs" style={{ color: "var(--soft-green)" }}>{onlineFriends.length} online</span>}
            </div>

            {(friends?.length ?? 0) === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>
                  No friends yet.
                </p>
                <a href="/friends" className="text-xs" style={{ color: "var(--sage-teal)" }}>
                  Add some -&gt;
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {[...onlineFriends, ...offlineFriends].map((f) => (
                  <div
                    key={f._id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: f.isOnline ? "var(--soft-green)" : "var(--text-dim)",
                        boxShadow: f.isOnline ? "0 0 6px rgba(151,209,129,0.6)" : "none",
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: f.isOnline ? "var(--fg)" : "var(--text-muted)" }}>
                        {f.displayName ?? f.username}
                      </p>
                      {f.username && <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{f.username}</p>}
                    </div>
                    <span className="ml-auto text-xs shrink-0" style={{ color: f.isOnline ? "var(--soft-green)" : "var(--text-dim)" }}>
                      {f.isOnline ? "online" : "offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                Recent rooms
              </h2>
              <button
                onClick={handleCreateRoom}
                disabled={creatingRoom}
                className="text-xs transition-colors"
                style={{ color: "var(--sage-teal)", opacity: creatingRoom ? 0.6 : 1 }}
              >
                {creatingRoom ? "Creating..." : "+ New room"}
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Rooms created without an account auto-delete after 72 hours of inactivity.
            </p>

            {(rooms?.length ?? 0) === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>
                  No rooms yet.
                </p>
                <Link href="/" className="text-xs" style={{ color: "var(--sage-teal)" }}>
                  Create one -&gt;
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rooms!.map((r) => (
                  <div
                    key={r!.roomId}
                    className="rounded-xl transition-colors duration-150"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    <div className="flex items-center justify-between gap-2 px-4 pt-3">
                      <button onClick={() => enterRoom(router, r!.roomId, r!.userId, r!.displayName, r!.claudeName)} className="text-left flex items-center gap-2">
                        {r!.roomTitle ? (
                          <>
                            <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                              {r!.roomTitle}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                              style={{
                                background: "rgba(139,189,185,0.08)",
                                color: "var(--text-dim)",
                                border: "1px solid rgba(139,189,185,0.1)",
                              }}
                            >
                              {r!.roomCode}
                            </span>
                          </>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-mono"
                            style={{
                              background: "rgba(139,189,185,0.1)",
                              color: "var(--sage-teal)",
                              border: "1px solid rgba(139,189,185,0.15)",
                            }}
                          >
                            {r!.roomCode}
                          </span>
                        )}
                      </button>
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {r!.participantCount} {r!.participantCount === 1 ? "person" : "people"}
                      </span>
                      {r!.canDelete && (
                        <button
                          onClick={async () => {
                            const confirmed = window.confirm(`Delete room ${r!.roomTitle || r!.roomCode}? This cannot be undone.`);
                            if (!confirmed) return;
                            setDeletingRoomId(r!.roomId);
                            try {
                              await deleteRoom({ roomId: r!.roomId });
                            } finally {
                              setDeletingRoomId(null);
                            }
                          }}
                          disabled={deletingRoomId === r!.roomId}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            color: "#ff9a9a",
                            border: "1px solid rgba(255,154,154,0.25)",
                            opacity: deletingRoomId === r!.roomId ? 0.55 : 1,
                          }}
                        >
                          {deletingRoomId === r!.roomId ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>

                    <button onClick={() => enterRoom(router, r!.roomId, r!.userId, r!.displayName, r!.claudeName)} className="flex w-full flex-col gap-1.5 px-4 pb-3 pt-2 text-left">
                      {r!.lastMessage ? (
                        <div className="min-w-0">
                          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--fg)" }}>{r!.lastMessage.fromDisplayName}: </span>
                            {r!.lastMessage.content.slice(0, 80)}
                            {r!.lastMessage.content.length > 80 ? "..." : ""}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                            {timeAgo(r!.lastMessage.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                          No messages yet
                        </p>
                      )}

                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {r!.retentionPolicy === "guest_ttl_72h"
                          ? `Auto-deletes after 72h inactivity (last active ${timeAgo(r!.lastActivityAt)})`
                          : "Persistent room (account-owned)"}
                      </p>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
