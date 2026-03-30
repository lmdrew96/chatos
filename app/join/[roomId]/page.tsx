"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { fetchPersonalContext, buildContextPrefix } from "@/lib/personalContext";

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

  const { user } = useUser();
  const defaultDisplayName = user?.firstName ?? user?.fullName ?? "";

  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [claudeName, setClaudeName] = useState("");
  const [claudeNameTouched, setClaudeNameTouched] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [contextSeed, setContextSeed] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpStatus, setMcpStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [extraMcpServers, setExtraMcpServers] = useState<{ name: string; url: string }[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasApiKey] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem("chatos:apiKey")
  );

  const resolvedDisplayName = displayNameTouched ? displayName : defaultDisplayName;

  const suggestedClaudeName = `${resolvedDisplayName.trim().replace(/\s+/g, "")}Claude`;
  const resolvedClaudeName = claudeNameTouched
    ? claudeName
    : (resolvedDisplayName.trim() ? suggestedClaudeName : "");

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");

    if (!resolvedDisplayName.trim() || !resolvedClaudeName.trim() || !systemPrompt.trim()) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);

    let userId = sessionStorage.getItem("userId");
    if (!userId) {
      userId = crypto.randomUUID();
      sessionStorage.setItem("userId", userId);
    }

    sessionStorage.setItem("displayName", resolvedDisplayName.trim());
    sessionStorage.setItem("claudeName", resolvedClaudeName.trim());
    const filledServers = extraMcpServers.filter((s) => s.name.trim() && s.url.trim());
    sessionStorage.setItem("chatos:mcpServers", JSON.stringify(filledServers));

    try {
      let basePrompt = systemPrompt.trim();

      // Layer 1: Prepend personal context from MCP if URL provided
      if (mcpUrl.trim()) {
        setMcpStatus("loading");
        try {
          const ctx = await fetchPersonalContext(mcpUrl.trim());
          const prefix = buildContextPrefix(resolvedClaudeName.trim(), resolvedDisplayName.trim(), ctx);
          basePrompt = `${prefix}\n\nPersonality: ${basePrompt}`;
          setMcpStatus("ok");
        } catch {
          setMcpStatus("error");
          setError("Couldn't reach your Personal Context MCP — check the URL and try again.");
          setLoading(false);
          return;
        }
      }

      // Layer 3: Append context seed if provided
      const fullSystemPrompt = contextSeed.trim()
        ? `${basePrompt}\n\n## Recent context\n${contextSeed.trim()}`
        : basePrompt;

      await joinRoom({
        roomId,
        userId,
        displayName: resolvedDisplayName.trim(),
        claudeName: resolvedClaudeName.trim(),
        systemPrompt: fullSystemPrompt,
      });
      router.push(`/room/${roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join room.");
      setLoading(false);
    }
  };

  if (room === undefined) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--deep-dark)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "rgba(247,245,250,0.4)" }}
        >
          Loading…
        </div>
      </main>
    );
  }

  if (room === null) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--deep-dark)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "var(--off-white)" }}
        >
          Room not found.
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12"
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

      <div className="relative z-10 w-full max-w-2xl animate-fade-up page-topbar-offset">

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

        {/* No API key warning */}
        {!hasApiKey && (
          <div
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl mb-6"
            style={{
              background: "rgba(223,166,73,0.07)",
              border: "1px solid rgba(223,166,73,0.2)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--amber)", flexShrink: 0 }}>
                <path d="M7 1.5L12.5 11H1.5L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="7" cy="10" r="0.6" fill="currentColor" />
              </svg>
              <p className="text-sm" style={{ color: "rgba(223,166,73,0.9)" }}>
                No API key set — your Claude won&apos;t be able to respond.
              </p>
            </div>
            <Link
              href="/settings"
              className="text-xs font-medium shrink-0 transition-opacity hover:opacity-70"
              style={{ color: "var(--amber)" }}
            >
              Set it →
            </Link>
          </div>
        )}

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
              value={resolvedDisplayName}
              onChange={(e) => {
                const nextDisplayName = e.target.value;
                setDisplayNameTouched(true);
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

          {/* Advanced: personalize your Claude */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(247,245,250,0.08)" }}
          >
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
              style={{
                background: "rgba(255,255,255,0.02)",
                color: "rgba(247,245,250,0.5)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
              }}
            >
              <span>Advanced: personalize your Claude</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{
                  transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {advancedOpen && (
              <div className="px-4 pb-4 pt-3 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.01)" }}>
                {/* Layer 1: Personal Context MCP URL */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                    Personal Context MCP URL
                  </label>
                  <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                    Your deployed Personal Context MCP. Cha(t)os will fetch your identity, projects, and preferences and inject them into your Claude&apos;s context automatically.
                  </p>
                  <div className="relative">
                    <input
                      type="url"
                      value={mcpUrl}
                      onChange={(e) => { setMcpUrl(e.target.value); setMcpStatus("idle"); }}
                      placeholder="https://your-context.vercel.app/mcp"
                      autoComplete="off"
                      className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${mcpStatus === "ok" ? "rgba(139,189,185,0.4)" : mcpStatus === "error" ? "rgba(255,100,100,0.4)" : "rgba(247,245,250,0.1)"}`,
                        color: "var(--off-white)",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "var(--sage-teal)";
                        e.target.style.boxShadow = "0 0 0 3px rgba(139,189,185,0.1)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = mcpStatus === "ok" ? "rgba(139,189,185,0.4)" : mcpStatus === "error" ? "rgba(255,100,100,0.4)" : "rgba(247,245,250,0.1)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                    {mcpStatus === "loading" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "rgba(247,245,250,0.4)" }}>fetching…</span>
                    )}
                    {mcpStatus === "ok" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--sage-teal)" }}>context loaded ✓</span>
                    )}
                  </div>
                </div>

                {/* Layer 2: Additional MCP servers */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                        Additional MCP servers
                      </label>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(247,245,250,0.35)" }}>
                        Any MCP you already run (e.g. ControlledChaos). Your Claude will have access to these tools in the room.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExtraMcpServers((prev) => [...prev, { name: "", url: "" }])}
                      className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                      style={{
                        background: "rgba(136,115,158,0.15)",
                        color: "var(--mauve)",
                        border: "1px solid rgba(136,115,158,0.2)",
                      }}
                    >
                      + Add
                    </button>
                  </div>

                  {extraMcpServers.length === 0 && (
                    <p className="text-xs italic" style={{ color: "rgba(247,245,250,0.2)" }}>
                      No extra MCP servers added.
                    </p>
                  )}

                  {extraMcpServers.map((server, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={server.name}
                        onChange={(e) => setExtraMcpServers((prev) => prev.map((s, j) => j === i ? { ...s, name: e.target.value } : s))}
                        placeholder="Name (e.g. ControlledChaos)"
                        className="px-3 py-2 rounded-lg text-sm outline-none transition-all"
                        style={{
                          width: "36%",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(247,245,250,0.1)",
                          color: "var(--off-white)",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--mauve)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "rgba(247,245,250,0.1)"; }}
                      />
                      <input
                        type="url"
                        value={server.url}
                        onChange={(e) => setExtraMcpServers((prev) => prev.map((s, j) => j === i ? { ...s, url: e.target.value } : s))}
                        placeholder="https://your-mcp.vercel.app/mcp"
                        className="px-3 py-2 rounded-lg text-sm outline-none transition-all font-mono flex-1"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(247,245,250,0.1)",
                          color: "var(--off-white)",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--mauve)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "rgba(247,245,250,0.1)"; }}
                      />
                      <button
                        type="button"
                        onClick={() => setExtraMcpServers((prev) => prev.filter((_, j) => j !== i))}
                        className="text-xs px-2 py-2 rounded-lg transition-colors shrink-0"
                        style={{ color: "rgba(247,245,250,0.3)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Context seed */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                    Import Claude Desktop context
                  </label>
                  <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                    Paste a summary or recent exchange from Claude Desktop. Your Claude will have this as background context for the room.
                    <br />
                    <span style={{ color: "rgba(247,245,250,0.25)" }}>
                      Tip: ask Claude Desktop to summarize your recent conversations, then paste the result here.
                    </span>
                  </p>
                  <textarea
                    value={contextSeed}
                    onChange={(e) => setContextSeed(e.target.value)}
                    placeholder="Paste context from Claude Desktop here…"
                    rows={5}
                    className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(247,245,250,0.1)",
                      color: "var(--off-white)",
                      lineHeight: "1.6",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--sage-teal)";
                      e.target.style.boxShadow = "0 0 0 3px rgba(139,189,185,0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(247,245,250,0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
            )}
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
