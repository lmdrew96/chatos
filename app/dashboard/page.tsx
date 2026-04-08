"use client";

import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useMemo } from "react";
import { FloatingOrb } from "@/components/FloatingOrb";

type SortOption = "activity" | "alpha" | "participants" | "newest";
type FilterOption = "all" | "mine" | "guest" | "persistent";

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

function OverflowMenu({
  onDelete,
  deleting,
  roomLabel,
}: {
  onDelete: () => void;
  deleting: boolean;
  roomLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="overflow-menu-trigger rounded-md px-1.5 py-1 text-sm transition-colors"
        style={{ color: "var(--text-dim)" }}
        aria-label={`Options for ${roomLabel}`}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 rounded-lg py-1 min-w-[140px]"
          style={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setOpen(false);
            }}
            disabled={deleting}
            className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5"
            style={{ color: "#ff9a9a", opacity: deleting ? 0.5 : 1 }}
          >
            {deleting ? "Deleting..." : "Delete room"}
          </button>
        </div>
      )}
    </div>
  );
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("activity");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRooms = useMemo(() => {
    if (!rooms) return [];
    let result = [...rooms];

    // Filter
    if (filterBy === "mine") result = result.filter((r) => r!.canDelete);
    else if (filterBy === "guest") result = result.filter((r) => r!.retentionPolicy === "guest_ttl_72h");
    else if (filterBy === "persistent") result = result.filter((r) => r!.retentionPolicy === "persistent");

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r!.roomTitle ?? "").toLowerCase().includes(q) ||
          r!.roomCode.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "activity":
          return b!.lastActivityAt - a!.lastActivityAt;
        case "alpha":
          return (a!.roomTitle || a!.roomCode).localeCompare(b!.roomTitle || b!.roomCode);
        case "participants":
          return b!.participantCount - a!.participantCount;
        case "newest":
          return b!.createdAt - a!.createdAt;
        default:
          return 0;
      }
    });

    return result;
  }, [rooms, sortBy, filterBy, searchQuery]);

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
  const activeRoomCount = rooms?.length ?? 0;
  const mostRecentRoomId = rooms?.[0]?.roomId;

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Background effects */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />
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

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 page-topbar-offset pb-8">
        {/* Welcome bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-super-bakery)", color: "var(--fg)" }}
            >
              Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {activeRoomCount === 0
                ? "No active rooms"
                : `${activeRoomCount} active room${activeRoomCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={creatingRoom}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: "var(--amber)",
              color: "var(--deep-dark)",
              opacity: creatingRoom ? 0.6 : 1,
              boxShadow: "0 0 20px rgba(223,166,73,0.15)",
            }}
          >
            {creatingRoom ? "Creating..." : "+ New room"}
          </button>
        </div>

        {/* Sidebar + Main layout */}
        <div className="flex gap-6">
          {/* Friends sidebar */}
          <aside
            className="dashboard-sidebar shrink-0 hidden lg:block"
            style={{ width: "260px" }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2
                  className="text-xs font-semibold tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Friends
                  {friends && friends.length > 0 && (
                    <span style={{ color: "var(--text-dim)" }}> · {friends.length}</span>
                  )}
                </h2>
                {onlineFriends.length > 0 && (
                  <span className="text-xs font-medium" style={{ color: "var(--soft-green)" }}>
                    {onlineFriends.length} online
                  </span>
                )}
              </div>

              <div className="px-2 pb-2">
                {(friends?.length ?? 0) === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>
                      No friends yet.
                    </p>
                    <a href="/friends" className="text-xs" style={{ color: "var(--sage-teal)" }}>
                      Add some -&gt;
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {[...onlineFriends, ...offlineFriends].map((f) => (
                      <div
                        key={f._id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 cursor-default"
                        style={{ background: "transparent" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            background: f.isOnline ? "var(--soft-green)" : "var(--text-dim)",
                            boxShadow: f.isOnline
                              ? "0 0 8px rgba(151,209,129,0.7)"
                              : "none",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            style={{
                              color: f.isOnline ? "var(--fg)" : "var(--text-muted)",
                            }}
                          >
                            {f.displayName ?? f.username}
                          </p>
                          {f.username && (
                            <p
                              className="text-xs truncate"
                              style={{ color: "var(--text-dim)" }}
                            >
                              @{f.username}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar footer */}
              <div
                className="px-4 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <Link
                  href="/friends"
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    color: "var(--sage-teal)",
                    background: "rgba(140,189,185,0.06)",
                    border: "1px solid rgba(140,189,185,0.1)",
                  }}
                >
                  Find &amp; invite friends
                </Link>
              </div>
            </div>
          </aside>

          {/* Mobile friends FAB */}
          <button
            className="lg:hidden fixed bottom-6 left-6 z-30 rounded-full p-3"
            style={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              color: "var(--text-muted)",
            }}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open friends panel"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            {onlineFriends.length > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: "var(--soft-green)", color: "var(--deep-dark)" }}
              >
                {onlineFriends.length}
              </span>
            )}
          </button>

          {/* Mobile friends bottom drawer */}
          {drawerOpen && (
            <div className="lg:hidden fixed inset-0 z-40">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setDrawerOpen(false)}
              />
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden animate-slide-up"
                style={{
                  background: "var(--bg)",
                  borderTop: "1px solid var(--border)",
                  maxHeight: "70vh",
                }}
              >
                {/* Drawer handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div
                    className="w-10 h-1 rounded-full"
                    style={{ background: "var(--border)" }}
                  />
                </div>

                <div className="px-4 pb-2 flex items-center justify-between">
                  <h2
                    className="text-xs font-semibold tracking-widest uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Friends
                    {friends && friends.length > 0 && (
                      <span style={{ color: "var(--text-dim)" }}> · {friends.length}</span>
                    )}
                  </h2>
                  <div className="flex items-center gap-3">
                    {onlineFriends.length > 0 && (
                      <span className="text-xs font-medium" style={{ color: "var(--soft-green)" }}>
                        {onlineFriends.length} online
                      </span>
                    )}
                    <button
                      onClick={() => setDrawerOpen(false)}
                      className="text-sm p-1"
                      style={{ color: "var(--text-dim)" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(70vh - 80px)" }}>
                  {(friends?.length ?? 0) === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>
                        No friends yet.
                      </p>
                      <a href="/friends" className="text-xs" style={{ color: "var(--sage-teal)" }}>
                        Add some -&gt;
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {[...onlineFriends, ...offlineFriends].map((f) => (
                        <div
                          key={f._id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              background: f.isOnline ? "var(--soft-green)" : "var(--text-dim)",
                              boxShadow: f.isOnline
                                ? "0 0 8px rgba(151,209,129,0.7)"
                                : "none",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm font-medium truncate"
                              style={{
                                color: f.isOnline ? "var(--fg)" : "var(--text-muted)",
                              }}
                            >
                              {f.displayName ?? f.username}
                            </p>
                            {f.username && (
                              <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>
                                @{f.username}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Drawer footer */}
                <div
                  className="px-4 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <Link
                    href="/friends"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      color: "var(--sage-teal)",
                      background: "rgba(140,189,185,0.06)",
                      border: "1px solid rgba(140,189,185,0.1)",
                    }}
                  >
                    Find &amp; invite friends
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Main content — rooms */}
          <section className="flex-1 min-w-0 overflow-hidden">
            {/* Sort / Filter toolbar */}
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-0 sm:min-w-[160px] sm:max-w-[280px]">
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    width="14" height="14" fill="none" viewBox="0 0 24 24"
                    stroke="var(--text-dim)" strokeWidth={2}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search rooms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--fg)",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Sort + Filter row */}
                <div className="flex items-center gap-2 sm:contents">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                    outline: "none",
                  }}
                >
                  <option value="activity">Recent activity</option>
                  <option value="newest">Newest first</option>
                  <option value="alpha">A → Z</option>
                  <option value="participants">Most people</option>
                </select>

                {/* Filter pills */}
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      ["all", "All"],
                      ["mine", "My rooms"],
                      ["persistent", "Persistent"],
                      ["guest", "Guest"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFilterBy(value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        background:
                          filterBy === value
                            ? "rgba(140,189,185,0.15)"
                            : "transparent",
                        color:
                          filterBy === value
                            ? "var(--sage-teal)"
                            : "var(--text-dim)",
                        border:
                          filterBy === value
                            ? "1px solid rgba(140,189,185,0.25)"
                            : "1px solid transparent",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {filteredRooms.length === 0
                    ? "No rooms match"
                    : `${filteredRooms.length} room${filteredRooms.length !== 1 ? "s" : ""}`}
                </p>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Guest rooms auto-delete after 72h inactivity
                </p>
              </div>
            </div>

            {(rooms?.length ?? 0) === 0 ? (
              <div
                className="px-6 py-12 rounded-2xl text-center"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>
                  No rooms yet.
                </p>
                <button
                  onClick={handleCreateRoom}
                  className="text-sm font-medium"
                  style={{ color: "var(--sage-teal)" }}
                >
                  Create your first room -&gt;
                </button>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div
                className="px-6 py-12 rounded-2xl text-center"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p className="text-sm mb-1" style={{ color: "var(--text-dim)" }}>
                  No rooms match your filters.
                </p>
                <button
                  onClick={() => { setFilterBy("all"); setSearchQuery(""); }}
                  className="text-xs font-medium"
                  style={{ color: "var(--sage-teal)" }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredRooms.map((r) => {
                  const isLatest = r!.roomId === mostRecentRoomId;
                  return (
                    <div
                      key={r!.roomId}
                      className="room-card group rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden min-w-0"
                      style={{
                        background: isLatest
                          ? "rgba(255,255,255,0.055)"
                          : "var(--surface)",
                        border: isLatest
                          ? "1px solid rgba(140,189,185,0.2)"
                          : "1px solid var(--border-subtle)",
                      }}
                      onClick={() =>
                        enterRoom(router, r!.roomId, r!.userId, r!.displayName, r!.claudeName)
                      }
                    >
                      <div className="p-5">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <h3
                              className="text-base font-bold truncate"
                              style={{ color: "var(--fg)" }}
                            >
                              {r!.roomTitle || r!.roomCode}
                            </h3>
                            {r!.roomTitle && (
                              <span
                                className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
                                style={{
                                  background: "rgba(139,189,185,0.06)",
                                  color: "var(--text-dim)",
                                  border: "1px solid rgba(139,189,185,0.08)",
                                }}
                              >
                                {r!.roomCode}
                              </span>
                            )}
                          </div>
                          {r!.canDelete && (
                            <div
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <OverflowMenu
                                roomLabel={r!.roomTitle || r!.roomCode}
                                deleting={deletingRoomId === r!.roomId}
                                onDelete={async () => {
                                  const confirmed = window.confirm(
                                    `Delete room ${r!.roomTitle || r!.roomCode}? This cannot be undone.`,
                                  );
                                  if (!confirmed) return;
                                  setDeletingRoomId(r!.roomId);
                                  try {
                                    await deleteRoom({ roomId: r!.roomId });
                                  } finally {
                                    setDeletingRoomId(null);
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Last message */}
                        {r!.lastMessage ? (
                          <div className="mb-3 min-w-0">
                            <p
                              className="text-sm truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <span style={{ color: "rgba(247,245,250,0.6)" }}>
                                {r!.lastMessage.fromDisplayName}:
                              </span>{" "}
                              {r!.lastMessage.content.slice(0, 80)}
                              {r!.lastMessage.content.length > 80 ? "..." : ""}
                            </p>
                          </div>
                        ) : (
                          <p
                            className="text-sm mb-3"
                            style={{ color: "var(--text-dim)" }}
                          >
                            No messages yet
                          </p>
                        )}

                        {/* Footer metadata */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-dim)", opacity: 0.8 }}
                          >
                            {r!.participantCount}{" "}
                            {r!.participantCount === 1 ? "person" : "people"}
                          </span>
                          {r!.lastMessage && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-dim)", opacity: 0.7 }}
                            >
                              {timeAgo(r!.lastMessage.createdAt)}
                            </span>
                          )}
                          <span
                            className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                r!.retentionPolicy === "guest_ttl_72h"
                                  ? "rgba(223,166,73,0.08)"
                                  : "rgba(140,189,185,0.06)",
                              color:
                                r!.retentionPolicy === "guest_ttl_72h"
                                  ? "var(--text-dim)"
                                  : "var(--text-dim)",
                              border:
                                r!.retentionPolicy === "guest_ttl_72h"
                                  ? "1px solid rgba(223,166,73,0.1)"
                                  : "1px solid rgba(140,189,185,0.08)",
                            }}
                          >
                            {r!.retentionPolicy === "guest_ttl_72h"
                              ? "72h TTL"
                              : "Persistent"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
