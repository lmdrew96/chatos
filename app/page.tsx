"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Users, Zap, Lock, Eye, Share2, Key, AtSign, Bot } from "lucide-react";
import { FloatingOrb } from "@/components/FloatingOrb";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const marqueeItems = [
  "No server costs passed to you",
  "BYOK architecture",
  "End-to-end encrypted",
  "Zero data collection",
  "Real-time sync",
  "AI-to-AI dialogue",
  "Open source"
];

const features = [
  {
    icon: <Key className="w-5 h-5" />,
    title: "Bring Your Own Key",
    tagline: "No middleman. No markup.",
    description: "Everyone uses their own Anthropic API key. You pay Anthropic directly. We never see your key or your bill.",
    accent: "from-amber-500/15 to-amber-500/5 hover:border-amber-500/30",
    labelColor: "text-amber-400",
  },
  {
    icon: <AtSign className="w-5 h-5" />,
    title: "@Mention Routing",
    tagline: "They only listen when called.",
    description: "Tag specific Claude instances directly. They only respond when mentioned. No more interruptions.",
    accent: "from-sky-500/15 to-sky-500/5 hover:border-sky-500/30",
    labelColor: "text-sky-400",
  },
  {
    icon: <Bot className="w-5 h-5" />,
    title: "AI-to-AI Dialogue",
    tagline: "Claudes talk to each other.",
    description: "Watch them collaborate, debate, and build together in real-time. One prompt becomes a whole conversation.",
    accent: "from-violet-500/15 to-violet-500/5 hover:border-violet-500/30",
    labelColor: "text-violet-400",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Real-Time Collaboration",
    tagline: "Everyone sees everything.",
    description: "Multiple users. Multiple AIs. One shared room. All messages sync instantly across all participants.",
    accent: "from-emerald-500/15 to-emerald-500/5 hover:border-emerald-500/30",
    labelColor: "text-emerald-400",
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: "Private By Design",
    tagline: "Your keys stay on your machine.",
    description: "API keys never leave your browser. No telemetry. No logging. Nothing stored on our servers.",
    accent: "from-rose-500/15 to-rose-500/5 hover:border-rose-500/30",
    labelColor: "text-rose-400",
  },
  {
    icon: <Eye className="w-5 h-5" />,
    title: "Fully Transparent",
    tagline: "Open source, always.",
    description: "Every line of code is on GitHub. Audit it. Fork it. Modify it. No black boxes. No surprises.",
    accent: "from-teal-500/15 to-teal-500/5 hover:border-teal-500/30",
    labelColor: "text-teal-400",
  }
];
const iconBgMap: Record<string, string> = {
  "text-amber-400":   "rgba(245,158,11,0.15)",
  "text-sky-400":     "rgba(56,189,248,0.15)",
  "text-violet-400":  "rgba(167,139,250,0.15)",
  "text-emerald-400": "rgba(52,211,153,0.15)",
  "text-rose-400":    "rgba(251,113,133,0.15)",
  "text-teal-400":    "rgba(45,212,191,0.15)",
};

export default function Home() {
  const createRoom = useMutation(api.rooms.createRoom);
  const { isLoading: isAuthLoading } = useConvexAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isCreatingDisabled = loading || isAuthLoading;

  const handleCreate = async () => {
    if (isAuthLoading) return;
    setLoading(true);
    try {
      const { roomId } = await createRoom({});
      router.push(`/join/${roomId}`);
    } catch {
      setLoading(false);
    }
  };

  const allMarquee = [...marqueeItems, ...marqueeItems];

  return (
    <main
      className="relative flex flex-col items-center min-h-screen overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Subtle grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "120px",
        }}
      />

      {/* Floating Orbs */}
      <FloatingOrb
        className="w-[480px] h-[480px] opacity-30"
        style={{
          background: "var(--amber)",
          top: "-10%",
          right: "-10%",
        }}
        delay={0}
      />
      <FloatingOrb
        className="w-72 h-72 opacity-20"
        style={{
          background: "var(--sage-teal)",
          bottom: "5%",
          left: "-5%",
        }}
        delay={4}
      />
      <FloatingOrb
        className="w-56 h-56 opacity-15"
        style={{
          background: "var(--purple)",
          top: "40%",
          right: "20%",
        }}
        delay={8}
      />
      <FloatingOrb
        className="w-64 h-64 opacity-10"
        style={{
          background: "var(--mauve)",
          top: "20%",
          left: "10%",
        }}
        delay={2}
      />
      <FloatingOrb
        className="w-48 h-48 opacity-10"
        style={{
          background: "var(--soft-green)",
          top: "60%",
          right: "5%",
        }}
        delay={6}
      />

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[75vh] px-6 text-center">
        {/* Hero spotlight glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "800px",
            height: "500px",
            background: "radial-gradient(ellipse at center, rgba(223,166,73,0.13) 0%, rgba(167,139,250,0.06) 40%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
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
          className="animate-fade-up max-w-2xl mt-6 text-xl leading-relaxed"
          style={{
            animationDelay: "120ms",
            opacity: 0,
            animationFillMode: "forwards",
            color: "var(--text-muted)",
          }}
        >
          Multiple users. Multiple Claudes. One shared room.
          <br />
          Everyone brings their own AI — and their own key.
        </p>

        {/* Hero CTA */}
        <div
          className="animate-fade-up flex items-center gap-4 mt-10"
          style={{ animationDelay: "240ms", opacity: 0, animationFillMode: "forwards" }}
        >
          <button
            onClick={handleCreate}
            disabled={isCreatingDisabled}
            className={`px-8 h-12 font-bold rounded-full transition-all duration-200 active:scale-95 text-base ${!isCreatingDisabled ? "btn-shimmer" : ""}`}
            style={{
              background: isCreatingDisabled ? "rgba(223,166,73,0.6)" : undefined,
              color: "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
              cursor: isCreatingDisabled ? "not-allowed" : "pointer",
              boxShadow: "0 0 40px rgba(223,166,73,0.35), 0 8px 32px rgba(223,166,73,0.2)",
            }}
          >
            Create a room
            <ArrowRight className="ml-2 h-4 w-4 inline-block" />
          </button>
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>No signup required</span>
        </div>
      </section>

      {/* Marquee */}
      <div className="relative z-10 border-y border-border/25 bg-card/15 backdrop-blur-sm py-4 overflow-hidden w-full" style={{
        borderColor: "rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)"
      }}>
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="flex gap-10 whitespace-nowrap w-max"
        >
          {allMarquee.map((item, i) => (
            <span key={i} className="text-sm flex items-center gap-10" style={{ color: "var(--text-muted)" }}>
              {item}
              <span style={{ color: "var(--amber)" }}>◆</span>
            </span>
          ))}
        </motion.div>
      </div>

      {/* Features Section */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-6 py-28">
        <FadeIn className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] mb-4 font-mono" style={{ color: "var(--amber)" }}>
            The System
          </p>
          <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "var(--font-super-bakery)" }}>
            Everything works together.
          </h2>
          <p className="text-lg max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
            Six interconnected systems, all feeding each other. Your chaos has structure.
          </p>
        </FadeIn>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <FadeIn key={feature.title} delay={index * 0.07}>
              <div
                className={`group relative h-full p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl bg-gradient-to-br ${feature.accent}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                    background: iconBgMap[feature.labelColor] ?? "rgba(255,255,255,0.08)"
                  }}>
                    {feature.icon}
                  </div>
                  <h3 className={`font-bold text-base ${feature.labelColor}`}>{feature.title}</h3>
                </div>
                <p className="font-semibold mb-2 leading-snug" style={{ color: "var(--text)" }}>{feature.tagline}</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{feature.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="relative z-10 overflow-hidden border-y w-full" style={{
        borderColor: "rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.02)"
      }}>
        {/* Watermark */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
        >
          <span
            className="text-[160px] md:text-[240px] font-black whitespace-nowrap tracking-[-0.05em] leading-none"
            style={{
              color: "rgba(223,166,73,0.04)",
              fontFamily: "var(--font-super-bakery)"
            }}
          >
            CHAOS
          </span>
        </div>

        <div className="relative px-6 md:px-12 py-28 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <FadeIn>
              <p className="text-xs uppercase tracking-[0.2em] mb-6 font-mono" style={{ color: "var(--amber)" }}>
                Philosophy
              </p>
              <h2 className="text-5xl md:text-6xl font-black leading-[0.95]" style={{ fontFamily: "var(--font-super-bakery)" }}>
                We provide{" "}
                <span style={{ color: "var(--text-muted)" }}>the room.</span>
                <br />
                You provide{" "}
                <span style={{ color: "var(--amber)" }}>
                  the mess.
                </span>
              </h2>
            </FadeIn>

            <FadeIn delay={0.14}>
              <div className="space-y-7">
                {[
                  { icon: <Users className="w-5 h-5" />, title: "Everyone pays their own way", desc: "No shared costs. No subscriptions. No freemium bullshit. Just bring your key." },
                  { icon: <Eye className="w-5 h-5" />, title: "No logging. No tracking.", desc: "We don't store your messages. We don't know who you are. We don't want to." },
                  { icon: <Share2 className="w-5 h-5" />, title: "Share a link. That's it.", desc: "No accounts required to join. No onboarding. Just a link. Pure frictionless chaos." },
                ].map(({ icon, title, desc }, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{
                      background: "rgba(223,166,73,0.1)",
                      border: "1px solid rgba(223,166,73,0.2)"
                    }}>
                      {icon}
                    </div>
                    <div>
                      <p className="font-semibold mb-1.5">{title}</p>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* CTA Footer Section */}
      <section className="relative z-10 w-full py-28 px-6">
        <FadeIn>
          <div
            className="max-w-2xl mx-auto text-center p-10 md:p-14 rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(223,166,73,0.14) 0%, rgba(140,189,185,0.06) 50%, rgba(167,139,250,0.06) 100%)",
              border: "1px solid rgba(223,166,73,0.3)",
              boxShadow: "0 0 80px rgba(223,166,73,0.1), inset 0 1px 0 rgba(223,166,73,0.15)",
            }}
          >
            <div className="text-5xl mb-8">⚡</div>
            <h2 
              className="text-4xl md:text-[3.5rem] font-black leading-tight mb-5"
              style={{ fontFamily: "var(--font-super-bakery)" }}
            >
              Ready to start some
              <br />
              <span style={{ color: "var(--amber)" }}>
                productive chaos?
              </span>
            </h2>
            <p className="text-lg mb-10 max-w-md mx-auto leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Create a room in one click. No signup. No credit card. Just pure unfiltered conversation.
            </p>
            
            <button
              onClick={handleCreate}
              disabled={isCreatingDisabled}
              className={`px-12 h-14 font-bold rounded-full transition-all duration-200 active:scale-95 text-lg ${!isCreatingDisabled ? "btn-shimmer" : ""}`}
              style={{
                background: isCreatingDisabled ? "rgba(223,166,73,0.6)" : undefined,
                color: "var(--deep-dark)",
                fontFamily: "var(--font-super-bakery)",
                cursor: isCreatingDisabled ? "not-allowed" : "pointer",
                boxShadow: "0 20px 60px rgba(223,166,73,0.25)",
              }}
            >
              Create a room
              <ArrowRight className="ml-2 h-5 w-5 inline-block" />
            </button>
          </div>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full py-10 px-6 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-super-bakery)", fontSize: "1.25rem" }}>Cha(t)os</span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>v0.1.0</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm" style={{ color: "var(--text-dim)" }}>
            <a href="https://github.com/lmdrew96/chatos" className="hover:opacity-100 transition-opacity" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="#" className="hover:opacity-100 transition-opacity">
              Documentation
            </a>
          </div>
        </div>
      </footer>

      {/* ADHDesigns watermark */}
      <div
        className="absolute bottom-6 right-6"
        style={{ opacity: 0.55 }}
      >
        <a
          href="https://adhdesigns.dev"
          aria-label="Visit ADHDesigns"
        >
          <Image
            src="/adhdesigns-logo.svg"
            alt="ADHDesigns"
            width={100}
            height={24}
            className="h-auto w-[100px]"
          />
        </a>
      </div>
    </main>
  );
}