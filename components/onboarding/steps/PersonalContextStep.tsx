"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

const MCP_URL_KEY = "chatos:mcpUrl";

function normalizeContextUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // If user pastes an MCP URL ending in /mcp, convert to /context
  if (trimmed.endsWith("/mcp")) {
    return trimmed.replace(/\/mcp$/, "/context");
  }
  return trimmed;
}

export function PersonalContextStep() {
  const [url, setUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(MCP_URL_KEY) ?? "";
  });
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = () => {
    const normalized = normalizeContextUrl(url);
    localStorage.setItem(MCP_URL_KEY, normalized);
    setUrl(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const mcpConfigSnippet = `{
  "mcpServers": {
    "personal-context": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "<URL generated at https://personal-context-mcp.vercel.app>"
      ]
    }
  }
}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mcpConfigSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-5 py-2">
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        This is how your Claude remembers you across rooms and conversations. Deploy your own Personal
        Context MCP and paste the URL below. Totally optional &mdash; fill in as much or as little as
        you want.
      </p>

      {/* Deploy link */}
      <a
        href="https://personal-context-mcp.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm transition-all"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      >
        Deploy Personal Context MCP
        <ExternalLink size={14} />
      </a>

      {/* URL input */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
          Personal Context URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
          }}
          placeholder="https://your-context.vercel.app/context"
          autoComplete="off"
          className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
          style={{
            background: "var(--surface)",
            border: `1px solid ${saved ? "var(--soft-green)" : "var(--border)"}`,
            color: "var(--fg)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          You can paste either a <code>/context</code> endpoint or an MCP URL ending in <code>/mcp</code>.
        </p>

        {url.trim() && (
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
            style={{
              background: saved ? "rgba(151,209,129,0.15)" : "var(--amber)",
              color: saved ? "var(--soft-green)" : "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
            }}
          >
            {saved ? "Saved!" : "Save URL"}
          </button>
        )}
      </div>

      {/* Advanced: Claude config codeblock */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors"
          style={{ background: "var(--surface)", color: "var(--text-muted)" }}
        >
          <span>Advanced: Claude Desktop / Claude Code config</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAdvanced && (
          <div className="px-4 py-3" style={{ background: "rgba(0,0,0,0.2)" }}>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Add this to your Claude Desktop config file (<code>claude_desktop_config.json</code>) or
              Claude Code settings for full MCP integration:
            </p>
            <div className="relative">
              <pre
                className="text-xs font-mono p-3 rounded-lg overflow-x-auto"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  color: "var(--sage-teal)",
                  lineHeight: "1.6",
                }}
              >
                {mcpConfigSnippet}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-md transition-colors"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: copied ? "var(--soft-green)" : "var(--text-muted)",
                }}
                title="Copy to clipboard"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
              Replace the URL with your own deployed MCP URL if you have one.
            </p>
          </div>
        )}
      </div>

      {/* Claudiu tip */}
      <div className="flex items-start gap-3">
        <Image
          src="/claudiu/claudiu-idle.png"
          alt="Claudiu"
          width={32}
          height={32}
          style={{ imageRendering: "pixelated" }}
          className="shrink-0 mt-0.5"
        />
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(136,115,158,0.1)",
            border: "1px solid rgba(136,115,158,0.15)",
            color: "var(--fg)",
          }}
        >
          Pro tip: communication style is the biggest unlock. Tell me &quot;be blunt&quot; or
          &quot;explain like I&apos;m five&quot; and your Claude will actually listen.
        </div>
      </div>
    </div>
  );
}
