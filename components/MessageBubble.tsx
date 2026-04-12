"use client";

import { useState, useEffect, memo, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { ReactionBar } from "./ReactionBar";
import { ReactionPicker } from "./ReactionPicker";
import StreamingTimer from "./StreamingTimer";

export type StreamingPhase = "building_context" | "waiting" | "streaming" | "tool_use";

export interface StreamingStatusInfo {
  phase: StreamingPhase;
  startedAt: number;
  toolName?: string;
}

interface Color {
  text: string;
  bg: string;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

// Support the resolved URL from useMessages
type MessageWithAttachments = Omit<Doc<"messages">, "attachments"> & {
  attachments?: {
    storageId: Id<"_storage">;
    fileName: string;
    contentType: string;
    size: number;
    url: string;
  }[];
};

type SpecialStyle = "pixel" | "wispy";

interface MessageBubbleProps {
  message: MessageWithAttachments;
  currentUserId: string;
  participantColors: Record<string, Color>;
  reactions?: GroupedReaction[];
  onReaction?: (emoji: string) => void;
  onStop?: () => void;
  specialUsers?: Record<string, SpecialStyle>;
  streamingStatus?: StreamingStatusInfo;
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

const Timestamp = memo(function Timestamp({ ts }: { ts: number }) {
  const time = useMemo(
    () => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [ts]
  );
  return (
    <span
      className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 text-[10px] select-none"
      style={{ color: "var(--text-dim)" }}
    >
      {time}
    </span>
  );
});

const AttachmentList = memo(function AttachmentList({
  attachments,
  senderName,
  senderColor,
}: {
  attachments: MessageWithAttachments["attachments"];
  senderName?: string;
  senderColor?: string;
}) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-3">
      {attachments.map((file, i) => (
        <div key={i} className="max-w-full overflow-hidden">
          {file.contentType?.startsWith("image/") ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="block relative group/img">
              <img
                src={file.url}
                alt={file.fileName}
                loading="lazy"
                className="max-h-80 rounded-lg object-contain"
                style={{ border: "1px solid var(--border)" }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                <span className="text-white text-xs font-medium px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full">
                  View Full Size
                </span>
              </div>
              {senderName && (
                <span
                  className="absolute bottom-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-md"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    color: senderColor ?? "var(--fg)",
                  }}
                >
                  {senderName}
                </span>
              )}
            </a>
          ) : (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl transition-colors group/doc"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(139,189,185,0.1)", color: "var(--sage-teal)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <div className="text-xs font-medium truncate" style={{ color: "var(--fg)" }}>
                  {file.fileName}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                  {file.size < 1024
                    ? `${file.size} B`
                    : file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  } · {(file.contentType?.split("/")[1] ?? "file").toUpperCase()}
                </div>
              </div>
            </a>
          )}
        </div>
      ))}
    </div>
  );
});

function WispIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color }}>
      <path d="M6 1C6 1 3 3 3 5.5C3 7 4 8 5 8.5C4 9 3 9.5 2 9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M6 1C6 1 9 3.5 9 6C9 7.5 8 8.5 7 9C8 9.5 9 10 10 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
      <circle cx="6" cy="4" r="0.8" fill="currentColor" opacity="0.6" />
      <circle cx="4.5" cy="6" r="0.5" fill="currentColor" opacity="0.4" />
      <circle cx="7.5" cy="5.5" r="0.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function MessageBubble({
  message,
  currentUserId,
  participantColors,
  reactions = [],
  onReaction,
  onStop,
  specialUsers = {},
  streamingStatus,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasReactions = reactions.length > 0;
  // System message
  if (message.type === "system") {
    const isToolUse = message.content.startsWith("🔧");
    return (
      <div className="flex justify-center py-1">
        <span
          className={`text-xs px-3 py-1 rounded-full inline-flex items-center gap-1.5${isToolUse ? " font-mono" : ""}`}
          style={{
            color: isToolUse ? "var(--amber)" : "var(--text-muted)",
            background: isToolUse ? "rgba(223,166,73,0.06)" : "var(--surface)",
            border: `1px solid ${isToolUse ? "rgba(223,166,73,0.15)" : "var(--border-subtle)"}`,
          }}
        >
          {isToolUse ? (
            <>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: "var(--amber)" }}>
                <path d="M7.5 1.5L6 4.5h3L5 10.5l1-4H3.5l4-5z" fill="currentColor" />
              </svg>
              {message.content.replace("🔧 ", "")}
            </>
          ) : (
            message.content
          )}
        </span>
      </div>
    );
  }

  // Claude message
  if (message.type === "claude") {
    const isClaudiu = message.ownerUserId === "claudiu-system";
    const color = message.ownerUserId
      ? participantColors[message.ownerUserId]
      : undefined;
    const textColor = isClaudiu ? "#6366F1" : (color?.text ?? "#8CBDB9");
    const bgColor = isClaudiu ? "rgba(99,102,241,0.06)" : (color?.bg ?? "rgba(139,189,185,0.08)");

    return (
      <div className="flex justify-start group">
        <div className="max-w-[90%] sm:max-w-[72%]">
          <div className="flex items-center gap-1.5 mb-1 px-1">
            {isClaudiu ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: textColor }}>
                <path d="M6 1l1.3 3.1L10.5 4.5 8.2 7l.5 3.2L6 8.7 3.3 10.2 3.8 7 1.5 4.5l3.2-.4z" fill="currentColor" />
              </svg>
            ) : (
              <BotIcon color={textColor} />
            )}
            <span className="text-xs font-medium" style={{ color: textColor }}>
              {message.claudeName}
            </span>
            {message.isStreaming && onStop ? (
              <button
                onClick={onStop}
                className="text-xs ml-0.5 transition-opacity opacity-50 hover:opacity-90"
                style={{ color: textColor }}
                title="Stop this response"
              >
                stop
              </button>
            ) : (
              <Timestamp ts={message._creationTime} />
            )}
          </div>
          <div className="relative">
            <div
              className="px-4 py-3 text-sm leading-relaxed prose prose-invert prose-sm max-w-none transition-shadow duration-200"
              style={{
                background: isClaudiu
                  ? "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.06) 100%)"
                  : bgColor,
                color: "var(--fg)",
                border: isClaudiu
                  ? "1px solid rgba(99,102,241,0.2)"
                  : `1px solid ${textColor}22`,
                borderRadius: "4px 18px 18px 18px",
              }}
            >
              {message.isStreaming && !message.content ? (
                /* Thinking dots — shown until first token arrives */
                <div>
                  <div className="flex items-center gap-1.5 py-0.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 rounded-full"
                        style={{
                          background: textColor,
                          opacity: 0.6,
                          height: "6px",
                          animation: `thinking-wave 1.2s ease-in-out ${i * 0.18}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  {streamingStatus && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px]" style={{ color: textColor, opacity: 0.5 }}>
                        {streamingStatus.phase === "waiting" ? "Waiting for response..." : "Building context..."}
                      </span>
                      <StreamingTimer startedAt={streamingStatus.startedAt} color={textColor} />
                    </div>
                  )}
                </div>
              ) : message.isStreaming && message.content ? (
                /* Streaming: render plain text to avoid Markdown layout jank */
                <div>
                  <span className="whitespace-pre-wrap">{message.content}
                    <span
                      className="inline-block w-1.5 h-3.5 rounded-sm ml-0.5 align-text-bottom"
                      style={{
                        background: textColor,
                        opacity: 0.6,
                        animation: "streaming-cursor 0.8s ease-in-out infinite",
                      }}
                    />
                  </span>
                  {streamingStatus?.phase === "tool_use" && streamingStatus.toolName && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${textColor}15` }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: textColor, opacity: 0.5 }}>
                        <path d="M7.5 1.5L6 4.5h3L5 10.5l1-4H3.5l4-5z" fill="currentColor" />
                      </svg>
                      <span className="text-[10px]" style={{ color: textColor, opacity: 0.5 }}>
                        Fetching {streamingStatus.toolName}...
                      </span>
                      <StreamingTimer startedAt={streamingStatus.startedAt} color={textColor} />
                    </div>
                  )}
                  {streamingStatus && streamingStatus.phase !== "tool_use" && (
                    <div className="flex justify-end mt-1">
                      <StreamingTimer startedAt={streamingStatus.startedAt} color={textColor} />
                    </div>
                  )}
                </div>
              ) : message.content ? (
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              ) : null}
              {message.gifUrl && (
                <div className="mt-2 rounded-lg overflow-hidden max-w-full sm:max-w-[280px]">
                  <img
                    src={message.gifUrl}
                    alt="GIF"
                    loading="lazy"
                    className="w-full rounded-lg"
                    style={{ border: "1px solid var(--border)" }}
                  />
                </div>
              )}
              <AttachmentList
                attachments={message.attachments}
                senderName={message.claudeName ?? undefined}
                senderColor={textColor}
              />
            </div>
            {/* Hover add-reaction button */}
            {onReaction && !message.isStreaming && (
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className={`absolute -bottom-2.5 left-2 w-7 h-7 sm:w-5 sm:h-5 rounded-full flex items-center justify-center transition-all ${hasReactions || pickerOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                style={{
                  background: "var(--popover)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="5" y1="1.5" x2="5" y2="8.5" />
                  <line x1="1.5" y1="5" x2="8.5" y2="5" />
                </svg>
              </button>
            )}
            {pickerOpen && onReaction && (
              <div className="absolute -bottom-2.5 left-8">
                <ReactionPicker
                  onSelect={(emoji) => onReaction(emoji)}
                  onClose={() => setPickerOpen(false)}
                />
              </div>
            )}
          </div>
          {onReaction && (
            <ReactionBar
              reactions={reactions}
              currentUserId={currentUserId}
              onToggle={onReaction}
            />
          )}
        </div>
      </div>
    );
  }

  // User message
  const isSelf = message.fromUserId === currentUserId;
  const specialStyle = specialUsers[message.fromUserId] as SpecialStyle | undefined;
  const isPixel = specialStyle === "pixel";
  const isWispy = specialStyle === "wispy";
  const color = participantColors[message.fromUserId];
  const textColor = isPixel ? "#9B8EBF" : isWispy ? "#7DD3E8" : (color?.text ?? "#DFA649");
  const bgColor = isPixel ? "rgba(155,142,191,0.10)" : isWispy ? "rgba(125,211,232,0.06)" : (color?.bg ?? "rgba(223,166,73,0.1)");

  const bubbleClasses = [
    "px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
    isPixel && "pixel-bubble",
    isWispy && "wispy-bubble",
    isWispy && isSelf && "wispy-bubble-self",
  ].filter(Boolean).join(" ");

  return (
    <div className={`flex group ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[90%] sm:max-w-[72%]">
        {!isSelf && (
          <div className="flex items-center gap-1.5 text-xs mb-1 px-1 font-medium">
            {isPixel && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: textColor }}>
                <rect x="1" y="5" width="2" height="2" fill="currentColor" />
                <rect x="3" y="3" width="2" height="2" fill="currentColor" />
                <rect x="5" y="1" width="2" height="2" fill="currentColor" />
                <rect x="7" y="3" width="2" height="2" fill="currentColor" />
                <rect x="9" y="5" width="2" height="2" fill="currentColor" />
                <rect x="5" y="5" width="2" height="5" fill="currentColor" />
              </svg>
            )}
            {isWispy && <WispIcon color={textColor} />}
            <span style={{
              color: textColor,
              ...(isPixel ? { fontFamily: "var(--font-press-start)", fontSize: "0.55rem" } : {}),
              ...(isWispy ? { fontFamily: "var(--font-quicksand)", fontStyle: "italic", letterSpacing: "0.05em" } : {}),
            }}>
              {message.fromDisplayName}
            </span>
            <Timestamp ts={message._creationTime} />
          </div>
        )}
        <div className="relative">
          <div
            className={bubbleClasses}
            style={{
              background: isPixel
                ? "linear-gradient(135deg, rgba(155,142,191,0.12) 0%, rgba(136,115,158,0.08) 100%)"
                : isWispy
                  ? "linear-gradient(135deg, rgba(125,211,232,0.08) 0%, rgba(45,95,62,0.06) 50%, rgba(125,211,232,0.04) 100%)"
                  : isSelf ? bgColor : "var(--surface)",
              color: "var(--fg)",
              fontFamily: isWispy ? "var(--font-quicksand)" : undefined,
              letterSpacing: isWispy ? "0.02em" : undefined,
              border: (isPixel || isWispy) ? "none" : isSelf ? `1px solid ${textColor}30` : "1px solid var(--border)",
              borderRadius: isPixel ? undefined : isWispy ? undefined : isSelf ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              /* no continuous animation — static styling only */
            }}
          >
            {message.content}
            {message.gifUrl && (
              <div className="mt-2 rounded-lg overflow-hidden max-w-full sm:max-w-[280px]">
                <img
                  src={message.gifUrl}
                  alt="GIF"
                  className="w-full rounded-lg"
                  style={{ border: "1px solid var(--border)" }}
                />
              </div>
            )}
            <AttachmentList
              attachments={message.attachments}
              senderName={!isSelf ? message.fromDisplayName : undefined}
              senderColor={!isSelf ? textColor : undefined}
            />
          </div>
          {/* Hover add-reaction button */}
          {onReaction && (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className={`absolute -bottom-2.5 ${isSelf ? "right-2" : "left-2"} w-7 h-7 sm:w-5 sm:h-5 rounded-full flex items-center justify-center transition-all ${hasReactions || pickerOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              style={{
                background: "var(--popover)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="5" y1="1.5" x2="5" y2="8.5" />
                <line x1="1.5" y1="5" x2="8.5" y2="5" />
              </svg>
            </button>
          )}
          {pickerOpen && onReaction && (
            <div className={`absolute -bottom-2.5 ${isSelf ? "right-8" : "left-8"}`}>
              <ReactionPicker
                onSelect={(emoji) => onReaction(emoji)}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}
        </div>
        {onReaction && (
          <div className={isSelf ? "flex justify-end" : ""}>
            <ReactionBar
              reactions={reactions}
              currentUserId={currentUserId}
              onToggle={onReaction}
            />
          </div>
        )}
        {isSelf && (
          <div className="flex justify-end mt-1 px-1">
            <Timestamp ts={message._creationTime} />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
