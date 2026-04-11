# CLAUDE.md — Cha(t)os

> Multi-user, multi-Claude shared chat room. BYOK (Bring Your Own Key).
> Live at [chatos.adhdesigns.dev](https://chatos.adhdesigns.dev)

## Project Overview

Cha(t)os is a real-time group chat where each user brings their own Claude instance (API key, persona name, system prompt) into a shared room. Claudes respond via `@mention` routing. When multiple Claudes are mentioned, they respond sequentially — each seeing prior replies.

**Owner-pays model**: The Claude owner's API key is always used, regardless of who sends the message.

## Tech Stack

- **Framework**: Next.js (App Router) + React + TypeScript
- **Styling**: Tailwind CSS 4 with ADHDesigns design tokens
- **Database**: Convex (reactive real-time queries)
- **Auth**: Clerk (`@clerk/nextjs`)
- **AI**: Anthropic API via direct browser calls (`claude-sonnet-4-6`)
- **Hosting**: Vercel
- **Package manager**: pnpm

## Project Structure

```
app/
  dashboard/          # Rooms list, friends, invites
  room/[roomId]/      # Main chat engine + Claude orchestration
  join/[roomId]/      # Join flow (persona config, key check)
  settings/           # API key management
components/
  MentionInput.tsx    # @autocomplete multi-line input
  MessageBubble.tsx   # Multimodal message rendering (text, images, PDFs)
  UserSync.tsx        # Clerk → Convex identity sync
  TopBar.tsx          # Navigation bar
  InviteButton.tsx    # Share room / invite friends
  NotificationBell.tsx # Pending invite count
convex/
  schema.ts           # 8-table relational schema
  rooms.ts            # Room CRUD + Claude Memory logic
  messages.ts         # Message storage + reactive queries
  users.ts            # Clerk sync + presence
  friends.ts          # Friend requests (auto-accept mutual)
  invites.ts          # Room invitations with dedup guard
  dashboard.ts        # Friends with presence + recent rooms
  apiKeys.ts          # Server-side API key storage (keyed by tokenIdentifier)
  auth.config.ts      # Clerk JWT validation
lib/
  claude.ts           # Anthropic SDK wrapper (browser-direct, BYOK)
  personalContext.ts  # Personal Context MCP integration (Layer 1/2/3)
```

## Convex Guidelines

**Always read `convex/_generated/ai/guidelines.md` first** when working on Convex code. It contains rules that override training data assumptions about Convex APIs and patterns.

Install Convex agent skills: `npx convex ai-files install`

## Key Architecture Decisions

- **API keys are stored server-side** in Convex's `apiKeys` table, keyed by `tokenIdentifier`. They are NOT in `localStorage` (despite README saying so — the DEVPLAN is authoritative).
- **Claude calls happen client-side** via `anthropic-dangerous-direct-browser-access: true` header. This is intentional for BYOK.
- **Message history**: Last 12 messages sent to Claude, with consecutive same-role messages collapsed.
- **Prompt caching**: History blocks are tagged for Anthropic prompt caching (live).
- **Sequential dual-Claude**: When 2+ Claudes are `@mentioned`, each subsequent Claude receives all preceding replies as context.
- **Personal Context MCP**: Three layers — Layer 1 (personal-context MCP URL), Layer 2 (additional MCP servers), Layer 3 (context seed textarea). All optional, collapsed in join form.
- **Key Sponsorship**: The `keySponsors` table lets one user's API key serve as a fallback for another. When a Claude call fails with a billing/credit error, the system automatically retries with the sponsor's key. Managed via `addKeySponsor`/`removeKeySponsor` mutations in `convex/apiKeys.ts`. Currently used to sponsor Ashley's Claude usage.

## ADHDesigns Design Tokens

```
Olive:          #849440
Deep Teal:      #244952
Amber:          #DFA649
Mauve Purple:   #88739E
Sage Teal:      #8CBDB9
Soft Green:     #97D181
Lavender Mist:  #DBD5E2
Off White:      #F7F5FA
Deep Dark:      #1E1830
```

## Commands

```bash
pnpm install          # Install dependencies
npm run dev           # Start dev server (Next.js + Convex)
npx convex dev        # Run Convex dev backend
npx convex deploy     # Deploy Convex backend (after changes)
npx tsc --noEmit      # Type-check — no output means clean build
```

## Environment Variables

Required in `.env.local`:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `CLERK_FRONTEND_API_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Convex deployment: `prod:notable-goat-815`

## Workflow Rules

### After Every Commit
- **Mark completed patches as done** in ChaosPatch. If the commit resolves a tracked patch, call `cp_complete_patch` immediately. Do not leave resolved patches open.

### After Every New Feature/Fix That Touches Claude API Calls
- **Audit for token efficiency.** Review:
  - System prompt size — is anything redundant or bloated?
  - History window — are we sending more messages than needed?
  - Context injection (MCP layers) — is the payload lean?
  - Response `max_tokens` — is 1024 still appropriate or should it be dynamic?
  - Prompt caching — are cache breakpoints still optimal after the change?
- Document any token cost concerns in the commit message or a ChaosPatch note.

### General
- Keep Claude orchestration logic in `app/room/[roomId]/page.tsx` (client-side only).
- Keep Anthropic API wrapper thin — `lib/claude.ts` should not accumulate business logic.
- Convex mutations/queries should be small and focused. No god-functions.
- Use the ADHDesigns color tokens — don't hardcode hex values in components.
- Test `@mention` routing with 2+ Claudes when changing message flow.

### Listening Rule
When Nae gives a specific implementation approach, USE IT FIRST. Do not iterate
through "cleverer" alternatives. If she says "do it the same way X does it,"
go read how X does it and replicate that approach. Ask clarifying questions if
needed, but do not substitute your own strategy when a direct instruction has
been given. Getting it right in one commit > four "fix:" commits.