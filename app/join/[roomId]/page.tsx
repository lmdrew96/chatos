"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const STARTER_PROMPTS = [
  {
    label: "Devil's Advocate",
    prompt:
      "You are a sharp devil's advocate. Challenge every idea with precision — not to be contrarian, but to stress-test thinking. Be direct, incisive, and a little provocative.",
  },
  {
    label: "Hype Machine",
    prompt:
      "You are an enthusiastic hype machine. Find the best angle in every idea and amplify it. You're genuinely excited, constructive, and infectious in your energy.",
  },
  {
    label: "Ruthless Editor",
    prompt:
      "You are a ruthless editor. Cut the fluff, sharpen the signal, and say what needs to be said. You care about clarity above all else.",
  },
];

export default function JoinPage() {
  const params = useParams();
  const roomId = params.roomId as Id<"rooms">;
  const router = useRouter();

  const joinRoom = useMutation(api.rooms.joinRoom);
  const room = useQuery(api.rooms.getRoomById, { roomId });

  const [displayName, setDisplayName] = useState("");
  const [claudeName, setClaudeName] = useState("");
  const [claudeNameTouched, setClaudeNameTouched] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const suggestedClaudeName = `${displayName.trim().replace(/\s+/g, "")}Claude`;
  const resolvedClaudeName = claudeNameTouched
    ? claudeName
    : (displayName.trim() ? suggestedClaudeName : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (
      !displayName.trim() ||
      !resolvedClaudeName.trim() ||
      !systemPrompt.trim() ||
      !apiKey.trim()
    ) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);

    let userId = sessionStorage.getItem("userId");
    if (!userId) {
      userId = crypto.randomUUID();
      sessionStorage.setItem("userId", userId);
    }

    // API key stays client-side only
    sessionStorage.setItem(`apiKey_${userId}`, apiKey.trim());
    // Store display name for this session
    sessionStorage.setItem("displayName", displayName.trim());
    sessionStorage.setItem("claudeName", resolvedClaudeName.trim());

    try {
      await joinRoom({
        roomId,
        userId,
        displayName: displayName.trim(),
        claudeName: resolvedClaudeName.trim(),
        systemPrompt: systemPrompt.trim(),
      });
      router.push(`/room/${roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join room.");
      setLoading(false);
    }
  };

  if (room === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--deep-dark)", color: "rgba(247,245,250,0.4)" }}
      >
        Loading…
      </div>
    );
  }

  if (room === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--deep-dark)", color: "var(--off-white)" }}
      >
        Room not found.
      </div>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--deep-dark)" }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.4) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg animate-fade-up">
        <div className="mb-5 select-none">
          <span
            className="text-base font-extrabold leading-none"
            style={{ fontFamily: "var(--font-super-bakery)", color: "var(--off-white)" }}
          >
            Cha<span style={{ color: "var(--amber)" }}>(t)</span>os
          </span>
        </div>

        {/* Room badge */}
        <div className="flex items-center gap-2 mb-8">
          <span
            className="text-xs tracking-widest uppercase font-medium"
            style={{ color: "rgba(247,245,250,0.3)" }}
          >
            Room
          </span>
          <span
            className="px-2 py-0.5 rounded text-xs font-mono"
            style={{
              background: "rgba(139,189,185,0.1)",
              color: "var(--sage-teal)",
              border: "1px solid rgba(139,189,185,0.15)",
            }}
          >
            {room.roomCode}
          </span>
        </div>

        {/* Heading */}
        <h1
          className="text-4xl font-extrabold mb-1"
          style={{ fontFamily: "var(--font-super-bakery)" }}
        >
          Set up your space
        </h1>
        <p className="text-sm mb-10" style={{ color: "rgba(247,245,250,0.4)" }}>
          Configure your identity and your Claude before entering the room.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-7">
          {/* Display name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
              Your name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                const nextDisplayName = e.target.value;
                setDisplayName(nextDisplayName);

                if (!claudeNameTouched) {
                  const nextSanitized = nextDisplayName.trim().replace(/\s+/g, "");
                  setClaudeName(nextSanitized ? `${nextSanitized}Claude` : "");
                }
              }}
              placeholder="e.g. Nae"
              autoComplete="off"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
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

          {/* Claude name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
              Your Claude&apos;s name
            </label>
            <div className="relative">
              <input
                type="text"
                value={resolvedClaudeName}
                onChange={(e) => {
                  setClaudeNameTouched(true);
                  setClaudeName(e.target.value);
                }}
                placeholder="e.g. NaeClaude"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
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
              {!claudeNameTouched && resolvedClaudeName && (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "var(--sage-teal)" }}
                >
                  auto
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: "rgba(247,245,250,0.3)" }}>
              Others use <span style={{ color: "var(--amber)" }}>@{resolvedClaudeName || "YourClaude"}</span> to invoke your Claude.
            </p>
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                Your Claude&apos;s personality
              </label>
              <div className="flex gap-2">
                {STARTER_PROMPTS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setSystemPrompt(s.prompt)}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{
                      background: "rgba(136,115,158,0.15)",
                      color: "var(--mauve)",
                      border: "1px solid rgba(136,115,158,0.2)",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.background = "rgba(136,115,158,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.background = "rgba(136,115,158,0.15)";
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe your Claude's role, personality, and how it should engage in the room…"
              rows={4}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(247,245,250,0.1)",
                color: "var(--off-white)",
                lineHeight: "1.6",
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

          {/* API key */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
              Anthropic API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono"
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
            <div className="flex items-center gap-1.5">
              <svg width="11" height="13" viewBox="0 0 11 13" fill="none" style={{ color: "var(--soft-green)", flexShrink: 0 }}>
                <rect x="1" y="5" width="9" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <p className="text-xs" style={{ color: "rgba(247,245,250,0.3)" }}>
                Stored in your browser only — never sent to our servers. Your Claude&apos;s owner always pays.
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              className="text-sm px-4 py-3 rounded-lg"
              style={{
                background: "rgba(255,100,100,0.1)",
                border: "1px solid rgba(255,100,100,0.2)",
                color: "#FF9090",
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98]"
            style={{
              background: loading ? "rgba(223,166,73,0.5)" : "var(--amber)",
              color: "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 0 30px rgba(223,166,73,0.2)",
            }}
          >
            {loading ? "Entering the chaos…" : "Enter the chaos →"}
          </button>
        </form>
      </div>
    </main>
  );
}
