"use client";

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const friends = useQuery(api.dashboard.getFriendsWithPresence);
  const rooms = useQuery(api.dashboard.getMyRooms);
  const router = useRouter();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--deep-dark)" }}
      >
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(223,166,73,0.2)", borderTopColor: "var(--amber)" }}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: "var(--deep-dark)" }}
      >
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.4) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "var(--font-super-bakery)" }}
          >
            Dashboard
          </h1>
          <p className="text-sm" style={{ color: "rgba(247,245,250,0.4)" }}>
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
    <main className="min-h-screen px-4 py-8" style={{ background: "var(--deep-dark)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto">
        <TopBar current="dashboard" />

        <div className="grid gap-8 md:grid-cols-2 mt-8">
          {/* Friends section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "rgba(247,245,250,0.3)" }}
              >
                Friends
                {friends && friends.length > 0 && (
                  <span style={{ color: "rgba(247,245,250,0.2)" }}> · {friends.length}</span>
                )}
              </h2>
              {onlineFriends.length > 0 && (
                <span className="text-xs" style={{ color: "var(--soft-green)" }}>
                  {onlineFriends.length} online
                </span>
              )}
            </div>

            {(friends?.length ?? 0) === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(247,245,250,0.06)" }}
              >
                <p className="text-sm mb-2" style={{ color: "rgba(247,245,250,0.25)" }}>
                  No friends yet.
                </p>
                <a
                  href="/friends"
                  className="text-xs"
                  style={{ color: "var(--sage-teal)" }}
                >
                  Add some →
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {[...onlineFriends, ...offlineFriends].map((f) => (
                  <div
                    key={f._id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(247,245,250,0.06)",
                    }}
                  >
                    {/* Presence dot */}
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: f.isOnline ? "var(--soft-green)" : "rgba(247,245,250,0.15)",
                        boxShadow: f.isOnline ? "0 0 6px rgba(151,209,129,0.6)" : "none",
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: f.isOnline ? "var(--off-white)" : "rgba(247,245,250,0.55)" }}
                      >
                        {f.displayName ?? f.username}
                      </p>
                      {f.username && (
                        <p className="text-xs truncate" style={{ color: "rgba(247,245,250,0.3)" }}>
                          @{f.username}
                        </p>
                      )}
                    </div>
                    <span
                      className="ml-auto text-xs shrink-0"
                      style={{ color: f.isOnline ? "var(--soft-green)" : "rgba(247,245,250,0.2)" }}
                    >
                      {f.isOnline ? "online" : "offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Chat history section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "rgba(247,245,250,0.3)" }}
              >
                Recent rooms
              </h2>
              <button
                onClick={() => router.push("/")}
                className="text-xs transition-colors"
                style={{ color: "var(--sage-teal)" }}
              >
                + New room
              </button>
            </div>

            {(rooms?.length ?? 0) === 0 ? (
              <div
                className="px-4 py-5 rounded-xl text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(247,245,250,0.06)" }}
              >
                <p className="text-sm mb-2" style={{ color: "rgba(247,245,250,0.25)" }}>
                  No rooms yet.
                </p>
                <a href="/" className="text-xs" style={{ color: "var(--sage-teal)" }}>
                  Create one →
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rooms!.map((r) => (
                  <button
                    key={r!.roomId}
                    onClick={() => router.push(`/join/${r!.roomId}`)}
                    className="flex flex-col gap-1.5 px-4 py-3 rounded-xl text-left w-full transition-all"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(247,245,250,0.06)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)";
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(247,245,250,0.1)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(247,245,250,0.06)";
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
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
                      <span className="text-xs" style={{ color: "rgba(247,245,250,0.25)" }}>
                        {r!.participantCount} {r!.participantCount === 1 ? "person" : "people"}
                      </span>
                    </div>

                    {r!.lastMessage ? (
                      <div className="min-w-0">
                        <p
                          className="text-xs truncate"
                          style={{ color: "rgba(247,245,250,0.45)" }}
                        >
                          <span style={{ color: "rgba(247,245,250,0.6)" }}>
                            {r!.lastMessage.type === "claude"
                              ? r!.lastMessage.fromDisplayName
                              : r!.lastMessage.fromDisplayName}
                            :{" "}
                          </span>
                          {r!.lastMessage.content.slice(0, 80)}
                          {r!.lastMessage.content.length > 80 ? "…" : ""}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(247,245,250,0.2)" }}>
                          {timeAgo(r!.lastMessage.createdAt)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "rgba(247,245,250,0.2)" }}>
                        No messages yet
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
