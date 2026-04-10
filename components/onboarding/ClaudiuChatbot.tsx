"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Send } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ClaudiuChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/claudiu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Something went wrong");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              accumulated += event.delta.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch {
            // skip invalid JSON
          }
        }
      }

      // Ensure final state
      if (accumulated) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Oops! ${err.message || "Something went wrong."}  Try again in a sec.`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-20 right-5 z-45 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
            style={{
              background: "linear-gradient(135deg, rgba(136,115,158,0.3), rgba(140,189,185,0.3))",
              border: "2px solid rgba(136,115,158,0.4)",
              boxShadow: "0 4px 20px rgba(136,115,158,0.3)",
            }}
            title="Chat with Claudiu"
          >
            <div
              className="w-10 h-10 pointer-events-none"
              style={{
                backgroundImage: "url(/claudiu/claudiu-walk-2x.png)",
                backgroundSize: "320px 40px",
                imageRendering: "pixelated",
                animation: "claudiu-walk 0.8s steps(8) infinite",
              }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-20 right-5 z-45 w-80 flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              maxHeight: "min(500px, calc(100vh - 100px))",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <Image
                  src="/claudiu/claudiu-idle.png"
                  alt="Claudiu"
                  width={28}
                  height={28}
                  style={{ imageRendering: "pixelated" }}
                />
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "var(--font-super-bakery)", color: "var(--fg)" }}
                >
                  Claudiu
                </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  help bot
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-[200px]">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Image
                    src="/claudiu/claudiu-idle.png"
                    alt="Claudiu"
                    width={48}
                    height={48}
                    style={{ imageRendering: "pixelated" }}
                  />
                  <p className="text-xs text-center leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Hey! I&apos;m Claudiu. Ask me anything about Cha(t)os &mdash; setup, rooms, API keys,
                    whatever!
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "assistant" && (
                    <Image
                      src="/claudiu/claudiu-idle.png"
                      alt="Claudiu"
                      width={24}
                      height={24}
                      style={{ imageRendering: "pixelated", width: 24, height: 24 }}
                      className="shrink-0 self-start mt-1"
                    />
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 text-sm max-w-[85%] leading-relaxed${msg.role === "assistant" && msg.content ? " prose prose-invert prose-sm max-w-none" : ""}`}
                    style={{
                      background:
                        msg.role === "user"
                          ? "rgba(223,166,73,0.12)"
                          : "rgba(136,115,158,0.1)",
                      border: `1px solid ${
                        msg.role === "user"
                          ? "rgba(223,166,73,0.2)"
                          : "rgba(136,115,158,0.15)"
                      }`,
                      color: "var(--fg)",
                    }}
                  >
                    {msg.role === "assistant" && msg.content ? (
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    ) : msg.content ? (
                      msg.content
                    ) : (
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--mauve)" }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--mauve)", animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--mauve)", animationDelay: "0.4s" }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="flex items-center gap-2 px-3 py-3 shrink-0"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask Claudiu..."
                disabled={streaming}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none transition-all field-focus"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                className="p-2 rounded-lg transition-all shrink-0"
                style={{
                  background: input.trim() && !streaming ? "var(--amber)" : "var(--surface)",
                  color: input.trim() && !streaming ? "var(--deep-dark)" : "var(--text-muted)",
                  opacity: !input.trim() || streaming ? 0.5 : 1,
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
