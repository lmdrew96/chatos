"use client";

import { useState } from "react";

const KEY = "chatos:apiKey";
const MCP_URL_KEY = "chatos:mcpUrl";
const MCP_SERVERS_KEY = "chatos:mcpServers";
const CONTEXT_SEED_KEY = "chatos:contextSeed";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(KEY) ?? "" : "")
  );
  const [saved, setSaved] = useState(false);
  const hasKey = apiKey.trim().length > 0;

  const [mcpUrl, setMcpUrl] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(MCP_URL_KEY) ?? "" : "")
  );
  const [extraMcpServers, setExtraMcpServers] = useState<{ name: string; url: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(MCP_SERVERS_KEY) ?? "[]"); } catch { return []; }
  });
  const [contextSeed, setContextSeed] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(CONTEXT_SEED_KEY) ?? "" : "")
  );
  const [mcpSaved, setMcpSaved] = useState(false);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem(KEY, trimmed);
    } else {
      localStorage.removeItem(KEY);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem(KEY);
    setApiKey("");
  };

  const handleSaveMcp = () => {
    localStorage.setItem(MCP_URL_KEY, mcpUrl.trim());
    const filledServers = extraMcpServers.filter((s) => s.name.trim() && s.url.trim());
    localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(filledServers));
    localStorage.setItem(CONTEXT_SEED_KEY, contextSeed.trim());
    setMcpSaved(true);
    setTimeout(() => setMcpSaved(false), 2000);
  };

  return (
    <main className="relative min-h-screen px-4 pb-8" style={{ background: "var(--deep-dark)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto page-topbar-offset flex flex-col gap-10">
        {/* API Key section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "rgba(247,245,250,0.3)" }}
          >
            Anthropic API Key
          </h2>
          <p className="text-sm mb-5" style={{ color: "rgba(247,245,250,0.35)" }}>
            Used to power your Claude in every room. Stored locally in your browser — never sent to our servers.
          </p>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
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
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              {hasKey && (
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--soft-green)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--soft-green)" }}>
                    Set
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all"
                style={{
                  background: saved ? "rgba(151,209,129,0.15)" : "var(--amber)",
                  color: saved ? "var(--soft-green)" : "var(--deep-dark)",
                  fontFamily: "var(--font-super-bakery)",
                }}
              >
                {saved ? "Saved ✓" : "Save key"}
              </button>
              {hasKey && (
                <button
                  onClick={handleClear}
                  className="px-4 py-2.5 rounded-lg text-sm transition-all"
                  style={{
                    background: "rgba(255,100,100,0.08)",
                    color: "rgba(255,150,150,0.7)",
                    border: "1px solid rgba(255,100,100,0.12)",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-4">
            <svg
              width="11"
              height="13"
              viewBox="0 0 11 13"
              fill="none"
              style={{ color: "var(--soft-green)", flexShrink: 0 }}
            >
              <rect x="1" y="5" width="9" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <p className="text-xs" style={{ color: "rgba(247,245,250,0.25)" }}>
              Your key is stored only in this browser. Each Claude always uses its owner&apos;s key.
            </p>
          </div>
        </section>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(247,245,250,0.06)" }} />

        {/* MCP & Context section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "rgba(247,245,250,0.3)" }}
          >
            MCP &amp; Context
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(247,245,250,0.35)" }}>
            Personalize your Claude across every room. These settings are applied automatically when you join.
          </p>

          <div className="flex flex-col gap-6">
            {/* Personal Context MCP URL */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                Personal Context MCP URL
              </label>
              <p className="text-xs" style={{ color: "rgba(247,245,250,0.35)" }}>
                Your deployed Personal Context MCP. Cha(t)os will fetch your identity, projects, and preferences and inject them into your Claude&apos;s context automatically.
              </p>
              <input
                type="url"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://your-context.vercel.app/mcp"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(247,245,250,0.1)",
                  color: "var(--off-white)",
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

            {/* Additional MCP servers */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium" style={{ color: "var(--off-white)" }}>
                    Additional MCP servers
                  </label>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(247,245,250,0.35)" }}>
                    Any MCP you already run (e.g. ControlledChaos). Your Claude will have access to these tools in every room.
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
                Paste a summary or recent exchange from Claude Desktop. Your Claude will have this as background context in every room.
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

            <button
              onClick={handleSaveMcp}
              className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
              style={{
                background: mcpSaved ? "rgba(151,209,129,0.15)" : "var(--amber)",
                color: mcpSaved ? "var(--soft-green)" : "var(--deep-dark)",
                fontFamily: "var(--font-super-bakery)",
              }}
            >
              {mcpSaved ? "Saved ✓" : "Save MCP settings"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
