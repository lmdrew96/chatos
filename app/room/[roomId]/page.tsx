"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { callClaude, McpServer } from "@/lib/claude";
import MessageBubble from "@/components/MessageBubble";
import MentionInput from "@/components/MentionInput";
import { InviteButton } from "@/components/InviteButton";
import { MessageContent } from "@/lib/claude";

async function fetchAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attachment: ${res.statusText}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({ data: base64, mediaType: blob.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

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

const MAX_MENTION_DEPTH = 3;

type InvokeParams = {
  claudeName: string;
  owner: Doc<"participants">;
  callMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[];
  allParticipants: Doc<"participants">[];
  apiKey: string;
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

function detectMentions(content: string, participants: Doc<"participants">[]): string[] {
  return participants
    .map((p) => p.claudeName)
    .filter((name) => new RegExp(`@${name}(?![\\w])`, "i").test(content));
}

// Collapse consecutive same-role messages and handle attachments for multimodal support
async function buildHistory(
  messages: MessageWithAttachments[]
): Promise<{ role: "user" | "assistant"; content: string | MessageContent[] }[]> {
  const result: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [];

  for (const m of messages) {
    if (m.type === "system") continue;
    const role: "user" | "assistant" = m.type === "claude" ? "assistant" : "user";
    
    let contentText = m.type === "claude"
        ? m.content
        : `${m.fromDisplayName}: ${m.content}`;

    const attachmentBlocks: MessageContent[] = [];
    if (m.attachments && m.attachments.length > 0) {
      for (const a of m.attachments) {
        const url = a.url || (a.storageId ? `${process.env.NEXT_PUBLIC_CONVEX_URL}/api/storage/${a.storageId}` : null);
        if (!url) continue;
        try {
          const { data, mediaType } = await fetchAsBase64(url);
          if (SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
            if (mediaType.startsWith("image/")) {
              attachmentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
            } else if (mediaType === "application/pdf") {
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
  // 1 is used for System Prompt in callClaude.
  // We'll use up to 3 more for the history blocks.
  // Tagging from latest back ensures the most recent state is cached for the next turn.
  let breakpointsSet = 0;
  for (let i = result.length - 1; i >= 0 && breakpointsSet < 3; i--) {
    const msg = result[i];
    if (typeof msg.content === "string") {
      msg.content = [{ type: "text", text: msg.content, cache_control: { type: "ephemeral" } }];
      breakpointsSet++;
    } else if (Array.isArray(msg.content) && msg.content.length > 0) {
      // Tag the last block in the content array (often the text or the last image)
      msg.content[msg.content.length - 1].cache_control = { type: "ephemeral" };
      breakpointsSet++;
    }
  }

  return result;
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

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState("");
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [sending, setSending] = useState(false);
  // Claude names currently generating a response
  const [thinkingClaudes, setThinkingClaudes] = useState<Set<string>>(new Set());

  const messages = useQuery(api.messages.useMessages, { roomId });
  const participants = useQuery(api.rooms.useParticipants, { roomId });
  const myParticipant = useQuery(api.rooms.getMyParticipantInRoom, { roomId });
  const sendMessage = useMutation(api.messages.sendMessage);
  const setOnlineStatus = useMutation(api.rooms.setOnlineStatus);
  const updateParticipantColor = useMutation(api.rooms.updateParticipantColor);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Always-current snapshot of messages for use inside async chains
  const messagesRef = useRef<Doc<"messages">[] | undefined>(undefined);
  // AbortController for the active Claude chain — replaced each user send
  const chainAbortRef = useRef<AbortController | null>(null);

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

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingClaudes]);

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
    apiKey,
    depth,
    respondedSet,
    precedingReplies,
    chainStartHumanCount,
    signal,
  }: InvokeParams): Promise<{ claudeName: string; content: string } | null> => {
    if (depth >= MAX_MENTION_DEPTH) return null;
    if (respondedSet.has(claudeName)) return null;

    // Guard: a human has sent a message since this chain started — yield to them
    const liveHumanCount = (messagesRef.current ?? []).filter((m) => m.type === "user").length;
    if (liveHumanCount > chainStartHumanCount) return null;

    respondedSet.add(claudeName);

    setThinkingClaudes((prev) => new Set(prev).add(claudeName));
    try {
      const reply = await callClaude({
        apiKey,
        systemPrompt: owner.systemPrompt,
        messages: callMessages,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        claudeName,
        signal,
      });

      const mentions = detectMentions(reply, allParticipants).filter(
        (name) => name !== claudeName
      );

      await sendMessage({
        roomId,
        fromUserId: owner.userId,
        fromDisplayName: owner.displayName,
        type: "claude",
        claudeName,
        ownerUserId: owner.userId,
        content: reply,
        mentions,
        mentionDepth: depth,
      });

      // Guard: if the reply @-addresses a human by display name, yield to them
      const addressesHuman = allParticipants.some((p) =>
        reply.toLowerCase().includes(`@${p.displayName.toLowerCase()}`)
      );

      if (!addressesHuman) {
        for (const subName of mentions) {
          const subOwner = allParticipants.find((p) => p.claudeName === subName);
          if (!subOwner) continue;
          const subCallMessages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [
            ...callMessages,
            { role: "assistant", content: reply },
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
            apiKey,
            depth: depth + 1,
            respondedSet,
            precedingReplies: [...precedingReplies, { claudeName, content: reply }],
            chainStartHumanCount,
            signal,
          });
        }
      }

      return { claudeName, content: reply };
    } catch (err) {
      // Silently drop intentional cancellations
      if (err instanceof Error && err.name === "AbortError") return null;
      await sendMessage({
        roomId,
        fromUserId: "system",
        fromDisplayName: "system",
        type: "system",
        content: `${claudeName} hit an error: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        mentions: [],
        mentionDepth: depth,
      });
      return null;
    } finally {
      setThinkingClaudes((prev) => {
        const next = new Set(prev);
        next.delete(claudeName);
        return next;
      });
    }
  };

  const handleSendMessage = async (content: string, attachments?: any[]) => {
    if (!currentUserId || !currentDisplayName || sending) return;
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
        const owner = currentParticipants.find((p) => p.claudeName === claudeName);
        if (!owner) continue;

        const apiKey = localStorage.getItem("chatos:apiKey");
        if (!apiKey) {
          await sendMessage({
            roomId,
            fromUserId: "system",
            fromDisplayName: "system",
            type: "system",
            content: `${claudeName}'s API key isn't available — ${owner.displayName} needs to set one in Settings.`,
            mentions: [],
          });
          continue;
        }

        let userContent: string | MessageContent[] = `${currentDisplayName}: ${content}`;
        
        // Include immediate attachments in the first AI call content array
        if (attachments && attachments.length > 0) {
          const contentArray: MessageContent[] = [];
          for (const a of attachments) {
            // We have to resolve the URL here since the mutation just happened
            // Convex doesn't return the resolved URL immediately, so we'll 
            // skip for now or wait for the reactive query to update.
            // Actually, buildHistory will handle previous ones, but for the FRESH message,
            // we should probably wait for the reactive query to pick it up or 
            // just use the file data directly from the input if we still had it.
            // Simplified approach: Claude will see it in the next turn or we fetch it now.
            const url = `https://${process.env.NEXT_PUBLIC_CONVEX_URL?.split("//")[1]}/api/storage/${a.storageId}`;
            try {
              // Note: This URL fetching logic depends on how your deployment serves storage.
              // For now, let's assume buildHistory will get the latest message including attachments.
            } catch (e) {}
          }
        }

        // 1. Get history from the current query state
        const history = await buildHistory((messages ?? []).slice(-15) as MessageWithAttachments[]);
        
        // 2. Check if the message we just sent is already the last turn in history
        // We handle both string and multimodal array content here.
        const lastMsgTurn = history[history.length - 1];
        let alreadyInHistory = false;
        if (lastMsgTurn && lastMsgTurn.role === "user") {
          if (typeof lastMsgTurn.content === "string") {
             alreadyInHistory = lastMsgTurn.content.includes(content);
          } else if (Array.isArray(lastMsgTurn.content)) {
             alreadyInHistory = lastMsgTurn.content.some(c => c.type === "text" && c.text.includes(content));
          }
        }

        let callMessages = history;
        
        if (!alreadyInHistory) {
          // Construct the current message block manually ONLY if it's not in the history yet
          let currentMsgContent: string | MessageContent[] = `${currentDisplayName}: ${content}`;
          if (attachments && attachments.length > 0) {
            const contentArray: MessageContent[] = [];
            for (const a of attachments) {
              if (a.data && SUPPORTED_MEDIA_TYPES.includes(a.contentType)) {
                if (a.contentType.startsWith("image/")) {
                  contentArray.push({ type: "image", source: { type: "base64", media_type: a.contentType, data: a.data } });
                } else if (a.contentType === "application/pdf") {
                  contentArray.push({ type: "document", source: { type: "base64", media_type: a.contentType, data: a.data } });
                }
              }
            }
            if (content.trim()) {
              contentArray.push({ type: "text", text: `${currentDisplayName}: ${content.trim()}` });
            }
            currentMsgContent = contentArray;
          }
          callMessages = [
            ...history,
            { role: "user" as const, content: currentMsgContent }
          ];
        }

        if (precedingReplies.length > 0) {
          const context = precedingReplies
            .map((r) => `[${r.claudeName} just responded]: "${r.content}"`)
            .join("\n");
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
          apiKey,
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
      {/* Header */}
      <header
        className="page-topbar-margin shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--header-bg)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left: room info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {onlineCount} online
            </span>
          </div>
        </div>

        {/* Right: invite + participant dots */}
        <div className="flex items-center gap-3">
          <InviteButton roomId={roomId} />
          <div className="w-px h-4" style={{ background: "var(--border)" }} />
          <div className="flex items-center gap-1.5">
            {participants.map((p) => {
              const color = participantColors[p.userId];
              return (
                <div
                  key={p.userId}
                  title={`${p.displayName} · @${p.claudeName}${p.isOnline ? "" : " (offline)"}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-opacity"
                  style={{
                    background: color?.bg ?? "var(--surface)",
                    border: `1px solid ${color?.text ?? "#fff"}22`,
                    opacity: p.isOnline ? 1 : 0.4,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: p.isOnline
                        ? (color?.text ?? "#fff")
                        : "var(--text-dim)",
                    }}
                  />
                  <span style={{ color: color?.text ?? "var(--fg)" }}>
                    {p.displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              No messages yet. Say hello — or{" "}
              <span style={{ color: "var(--sage-teal)" }}>@mention</span> a Claude to
              get things started.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg._id}
            message={msg}
            currentUserId={currentUserId}
            participantColors={participantColors}
          />
        ))}

        {/* Thinking indicators */}
        {[...thinkingClaudes].map((claudeName) => {
          const owner = participants.find((p) => p.claudeName === claudeName);
          const color = owner ? participantColors[owner.userId] : undefined;
          const textColor = color?.text ?? "#8CBDB9";
          const bgColor = color?.bg ?? "rgba(139,189,185,0.08)";
          return (
            <div key={claudeName} className="flex justify-start">
              <div style={{ maxWidth: "72%" }}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: textColor }}>
                    <rect x="1" y="4" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="4" cy="7.5" r="0.8" fill="currentColor" />
                    <circle cx="8" cy="7.5" r="0.8" fill="currentColor" />
                  </svg>
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
                  className="px-4 py-3 text-sm flex items-center gap-1"
                  style={{
                    background: bgColor,
                    border: `1px solid ${textColor}22`,
                    borderRadius: "4px 18px 18px 18px",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: textColor,
                        animationDelay: `${i * 150}ms`,
                        opacity: 0.7,
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

      {/* Input */}
      <div
        className="shrink-0 px-4 pb-4 pt-3 border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <MentionInput
          participants={participants}
          onSend={handleSendMessage}
          currentDisplayName={currentDisplayName}
          disabled={sending}
        />
      </div>
    </div>
  );
}
