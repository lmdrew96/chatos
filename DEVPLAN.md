# Cha(t)os — Development Plan

> Popsicle-stick-and-glue MVP. Ship first, polish later.

---

## Guiding Principles

- **Client-side API keys only** — never stored, never logged, never sent to our server
- **Convex handles all real-time** — no manual websocket logic
- **Owner-pays model** — Claude's owner's key is always used for their Claude's responses
- **Sequential-aware dual Claude responses** — second Claude sees first Claude's reply

---

## Phase 0: Project Setup

- [ ] `npx create-next-app@latest chatos --typescript --app`
- [ ] Install Convex: `npm install convex`
- [ ] `npx convex dev` — initialize Convex project
- [ ] Install Anthropic SDK: `npm install @anthropic-ai/sdk`
- [ ] Connect to Vercel for deployment
- [ ] Set up `.env.local` with `NEXT_PUBLIC_CONVEX_URL`

---

## Phase 1: Convex Schema + Data Layer

### Schema (`convex/schema.ts`)

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    roomCode: v.string(),         // Short invite code (e.g. "chaos-42")
    createdAt: v.number(),
  }).index("by_code", ["roomCode"]),

  participants: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),           // Client-generated UUID, stored in sessionStorage
    displayName: v.string(),      // e.g. "Nae"
    claudeName: v.string(),       // e.g. "NaeClaude"
    systemPrompt: v.string(),     // Claude persona configuration
    isOnline: v.boolean(),
  }).index("by_room", ["roomId"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    fromUserId: v.string(),
    fromDisplayName: v.string(),
    type: v.union(v.literal("user"), v.literal("claude"), v.literal("system")),
    claudeName: v.optional(v.string()),   // Which Claude sent this (if type === "claude")
    ownerUserId: v.optional(v.string()),  // Claude's owner (for billing attribution)
    content: v.string(),
    mentions: v.array(v.string()),        // Claude names mentioned in this message
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),
});
```

### Mutations + Queries (`convex/messages.ts`, `convex/rooms.ts`)

- `createRoom()` → generates room code, returns roomId
- `joinRoom(roomCode, participant)` → adds participant to room
- `sendMessage(roomId, message)` → stores message
- `useMessages(roomId)` → reactive query (auto-updates all clients)
- `useParticipants(roomId)` → reactive query for online users + their Claude configs

---

## Phase 2: Join Flow

**Route:** `/join/[roomId]`

**Form fields:**
1. Your name (display name)
2. Your Claude's name (e.g. "NaeClaude") — auto-suggests `[YourName]Claude`
3. Your Claude's personality (system prompt textarea) — include starter templates
4. Your Anthropic API key — `type="password"`, stored in `sessionStorage` only, never in Convex

**On submit:**
- Store API key in `sessionStorage`
- Store userId (UUID) in `sessionStorage`
- Write participant to Convex (no API key)
- Redirect to `/room/[roomId]`

**Room creation (`/`):**
- Button: "Create a new room"
- Calls `createRoom()`, redirects to `/join/[roomId]`
- Share link shown after creation

---

## Phase 3: Chat UI

**Route:** `/room/[roomId]`

### Components

**`ChatRoom.tsx`**
- Loads messages via `useMessages(roomId)` (reactive — auto-updates)
- Loads participants via `useParticipants(roomId)`
- Renders message list
- Renders `MentionInput` at bottom
- Handles Claude response orchestration

**`MessageBubble.tsx`**

Props: `message`, `participants`

Render logic:
- `type === "system"` → centered dim text
- `type === "user"` → colored by sender, aligned left/right based on current user
- `type === "claude"` → Claude's owner color (slightly different shade), robot icon, Claude name label

**`MentionInput.tsx`**
- Textarea with `@` autocomplete
- Detects `@` trigger → shows dropdown of Claude names from `useParticipants`
- `Enter` to send, `Shift+Enter` for newline
- Shows "sending as [YourName]" indicator

---

## Phase 4: Claude Response Orchestration

This logic lives in `ChatRoom.tsx` (client-side only — API keys never leave the client).

```typescript
const handleSendMessage = async (content: string) => {
  // 1. Parse @mentions from content
  const mentions = detectMentions(content, participants);
  
  // 2. Store user message in Convex
  await sendMessage({ roomId, content, type: "user", mentions, ... });

  if (mentions.length === 0) return;

  // 3. Build shared history from last 12 messages
  const history = buildHistory(messages.slice(-12));

  // 4. Sequential Claude responses (aware of preceding replies)
  const precedingReplies: { claudeName: string; content: string }[] = [];

  for (const claudeName of mentions) {
    const owner = participants.find(p => p.claudeName === claudeName);
    if (!owner) continue;

    // Get this owner's API key from sessionStorage
    const apiKey = sessionStorage.getItem(`apiKey_${owner.userId}`);
    if (!apiKey) continue;

    // Build messages array
    const callMessages = [
      ...history,
      { role: "user", content: `${currentUser.displayName}: ${content}` },
    ];

    // Inject preceding Claude reply if exists
    if (precedingReplies.length > 0) {
      const context = precedingReplies
        .map(r => `[${r.claudeName} just responded]: "${r.content}"`)
        .join("\n");
      callMessages.push({
        role: "user",
        content: `(You were also mentioned. Note that ${context} — respond to them or the original message, your call.)`,
      });
    }

    // Call Anthropic API
    const reply = await callClaude({
      apiKey,
      systemPrompt: owner.systemPrompt,
      messages: callMessages,
    });

    // Store Claude response in Convex
    await sendMessage({
      roomId,
      content: reply,
      type: "claude",
      claudeName,
      ownerUserId: owner.userId,
      mentions: [],
    });

    precedingReplies.push({ claudeName, content: reply });
  }
};
```

**`lib/claude.ts`** — thin wrapper:
```typescript
export async function callClaude({ apiKey, systemPrompt, messages }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "...";
}
```

> **Note:** The `anthropic-dangerous-direct-browser-access` header is required for direct browser API calls. This is intentional — it's the BYOK model.

---

## Phase 5: Online Presence

- On join: set `isOnline: true` in Convex
- On tab close / disconnect: set `isOnline: false`
- Use `useEffect` cleanup + `beforeunload` event
- Show online indicators next to participant names in header

---

## Phase 6: Polish (Post-MVP)

- [ ] System prompt starter templates (e.g. "Devil's Advocate", "Hype Machine", "Ruthless Editor")
- [ ] Typing indicators ("NaeClaude is thinking...")
- [ ] Room expiry / cleanup
- [ ] Mobile responsive layout
- [ ] Copy room link button
- [ ] Message timestamps
- [ ] Reconnect / rejoin flow if API key is lost from sessionStorage
- [ ] Error handling for invalid/expired API keys (surface clearly to the correct user)
- [ ] `@everyone` shorthand to ping all Claudes

---

## Known Edge Cases to Handle

| Scenario | Handling |
|---|---|
| User closes tab (API key lost) | Prompt to re-enter key on rejoin |
| API key is invalid | Show error only to that user, not the whole room |
| Both Claudes mentioned, one owner offline | Skip offline Claude, note in system message |
| Very long Claude response | Truncate display with "show more" |
| Same Claude name entered by two users | Validate uniqueness on join |

---

## Prompt for Claude Code

> Hey! I'm building **Cha(t)os** — a real-time group chat app where multiple users bring their own Claude AI instance (with their own API key and custom persona) into a shared room. Read the README and this dev plan, then let's start with **Phase 0 and Phase 1**. Set up the Next.js project, install Convex, and implement the schema. I'm using TypeScript throughout. Ask me before making any decisions that aren't covered in the docs.
