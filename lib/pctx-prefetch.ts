import type { PersonalContext } from "./personalContext";

/** Normalize an MCP URL to a /context data-fetch URL (server-side variant). */
function normalizeToContextUrl(input: string): string {
  const url = new URL(input.trim());
  const path = url.pathname.replace(/\/+$/, "");

  if (/\/mcp$/i.test(path)) {
    url.pathname = path.replace(/\/mcp$/i, "/context");
  } else if (/\/sse$/i.test(path)) {
    url.pathname = path.replace(/\/sse$/i, "/context");
  } else if (!path || path === "/") {
    url.pathname = "/context";
  }
  return url.toString();
}

/** Format pre-fetched PCTX context as a compact memory block for the system prompt. */
function formatMemoryBlock(ctx: PersonalContext): string {
  const parts: string[] = [];

  if (ctx.identity) {
    const id = ctx.identity.name || "";
    const pronouns = ctx.identity.pronouns ? ` (${ctx.identity.pronouns})` : "";
    if (id) parts.push(`Identity: ${id}${pronouns}`);
    if (ctx.identity.communicationStyle) parts.push(`Style: ${ctx.identity.communicationStyle}`);
  }

  if (ctx.projects?.length) {
    const active = ctx.projects
      .filter((p) => p.status?.toLowerCase().includes("active"))
      .slice(0, 5);
    const other = ctx.projects
      .filter((p) => !p.status?.toLowerCase().includes("active"))
      .slice(0, 3);
    const shown = [...active, ...other];
    if (shown.length) {
      parts.push(`Projects: ${shown.map((p) => `${p.name} (${p.status})`).join("; ")}`);
    }
  }

  if (ctx.relationships?.length) {
    parts.push(`Key people: ${ctx.relationships.slice(0, 5).map((r) => `${r.name} (${r.role})`).join(", ")}`);
  }

  if (ctx.preferences?.length) {
    parts.push(`Preferences: ${ctx.preferences.slice(0, 5).join("; ")}`);
  }

  if (ctx.customInstructions) {
    parts.push(`Instructions: ${ctx.customInstructions}`);
  }

  if (parts.length === 0) return "";
  return `<memory>\n${parts.join("\n")}\n</memory>`;
}

const PREFETCH_TIMEOUT_MS = 2000;

/**
 * Pre-fetch PCTX context from an MCP server URL (server-side direct fetch).
 * Returns a formatted memory block string for injection into the system prompt,
 * or null if the fetch fails or the endpoint is unavailable.
 */
export async function prefetchPctxContext(mcpUrl: string): Promise<string | null> {
  try {
    const contextUrl = normalizeToContextUrl(mcpUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);

    try {
      const res = await fetch(contextUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const ctx: PersonalContext = await res.json();
      const block = formatMemoryBlock(ctx);
      return block || null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Network error, timeout, invalid URL — proceed without memory
    return null;
  }
}

/** Known PCTX MCP server names used in Cha(t)os. */
const PCTX_SERVER_NAMES = [
  "personalcontext",
  "personal-context",
  "claudiu-room-context",
  "claudiu-helper-context",
];

/** Check if an MCP server name looks like a PCTX server. */
export function isPctxServer(name: string): boolean {
  return PCTX_SERVER_NAMES.includes(name.toLowerCase()) || /context/i.test(name);
}
