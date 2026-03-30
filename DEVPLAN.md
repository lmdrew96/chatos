# Cha(t)os — Development Plan

> Popsicle-stick-and-glue MVP. Ship first, polish later.

---

## Guiding Principles

- **Client-side API keys only** — never stored, never logged, never sent to our server
- **Convex handles all real-time** — no manual websocket logic
- **Owner-pays model** — Claude's owner's key is always used for their Claude's responses
- **Sequential-aware dual Claude responses** — second Claude sees first Claude's reply

---

## Phase 0: Project Setup ✅

- [x] `npx create-next-app@latest chatos --typescript --app`
- [x] Install Convex: `npm install convex`
- [x] `npx convex dev` — initialized Convex project (`dev:tangible-dolphin-838`)
- [x] Install Anthropic SDK: `npm install @anthropic-ai/sdk`
- [x] Connect to Vercel for deployment
- [x] Set up `.env.local` with `NEXT_PUBLIC_CONVEX_URL`
- [x] Install Clerk: `npm install @clerk/nextjs @clerk/themes`

---

## Phase 1: Convex Schema + Data Layer ✅

### Schema (`convex/schema.ts`) — Implemented

All tables from the original spec plus additional tables added during development:

```typescript
// Core tables (original spec)
rooms       — roomCode, createdAt | index: by_code
participants — roomId, userId, tokenIdentifier, displayName, claudeName, systemPrompt, isOnline | index: by_room, by_room_user
messages     — roomId, fromUserId, fromDisplayName, type, claudeName, ownerUserId, content, mentions, createdAt | index: by_room

// Added during development
users           — tokenIdentifier, username, displayName, isOnline | index: by_token, by_username
friendRequests  — fromId, toId, status (pending/accepted/declined) | indexes for both directions
roomInvites     — roomId, fromId, toId, status | indexes for recipient and sender
```

### Mutations + Queries — All Implemented

**`convex/rooms.ts`:**
- `createRoom()` → generates room code, returns roomId
- `joinRoom(roomCode, participant)` → adds participant to room
- `getRoomById()`, `getRoomByCode()` → room lookups
- `setOnlineStatus()` → presence updates within a room
- `useParticipants(roomId)` → reactive participant list

**`convex/messages.ts`:**
- `sendMessage(roomId, message)` → stores message
- `useMessages(roomId)` → reactive query (auto-updates all clients)

**`convex/users.ts`:**
- `upsertUser()` → Clerk→Convex sync on auth
- `updatePresence()` → global online/offline tracking
- `getMe()`, `getUserByUsername()` → user lookups

**`convex/friends.ts`:**
- `sendFriendRequest()`, `respondToFriendRequest()`, `cancelFriendRequest()`
- `getIncomingRequests()`, `getOutgoingRequests()`, `getFriends()`
- Auto-accept if both users request each other

**`convex/invites.ts`:**
- `sendRoomInvite()`, `respondToRoomInvite()`
- `getPendingInvites()` → drives notification bell
- Deduplication guard (no duplicate pending invites)

**`convex/dashboard.ts`:**
- `getFriendsWithPresence()` → friends list with online dots
- `getMyRooms()` → recent rooms + last message + participant count

---

## Phase 2: Join Flow ✅

**Routes:** `/` (room creation) and `/join/[roomId]`

**Form fields — implemented:**
1. Display name
2. Claude name — auto-suggests `[YourName]Claude`
3. Claude personality (system prompt textarea) — 3 starter templates: "Devil's Advocate", "Hype Machine", "Ruthless Editor"
4. Anthropic API key check — shows warning if not set; links to `/settings`
5. **[Advanced]** Personal Context MCP URL (Layer 1)
6. **[Advanced]** Additional MCP servers, add/remove (Layer 2)
7. **[Advanced]** Context seed textarea (Layer 3)

Advanced section is **collapsed by default** so first-time users aren't overwhelmed.

**On submit:**
- API key read from `localStorage` (`chatos:apiKey`)
- userId (UUID) stored in `sessionStorage`
- Display name, Claude name, MCP servers stored in `sessionStorage`
- Participant written to Convex (no API key)
- Redirect to `/room/[roomId]`

**Room creation (`/`):**
- "Create a new room" button calls `createRoom()`, redirects to `/join/[roomId]`
- Share link shown after creation

**API key management (`/settings`):**
- `localStorage` key: `chatos:apiKey`
- Password input with set/clear
- Security note: "Stored only in this browser"

---

## Phase 3: Chat UI ✅

**Route:** `/room/[roomId]`

### Components

**`app/room/[roomId]/page.tsx`** — main chat room:
- Loads messages via `useMessages(roomId)` (reactive)
- Loads participants via `useParticipants(roomId)`
- Participant color palette (6 colors, assigned by join order)
- Online participant count in header
- Auto-scroll to latest message
- "Thinking" bounce animation while Claude generates
- Session restoration from `sessionStorage` (redirects if no userId)
- Online status tracking via `beforeunload` event

**`components/MessageBubble.tsx`:**
- `type === "system"` → centered dim text
- `type === "user"` → sender's color, left/right aligned based on current user
- `type === "claude"` → Claude's owner color, robot icon, Claude name label, left-aligned

**`components/MentionInput.tsx`:**
- `@` trigger → dropdown of Claude names
- Arrow keys + Tab/Enter to select, Escape to cancel
- `Enter` to send, `Shift+Enter` for newline
- "Sending as [YourName]" indicator

**`components/TopBar.tsx`:**
- Navigation bar with logo, account button, settings link
- Used across all pages

**`components/InviteButton.tsx`:**
- Share room link / invite friends from within a room

**`components/NotificationBell.tsx`:**
- Shows pending room invite count
- Accessible from top bar

---

## Phase 4: Claude Response Orchestration ✅

Lives in `app/room/[roomId]/page.tsx` (client-side only).

**`handleSendMessage()` flow:**
1. Parse `@mentions` from content
2. Store user message in Convex
3. Build shared history from last 12 messages (consecutive same-role messages collapsed)
4. Sequential Claude responses — each Claude sees preceding replies:

```typescript
for (const claudeName of mentions) {
  const owner = participants.find(p => p.claudeName === claudeName);
  const apiKey = localStorage.getItem("chatos:apiKey"); // owner's key

  const callMessages = [...history, { role: "user", content: `${sender}: ${content}` }];

  if (precedingReplies.length > 0) {
    callMessages.push({
      role: "user",
      content: `(You were also mentioned. Note that ${context} — respond to them or the original message, your call.)`,
    });
  }

  const reply = await callClaude({ apiKey, systemPrompt: owner.systemPrompt, messages: callMessages, mcpServers: owner.mcpServers });
  await sendMessage({ ..., type: "claude", claudeName, content: reply });
  precedingReplies.push({ claudeName, content: reply });
}
```

**`lib/claude.ts`** — Anthropic API client:
- Direct browser calls to `https://api.anthropic.com/v1/messages`
- Header: `anthropic-dangerous-direct-browser-access: true` (intentional BYOK)
- Model: `claude-sonnet-4-6`
- Max tokens: 1024
- `mcp_servers` parameter passed when provided (Layer 2)

**`lib/personalContext.ts`** — Personal Context MCP client:
- `fetchPersonalContext(mcpUrl)` — fetches from `{mcpUrl}/context`
- `buildContextPrefix(claudeName, userName, ctx)` — formats context into system prompt prefix
- Called at join time, result prepended to system prompt

---

## Phase 5: Online Presence ✅

- On join: `setOnlineStatus(true)` in room, `updatePresence(true)` globally
- On tab close / disconnect: `setOnlineStatus(false)` via `beforeunload`
- Displayed in:
  - Dashboard → green dot for online friends
  - Room header → "N online" count
  - Participant list → opacity shift for offline users

---

## Phase 6: Authentication & Social Layer ✅

> _Added beyond original spec — required for friend invites and dashboard._

**Clerk integration:**
- `@clerk/nextjs` ^7.0.7 with dark theme
- `ClerkProvider` wraps app in layout
- Custom Clerk domain: `clerk.chatos.adhdesigns.dev`
- `convex/auth.config.ts` — Clerk JWT validation

**`components/UserSync.tsx`:**
- Syncs Clerk identity to Convex `users` table on auth change
- Stores `tokenIdentifier`, `username`, `displayName`

**`app/dashboard/page.tsx`:**
- Requires Clerk auth (redirects to sign-in otherwise)
- Friends list with online presence dots
- Recent rooms with last message preview + participant count
- New room + Add friends CTAs

**`app/friends/page.tsx`:**
- Send/accept/decline friend requests by username
- View incoming and outgoing pending requests

---

## Phase 7: Polish ✅ / 🔲 In Progress

| Feature | Status |
|---|---|
| System prompt starter templates (3 built-in) | ✅ Done |
| "Thinking" indicator for Claude responses | ✅ Done |
| Online presence indicators | ✅ Done |
| Copy/share room link | ✅ Done (InviteButton) |
| Personal Context MCP (Layer 1) | ✅ Done |
| MCP passthrough (Layer 2) | ✅ Done |
| Context seed (Layer 3) | ✅ Done |
| API key settings page | ✅ Done |
| Friend system + room invites | ✅ Done |
| ADHDesigns brand design system | ✅ Done |
| Message timestamps | 🔲 Not yet (createdAt exists, not displayed) |
| Room expiry / cleanup | 🔲 Not yet |
| Reconnect / rejoin flow (lost API key) | 🔲 Not yet |
| Error handling for invalid/expired API keys | 🔲 Partial (basic error messages) |
| `@everyone` shorthand | 🔲 Not yet |
| Show more for long Claude responses | 🔲 Not yet |
| Mobile responsive refinement | 🔲 Partial |
| Duplicate Claude name validation at join | 🔲 Not yet |

---

## Known Edge Cases to Handle

| Scenario | Status | Handling |
|---|---|---|
| User closes tab (API key lost) | 🔲 | Prompt to re-enter key on rejoin |
| API key is invalid | 🔲 Partial | Basic error shown; should surface only to that user |
| Mentioned Claude, owner offline | 🔲 | Skip offline Claude, surface system message |
| Very long Claude response | 🔲 | Truncate with "show more" |
| Duplicate Claude name at join | 🔲 | Validate uniqueness before submitting |
| MCP server unreachable | ✅ | Error state shown in join form, Layer 2 skipped gracefully |
| Personal Context MCP URL invalid | ✅ | Validation with ok/error states before submit |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| React | 19.2.4 |
| Styling | Tailwind CSS 4 + ADHDesigns CSS tokens |
| Real-time DB | Convex 1.34.1 |
| Auth | Clerk (`@clerk/nextjs` ^7.0.7) |
| AI | Anthropic SDK (`@anthropic-ai/sdk` ^0.80.0) |
| Language | TypeScript |

---

## Environment

```
Convex deployment: dev:tangible-dolphin-838 (team: lmdrew)
Convex URL:        https://tangible-dolphin-838.convex.cloud
Clerk domain:      clerk.chatos.adhdesigns.dev
```

Env vars in `.env.local`:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `CLERK_FRONTEND_API_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
