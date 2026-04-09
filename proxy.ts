import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Only run on API routes that call auth()
    "/api/(.*)",
  ],
};
