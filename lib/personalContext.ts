export type PersonalContext = {
  identity: {
    name: string;
    pronouns?: string;
    communicationStyle?: string;
  };
  projects: {
    name: string;
    description: string;
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
  const res = await fetch(`/api/personal-context?url=${encodeURIComponent(normalized)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Personal Context MCP returned ${res.status}`);
  return res.json();
}

function normalizeContextUrl(input: string): string {
  const url = new URL(input.trim());
  const path = url.pathname.replace(/\/+$/, "");

  if (/\/mcp$/i.test(path)) {
    url.pathname = path.replace(/\/mcp$/i, "/context");
  } else if (!/\/context$/i.test(path)) {
    url.pathname = `${path}/context`;
  }

  return url.toString();
}

export function normalizeMcpServerUrl(input: string): string {
  const url = new URL(input.trim());
  const path = url.pathname.replace(/\/+$/, "");

  if (/\/context$/i.test(path)) {
    url.pathname = path.replace(/\/context$/i, "/mcp");
  } else if (!/\/mcp$/i.test(path)) {
    url.pathname = `${path}/mcp`;
  }

  return url.toString();
}

/**
 * Builds the system prompt prefix from fetched personal context.
 */
export function buildContextPrefix(
  claudeName: string,
  userName: string,
  ctx: PersonalContext
): string {
  const lines: string[] = [
    `You are ${claudeName}, ${userName}'s personal Claude in a shared room called Cha(t)os.`,
    "",
    `About ${userName}:`,
  ];

  if (ctx.identity.communicationStyle) {
    lines.push(`- Communication style: ${ctx.identity.communicationStyle}`);
  }
  if (ctx.identity.pronouns) {
    lines.push(`- Pronouns: ${ctx.identity.pronouns}`);
  }

  if (ctx.projects.length > 0) {
    const projectList = ctx.projects
      .map((p) => `${p.name} (${p.status})`)
      .join(", ");
    lines.push(`- Active projects: ${projectList}`);
  }

  if (ctx.relationships.length > 0) {
    const relList = ctx.relationships
      .map((r) => `${r.name} (${r.role})`)
      .join(", ");
    lines.push(`- Key relationships: ${relList}`);
  }

  if (ctx.preferences.length > 0) {
    ctx.preferences.forEach((p) => lines.push(`- ${p}`));
  }

  if (ctx.customInstructions) {
    lines.push(`- ${ctx.customInstructions}`);
  }

  lines.push(
    "",
    `You have MCP tools to update ${userName}'s personal context (e.g. pctx_update_context, pctx_add_project, pctx_add_relationship). Use them proactively when ${userName} shares new information about themselves, their projects, or relationships — without being asked.`
  );

  return lines.join("\n");
}
