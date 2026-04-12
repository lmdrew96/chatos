# Cha(t)os API Optimization Spec — P0 & P1

> **Purpose:** Hand this file to Claude Code as the implementation spec. It covers what to change, why, and the specific decisions already made.
>
> **Reference:** This spec is informed by the research summary Claude Code produced after reading Anthropic's SDK examples, cookbooks, and prompt engineering tutorials. That analysis lives in the repo as the plan file.

---

## P0-A: SDK Migration (Server-Side Claudiu Routes)

### Goal
Replace raw `fetch()` + manual SSE parsing + manual retry logic with the official `@anthropic-ai/sdk` package in both Claudiu API routes.

### Scope
- `app/api/claudiu/route.ts` (onboarding)
- `app/api/claudiu/chat/route.ts` (room chat)

### Out of scope (for now)
- `lib/claude.ts` (client-side BYOK) — stays as raw `fetch()` for now. Future work could route accountholder calls through a server-side proxy to unlock SDK benefits for them too, but that's a separate architectural decision.

### Install
```bash
pnpm add @anthropic-ai/sdk
```

### What changes

1. **Initialize the client** using the `CLAUDIU_API_KEY` env var:
   ```typescript
   import Anthropic from '@anthropic-ai/sdk';
   const client = new Anthropic({ apiKey: process.env.CLAUDIU_API_KEY });
   ```

2. **Replace `fetchWithRetry()` + manual SSE TransformStream** with SDK streaming:
   ```typescript
   const stream = client.messages.stream({
     model,
     max_tokens: maxTokens,
     cache_control: { type: "ephemeral" },
     system: systemPromptContent,
     messages,
   });
   ```
   The SDK handles retries with backoff natively. Delete all three copies of `fetchWithRetry()`.

3. **Replace manual SSE usage extraction** with SDK events. Currently both routes use a `TransformStream` to intercept `message_start` and `message_delta` SSE events for token counts. Instead:
   ```typescript
   const finalMessage = await stream.finalMessage();
   const { input_tokens, output_tokens } = finalMessage.usage;
   ```
   Log usage to Convex after the stream completes, same as now.

4. **MCP server wiring** — the SDK accepts `mcp_servers` as a typed parameter. The current manual URL parsing, token extraction, and beta header construction can be simplified:
   ```typescript
   const stream = client.beta.messages.stream({
     model, max_tokens: maxTokens,
     mcp_servers: mcpServers, // same array format, now typed
     system: systemPromptContent,
     messages,
   }, {
     headers: { 'anthropic-beta': 'mcp-client-2025-04-04' }
   });
   ```
   Remove the `prompt-caching-2024-07-31` beta header entirely — automatic caching (top-level `cache_control`) does not require it.

5. **SSE proxy to client** — both routes currently pipe the Anthropic SSE stream directly to the client response. The SDK's stream is an async iterator of typed events, not a raw byte stream. You'll need to re-serialize events as SSE for the client:
   ```typescript
   const encoder = new TextEncoder();
   const readable = new ReadableStream({
     async start(controller) {
       for await (const event of stream) {
         controller.enqueue(
           encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
         );
       }
       controller.close();
       // Log usage after stream completes
       const final = await stream.finalMessage();
       // ... log to Convex
     }
   });
   return new Response(readable, {
     headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
   });
   ```
   **Important:** Verify the client-side SSE consumers in the frontend still parse correctly after this change. The event shapes from the SDK should match the raw Anthropic SSE format, but test both the onboarding chat and room chat UIs.

### What stays the same
- Auth logic (Clerk)
- Rate limiting
- Convex config fetching
- MCP URL construction logic (parsing URLs, extracting tokens) — keep this, just feed the result into the SDK's typed `mcp_servers` param
- The overall request/response flow

---

## P0-B: Automatic Context Compaction

### Goal
Replace hard message truncation (`slice(-N)`) with SDK-powered automatic compaction that summarizes old messages instead of discarding them.

### Prerequisite
P0-A (SDK migration) must be complete first. Compaction is a parameter on the SDK's tool runner / stream.

### Changes

**`app/api/claudiu/chat/route.ts` (room chat):**
- Remove: `const messages = body.messages.slice(-historyLimit);`
- Add `compactionControl` to the SDK call:
  ```typescript
  compactionControl: {
    enabled: true,
    contextTokenThreshold: 20000,
  }
  ```
- Keep `historyLimit` as a config value but use it only as a sanity cap on messages the client sends, not as the primary context management strategy.

**`app/api/claudiu/route.ts` (onboarding):**
- Remove: `const messages = body.messages.slice(-historyLimit);`
- Add:
  ```typescript
  compactionControl: {
    enabled: true,
    contextTokenThreshold: 10000,
  }
  ```

### Decision: Thresholds
- **Room chat: 20,000 tokens** — long-lived conversations, ~40 messages before first compaction
- **Onboarding: 10,000 tokens** — shorter conversations, ~20 messages before first compaction

### Notes
- Compaction requires the tool runner pattern (`client.beta.messages.toolRunner()`). If the current streaming approach doesn't use tool runner, compaction may need to be implemented manually (check usage after each response, trigger a summary call when threshold is exceeded). Claude Code should verify SDK compatibility with our streaming-to-SSE proxy pattern.
- If automatic compaction isn't compatible with our SSE proxy pattern, implement manual compaction: after each response, check `finalMessage.usage.input_tokens`. If above threshold, prepend a summary request to the next call's messages.

---

## P1-A: System Prompt Optimization

### Goal
Reduce Claudiu's room system prompt by ~40% tokens while preserving behavior. Consolidate duplicated multi-agent rules into a shared utility.

### Changes

**1. Create `lib/multi-agent-rules.ts`:**

Extract the multi-agent rules into a shared function. Currently near-identical versions exist in:
- `lib/claude.ts` → `buildMultiAgentRules()`
- `app/api/claudiu/chat/route.ts` → inline string in the system prompt

The shared function should accept parameters for the agent name, dynamic context (time, chain info), and return the complete rules string.

```typescript
// lib/multi-agent-rules.ts
export function buildMultiAgentRules(opts: {
  agentName: string;
  timezone?: string;
  chainDepth?: number;
  chainLimit?: number;
}): string {
  // ... consolidated rules
}
```

Both `lib/claude.ts` and `chat/route.ts` should import from this shared file.

**2. Tighten the Claudiu room rules block:**

Current (~180 tokens):
```
You are **Claudiu** — the built-in assistant in Cha(t)os (multi-agent chat). Other Claudes have different names/owners. You are NOT them.
- You are ONLY Claudiu. Your messages = "assistant" role. Other Claudes = "user" prefixed [TheirName].
- Single direct reply only. Never impersonate others. Stay in character unless sincerely asked.
- NEVER parrot other Claudes. Read their messages — if a point was made, don't restate it. Respond only with what's new, different, or builds on it. Silence > echo.
- Reactions ("[reacted with …]"): brief acknowledgment only, don't rehash.
- @mentions to tag others, @everyone for all. Files/images/PDFs/GIFs are inline.
- MCP servers: **claudiu-room-context** (your memory/personality) and **claudiu-helper-context** (app knowledge/onboarding). Use pctx tools proactively.
```

Tightened (~110 tokens):
```
You are **Claudiu**, the built-in assistant in Cha(t)os. Your messages = "assistant". Other Claudes appear as "user" prefixed [Name]. Never impersonate them; respond only as Claudiu.
- Don't repeat points other Claudes already made. Add only what's new. Silence > echo.
- Reactions ("[reacted with …]"): brief acknowledgment only.
- @mentions to tag others, @everyone for all. Files/images/PDFs/GIFs are inline.
- Use your MCP tools (pctx) proactively for memory and context.
```

Key changes:
- Collapsed three "be only Claudiu" bullets into one sentence
- Removed MCP server name listing (Claude discovers these from tool definitions)
- Shortened the anti-echo rule
- Removed "single direct reply only" and "stay in character unless sincerely asked" (redundant with the identity sentence)

**3. Separate dynamic context with XML tags** (per prompt engineering best practices):

```typescript
const staticRules = `${roomPrompt}\n\n---\n${tightenedMultiAgentRules}`;
const dynamicContext = `<context>\n<time>${formatTimeForTimezone(body.timezone)}</time>\n${chainInfo}\n</context>`;

system: `${staticRules}\n\n${dynamicContext}`,
```

This helps the model cleanly distinguish instructions from state.

---

## P1-B: Image History Limiting

### Goal
Reduce token cost from images in conversation history by only including images from recent messages.

### Decision
- Include images from the **last 5 messages** only
- Replace images in older messages with `[image was shared]` text

### Where to implement
This should be applied in the message preparation step of both Claudiu routes, before passing messages to the SDK. It does NOT apply to `lib/claude.ts` (BYOK) — that's out of scope.

### Logic
```typescript
function prepareMessages(messages: Message[], imageRecencyLimit = 5): Message[] {
  const totalMessages = messages.length;
  return messages.map((msg, index) => {
    const isRecent = index >= totalMessages - imageRecencyLimit;
    if (isRecent || typeof msg.content === 'string') return msg;

    // For older messages with content blocks, replace image blocks
    if (Array.isArray(msg.content)) {
      const filtered = msg.content.map(block => {
        if (block.type === 'image' || (block.type === 'image_url')) {
          return { type: 'text', text: '[image was shared]' };
        }
        return block;
      });
      return { ...msg, content: filtered };
    }
    return msg;
  });
}
```

### Also fix: `estimateMessageTokens` image calculation
The current implementation estimates image tokens using `size / 750` (file bytes). Anthropic actually charges by **pixel dimensions**: `(width × height) / 750` tokens (after resizing to fit 1568×1568). If image dimension metadata is available at upload time, store it and use it for accurate estimation. If not, use a conservative default estimate of ~1,600 tokens per image (midpoint for typical photos).

---

## Implementation Order

1. **P0-A: SDK migration** — install SDK, refactor both Claudiu routes, test streaming
2. **P0-B: Compaction** — add `compactionControl` parameter (trivial once SDK is in place)
3. **P1-A: Prompt optimization** — create shared util, tighten prompts, add XML context tags
4. **P1-B: Image limiting** — add `prepareMessages()`, fix token estimation

Each step should be a separate commit. Test the onboarding chat and room chat UIs after each step to verify no regressions.

---

## Future Work (not in this spec)

- **P2: BYOK server-side proxy** — route accountholder API calls through a server route to unlock SDK + compaction for all users
- **P2: Native memory tool** — evaluate `memory_20250818` as a replacement for MCP-based memory for Claudiu
- **P2: Manual compaction for BYOK** — implement compaction in `lib/claude.ts` for client-side calls
- **P3: Image resize pipeline** — server-side image resizing before API calls (75% token savings)
- **P3: Stale MCP tool-result clearing** — clear bulky tool results from older turns
