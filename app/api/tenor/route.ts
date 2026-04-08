import { NextRequest, NextResponse } from "next/server";

const TENOR_API_KEY = process.env.TENOR_API_KEY;
const TENOR_BASE = "https://tenor.googleapis.com/v2";

export async function GET(req: NextRequest) {
  if (!TENOR_API_KEY) {
    return NextResponse.json({ error: "Tenor API key not configured" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const limit = searchParams.get("limit") ?? "20";
  const pos = searchParams.get("pos") ?? "";

  const endpoint = q ? "search" : "featured";
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: "chatos",
    limit,
    media_filter: "tinygif,gif",
    ...(q ? { q } : {}),
    ...(pos ? { pos } : {}),
  });

  const res = await fetch(`${TENOR_BASE}/${endpoint}?${params}`);
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: data.error?.message ?? "Tenor error" }, { status: res.status });
  }

  const results = (data.results ?? []).map((r: any) => ({
    id: r.id,
    description: r.content_description ?? "",
    gif: r.media_formats?.gif?.url ?? "",
    tinygif: r.media_formats?.tinygif?.url ?? "",
  }));

  return NextResponse.json({ results, next: data.next ?? "" });
}
