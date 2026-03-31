"use client";

import Markdown from "react-markdown";
import { Doc } from "@/convex/_generated/dataModel";

interface Color {
  text: string;
  bg: string;
}

interface MessageBubbleProps {
  message: Doc<"messages">;
  currentUserId: string;
  participantColors: Record<string, Color>;
}

function BotIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color }}>
      <rect x="1" y="4" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="4" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="8" cy="7.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

export default function MessageBubble({
  message,
  currentUserId,
  participantColors,
}: MessageBubbleProps) {
  // System message
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{
            color: "rgba(247,245,250,0.35)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  // Claude message
  if (message.type === "claude") {
    const color = message.ownerUserId
      ? participantColors[message.ownerUserId]
      : undefined;
    const textColor = color?.text ?? "#8CBDB9";
    const bgColor = color?.bg ?? "rgba(139,189,185,0.08)";

    return (
      <div className="flex justify-start">
        <div style={{ maxWidth: "72%" }}>
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <BotIcon color={textColor} />
            <span className="text-xs font-medium" style={{ color: textColor }}>
              {message.claudeName}
            </span>
          </div>
          <div
            className="px-4 py-3 rounded-2xl text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
            style={{
              background: bgColor,
              color: "var(--off-white)",
              border: `1px solid ${textColor}22`,
              borderRadius: "4px 18px 18px 18px",
            }}
          >
            <Markdown>{message.content}</Markdown>
          </div>
        </div>
      </div>
    );
  }

  // User message
  const isSelf = message.fromUserId === currentUserId;
  const color = participantColors[message.fromUserId];
  const textColor = color?.text ?? "#DFA649";
  const bgColor = color?.bg ?? "rgba(223,166,73,0.1)";

  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
      <div style={{ maxWidth: "72%" }}>
        {!isSelf && (
          <div className="text-xs mb-1 px-1 font-medium" style={{ color: textColor }}>
            {message.fromDisplayName}
          </div>
        )}
        <div
          className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            background: isSelf ? bgColor : "rgba(255,255,255,0.05)",
            color: "var(--off-white)",
            border: isSelf ? `1px solid ${textColor}30` : "1px solid rgba(255,255,255,0.07)",
            borderRadius: isSelf ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
