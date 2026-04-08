"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: "above" | "below";
}

export function ReactionPicker({ onSelect, onClose, position = "above" }: ReactionPickerProps) {
  const [showFull, setShowFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-50 ${position === "above" ? "bottom-full mb-1" : "top-full mt-1"}`}
      style={{ left: 0 }}
    >
      {showFull ? (
        <div className="rounded-xl overflow-hidden shadow-xl" style={{ border: "1px solid var(--border)" }}>
          <Picker
            data={async () => (await import("@emoji-mart/data")).default}
            onEmojiSelect={(emoji: { native: string }) => {
              onSelect(emoji.native);
              onClose();
            }}
            theme="dark"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
            perLine={8}
            maxFrequentRows={1}
          />
        </div>
      ) : (
        <div
          className="flex items-center gap-0.5 px-1.5 py-1 rounded-full shadow-lg"
          style={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
          }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-base"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setShowFull(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
