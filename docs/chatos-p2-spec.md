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

## P2-B: Hybrid Memory Optimization — Pre-fetch + Slim MCP + Native Scratchpad

### Problem

MCP-based memory is the single biggest token cost after message history. Every request pays ~3,000-4,000 tokens just for MCP tool definitions (even when Claude doesn't call them), plus another 1,000-3,000 tokens when Claude reads memory via a tool call. And since memory reads happen as tool results mid-conversation, they don't survive compaction.

### Applies to

**Both Claudiu AND user Claudes (via the P2-A proxy).** Every server-side route that calls the Anthropic API can benefit from this pattern. The only difference is which PCTX endpoint gets fetched:
- **Claudiu:** known helper/room PCTX endpoints (from env vars or Convex config)
- **User Claudes (via proxy):** the user's PCTX URL (from their profile in Convex)

### Solution: Three-part hybrid

#### Part 1: Pre-fetch memory server-side, inject into system prompt

Instead of Claude calling an MCP tool to read memory (on-demand, costs tool-call tokens, doesn't survive compaction), the server fetches memory *before* calling Claude and injects it as a block in the system prompt.

**Flow (for all server-side routes):**
```
Request arrives
        ↓
Server resolves PCTX URL(s) for this Claude instance
        ↓
Server fetches GET /context from the PCTX MCP endpoint (server-to-server)
        ↓
Server formats the response as a compact text block
        ↓
Server injects it into the STATIC part of the system prompt (gets cached!)
        ↓
Server calls Anthropic SDK as usual
```

**Format the memory block for minimal tokens:**
```typescript
function formatMemoryBlock(context: PctxContext): string {
  const parts: string[] = [];
  if (context.identity) {
    parts.push(`Identity: ${context.identity.name} (${context.identity.pronouns})`);
  }
  if (context.projects?.length) {
    const active = context.projects
      .filter(p => p.status?.toLowerCase().includes('active'))
      .map(p => `${p.name}: ${p.status}`)
      .join('; ');
    if (active) parts.push(`Active projects: ${active}`);
  }
  if (context.relationships?.length) {
    parts.push(`Key people: ${context.relationships.map(r => `${r.name} (${r.role})`).join(', ')}`);
  }
  if (context.preferences?.length) {
    parts.push(`Preferences: ${context.preferences.join('; ')}`);
  }
  return `<memory>\n${parts.join('\n')}\n</memory>`;
}
```

This produces a ~300-500 token block vs 3,000-4,000 for MCP tool definitions alone. And because it's in the static system prompt, it gets cached by automatic caching — subsequent messages in the same conversation pay ~0 for it.

**Where to put it in the system prompt:**
```typescript
system: `${roomPrompt}\n\n${memoryBlock}\n\n---\n${multiAgentRules}\n\n${dynamicContext}`
```

Memory goes in the static prefix (cached). Dynamic context stays at the end (uncached but small).

#### Part 2: Drop read MCP tools, keep only a single write tool

Currently, the PCTX MCP exposes 6+ tools (get_context, add_project, update_project, add_relationship, etc.). Each tool definition costs tokens. Since reads are now pre-fetched, the only MCP tools Claude needs are for *writing*.

**Reduce to a single general-purpose write tool:**

Either:
- **Option A:** Use MCP `tool_configuration.allowed_tools` (from the SDK) to whitelist only write tools, hiding the read tools from Claude
- **Option B:** Add a single `pctx_save_note` tool to the PCTX MCP that accepts freeform text (Claude writes what it wants to remember; a background process or the next pre-fetch picks it up)

**Recommendation: Option A** — no MCP server changes needed. Just filter at the SDK level:
```typescript
mcp_servers: [{
  type: 'url',
  url: pctxUrl,
  name: 'personal-context',
  tool_configuration: {
    enabled: true,
    allowed_tools: ['pctx_update_project', 'pctx_add_relationship', 'pctx_update_context']
  }
}]
```

This keeps write capability (Claude can still update memory during conversation) while eliminating the token cost of read tool definitions.

#### Part 3: Native memory as compaction-safe scratchpad

Add `memory_20250818` for session-level facts that should survive compaction. This is NOT a replacement for PCTX — it's a lightweight scratchpad for the *current conversation*.

**What goes in the scratchpad:**
- Current topic/thread being discussed
- Who's actively participating and their stances
- Decisions made this session
- Action items or commitments

**What stays in PCTX (pre-fetched):**
- Identity, projects, relationships
- Long-term preferences and context
- Cross-session facts

**Implementation:**
```typescript
tools: [
  { type: 'memory_20250818', name: 'memory' },
  // ... other tools
],
betas: ['context-management-2025-06-27'],
```

The app needs to handle memory tool calls in the response (persist scratchpad to Convex, keyed by room ID). On subsequent requests in the same room, inject the scratchpad content so it's available even after compaction clears old messages.

### Token impact

| Component | Before (MCP only) | After (hybrid) |
|---|---|---|
| MCP tool definitions (reads) | ~2,000-3,000 | 0 (reads removed) |
| MCP tool definitions (writes) | ~500-1,000 | ~500-1,000 (kept) |
| MCP read results per invocation | ~500-1,000 | 0 (pre-fetched instead) |
| Memory in system prompt | 0 | ~300-500 (cached after first request!) |
| Native memory scratchpad | 0 | ~100 (built-in, minimal) |
| **Total per request** | **~3,000-5,000** | **~600-1,600** |
| **Savings** | | **~2,400-3,400 tokens/request** |

Over a 40-message room conversation, that's potentially **96,000-136,000 fewer tokens**.

### Implementation order within P2-B

1. **Pre-fetch + inject** — biggest savings, lowest risk. Just a server-side fetch + string formatting.
2. **Slim MCP tools** — add `tool_configuration.allowed_tools` to hide read tools. One-line change per route.
3. **Native scratchpad** — more complex (needs Convex persistence layer for scratchpad files). Do this last, and only after confirming compaction is actually losing important session context.

### Server-side fetch considerations

- The PCTX MCP endpoint is on Vercel, so latency is low (~100-200ms)
- Add a reasonable timeout (2 seconds) — if PCTX is down, proceed without memory rather than blocking the response
- Consider caching the fetched context for 60 seconds per user to avoid redundant fetches on rapid-fire messages in the same room

---

## Implementation Order (Full P2)

1. **P2-A: BYOK server proxy** — security + feature parity. Must ship first since P2-B depends on server-side routes.
2. **P2-B Part 1: Pre-fetch memory** — apply to all three server routes (Claudiu onboarding, Claudiu room, BYOK proxy). Biggest token savings.
3. **P2-B Part 2: Slim MCP tools** — add `allowed_tools` filtering. Quick follow-up.
4. **P2-B Part 3: Native scratchpad** — only after observing compaction in production for 1-2 weeks to confirm session context loss is a real problem.

---

## Future Work (P3+)

- **Deprecate non-accountholder BYOK** — once all active users have saved keys, remove the direct browser call path and `anthropic-dangerous-direct-browser-access` entirely
- **Image resize pipeline** — server-side resizing (from original P3 list)
- **Stale MCP tool-result clearing** — clear old tool results from context (from original P3 list)
- **PCTX relationship CRUD** — add `pctx_update_relationship` and `pctx_delete_relationship` (patch already filed in ChaosPatch)
