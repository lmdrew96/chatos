"use client";

import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SignInButton } from "@clerk/nextjs";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";

export default function FriendsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  // State declared before any queries that depend on it
  const [usernameSearch, setUsernameSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const incomingRequests = useQuery(api.friends.getIncomingRequests);
  const outgoingRequests = useQuery(api.friends.getOutgoingRequests);
  const friends = useQuery(api.friends.getFriends);
  const searchResult = useQuery(
    api.users.getUserByUsername,
    usernameSearch.trim().length > 0 ? { username: usernameSearch.trim() } : "skip"
  );
  const respondToRequest = useMutation(api.friends.respondToFriendRequest);
  const cancelRequest = useMutation(api.friends.cancelFriendRequest);
  const sendRequest = useMutation(api.friends.sendFriendRequest);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--deep-dark)", color: "rgba(247,245,250,0.3)" }}
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
        className="min-h-screen flex flex-col items-center justify-center gap-6"
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
            Friends
          </h1>
          <p className="text-sm" style={{ color: "rgba(247,245,250,0.4)" }}>
            Sign in to add friends and invite them to rooms.
          </p>
          <SignInButton mode="modal">
            <button
              className="px-6 py-3 rounded-xl font-bold text-sm transition-all"
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

  const handleSendRequest = async (toId: Id<"users">) => {
    setSearchError("");
    try {
      await sendRequest({ toId });
      setSentIds((prev) => new Set(prev).add(toId));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to send request");
    }
  };

  return (
    <main
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--deep-dark)" }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto">
        <TopBar current="friends" />

        {/* Search */}
        <section className="mb-8 mt-8">
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-3"
            style={{ color: "rgba(247,245,250,0.3)" }}
          >
            Add by username
          </h2>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none pointer-events-none"
              style={{ color: "rgba(247,245,250,0.25)" }}
            >
              @
            </span>
            <input
              type="text"
              value={usernameSearch}
              onChange={(e) => {
                setUsernameSearch(e.target.value);
                setSearchError("");
              }}
              placeholder="username"
              autoComplete="off"
              className="w-full pl-7 pr-4 py-3 rounded-lg text-sm outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(247,245,250,0.1)",
                color: "var(--off-white)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--amber)";
                e.target.style.boxShadow = "0 0 0 3px rgba(223,166,73,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(247,245,250,0.1)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {usernameSearch.trim() && (
            <div className="mt-2">
              {searchResult === undefined ? (
                <p className="text-sm py-2" style={{ color: "rgba(247,245,250,0.3)" }}>
                  Searching…
                </p>
              ) : searchResult === null ? (
                <p className="text-sm py-2" style={{ color: "rgba(247,245,250,0.3)" }}>
                  No user found
                </p>
              ) : (
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(247,245,250,0.08)",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                      {searchResult.displayName ?? searchResult.username}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                      @{searchResult.username}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSendRequest(searchResult._id!)}
                    disabled={sentIds.has(searchResult._id!)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: sentIds.has(searchResult._id!)
                        ? "rgba(151,209,129,0.1)"
                        : "rgba(223,166,73,0.15)",
                      color: sentIds.has(searchResult._id!) ? "var(--soft-green)" : "var(--amber)",
                      cursor: sentIds.has(searchResult._id!) ? "default" : "pointer",
                    }}
                  >
                    {sentIds.has(searchResult._id!) ? "Sent ✓" : "Add friend"}
                  </button>
                </div>
              )}
              {searchError && (
                <p className="text-xs mt-1" style={{ color: "#FF9090" }}>
                  {searchError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Incoming requests */}
        {(incomingRequests?.length ?? 0) > 0 && (
          <section className="mb-8">
            <h2
              className="text-xs font-medium tracking-widest uppercase mb-3"
              style={{ color: "rgba(247,245,250,0.3)" }}
            >
              Incoming requests
            </h2>
            <div className="flex flex-col gap-2">
              {incomingRequests!.map((r) => (
                <div
                  key={r._id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(247,245,250,0.08)",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                      {r.sender.displayName ?? r.sender.username}
                    </p>
                    {r.sender.username && (
                      <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                        @{r.sender.username}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToRequest({ requestId: r._id, accept: true })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: "rgba(151,209,129,0.12)", color: "var(--soft-green)" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToRequest({ requestId: r._id, accept: false })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{
                        background: "rgba(247,245,250,0.06)",
                        color: "rgba(247,245,250,0.4)",
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Outgoing requests */}
        {(outgoingRequests?.length ?? 0) > 0 && (
          <section className="mb-8">
            <h2
              className="text-xs font-medium tracking-widest uppercase mb-3"
              style={{ color: "rgba(247,245,250,0.3)" }}
            >
              Sent requests
            </h2>
            <div className="flex flex-col gap-2">
              {outgoingRequests!.map((r) => (
                <div
                  key={r._id}
                  className="flex items-center justify-between px-4 py-3 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(247,245,250,0.08)",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                      {r.target.displayName ?? r.target.username}
                    </p>
                    {r.target.username && (
                      <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                        @{r.target.username}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => cancelRequest({ requestId: r._id })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "rgba(247,245,250,0.06)", color: "rgba(247,245,250,0.4)" }}
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Friends list */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-3"
            style={{ color: "rgba(247,245,250,0.3)" }}
          >
            Friends{friends && friends.length > 0 ? ` · ${friends.length}` : ""}
          </h2>
          {(friends?.length ?? 0) === 0 ? (
            <p className="text-sm py-4" style={{ color: "rgba(247,245,250,0.2)" }}>
              No friends yet. Search by username above to add someone.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {friends!.map((f) => (
                <div
                  key={f._id}
                  className="flex items-center px-4 py-3 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(247,245,250,0.08)",
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                      {f.displayName ?? f.username}
                    </p>
                    {f.username && (
                      <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                        @{f.username}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
