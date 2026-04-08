import { NextRequest, NextResponse } from "next/server";

const KLIPY_API_KEY = process.env.KLIPY_API_KEY;
const KLIPY_BASE = "https://api.klipy.com/api/v1";

export async function GET(req: NextRequest) {
  if (!KLIPY_API_KEY) {
    return NextResponse.json({ error: "KLIPY API key not configured" }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const perPage = searchParams.get("limit") ?? "20";
  const page = searchParams.get("page") ?? "1";

  const endpoint = q ? "search" : "trending";
  const params = new URLSearchParams({
    per_page: perPage,
    page,
    customer_id: "chatos",
    content_filter: "medium",
    ...(q ? { q } : {}),
  });

  const res = await fetch(`${KLIPY_BASE}/${KLIPY_API_KEY}/gifs/${endpoint}?${params}`);
  const data = await res.json();

  if (!res.ok || data.result === false) {
    return NextResponse.json(
      { error: data.message ?? "KLIPY error" },
      { status: res.ok ? 400 : res.status },
    );
  }

  const items = data.data?.data ?? [];
  const results = items.map((r: any) => ({
    id: String(r.id),
    description: r.title ?? "",
    gif: r.files?.gif?.md?.url ?? r.files?.gif?.sm?.url ?? "",
    tinygif: r.files?.gif?.xs?.url ?? r.files?.gif?.sm?.url ?? "",
  }));

  return NextResponse.json({
    results,
    next: data.data?.has_next ? String(Number(page) + 1) : "",
  });
}
