import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Doc, Id } from "@/convex/_generated/dataModel";

interface Color {
  text: string;
  bg: string;
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

function Timestamp({ ts }: { ts: number }) {
  const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] select-none"
      style={{ color: "var(--text-dim)" }}
    >
      {time}
    </span>
  );
}

function AttachmentList({
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
            color: "var(--text-muted)",
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
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
      <div className="flex justify-start group">
        <div style={{ maxWidth: "72%" }}>
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <BotIcon color={textColor} />
            <span className="text-xs font-medium" style={{ color: textColor }}>
              {message.claudeName}
            </span>
            <Timestamp ts={message._creationTime} />
          </div>
          <div
            className="px-4 py-3 text-sm leading-relaxed prose prose-invert prose-sm max-w-none transition-shadow duration-200"
            style={{
              background: bgColor,
              color: "var(--fg)",
              border: `1px solid ${textColor}22`,
              borderRadius: "4px 18px 18px 18px",
            }}
          >
            {message.content && <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>}
            <AttachmentList
              attachments={message.attachments}
              senderName={message.claudeName ?? undefined}
              senderColor={textColor}
            />
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
    <div className={`flex group ${isSelf ? "justify-end" : "justify-start"}`}>
      <div style={{ maxWidth: "72%" }}>
        {!isSelf && (
          <div className="flex items-center gap-1.5 text-xs mb-1 px-1 font-medium">
            <span style={{ color: textColor }}>{message.fromDisplayName}</span>
            <Timestamp ts={message._creationTime} />
          </div>
        )}
        <div
          className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            background: isSelf ? bgColor : "var(--surface)",
            color: "var(--fg)",
            border: isSelf ? `1px solid ${textColor}30` : "1px solid var(--border)",
            borderRadius: isSelf ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          }}
        >
          {message.content}
          <AttachmentList
            attachments={message.attachments}
            senderName={!isSelf ? message.fromDisplayName : undefined}
            senderColor={!isSelf ? textColor : undefined}
          />
        </div>
        {isSelf && (
          <div className="flex justify-end mt-1 px-1">
            <Timestamp ts={message._creationTime} />
          </div>
        )}
      </div>
    </div>
  );
}
