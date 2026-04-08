"use client";

import { ExternalLink, Key } from "lucide-react";
import Image from "next/image";

export function GetApiKeyStep() {
  return (
    <div className="flex flex-col gap-5 py-2">
      {/* BYOK explainer */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: "rgba(223,166,73,0.15)" }}
          >
            <Key size={18} style={{ color: "var(--amber)" }} />
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1" style={{ color: "var(--fg)" }}>
              Bring Your Own Key
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              An API key is like a password that lets Cha(t)os talk to Claude on your behalf. You&apos;ll
              get one from Anthropic (the company that makes Claude). Your key, your conversations, your
              cost.
            </p>
          </div>
        </div>
      </div>

      {/* Get your key */}
      <div className="flex flex-col gap-3">
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold text-sm transition-all"
          style={{
            background: "var(--amber)",
            color: "var(--deep-dark)",
            fontFamily: "var(--font-super-bakery)",
          }}
        >
          Get your API key
          <ExternalLink size={14} />
        </a>
        <p className="text-xs text-center" style={{ color: "var(--text-dim)" }}>
          Opens console.anthropic.com in a new tab. Create an account if you don&apos;t have one.
        </p>
      </div>

      {/* Billing note */}
      <div
        className="rounded-lg px-4 py-3 text-xs leading-relaxed"
        style={{
          background: "rgba(223,166,73,0.06)",
          border: "1px solid rgba(223,166,73,0.12)",
          color: "var(--text-muted)",
        }}
      >
        <strong style={{ color: "var(--amber)" }}>About billing:</strong> Anthropic charges based on
        usage &mdash; most casual users spend less than $5/month. You&apos;ll need to add a payment
        method on their platform first.
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
          Your key starts with <code className="font-mono" style={{ color: "var(--mauve)" }}>sk-ant-</code>.
          If it doesn&apos;t look like that, grab a different one. I&apos;ll wait!
        </div>
      </div>
    </div>
  );
}
