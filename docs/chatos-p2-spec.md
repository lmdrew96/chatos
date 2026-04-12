# Cha(t)os P2 Spec — BYOK Server Proxy + Memory Tool Evaluation

> **Prerequisite:** P0 (SDK migration + compaction) and P1 (prompt optimization + image limiting) are shipped.

---

## P2-A: BYOK Server-Side Proxy for Accountholders

### Problem

Currently, accountholder API keys travel: **Convex DB → client browser → Anthropic API**. This has two issues:

1. **Security** — API keys are exposed to the browser. Any user can open DevTools and see their (or their room participant's) key in the `x-api-key` header or in the Convex query response. The `anthropic-dangerous-direct-browser-access: true` header exists specifically because Anthropic discourages this pattern.

2. **Feature gap** — Client-side calls can't use the Anthropic SDK, which means no automatic compaction, no typed streaming, no built-in retries. Accountholders miss all the P0 improvements we just shipped for Claudiu.

### Solution

Create a new API route that proxies accountholder Claude calls through the server. The API key never leaves the server.

### New route: `app/api/claude/route.ts`

**Flow:**
```
Client sends: { roomId, messages, model, maxTokens, systemPrompt, mcpServers?, timezone? }
                            ↓
Server authenticates via Clerk (get userId)
                            ↓
Server fetches API key from Convex: api.apiKeys.getApiKeyForParticipant
                            ↓
Server calls Anthropic SDK with the user's key
                            ↓
Server streams SSE response back to client
```

**Key design decisions:**

1. **One SDK client per request** — instantiate `new Anthropic({ apiKey })` per request using the fetched key. Don't cache clients across requests.

2. **Compaction** — add `compactionControl: { enabled: true, contextTokenThreshold: 20000 }` matching the Claudiu room config.

3. **System prompt** — the client still constructs the system prompt (since each user's Claude has a unique persona + PCTX context). The server proxies it as-is. Import `buildMultiAgentRules()` from `lib/multi-agent-rules.ts` (the shared util from P1-A) to build the multi-agent block server-side.

4. **MCP servers** — pass through the client's MCP server config. Each user may have their own PCTX MCP URL. The server doesn't need to know or validate these — just forward them to the SDK.

5. **Image limiting** — apply the same `prepareMessages()` from P1-B (strip images from messages older than the last 5).

6. **Usage logging** — log token usage to Convex the same way Claudiu routes do, but scoped to the user's key/room.

7. **Remove `anthropic-dangerous-direct-browser-access`** — once accountholders go through the proxy, this header is no longer needed for them. Non-accountholders (client-side BYOK without saved keys) would still need it, but consider whether you even want to support that path long-term.

### Client-side changes

**In `app/room/[roomId]/page.tsx` (or wherever BYOK calls originate):**

- If the user is an accountholder (has a saved API key), call `/api/claude` instead of calling Anthropic directly via `lib/claude.ts`
- If the user is NOT an accountholder (ephemeral BYOK), keep the current `lib/claude.ts` direct-call path as a fallback
- The client no longer needs to fetch the raw API key for accountholders — it just sends the `roomId` and the server resolves the key

**Detection logic:**
```typescript
const isAccountHolder = !!savedApiKey; // or check a flag from the user's profile
if (isAccountHolder) {
  // Call /api/claude (server proxy)
} else {
  // Fall back to lib/claude.ts (direct browser call)
}
```

### What this unlocks for accountholders
- API keys never touch the browser
- Automatic context compaction (20k threshold)
- SDK retries + typed streaming
- Image history limiting (server-side)
- Same SSE streaming format the frontend already handles (from Claudiu routes)

### What stays the same
- Non-accountholder BYOK flow (direct browser calls via `lib/claude.ts`)
- Claudiu routes (already on SDK)
- User's Claude persona, system prompt, PCTX setup — all user-controlled, just proxied through the server

---

## P2-B: Native Memory Tool vs MCP Memory — Evaluation

### Overview

Anthropic now offers a **native memory tool** (`memory_20250818`, beta flag `context-management-2025-06-27`). This evaluation compares it against Cha(t)os's current MCP-based memory approach to determine if migration is worthwhile.

### Current approach: MCP-based memory

**How it works:**
- Claudiu has 2-3 MCP servers attached (room-context, helper-context, optionally personal-context)
- Each MCP server exposes `pctx_*` tools (get_context, add_project, update_project, etc.)
- Claude calls these tools on-demand during conversation
- Memory is stored externally in Neon Postgres, accessed via MCP server endpoints
- BYOK user Claudes also have MCP via their own PCTX URLs

**Strengths:**
- Fully custom schema (identity, projects, relationships, preferences)
- Multi-source (separate MCP servers for different context scopes)
- Works across both Claudiu and BYOK user Claudes
- Memory is centralized and accessible outside of Claude (via API, dashboard, etc.)
- Already built and working

**Weaknesses:**
- MCP tool definitions eat 2,000-4,000 tokens of context just from being defined
- MCP tool results eat another 1,000-3,000 tokens when invoked
- No proactive memory reading — Claude only checks memory if it decides to call the tool
- No dedup logic — Claude can write redundant entries
- No structured organization (flat key-value vs categorized files)
- Incomplete CRUD — relationships can only be added, not updated or deleted (patch filed)
- Memory does NOT survive compaction — when context gets compacted, MCP tool results from earlier turns are lost

### Native memory tool (`memory_20250818`)

**How it works:**
- Enabled via `betas: ["context-management-2025-06-27"]` and adding `{ type: "memory_20250818", name: "memory" }` to tools
- Claude gets file-like memory operations: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`
- Memory is stored as **client-managed files** — the app receives memory operations via tool calls and decides where to persist them
- Memory content is organized as markdown files in virtual directories (e.g., `/memories/user-preferences.md`)
- Designed to integrate with context clearing — memories persist while conversation history gets compacted

**Strengths:**
- Zero token overhead for tool definitions (it's a built-in tool type, not a schema you define)
- Survives compaction — memories are preserved when conversation context is cleared
- Structured markdown with categories (not flat key-value)
- Built-in file operations (str_replace, insert) enable surgical updates without rewriting
- Anthropic optimizes the integration since it's a first-party tool
- Claude knows how to use it natively without system prompt instructions

**Weaknesses:**
- Beta — API may change
- Client must implement persistence (receive memory tool calls, store/retrieve the files)
- Single-scope — no equivalent of "this MCP server is room context, that one is helper context"
- Not shareable across different Claude instances (each session gets its own memory unless the app syncs)
- Doesn't replace the PCTX system for BYOK user Claudes — their Claudes would need their own memory setup
- Would require building a memory persistence layer in the Cha(t)os backend

### Comparison matrix

| Dimension | MCP Memory (current) | Native Memory Tool |
|---|---|---|
| Context token cost | High (2-4k definitions + 1-3k results) | Low (built-in, no schema overhead) |
| Survives compaction | No | Yes |
| Multi-scope | Yes (room, helper, personal MCPs) | No (single memory space) |
| CRUD completeness | Partial (no relationship update/delete) | Full (view, create, str_replace, delete, rename) |
| Proactive reading | No (on-demand only) | Yes (designed for start-of-conversation reading) |
| Cross-instance sharing | Yes (centralized DB) | No (per-session unless app syncs) |
| Works for BYOK users | Yes (each user has their own PCTX URL) | No (would need separate implementation) |
| Persistence | Built-in (Neon DB) | App must implement |
| Stability | Production | Beta |
| Setup effort | Already done | Medium (new persistence layer + tool handling) |

### Recommendation

**Don't migrate yet. Adopt selectively.**

The native memory tool's biggest advantage — surviving compaction — is significant now that we've enabled compaction in P0-B. But a full migration would mean rebuilding the memory persistence layer AND losing the multi-scope architecture that makes Claudiu's context system work (separate room vs helper vs personal context).

**Suggested hybrid approach (future P3):**
1. Keep MCP memory as the primary system for both Claudiu and BYOK users
2. Add the native memory tool as a **compaction-safe scratchpad** for Claudiu only — a place to store key conversation facts that should survive compaction (current topic, active participants, ongoing decisions)
3. At compaction time, the scratchpad persists while old messages get summarized
4. The MCP memory remains the source of truth for structured context (identity, projects, relationships)

This gets the compaction resilience benefit without throwing away the existing system.

### If you decide to fully evaluate later

Build a prototype that:
1. Adds `{ type: "memory_20250818", name: "memory" }` to Claudiu's room chat tools
2. Implements a Convex-backed persistence layer for memory files (store as documents keyed by room + user)
3. On each `memory` tool call, intercept the operation and apply it to the stored files
4. On each new conversation, inject stored memory files into the tool's initial state
5. Compare Claudiu's behavior (context quality, token usage) over a week vs the current MCP approach

---

## Implementation Order

1. **P2-A first** — the BYOK proxy is a clear win (security + features). Spec is concrete and ready to build.
2. **P2-B: no immediate action** — the evaluation above is the deliverable. Revisit the hybrid approach after observing compaction behavior in production for 1-2 weeks.

---

## Future Work (P3+)

- **Native memory scratchpad for Claudiu** — hybrid approach described above
- **Deprecate non-accountholder BYOK** — once all active users have saved keys, remove the direct browser call path and `anthropic-dangerous-direct-browser-access` entirely
- **Image resize pipeline** — server-side resizing (from original P3 list)
- **Stale MCP tool-result clearing** — clear old tool results from context (from original P3 list)
