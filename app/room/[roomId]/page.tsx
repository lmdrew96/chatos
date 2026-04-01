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

const MAX_MENTION_DEPTH = 3;

type InvokeParams = {
  claudeName: string;
  owner: Doc<"participants">;
  callMessages: { role: "user" | "assistant"; content: string }[];
  allParticipants: Doc<"participants">[];
  apiKey: string;
  depth: number;
  respondedSet: Set<string>;
  precedingReplies: { claudeName: string; content: string }[];
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
    .filter((name) => content.includes(`@${name}`));
}

// Collapse consecutive same-role messages so Anthropic API doesn't reject them
function buildHistory(
  messages: Doc<"messages">[]
): { role: "user" | "assistant"; content: string }[] {
  const result: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of messages) {
    if (m.type === "system") continue;
    const role: "user" | "assistant" = m.type === "claude" ? "assistant" : "user";
    const content =
      m.type === "claude"
        ? m.content
        : `${m.fromDisplayName}: ${m.content}`;

    if (result.length > 0 && result[result.length - 1].role === role) {
      result[result.length - 1].content += "\n\n" + content;
    } else {
      result.push({ role, content });
    }
  }

  return result;
}

export default function RoomPage() {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      map[p.userId] = COLORS[i % COLORS.length];
    });
    return map;
  }, [participants]);

  const invokeClaudeResponse = async ({
    claudeName,
    owner,
    callMessages,
    allParticipants,
    apiKey,
    depth,
    respondedSet,
    precedingReplies,
  }: InvokeParams): Promise<{ claudeName: string; content: string } | null> => {
    if (depth >= MAX_MENTION_DEPTH) return null;
    if (respondedSet.has(claudeName)) return null;
    respondedSet.add(claudeName);

    setThinkingClaudes((prev) => new Set(prev).add(claudeName));
    try {
      const reply = await callClaude({
        apiKey,
        systemPrompt: owner.systemPrompt,
        messages: callMessages,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        claudeName,
      });

      const subMentions = detectMentions(reply, allParticipants).filter(
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
        mentions: subMentions,
        mentionDepth: depth,
      });

      for (const subName of subMentions) {
        const subOwner = allParticipants.find((p) => p.claudeName === subName);
        if (!subOwner) continue;
        const subCallMessages: { role: "user" | "assistant"; content: string }[] = [
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
        });
      }

      return { claudeName, content: reply };
    } catch (err) {
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

  const handleSendMessage = async (content: string) => {
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
        mentions: uniqueMentions,
      });

      if (uniqueMentions.length === 0) return;

      const history = buildHistory((messages ?? []).slice(-12));
      const precedingReplies: { claudeName: string; content: string }[] = [];
      const respondedSet = new Set<string>();

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

        const callMessages: { role: "user" | "assistant"; content: string }[] = [
          ...history,
          { role: "user", content: `${currentDisplayName}: ${content}` },
        ];

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
      <main className="relative min-h-screen" style={{ background: "var(--deep-dark)" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ color: "rgba(247,245,250,0.3)" }}
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
      style={{ background: "var(--deep-dark)" }}
    >
      {/* Header */}
      <header
        className="page-topbar-margin shrink-0 flex items-center justify-between px-5 py-3 border-b"
        style={{
          borderColor: "rgba(247,245,250,0.06)",
          background: "rgba(30,24,48,0.8)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left: room info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "rgba(247,245,250,0.3)" }}>
              {onlineCount} online
            </span>
          </div>
        </div>

        {/* Right: invite + participant dots */}
        <div className="flex items-center gap-3">
          <InviteButton roomId={roomId} />
          <div className="w-px h-4" style={{ background: "rgba(247,245,250,0.1)" }} />
          <div className="flex items-center gap-1.5">
            {participants.map((p) => {
              const color = participantColors[p.userId];
              return (
                <div
                  key={p.userId}
                  title={`${p.displayName} · @${p.claudeName}${p.isOnline ? "" : " (offline)"}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-opacity"
                  style={{
                    background: color?.bg ?? "rgba(255,255,255,0.06)",
                    border: `1px solid ${color?.text ?? "#fff"}22`,
                    opacity: p.isOnline ? 1 : 0.4,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: p.isOnline
                        ? (color?.text ?? "#fff")
                        : "rgba(255,255,255,0.2)",
                    }}
                  />
                  <span style={{ color: color?.text ?? "var(--off-white)" }}>
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
            <p className="text-sm" style={{ color: "rgba(247,245,250,0.25)" }}>
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
        style={{ borderColor: "rgba(247,245,250,0.06)" }}
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
