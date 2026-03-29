"use client";

import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Doc } from "@/convex/_generated/dataModel";

interface MentionInputProps {
  participants: Doc<"participants">[];
  onSend: (content: string) => void;
  currentDisplayName: string;
  disabled?: boolean;
}

export default function MentionInput({
  participants,
  onSend,
  currentDisplayName,
  disabled,
}: MentionInputProps) {
  const [value, setValue] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [atPos, setAtPos] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const claudeNames = participants.map((p) => p.claudeName);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);

    const cursor = e.target.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");

    if (lastAt !== -1) {
      const query = before.slice(lastAt + 1);
      if (!query.includes(" ") && !query.includes("\n")) {
        const matches = claudeNames.filter((n) =>
          n.toLowerCase().startsWith(query.toLowerCase())
        );
        if (matches.length > 0) {
          setMentionOptions(matches);
          setMentionIndex(0);
          setAtPos(lastAt);
          setShowMentions(true);
          return;
        }
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name: string) => {
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, atPos);
    const after = value.slice(cursor);
    const newVal = `${before}@${name} ${after}`;
    setValue(newVal);
    setShowMentions(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    setShowMentions(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionOptions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionOptions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="relative">
      {/* @mention dropdown */}
      {showMentions && mentionOptions.length > 0 && (
        <div
          className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden z-10"
          style={{
            background: "rgba(30,24,48,0.97)",
            border: "1px solid rgba(139,189,185,0.2)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {mentionOptions.map((name, i) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(name);
              }}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors"
              style={{
                background:
                  i === mentionIndex ? "rgba(139,189,185,0.12)" : "transparent",
                color: "var(--off-white)",
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              <span style={{ color: "var(--sage-teal)" }}>@</span>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Input container */}
      <div
        className="flex items-end gap-3 px-4 py-3 rounded-2xl transition-all"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(247,245,250,0.08)",
        }}
      >
        <div className="flex-1 min-w-0">
          {/* Hint */}
          <div className="text-xs mb-1.5 select-none" style={{ color: "rgba(247,245,250,0.28)" }}>
            {currentDisplayName ? (
              <>
                Sending as{" "}
                <span style={{ color: "var(--amber)" }}>{currentDisplayName}</span>
                {" · "}
              </>
            ) : null}
            Type{" "}
            <span style={{ color: "var(--sage-teal)" }}>@name</span> to invoke a Claude ·{" "}
            <span style={{ color: "rgba(247,245,250,0.2)" }}>Shift+Enter for newline</span>
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Say something…"
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent outline-none resize-none text-sm"
            style={{
              color: "var(--off-white)",
              lineHeight: "1.6",
              maxHeight: "140px",
              overflowY: "auto",
            }}
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90"
          style={{
            background: canSend ? "var(--amber)" : "rgba(255,255,255,0.05)",
            color: canSend ? "var(--deep-dark)" : "rgba(247,245,250,0.2)",
            boxShadow: canSend ? "0 0 16px rgba(223,166,73,0.25)" : "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 7h12M8 2l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
