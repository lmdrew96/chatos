"use client";

import { useState } from "react";

const KEY = "chatos:apiKey";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(KEY) ?? "" : "")
  );
  const [saved, setSaved] = useState(false);
  const hasKey = apiKey.trim().length > 0;

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

  return (
    <main className="relative min-h-screen px-4 pb-8" style={{ background: "var(--deep-dark)" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(36,73,82,0.35) 0%, transparent 70%)",
        }}
      />


      <div className="relative z-10 max-w-2xl mx-auto page-topbar-offset">
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
      </div>
    </main>
  );
}
