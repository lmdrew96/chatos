"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { Check, X } from "lucide-react";

export function FirstMessageStep({ roomCode }: { roomCode: string | null }) {
  const router = useRouter();
  const hasKey = useQuery(api.apiKeys.hasApiKey);
  const [hasMcp, setHasMcp] = useState(false);

  useEffect(() => {
    setHasMcp(!!localStorage.getItem("chatos:mcpUrl"));
  }, []);

  const handleEnterRoom = () => {
    if (roomCode) {
      router.push(`/join/${roomCode}`);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Celebration */}
      <div className="text-4xl">🎉</div>

      {/* Claudiu sign-off */}
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/claudiu/claudiu-idle.png"
          alt="Claudiu"
          width={64}
          height={64}
          style={{ imageRendering: "pixelated" }}
        />
        <div
          className="rounded-2xl px-5 py-4 max-w-sm text-center"
          style={{
            background: "rgba(136,115,158,0.1)",
            border: "1px solid rgba(136,115,158,0.2)",
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "var(--fg)" }}>
            You&apos;re all set! I&apos;ll be around if you need me &mdash; hit the help button
            anytime. Now go cause some chaos. 🔥
          </p>
        </div>
      </div>

      {/* Setup summary */}
      <div
        className="w-full rounded-xl px-5 py-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h3
          className="text-xs font-medium tracking-widest uppercase mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          Setup summary
        </h3>
        <div className="flex flex-col gap-2">
          <SummaryItem label="API Key" done={hasKey === true} />
          <SummaryItem
            label="Personal Context MCP"
            done={hasMcp}
          />
          <SummaryItem label="Room" done={!!roomCode} />
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleEnterRoom}
        className="w-full py-3 rounded-lg font-bold text-sm transition-all"
        style={{
          background: "var(--amber)",
          color: "var(--deep-dark)",
          fontFamily: "var(--font-super-bakery)",
        }}
      >
        {roomCode ? "Enter your room" : "Go to Dashboard"}
      </button>
    </div>
  );
}

function SummaryItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <Check size={14} style={{ color: "var(--soft-green)" }} />
      ) : (
        <X size={14} style={{ color: "var(--text-dim)" }} />
      )}
      <span
        className="text-sm"
        style={{ color: done ? "var(--fg)" : "var(--text-dim)" }}
      >
        {label}
      </span>
    </div>
  );
}
