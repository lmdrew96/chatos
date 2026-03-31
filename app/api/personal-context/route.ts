import dns from "node:dns/promises";
import net from "node:net";
import { NextRequest, NextResponse } from "next/server";

// Block private/reserved IP ranges to prevent SSRF.
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 127 ||                                    // loopback
      a === 10 ||                                     // RFC 1918
      a === 0 ||                                      // unspecified
      (a === 172 && b >= 16 && b <= 31) ||            // RFC 1918
      (a === 192 && b === 168) ||                     // RFC 1918
      (a === 169 && b === 254) ||                     // link-local / cloud metadata
      (a === 100 && b >= 64 && b <= 127)              // shared address space
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  return true; // unrecognised format — deny
}

async function isHostSafe(hostname: string): Promise<boolean> {
  try {
    const target = net.isIP(hostname) ? hostname : (await dns.lookup(hostname)).address;
    return !isPrivateIp(target);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url query parameter." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported URL protocol." }, { status: 400 });
  }

  if (!(await isHostSafe(target.hostname))) {
    return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach Personal Context MCP." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Personal Context MCP returned an error." },
      { status: upstream.status },
    );
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: "Personal Context MCP did not return JSON." }, { status: 502 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

