# Cha(t)os — Personal Context MCP
### Feature Spec: "Bring Your Own Claude"

> **Goal:** Get as close as possible to linking two users' Claude Desktop apps into a shared room. Each user's Claude should behave like *their* Claude — not a generic assistant.

---

## The Problem

The Anthropic API has no memory. Every API call starts blank. Claude Desktop feels personal because it has persistent memory and MCP tool access baked in at the app level. Cha(t)os needs to replicate that manually on a per-user, per-room basis.

---

## The Solution: Three-Layer Context System

Each user's Claude in Cha(t)os is constructed from three layers at room-join time:

```
UserClaude =
  [Layer 1] Personal Context MCP (who you are)
  + [Layer 2] Existing MCP Passthrough (your tools)
  + [Layer 3] Context Seed (recent conversation history)
```

All three layers are **optional but additive** — the more a user provides, the closer their Claude is to their real Claude Desktop experience.

---

## Layer 1: Personal Context MCP

### What it is
A lightweight, deployed MCP server that stores a user's personal context as structured key-value data. Cha(t)os calls it at room-join time and injects the result into that user's Claude system prompt.

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
- **Stack:** Simple Next.js API route deployed on Vercel (or standalone Vercel function)
- **Storage:** Convex (consistent with rest of Cha(t)os stack) or a simple JSON file per user
- **Auth:** User owns their MCP URL — it's their personal endpoint. No cross-user access.
- **Protocol:** MCP over HTTP (SSE transport), compatible with Anthropic API `mcp_servers` param

### How Cha(t)os uses it
At room join, after a user provides their Personal Context MCP URL:
1. Cha(t)os fetches context from the MCP
2. Context is formatted into a system prompt prefix:
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
3. This combined prompt is used as the `system` param on every API call involving this Claude

### Build notes for Claude Code
- Model this closely after the ControlledChaos MCP server architecture (same developer, same patterns)
- Use `cc_` prefix pattern as reference — use `pctx_` prefix for Personal Context MCP tools
- Key tools to expose: `pctx_get_context`, `pctx_update_context`, `pctx_add_project`, `pctx_add_relationship`
- Deploy target: Vercel serverless function at a user-owned URL (e.g. `nae-context.vercel.app/mcp`)

---

## Layer 2: Existing MCP Passthrough

### What it is
Users can provide URLs for any MCPs they already run (e.g. ControlledChaos, ChaosLimbă, any Claude Desktop MCP). Cha(t)os passes these directly to the Anthropic API `mcp_servers` parameter on that user's Claude calls.

### Implementation
In the room join form, add an optional **"Your MCP servers"** section:
```
MCP Name: ControlledChaos
MCP URL:  https://your-cc-mcp.vercel.app/mcp

[+ Add another]
```

These are stored in the user's room session (client-side, never server) and passed as:
```ts
mcp_servers: [
  { type: "url", url: userMcpUrl, name: userMcpName }
]
```
on every API call for that user's Claude.

### What this enables
- NaeClaude in Cha(t)os can check Nae's ControlledChaos tasks
- NaeClaude can reference ChaosLimbă progress
- Any tool a user has in Claude Desktop can theoretically be available in the room
- This is the closest architectural equivalent to "linking Claude Desktop into a shared room"

### Constraints
- MCP servers must be deployed and publicly accessible (same requirement as Claude Desktop)
- API key used must have permission to call the provided MCPs
- Tool call latency adds to response time — surface this to the user

---

## Layer 3: Context Seed

### What it is
A guided manual input flow at room join that lets users paste recent Claude conversation context, bridging the memory gap until Layers 1 and 2 cover it automatically.

### UI flow
After the main room join form, an optional expandable section:

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
The pasted content is appended to the system prompt under a `## Recent context` heading. It does not go into the message history — it lives in the system prompt to avoid polluting the conversation thread.

### Note for Claude Code
This is purely a UI + string concatenation feature. No backend needed. Store in client-side room session alongside API key.

---

## Room Join Form — Updated Field List

With this feature, the room join form gains the following optional fields:

| Field | Required | Layer |
|---|---|---|
| Your name | ✅ | — |
| Your Claude's name | ✅ | — |
| Claude personality prompt | ✅ | — |
| Anthropic API key | ✅ | — |
| Personal Context MCP URL | ⬜ optional | Layer 1 |
| Additional MCP servers | ⬜ optional | Layer 2 |
| Context seed (paste) | ⬜ optional | Layer 3 |

**UX recommendation:** Keep optional fields collapsed by default under an **"Advanced: personalize your Claude"** section. Don't overwhelm first-time users.

---

## Build Order

1. **Layer 3 first** — pure UI, no infrastructure, immediate value. Ship with MVP.
2. **Layer 1 next** — Personal Context MCP is a standalone Vercel deploy, self-contained. ~1 day.
3. **Layer 2 last** — MCP passthrough requires the most testing (latency, auth, error handling).

---

## Example: Nae's Full System Prompt (Target State)

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

## Related Files
- `README.md` — project overview
- `DEVELOPMENT_PLAN.md` — full build roadmap
- `CLAUDE.md` — Claude Code project instructions
