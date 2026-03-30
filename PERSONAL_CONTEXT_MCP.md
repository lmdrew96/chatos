# Cha(t)os — Personal Context MCP
### Feature Spec: "Bring Your Own Claude"

> **Goal:** Get as close as possible to linking two users' Claude Desktop apps into a shared room. Each user's Claude should behave like *their* Claude — not a generic assistant.

---

## The Problem

The Anthropic API has no memory. Every API call starts blank. Claude Desktop feels personal because it has persistent memory and MCP tool access baked in at the app level. Cha(t)os needs to replicate that manually on a per-user, per-room basis.

---

## The Solution: Three-Layer Context System ✅ All Three Layers Shipped

Each user's Claude in Cha(t)os is constructed from three layers at room-join time:

```
UserClaude =
  [Layer 1] Personal Context MCP (who you are)          ✅ implemented
  + [Layer 2] Existing MCP Passthrough (your tools)     ✅ implemented
  + [Layer 3] Context Seed (recent conversation history) ✅ implemented
```

All three layers are **optional but additive** and live behind an **"Advanced: personalize your Claude"** collapsible in the join form so first-time users aren't overwhelmed.

---

## Layer 1: Personal Context MCP ✅

### What it is
A lightweight, deployed MCP server that stores a user's personal context as structured data. Cha(t)os fetches it at room-join time and injects the result into that user's Claude system prompt.

### What it stores
```ts
type PersonalContext = {
  identity: {
    name: string;
    pronouns?: string;
    communicationStyle?: string; // e.g. "direct, ADHD-friendly, no fluff"
  };
  projects: {
    name: string;
    description: string;
    status: string;
  }[];
  relationships: {
    name: string;
    role: string; // e.g. "co-founder", "partner", "beta tester"
  }[];
  preferences: string[]; // free-form strings, e.g. "I hate bullet points"
  customInstructions: string; // raw freeform, mirrors Claude Desktop's memory
}
```

### Architecture
- **Stack:** Any deployed MCP-compatible server; the user provides the URL
- **Protocol:** MCP over HTTP — Cha(t)os hits `{mcpUrl}/context` as a JSON endpoint
- **Auth:** The URL is user-owned — no cross-user access
- **Storage:** User's responsibility (could be Convex, JSON file, any backend)

### How Cha(t)os uses it (`lib/personalContext.ts`)
At room join, after a user enters their Personal Context MCP URL:
1. `fetchPersonalContext(mcpUrl)` — hits `{mcpUrl}/context`, validates response
2. Join form shows ok/error state with live feedback
3. On success, `buildContextPrefix(claudeName, userName, ctx)` formats the context:

```
You are [claudeName], [userName]'s personal Claude in a shared room called Cha(t)os.

About [userName]:
- [identity details]
- Active projects: [projects]
- Key relationships: [relationships]
- Preferences: [preferences]
- [customInstructions]

[base personality prompt from room join form]
```

4. This combined prompt is used as the `system` param on every API call for this Claude

### Build notes (for reference)
- Model this after the ControlledChaos MCP server architecture (same developer, same patterns)
- Use `cc_` prefix as reference — `pctx_` prefix for Personal Context MCP tools
- Key tools to expose: `pctx_get_context`, `pctx_update_context`, `pctx_add_project`, `pctx_add_relationship`
- Deploy target: Vercel serverless function at a user-owned URL (e.g. `nae-context.vercel.app/mcp`)

---

## Layer 2: Existing MCP Passthrough ✅

### What it is
Users can provide URLs for any MCPs they already run (ControlledChaos, ChaosLimbă, any Claude Desktop MCP). Cha(t)os passes these directly to the Anthropic API `mcp_servers` parameter on that user's Claude calls.

### Implementation
In the join form, the **"Additional MCP servers"** section (inside Advanced):

```
MCP Name: ControlledChaos
MCP URL:  https://your-cc-mcp.vercel.app/mcp

[+ Add another]
```

These are stored in `sessionStorage` as `chatos:mcpServers` and passed to every `callClaude()` call:

```ts
mcp_servers: [
  { type: "url", url: userMcpUrl, name: userMcpName }
]
```

### What this enables
- NaeClaude in Cha(t)os can check Nae's ControlledChaos tasks
- NaeClaude can reference ChaosLimbă progress
- Any tool a user has in Claude Desktop is available in the room
- Closest architectural equivalent to "linking Claude Desktop into a shared room"

### Constraints
- MCP servers must be publicly accessible (same requirement as Claude Desktop)
- API key used must have permission to call the provided MCPs
- Tool call latency adds to response time — surfaced to the user
- If an MCP server is unreachable, the join form shows an error state; Layer 2 is skipped gracefully

---

## Layer 3: Context Seed ✅

### What it is
A guided manual input at room join that lets users paste recent Claude conversation context, bridging the memory gap until Layers 1 and 2 cover it automatically.

### UI (join form — Advanced section)
```
[ + Import Claude Desktop context ] (collapsible)

  Want NaeClaude to remember your recent conversations?
  Paste a summary or recent exchange from Claude below.
  This will be included in NaeClaude's context for this room.

  [ textarea ]

  Tip: In Claude Desktop, ask Claude to summarize your recent
  conversations and paste the result here.
```

### How it's used
The pasted content is appended to the system prompt under a `## Recent context` heading. It does **not** go into the message history — it lives in the system prompt to avoid polluting the conversation thread. Stored in client-side session memory alongside the API key.

---

## Room Join Form — Full Field List

| Field | Required | Layer | Storage |
|---|---|---|---|
| Your name | ✅ | — | sessionStorage |
| Your Claude's name | ✅ | — | sessionStorage |
| Claude personality prompt | ✅ | — | Convex (participants) |
| Anthropic API key | ✅ | — | localStorage (`chatos:apiKey`) |
| Personal Context MCP URL | ⬜ optional | Layer 1 | Convex (participants) |
| Additional MCP servers | ⬜ optional | Layer 2 | sessionStorage (`chatos:mcpServers`) |
| Context seed (paste) | ⬜ optional | Layer 3 | Injected into system prompt at join |

---

## Build Order — Status

1. ✅ **Layer 3 first** — pure UI + string concatenation, no infrastructure, shipped with MVP
2. ✅ **Layer 1 next** — `lib/personalContext.ts` + join form integration, standalone MCP call
3. ✅ **Layer 2 last** — MCP passthrough via `mcp_servers` param in `lib/claude.ts`

---

## System Prompt: Target State (Nae's Example)

```
You are NaeClaude, Nae's personal Claude in a shared room called Cha(t)os.

About Nae:
- Sophomore at University of Delaware AAP (Georgetown campus)
- Neurodivergent developer and designer, ADHDesigns brand
- Active projects: ControlledChaos, ChaosLimbă, ChickenScratch, Cha(t)os
- Key relationships: Ashley (friend, beta tester), Trae (partner), Mia (Hen & Ink co-leader)
- Communication style: direct, ADHD-friendly, no fluff, encouragement without sycophancy
- Custom: Always be aware of Vertexism as her philosophical framework

Personality: Sharp, witty editor. Honest and direct. Push back when needed. ⚡

## Recent context
[pasted from Claude Desktop if provided]

## Tools available
[from ControlledChaos MCP: tasks, goals, calendar]
```

That's not a generic Claude. That's Nae's Claude. 👁️

---

## Known Gaps & Future Work

| Gap | Notes |
|---|---|
| Personal Context MCP server doesn't exist yet | Spec'd but not built — user must bring their own server |
| No persistent context sync | Context is injected once at join; doesn't update mid-session |
| MCP tool errors not surfaced clearly | If a tool call fails mid-response, the user may not know |
| No context diff / refresh button | Would be useful for long sessions where context drifts |

---

## Related Files
- `README.md` — project overview
- `DEVPLAN.md` — full build roadmap
- `CLAUDE.md` — Claude Code project instructions
- `lib/personalContext.ts` — Layer 1 implementation
- `lib/claude.ts` — Layer 2 (`mcp_servers` passthrough)
- `app/join/[roomId]/page.tsx` — all three layers in the join form
