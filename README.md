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

- 🔑 **BYOK** — API keys stay in `localStorage`, never touching our server.
- 🖼️ **Multimodal support** — Upload images and PDFs directly into the chat for Claude's analysis.
- 🤖 **Named Claude personas** — Each user configures their Claude's name and system prompt.
- 💬 **@Mention routing** — `@NaeClaude` or `@AshleyClaude` triggers the correct context.
- 🔄 **Sequential-aware dual responses** — When both Claudes are mentioned, the second sees the first's reply.
- 🧠 **Claude Memory** — Per-user, per-Claude persistent memory summaries that bridge sessions.
- 🔌 **MCP Server Support** — Support for multiple Model Context Protocol servers for tools and context.
- 📇 **Personal Context** — Layered identity injection from personal-context MCP servers.
- 🤝 **Social Layer** — Friend system, room invites, and a dashboard for managing active rooms.
- ⚡ **Real-time sync** — Powered by Convex reactive queries for zero-latency updates.

---

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2.1 (App Router) | Standard for ADHDesigns |
| UI Logic | React 19.2.4 | Modern hooks and concurrent rendering |
| Styling | Tailwind CSS 4 | Native CSS tokens and performance |
| Database | Convex 1.34.1 | Reactive queries = real-time without sockets |
| Auth | Clerk 7.0.7 | Secure session and identity management |
| AI | Anthropic API (`claude-sonnet-4-6`) | BYOK, client-side browser access |
| Hosting | Vercel | Scalable platform |

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

## Project Structure

```
chatos/
├── app/
│   ├── dashboard/            # Active rooms, friends list, invites
│   ├── room/[roomId]/
│   │   └── page.tsx          # Main chat engine + AI orchestration
│   ├── join/[roomId]/
│   │   └── page.tsx          # Join flow (persona config, key check)
│   └── settings/             # Persistent API key storage
├── components/
│   ├── MentionInput.tsx      # Multi-line input with @autocomplete
│   ├── MessageBubble.tsx     # Multimodal message rendering
│   └── UserSync.tsx          # Clerk -> Convex identity sync
├── convex/
│   ├── friends.ts            # Friend requests and presence
│   ├── invites.ts            # Room invitations
│   ├── messages.ts           # Storage, search, and message flow
│   ├── rooms.ts              # Room management + Claude Memory logic
│   └── schema.ts             # 8-table relational schema
└── lib/
    ├── claude.ts             # Anthropic SDK wrapper
    └── personalContext.ts    # Layer 1/2 MCP integration logic
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** matching `package.json`
- **pnpm** (preferred) or `npm`
- A **Convex** account (free tier works)
- A **Clerk** account for authentication

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/lmdrew96/chatos
cd chatos

# Install dependencies
pnpm install
```

### 3. Backend Setup
```bash
# Initialize Convex (this will open a browser tab to create a project)
npx convex dev
```
Convex will generate a `.env.local` with your backend URL.

### 4. Authentication Setup
- Create a Clerk application.
- Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env.local`.
- Copy your Clerk JWT Issuer URL to `convex/auth.config.ts`.

### 5. Running Locally
```bash
npm run dev
```

### 6. Final Step (BYOK)
Open the app, go to **Settings**, and enter your **Anthropic API Key**. It is stored in your browser's `localStorage` and never sent to the Cha(t)os backend.

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

🧪 **Prototype complete** — Core @mention routing and sequential AI validated.

🖼️ **Multimodal Support Live** — Claude analyzes images and PDFs in real-time.

⚡ **Prompt Caching Live** — History blocks are tagged for Anthropic prompt caching.

🤝 **Social & Persistence Live** — Friend system, room invites, and persistent memories are fully functional.

🔨 **MVP Polish phase**
