import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/** Fetch recent commits from GitHub and store new ones. */
export const syncFromGitHub = internalAction({
  args: {},
  handler: async (ctx) => {
    const owner = process.env.GITHUB_REPO_OWNER ?? "lmdrew96";
    const repo = process.env.GITHUB_REPO_NAME ?? "chatos";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Paginate through all commits (GitHub returns up to 100 per page)
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`GitHub API error: ${res.status} ${res.statusText}`);
        return;
      }

      const commits: Array<{
        sha: string;
        commit: {
          message: string;
          author: { name: string; date: string };
        };
      }> = await res.json();

      if (commits.length === 0) break;

      for (const c of commits) {
        await ctx.runMutation(internal.changelog.upsertCommit, {
          sha: c.sha,
          message: c.commit.message.split("\n")[0],
          author: c.commit.author.name,
          committedAt: new Date(c.commit.author.date).getTime(),
        });
      }

      hasMore = commits.length === 100;
      page++;
    }
  },
});

/** Insert a commit if it doesn't already exist. */
export const upsertCommit = internalMutation({
  args: {
    sha: v.string(),
    message: v.string(),
    author: v.string(),
    committedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("changelog")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .unique();
    if (!existing) {
      await ctx.db.insert("changelog", args);
    }
  },
});

/** Get the most recent changelog entries. */
export const getEntries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("changelog")
      .withIndex("by_committed_at")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/** Get the count of unseen changelog entries for the current user. */
export const getUnseenCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const seen = await ctx.db
      .query("changelogSeen")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!seen) {
      // User has never opened changelog — count all entries
      const entries = await ctx.db.query("changelog").take(100);
      return entries.length;
    }

    // Count entries committed after the user's last-seen timestamp
    let count = 0;
    for await (const entry of ctx.db
      .query("changelog")
      .withIndex("by_committed_at", (q) => q.gt("committedAt", seen.lastSeenAt))) {
      count++;
    }
    return count;
  },
});

/** Mark all changelog entries as seen. */
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const existing = await ctx.db
      .query("changelogSeen")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
    } else {
      await ctx.db.insert("changelogSeen", {
        tokenIdentifier: identity.tokenIdentifier,
        lastSeenAt: now,
      });
    }
  },
});
