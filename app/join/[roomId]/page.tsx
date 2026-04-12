"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { fetchPersonalContext, buildContextPrefix, normalizeMcpServerUrl } from "@/lib/personalContext";
import { PCTX_WRITE_TOOLS } from "@/lib/pctx-prefetch";
import { FloatingOrb } from "@/components/FloatingOrb";

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
  const saveJoinPreferences = useMutation(api.users.saveJoinPreferences);
  const room = useQuery(api.rooms.getRoomById, { roomId });
  const me = useQuery(api.users.getMe);

  const { user } = useUser();
  const defaultDisplayName = me?.preferredDisplayName ?? user?.firstName ?? user?.fullName ?? "";
  const defaultClaudeName = me?.preferredClaudeName ?? "";

  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [claudeName, setClaudeName] = useState("");
  const [claudeNameTouched, setClaudeNameTouched] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasApiKeyQuery = useQuery(api.apiKeys.hasApiKey);
  const saveApiKeyMutation = useMutation(api.apiKeys.saveApiKey);
  const hasApiKey = hasApiKeyQuery === true;
  const [hasMcpUrl, setHasMcpUrl] = useState(false);

  // Migrate localStorage key to Convex (one-time)
  useEffect(() => {
    if (hasApiKeyQuery === undefined) return;
    const localKey = localStorage.getItem("chatos:apiKey");
    if (localKey && !hasApiKeyQuery) {
      saveApiKeyMutation({ encryptedKey: localKey })
        .then(() => localStorage.removeItem("chatos:apiKey"))
        .catch(() => {});
    } else if (localKey) {
      localStorage.removeItem("chatos:apiKey");
    }
  }, [hasApiKeyQuery, saveApiKeyMutation]);

  useEffect(() => {
    setHasMcpUrl(!!localStorage.getItem("chatos:mcpUrl")?.trim());
  }, []);

  const resolvedDisplayName = displayNameTouched ? displayName : defaultDisplayName;

  const suggestedClaudeName = defaultClaudeName || `${resolvedDisplayName.trim().replace(/\s+/g, "")}Claude`;
  const resolvedClaudeName = claudeNameTouched
    ? claudeName
    : (resolvedDisplayName.trim() || defaultClaudeName ? suggestedClaudeName : "");

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");

    if (!resolvedDisplayName.trim() || !resolvedClaudeName.trim() || (!hasMcpUrl && !systemPrompt.trim())) {
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

    // Read MCP settings from localStorage (configured in Settings)
    const mcpUrl = localStorage.getItem("chatos:mcpUrl") ?? "";
    const storedServers: { name: string; url: string; allowedTools?: string[] }[] = (() => {
      try { return JSON.parse(localStorage.getItem("chatos:mcpServers") ?? "[]"); } catch { return []; }
    })();
    const contextSeed = localStorage.getItem("chatos:contextSeed") ?? "";
    const validServers = storedServers.filter((s) => s.name.trim() && s.url.trim());

    try {
      let basePrompt = systemPrompt.trim();

      // Layer 1: Prepend personal context from MCP if URL provided
      let finalMcpServers = validServers;
      if (mcpUrl.trim()) {
        try {
          const ctx = await fetchPersonalContext(mcpUrl.trim());
          const prefix = buildContextPrefix(resolvedClaudeName.trim(), resolvedDisplayName.trim(), ctx);
          basePrompt = basePrompt ? `${prefix}\n\nPersonality: ${basePrompt}` : prefix;

          // Also register as a live MCP server so Claude can use its write tools during conversations.
          // allowedTools excludes pctx_get_context since reads are pre-fetched into the system prompt.
          const mcpServerUrl = normalizeMcpServerUrl(mcpUrl.trim());
          finalMcpServers = [{ name: "PersonalContext", url: mcpServerUrl, allowedTools: PCTX_WRITE_TOOLS }, ...validServers];
          sessionStorage.setItem("chatos:mcpServers", JSON.stringify(finalMcpServers));
        } catch {
          setError("Couldn't reach your Personal Context MCP — check the URL in Settings and try again.");
          setLoading(false);
          return;
        }
      } else {
        sessionStorage.setItem("chatos:mcpServers", JSON.stringify(validServers));
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
        mcpServers: finalMcpServers.length > 0 ? finalMcpServers : undefined,
      });

      // Save preferences for next join
      saveJoinPreferences({
        preferredDisplayName: resolvedDisplayName.trim(),
        preferredClaudeName: resolvedClaudeName.trim(),
      }).catch(() => {});

      router.push(`/room/${roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join room.");
      setLoading(false);
    }
  };

  if (room === undefined) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          Loading…
        </div>
      </main>
    );
  }

  if (room === null) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "var(--fg)" }}
        >
          Room not found.
        </div>
      </main>
    );
  }

  const retentionPolicy = room.retentionPolicy
    ?? (room.ownerTokenIdentifier ? "persistent" : "guest_ttl_72h");

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden"
      style={{ background: "var(--bg)" }}
    >

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.4) 0%, transparent 70%)",
        }}
      />

      {/* Grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "120px",
        }}
      />

      {/* Floating orbs */}
      <FloatingOrb
        className="w-[340px] h-[340px] opacity-[0.08]"
        style={{ background: "var(--amber)", top: "-10%", right: "-8%" }}
        delay={0}
      />
      <FloatingOrb
        className="w-56 h-56 opacity-[0.06]"
        style={{ background: "var(--purple)", bottom: "5%", left: "-5%" }}
        delay={5}
      />
      <FloatingOrb
        className="w-40 h-40 opacity-[0.05]"
        style={{ background: "var(--sage-teal)", top: "60%", right: "8%" }}
        delay={9}
      />

      <div className="relative z-10 w-full max-w-2xl animate-fade-up page-topbar-offset" style={{ isolation: "isolate" }}>

        {/* Room badge */}
        <div className="flex items-center gap-2 mb-8">
          <span
            className="text-xs tracking-widest uppercase font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Room
          </span>
          {room.title && (
            <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>
              {room.title}
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded text-xs font-mono"
            style={{
              background: "rgba(139,189,185,0.1)",
              color: room.title ? "var(--text-dim)" : "var(--sage-teal)",
              border: "1px solid rgba(139,189,185,0.15)",
            }}
          >
            {room.roomCode}
          </span>
        </div>

        <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
          {retentionPolicy === "guest_ttl_72h"
            ? "This guest room auto-deletes after 72 hours of inactivity."
            : "This room is account-owned and does not auto-delete for inactivity."}
        </p>

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
          className="text-2xl sm:text-4xl font-extrabold mb-1"
          style={{ fontFamily: "var(--font-super-bakery)" }}
        >
          Set up your space
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--text-muted)" }}>
          Configure your identity and your Claude before entering the room.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-7">
          {/* Display name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
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
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          {/* Claude name */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
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
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
              {!claudeNameTouched && resolvedClaudeName && (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "var(--sage-teal)" }}
                >
                  {defaultClaudeName ? "saved" : "auto"}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Others use <span style={{ color: "var(--amber)" }}>@{resolvedClaudeName || "YourClaude"}</span> to invoke your Claude.
            </p>
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                  Your Claude&apos;s personality
                </label>
                {hasMcpUrl && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(139,189,185,0.12)",
                      color: "var(--sage-teal)",
                      border: "1px solid rgba(139,189,185,0.2)",
                    }}
                  >
                    optional — MCP connected
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
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
              placeholder={hasMcpUrl ? "Optional — your MCP context will define the personality. Add extra instructions here if you like…" : "Describe your Claude's role, personality, and how it should engage in the room…"}
              rows={4}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none field-focus"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                lineHeight: "1.6",
              }}
            />
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
