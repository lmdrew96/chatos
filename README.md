# Cha(t)os

> A shared AI workspace where multiple users bring their own Claude into the same conversation.

**Cha(t)os** is a real-time group chat application where each user configures their own Claude instance — with their own API key, name, and personality — and participates alongside other users and their Claudes in a shared room. Think of it as a collaborative AI workspace where your Claude advocates for you.

---

## Concept

Traditional AI chat is 1:1. Cha(t)os is N:N.

Each user brings:
- Their own **Anthropic API key** (Bring Your Own Key / BYOK)
- Their own **Claude persona** — a name and system prompt that defines their Claude's personality and role
- Their own **identity** in the shared chat

Multiple users and multiple Claudes exist in the same thread. Claudes are addressed via `@mention`. When two Claudes are mentioned in the same message, the second Claude sees the first Claude's response before replying — enabling genuine AI-to-AI dialogue.

---

## Core Features (MVP)

- 🔑 **BYOK** — API keys stay client-side, never touch the server
- 🤖 **Named Claude personas** — each user configures their Claude's name and system prompt
- 💬 **@mention routing** — `@NaeClaude` or `@AshleyClaude` triggers the correct Claude
- 🔄 **Sequential-aware dual responses** — when both Claudes are @mentioned, the second sees the first's reply
- ⚡ **Real-time sync** — all users see messages as they arrive via Convex reactive queries
- 🏠 **Room-based** — users join a shared room via a link or room code
- 💸 **Owner-pays billing model** — the Claude's owner always pays for their Claude's responses, regardless of who @mentions them

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Standard for ADHDesigns projects |
| Database + Realtime | Convex | Reactive queries = real-time without manual websocket wiring |
| Auth | Convex Auth or Clerk | Simple session management for room participants |
| AI | Anthropic API (claude-sonnet-4-20250514) | BYOK, client-side calls |
| Hosting | Vercel | Standard deployment |
| Language | TypeScript | Standard for ADHDesigns projects |

---

## How It Works

### Billing Model
The **Claude's owner always pays**, regardless of who sends the message.

| Action | Who pays |
|---|---|
| Nae @NaeClaude | Nae's key |
| Ashley @NaeClaude | Nae's key (NaeClaude = Nae's Claude) |
| Ashley @AshleyClaude | Ashley's key |
| Nae @AshleyClaude | Ashley's key (AshleyClaude = Ashley's Claude) |

### Conversation Context
Every Claude API call receives:
1. The Claude's system prompt (its configured personality)
2. The last 12 messages of shared conversation history
3. *(If applicable)* The preceding Claude's response in the same message round

### @Mention Routing
- Messages are scanned for `@ClaudeName` patterns
- Only mentioned Claudes respond
- If no Claude is mentioned, the message is stored but no AI response is triggered
- The `@` autocomplete dropdown shows available Claudes in the room

---

## Room Model

A **room** contains:
- Room ID / invite code
- List of participants (each with: display name, Claude name, Claude system prompt)
- Message history (stored in Convex)
- API keys are **never stored** — held in client memory only for the session

---

## Project Structure (Planned)

```
chatos/
├── app/
│   ├── page.tsx              # Landing / room creation
│   ├── room/[roomId]/
│   │   └── page.tsx          # Main chat interface
│   └── join/[roomId]/
│       └── page.tsx          # Join flow (enter name, Claude config, API key)
├── components/
│   ├── ChatRoom.tsx          # Main chat UI
│   ├── MessageBubble.tsx     # Individual message rendering
│   ├── MentionInput.tsx      # Input with @mention autocomplete
│   └── ClaudeSetup.tsx       # API key + persona configuration form
├── convex/
│   ├── messages.ts           # Message mutations + queries
│   ├── rooms.ts              # Room creation + participant management
│   └── schema.ts             # Convex schema
└── lib/
    └── claude.ts             # Anthropic API call logic (client-side)
```

---

## ADHDesigns Brand

Cha(t)os is a project under the **ADHDesigns** brand (adhdesigns.dev).

**Design tokens:**
- Olive: `#849440`
- Deep Teal: `#244952`
- Amber: `#DFA649`
- Mauve Purple: `#88739E`
- Sage Teal: `#8CBDB9`
- Soft Green: `#97D181`
- Lavender Mist: `#DBD5E2`
- Off White: `#F7F5FA`
- Deep Dark: `#1E1830`

---

## Status

🧪 **Prototype complete** — core @mention routing, dual-Claude awareness, and real-time UI validated in a Claude.ai artifact.

🔨 **MVP in active development**
