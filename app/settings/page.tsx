"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useTheme } from "@/components/ThemeProvider";

const MCP_URL_KEY = "chatos:mcpUrl";
const MCP_SERVERS_KEY = "chatos:mcpServers";
const CONTEXT_SEED_KEY = "chatos:contextSeed";
const COLOR_KEY = "chatos:preferredColor";

const COLOR_SWATCHES = [
  { hex: "#DFA649", label: "Amber" },
  { hex: "#88739E", label: "Mauve" },
  { hex: "#8CBDB9", label: "Sage" },
  { hex: "#97D181", label: "Green" },
  { hex: "#849440", label: "Olive" },
  { hex: "#DBD5E2", label: "Lavender" },
];

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();

  const me = useQuery(api.users.getMe);
  const setTimezoneMutation = useMutation(api.users.setTimezone);

  const detectedTz = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [timezone, setTimezone] = useState(detectedTz);
  const [tzSynced, setTzSynced] = useState(false);

  // Sync timezone from server or auto-detect on first load
  useEffect(() => {
    if (tzSynced || me === undefined) return;
    if (me?.timezone) {
      setTimezone(me.timezone);
    } else if (me) {
      // First time: auto-save detected timezone
      setTimezoneMutation({ timezone: detectedTz }).catch(() => {});
    }
    setTzSynced(true);
  }, [me, tzSynced, detectedTz, setTimezoneMutation]);

  const handleTimezoneChange = (tz: string) => {
    setTimezone(tz);
    setTimezoneMutation({ timezone: tz }).catch(() => {});
  };

  const [preferredColor, setPreferredColor] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(COLOR_KEY) ?? "" : "")
  );

  const handleColorSelect = (hex: string) => {
    setPreferredColor(hex);
    localStorage.setItem(COLOR_KEY, hex);
  };

  // Room defaults (preferred names)
  const saveJoinPreferences = useMutation(api.users.saveJoinPreferences);
  const [prefDisplayName, setPrefDisplayName] = useState("");
  const [prefClaudeName, setPrefClaudeName] = useState("");
  const [prefHydrated, setPrefHydrated] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefError, setPrefError] = useState("");

  useEffect(() => {
    if (prefHydrated || me === undefined) return;
    if (me) {
      setPrefDisplayName(me.preferredDisplayName ?? "");
      setPrefClaudeName(me.preferredClaudeName ?? "");
    }
    setPrefHydrated(true);
  }, [me, prefHydrated]);

  const handleSavePreferences = async () => {
    setPrefError("");
    try {
      await saveJoinPreferences({
        preferredDisplayName: prefDisplayName.trim(),
        preferredClaudeName: prefClaudeName.trim(),
      });
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      // Convex wraps errors — extract the inner message
      const match = msg.match(/Uncaught Error:\s*(.+)/);
      setPrefError(match ? match[1] : msg);
    }
  };

  const savedKey = useQuery(api.apiKeys.getMyApiKey);
  const saveApiKeyMutation = useMutation(api.apiKeys.saveApiKey);
  const deleteApiKeyMutation = useMutation(api.apiKeys.deleteApiKey);
  const resetOnboarding = useMutation(api.users.resetOnboarding);

  const handleRestartOnboarding = async () => {
    await resetOnboarding();
    localStorage.setItem("chatos:onboardingStep", "0");
    window.location.reload();
  };

  const [apiKey, setApiKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  // Migrate localStorage key to Convex (one-time)
  const [migrated, setMigrated] = useState(false);
  useEffect(() => {
    if (migrated || savedKey === undefined) return;
    const localKey = localStorage.getItem("chatos:apiKey");
    if (localKey && !savedKey) {
      saveApiKeyMutation({ encryptedKey: localKey })
        .then(() => localStorage.removeItem("chatos:apiKey"))
        .catch(() => {});
      setApiKey(localKey);
      setKeyLoaded(true);
    } else {
      setApiKey(savedKey ?? "");
      setKeyLoaded(true);
      if (localKey) localStorage.removeItem("chatos:apiKey");
    }
    setMigrated(true);
  }, [savedKey, migrated, saveApiKeyMutation]);

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

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (trimmed) {
      await saveApiKeyMutation({ encryptedKey: trimmed });
    } else {
      await deleteApiKeyMutation();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    await deleteApiKeyMutation();
    setApiKey("");
  };

  // ── Key Sponsorship (admin only) ───────────────────────────────────────────
  const isAdmin = useQuery(api.claudiuConfig.isAdmin);
  const mySponsored = useQuery(api.apiKeys.getMySponsored);
  const addSponsor = useMutation(api.apiKeys.addKeySponsor);
  const removeSponsor = useMutation(api.apiKeys.removeKeySponsor);
  const convex = useConvex();

  const [sponsorSearch, setSponsorSearch] = useState("");
  const [sponsorResults, setSponsorResults] = useState<{ _id: Id<"users">; displayName: string }[]>([]);
  const [sponsorSearching, setSponsorSearching] = useState(false);

  const doSponsorSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSponsorResults([]); return; }
    setSponsorSearching(true);
    try {
      const results = await convex.query(api.apiKeys.searchUsersForSponsor, { search: q });
      setSponsorResults(results);
    } catch { setSponsorResults([]); }
    setSponsorSearching(false);
  }, [convex]);

  useEffect(() => {
    const timer = setTimeout(() => doSponsorSearch(sponsorSearch), 300);
    return () => clearTimeout(timer);
  }, [sponsorSearch, doSponsorSearch]);

  const handleSaveMcp = () => {
    localStorage.setItem(MCP_URL_KEY, mcpUrl.trim());
    const filledServers = extraMcpServers.filter((s) => s.name.trim() && s.url.trim());
    localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(filledServers));
    localStorage.setItem(CONTEXT_SEED_KEY, contextSeed.trim());
    setMcpSaved(true);
    setTimeout(() => setMcpSaved(false), 2000);
  };

  return (
    <main className="relative min-h-screen px-4 pb-8" style={{ background: "var(--bg)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto page-topbar-offset flex flex-col gap-10">
        {/* Appearance section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Appearance
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Theme and your dot color across all rooms.
          </p>

          <div className="flex flex-col gap-6">
            {/* Theme toggle */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Theme
              </label>
              <div className="flex gap-2">
                {(["dark", "light", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPreference(t)}
                    className="px-4 py-2 rounded-lg text-sm capitalize transition-all"
                    style={{
                      background: preference === t ? "rgba(223,166,73,0.12)" : "var(--surface)",
                      border: preference === t ? "1px solid var(--amber)" : "1px solid var(--border)",
                      color: preference === t ? "var(--amber)" : "var(--text-muted)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Dot color picker */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Your dot color
              </label>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                This is your color in every room. Takes effect when you next load a room.
              </p>
              <div className="flex gap-3 flex-wrap">
                {COLOR_SWATCHES.map((swatch) => {
                  const isSelected = preferredColor === swatch.hex;
                  return (
                    <button
                      key={swatch.hex}
                      onClick={() => handleColorSelect(swatch.hex)}
                      title={swatch.label}
                      className="w-8 h-8 rounded-full transition-all relative"
                      style={{
                        background: swatch.hex,
                        boxShadow: isSelected
                          ? `0 0 0 2px var(--bg), 0 0 0 4px ${swatch.hex}`
                          : "none",
                        transform: isSelected ? "scale(1.1)" : "scale(1)",
                      }}
                    >
                      {isSelected && (
                        <span
                          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                          style={{ color: "rgba(0,0,0,0.5)" }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
                {preferredColor && (
                  <button
                    onClick={() => { setPreferredColor(""); localStorage.removeItem(COLOR_KEY); }}
                    className="w-8 h-8 rounded-full text-xs transition-all flex items-center justify-center"
                    style={{
                      border: "1px dashed var(--border)",
                      color: "var(--text-muted)",
                    }}
                    title="Reset to auto"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            {/* Timezone picker */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Timezone
              </label>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Your Claude uses this to know the current time. Auto-detected from your browser.
              </p>
              <select
                value={timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                  appearance: "none",
                }}
              >
                {Intl.supportedValuesOf("timeZone").map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Room Defaults section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Room Defaults
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Pre-filled when you join a new room. You can still change them on the join page.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Your name
              </label>
              <input
                type="text"
                value={prefDisplayName}
                onChange={(e) => { setPrefDisplayName(e.target.value); setPrefSaved(false); }}
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

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Your Claude&apos;s name
              </label>
              <input
                type="text"
                value={prefClaudeName}
                onChange={(e) => { setPrefClaudeName(e.target.value); setPrefSaved(false); }}
                placeholder="e.g. NaeClaude"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Others use <span style={{ color: "var(--amber)" }}>@{prefClaudeName || "YourClaude"}</span> to invoke your Claude.
              </p>
            </div>

            {prefError && (
              <p
                className="text-sm px-4 py-3 rounded-lg"
                style={{
                  background: "rgba(255,100,100,0.1)",
                  border: "1px solid rgba(255,100,100,0.2)",
                  color: "#FF9090",
                }}
              >
                {prefError}
              </p>
            )}

            <button
              onClick={handleSavePreferences}
              className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
              style={{
                background: prefSaved ? "rgba(151,209,129,0.15)" : "var(--amber)",
                color: prefSaved ? "var(--soft-green)" : "var(--deep-dark)",
                fontFamily: "var(--font-super-bakery)",
              }}
            >
              {prefSaved ? "Saved ✓" : "Save defaults"}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* API Key section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Anthropic API Key
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Used to power your Claude in every room. Stored securely on our servers so other participants can invoke your Claude on your behalf.
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
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
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
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Your key is stored server-side. Each Claude always uses its owner&apos;s key — never the invoker&apos;s.
            </p>
          </div>
        </section>

        {/* Key Sponsorship (admin only) */}
        {isAdmin && (
          <>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <section>
              <h2
                className="text-xs font-medium tracking-widest uppercase mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Key Sponsorship
              </h2>
              <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
                When a sponsored user&apos;s API key hits billing limits, your key is used as a fallback.
              </p>

              <div className="flex flex-col gap-4">
                {/* Current sponsees */}
                {mySponsored && mySponsored.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Currently sponsoring
                    </label>
                    {mySponsored.map((s) => (
                      <div
                        key={s._id}
                        className="flex items-center justify-between px-4 py-2.5 rounded-lg"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span className="text-sm" style={{ color: "var(--fg)" }}>
                          {s.displayName}
                        </span>
                        <button
                          onClick={() => s.userId && removeSponsor({ recipientUserId: s.userId })}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: "rgba(255,150,150,0.7)" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add sponsee */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Add a user
                  </label>
                  <input
                    type="text"
                    value={sponsorSearch}
                    onChange={(e) => setSponsorSearch(e.target.value)}
                    placeholder="Search by display name..."
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--fg)",
                    }}
                  />
                  {sponsorSearching && (
                    <p className="text-xs" style={{ color: "var(--text-dim)" }}>Searching...</p>
                  )}
                  {sponsorResults.length > 0 && (
                    <div
                      className="flex flex-col rounded-lg overflow-hidden"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                      }}
                    >
                      {sponsorResults.map((user) => (
                        <button
                          key={user._id}
                          onClick={async () => {
                            await addSponsor({ recipientUserId: user._id });
                            setSponsorSearch("");
                            setSponsorResults([]);
                          }}
                          className="px-4 py-2.5 text-sm text-left transition-colors hover:brightness-110"
                          style={{
                            color: "var(--fg)",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          {user.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* MCP & Context section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            MCP &amp; Context
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Personalize your Claude across every room. These settings are applied automatically when you join.
          </p>

          <div className="flex flex-col gap-6">
            {/* Personal Context MCP URL */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Personal Context MCP URL
              </label>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Your deployed Personal Context service URL. You can paste either a <code>/context</code> endpoint or an MCP URL ending in <code>/mcp</code>; Cha(t)os will resolve it automatically.
              </p>
              <input
                type="url"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://your-context.vercel.app/context"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>

            {/* Additional MCP servers */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                    Additional MCP servers
                  </label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
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
                <p className="text-xs italic" style={{ color: "var(--text-dim)" }}>
                  No extra MCP servers added.
                </p>
              )}

              {extraMcpServers.map((server, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => setExtraMcpServers((prev) => prev.map((s, j) => j === i ? { ...s, name: e.target.value } : s))}
                    placeholder="Name (e.g. ControlledChaos)"
                    className="w-full sm:w-[36%] px-3 py-2 rounded-lg text-sm outline-none transition-all field-focus"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--fg)",
                    }}
                  />
                  <div className="flex gap-2 flex-1 min-w-0">
                    <input
                      type="url"
                      value={server.url}
                      onChange={(e) => setExtraMcpServers((prev) => prev.map((s, j) => j === i ? { ...s, url: e.target.value } : s))}
                      placeholder="https://your-mcp.vercel.app/mcp"
                      className="px-3 py-2 rounded-lg text-sm outline-none transition-all font-mono flex-1 min-w-0 field-focus"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--fg)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setExtraMcpServers((prev) => prev.filter((_, j) => j !== i))}
                      className="text-xs px-2 py-2 rounded-lg transition-colors shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Context seed */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Import Claude Desktop context
              </label>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Paste a summary or recent exchange from Claude Desktop. Your Claude will have this as background context in every room.
                <br />
                <span style={{ color: "var(--text-dim)" }}>
                  Tip: ask Claude Desktop to summarize your recent conversations, then paste the result here.
                </span>
              </p>
              <textarea
                value={contextSeed}
                onChange={(e) => setContextSeed(e.target.value)}
                placeholder="Paste context from Claude Desktop here…"
                rows={5}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-none field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                  lineHeight: "1.6",
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

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Onboarding section */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Onboarding
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Re-run the setup wizard to reconfigure your API key, MCP, or just say hi to Claudiu again.
          </p>
          <button
            onClick={handleRestartOnboarding}
            className="px-4 py-2.5 rounded-lg text-sm transition-all"
            style={{
              background: "rgba(136,115,158,0.1)",
              border: "1px solid rgba(136,115,158,0.2)",
              color: "var(--mauve)",
            }}
          >
            Restart onboarding wizard
          </button>
        </section>
      </div>
    </main>
  );
}
