"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";

export default function Home() {
  const createRoom = useMutation(api.rooms.createRoom);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { roomId } = await createRoom();
      router.push(`/join/${roomId}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden"
      style={{ background: "var(--deep-dark)" }}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-4">
        <TopBar />
      </div>

      {/* Ambient background glow */}
      <div
        className="animate-glow-pulse absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 55%, rgba(36,73,82,0.5) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 50% 50%, rgba(223,166,73,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 page-topbar-offset flex flex-col items-center gap-10 px-6 text-center">
        {/* Logo / wordmark */}
        <div
          className="animate-fade-up"
          style={{ animationDelay: "0ms" }}
        >
          <h1
            className="text-[clamp(4rem,15vw,9rem)] font-extrabold tracking-tight leading-none select-none"
            style={{ fontFamily: "var(--font-super-bakery)" }}
          >
            Cha
            <span style={{ color: "var(--amber)" }}>(t)</span>
            os
          </h1>
        </div>

        {/* Tagline */}
        <p
          className="animate-fade-up max-w-2xl text-base leading-relaxed"
          style={{
            animationDelay: "120ms",
            opacity: 0,
            animationFillMode: "forwards",
            color: "rgba(247,245,250,0.5)",
          }}
        >
          Multiple users. Multiple Claudes. One shared room.
          <br />
          Everyone brings their own AI — and their own key.
        </p>

        {/* Feature pills */}
        <div
          className="animate-fade-up flex flex-wrap justify-center gap-2"
          style={{
            animationDelay: "200ms",
            opacity: 0,
            animationFillMode: "forwards",
          }}
        >
          {["BYOK", "@mention routing", "AI-to-AI dialogue", "Real-time"].map(
            (tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium tracking-wide"
                style={{
                  background: "rgba(139,189,185,0.1)",
                  color: "var(--sage-teal)",
                  border: "1px solid rgba(139,189,185,0.2)",
                }}
              >
                {tag}
              </span>
            )
          )}
        </div>

        {/* CTA */}
        <div
          className="animate-fade-up"
          style={{
            animationDelay: "300ms",
            opacity: 0,
            animationFillMode: "forwards",
          }}
        >
          <button
            onClick={handleCreate}
            disabled={loading}
            className="group relative px-10 py-4 text-base font-bold rounded-xl transition-all duration-200 active:scale-95"
            style={{
              background: loading ? "rgba(223,166,73,0.6)" : "var(--amber)",
              color: "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading
                ? "none"
                : "0 0 40px rgba(223,166,73,0.25), 0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            {loading ? "Creating room…" : "Create a room"}
          </button>
        </div>

        <p
          className="animate-fade-up text-xs"
          style={{
            animationDelay: "380ms",
            opacity: 0,
            animationFillMode: "forwards",
            color: "rgba(247,245,250,0.2)",
          }}
        >
          Share the link after creation. Your API key stays on your machine.
        </p>

      </div>

      {/* ADHDesigns watermark */}
      <div
        className="absolute bottom-6"
        style={{ opacity: 0.55 }}
      >
        <a
          href="https://adhdesigns.dev"
          aria-label="Visit ADHDesigns"
        >
          <Image
            src="/adhdesigns-logo.svg"
            alt="ADHDesigns"
            width={130}
            height={31}
            className="h-auto w-[130px]"
          />
        </a>
      </div>
    </main>
  );
}
