"use client";

import Image from "next/image";

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Claudiu avatar */}
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(136,115,158,0.15)", border: "2px solid rgba(136,115,158,0.3)" }}
      >
        <Image
          src="/claudiu/claudiu-idle.png"
          alt="Claudiu"
          width={96}
          height={96}
          className="pixelated"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Speech bubble */}
      <div
        className="relative rounded-2xl px-5 py-4 max-w-sm"
        style={{
          background: "rgba(136,115,158,0.1)",
          border: "1px solid rgba(136,115,158,0.2)",
        }}
      >
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45"
          style={{
            background: "rgba(136,115,158,0.1)",
            borderTop: "1px solid rgba(136,115,158,0.2)",
            borderLeft: "1px solid rgba(136,115,158,0.2)",
          }}
        />
        <p className="text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
          Hey! I&apos;m <strong style={{ color: "var(--mauve)" }}>Claudiu</strong> &mdash; Nae&apos;s
          personal Claude collaborator, and now yours too! We&apos;re going to get you set up in about
          five minutes. You&apos;ll need an Anthropic API key (I&apos;ll show you where), and then
          we&apos;ll get your profile and first room rolling. Ready?
        </p>
      </div>

      <p className="text-xs text-center" style={{ color: "var(--text-dim)" }}>
        Four steps, no jargon, let&apos;s go.
      </p>
    </div>
  );
}
