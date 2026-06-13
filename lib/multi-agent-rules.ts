/** Shared multi-agent rules block appended to system prompts.
 *
 *  Splits into two parts for prompt caching:
 *   - `stableRules`: identity + static behavioral rules. Identical across turns for a
 *     given persona, so it belongs in the cached system block (cache_control breakpoint).
 *   - `volatileContext`: the <context> tail (<time> at minute precision + <chain> depth),
 *     which changes every call and must ride AFTER the breakpoint so it never busts the
 *     cached prefix.
 *
 *  Caching callers (the proxy routes) use buildMultiAgentRulesSplit() and place the
 *  breakpoint between the blocks. buildMultiAgentRules() returns the concatenation for
 *  non-caching callers. */

function formatTimeForTimezone(timezone?: string): string {
  try {
    return new Date().toLocaleString("en-US", {
      timeZone: timezone || undefined,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

type MultiAgentRulesOpts = {
  agentName: string;
  /** True for Claudiu (platform bot) — omits fetch_url tool line, adds platform identity */
  isClaudiu?: boolean;
  timezone?: string;
  chainDepth?: number;
  chainLimit?: number;
};

/** Split form: stable rules (cacheable prefix) + volatile <context> tail (not cached). */
export function buildMultiAgentRulesSplit(
  opts: MultiAgentRulesOpts
): { stableRules: string; volatileContext: string } {
  const { agentName, isClaudiu, timezone, chainDepth, chainLimit } = opts;
  if (!agentName) return { stableRules: "", volatileContext: "" };

  let chainInfo = "";
  if (chainDepth !== undefined && chainLimit !== undefined) {
    const rem = chainLimit - chainDepth - 1;
    if (rem <= 0) chainInfo = `\n<chain>LAST TURN (${chainDepth}/${chainLimit}). Do NOT @mention — wrap up.</chain>`;
    else if (rem <= 2) chainInfo = `\n<chain>${chainDepth}/${chainLimit} (${rem} left). Only @mention if essential.</chain>`;
    else chainInfo = `\n<chain>${chainDepth}/${chainLimit} (${rem} left). May @mention others.</chain>`;
  }

  const identity = isClaudiu
    ? `You are **${agentName}**, the built-in assistant in Cha(t)os. Your messages = "assistant". Other Claudes appear as "user" prefixed [Name]. Never impersonate them; respond only as ${agentName}.`
    : `You are **${agentName}** in Cha(t)os (multi-agent chat). Claudiu is the platform bot, not you. Your messages = "assistant". Other Claudes appear as "user" prefixed [Name]. Never impersonate them; respond only as ${agentName}.`;

  const toolLine = isClaudiu
    ? `- Use your MCP tools (pctx) proactively for memory and context.`
    : `- fetch_url tool: fetches any URL (images rendered, text up to 10k chars).\n- Memory is automatic. MCP tools available if configured — only write NEW data when the user explicitly asks to save/remember something. Never re-write existing <memory> data.`;

  const stableRules = `\n\n---
${identity}
- Don't repeat points other Claudes already made. Add only what's new. Silence > echo.
- Reactions ("[reacted with …]"): brief acknowledgment only.
- @mentions to tag others, @everyone for all. Files/images/PDFs/GIFs are inline.
${toolLine}`;

  const volatileContext = `\n\n<context>
<time>${formatTimeForTimezone(timezone)}</time>${chainInfo}
</context>`;

  return { stableRules, volatileContext };
}

/** Concatenated form for non-caching callers (the browser-direct path in lib/claude.ts). */
export function buildMultiAgentRules(opts: MultiAgentRulesOpts): string {
  const { stableRules, volatileContext } = buildMultiAgentRulesSplit(opts);
  return stableRules + volatileContext;
}
