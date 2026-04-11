import { auth } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return Response.json({ error: "URL required" }, { status: 400 });
    }

    const res = await fetch(url);
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.startsWith("image/")) {
      const buf = await res.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      return Response.json({
        type: "image",
        mediaType: contentType.split(";")[0].trim(),
        data: base64,
      });
    }

    const text = await res.text();
    return Response.json({
      type: "text",
      content: text.slice(0, 10000),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
