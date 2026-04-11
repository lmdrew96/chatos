"use client";

import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { callClaude, callClaudeStreaming, estimateTokens, McpServer } from "@/lib/claude";
import MessageBubble from "@/components/MessageBubble";
import MentionInput from "@/components/MentionInput";
import { InviteButton } from "@/components/InviteButton";
import { RoomSettings } from "@/components/RoomSettings";
import { MessageContent } from "@/lib/claude";
import { FloatingOrb } from "@/components/FloatingOrb";
import { playPing } from "@/lib/sounds";

// Cache fetched attachments so mention chains and re-renders don't re-fetch
const base64Cache = new Map<string, Promise<{ data: string; mediaType: string }>>();
const textFileCache = new Map<string, Promise<string>>();
// Cache uploaded oversized GIF URLs (gifUrl → Convex storage URL)
const gifUploadCache = new Map<string, Promise<string>>();

async function fetchAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const cached = base64Cache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    // Try direct fetch first, fall back to server proxy for CORS-blocked URLs
    let blob: Blob;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Direct fetch failed: ${res.statusText}`);
      blob = await res.blob();
    } catch {
      // CORS or network error — use server-side proxy
      const proxyRes = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const proxyData = await proxyRes.json();
      if (!proxyRes.ok) throw new Error(proxyData.error ?? "Proxy fetch failed");
      if (proxyData.type === "image") {
        return { data: proxyData.data, mediaType: proxyData.mediaType };
      }
      throw new Error("Not an image");
    }
    // If oversized image, compress via canvas downscaling
    if (blob.type.startsWith("image/") && blob.size > MAX_BASE64_BYTES) {
      return compressImageToFit(blob);
    }
    return new Promise<{ data: string; mediaType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve({ data: base64, mediaType: blob.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  })();
  base64Cache.set(url, promise);
  // Evict on failure so retries work
  promise.catch(() => base64Cache.delete(url));
  return promise;
}

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

// File extensions / content types that should be fetched as plain text for Claude
const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp", "cs",
  "html", "css", "scss", "less", "json", "yaml", "yml", "toml", "xml", "csv",
  "md", "mdx", "txt", "log", "sh", "bash", "zsh", "fish",
  "sql", "graphql", "gql", "prisma", "proto",
  "env", "gitignore", "dockerignore", "dockerfile", "makefile",
  "vue", "svelte", "astro",
]);

function isTextFile(fileName: string, contentType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (contentType.startsWith("text/")) return true;
  if (contentType === "application/json" || contentType === "application/xml") return true;
  return false;
}

const MAX_TEXT_FILE_CHARS = 50_000; // ~50k chars to avoid blowing up context

const HISTORY_TOKEN_BUDGET = 12_000; // ~48k chars — leaves room for system prompt + response
const MIN_HISTORY_MESSAGES = 3;
const MAX_BASE64_BYTES = 5_242_880; // Anthropic 5MB limit for inline images
const MAX_UPLOAD_BYTES = 10_485_760; // 10MB upload limit — we'll resize to fit the API limit

/**
 * Compress an image blob to fit under MAX_BASE64_BYTES using canvas downscaling.
 * Returns base64 data + media type. For animated GIFs this captures the first frame.
 */
async function compressImageToFit(blob: Blob): Promise<{ data: string; mediaType: string }> {
  const bmp = await createImageBitmap(blob);
  let { width, height } = bmp;
  // Iteratively scale down until the JPEG output fits
  let quality = 0.85;
  let scale = 1;
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    if (outBlob.size <= MAX_BASE64_BYTES) {
      bmp.close();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({ data: (reader.result as string).split(",")[1], mediaType: "image/jpeg" });
        };
        reader.onerror = reject;
        reader.readAsDataURL(outBlob);
      });
    }
    // Reduce dimensions by ~30% each round, plus lower quality
    scale *= 0.7;
    quality = Math.max(0.5, quality - 0.1);
  }
  bmp.close();
  throw new Error("Could not compress image to fit 5MB limit");
}

/** Estimate tokens for a message including prefix overhead and attachments. */
function estimateMessageTokens(m: MessageWithAttachments): number {
  // Base text content (~4 chars/token)
  let tokens = estimateTokens(m.content);

  // Account for name prefix added by buildHistory (e.g. "[ClaudeName]: " or "DisplayName: ")
  const prefixLen = (m.type === "claude" ? (m.claudeName?.length ?? 6) + 4 : (m.fromDisplayName?.length ?? 4) + 2);
  tokens += Math.ceil(prefixLen / 4);

  // Account for attachments
  if (m.attachments) {
    for (const a of m.attachments) {
      if (isTextFile(a.fileName, a.contentType)) {
        // Text files are inlined — estimate from file size, capped at MAX_TEXT_FILE_CHARS
        tokens += Math.ceil(Math.min(a.size, MAX_TEXT_FILE_CHARS) / 4);
      } else if (a.contentType.startsWith("image/")) {
        // Images: Anthropic charges based on dimensions; file size is a rough proxy.
        // ~1 token per 750 bytes for typical compressed images, min 300 tokens.
        tokens += Math.max(300, Math.ceil(a.size / 750));
      } else if (a.contentType === "application/pdf") {
        // PDFs: ~800 tokens per page; estimate ~2KB per page of content
        tokens += Math.max(800, Math.ceil(a.size / 2000) * 800);
      }
    }
  }

  return tokens;
}

/** Trim messages from the oldest end until they fit within a token budget. */
function trimToTokenBudget(msgs: MessageWithAttachments[]): MessageWithAttachments[] {
  // Work backwards from most recent, accumulate until budget is hit
  let tokens = 0;
  let startIdx = msgs.length;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(msgs[i]);
    if (tokens + t > HISTORY_TOKEN_BUDGET && msgs.length - i > MIN_HISTORY_MESSAGES) {
      break;
    }
    tokens += t;
    startIdx = i;
  }
  return msgs.slice(startIdx);
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

/**
 * Convert any base64 image/document blocks in messages to URL sources by
 * uploading to Convex storage. This keeps the payload small when proxying
 * messages through API routes (e.g. the Claudiu endpoint).
 */
async function externalizeBase64Blocks(
  messages: { role: "user" | "assistant"; content: string | MessageContent[] }[],
  uploadBlob: (blob: Blob) => Promise<string>,
): Promise<{ role: "user" | "assistant"; content: string | MessageContent[] }[]> {
  return Promise.all(
    messages.map(async (msg) => {
      if (typeof msg.content === "string") return msg;
      const newContent = await Promise.all(
        msg.content.map(async (block) => {
          if (
            (block.type === "image" || block.type === "document") &&
            block.source.type === "base64"
          ) {
            try {
              const raw = Uint8Array.from(atob(block.source.data), (c) => c.charCodeAt(0));
              const blob = new Blob([raw], { type: block.source.media_type });
              const url = await uploadBlob(blob);
              return { ...block, source: { type: "url" as const, url } };
            } catch {
              return block; // keep base64 if upload fails
            }
          }
          return block;
        }),
      );
      return { ...msg, content: newContent };
    }),
  );
}

const PRECEDING_REPLIES_TOKEN_BUDGET = 2000; // ~8k chars
const PRECEDING_REPLIES_KEEP_FULL = 2; // keep last N replies untruncated
const PRECEDING_REPLY_TRUNCATE_LEN = 200; // chars to keep for older replies

/** Compact preceding replies to fit within a token budget. */
function compactPrecedingReplies(
  replies: { claudeName: string; content: string }[]
): string {
  if (replies.length === 0) return "";
  // Keep recent replies in full, truncate older ones
  const parts: string[] = [];
  let totalTokens = 0;
  const cutoff = Math.max(0, replies.length - PRECEDING_REPLIES_KEEP_FULL);
  let droppedCount = 0;

  for (let i = 0; i < replies.length; i++) {
    const r = replies[i];
    let text: string;
    if (i < cutoff) {
      // Older reply — truncate
      if (r.content.length > PRECEDING_REPLY_TRUNCATE_LEN) {
        text = `[${r.claudeName} replied]: "${r.content.slice(0, PRECEDING_REPLY_TRUNCATE_LEN)}…[truncated]"`;
      } else {
        text = `[${r.claudeName} replied]: "${r.content}"`;
      }
    } else {
      text = `[${r.claudeName} just responded]: "${r.content}"`;
    }
    const tokens = Math.ceil(text.length / 4);
    if (totalTokens + tokens > PRECEDING_REPLIES_TOKEN_BUDGET && parts.length > 0) {
      droppedCount += replies.length - i;
      break;
    }
    totalTokens += tokens;
    parts.push(text);
  }

  if (droppedCount > 0) {
    parts.unshift(`(${droppedCount} earlier replies omitted for brevity)`);
  }
  return parts.join("\n");
}

const DEFAULT_CHAIN_LIMIT = 5;

type InvokeParams = {
  claudeName: string;
  owner: Doc<"participants">;
  callMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  allParticipants: Doc<"participants">[];
  depth: number;
  respondedSet: Set<string>;
  precedingReplies: { claudeName: string; content: string }[];
  chainStartHumanCount: number;
  signal: AbortSignal;
};

// Participant color palette — assigned by join order
const COLORS = [
  { text: "#DFA649", bg: "rgba(223,166,73,0.1)" },   // amber
  { text: "#88739E", bg: "rgba(136,115,158,0.1)" },  // mauve
  { text: "#8CBDB9", bg: "rgba(139,189,185,0.1)" },  // sage-teal
  { text: "#97D181", bg: "rgba(151,209,129,0.1)" },  // soft-green
  { text: "#849440", bg: "rgba(132,148,64,0.1)" },   // olive
  { text: "#DBD5E2", bg: "rgba(219,213,226,0.1)" },  // lavender
];

const CLAUDIU_NAME = "Claudiu";

function detectMentions(content: string, participants: Doc<"participants">[]): string[] {
  if (/@everyone(?!\w)/i.test(content)) {
    return [...participants.map((p) => p.claudeName), CLAUDIU_NAME];
  }
  const lower = content.toLowerCase();
  const names = participants
    .map((p) => p.claudeName)
    .filter((name) => new RegExp(`@${name}(?![\\w])`, "i").test(content))
    .sort((a, b) => {
      // Preserve the order in which @mentions appear in the text
      const posA = lower.indexOf(`@${a.toLowerCase()}`);
      const posB = lower.indexOf(`@${b.toLowerCase()}`);
      return posA - posB;
    });
  // Detect @Claudiu mention (virtual — not a participant)
  if (new RegExp(`@${CLAUDIU_NAME}(?![\\w])`, "i").test(content) && !names.some((n) => n.toLowerCase() === CLAUDIU_NAME.toLowerCase())) {
    const pos = lower.indexOf(`@${CLAUDIU_NAME.toLowerCase()}`);
    // Insert in correct position to preserve mention order
    const insertIdx = names.findIndex((n) => lower.indexOf(`@${n.toLowerCase()}`) > pos);
    if (insertIdx === -1) names.push(CLAUDIU_NAME);
    else names.splice(insertIdx, 0, CLAUDIU_NAME);
  }
  return names;
}

// Collapse consecutive same-role messages and handle attachments for multimodal support.
// `forClaudeName` determines whose messages become "assistant" — all other Claudes
// become "user" messages with a name prefix so each Claude can distinguish itself.
async function buildHistory(
  messages: MessageWithAttachments[],
  forClaudeName?: string,
  uploadBlob?: (blob: Blob) => Promise<string>,
): Promise<{ role: "user" | "assistant"; content: string | MessageContent[] }[]> {
  const result: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [];

  for (const m of messages) {
    if (m.type === "system") continue;

    // Only the target Claude's own messages are "assistant"; other Claudes are
    // surfaced as "user" so the model never confuses another Claude's words for
    // its own.
    const isOwnClaude = m.type === "claude" && forClaudeName && m.claudeName === forClaudeName;
    const role: "user" | "assistant" = isOwnClaude ? "assistant" : "user";

    let contentText = isOwnClaude
        ? m.content
        : m.type === "claude"
          ? `[${m.claudeName ?? "Claude"}]: ${m.content}`
          : `${m.fromDisplayName}: ${m.content}`;

    const attachmentBlocks: MessageContent[] = [];

    // Inline GIF as an image block so Claude can see it directly.
    // Small GIFs: embed as base64 (preserves animation).
    // Large GIFs: upload to Convex storage and pass a URL source so the API
    // server fetches it — no 5MB limit, full animation preserved.
    if (m.gifUrl) {
      const gifUrl = m.gifUrl;
      try {
        const { data, mediaType } = await fetchAsBase64(gifUrl);
        const byteSize = Math.ceil(data.length * 3 / 4);
        if (byteSize <= MAX_BASE64_BYTES) {
          attachmentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
        } else if (uploadBlob) {
          // Upload to Convex storage — Anthropic's API fetches the public URL directly
          if (!gifUploadCache.has(gifUrl)) {
            const promise = (async () => {
              const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
              const blob = new Blob([raw], { type: mediaType });
              return uploadBlob(blob);
            })();
            gifUploadCache.set(gifUrl, promise);
            promise.catch(() => gifUploadCache.delete(gifUrl));
          }
          const storageUrl = await gifUploadCache.get(gifUrl)!;
          attachmentBlocks.push({ type: "image", source: { type: "url", url: storageUrl } });
        } else {
          contentText += contentText.trim() ? ` [GIF: ${gifUrl}]` : `${m.fromDisplayName ?? "Someone"} sent a GIF: ${gifUrl}`;
        }
        if (attachmentBlocks.length > 0 && !contentText.trim()) {
          contentText = `${m.fromDisplayName ?? "Someone"} sent a GIF.`;
        }
      } catch {
        contentText += contentText.trim() ? ` [sent a GIF: ${gifUrl}]` : `${m.fromDisplayName ?? "Someone"} sent a GIF: ${gifUrl}`;
      }
    }
    if (m.attachments && m.attachments.length > 0) {
      for (const a of m.attachments) {
        const url = a.url || (a.storageId ? `${process.env.NEXT_PUBLIC_CONVEX_URL}/api/storage/${a.storageId}` : null);
        if (!url) continue;
        try {
          if (isTextFile(a.fileName, a.contentType)) {
            // Fetch as plain text and inline it — no multimodal block needed
            if (!textFileCache.has(url)) {
              const promise = fetch(url).then(async (res) => {
                if (!res.ok) throw new Error(res.statusText);
                let text = await res.text();
                if (text.length > MAX_TEXT_FILE_CHARS) {
                  text = text.slice(0, MAX_TEXT_FILE_CHARS) + `\n…[truncated at ${MAX_TEXT_FILE_CHARS} chars]`;
                }
                return text;
              });
              textFileCache.set(url, promise);
              promise.catch(() => textFileCache.delete(url));
            }
            try {
              const text = await textFileCache.get(url)!;
              contentText += `\n\n--- ${a.fileName} ---\n${text}\n--- end ${a.fileName} ---`;
            } catch { continue; }
          } else {
            // fetchAsBase64 auto-compresses oversized images via canvas
            const { data, mediaType } = await fetchAsBase64(url);
            if (mediaType.startsWith("image/")) {
              attachmentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
            } else if (mediaType === "application/pdf" && Math.ceil(data.length * 3 / 4) <= MAX_BASE64_BYTES) {
              attachmentBlocks.push({ type: "document", source: { type: "base64", media_type: mediaType, data } });
            }
          }
        } catch (e) {
          console.error("AI history fetch failed", e);
        }
      }
    }

    const last = result[result.length - 1];
    if (last && last.role === role) {
      // Merge into last message
      if (typeof last.content === "string") {
        if (attachmentBlocks.length > 0) {
          // Convert string to array to add attachments
          const newContent: MessageContent[] = [{ type: "text", text: last.content }];
          newContent.push(...attachmentBlocks);
          if (contentText.trim()) newContent.push({ type: "text", text: contentText });
          last.content = newContent;
        } else {
          // Just append text
          last.content += "\n\n" + contentText;
        }
      } else {
        // Already an array, just push new blocks
        last.content.push(...attachmentBlocks);
        if (contentText.trim()) last.content.push({ type: "text", text: contentText });
      }
    } else {
      // New message block
      if (attachmentBlocks.length > 0) {
        const contentArray: MessageContent[] = [...attachmentBlocks];
        if (contentText.trim()) contentArray.push({ type: "text", text: contentText });
        result.push({ role, content: contentArray });
      } else {
        result.push({ role, content: contentText });
      }
    }
  }

  // Apply prompt caching breakpoints (Max 4 allowed total)
  // 1 is used for System Prompt, 1 for memory context (when present).
  // We'll use up to 2 more for the history blocks.
  // Tagging from latest back ensures the most recent state is cached for the next turn.
  let breakpointsSet = 0;
  for (let i = result.length - 1; i >= 0 && breakpointsSet < 2; i--) {
    const msg = result[i];
    if (typeof msg.content === "string") {
      if (!msg.content) continue; // skip empty text (e.g. streaming placeholders)
      msg.content = [{ type: "text", text: msg.content, cache_control: { type: "ephemeral" } }];
      breakpointsSet++;
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      const last = msg.content[msg.content.length - 1];
      if (last.type === "text" && !last.text) continue; // skip empty text blocks
      last.cache_control = { type: "ephemeral" };
      breakpointsSet++;
    }
  }

  return result;
}

function RoomTitle({
  title,
  roomCode,
  canEdit,
  onSave,
}: {
  title?: string;
  roomCode: string;
  canEdit: boolean;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== (title ?? "")) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        maxLength={60}
        placeholder={roomCode}
        className="text-sm font-medium bg-transparent border-b outline-none min-w-0 max-w-[200px]"
        style={{
          color: "var(--fg)",
          borderColor: "var(--sage-teal)",
          caretColor: "var(--sage-teal)",
        }}
      />
    );
  }

  return (
    <button
      onClick={canEdit ? () => { setDraft(title ?? ""); setEditing(true); } : undefined}
      className={`flex items-center gap-2 min-w-0 ${canEdit ? "cursor-pointer group/title" : "cursor-default"}`}
      title={canEdit ? "Click to rename room" : undefined}
    >
      {title ? (
        <>
          <span className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
            {title}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0"
            style={{
              background: "rgba(139,189,185,0.08)",
              color: "var(--text-dim)",
              border: "1px solid rgba(139,189,185,0.1)",
            }}
          >
            {roomCode}
          </span>
        </>
      ) : (
        <span
          className="px-2 py-0.5 rounded text-xs font-mono"
          style={{
            background: "rgba(139,189,185,0.1)",
            color: "var(--sage-teal)",
            border: "1px solid rgba(139,189,185,0.15)",
          }}
        >
          {roomCode}
        </span>
      )}
      {canEdit && (
        <svg
          width="10" height="10" viewBox="0 0 12 12" fill="none"
          className="shrink-0 opacity-0 group-hover/title:opacity-60 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export default function RoomPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-[#110e1b]" />;
  }

  return <RoomContent />;
}

function RoomContent() {
  const params = useParams();
  const roomId = params.roomId as Id<"rooms">;
  const router = useRouter();
  const convex = useConvex();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState("");
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [sending, setSending] = useState(false);
  // Claude names currently generating a response
  const [thinkingClaudes, setThinkingClaudes] = useState<Set<string>>(new Set());

  const room = useQuery(api.rooms.getRoomById, { roomId });
  const messages = useQuery(api.messages.useMessages, { roomId });
  const participants = useQuery(api.rooms.useParticipants, { roomId });
  const myParticipant = useQuery(api.rooms.getMyParticipantInRoom, { roomId });
  const claudeMemories = useQuery(
    api.rooms.getClaudeMemoriesForOwner,
    currentUserId ? { ownerUserId: currentUserId } : "skip"
  );
  const typingUsers = useQuery(api.typing.getTyping, { roomId });
  const rawReactions = useQuery(api.reactions.getReactionsForRoom, { roomId });
  const sendMessage = useMutation(api.messages.sendMessage);
  const updateStreamingMessage = useMutation(api.messages.updateStreamingMessage);
  const updateRoomTitle = useMutation(api.rooms.updateRoomTitle);
  const setOnlineStatus = useMutation(api.rooms.setOnlineStatus);
  const updateParticipantColor = useMutation(api.rooms.updateParticipantColor);
  const upsertClaudeMemory = useMutation(api.rooms.upsertClaudeMemory);
  const touchClaudeMemory = useMutation(api.rooms.touchClaudeMemory);
  const setTypingMutation = useMutation(api.typing.setTyping);
  const clearTypingMutation = useMutation(api.typing.clearTyping);
  const toggleReaction = useMutation(api.reactions.toggleReaction);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);

  // Per-room chain limit (defaults to 5)
  const chainLimit = room?.chainLimit ?? DEFAULT_CHAIN_LIMIT;

  // Upload a blob to Convex storage and return the public URL
  const uploadBlobToStorage = useCallback(async (blob: Blob): Promise<string> => {
    const postUrl = await generateUploadUrl();
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const { storageId } = await res.json();
    const url = await convex.query(api.messages.getStorageUrl, { storageId });
    if (!url) throw new Error("Failed to get storage URL");
    return url;
  }, [generateUploadUrl, convex]);

  // Group raw reactions by messageId → { emoji, count, userIds }[]
  const groupedReactions = useMemo(() => {
    if (!rawReactions) return {};
    const map: Record<string, Record<string, string[]>> = {};
    for (const r of rawReactions) {
      if (!map[r.messageId]) map[r.messageId] = {};
      if (!map[r.messageId][r.emoji]) map[r.messageId][r.emoji] = [];
      map[r.messageId][r.emoji].push(r.userId);
    }
    const result: Record<string, { emoji: string; count: number; userIds: string[] }[]> = {};
    for (const [msgId, emojis] of Object.entries(map)) {
      result[msgId] = Object.entries(emojis).map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
      }));
    }
    return result;
  }, [rawReactions]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Always-current snapshot of messages for use inside async chains
  const messagesRef = useRef<Doc<"messages">[] | undefined>(undefined);
  // AbortController for the active Claude chain — replaced each user send
  const chainAbortRef = useRef<AbortController | null>(null);
  // Session-level conversation summary for compacting older context
  const sessionSummaryRef = useRef<{ summary: string; throughMsgCount: number } | null>(null);

  // Restore session from sessionStorage
  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    setCurrentUserId(userId);
    setCurrentDisplayName(sessionStorage.getItem("displayName") ?? "");
    const stored = sessionStorage.getItem("chatos:mcpServers");
    if (stored) setMcpServers(JSON.parse(stored));
  }, [roomId]);

  // For signed-in users, trust server membership over stale local session values.
  useEffect(() => {
    if (!myParticipant) return;

    sessionStorage.setItem("userId", myParticipant.userId);
    sessionStorage.setItem("displayName", myParticipant.displayName);
    sessionStorage.setItem("claudeName", myParticipant.claudeName);

    setCurrentUserId(myParticipant.userId);
    setCurrentDisplayName(myParticipant.displayName);

    // Sync MCP servers from Convex participant record (authoritative source)
    if (myParticipant.mcpServers && myParticipant.mcpServers.length > 0) {
      setMcpServers(myParticipant.mcpServers);
    }
  }, [myParticipant]);

  // Send users to join only when they are not already a known participant.
  useEffect(() => {
    if (participants === undefined || myParticipant === undefined) return;

    if (myParticipant) return;

    if (!currentUserId) {
      router.replace(`/join/${roomId}`);
      return;
    }

    const found = participants.find((p) => p.userId === currentUserId);
    if (!found) {
      router.replace(`/join/${roomId}`);
    }
  }, [currentUserId, participants, myParticipant, roomId, router]);

  // Online presence
  useEffect(() => {
    if (!currentUserId) return;
    setOnlineStatus({ roomId, userId: currentUserId, isOnline: true });

    const handleUnload = () => {
      setOnlineStatus({ roomId, userId: currentUserId, isOnline: false });
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      setOnlineStatus({ roomId, userId: currentUserId, isOnline: false });
    };
  }, [currentUserId, roomId, setOnlineStatus]);

  // Keep messagesRef current so async chains can see new human messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Ping when a new non-own message arrives and the tab is not in focus
  const prevMsgCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!messages) return;
    const count = messages.length;
    if (prevMsgCountRef.current !== null && count > prevMsgCountRef.current) {
      const latest = messages[messages.length - 1];
      if (latest && latest.fromUserId !== currentUserId && document.hidden) {
        playPing();
      }
    }
    prevMsgCountRef.current = count;
  }, [messages, currentUserId]);

  // Auto-scroll to latest message — only when user is near the bottom
  const isStreaming = useMemo(
    () => messages?.some((m) => m.isStreaming) || thinkingClaudes.size > 0,
    [messages, thinkingClaudes]
  );
  const [showScrollButton, setShowScrollButton] = useState(false);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 150; // px from bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setShowScrollButton(!isNearBottom);
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isStreaming ? "auto" : "smooth",
      });
    }
  }, [messages, thinkingClaudes, isStreaming]);

  // Track scroll position for showing/hiding the scroll-to-bottom button
  // Depends on `messages` so the listener re-attaches when the loading guard
  // clears and the scroll container actually mounts.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 150;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      setShowScrollButton(!isNearBottom);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [messages]);

  // Color map: userId → color, ordered by join time
  const participantColors = useMemo(() => {
    const sorted = [...(participants ?? [])].sort(
      (a, b) => a._creationTime - b._creationTime
    );
    const map: Record<string, (typeof COLORS)[0]> = {};
    sorted.forEach((p, i) => {
      if (p.color) {
        const hex = p.color.replace("#", "");
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        map[p.userId] = { text: p.color, bg: `rgba(${r},${g},${b},0.1)` };
      } else {
        map[p.userId] = COLORS[i % COLORS.length];
      }
    });
    return map;
  }, [participants]);

  // Map of special users → bubble style, resolved from participant tokens
  const specialUsers = useMemo(() => {
    if (!participants) return {} as Record<string, "pixel" | "wispy">;
    const tokenStyles: [string | undefined, "pixel" | "wispy"][] = [
      [process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN, "pixel"],
      [process.env.NEXT_PUBLIC_ASHLEY_USER_TOKEN, "wispy"],
    ];
    const map: Record<string, "pixel" | "wispy"> = {};
    for (const [token, style] of tokenStyles) {
      if (!token) continue;
      const p = participants.find((p) => p.tokenIdentifier === token);
      if (p) map[p.userId] = style;
    }
    return map;
  }, [participants]);

  // Auto-sync preferred color to Convex when participant record loads or changes
  useEffect(() => {
    if (!myParticipant || !currentUserId) return;
    const pref = localStorage.getItem("chatos:preferredColor");
    if (pref && pref !== myParticipant.color) {
      updateParticipantColor({ roomId, userId: currentUserId, color: pref });
    }
  }, [myParticipant?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invokeClaudeResponse = async ({
    claudeName,
    owner,
    callMessages,
    allParticipants,
    depth,
    respondedSet,
    precedingReplies,
    chainStartHumanCount,
    signal,
  }: InvokeParams): Promise<{ claudeName: string; content: string } | null> => {
    if (depth >= chainLimit) return null;

    // Guard: a human has sent a message since this chain started — yield to them
    const liveHumanCount = (messagesRef.current ?? []).filter((m) => m.type === "user").length;
    if (liveHumanCount > chainStartHumanCount) return null;

    // Skip if this Claude already responded in this chain (prevents @everyone double-firing)
    if (respondedSet.has(claudeName)) return null;
    respondedSet.add(claudeName);

    // Fetch the owner's API key and timezone from Convex
    const [apiKey, ownerTimezone] = await Promise.all([
      convex.query(api.apiKeys.getApiKeyForParticipant, {
        roomId,
        participantUserId: owner.userId,
      }),
      owner.tokenIdentifier
        ? convex.query(api.users.getTimezoneByTokenIdentifier, {
            tokenIdentifier: owner.tokenIdentifier,
          })
        : null,
    ]);
    if (!apiKey) {
      await sendMessage({
        roomId,
        fromUserId: "system",
        fromDisplayName: "system",
        type: "system",
        content: `${claudeName}'s API key isn't available — ${owner.displayName} needs to set one in Settings.`,
        mentions: [],
        mentionDepth: depth,
      });
      return null;
    }

    setThinkingClaudes((prev) => new Set(prev).add(claudeName));

    // Create the message up-front so streaming updates fill it in progressively
    let messageId: Id<"messages"> | null = null;

    try {
      const memoryContext = claudeMemories?.[claudeName]?.summary;
      if (memoryContext) {
        touchClaudeMemory({ ownerUserId: owner.userId, claudeName }).catch(() => {});
      }
      // Read MCP servers from the owner's participant record (persisted in Convex)
      // so they're available regardless of whose browser triggers the call.
      // Fall back to local sessionStorage MCPs for your own Claude (backward compat
      // for participants who joined before the field existed in Convex).
      const ownerMcpServers: McpServer[] =
        (owner.mcpServers && owner.mcpServers.length > 0)
          ? owner.mcpServers
          : (owner.userId === currentUserId ? mcpServers : []);

      // Create placeholder message for streaming — bubble shows thinking dots
      messageId = await sendMessage({
        roomId,
        fromUserId: owner.userId,
        fromDisplayName: claudeName,
        type: "claude",
        claudeName,
        ownerUserId: owner.userId,
        content: "",
        mentions: [],
        mentionDepth: depth,
        isStreaming: true,
      });

      // Remove standalone thinking indicator now that the bubble has its own
      setThinkingClaudes((prev) => {
        const next = new Set(prev);
        next.delete(claudeName);
        return next;
      });

      const streamOpts = {
        systemPrompt: owner.systemPrompt,
        messages: callMessages,
        mcpServers: ownerMcpServers.length > 0 ? ownerMcpServers : undefined,
        claudeName,
        memoryContext,
        ownerTimezone: ownerTimezone ?? undefined,
        chainDepth: depth,
        chainLimit,
        onText: (accumulated: string) => {
          if (messageId) {
            updateStreamingMessage({
              messageId,
              content: accumulated,
              isStreaming: true,
            }).catch((e: unknown) => console.warn("[stream flush] update failed:", e));
          }
        },
        onToolUse: (toolName: string) => {
          sendMessage({
            roomId,
            fromUserId: "system",
            fromDisplayName: "system",
            type: "system",
            content: `🔧 ${claudeName} used ${toolName}`,
            mentions: [],
            mentionDepth: depth,
          });
        },
        signal,
      };

      let reply: string;
      try {
        reply = await callClaudeStreaming({ apiKey, ...streamOpts });
      } catch (primaryErr) {
        // On billing/credit errors, try the sponsor's key as fallback
        const errText = primaryErr instanceof Error ? primaryErr.message : "";
        const isBillingError = /credit balance|billing|payment|insufficient.*(fund|credit)|exceeded.*budget|rate.*limit/i.test(errText);
        if (isBillingError) {
          const sponsorKey = await convex.query(api.apiKeys.getSponsorKeyForParticipant, {
            roomId,
            participantUserId: owner.userId,
          });
          if (sponsorKey) {
            // Reset the streaming message for the retry
            if (messageId) {
              await updateStreamingMessage({ messageId, content: "", isStreaming: true });
            }
            reply = await callClaudeStreaming({ apiKey: sponsorKey, ...streamOpts });
          } else {
            throw primaryErr;
          }
        } else {
          throw primaryErr;
        }
      }

      // Strip @everyone from Claude replies — agents must use direct @mentions
      const replyForMentions = reply.replace(/@everyone(?!\w)/gi, "everyone");
      const mentions = detectMentions(replyForMentions, allParticipants).filter(
        (name) => name !== claudeName
      );

      // Final update: set complete content, mentions, and clear streaming flag
      if (messageId) {
        await updateStreamingMessage({
          messageId,
          content: reply,
          isStreaming: false,
          mentions,
        });
      }

      // Guard: if the reply @-addresses a human by display name, yield to them
      const addressesHuman = allParticipants.some((p) =>
        reply.toLowerCase().includes(`@${p.displayName.toLowerCase()}`)
      );

      if (!addressesHuman) {
        for (const subName of mentions) {
          // Claudiu chain mention — route to dedicated handler
          if (subName === CLAUDIU_NAME) {
            if (!claudiuOwnerInRoom) continue;
            // Rebuild history from the sub-Claude's perspective so roles are correct
            const subMsgs = (messagesRef.current ?? []) as MessageWithAttachments[];
            const subTrimmed = trimToTokenBudget(subMsgs);
            const subHistory = await buildHistory(subTrimmed, CLAUDIU_NAME, uploadBlobToStorage);
            const subCallMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [
              ...subHistory,
              { role: "user", content: `[${claudeName}]: ${reply}` },
              { role: "user", content: `(${CLAUDIU_NAME}, you were mentioned by ${claudeName} above. Respond to them or the conversation.)` },
            ];
            await invokeClaudiuResponse({
              callMessages: subCallMessages,
              allParticipants,
              depth: depth + 1,
              respondedSet,
              signal,
            });
            continue;
          }
          const subOwner = allParticipants.find((p) => p.claudeName === subName);
          if (!subOwner) continue;
          // Rebuild history from the sub-Claude's perspective so roles are correct
          const subMsgs = (messagesRef.current ?? []) as MessageWithAttachments[];
          const subTrimmed = trimToTokenBudget(subMsgs);
          const subHistory = await buildHistory(subTrimmed, subName, uploadBlobToStorage);
          const subCallMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [
            ...subHistory,
            { role: "user", content: `[${claudeName}]: ${reply}` },
            {
              role: "user",
              content: `(${subName}, you were mentioned by ${claudeName} above. Respond to them or the conversation.)`,
            },
          ];
          await invokeClaudeResponse({
            claudeName: subName,
            owner: subOwner,
            callMessages: subCallMessages,
            allParticipants,
            depth: depth + 1,
            respondedSet,
            precedingReplies: [...precedingReplies, { claudeName, content: reply }],
            chainStartHumanCount,
            signal,
          });
        }
      }

      // Fire-and-forget memory update (only at depth 0 to avoid thrashing)
      if (depth === 0) {
        const USER_TRIGGERS = /\b(remember this|remember that|don't forget|save this|note this|keep that in mind|log this)\b/i;
        const CLAUDE_TRIGGERS = /\b(i('ll| will) remember|i('ve| have) noted|i('ll| will) keep that in mind|noted|i('ll| will) make a note)\b/i;

        const lastUserMsg = callMessages.findLast((m) => m.role === "user");
        const lastUserText = typeof lastUserMsg?.content === "string"
          ? lastUserMsg.content
          : (lastUserMsg?.content as { type: string; text?: string }[] | undefined)
              ?.find((b) => b.type === "text")?.text ?? "";

        const triggeredByUser = USER_TRIGGERS.test(lastUserText);
        const triggeredByClaude = CLAUDE_TRIGGERS.test(reply);

        const liveMessages = messagesRef.current ?? [];
        const memory = claudeMemories?.[claudeName];
        const newSinceLast = liveMessages.length - (memory?.messageCount ?? 0);
        const thresholdMet = liveMessages.length > 8 && newSinceLast > 5;

        if (thresholdMet || triggeredByUser || triggeredByClaude) {
          const explicitTrigger = triggeredByUser || triggeredByClaude;
          const messagesToSummarize = explicitTrigger
            ? liveMessages
            : liveMessages.slice(0, -5);
          const formatted = messagesToSummarize
            .filter((m) => m.type !== "system")
            .map((m) => `${m.fromDisplayName}: ${m.content}`)
            .join("\n");
          if (!formatted.trim()) return { claudeName, content: reply };
          const summaryPrompt = memory?.summary
            ? `Update this existing summary:\n${memory.summary}\n\nNew messages:\n${formatted}`
            : formatted;
          callClaude({
            apiKey,
            systemPrompt:
              `You compress Cha(t)os chat logs into a minimal memory note for an AI persona called ${claudeName}. Output ONLY a tight bullet list of facts about the human participants — names, relationships, preferences, projects, ongoing topics. No prose, no commentary, no filler. Hard limit: 120 words. If a previous summary is provided, merge and deduplicate rather than append.`,
            messages: [{ role: "user", content: summaryPrompt }],
          })
            .then((summary) =>
              upsertClaudeMemory({
                ownerUserId: owner.userId,
                claudeName,
                summary,
                messageCount: liveMessages.length,
              })
            )
            .catch((err) => console.error("[memory] update failed:", err));
        }
      }

      return { claudeName, content: reply };
    } catch (err) {
      // Silently drop intentional cancellations
      if (err instanceof Error && err.name === "AbortError") {
        // Clean up the placeholder message if we were aborted before any text
        if (messageId) {
          updateStreamingMessage({ messageId, content: "(cancelled)", isStreaming: false }).catch(() => {});
        }
        return null;
      }
      // On error, show error in the streaming message instead of leaving it blank
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      if (messageId) {
        updateStreamingMessage({ messageId, content: `*[Error: ${errMsg}]*`, isStreaming: false }).catch((e) =>
          console.error("[claude] failed to update error message:", e)
        );
      } else {
        await sendMessage({
          roomId,
          fromUserId: "system",
          fromDisplayName: "system",
          type: "system",
          content: `${claudeName} hit an error: ${errMsg}`,
          mentions: [],
          mentionDepth: depth,
        });
      }
      return null;
    } finally {
      setThinkingClaudes((prev) => {
        const next = new Set(prev);
        next.delete(claudeName);
        return next;
      });
    }
  };

  // Claudiu can respond whenever the owner is present in the room — not just when the current user IS the owner
  const claudiuOwnerInRoom = (participants ?? []).some(
    (p) => p.tokenIdentifier === process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN && p.isOnline
  );

  const invokeClaudiuResponse = async ({
    callMessages,
    allParticipants,
    depth,
    respondedSet,
    signal,
  }: {
    callMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
    allParticipants: Doc<"participants">[];
    depth: number;
    respondedSet: Set<string>;
    signal: AbortSignal;
  }): Promise<{ claudeName: string; content: string } | null> => {
    if (depth >= chainLimit) return null;
    if (!claudiuOwnerInRoom) return null;
    if (room?.claudiuLurk) return null;

    // Skip if Claudiu already responded in this chain (prevents @everyone double-firing)
    if (respondedSet.has(CLAUDIU_NAME)) return null;
    respondedSet.add(CLAUDIU_NAME);

    setThinkingClaudes((prev) => new Set(prev).add(CLAUDIU_NAME));

    let messageId: Id<"messages"> | null = null;

    try {
      messageId = await sendMessage({
        roomId,
        fromUserId: "claudiu-system",
        fromDisplayName: CLAUDIU_NAME,
        type: "claude",
        claudeName: CLAUDIU_NAME,
        ownerUserId: "claudiu-system",
        content: "",
        mentions: [],
        mentionDepth: depth,
        isStreaming: true,
      });

      setThinkingClaudes((prev) => {
        const next = new Set(prev);
        next.delete(CLAUDIU_NAME);
        return next;
      });

      // Convert base64 blocks to URL sources so the payload stays small
      // through the API route proxy
      const lightMessages = await externalizeBase64Blocks(callMessages, uploadBlobToStorage);

      const res = await fetch("/api/claudiu/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, messages: lightMessages, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, chainDepth: depth, chainLimit }),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Claudiu API error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream from Claudiu");

      const decoder = new TextDecoder();
      let text = "";
      let buffer = "";
      let lastFlush = 0;
      const FLUSH_INTERVAL = 150;

      const flush = () => {
        lastFlush = Date.now();
        if (messageId) {
          updateStreamingMessage({ messageId, content: text, isStreaming: true }).catch((e) => console.warn("[claudiu flush] update failed:", e));
        }
      };

      while (true) {
        // Timeout per-read: if no data arrives in 30s, assume the stream is stalled
        const readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Stream read timeout — no data received for 30s")), 30000)
          ),
        ]);
        const { done, value } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let event: any;
          try { event = JSON.parse(jsonStr); } catch { continue; }

          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            text += event.delta.text;
            if (Date.now() - lastFlush >= FLUSH_INTERVAL) flush();
          }
        }
      }

      // Final flush
      // Strip @everyone from Claudiu replies — agents must use direct @mentions
      const textForMentions = text.replace(/@everyone(?!\w)/gi, "everyone");
      const mentions = detectMentions(textForMentions, allParticipants).filter((n) => n !== CLAUDIU_NAME);
      if (messageId) {
        await updateStreamingMessage({ messageId, content: text, isStreaming: false, mentions });
      }

      // Chain: invoke any Claudes that Claudiu mentioned in its response
      const addressesHuman = allParticipants.some((p) =>
        text.toLowerCase().includes(`@${p.displayName.toLowerCase()}`)
      );
      if (!addressesHuman) {
        for (const subName of mentions) {
          const subOwner = allParticipants.find((p) => p.claudeName === subName);
          if (!subOwner) continue;
          const subMsgs = (messagesRef.current ?? []) as MessageWithAttachments[];
          const subTrimmed = trimToTokenBudget(subMsgs);
          const subHistory = await buildHistory(subTrimmed, subName, uploadBlobToStorage);
          const subCallMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [
            ...subHistory,
            { role: "user", content: `[${CLAUDIU_NAME}]: ${text}` },
            { role: "user", content: `(${subName}, you were mentioned by ${CLAUDIU_NAME} above. Respond to them or the conversation.)` },
          ];
          await invokeClaudeResponse({
            claudeName: subName,
            owner: subOwner,
            callMessages: subCallMessages,
            allParticipants,
            depth: depth + 1,
            respondedSet,
            precedingReplies: [{ claudeName: CLAUDIU_NAME, content: text }],
            chainStartHumanCount: ((messagesRef.current ?? []).filter((m) => m.type === "user").length),
            signal,
          });
        }
      }

      return { claudeName: CLAUDIU_NAME, content: text || "..." };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (messageId) {
          updateStreamingMessage({ messageId, content: "(cancelled)", isStreaming: false }).catch(() => {});
        }
        return null;
      }
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      if (messageId) {
        updateStreamingMessage({ messageId, content: `*[Error: ${errMsg}]*`, isStreaming: false }).catch((e) =>
          console.error("[claudiu] failed to update error message:", e)
        );
      } else {
        await sendMessage({
          roomId,
          fromUserId: "system",
          fromDisplayName: "system",
          type: "system",
          content: `Claudiu hit an error: ${errMsg}`,
          mentions: [],
          mentionDepth: depth,
        });
      }
      return null;
    } finally {
      setThinkingClaudes((prev) => {
        const next = new Set(prev);
        next.delete(CLAUDIU_NAME);
        return next;
      });
    }
  };

  // Throttled typing indicator — fire at most once per 2s
  const lastTypingRef = useRef(0);
  const handleTyping = useCallback(() => {
    if (!currentUserId || !currentDisplayName) return;
    const now = Date.now();
    if (now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;
    setTypingMutation({ roomId, userId: currentUserId, displayName: currentDisplayName }).catch(() => {});
  }, [currentUserId, currentDisplayName, roomId, setTypingMutation]);

  const handleSendMessage = async (content: string, attachments?: any[]) => {
    if (!currentUserId || !currentDisplayName || sending) return;
    clearTypingMutation({ roomId, userId: currentUserId }).catch(() => {});
    setSending(true);

    const currentParticipants = participants ?? [];
    const rawMentions = detectMentions(content, currentParticipants);
    const uniqueMentions = [...new Set(rawMentions)];

    try {
      await sendMessage({
        roomId,
        fromUserId: currentUserId,
        fromDisplayName: currentDisplayName,
        type: "user",
        content,
        attachments: attachments?.map(({ data, ...rest }) => rest),
        mentions: uniqueMentions,
      });

      if (uniqueMentions.length === 0) return;

      const precedingReplies: { claudeName: string; content: string }[] = [];
      const respondedSet = new Set<string>();
      // count includes the human message we just sent.
      const chainStartHumanCount = ((messages ?? []).filter((m) => m.type === "user").length) + 1;
      const abortController = new AbortController();
      chainAbortRef.current = abortController;

      for (const claudeName of uniqueMentions) {
        // Claudiu is a virtual participant — route to dedicated handler
        if (claudeName === CLAUDIU_NAME) {
          if (!claudiuOwnerInRoom) continue;
          const allMsgs = (messages ?? []) as MessageWithAttachments[];
          const trimmed = trimToTokenBudget(allMsgs);
          const history = await buildHistory(trimmed, CLAUDIU_NAME, uploadBlobToStorage);

          // Build the current message content — include attachments if present
          let currentMsgContent: string | MessageContent[] = `${currentDisplayName}: ${content}`;
          if (attachments && attachments.length > 0) {
            const contentArray: MessageContent[] = [
              { type: "text", text: `${currentDisplayName}: ${content}` },
            ];
            for (const a of attachments) {
              if (a.data && isTextFile(a.fileName, a.contentType)) {
                let text: string;
                try { text = atob(a.data); } catch { text = a.data; }
                if (text.length > MAX_TEXT_FILE_CHARS) {
                  text = text.slice(0, MAX_TEXT_FILE_CHARS) + `\n…[truncated at ${MAX_TEXT_FILE_CHARS} chars]`;
                }
                contentArray.push({ type: "text", text: `\n--- ${a.fileName} ---\n${text}\n--- end ${a.fileName} ---` });
              } else if (a.data) {
                const byteSize = Math.ceil(a.data.length * 3 / 4);
                if (a.contentType?.startsWith("image/") && byteSize > MAX_BASE64_BYTES) {
                  try {
                    const raw = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
                    const blob = new Blob([raw], { type: a.contentType });
                    const { data, mediaType } = await compressImageToFit(blob);
                    contentArray.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
                  } catch { /* skip */ }
                } else if (byteSize <= MAX_BASE64_BYTES) {
                  if (a.contentType?.startsWith("image/")) {
                    contentArray.push({ type: "image", source: { type: "base64", media_type: a.contentType, data: a.data } });
                  } else if (a.contentType === "application/pdf") {
                    contentArray.push({ type: "document", source: { type: "base64", media_type: a.contentType, data: a.data } });
                  }
                }
              }
            }
            currentMsgContent = contentArray;
          }

          const callMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [...history, { role: "user" as const, content: currentMsgContent }];
          if (precedingReplies.length > 0) {
            const context = compactPrecedingReplies(precedingReplies);
            callMessages.push({
              role: "user",
              content: `(You were also mentioned. Note that ${context} — respond to them or the original message, your call.)`,
            });
          }
          const result = await invokeClaudiuResponse({
            callMessages,
            allParticipants: currentParticipants,
            depth: 0,
            respondedSet,
            signal: abortController.signal,
          });
          if (result) precedingReplies.push(result);
          continue;
        }

        const owner = currentParticipants.find((p) => p.claudeName === claudeName);
        if (!owner) continue;

        let userContent: string | MessageContent[] = `${currentDisplayName}: ${content}`;

        // Include immediate attachments — the reactive query hasn't updated yet,
        // so use the base64 data we still have from the upload
        if (attachments && attachments.length > 0) {
          const contentArray: MessageContent[] = [
            { type: "text", text: `${currentDisplayName}: ${content}` },
          ];
          for (const a of attachments) {
            if (a.data && isTextFile(a.fileName, a.contentType)) {
              // Decode base64 text file and inline it
              let text: string;
              try {
                text = atob(a.data);
              } catch {
                text = a.data;
              }
              if (text.length > MAX_TEXT_FILE_CHARS) {
                text = text.slice(0, MAX_TEXT_FILE_CHARS) + `\n…[truncated at ${MAX_TEXT_FILE_CHARS} chars]`;
              }
              contentArray.push({ type: "text", text: `\n--- ${a.fileName} ---\n${text}\n--- end ${a.fileName} ---` });
            } else if (a.data) {
              const byteSize = Math.ceil(a.data.length * 3 / 4);
              if (a.contentType?.startsWith("image/") && byteSize > MAX_BASE64_BYTES) {
                // Oversized image — compress via canvas
                try {
                  const raw = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
                  const blob = new Blob([raw], { type: a.contentType });
                  const { data, mediaType } = await compressImageToFit(blob);
                  contentArray.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
                } catch { /* skip if compression fails */ }
              } else if (byteSize <= MAX_BASE64_BYTES) {
                if (a.contentType?.startsWith("image/")) {
                  contentArray.push({ type: "image", source: { type: "base64", media_type: a.contentType, data: a.data } });
                } else if (a.contentType === "application/pdf") {
                  contentArray.push({ type: "document", source: { type: "base64", media_type: a.contentType, data: a.data } });
                }
              }
            }
          }
          userContent = contentArray;
        }

        // 1. Get history from the current query state (token-budget trimmed)
        const allMsgs = (messages ?? []) as MessageWithAttachments[];
        const trimmed = trimToTokenBudget(allMsgs);
        const trimmedCount = allMsgs.length - trimmed.length;

        // Conversation compacting: summarize dropped messages as session context
        if (trimmedCount > 0 && owner) {
          const existing = sessionSummaryRef.current;
          const newSinceSummary = allMsgs.length - (existing?.throughMsgCount ?? 0);
          // Re-summarize if we've never summarized or 10+ new messages since last
          if (!existing || newSinceSummary >= 10) {
            const dropped = allMsgs.slice(0, trimmedCount);
            const formatted = dropped
              .filter((m) => m.type !== "system")
              .map((m) => `${m.fromDisplayName}: ${m.content}`)
              .join("\n");
            if (formatted.trim()) {
              const ownerApiKey = await convex.query(api.apiKeys.getApiKeyForParticipant, {
                roomId,
                participantUserId: owner.userId,
              });
              if (ownerApiKey) {
                const base = existing?.summary
                  ? `Update this summary with new earlier context:\n${existing.summary}\n\nAdditional messages:\n${formatted}`
                  : formatted;
                // Always fire-and-forget — blocking on the summary call delays
                // the Claude response noticeably (the whole point of bug #4).
                callClaude({
                  apiKey: ownerApiKey,
                  systemPrompt:
                    "Compress this chat log into a brief context summary (max 150 words). Capture key topics, decisions, and participant positions. No preamble — output only the summary.",
                  messages: [{ role: "user", content: base }],
                })
                  .then((summary) => {
                    sessionSummaryRef.current = { summary, throughMsgCount: allMsgs.length };
                  })
                  .catch((err) => console.error("[compact] summary failed:", err));
              }
            }
          }
        }

        const history = await buildHistory(trimmed, claudeName, uploadBlobToStorage);

        // Inject session summary at the top if available
        if (sessionSummaryRef.current?.summary) {
          history.unshift(
            { role: "user" as const, content: `[Earlier conversation context — auto-summarized]\n${sessionSummaryRef.current.summary}` },
            { role: "assistant" as const, content: "Got it, I have that context." },
          );
        }

        // 2. Check if the message we just sent is already the last turn in history
        // We handle both string and multimodal array content here.
        const lastMsgTurn = history[history.length - 1];
        let alreadyInHistory = false;
        if (lastMsgTurn && lastMsgTurn.role === "user") {
          const needle = content.toLowerCase();
          if (typeof lastMsgTurn.content === "string") {
             alreadyInHistory = lastMsgTurn.content.toLowerCase().includes(needle);
          } else if (Array.isArray(lastMsgTurn.content)) {
             alreadyInHistory = lastMsgTurn.content.some(c => c.type === "text" && c.text.toLowerCase().includes(needle));
          }
        }

        let callMessages = history;

        // Session search: detect "search [my history] for X" trigger
        const SEARCH_TRIGGER = /\bsearch(?:\s+my\s+(?:history|sessions?))?\s+(?:for\s+)?(.+)/i;
        const searchMatch = content.match(SEARCH_TRIGGER);
        if (searchMatch && currentUserId) {
          const results = await convex.query(api.messages.searchUserMessages, {
            fromUserId: currentUserId,
            searchQuery: searchMatch[1].trim(),
          });
          if (results.length > 0) {
            const contextBlock = results
              .map((m) => `[${new Date(m.createdAt).toLocaleDateString()}] ${m.content}`)
              .join("\n");
            callMessages = [
              { role: "user" as const, content: `[Relevant past messages found]\n${contextBlock}` },
              { role: "assistant" as const, content: "I can see those past messages." },
              ...callMessages,
            ];
          }
        }

        if (!alreadyInHistory) {
          // Construct the current message block manually — the reactive query
          // hasn't picked up the just-sent message yet, so use userContent which
          // already has the inline file data from above
          callMessages = [
            ...history,
            { role: "user" as const, content: userContent }
          ];
        }

        if (precedingReplies.length > 0) {
          const context = compactPrecedingReplies(precedingReplies);
          callMessages.push({
            role: "user",
            content: `(You were also mentioned. Note that ${context} — respond to them or the original message, your call.)`,
          });
        }

        const result = await invokeClaudeResponse({
          claudeName,
          owner,
          callMessages,
          allParticipants: currentParticipants,
          depth: 0,
          respondedSet,
          precedingReplies,
          chainStartHumanCount,
          signal: abortController.signal,
        });

        if (result) precedingReplies.push(result);
      }
    } finally {
      setSending(false);
    }
  };

  // Loading state
  if (!currentUserId || messages === undefined || participants === undefined) {
    return (
      <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{
                borderColor: "rgba(223,166,73,0.2)",
                borderTopColor: "var(--amber)",
              }}
            />
            <span className="text-sm">Entering the chaos…</span>
          </div>
        </div>
      </main>
    );
  }

  const onlineCount = participants.filter((p) => p.isOnline).length;

  return (
    <div
      className="relative flex flex-col h-screen"
      style={{ background: "var(--bg)" }}
    >
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "120px",
          }}
        />
        <FloatingOrb
          className="w-[400px] h-[400px] opacity-[0.06]"
          style={{ background: "var(--amber)", top: "-8%", right: "-6%" }}
          delay={0}
        />
        <FloatingOrb
          className="w-64 h-64 opacity-[0.04]"
          style={{ background: "var(--purple)", bottom: "8%", left: "-4%" }}
          delay={6}
        />
        <FloatingOrb
          className="w-48 h-48 opacity-[0.04]"
          style={{ background: "var(--sage-teal)", top: "45%", right: "5%" }}
          delay={10}
        />
      </div>

      {/* Header */}
      <header
        className="page-topbar-margin shrink-0 flex items-center justify-between px-5 py-3 border-b relative z-20"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--header-bg)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left: room title + info */}
        <div className="flex items-center gap-3 min-w-0">
          <RoomTitle
            title={room?.title}
            roomCode={room?.roomCode ?? ""}
            canEdit={!!room && !!myParticipant?.tokenIdentifier && room.ownerTokenIdentifier === myParticipant.tokenIdentifier}
            onSave={(title) => updateRoomTitle({ roomId, title })}
          />
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
            {onlineCount} online
          </span>
        </div>

        {/* Right: settings + invite + participant dots */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {room && myParticipant && currentUserId && (
            <RoomSettings
              roomId={roomId}
              room={room}
              currentUserId={currentUserId}
              currentColor={myParticipant.color}
              isOwner={!!myParticipant.tokenIdentifier && room.ownerTokenIdentifier === myParticipant.tokenIdentifier}
              isClaudiuOwner={myParticipant.tokenIdentifier === process.env.NEXT_PUBLIC_CLAUDIU_OWNER_TOKEN}
            />
          )}
          <InviteButton roomId={roomId} />
          <div className="w-px h-4 hidden sm:block" style={{ background: "var(--border)" }} />
          <div className="flex items-center gap-1 sm:gap-1.5">
            {participants.map((p) => {
              const color = participantColors[p.userId];
              return (
                <div
                  key={p.userId}
                  title={`${p.displayName} · @${p.claudeName}${p.isOnline ? "" : " (offline)"}`}
                  className="flex items-center gap-1 sm:px-2 sm:py-1 rounded-full text-xs transition-opacity"
                  style={{
                    background: color?.bg ?? "var(--surface)",
                    border: `1px solid ${color?.text ?? "#fff"}22`,
                    opacity: p.isOnline ? 1 : 0.4,
                  }}
                >
                  <div
                    className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full shrink-0"
                    style={{
                      background: p.isOnline
                        ? (color?.text ?? "#fff")
                        : "var(--text-dim)",
                    }}
                  />
                  <span className="hidden sm:inline" style={{ color: color?.text ?? "var(--fg)" }}>
                    {p.displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="relative flex-1 overflow-hidden">
      <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-5 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center animate-glow-pulse"
              style={{
                background: "rgba(139,189,185,0.07)",
                border: "1px solid rgba(139,189,185,0.15)",
                boxShadow: "0 0 32px rgba(139,189,185,0.08)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--sage-teal)" }}>
                <rect x="2" y="8" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8.5" cy="15" r="1.5" fill="currentColor" />
                <circle cx="15.5" cy="15" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                The room is quiet.
              </p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Say hello, or{" "}
                <span style={{ color: "var(--sage-teal)" }}>@mention</span> a Claude to get things started.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg._id}
            message={msg}
            currentUserId={currentUserId}
            participantColors={participantColors}
            specialUsers={specialUsers}
            reactions={groupedReactions[msg._id] ?? []}
            onReaction={async (emoji) => {
              const result = await toggleReaction({ messageId: msg._id, roomId, emoji, userId: currentUserId });
              if (result.action !== "added") return;

              // Reaction was added — trigger the Claude who authored this message (if any)
              const reactedClaude = msg.type === "claude" ? msg.claudeName : null;
              if (!reactedClaude) return;

              const snippet = msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : "");
              const reactorName = currentDisplayName || "Someone";
              const reactionEvent = `[${reactorName} just reacted with ${emoji} to your message: "${snippet}"]`;

              const currentParticipants = participants ?? [];

              if (reactedClaude === CLAUDIU_NAME) {
                if (!claudiuOwnerInRoom) return;
                const allMsgs = (messages ?? []) as MessageWithAttachments[];
                const trimmed = trimToTokenBudget(allMsgs);
                const history = await buildHistory(trimmed, CLAUDIU_NAME, uploadBlobToStorage);
                const callMessages = [...history, { role: "user" as const, content: reactionEvent }];
                const abortController = new AbortController();
                chainAbortRef.current = abortController;
                await invokeClaudiuResponse({
                  callMessages,
                  allParticipants: currentParticipants,
                  depth: 0,
                  respondedSet: new Set<string>(),
                  signal: abortController.signal,
                });
                return;
              }

              const owner = currentParticipants.find((p) => p.claudeName === reactedClaude);
              if (!owner) return;

              const allMsgs = (messages ?? []) as MessageWithAttachments[];
              const trimmed = trimToTokenBudget(allMsgs);
              const history = await buildHistory(trimmed, reactedClaude, uploadBlobToStorage);
              const callMessages = [...history, { role: "user" as const, content: reactionEvent }];
              const abortController = new AbortController();
              chainAbortRef.current = abortController;
              const chainStartHumanCount = ((messages ?? []).filter((m) => m.type === "user").length);
              await invokeClaudeResponse({
                claudeName: reactedClaude,
                owner,
                callMessages,
                allParticipants: currentParticipants,
                depth: 0,
                respondedSet: new Set<string>(),
                precedingReplies: [],
                chainStartHumanCount,
                signal: abortController.signal,
              });
            }}
          />
        ))}

        {/* Thinking indicators */}
        {[...thinkingClaudes].map((claudeName) => {
          const isClaudiu = claudeName === CLAUDIU_NAME;
          const owner = participants.find((p) => p.claudeName === claudeName);
          const color = owner ? participantColors[owner.userId] : undefined;
          const textColor = isClaudiu ? "#6366F1" : (color?.text ?? "#8CBDB9");
          const bgColor = isClaudiu ? "rgba(99,102,241,0.06)" : (color?.bg ?? "rgba(139,189,185,0.08)");
          return (
            <div key={claudeName} className="flex justify-start">
              <div style={{ maxWidth: "72%" }}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {isClaudiu ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: textColor }}>
                      <path d="M6 1l1.3 3.1L10.5 4.5 8.2 7l.5 3.2L6 8.7 3.3 10.2 3.8 7 1.5 4.5l3.2-.4z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: textColor }}>
                      <rect x="1" y="4" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M4 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="4" cy="7.5" r="0.8" fill="currentColor" />
                      <circle cx="8" cy="7.5" r="0.8" fill="currentColor" />
                    </svg>
                  )}
                  <span className="text-xs font-medium" style={{ color: textColor }}>
                    {claudeName}
                  </span>
                  <button
                    onClick={() => chainAbortRef.current?.abort()}
                    className="text-xs ml-1 transition-opacity opacity-40 hover:opacity-80"
                    style={{ color: textColor }}
                    title="Stop this response"
                  >
                    wait
                  </button>
                </div>
                <div
                  className="px-4 py-3.5 text-sm flex items-center gap-1.5"
                  style={{
                    background: bgColor,
                    border: `1px solid ${textColor}22`,
                    borderRadius: "4px 18px 18px 18px",
                  }}
                >
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
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollButton && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute top-3 right-4 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 hover:scale-105 z-10"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            color: "var(--sage-teal)",
          }}
          title="Scroll to bottom"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 pb-4 pt-3 border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {/* Typing indicator */}
        {typingUsers && typingUsers.filter((t) => t.userId !== currentUserId).length > 0 && (
          <div className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <span className="inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-1 h-1 rounded-full"
                  style={{
                    background: "var(--text-muted)",
                    animation: `thinking-wave 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </span>
            <span>
              {typingUsers
                .filter((t) => t.userId !== currentUserId)
                .map((t) => t.displayName)
                .join(", ")}{" "}
              {typingUsers.filter((t) => t.userId !== currentUserId).length === 1
                ? "is"
                : "are"}{" "}
              typing
            </span>
          </div>
        )}
        <MentionInput
          participants={participants}
          onSend={handleSendMessage}
          showClaudiu={claudiuOwnerInRoom}
          onGifSend={async (gifUrl) => {
            if (!currentUserId || !currentDisplayName) return;
            await sendMessage({
              roomId,
              fromUserId: currentUserId,
              fromDisplayName: currentDisplayName,
              type: "user",
              content: "",
              gifUrl,
              mentions: [],
            });
          }}
          currentDisplayName={currentDisplayName}
          disabled={sending}
          onTyping={handleTyping}
        />
      </div>
    </div>
  );
}
