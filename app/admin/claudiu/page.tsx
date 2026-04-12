"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Fast, capable" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Cheapest, quick" },
  { id: "claude-opus-4-6", label: "Opus 4.6", description: "Most capable" },
];

type Tab = "onboarding" | "room";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function ClaudiuAdminPage() {
  const isAdmin = useQuery(api.claudiuConfig.isAdmin);
  const config = useQuery(api.claudiuConfig.getConfig);
  const updateConfig = useMutation(api.claudiuConfig.updateConfig);

  // Usage queries
  const usageStats = useQuery(api.claudiuUsage.getUsageStats);
  const recentCalls = useQuery(api.claudiuUsage.getRecentCalls);

  // BYOK usage queries (your API key only)
  const byokUsageStats = useQuery(api.tokenUsage.getUsageStats);
  const byokRecentCalls = useQuery(api.tokenUsage.getRecentCalls);

  // History queries
  const history = useQuery(api.claudiuConfigHistory.listHistory);
  const restoreVersion = useMutation(api.claudiuConfigHistory.restoreVersion);

  // ── Local form state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("onboarding");
  const [onboardingPrompt, setOnboardingPrompt] = useState("");
  const [roomPrompt, setRoomPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [onboardingMaxTokens, setOnboardingMaxTokens] = useState(512);
  const [roomMaxTokens, setRoomMaxTokens] = useState(1024);
  const [onboardingHistoryLimit, setOnboardingHistoryLimit] = useState(20);
  const [roomHistoryLimit, setRoomHistoryLimit] = useState(40);
  const [rateLimitMaxMessages, setRateLimitMaxMessages] = useState(30);
  const [rateLimitWindowMinutes, setRateLimitWindowMinutes] = useState(10);
  const [helperMcpUrl, setHelperMcpUrl] = useState("");
  const [roomMcpUrl, setRoomMcpUrl] = useState("");
  const [mcpServers, setMcpServers] = useState<{ name: string; url: string; allowedTools?: string[] }[]>([]);
  const [adminToolDiscovery, setAdminToolDiscovery] = useState<Record<number, { tools: { name: string; description: string }[]; loading: boolean; error?: string; expanded: boolean }>>({});
  const [temperatureEnabled, setTemperatureEnabled] = useState(false);
  const [temperature, setTemperature] = useState(1.0);
  const [topPEnabled, setTopPEnabled] = useState(false);
  const [topP, setTopP] = useState(1.0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // ── Test chat state ─────────────────────────────────────────────────────────
  const [testMessages, setTestMessages] = useState<{ role: string; content: string }[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testStreaming, setTestStreaming] = useState(false);
  const testScrollRef = useRef<HTMLDivElement>(null);

  // Hydrate form from config on first load
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || !config) return;
    setOnboardingPrompt(config.onboardingPrompt);
    setRoomPrompt(config.roomPrompt);
    setModel(config.model);
    setOnboardingMaxTokens(config.onboardingMaxTokens);
    setRoomMaxTokens(config.roomMaxTokens);
    setOnboardingHistoryLimit(config.onboardingHistoryLimit);
    setRoomHistoryLimit(config.roomHistoryLimit);
    setRateLimitMaxMessages(config.rateLimitMaxMessages);
    setRateLimitWindowMinutes(config.rateLimitWindowMinutes);
    setHelperMcpUrl(config.helperMcpUrl ?? "");
    setRoomMcpUrl(config.roomMcpUrl ?? "");
    setMcpServers(config.mcpServers ?? []);
    if (config.temperature !== undefined) {
      setTemperatureEnabled(true);
      setTemperature(Math.min(config.temperature, 1.0));
    }
    if (config.topP !== undefined) {
      setTopPEnabled(true);
      setTopP(Math.min(config.topP, 1.0));
    }
    setHydrated(true);
  }, [config, hydrated]);

  // Track dirty state
  useEffect(() => {
    if (!config || !hydrated) return;
    const currentTemp = temperatureEnabled ? temperature : undefined;
    const currentTopP = topPEnabled ? topP : undefined;
    const isDirty =
      onboardingPrompt !== config.onboardingPrompt ||
      roomPrompt !== config.roomPrompt ||
      model !== config.model ||
      onboardingMaxTokens !== config.onboardingMaxTokens ||
      roomMaxTokens !== config.roomMaxTokens ||
      onboardingHistoryLimit !== config.onboardingHistoryLimit ||
      roomHistoryLimit !== config.roomHistoryLimit ||
      rateLimitMaxMessages !== config.rateLimitMaxMessages ||
      rateLimitWindowMinutes !== config.rateLimitWindowMinutes ||
      helperMcpUrl !== (config.helperMcpUrl ?? "") ||
      roomMcpUrl !== (config.roomMcpUrl ?? "") ||
      JSON.stringify(mcpServers) !== JSON.stringify(config.mcpServers ?? []) ||
      currentTemp !== config.temperature ||
      currentTopP !== config.topP;
    setDirty(isDirty);
  }, [config, hydrated, onboardingPrompt, roomPrompt, model, onboardingMaxTokens, roomMaxTokens, onboardingHistoryLimit, roomHistoryLimit, rateLimitMaxMessages, rateLimitWindowMinutes, helperMcpUrl, roomMcpUrl, mcpServers, temperatureEnabled, temperature, topPEnabled, topP]);

  // Auto-scroll test chat
  useEffect(() => {
    testScrollRef.current?.scrollTo({ top: testScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [testMessages]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({
        onboardingPrompt,
        roomPrompt,
        model,
        onboardingMaxTokens,
        roomMaxTokens,
        onboardingHistoryLimit,
        roomHistoryLimit,
        rateLimitMaxMessages,
        rateLimitWindowMinutes,
        helperMcpUrl: helperMcpUrl.trim() || undefined,
        roomMcpUrl: roomMcpUrl.trim() || undefined,
        mcpServers: mcpServers.filter((s) => s.name.trim() && s.url.trim()),
        temperature: temperatureEnabled ? temperature : null,
        topP: topPEnabled ? topP : null,
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert("Failed to save: " + (e.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    try {
      await restoreVersion({ version });
      setHydrated(false); // Re-hydrate from the restored config
    } catch (e: any) {
      alert("Failed to restore: " + (e.message ?? "Unknown error"));
    } finally {
      setRestoringVersion(null);
    }
  };

  // Compute which fields changed between adjacent history versions
  const historyWithChanges = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map((entry, i) => {
      const newer = i === 0 ? config : history[i - 1]?.snapshot;
      if (!newer) return { ...entry, changes: [] as string[] };
      const snap = entry.snapshot;
      const changes: string[] = [];
      const compare = (key: string, a: unknown, b: unknown) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(key);
      };
      compare("onboardingPrompt", snap.onboardingPrompt, "onboardingPrompt" in newer ? (newer as any).onboardingPrompt : undefined);
      compare("roomPrompt", snap.roomPrompt, "roomPrompt" in newer ? (newer as any).roomPrompt : undefined);
      compare("model", snap.model, "model" in newer ? (newer as any).model : undefined);
      compare("onboardingMaxTokens", snap.onboardingMaxTokens, "onboardingMaxTokens" in newer ? (newer as any).onboardingMaxTokens : undefined);
      compare("roomMaxTokens", snap.roomMaxTokens, "roomMaxTokens" in newer ? (newer as any).roomMaxTokens : undefined);
      compare("temperature", snap.temperature, "temperature" in newer ? (newer as any).temperature : undefined);
      compare("topP", snap.topP, "topP" in newer ? (newer as any).topP : undefined);
      return { ...entry, changes };
    });
  }, [history, config]);

  const handleTestSend = async () => {
    const text = testInput.trim();
    if (!text || testStreaming) return;

    const newMessages = [...testMessages, { role: "user", content: text }];
    setTestMessages(newMessages);
    setTestInput("");
    setTestStreaming(true);

    try {
      const endpoint = tab === "onboarding" ? "/api/claudiu" : "/api/claudiu/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTestMessages((prev) => [...prev, { role: "assistant", content: `Error: ${(err as any).error ?? res.statusText}` }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let assistantText = "";
      setTestMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              assistantText += parsed.delta.text;
              setTestMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } catch (e: any) {
      setTestMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setTestStreaming(false);
    }
  };

  // ── Gate ─────────────────────────────────────────────────────────────────────
  if (isAdmin === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p style={{ color: "var(--text-muted)" }}>You don't have access to this page.</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-4 pb-8" style={{ background: "var(--bg)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto page-topbar-offset flex flex-col gap-8">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Configure Claudiu's behavior across the platform. Changes take effect immediately.
        </p>

        {/* ── Usage & Analytics ─────────────────────────────────────────────── */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Usage &amp; Analytics
          </h2>

          {usageStats ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(["24h", "7d", "30d"] as const).map((window) => {
                  const w = usageStats.windows[window];
                  return (
                    <div
                      key={window}
                      className="rounded-xl px-4 py-3"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                        {window}
                      </p>
                      <p
                        className="text-xl font-bold"
                        style={{ color: "var(--amber)", fontFamily: "var(--font-super-bakery)" }}
                      >
                        {formatCost(w.estimatedCost)}
                      </p>
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {w.messageCount} calls
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {((w.totalInput + w.totalOutput) / 1000).toFixed(1)}k tok
                        </span>
                      </div>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          {w.onboarding} onb
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          {w.room} room
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {usageStats.truncated && (
                <p className="text-xs mb-3 italic" style={{ color: "var(--text-dim)" }}>
                  Showing last 500 records. Older usage is not included.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Loading usage data...</p>
          )}

          {/* Recent calls table */}
          {recentCalls && recentCalls.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface)" }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Time</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Endpoint</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Room</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Model</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>In</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cache W</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cache R</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Out</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((call) => (
                    <tr key={call._id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{timeAgo(call.timestamp)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--fg)" }}>{call.endpoint}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--text-muted)" }} title={call.roomName ?? "—"}>
                        {call.roomName ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--text-muted)" }}>
                        {call.model.replace("claude-", "").split("-").slice(0, 2).join(" ")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>
                        {call.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {(call.cacheCreationTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {(call.cacheReadTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>
                        {call.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--amber)" }}>
                        {formatCost(call.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── BYOK Agent Usage ──────────────────────────────────────────────── */}
        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            BYOK Agent Usage (Your Key)
          </h2>

          {byokUsageStats ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(["24h", "7d", "30d"] as const).map((window) => {
                  const w = byokUsageStats.windows[window];
                  return (
                    <div
                      key={window}
                      className="rounded-xl px-4 py-3"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                        {window}
                      </p>
                      <p
                        className="text-xl font-bold"
                        style={{ color: "var(--sage-teal)", fontFamily: "var(--font-super-bakery)" }}
                      >
                        {formatCost(w.estimatedCost)}
                      </p>
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {w.callCount} calls
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {((w.totalInput + w.totalOutput) / 1000).toFixed(1)}k tok
                        </span>
                      </div>
                      {(w.totalCacheRead > 0 || w.totalCacheCreation > 0) && (
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-xs" style={{ color: "var(--soft-green)" }}>
                            {((w.totalCacheRead) / 1000).toFixed(1)}k cached
                          </span>
                          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                            {((w.totalCacheCreation) / 1000).toFixed(1)}k cache-write
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-agent breakdown for 7d window */}
              {Object.keys(byokUsageStats.windows["7d"].byAgent).length > 0 && (
                <div
                  className="rounded-xl overflow-hidden mb-4"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "var(--surface)" }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Agent (7d)</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Calls</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>In</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Out</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byokUsageStats.windows["7d"].byAgent)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([name, stats]) => (
                          <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="px-3 py-2 font-medium" style={{ color: "var(--fg)" }}>{name}</td>
                            <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text-muted)" }}>{stats.calls}</td>
                            <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>{stats.input.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>{stats.output.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--sage-teal)" }}>{formatCost(stats.cost)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {byokUsageStats.truncated && (
                <p className="text-xs mb-3 italic" style={{ color: "var(--text-dim)" }}>
                  Showing last 500 records. Older usage is not included.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Loading BYOK usage data...</p>
          )}

          {/* Recent BYOK calls table */}
          {byokRecentCalls && byokRecentCalls.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface)" }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Time</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Agent</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Room</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>In</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cache W</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cache R</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Out</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byokRecentCalls.map((call) => (
                    <tr key={call._id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{timeAgo(call.timestamp)}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--fg)" }}>{call.claudeName}</td>
                      <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--text-muted)" }} title={call.roomName ?? "—"}>
                        {call.roomName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>
                        {call.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {(call.cacheCreationTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {(call.cacheReadTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--fg)" }}>
                        {call.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--sage-teal)" }}>
                        {formatCost(call.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── System Prompts ────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2
              className="text-xs font-medium tracking-widest uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              System Prompts
            </h2>
            <div className="flex gap-1">
              {(["onboarding", "room"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setTestMessages([]); }}
                  className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
                  style={{
                    background: tab === t ? "rgba(223,166,73,0.12)" : "transparent",
                    border: tab === t ? "1px solid var(--amber)" : "1px solid transparent",
                    color: tab === t ? "var(--amber)" : "var(--text-muted)",
                  }}
                >
                  {t === "onboarding" ? "Onboarding" : "In-Room"}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: showHistory ? "rgba(136,115,158,0.15)" : "transparent",
                border: showHistory ? "1px solid rgba(136,115,158,0.3)" : "1px solid var(--border)",
                color: showHistory ? "var(--mauve)" : "var(--text-muted)",
              }}
            >
              History
            </button>
          </div>

          <textarea
            value={tab === "onboarding" ? onboardingPrompt : roomPrompt}
            onChange={(e) => {
              if (tab === "onboarding") setOnboardingPrompt(e.target.value);
              else setRoomPrompt(e.target.value);
            }}
            rows={12}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all resize-y font-mono field-focus"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              lineHeight: "1.6",
            }}
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--text-dim)" }}>
            {tab === "onboarding"
              ? "This prompt powers the onboarding help chatbot. It's scoped to app-related questions only."
              : "This prompt powers Claudiu in chat rooms. The identity rules and platform features block is appended automatically."}
          </p>

          {/* History panel */}
          {showHistory && (
            <div
              className="mt-4 rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Config History — {historyWithChanges.length} version{historyWithChanges.length !== 1 ? "s" : ""}
                </p>
              </div>
              {historyWithChanges.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center italic" style={{ color: "var(--text-dim)" }}>
                  No history yet. Changes are recorded each time you save.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {historyWithChanges.map((entry) => (
                    <div
                      key={entry._id}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono" style={{ color: "var(--fg)" }}>
                          v{entry.version}
                        </span>
                        <span className="text-xs ml-2" style={{ color: "var(--text-dim)" }}>
                          {timeAgo(entry.savedAt)}
                        </span>
                        {entry.changes.length > 0 && (
                          <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                            changed: {entry.changes.join(", ")}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRestore(entry.version)}
                        disabled={restoringVersion !== null}
                        className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-colors disabled:opacity-40"
                        style={{
                          background: "rgba(136,115,158,0.15)",
                          color: "var(--mauve)",
                          border: "1px solid rgba(136,115,158,0.2)",
                        }}
                      >
                        {restoringVersion === entry.version ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Model & Limits ────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Model &amp; Limits
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Model selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Model
              </label>
              <div className="flex flex-col gap-1.5">
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setModel(opt.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{
                      background: model === opt.id ? "rgba(223,166,73,0.1)" : "var(--surface)",
                      border: model === opt.id ? "1px solid var(--amber)" : "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: model === opt.id ? "var(--amber)" : "var(--border)",
                      }}
                    >
                      {model === opt.id && (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--amber)" }} />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                        {opt.label}
                      </span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-dim)" }}>
                        {opt.description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Max tokens */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                  Max Tokens — Onboarding
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={128}
                    max={4096}
                    step={128}
                    value={onboardingMaxTokens}
                    onChange={(e) => setOnboardingMaxTokens(Number(e.target.value))}
                    className="flex-1 accent-amber"
                    style={{ accentColor: "var(--amber)" }}
                  />
                  <span
                    className="text-sm font-mono w-14 text-right"
                    style={{ color: "var(--fg)" }}
                  >
                    {onboardingMaxTokens}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                  Max Tokens — In-Room
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={128}
                    max={4096}
                    step={128}
                    value={roomMaxTokens}
                    onChange={(e) => setRoomMaxTokens(Number(e.target.value))}
                    className="flex-1"
                    style={{ accentColor: "var(--amber)" }}
                  />
                  <span
                    className="text-sm font-mono w-14 text-right"
                    style={{ color: "var(--fg)" }}
                  >
                    {roomMaxTokens}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Sampling Parameters ───────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Sampling Parameters
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Anthropic recommends setting temperature OR top-p, not both. Leave disabled to use defaults.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTemperatureEnabled(!temperatureEnabled)}
                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all"
                  style={{
                    borderColor: temperatureEnabled ? "var(--amber)" : "var(--border)",
                    background: temperatureEnabled ? "var(--amber)" : "transparent",
                  }}
                >
                  {temperatureEnabled && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="var(--deep-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <label className="text-sm font-medium" style={{ color: temperatureEnabled ? "var(--fg)" : "var(--text-muted)" }}>
                  Temperature
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  disabled={!temperatureEnabled}
                  className="flex-1"
                  style={{ accentColor: "var(--amber)", opacity: temperatureEnabled ? 1 : 0.3 }}
                />
                <span
                  className="text-sm font-mono w-10 text-right"
                  style={{ color: temperatureEnabled ? "var(--fg)" : "var(--text-dim)" }}
                >
                  {temperatureEnabled ? temperature.toFixed(2) : "—"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTopPEnabled(!topPEnabled)}
                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all"
                  style={{
                    borderColor: topPEnabled ? "var(--amber)" : "var(--border)",
                    background: topPEnabled ? "var(--amber)" : "transparent",
                  }}
                >
                  {topPEnabled && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="var(--deep-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <label className="text-sm font-medium" style={{ color: topPEnabled ? "var(--fg)" : "var(--text-muted)" }}>
                  Top-P
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={topP}
                  onChange={(e) => setTopP(Number(e.target.value))}
                  disabled={!topPEnabled}
                  className="flex-1"
                  style={{ accentColor: "var(--amber)", opacity: topPEnabled ? 1 : 0.3 }}
                />
                <span
                  className="text-sm font-mono w-10 text-right"
                  style={{ color: topPEnabled ? "var(--fg)" : "var(--text-dim)" }}
                >
                  {topPEnabled ? topP.toFixed(2) : "—"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── History Window ─────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Message History Window
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            How many recent messages to include in each API call. Higher = more context, more tokens.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Onboarding
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={onboardingHistoryLimit}
                  onChange={(e) => setOnboardingHistoryLimit(Number(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "var(--amber)" }}
                />
                <span className="text-sm font-mono w-10 text-right" style={{ color: "var(--fg)" }}>
                  {onboardingHistoryLimit}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                In-Room
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={roomHistoryLimit}
                  onChange={(e) => setRoomHistoryLimit(Number(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "var(--amber)" }}
                />
                <span className="text-sm font-mono w-10 text-right" style={{ color: "var(--fg)" }}>
                  {roomHistoryLimit}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Rate Limiting ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Rate Limiting (Onboarding)
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Limits how often users can message the onboarding chatbot. In-room Claudiu uses Anthropic's own rate limits.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Max messages per window
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={rateLimitMaxMessages}
                onChange={(e) => setRateLimitMaxMessages(Number(e.target.value) || 1)}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Window (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={rateLimitWindowMinutes}
                onChange={(e) => setRateLimitWindowMinutes(Number(e.target.value) || 1)}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>
          </div>
        </section>

        {/* ── Personal Context MCP ───────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Personal Context MCP
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Separate PCTX instances for each Claudiu persona. In-room Claudiu can read/write both.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Helper PCTX URL
              </label>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                App knowledge, onboarding facts, user FAQ patterns.
              </p>
              <input
                type="url"
                value={helperMcpUrl}
                onChange={(e) => setHelperMcpUrl(e.target.value)}
                placeholder="https://your-helper-pctx.vercel.app/mcp?token=..."
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Room PCTX URL
              </label>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                General knowledge, conversation context, personality notes.
              </p>
              <input
                type="url"
                value={roomMcpUrl}
                onChange={(e) => setRoomMcpUrl(e.target.value)}
                placeholder="https://your-room-pctx.vercel.app/mcp?token=..."
                autoComplete="off"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>
          </div>
        </section>

        {/* ── MCP Servers ────────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                MCP Servers
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Additional MCP servers Claudiu can access in rooms. Tools from these servers are available at call time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMcpServers((prev) => [...prev, { name: "", url: "" }])}
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

          {mcpServers.length === 0 && (
            <p className="text-xs italic" style={{ color: "var(--text-dim)" }}>
              No extra MCP servers. The Personal Context URLs above are always included.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {mcpServers.map((server, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) =>
                      setMcpServers((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s))
                      )
                    }
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
                      onChange={(e) =>
                        setMcpServers((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, url: e.target.value } : s))
                        )
                      }
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
                      onClick={() => {
                        setMcpServers((prev) => prev.filter((_, j) => j !== i));
                        setAdminToolDiscovery((prev) => { const next = { ...prev }; delete next[i]; return next; });
                      }}
                      className="text-xs px-2 py-2 rounded-lg transition-colors shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Tool permissions */}
                <div className="ml-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const disc = adminToolDiscovery[i];
                      if (disc?.expanded) {
                        setAdminToolDiscovery((prev) => ({ ...prev, [i]: { ...prev[i], expanded: false } }));
                        return;
                      }
                      if (disc?.tools?.length) {
                        setAdminToolDiscovery((prev) => ({ ...prev, [i]: { ...prev[i], expanded: true } }));
                        return;
                      }
                      if (!server.url.trim()) return;
                      setAdminToolDiscovery((prev) => ({ ...prev, [i]: { tools: [], loading: true, expanded: true } }));
                      try {
                        const res = await fetch("/api/mcp/tools", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ url: server.url }),
                        });
                        const data = await res.json();
                        setAdminToolDiscovery((prev) => ({
                          ...prev,
                          [i]: { tools: data.tools ?? [], loading: false, error: data.error, expanded: true },
                        }));
                      } catch (e: any) {
                        setAdminToolDiscovery((prev) => ({
                          ...prev,
                          [i]: { tools: [], loading: false, error: e.message, expanded: true },
                        }));
                      }
                    }}
                    className="text-xs px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                    style={{ color: "var(--sage-teal)" }}
                  >
                    {adminToolDiscovery[i]?.expanded ? "▾" : "▸"} Tools
                    {server.allowedTools ? ` (${server.allowedTools.length} enabled)` : " (all enabled)"}
                  </button>

                  {adminToolDiscovery[i]?.expanded && (
                    <div
                      className="mt-1 p-2 rounded-lg text-xs"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      {adminToolDiscovery[i]?.loading && (
                        <p style={{ color: "var(--text-muted)" }}>Discovering tools...</p>
                      )}
                      {adminToolDiscovery[i]?.error && !adminToolDiscovery[i]?.tools?.length && (
                        <p style={{ color: "var(--amber)" }}>
                          Could not discover tools: {adminToolDiscovery[i].error}
                        </p>
                      )}
                      {adminToolDiscovery[i]?.tools?.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ color: "var(--text-muted)" }}>
                              {adminToolDiscovery[i].tools.length} tool{adminToolDiscovery[i].tools.length !== 1 ? "s" : ""} available
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setMcpServers((prev) => prev.map((s, j) =>
                                  j === i ? { ...s, allowedTools: undefined } : s
                                ));
                              }}
                              className="text-xs underline"
                              style={{ color: "var(--sage-teal)" }}
                            >
                              Enable all
                            </button>
                          </div>
                          {adminToolDiscovery[i].tools.map((tool) => {
                            const isAllowed = !server.allowedTools || server.allowedTools.includes(tool.name);
                            return (
                              <label
                                key={tool.name}
                                className="flex items-start gap-2 py-0.5 cursor-pointer"
                                style={{ color: "var(--fg)" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAllowed}
                                  onChange={(e) => {
                                    setMcpServers((prev) => prev.map((s, j) => {
                                      if (j !== i) return s;
                                      const allToolNames = adminToolDiscovery[i].tools.map((t) => t.name);
                                      const current = s.allowedTools ?? allToolNames;
                                      const updated = e.target.checked
                                        ? [...current, tool.name]
                                        : current.filter((t) => t !== tool.name);
                                      const allEnabled = allToolNames.every((t) => updated.includes(t));
                                      return { ...s, allowedTools: allEnabled ? undefined : updated };
                                    }));
                                  }}
                                  className="mt-0.5 accent-[var(--sage-teal)]"
                                />
                                <div>
                                  <span className="font-mono">{tool.name}</span>
                                  {tool.description && (
                                    <span style={{ color: "var(--text-muted)" }}> — {tool.description}</span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {!adminToolDiscovery[i]?.loading && !adminToolDiscovery[i]?.tools?.length && !adminToolDiscovery[i]?.error && (
                        <p style={{ color: "var(--text-muted)" }}>No tools found on this server.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Save bar ───────────────────────────────────────────────────────── */}
        <div
          className="sticky bottom-4 flex items-center justify-between px-5 py-3 rounded-xl backdrop-blur-md"
          style={{
            background: "rgba(var(--surface-rgb, 30,30,30), 0.85)",
            border: dirty ? "1px solid var(--amber)" : "1px solid var(--border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center gap-2">
            {dirty && (
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--amber)" }} />
            )}
            <span className="text-xs" style={{ color: dirty ? "var(--amber)" : "var(--text-muted)" }}>
              {saved ? "Saved!" : dirty ? "Unsaved changes" : "No changes"}
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-5 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-40"
            style={{
              background: saved ? "rgba(151,209,129,0.15)" : "var(--amber)",
              color: saved ? "var(--soft-green)" : "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
            }}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
          </button>
        </div>

        {/* ── Test Chat ──────────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }} />

        <section>
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Live Preview — {tab === "onboarding" ? "Onboarding" : "In-Room"} Claudiu
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Test the current <strong>saved</strong> prompt. Save your changes first to test them here.
          </p>

          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            {/* Chat messages */}
            <div
              ref={testScrollRef}
              className="p-4 flex flex-col gap-3 overflow-y-auto"
              style={{ maxHeight: 320, minHeight: 160 }}
            >
              {testMessages.length === 0 && (
                <p className="text-xs text-center py-8" style={{ color: "var(--text-dim)" }}>
                  Send a message to test Claudiu's response.
                </p>
              )}
              {testMessages.map((msg, i) => (
                <div
                  key={i}
                  className="flex gap-2"
                  style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
                >
                  <div
                    className={`px-3 py-2 rounded-lg text-sm max-w-[80%]${msg.role === "assistant" ? " prose prose-invert prose-sm max-w-none" : ""}`}
                    style={{
                      background:
                        msg.role === "user"
                          ? "rgba(223,166,73,0.12)"
                          : "rgba(136,115,158,0.1)",
                      color: "var(--fg)",
                      whiteSpace: msg.role === "user" ? "pre-wrap" : undefined,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.role === "assistant" && msg.content ? (
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    ) : (
                      msg.content || (testStreaming && i === testMessages.length - 1 ? "..." : "")
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTestSend(); } }}
                placeholder="Test a message..."
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none field-focus"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
              <button
                onClick={handleTestSend}
                disabled={!testInput.trim() || testStreaming}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: "var(--amber)",
                  color: "var(--deep-dark)",
                }}
              >
                Send
              </button>
              {testMessages.length > 0 && (
                <button
                  onClick={() => setTestMessages([])}
                  className="px-3 py-2 rounded-lg text-xs transition-all"
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
