export type PersonalContext = {
  identity: {
    name: string;
    pronouns?: string;
    communicationStyle?: string;
  };
  projects: {
    name: string;
    summary: string;
    status: string;
  }[];
  relationships: {
    name: string;
    role: string;
  }[];
  preferences: string[];
  customInstructions: string;
};

/**
 * Fetches personal context from a deployed Personal Context MCP server.
 * The server must expose GET /context returning PersonalContext JSON.
 */
export async function fetchPersonalContext(mcpUrl: string): Promise<PersonalContext> {
  const normalized = normalizeContextUrl(mcpUrl);
  const withDepth = new URL(normalized);
  withDepth.searchParams.set("depth", "summary");
  const res = await fetch(`/api/personal-context?url=${encodeURIComponent(withDepth.toString())}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Personal Context MCP returned ${res.status}`);
  return res.json();
}

function normalizeContextUrl(input: string): string {
  const url = new URL(input.trim());
  const path = url.pathname.replace(/\/+$/, "");

  // If the path ends in /mcp, swap it for /context (Layer 1 data)
  if (/\/mcp$/i.test(path)) {
    url.pathname = path.replace(/\/mcp$/i, "/context");
  } else if (!path || path === "/") {
    // If it's a base domain, default to /context for data fetch
    url.pathname = "/context";
  }
  // Otherwise, leave the path as-is (e.g. if the user provided /v1/context)
  return url.toString();
}

export function normalizeMcpServerUrl(input: string): string {
  const url = new URL(input.trim());
  const path = url.pathname.replace(/\/+$/, "");

  // If the path ends in /context, swap it for /mcp (Layer 2 tools)
  if (/\/context$/i.test(path)) {
    url.pathname = path.replace(/\/context$/i, "/mcp");
  } else if (!path || path === "/") {
    // Only force /mcp for base domains; otherwise trust the user's path (e.g. /sse)
    url.pathname = "/mcp";
  }

  return url.toString();
}

const PCTX_MAX_CHARS = 500;
const PCTX_MAX_LIST_ITEMS = 3;

/**
 * Builds the system prompt prefix from fetched personal context.
 * Keeps output compact — caps lists and total length to reduce token overhead.
 */
export function buildContextPrefix(
  claudeName: string,
  userName: string,
  ctx: PersonalContext
): string {
  const lines: string[] = [
    `You are ${claudeName}, ${userName}'s Claude in Cha(t)os.`,
    `About ${userName}:`,
  ];

  if (ctx.identity.pronouns) lines.push(`- Pronouns: ${ctx.identity.pronouns}`);
  if (ctx.identity.communicationStyle) lines.push(`- Style: ${ctx.identity.communicationStyle}`);

  if (ctx.projects.length > 0) {
    const shown = ctx.projects.slice(0, PCTX_MAX_LIST_ITEMS);
    const list = shown.map((p) => `${p.name} (${p.status})`).join(", ");
    const extra = ctx.projects.length - shown.length;
    lines.push(`- Projects: ${list}${extra > 0 ? ` (+${extra} more)` : ""}`);
  }

  if (ctx.relationships.length > 0) {
    const shown = ctx.relationships.slice(0, PCTX_MAX_LIST_ITEMS);
    const list = shown.map((r) => `${r.name} (${r.role})`).join(", ");
    const extra = ctx.relationships.length - shown.length;
    lines.push(`- Relationships: ${list}${extra > 0 ? ` (+${extra} more)` : ""}`);
  }

  if (ctx.preferences.length > 0) {
    const shown = ctx.preferences.slice(0, PCTX_MAX_LIST_ITEMS);
    shown.forEach((p) => lines.push(`- ${p}`));
    if (ctx.preferences.length > PCTX_MAX_LIST_ITEMS) {
      lines.push(`- (+${ctx.preferences.length - PCTX_MAX_LIST_ITEMS} more prefs)`);
    }
  }

  if (ctx.customInstructions) lines.push(`- ${ctx.customInstructions}`);

  lines.push(`Use pctx MCP tools proactively when ${userName} shares new info.`);

  let result = lines.join("\n");
  if (result.length > PCTX_MAX_CHARS) {
    result = result.slice(0, PCTX_MAX_CHARS - 20) + "\n…[context truncated]";
  }
  return result;
}
