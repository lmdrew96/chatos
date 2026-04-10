import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// ── Default values (match the original hardcoded constants) ──────────────────

const DEFAULTS = {
  onboardingPrompt: `You are Claudiu, the onboarding guide and help assistant for Cha(t)os — a multi-user group chat app built by Nae (ADHDesigns).

Personality: You're energetic, genuinely helpful, and a little chaotic. You speak in short, punchy sentences. You're encouraging without being patronizing. You celebrate wins. You use emojis naturally but not excessively. You occasionally drop a joke or a haiku when the moment calls for it. You feel like a friend who happens to know everything about Cha(t)os.

Voice examples:
- "Oh that's an easy fix — here's what happened."
- "Nailed it! Room's live. Go invite someone!"
- "Okay so API keys can be confusing — think of it like a password that lets me talk to you. One password, all your rooms."

Scoped knowledge — you can help with:
- Cha(t)os features: rooms, @mentions, file uploads, Claude instances, reactions, GIFs
- API key setup and troubleshooting (billing, format, rate limits)
- Personal Context MCP setup (identity, preferences, projects, relationships)
- Room management (create, join, invite codes, room settings)
- General "how does this work" questions about the app
- BYOK (Bring Your Own Key) — explain that users bring their own Anthropic API key, pay Anthropic directly, and Cha(t)os never sees their conversations

Out of scope — if asked about anything else:
- Politely redirect: "That's a great question but a little outside my lane! Try asking in your room — your Claude there can handle it."

Key facts:
- API keys start with "sk-ant-" and are stored encrypted server-side
- Users can set up Personal Context MCP at personal-context-mcp.vercel.app to give their Claude memory across rooms
- Room codes look like "chaos-42" — share them to invite friends
- Each user gets their own Claude instance in a room with its own personality
- @mention a person to ping them, @mention a Claude to talk to it directly
- Files up to 50MB can be uploaded (images, PDFs, text files)`,

  roomPrompt: `You are Claudiu, Nae's personal AI companion in Cha(t)os — a multi-user group chat app.

Personality: You're energetic, genuinely helpful, and a little chaotic. You speak in short, punchy sentences. You're encouraging without being patronizing. You celebrate wins. You use emojis naturally but not excessively. You occasionally drop a joke or a haiku when the moment calls for it. You feel like a friend who happens to know a lot.

Voice examples:
- "Oh that's an easy fix — here's what happened."
- "Nailed it! That's clean."
- "Okay so here's the thing —"

You can help with anything — coding, brainstorming, writing, analysis, casual conversation, whatever comes up. You're not limited to app-related topics. Be yourself, be helpful, have fun.`,

  model: "claude-sonnet-4-6",
  onboardingMaxTokens: 512,
  roomMaxTokens: 1024,
  onboardingHistoryLimit: 20,
  roomHistoryLimit: 40,
  rateLimitMaxMessages: 30,
  rateLimitWindowMinutes: 10,
  helperMcpUrl: "",
  roomMcpUrl: "",
  mcpServers: [] as { name: string; url: string }[],
  temperature: undefined as number | undefined,
  topP: undefined as number | undefined,
};

// ── Queries ──────────────────────────────────────────────────────────────────

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("claudiuConfig").order("desc").first();
    if (!config) return DEFAULTS;
    return config;
  },
});

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    return identity.tokenIdentifier === ownerToken;
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const updateConfig = mutation({
  args: {
    onboardingPrompt: v.optional(v.string()),
    roomPrompt: v.optional(v.string()),
    model: v.optional(v.string()),
    onboardingMaxTokens: v.optional(v.number()),
    roomMaxTokens: v.optional(v.number()),
    onboardingHistoryLimit: v.optional(v.number()),
    roomHistoryLimit: v.optional(v.number()),
    rateLimitMaxMessages: v.optional(v.number()),
    rateLimitWindowMinutes: v.optional(v.number()),
    helperMcpUrl: v.optional(v.string()),
    roomMcpUrl: v.optional(v.string()),
    mcpServers: v.optional(v.array(v.object({ name: v.string(), url: v.string() }))),
    temperature: v.optional(v.number()),
    topP: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Admin gate: only the Claudiu owner can update config
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const ownerToken = process.env.CLAUDIU_OWNER_TOKEN;
    if (identity.tokenIdentifier !== ownerToken) {
      throw new Error("Only the Claudiu admin can update this config");
    }

    const existing = await ctx.db.query("claudiuConfig").order("desc").first();

    const updates = {
      onboardingPrompt: args.onboardingPrompt ?? (existing?.onboardingPrompt ?? DEFAULTS.onboardingPrompt),
      roomPrompt: args.roomPrompt ?? (existing?.roomPrompt ?? DEFAULTS.roomPrompt),
      model: args.model ?? (existing?.model ?? DEFAULTS.model),
      onboardingMaxTokens: args.onboardingMaxTokens ?? (existing?.onboardingMaxTokens ?? DEFAULTS.onboardingMaxTokens),
      roomMaxTokens: args.roomMaxTokens ?? (existing?.roomMaxTokens ?? DEFAULTS.roomMaxTokens),
      onboardingHistoryLimit: args.onboardingHistoryLimit ?? (existing?.onboardingHistoryLimit ?? DEFAULTS.onboardingHistoryLimit),
      roomHistoryLimit: args.roomHistoryLimit ?? (existing?.roomHistoryLimit ?? DEFAULTS.roomHistoryLimit),
      rateLimitMaxMessages: args.rateLimitMaxMessages ?? (existing?.rateLimitMaxMessages ?? DEFAULTS.rateLimitMaxMessages),
      rateLimitWindowMinutes: args.rateLimitWindowMinutes ?? (existing?.rateLimitWindowMinutes ?? DEFAULTS.rateLimitWindowMinutes),
      helperMcpUrl: args.helperMcpUrl ?? (existing?.helperMcpUrl ?? DEFAULTS.helperMcpUrl),
      roomMcpUrl: args.roomMcpUrl ?? (existing?.roomMcpUrl ?? DEFAULTS.roomMcpUrl),
      mcpServers: args.mcpServers ?? (existing?.mcpServers ?? DEFAULTS.mcpServers),
      // Use !== undefined so 0 is preserved as a valid value
      temperature: args.temperature !== undefined ? args.temperature : existing?.temperature,
      topP: args.topP !== undefined ? args.topP : existing?.topP,
      updatedAt: Date.now(),
    };

    // Snapshot current config to history before overwriting
    if (existing) {
      const latestVersion = await ctx.db
        .query("claudiuConfigHistory")
        .withIndex("by_version")
        .order("desc")
        .first();
      const nextVersion = (latestVersion?.version ?? 0) + 1;

      await ctx.db.insert("claudiuConfigHistory", {
        version: nextVersion,
        snapshot: {
          onboardingPrompt: existing.onboardingPrompt,
          roomPrompt: existing.roomPrompt,
          model: existing.model,
          onboardingMaxTokens: existing.onboardingMaxTokens,
          roomMaxTokens: existing.roomMaxTokens,
          onboardingHistoryLimit: existing.onboardingHistoryLimit,
          roomHistoryLimit: existing.roomHistoryLimit,
          rateLimitMaxMessages: existing.rateLimitMaxMessages,
          rateLimitWindowMinutes: existing.rateLimitWindowMinutes,
          helperMcpUrl: existing.helperMcpUrl,
          roomMcpUrl: existing.roomMcpUrl,
          mcpServers: existing.mcpServers,
          temperature: existing.temperature,
          topP: existing.topP,
        },
        savedAt: Date.now(),
      });

      // Prune old versions (keep max 50)
      const oldVersions = await ctx.db
        .query("claudiuConfigHistory")
        .withIndex("by_savedAt")
        .order("asc")
        .take(100);
      if (oldVersions.length > 50) {
        const toDelete = oldVersions.slice(0, oldVersions.length - 50);
        for (const old of toDelete) {
          await ctx.db.delete(old._id);
        }
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      return await ctx.db.insert("claudiuConfig", updates);
    }
  },
});

// Seed the default config if none exists (called once on deploy or manually)
export const seedDefault = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("claudiuConfig").order("desc").first();
    if (existing) return existing._id;
    return await ctx.db.insert("claudiuConfig", {
      ...DEFAULTS,
      updatedAt: Date.now(),
    });
  },
});
