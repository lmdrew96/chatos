import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/sync-changelog",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CHANGELOG_SYNC_SECRET;
    if (secret) {
      const provided = request.headers.get("X-Sync-Secret");
      if (provided !== secret) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    await ctx.runAction(internal.changelog.syncFromGitHub);
    return new Response("OK", { status: 200 });
  }),
});

export default http;
