import Markdown from "react-markdown";
import { Doc, Id } from "@/convex/_generated/dataModel";

interface Color {
  text: string;
  bg: string;
}

// Support the resolved URL from useMessages
type MessageWithAttachments = Doc<"messages"> & {
  attachments?: {
    storageId: Id<"_storage">;
    fileName: string;
    contentType: string;
    size: number;
    url: string;
  }[];
};

interface MessageBubbleProps {
  message: MessageWithAttachments;
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

function AttachmentList({ attachments }: { attachments: MessageWithAttachments["attachments"] }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-3">
      {attachments.map((file, i) => (
        <div key={i} className="max-w-full overflow-hidden">
          {file.contentType.startsWith("image/") ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="block relative group">
              <img
                src={file.url}
                alt={file.fileName}
                className="max-h-80 rounded-lg object-contain border border-white/10"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                <span className="text-white text-xs font-medium px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full">
                  View Full Size
                </span>
              </div>
            </a>
          ) : (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors border border-white/5 group"
              style={{ background: "rgba(255,255,255,0.03)" }}
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
                <div className="text-xs font-medium truncate text-white group-hover:text-amber transition-colors">
                  {file.fileName}
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.contentType.split("/")[1].toUpperCase()}
                </div>
              </div>
            </a>
          )}
        </div>
      ))}
    </div>
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
            {message.content && <Markdown>{message.content}</Markdown>}
            <AttachmentList attachments={message.attachments} />
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
          <AttachmentList attachments={message.attachments} />
        </div>
      </div>
    </div>
  );
}
