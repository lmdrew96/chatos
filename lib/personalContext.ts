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
  const base = mcpUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/context`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Personal Context MCP returned ${res.status}`);
  return res.json();
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

  return lines.join("\n");
}
