"use client";

import { useState } from "react";
import { ReactionPicker } from "./ReactionPicker";

interface GroupedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

interface ReactionBarProps {
  reactions: GroupedReaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, currentUserId, onToggle }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (reactions.length === 0 && !pickerOpen) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1 relative">
      {reactions.map((r) => {
        const isMine = r.userIds.includes(currentUserId);
        return (
          <button
            key={r.emoji}
            onClick={() => onToggle(r.emoji)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors"
            style={{
              background: isMine ? "rgba(139,189,185,0.15)" : "var(--surface)",
              border: isMine ? "1px solid rgba(139,189,185,0.4)" : "1px solid var(--border-subtle)",
              color: "var(--fg)",
            }}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: isMine ? "var(--sage-teal)" : "var(--text-muted)" }}
            >
              {r.count}
            </span>
          </button>
        );
      })}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center justify-center w-8 h-8 sm:w-6 sm:h-6 rounded-full transition-colors"
          style={{
            background: pickerOpen ? "rgba(139,189,185,0.15)" : "var(--surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="6" y1="2" x2="6" y2="10" />
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </button>
        {pickerOpen && (
          <ReactionPicker
            onSelect={(emoji) => onToggle(emoji)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
